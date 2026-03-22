import { Injectable, Logger } from '@nestjs/common';
import { MoveResponseDto, MoveMetadataDto } from '../dto/move-response.dto';
import { TileGroupDto } from '../dto/move-request.dto';

export interface RawLlmResponse {
  content: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

export interface ParseResult {
  success: boolean;
  response?: MoveResponseDto;
  errorReason?: string;
}

/**
 * LLM 원시 텍스트 응답을 MoveResponseDto로 파싱하는 서비스.
 *
 * LLM 응답은 절대 신뢰하지 않는다 — 모든 파싱은 try-catch로 보호되며,
 * 파싱 실패 시 명확한 에러 메시지를 반환한다.
 */
@Injectable()
export class ResponseParserService {
  private readonly logger = new Logger(ResponseParserService.name);

  /**
   * LLM 응답 텍스트를 파싱하여 MoveResponseDto로 변환한다.
   * JSON 추출 → 구조 검증 → 타일 코드 검증 순서로 진행한다.
   */
  parse(
    rawResponse: RawLlmResponse,
    metadata: Omit<
      MoveMetadataDto,
      'latencyMs' | 'promptTokens' | 'completionTokens' | 'retryCount'
    >,
    retryCount: number,
  ): ParseResult {
    const fullMetadata: MoveMetadataDto = {
      ...metadata,
      latencyMs: rawResponse.latencyMs,
      promptTokens: rawResponse.promptTokens,
      completionTokens: rawResponse.completionTokens,
      retryCount,
      isFallbackDraw: false,
    };

    // 1단계: JSON 추출
    let parsed: unknown;
    try {
      parsed = this.extractJson(rawResponse.content);
    } catch (err) {
      const errorReason = `JSON 파싱 실패: ${(err as Error).message}`;
      this.logger.warn(
        `[ResponseParser] ${errorReason} | raw: ${rawResponse.content.slice(0, 200)}`,
      );
      return { success: false, errorReason };
    }

    // 2단계: 구조 검증
    const structureError = this.validateStructure(parsed);
    if (structureError) {
      this.logger.warn(`[ResponseParser] 구조 검증 실패: ${structureError}`);
      return { success: false, errorReason: structureError };
    }

    const obj = parsed as Record<string, unknown>;

    // 3단계: action 분기 처리
    if (obj.action === 'draw') {
      return {
        success: true,
        response: {
          action: 'draw',
          reasoning: this.safeString(obj.reasoning),
          metadata: fullMetadata,
        },
      };
    }

    // action === 'place' 처리
    const tileGroupsRaw = obj.tableGroups as
      | Array<{ tiles: string[] }>
      | undefined;
    const tilesFromRack = obj.tilesFromRack as string[] | undefined;

    // 타일 그룹 유효성 검증
    // 소형 LLM(4B급)이 "place"를 선택하면서 빈 tiles를 반환하는 경우를 draw로 변환한다.
    if (
      !tileGroupsRaw ||
      !Array.isArray(tileGroupsRaw) ||
      tileGroupsRaw.length === 0
    ) {
      this.logger.warn(
        '[ResponseParser] action=place이지만 tableGroups가 비어있음 → draw로 변환',
      );
      return {
        success: true,
        response: {
          action: 'draw',
          reasoning: '배치할 유효한 그룹이 없어 드로우합니다.',
          metadata: fullMetadata,
        },
      };
    }

    const tableGroups: TileGroupDto[] = [];
    for (const group of tileGroupsRaw) {
      if (
        !group.tiles ||
        !Array.isArray(group.tiles) ||
        group.tiles.length < 3
      ) {
        this.logger.warn(
          `[ResponseParser] 그룹 tiles 수 부족(${group.tiles?.length ?? 0}) → draw로 변환`,
        );
        return {
          success: true,
          response: {
            action: 'draw',
            reasoning: '타일 수가 부족한 그룹이 있어 드로우합니다.',
            metadata: fullMetadata,
          },
        };
      }
      const tileCodeError = this.validateTileCodes(group.tiles);
      if (tileCodeError) {
        return { success: false, errorReason: tileCodeError };
      }
      tableGroups.push({ tiles: group.tiles });
    }

    // tilesFromRack 검증
    if (tilesFromRack && Array.isArray(tilesFromRack)) {
      const tileCodeError = this.validateTileCodes(tilesFromRack);
      if (tileCodeError) {
        return { success: false, errorReason: tileCodeError };
      }
    }

    return {
      success: true,
      response: {
        action: 'place',
        tableGroups,
        tilesFromRack: tilesFromRack ?? [],
        reasoning: this.safeString(obj.reasoning),
        metadata: fullMetadata,
      },
    };
  }

  /**
   * maxRetries 초과 시 강제 드로우 응답을 생성한다.
   */
  buildFallbackDraw(
    metadata: Omit<
      MoveMetadataDto,
      'latencyMs' | 'promptTokens' | 'completionTokens' | 'retryCount'
    >,
    retryCount: number,
    latencyMs: number,
  ): MoveResponseDto {
    this.logger.warn(
      `[ResponseParser] 최대 재시도(${retryCount}) 초과. 강제 드로우 반환.`,
    );
    return {
      action: 'draw',
      reasoning: '유효한 수를 생성하지 못하여 강제 드로우를 선택합니다.',
      metadata: {
        ...metadata,
        latencyMs,
        promptTokens: 0,
        completionTokens: 0,
        retryCount,
        isFallbackDraw: true,
      },
    };
  }

  /**
   * LLM 응답 텍스트에서 JSON 객체를 추출한다.
   * 코드 블록(```json ... ```) 또는 순수 JSON 형식을 모두 지원한다.
   */
  private extractJson(content: string): unknown {
    // 코드 블록 제거 시도
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : content.trim();

    // JSON 객체 경계 찾기 (중첩 구조 처리)
    const startIdx = jsonStr.indexOf('{');
    const endIdx = jsonStr.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) {
      throw new Error('응답에서 JSON 객체를 찾을 수 없습니다.');
    }

    const extracted = jsonStr.slice(startIdx, endIdx + 1);
    return JSON.parse(extracted);
  }

  /**
   * 파싱된 객체의 필수 필드 구조를 검증한다.
   * 문제가 있으면 에러 메시지를 반환하고, 없으면 null을 반환한다.
   */
  private validateStructure(parsed: unknown): string | null {
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return '응답이 JSON 객체가 아닙니다.';
    }
    const obj = parsed as Record<string, unknown>;

    if (obj.action !== 'place' && obj.action !== 'draw') {
      return `action 필드가 "place" 또는 "draw"가 아닙니다: "${obj.action}"`;
    }

    return null;
  }

  /**
   * 타일 코드 배열의 형식을 검증한다.
   * 유효하지 않은 코드가 있으면 에러 메시지를 반환한다.
   */
  private validateTileCodes(tiles: string[]): string | null {
    // 타일 코드 정규식: R|B|Y|K + 1~13 + a|b  또는  JK1|JK2
    const tileRegex = /^([RBYK](?:[1-9]|1[0-3])[ab]|JK[12])$/;
    for (const tile of tiles) {
      if (!tileRegex.test(tile)) {
        return `유효하지 않은 타일 코드: "${tile}". 형식: {Color}{Number}{Set} 예: R7a, B13b, JK1`;
      }
    }
    return null;
  }

  private safeString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }
}
