import {
  IsString,
  IsEnum,
  IsArray,
  IsOptional,
  IsNumber,
  ValidateNested,
  Min,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TileGroupDto } from './move-request.dto';

export class MoveMetadataDto {
  /** 모델 공급자 타입 (openai | claude | deepseek | ollama) */
  @IsString()
  modelType!: string;

  /** 실제 사용된 모델명 */
  @IsString()
  modelName!: string;

  /** LLM API 응답 지연시간 (ms) */
  @IsNumber()
  @Min(0)
  latencyMs!: number;

  /** 프롬프트 토큰 수 */
  @IsNumber()
  @Min(0)
  promptTokens!: number;

  /** 완성 토큰 수 */
  @IsNumber()
  @Min(0)
  completionTokens!: number;

  /** 실제 재시도 횟수 (0이면 첫 번째 시도에 성공) */
  @IsNumber()
  @Min(0)
  retryCount!: number;

  /**
   * 강제 드로우 여부.
   * maxRetries를 모두 소진하고 유효한 수를 얻지 못한 경우 true.
   */
  @IsBoolean()
  isFallbackDraw!: boolean;
}

export class MoveResponseDto {
  /**
   * AI가 선택한 행동.
   * "place": 타일을 테이블에 배치 / "draw": 드로우 파일에서 타일 드로우
   */
  @IsEnum(['place', 'draw'])
  action!: 'place' | 'draw';

  /**
   * 배치 후 테이블의 전체 그룹/런 구성.
   * action이 "place"일 때만 포함.
   * Game Engine이 이 구성을 검증한다.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TileGroupDto)
  tableGroups?: TileGroupDto[];

  /**
   * 이번 턴에 랙에서 사용한 타일 코드 목록.
   * action이 "place"일 때만 포함.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tilesFromRack?: string[];

  /**
   * AI의 사고 과정 또는 전략 설명.
   * 디버깅 및 UI 표시용.
   */
  @IsOptional()
  @IsString()
  reasoning?: string;

  /** 호출 메타데이터 (지연시간, 토큰, 재시도 횟수 등) */
  @ValidateNested()
  @Type(() => MoveMetadataDto)
  metadata!: MoveMetadataDto;
}
