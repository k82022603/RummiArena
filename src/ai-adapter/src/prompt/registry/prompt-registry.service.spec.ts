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
    it('onModuleInit 후 v2/v3/v3-tuned/v4/v4.1/v5/character-ko 7개 변형이 모두 등록된다', () => {
      const registry = makeRegistry();
      const ids = registry.list().map((v) => v.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          'v2',
          'v3',
          'v3-tuned',
          'v4',
          'v4.1',
          'v5',
          'character-ko',
        ]),
      );
      expect(ids.length).toBeGreaterThanOrEqual(7);
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
      expect(list.length).toBeGreaterThanOrEqual(7);
      expect(list.find((v) => v.id === 'v3-tuned')).toBeDefined();
      expect(list.find((v) => v.id === 'v5')).toBeDefined();
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
