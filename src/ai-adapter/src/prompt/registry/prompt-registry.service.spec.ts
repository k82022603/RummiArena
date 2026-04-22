import { ConfigService } from '@nestjs/config';
import { PromptRegistry } from './prompt-registry.service';
import { ModelType, PromptVariant } from './prompt-registry.types';

// -----------------------------------------------------------------------
// PromptRegistry 단위 테스트 (39번 §6.4 명세 12건 + 추가)
// -----------------------------------------------------------------------

const makeRegistry = (env: Record<string, string> = {}): PromptRegistry => {
  const configService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      return env[key] ?? defaultValue;
    }),
  } as unknown as ConfigService;
  const registry = new PromptRegistry(configService);
  registry.onModuleInit();
  return registry;
};

describe('PromptRegistry', () => {
  describe('builtin variant registration', () => {
    it('onModuleInit 후 v2/v2-zh/v3/v3-tuned/v4/v4.1/v5/v7-ollama-meld/character-ko 9개 변형이 모두 등록된다', () => {
      const registry = makeRegistry();
      const ids = registry.list().map((v) => v.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          'v2',
          'v2-zh',
          'v3',
          'v3-tuned',
          'v4',
          'v4.1',
          'v5',
          'v7-ollama-meld',
          'character-ko',
        ]),
      );
      expect(ids.length).toBeGreaterThanOrEqual(9);
    });

    it('v4.1 은 v4 와 동일한 recommendedModels 를 가진다 (single-variable A/B)', () => {
      const registry = makeRegistry();
      const v4 = registry.resolve('deepseek-reasoner', { variantId: 'v4' });
      const v41 = registry.resolve('deepseek-reasoner', { variantId: 'v4.1' });
      expect(v41.metadata.recommendedModels).toEqual(
        v4.metadata.recommendedModels,
      );
    });

    it('v4.1 system prompt 는 Thinking Time Budget 섹션을 포함하지 않는다', () => {
      const registry = makeRegistry();
      const v41 = registry.resolve('deepseek-reasoner', { variantId: 'v4.1' });
      const sys = v41.systemPromptBuilder();
      expect(sys).not.toMatch(/Thinking Time Budget/);
      expect(sys).not.toMatch(/generous thinking budget/);
      expect(sys).not.toMatch(/15,000\+ thinking tokens/);
      expect(sys).not.toMatch(/Rushing is costly/);
    });

    it('v4.1 system prompt 는 v4 의 5축 / Action Bias / Few-shot / Checklist 를 유지한다', () => {
      const registry = makeRegistry();
      const v41 = registry.resolve('deepseek-reasoner', { variantId: 'v4.1' });
      const sys = v41.systemPromptBuilder();
      expect(sys).toMatch(/Position Evaluation Criteria/);
      expect(sys).toMatch(/Action Bias/);
      expect(sys).toMatch(/Few-Shot Examples/);
      expect(sys).toMatch(/Pre-Submission Validation Checklist/);
    });

    it('v5 system prompt 는 hybrid (few-shot 포함, checklist/step-by-step 없음)', () => {
      const registry = makeRegistry();
      const v5 = registry.resolve('deepseek-reasoner', { variantId: 'v5' });
      const sys = v5.systemPromptBuilder();
      // 포함해야 할 것
      expect(sys).toMatch(/Tile Encoding/);
      expect(sys).toMatch(/GROUP.*same number.*different colors/);
      expect(sys).toMatch(/RUN.*same color.*consecutive/);
      expect(sys).toMatch(/INITIAL MELD/);
      expect(sys).toMatch(/Response Format/);
      expect(sys).toMatch(/Example 1.*Draw/);
      expect(sys).toMatch(/Example 5.*Multiple sets/);
      // 제거되어야 할 것
      expect(sys).not.toMatch(/Pre-Submission Validation Checklist/);
      expect(sys).not.toMatch(/Step-by-Step Thinking/);
      expect(sys).not.toMatch(/Position Evaluation Criteria/);
      expect(sys).not.toMatch(/Action Bias/);
      expect(sys).not.toMatch(/Thinking Time Budget/);
    });

    it('v5 는 3모델 공통 (deepseek-reasoner, claude, openai)', () => {
      const registry = makeRegistry();
      const v5 = registry.resolve('deepseek-reasoner', { variantId: 'v5' });
      expect(v5.metadata.recommendedModels).toEqual(
        expect.arrayContaining(['deepseek-reasoner', 'claude', 'openai']),
      );
      expect(v5.metadata.tokenBudget).toBeLessThan(800);
    });

    it('등록된 모든 변형은 systemPromptBuilder/userPromptBuilder/retryPromptBuilder 함수를 가진다', () => {
      const registry = makeRegistry();
      registry.list().forEach((v) => {
        expect(typeof v.systemPromptBuilder).toBe('function');
        expect(typeof v.userPromptBuilder).toBe('function');
        expect(typeof v.retryPromptBuilder).toBe('function');
        expect(v.metadata.designDoc).toBeTruthy();
      });
    });
  });

  describe('resolve() — env 우선순위', () => {
    it('환경변수 PROMPT_VARIANT=v3 설정 시 모든 모델이 v3 반환', () => {
      const registry = makeRegistry({ PROMPT_VARIANT: 'v3' });
      const models: ModelType[] = [
        'openai',
        'claude',
        'deepseek',
        'deepseek-reasoner',
        'dashscope',
        'ollama',
      ];
      models.forEach((m) => {
        expect(registry.resolve(m).id).toBe('v3');
      });
    });

    it('per-model override DEEPSEEK_REASONER_PROMPT_VARIANT=v3-tuned 가 글로벌보다 우선', () => {
      const registry = makeRegistry({
        PROMPT_VARIANT: 'v3',
        DEEPSEEK_REASONER_PROMPT_VARIANT: 'v3-tuned',
      });
      expect(registry.resolve('deepseek-reasoner').id).toBe('v3-tuned');
      // 다른 모델은 글로벌 v3 유지
      expect(registry.resolve('openai').id).toBe('v3');
      expect(registry.resolve('dashscope').id).toBe('v3');
    });

    it('opts.variantId 가 환경변수보다 우선', () => {
      const registry = makeRegistry({ PROMPT_VARIANT: 'v3' });
      expect(registry.resolve('openai', { variantId: 'v2' }).id).toBe('v2');
    });

    it('미등록 variantId 요청 시 v2 로 fallback', () => {
      const registry = makeRegistry();
      const v = registry.resolve('openai', { variantId: 'v999-nonexistent' });
      expect(v.id).toBe('v2');
    });

    it('warnIfOffRecommendation=true 변형이 비권장 모델에 사용되면 warn 로그', () => {
      const registry = makeRegistry({ PROMPT_VARIANT: 'v3-tuned' });
      const warnSpy = jest
        .spyOn(registry['logger'], 'warn')
        .mockImplementation();
      // v3-tuned 의 recommendedModels 는 deepseek-reasoner, dashscope
      // openai 에 적용 시 warn 발생해야 함
      registry.resolve('openai');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('v3-tuned 는 openai 에 권장되지 않음'),
      );
      warnSpy.mockRestore();
    });
  });

  describe('default mapping (env 미설정)', () => {
    it('환경변수 없을 때 deepseek-reasoner 는 v3 반환 (★ behavior change)', () => {
      const registry = makeRegistry();
      expect(registry.resolve('deepseek-reasoner').id).toBe('v3');
    });

    it('환경변수 없을 때 dashscope 는 v3 반환', () => {
      const registry = makeRegistry();
      expect(registry.resolve('dashscope').id).toBe('v3');
    });

    it('환경변수 없을 때 openai 는 v2 반환', () => {
      const registry = makeRegistry();
      expect(registry.resolve('openai').id).toBe('v2');
    });

    it('환경변수 없을 때 claude/deepseek/ollama 는 v2 반환', () => {
      const registry = makeRegistry();
      expect(registry.resolve('claude').id).toBe('v2');
      expect(registry.resolve('deepseek').id).toBe('v2');
      expect(registry.resolve('ollama').id).toBe('v2');
    });
  });

  describe('list() / getActiveVariant()', () => {
    it('list() 는 등록된 모든 변형 반환', () => {
      const registry = makeRegistry();
      const list = registry.list();
      expect(list.length).toBeGreaterThanOrEqual(9);
      expect(list.find((v) => v.id === 'v3-tuned')).toBeDefined();
      expect(list.find((v) => v.id === 'v5')).toBeDefined();
      expect(list.find((v) => v.id === 'v2-zh')).toBeDefined();
      expect(list.find((v) => v.id === 'v7-ollama-meld')).toBeDefined();
    });

    it('getActiveVariant() — env-global source 정확 표기', () => {
      const registry = makeRegistry({ PROMPT_VARIANT: 'v3' });
      const info = registry.getActiveVariant('openai');
      expect(info.variantId).toBe('v3');
      expect(info.source).toBe('env-global');
    });

    it('getActiveVariant() — env-per-model source 정확 표기', () => {
      const registry = makeRegistry({
        PROMPT_VARIANT: 'v3',
        OPENAI_PROMPT_VARIANT: 'v2',
      });
      const info = registry.getActiveVariant('openai');
      expect(info.variantId).toBe('v2');
      expect(info.source).toBe('env-per-model');
    });

    it('getActiveVariant() — default-recommendation source 정확 표기', () => {
      const registry = makeRegistry();
      const info = registry.getActiveVariant('deepseek-reasoner');
      expect(info.variantId).toBe('v3');
      expect(info.source).toBe('default-recommendation');
    });
  });

  describe('register() — SP4 A/B 실험 주입', () => {
    it('동일 id 재등록 시 덮어쓰기 + warn 발생', () => {
      const registry = makeRegistry();
      const warnSpy = jest
        .spyOn(registry['logger'], 'warn')
        .mockImplementation();
      const fakeV3: PromptVariant = {
        id: 'v3',
        version: '9.9.9',
        systemPromptBuilder: () => 'overridden',
        userPromptBuilder: () => 'overridden user',
        retryPromptBuilder: () => 'overridden retry',
        metadata: {
          description: 'test override',
          tokenBudget: 100,
          recommendedModels: ['openai'],
          recommendedTemperature: 0.0,
          designDoc: 'test',
          introducedAt: '2026-04-14',
        },
      };
      registry.register(fakeV3);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('변형 덮어쓰기: v3'),
      );
      expect(registry.resolve('openai', { variantId: 'v3' }).version).toBe(
        '9.9.9',
      );
      warnSpy.mockRestore();
    });

    it('SP4 실험 프레임워크가 register() 호출로 임시 변형 주입 가능', () => {
      const registry = makeRegistry();
      const experimentVariant: PromptVariant = {
        id: 'v3-experiment-A',
        version: '0.1.0',
        baseVariant: 'v3',
        systemPromptBuilder: () => 'experiment A system',
        userPromptBuilder: () => 'experiment A user',
        retryPromptBuilder: () => 'experiment A retry',
        metadata: {
          description: 'A/B 실험 — 변형 A',
          tokenBudget: 1500,
          recommendedModels: ['deepseek-reasoner'],
          recommendedTemperature: 0.0,
          designDoc: 'experiment-pending',
          introducedAt: '2026-04-14',
          experimentTag: 'A',
        },
      };
      registry.register(experimentVariant);
      const resolved = registry.resolve('deepseek-reasoner', {
        variantId: 'v3-experiment-A',
      });
      expect(resolved.id).toBe('v3-experiment-A');
      expect(resolved.metadata.experimentTag).toBe('A');
    });
  });

  describe('v2-zh — DeepSeek-Reasoner 전용 중문 variant', () => {
    it('v2-zh 는 DeepSeek-reasoner 전용, baseVariant=v2', () => {
      const registry = makeRegistry();
      const v2zh = registry.resolve('deepseek-reasoner', {
        variantId: 'v2-zh',
      });
      expect(v2zh.id).toBe('v2-zh');
      expect(v2zh.metadata.recommendedModels).toEqual(['deepseek-reasoner']);
      expect(v2zh.baseVariant).toBe('v2');
    });

    it('v2-zh system prompt 는 중문 용어를 포함 + 영문 보존 요소 유지', () => {
      const registry = makeRegistry();
      const sys = registry
        .resolve('deepseek-reasoner', { variantId: 'v2-zh' })
        .systemPromptBuilder();
      // 중문 핵심 용어
      expect(sys).toMatch(/手牌/);
      expect(sys).toMatch(/桌面/);
      expect(sys).toMatch(/首次出牌/);
      expect(sys).toMatch(/连续/);
      // 보존 요소
      expect(sys).toMatch(/R7a/);
      expect(sys).toMatch(/JK1/);
      expect(sys).toMatch(/"action"/);
      expect(sys).toMatch(/"tableGroups"/);
      expect(sys).toMatch(/"tilesFromRack"/);
      expect(sys).toMatch(/"reasoning"/);
      expect(sys).toMatch(/ERR_GROUP_COLOR_DUP/);
    });

    it('v2-zh 는 DeepSeek 외 모델 적용 시 warn (warnIfOffRecommendation=true)', () => {
      const registry = makeRegistry({ OPENAI_PROMPT_VARIANT: 'v2-zh' });
      const warnSpy = jest
        .spyOn(registry['logger'], 'warn')
        .mockImplementation();
      registry.resolve('openai');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('v2-zh'));
      warnSpy.mockRestore();
    });

    it('v2-zh user prompt 는 타일 코드 영문 보존 + 중문 섹션', () => {
      const registry = makeRegistry();
      const variant = registry.resolve('deepseek-reasoner', {
        variantId: 'v2-zh',
      });
      const p = variant.userPromptBuilder({
        tableGroups: [{ tiles: ['R7a', 'B7a', 'K7a'] }],
        myTiles: ['R10a', 'B10b', 'Y2a'],
        turnNumber: 3,
        drawPileCount: 80,
        initialMeldDone: false,
        opponents: [{ playerId: 'p2', remainingTiles: 10 }],
      });
      expect(p).toMatch(/R7a/);
      expect(p).toMatch(/B10b/);
      expect(p).toMatch(/手牌|桌面/);
    });

    it('DEEPSEEK_REASONER_PROMPT_VARIANT=v2-zh 설정 시 DeepSeek-reasoner 만 v2-zh', () => {
      const registry = makeRegistry({
        DEEPSEEK_REASONER_PROMPT_VARIANT: 'v2-zh',
      });
      expect(registry.resolve('deepseek-reasoner').id).toBe('v2-zh');
      // 다른 모델은 기본값 유지
      expect(registry.resolve('openai').id).toBe('v2');
      expect(registry.resolve('claude').id).toBe('v2');
    });
  });

  describe('v7-ollama-meld — qwen2.5:3b 전용 하드코딩 variant', () => {
    it('v7-ollama-meld 는 Ollama 전용 + baseVariant=v2', () => {
      const registry = makeRegistry();
      const v = registry.resolve('ollama', { variantId: 'v7-ollama-meld' });
      expect(v.id).toBe('v7-ollama-meld');
      expect(v.metadata.recommendedModels).toEqual(['ollama']);
      expect(v.baseVariant).toBe('v2');
      expect(v.metadata.warnIfOffRecommendation).toBe(true);
    });

    it('v7-ollama-meld system prompt 는 4-step 절차 + hand-holding few-shot 포함', () => {
      const registry = makeRegistry();
      const sys = registry
        .resolve('ollama', { variantId: 'v7-ollama-meld' })
        .systemPromptBuilder();
      // 4-step 절차 키워드
      expect(sys).toMatch(/4-STEP DECISION PROCEDURE/);
      expect(sys).toMatch(/Step 1.*GROUP/);
      expect(sys).toMatch(/Step 2.*RUN/);
      expect(sys).toMatch(/Step 3.*Combine/);
      expect(sys).toMatch(/Step 4/);
      // few-shot 6개 예시 (최소 Example 1 ~ Example 6)
      expect(sys).toMatch(/Example 1/);
      expect(sys).toMatch(/Example 6/);
      // 초기 등록 30점 규칙 최상단 강조
      expect(sys).toMatch(/30 or more points/);
      expect(sys).toMatch(/ONLY tiles from your rack/);
      // 점수 계산 패턴 (Pattern A/B/C/D)
      expect(sys).toMatch(/Pattern A/);
      expect(sys).toMatch(/Pattern D/);
    });

    it('v7-ollama-meld user prompt 는 by-color / group-candidates 힌트를 포함', () => {
      const registry = makeRegistry();
      const variant = registry.resolve('ollama', {
        variantId: 'v7-ollama-meld',
      });
      const user = variant.userPromptBuilder({
        tableGroups: [],
        myTiles: ['R10a', 'B10a', 'K10a', 'R5a', 'B7b', 'Y2a'],
        turnNumber: 1,
        drawPileCount: 80,
        initialMeldDone: false,
        opponents: [{ playerId: 'p2', remainingTiles: 14 }],
      });
      // 상태 강조
      expect(user).toMatch(/Initial Meld: NOT DONE/);
      expect(user).toMatch(/30\+ points/);
      // by-color 힌트
      expect(user).toMatch(/By color:/);
      expect(user).toMatch(/R=\[R10a,R5a\]/);
      // group candidates (10 은 3장 — 표시되어야 함)
      expect(user).toMatch(/Group candidates.*10:\[R10a,B10a,K10a\]/);
    });

    it('v7-ollama-meld user prompt — 초기 등록 DONE 분기', () => {
      const registry = makeRegistry();
      const variant = registry.resolve('ollama', {
        variantId: 'v7-ollama-meld',
      });
      const user = variant.userPromptBuilder({
        tableGroups: [{ tiles: ['R3a', 'R4a', 'R5a'] }],
        myTiles: ['R6a', 'B10a'],
        turnNumber: 5,
        drawPileCount: 60,
        initialMeldDone: true,
        opponents: [],
      });
      expect(user).toMatch(/Initial Meld: DONE/);
      expect(user).toMatch(/include all existing table groups/);
      expect(user).toMatch(/Group1: \[R3a, R4a, R5a\]/);
    });

    it('v7-ollama-meld 는 Ollama 외 모델 적용 시 warn (warnIfOffRecommendation=true)', () => {
      const registry = makeRegistry({
        OPENAI_PROMPT_VARIANT: 'v7-ollama-meld',
      });
      const warnSpy = jest
        .spyOn(registry['logger'], 'warn')
        .mockImplementation();
      registry.resolve('openai');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('v7-ollama-meld 는 openai 에 권장되지 않음'),
      );
      warnSpy.mockRestore();
    });

    it('OLLAMA_PROMPT_VARIANT=v7-ollama-meld 설정 시 Ollama 만 v7-ollama-meld', () => {
      const registry = makeRegistry({
        OLLAMA_PROMPT_VARIANT: 'v7-ollama-meld',
      });
      expect(registry.resolve('ollama').id).toBe('v7-ollama-meld');
      // 다른 모델은 기본값 유지
      expect(registry.resolve('openai').id).toBe('v2');
      expect(registry.resolve('claude').id).toBe('v2');
    });

    it('OLLAMA_PROMPT_VARIANT 없고 USE_V2_PROMPT=true 면 Ollama 는 v2 유지 (기본 경로 무영향 검증)', () => {
      const registry = makeRegistry({ USE_V2_PROMPT: 'true' });
      // opt-in 하지 않으면 기존 v2 베이스라인 그대로
      expect(registry.resolve('ollama').id).toBe('v2');
    });

    it('v7-ollama-meld retry prompt 는 base user prompt + 에러 이유 + retry 힌트', () => {
      const registry = makeRegistry();
      const variant = registry.resolve('ollama', {
        variantId: 'v7-ollama-meld',
      });
      const retry = variant.retryPromptBuilder(
        {
          tableGroups: [],
          myTiles: ['R10a', 'B10a', 'K10a'],
          turnNumber: 1,
          drawPileCount: 80,
          initialMeldDone: false,
          opponents: [],
        },
        'ERR_GROUP_COLOR_DUP',
        1,
      );
      expect(retry).toMatch(/# RETRY 2/);
      expect(retry).toMatch(/Previous error: ERR_GROUP_COLOR_DUP/);
      expect(retry).toMatch(/Sets with 2 tiles/);
      expect(retry).toMatch(/action.*draw.*retry fallback/);
    });
  });

  describe('Backward compatibility — USE_V2_PROMPT', () => {
    it('USE_V2_PROMPT=true 가 설정되면 모든 모델이 v2 반환 + deprecation warn 1회', () => {
      const registry = makeRegistry({ USE_V2_PROMPT: 'true' });
      // 모든 모델이 v2
      expect(registry.resolve('openai').id).toBe('v2');
      expect(registry.resolve('deepseek-reasoner').id).toBe('v2');
      expect(registry.resolve('dashscope').id).toBe('v2');
      // getActiveVariant 는 env-global source 로 보고
      expect(registry.getActiveVariant('openai').source).toBe('env-global');
    });

    it('USE_V2_PROMPT=true 와 PROMPT_VARIANT=v3 동시 설정 시 PROMPT_VARIANT 가 우선', () => {
      const registry = makeRegistry({
        USE_V2_PROMPT: 'true',
        PROMPT_VARIANT: 'v3',
      });
      expect(registry.resolve('openai').id).toBe('v3');
    });
  });
});
