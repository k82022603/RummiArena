import { Injectable, Optional } from '@nestjs/common';
import { MoveRequestDto, Difficulty } from '../common/dto/move-request.dto';
import { buildSystemPrompt as legacyBuildSystemPrompt } from './persona.templates';
import { DIFFICULTY_TEMPERATURE } from '../adapter/base.adapter';
import { CharacterService } from '../character/character.service';
import {
  CharacterType,
  DifficultyLevel,
  PsychWarfareLevel,
} from '../character/character.types';

/**
 * 게임 상태와 캐릭터 설정을 LLM 프롬프트로 변환하는 서비스.
 * 모든 어댑터에서 공통으로 사용한다.
 *
 * CharacterService가 주입되면 신 템플릿(PERSONA_TEMPLATES)을 사용한다.
 * CharacterService가 없으면 구 템플릿(buildSystemPrompt)으로 폴백한다.
 */
@Injectable()
export class PromptBuilderService {
  constructor(
    @Optional() private readonly characterService?: CharacterService,
  ) {}

  /**
   * MoveRequest로부터 시스템 프롬프트를 생성한다.
   * CharacterService가 주입된 경우 신 템플릿을 사용하고,
   * 없으면 구 템플릿(legacyBuildSystemPrompt)으로 폴백한다.
   */
  buildSystemPrompt(request: MoveRequestDto): string {
    let systemPrompt: string;

    if (this.characterService) {
      const result = this.characterService.getCharacterPrompt(
        request.persona as CharacterType,
        request.difficulty as DifficultyLevel,
        request.psychologyLevel as PsychWarfareLevel,
      );
      systemPrompt = result.psychWarfarePrompt
        ? `${result.systemPrompt}\n\n${result.psychWarfarePrompt}`
        : result.systemPrompt;
    } else {
      // CharacterService 없으면 구 템플릿 사용 (fallback)
      systemPrompt = legacyBuildSystemPrompt(
        request.persona,
        request.difficulty,
        request.psychologyLevel,
      );
    }

    // 모든 시스템 프롬프트에 JSON-only 강제 문구 추가 (소형 모델 JSON 오류율 대응)
    return (
      systemPrompt +
      '\n\nIMPORTANT: Respond ONLY with a valid JSON object. No explanation, no markdown, no code blocks. Output raw JSON only.'
    );
  }

  /**
   * 현재 게임 상태를 사용자 메시지(유저 프롬프트)로 변환한다.
   * 난이도에 따라 제공 정보의 범위가 달라진다.
   */
  buildUserPrompt(request: MoveRequestDto): string {
    const { gameState, difficulty, psychologyLevel } = request;
    const lines: string[] = [];

    // 현재 테이블 상태
    lines.push('## 현재 테이블 상태');
    if (gameState.tableGroups.length === 0) {
      lines.push('  (테이블이 비어있습니다)');
    } else {
      gameState.tableGroups.forEach((group, idx) => {
        lines.push(`  그룹${idx + 1}: [${group.tiles.join(', ')}]`);
      });
      lines.push(
        `  (총 ${gameState.tableGroups.length}개 그룹 -- 배치 시 이 그룹들을 tableGroups에 모두 포함하세요)`,
      );
    }

    // 내 타일
    lines.push('');
    lines.push('## 내 타일');
    lines.push(
      `  [${gameState.myTiles.join(', ')}] (총 ${gameState.myTiles.length}장)`,
    );

    // 게임 진행 상황
    lines.push('');
    lines.push('## 게임 진행 상황');
    lines.push(`  현재 턴: ${gameState.turnNumber}`);
    lines.push(`  드로우 파일: ${gameState.drawPileCount}장 남음`);
    if (!gameState.initialMeldDone) {
      lines.push(
        `  최초 등록: 미완료 -- 이번 턴에 배치하려면 합계 30점 이상 필요!`,
      );
      lines.push(
        `  30점 미만 배치는 무효 -> draw를 선택하거나 30점 이상 조합을 만드세요`,
      );
      lines.push(
        `  테이블 타일 사용 불가: 자신의 랙 타일만으로 그룹/런을 구성하세요`,
      );
    } else {
      lines.push(`  최초 등록: 완료 (점수 제한 없음)`);
      lines.push(
        `  기존 테이블 그룹을 확장하거나 분리/합체하여 더 많은 타일을 배치할 수 있습니다`,
      );
    }

    // 상대 정보 (beginner는 제외)
    if (difficulty !== 'beginner' && gameState.opponents.length > 0) {
      lines.push('');
      lines.push('## 상대 플레이어 정보');
      gameState.opponents.forEach((opp) => {
        const warning = opp.remainingTiles <= 3 ? ' ⚠ 주의: 곧 승리 가능' : '';
        lines.push(`  ${opp.playerId}: 타일 ${opp.remainingTiles}장${warning}`);

        // expert + psychologyLevel >= 2: 행동 히스토리 포함
        if (
          difficulty === 'expert' &&
          psychologyLevel >= 2 &&
          opp.actionHistory &&
          opp.actionHistory.length > 0
        ) {
          lines.push(`    최근 행동:`);
          opp.actionHistory.slice(-5).forEach((action) => {
            lines.push(`      - ${action}`);
          });
        }
      });
    }

    // 미출현 타일 정보 (expert 난이도에서만)
    if (
      difficulty === 'expert' &&
      gameState.unseenTiles &&
      gameState.unseenTiles.length > 0
    ) {
      lines.push('');
      lines.push('## 미출현 타일 (상대 랙 또는 드로우 파일에 있을 수 있음)');
      lines.push(`  [${gameState.unseenTiles.join(', ')}]`);
    }

    // 캐릭터 및 난이도 컨텍스트
    lines.push('');
    lines.push('## AI 설정');
    lines.push(`  캐릭터: ${request.persona}`);
    lines.push(`  난이도: ${request.difficulty}`);
    lines.push(`  심리전 레벨: Level ${request.psychologyLevel}`);

    lines.push('');
    lines.push('## 응답 형식 (반드시 이 JSON만 출력, 설명/마크다운 금지)');
    lines.push('드로우할 때:');
    lines.push('{"action":"draw","reasoning":"이유"}');
    lines.push('');
    lines.push('배치할 때:');
    lines.push(
      '{"action":"place","tableGroups":[{"tiles":["R10a","R11a","R12a"]}],"tilesFromRack":["R10a","R11a","R12a"],"reasoning":"R런 33점으로 최초등록"}',
    );
    lines.push('');
    lines.push(
      '규칙: action은 "place" 또는 "draw"만 가능. tableGroups의 각 그룹은 타일 3개 이상.',
    );
    lines.push(
      '주의: tableGroups = 배치 후 테이블 전체 최종 상태. 기존 테이블 그룹을 모두 포함하고, 새 그룹을 추가하세요.',
    );
    lines.push('지금 즉시 JSON만 출력하라:');

    return lines.join('\n');
  }

  /**
   * 이전 시도가 실패한 경우 에러 피드백을 포함한 재시도 메시지를 생성한다.
   */
  buildRetryUserPrompt(
    request: MoveRequestDto,
    errorReason: string,
    attemptNumber: number,
  ): string {
    const basePrompt = this.buildUserPrompt(request);
    return (
      basePrompt +
      `\n\n## 재시도 안내 (시도 ${attemptNumber + 1}회)\n` +
      `이전 응답이 유효하지 않습니다: ${errorReason}\n` +
      `반드시 유효한 JSON 형식과 올바른 게임 규칙을 지켜서 다시 응답하세요.` +
      `\n## 주의: JSON 객체만 출력. 설명, 마크다운 코드블록, 추가 텍스트 금지. 반드시 {"action":...} 형식으로만.`
    );
  }

  /**
   * 히스토리 토큰 제한 전략에 따라 게임 히스토리의 최대 턴 수를 반환한다.
   * beginner: 0턴, intermediate: 3턴, expert: 5턴
   */
  getHistoryLimit(difficulty: Difficulty): number {
    const limits: Record<Difficulty, number> = {
      beginner: 0,
      intermediate: 3,
      expert: 5,
    };
    return limits[difficulty];
  }

  /**
   * 난이도를 LLM temperature 값으로 변환한다.
   * beginner(1.0): 창의적 실수 유발 / intermediate(0.7): 균형 / expert(0.3): 최적 수 집중
   */
  getTemperature(difficulty: Difficulty): number {
    return DIFFICULTY_TEMPERATURE[difficulty] ?? 0.7;
  }
}
