import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PromptRegistry } from '../prompt/registry/prompt-registry.service';
import { PromptBuilderService } from '../prompt/prompt-builder.service';
import { ResponseParserService } from '../common/parser/response-parser.service';
import { OpenAiAdapter } from './openai.adapter';
import { ClaudeAdapter } from './claude.adapter';
import { DeepSeekAdapter } from './deepseek.adapter';
import { OllamaAdapter } from './ollama.adapter';
import { DashScopeAdapter } from './dashscope/dashscope.service';
import {
  MoveRequestDto,
  GameStateDto,
} from '../common/dto/move-request.dto';
import { V3_REASONING_SYSTEM_PROMPT } from '../prompt/v3-reasoning-prompt';
import { V2_REASONING_SYSTEM_PROMPT } from '../prompt/v2-reasoning-prompt';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// -----------------------------------------------------------------------
// SP3 통합 테스트 (39번 §9.1 Done Criteria)
//
// 목적: 5개 어댑터 + PromptRegistry 가 함께 wiring 되었을 때
//      PROMPT_VARIANT 환경변수가 5개 어댑터 모두에 일관되게 적용되는지 확인.
//
// 검증 시나리오:
//   1. PROMPT_VARIANT=v3 → 5개 어댑터 모두 V3_REASONING_SYSTEM_PROMPT 사용
//   2. 환경변수 미설정 → DeepSeek-Reasoner 만 v3 (default-recommendation), 나머지는 v2
//   3. DEEPSEEK_REASONER_PROMPT_VARIANT=v2 (per-model override) → DeepSeek-Reasoner 만 v2
// -----------------------------------------------------------------------

const makeGameState = (): GameStateDto => ({
  tableGroups: [],
  myTiles: ['R7a', 'R8a', 'R9a'],
  opponents: [{ playerId: 'p2', remainingTiles: 10 }],
  drawPileCount: 60,
  turnNumber: 1,
  initialMeldDone: false,
});

const makeMoveRequest = (): MoveRequestDto => ({
  gameId: 'integration-001',
  playerId: 'ai',
  gameState: makeGameState(),
  persona: 'wall',
  difficulty: 'expert',
  psychologyLevel: 0,
  maxRetries: 1,
  timeoutMs: 30000,
});

const makeRegistry = (env: Record<string, string> = {}): PromptRegistry => {
  const cs = {
    get: jest.fn(
      (k: string, d?: string) => env[k] ?? d,
    ),
  } as unknown as ConfigService;
  const r = new PromptRegistry(cs);
  r.onModuleInit();
  return r;
};

const makeConfigService = (model: string, modelKey: string): ConfigService =>
  ({
    get: jest.fn((k: string, d?: string) => {
      const c: Record<string, string> = {
        OPENAI_API_KEY: 'test',
        CLAUDE_API_KEY: 'test',
        DEEPSEEK_API_KEY: 'test',
        DASHSCOPE_API_KEY: 'test',
        [modelKey]: model,
      };
      return c[k] ?? d ?? '';
    }),
  }) as unknown as ConfigService;

const okOpenAi = (content: string) => ({
  data: {
    choices: [
      { message: { role: 'assistant', content }, finish_reason: 'stop' },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  },
  status: 200,
});

const okClaude = (content: string) => ({
  data: {
    content: [{ type: 'text', text: content }],
    usage: { input_tokens: 10, output_tokens: 5 },
  },
  status: 200,
});

const okDashscope = (content: string) => ({
  data: {
    id: 'x',
    object: 'chat.completion',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
          reasoning_content: '',
        },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    model: 'qwen3-235b-a22b-thinking-2507',
  },
  status: 200,
});

const okOllama = (content: string) => ({
  data: {
    model: 'qwen2.5:3b',
    message: { role: 'assistant', content },
    prompt_eval_count: 10,
    eval_count: 5,
    done: true,
  },
  status: 200,
});

describe('PromptRegistry × Adapter 통합 (SP3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PROMPT_VARIANT=v3 글로벌 설정', () => {
    it('OpenAI 어댑터가 V3_REASONING_SYSTEM_PROMPT 를 사용한다', async () => {
      const registry = makeRegistry({ PROMPT_VARIANT: 'v3' });
      const adapter = new OpenAiAdapter(
        new PromptBuilderService(),
        new ResponseParserService(),
        makeConfigService('gpt-5-mini', 'OPENAI_DEFAULT_MODEL'),
        registry,
      );
      jest.spyOn(adapter as any, 'backoff').mockResolvedValue(undefined);

      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          okOpenAi(JSON.stringify({ action: 'draw', reasoning: 'x' })),
        );

      await adapter.generateMove(makeMoveRequest());

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.messages[0].content).toBe(V3_REASONING_SYSTEM_PROMPT);
    });

    it('Claude 어댑터가 V3_REASONING_SYSTEM_PROMPT 를 사용한다', async () => {
      const registry = makeRegistry({ PROMPT_VARIANT: 'v3' });
      const adapter = new ClaudeAdapter(
        new PromptBuilderService(),
        new ResponseParserService(),
        makeConfigService('claude-sonnet-4-20250514', 'CLAUDE_DEFAULT_MODEL'),
        registry,
      );
      jest.spyOn(adapter as any, 'backoff').mockResolvedValue(undefined);

      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          okClaude(JSON.stringify({ action: 'draw', reasoning: 'x' })),
        );

      await adapter.generateMove(makeMoveRequest());

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.system).toBe(V3_REASONING_SYSTEM_PROMPT);
    });

    it('DeepSeek-Reasoner 어댑터가 V3_REASONING_SYSTEM_PROMPT 를 사용한다', async () => {
      const registry = makeRegistry({ PROMPT_VARIANT: 'v3' });
      const adapter = new DeepSeekAdapter(
        new PromptBuilderService(),
        new ResponseParserService(),
        makeConfigService('deepseek-reasoner', 'DEEPSEEK_DEFAULT_MODEL'),
        registry,
      );
      jest.spyOn(adapter as any, 'backoff').mockResolvedValue(undefined);

      mockedAxios.post = jest.fn().mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({ action: 'draw', reasoning: 'x' }),
                reasoning_content: '',
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
        status: 200,
      });

      await adapter.generateMove(makeMoveRequest());

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.messages[0].content).toBe(V3_REASONING_SYSTEM_PROMPT);
    });

    it('DashScope 어댑터가 V3_REASONING_SYSTEM_PROMPT 를 사용한다', async () => {
      const registry = makeRegistry({ PROMPT_VARIANT: 'v3' });
      const adapter = new DashScopeAdapter(
        new PromptBuilderService(),
        new ResponseParserService(),
        makeConfigService(
          'qwen3-235b-a22b-thinking-2507',
          'DASHSCOPE_DEFAULT_MODEL',
        ),
        registry,
      );
      jest.spyOn(adapter as any, 'backoff').mockResolvedValue(undefined);

      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          okDashscope(JSON.stringify({ action: 'draw', reasoning: 'x' })),
        );

      await adapter.generateMove(makeMoveRequest());

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.messages[0].content).toBe(V3_REASONING_SYSTEM_PROMPT);
    });

    it('Ollama 어댑터가 V3_REASONING_SYSTEM_PROMPT 를 사용한다', async () => {
      const registry = makeRegistry({ PROMPT_VARIANT: 'v3' });
      const adapter = new OllamaAdapter(
        new PromptBuilderService(),
        new ResponseParserService(),
        makeConfigService('qwen2.5:3b', 'OLLAMA_DEFAULT_MODEL'),
        registry,
      );
      jest.spyOn(adapter as any, 'backoff').mockResolvedValue(undefined);

      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          okOllama(JSON.stringify({ action: 'draw', reasoning: 'x' })),
        );

      await adapter.generateMove(makeMoveRequest());

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.messages[0].content).toBe(V3_REASONING_SYSTEM_PROMPT);
    });
  });

  describe('default-recommendation (env 미설정)', () => {
    it('★ DeepSeek-Reasoner 가 자동 v3 으로 전환된다 (behavior change)', async () => {
      const registry = makeRegistry();
      const adapter = new DeepSeekAdapter(
        new PromptBuilderService(),
        new ResponseParserService(),
        makeConfigService('deepseek-reasoner', 'DEEPSEEK_DEFAULT_MODEL'),
        registry,
      );
      jest.spyOn(adapter as any, 'backoff').mockResolvedValue(undefined);

      mockedAxios.post = jest.fn().mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({ action: 'draw', reasoning: 'x' }),
                reasoning_content: '',
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
        status: 200,
      });

      await adapter.generateMove(makeMoveRequest());

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      // ★ behavior change: 이전 v2 하드코딩 → SP3 부터 v3
      expect(body.messages[0].content).toBe(V3_REASONING_SYSTEM_PROMPT);
      expect(body.messages[0].content).not.toBe(V2_REASONING_SYSTEM_PROMPT);
    });

    it('OpenAI 는 default v2 를 사용한다', async () => {
      const registry = makeRegistry();
      const adapter = new OpenAiAdapter(
        new PromptBuilderService(),
        new ResponseParserService(),
        makeConfigService('gpt-5-mini', 'OPENAI_DEFAULT_MODEL'),
        registry,
      );
      jest.spyOn(adapter as any, 'backoff').mockResolvedValue(undefined);

      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce(
          okOpenAi(JSON.stringify({ action: 'draw', reasoning: 'x' })),
        );

      await adapter.generateMove(makeMoveRequest());

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.messages[0].content).toBe(V2_REASONING_SYSTEM_PROMPT);
    });
  });

  describe('per-model override 로 backwards compat 회복', () => {
    it('DEEPSEEK_REASONER_PROMPT_VARIANT=v2 설정 시 reasoner 가 v2 로 회귀', async () => {
      const registry = makeRegistry({
        DEEPSEEK_REASONER_PROMPT_VARIANT: 'v2',
      });
      const adapter = new DeepSeekAdapter(
        new PromptBuilderService(),
        new ResponseParserService(),
        makeConfigService('deepseek-reasoner', 'DEEPSEEK_DEFAULT_MODEL'),
        registry,
      );
      jest.spyOn(adapter as any, 'backoff').mockResolvedValue(undefined);

      mockedAxios.post = jest.fn().mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({ action: 'draw', reasoning: 'x' }),
                reasoning_content: '',
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
        status: 200,
      });

      await adapter.generateMove(makeMoveRequest());

      const [, body] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(body.messages[0].content).toBe(V2_REASONING_SYSTEM_PROMPT);
    });
  });
});
