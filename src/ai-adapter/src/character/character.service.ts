import { Injectable } from '@nestjs/common';
import {
  CharacterType,
  DifficultyLevel,
  PsychWarfareLevel,
  CharacterProfile,
  CharacterPromptResult,
  GameContextForPsych,
} from './character.types';
import { PERSONA_TEMPLATES, CHARACTER_PROFILES } from './persona.templates';

/**
 * AI 캐릭터 시스템 서비스.
 *
 * 6개 캐릭터 × 3 난이도 × 심리전 Level 0~3 조합으로
 * 시스템 프롬프트와 심리전 프롬프트를 생성한다.
 *
 * PromptBuilderService에서 주입하여 사용한다.
 */
@Injectable()
export class CharacterService {
  /**
   * 캐릭터 + 난이도 + 심리전 레벨을 조합한 완전한 프롬프트를 반환한다.
   *
   * @param character - 캐릭터 타입 (rookie | calculator | shark | fox | wall | wildcard)
   * @param difficulty - 난이도 (beginner | intermediate | expert)
   * @param psychLevel - 심리전 레벨 (0~3, 0이면 심리전 없음)
   * @returns 시스템 프롬프트와 심리전 프롬프트
   */
  getCharacterPrompt(
    character: CharacterType,
    difficulty: DifficultyLevel,
    psychLevel: PsychWarfareLevel,
  ): CharacterPromptResult {
    const systemPrompt = this.getSystemPrompt(character, difficulty);
    const psychWarfarePrompt = this.getPsychWarfarePrompt(psychLevel);

    return {
      systemPrompt,
      psychWarfarePrompt,
    };
  }

  /**
   * 캐릭터 + 난이도를 조합한 시스템 프롬프트를 반환한다.
   * 페르소나 지시문과 난이도별 전략 힌트를 포함한다.
   *
   * @param character - 캐릭터 타입
   * @param difficulty - 난이도
   * @returns 시스템 프롬프트 문자열
   */
  getSystemPrompt(
    character: CharacterType,
    difficulty: DifficultyLevel,
  ): string {
    const template = PERSONA_TEMPLATES[character];
    const strategyHint = template.strategyHints[difficulty];

    const parts: string[] = [
      template.systemPrompt,
      '',
      strategyHint,
      '',
      template.decisionStyle,
    ];

    return parts.join('\n');
  }

  /**
   * 심리전 레벨에 따른 추가 지시문을 반환한다.
   *
   * Level 0: 빈 문자열 (심리전 없음)
   * Level 1~3: 캐릭터에 무관한 공통 심리전 프롬프트
   *
   * 캐릭터 고유 심리전은 getCharacterPsychPrompt()로 별도 제공한다.
   *
   * @param level - 심리전 레벨 (0~3)
   * @param gameContext - 게임 컨텍스트 (선택적). 제공되면 상황 맞춤 프롬프트 생성
   * @returns 심리전 프롬프트 문자열
   */
  getPsychWarfarePrompt(
    level: PsychWarfareLevel,
    gameContext?: GameContextForPsych,
  ): string {
    if (level === 0) {
      return '';
    }

    const basePrompts: Record<Exclude<PsychWarfareLevel, 0>, string> = {
      1: `[심리전 Level 1: 상대 관찰]
상대의 남은 타일 수를 고려하여 플레이하세요.
- 상대 타일이 3개 이하이면 즉시 공격적으로 전환하세요.
- 상대 타일이 많으면 자신의 최적 수에 집중하세요.`,

      2: `[심리전 Level 2: 패턴 분석 + 견제]
상대의 행동 패턴을 분석하고 적극적으로 견제하세요.
- 상대가 자주 드로우한다면 좋은 타일을 모으는 중일 수 있습니다. 빠르게 배치하세요.
- 상대가 특정 숫자대를 선호한다면 그 타일을 선점하세요.
- 상대의 행동 패턴에서 보유 타일을 추론하세요.`,

      3: `[심리전 Level 3: 블러핑 + 페이크 드로우 + 템포 조절]
최고 수준의 심리전을 구사하세요.
- 낼 수 있는 타일이 있어도 전략적 시점까지 드로우를 선택하는 페이크를 고려하세요.
- 약한 척(블러핑)으로 상대를 방심시킨 후 한 턴에 대량 배치를 노리세요.
- 상대의 역심리 시도를 역이용하세요.
- 게임 전체의 흐름(템포)을 자신이 유리하게 이끌어가세요.`,
    };

    let prompt = basePrompts[level as Exclude<PsychWarfareLevel, 0>];

    // 게임 컨텍스트가 제공되면 상황 맞춤 힌트를 추가한다
    if (gameContext) {
      const contextHints = this.buildContextualHints(level, gameContext);
      if (contextHints) {
        prompt += `\n${contextHints}`;
      }
    }

    return prompt;
  }

  /**
   * 캐릭터 고유의 심리전 프롬프트를 반환한다.
   *
   * @param character - 캐릭터 타입
   * @param psychLevel - 심리전 레벨 (0~3)
   * @returns 캐릭터 고유 심리전 프롬프트 (Level 0이면 빈 문자열)
   */
  getCharacterPsychPrompt(
    character: CharacterType,
    psychLevel: PsychWarfareLevel,
  ): string {
    if (psychLevel === 0) {
      return '';
    }

    const template = PERSONA_TEMPLATES[character];
    const levelKey = `level${psychLevel}` as 'level1' | 'level2' | 'level3';
    return template.psychWarfare[levelKey];
  }

  /**
   * 캐릭터 프로필 메타데이터를 반환한다.
   * 게임 UI 캐릭터 선택 화면에서 활용한다.
   *
   * @param character - 캐릭터 타입
   * @returns 캐릭터 프로필 (이름, 설명, 강점, 약점)
   */
  getCharacterProfile(character: CharacterType): CharacterProfile {
    return CHARACTER_PROFILES[character];
  }

  /**
   * 모든 캐릭터 프로필 목록을 반환한다.
   */
  getAllCharacterProfiles(): CharacterProfile[] {
    return Object.values(CHARACTER_PROFILES);
  }

  /**
   * 게임 컨텍스트를 기반으로 상황 맞춤 심리전 힌트를 생성한다.
   * 내부 헬퍼 메서드.
   */
  private buildContextualHints(
    level: Exclude<PsychWarfareLevel, 0>,
    gameContext: GameContextForPsych,
  ): string {
    const hints: string[] = [];
    const { opponentTileCounts, turnNumber, drawPileCount } = gameContext;

    // 상대 타일 경보 (모든 레벨 공통)
    const minOpponentTiles = Math.min(...opponentTileCounts);
    if (minOpponentTiles <= 3) {
      hints.push(
        `[경보] 상대 중 ${minOpponentTiles}장 남은 플레이어가 있습니다. 즉시 공격적으로 전환하세요.`,
      );
    }

    // Level 2 이상: 드로우 파일 상태 분석
    if (level >= 2 && drawPileCount < 10) {
      hints.push(
        `[드로우 파일 경고] ${drawPileCount}장 남음. 드로우 전략보다 배치 전략으로 전환하세요.`,
      );
    }

    // Level 3: 후반 게임 압박
    if (level === 3 && turnNumber > 20) {
      hints.push(
        `[후반 게임] 턴 ${turnNumber}. 지금은 최대 배치로 게임을 빠르게 종료하세요.`,
      );
    }

    return hints.join('\n');
  }
}
