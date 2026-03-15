import { HealthService } from './health.service';
import { OpenAiAdapter } from '../adapter/openai.adapter';
import { ClaudeAdapter } from '../adapter/claude.adapter';
import { DeepSeekAdapter } from '../adapter/deepseek.adapter';
import { OllamaAdapter } from '../adapter/ollama.adapter';

// -----------------------------------------------------------------------
// HealthService 단위 테스트
//
// 목적:
//   - checkAllAdapters()가 모든 어댑터 헬스체크 결과를 올바르게 집계하는지 확인
//   - 개별 어댑터 실패 시 전체 서비스가 중단되지 않는지 확인
// -----------------------------------------------------------------------

describe('HealthService', () => {
  let service: HealthService;

  let openAiAdapter: jest.Mocked<OpenAiAdapter>;
  let claudeAdapter: jest.Mocked<ClaudeAdapter>;
  let deepSeekAdapter: jest.Mocked<DeepSeekAdapter>;
  let ollamaAdapter: jest.Mocked<OllamaAdapter>;

  beforeEach(() => {
    openAiAdapter = {
      healthCheck: jest.fn(),
    } as unknown as jest.Mocked<OpenAiAdapter>;
    claudeAdapter = {
      healthCheck: jest.fn(),
    } as unknown as jest.Mocked<ClaudeAdapter>;
    deepSeekAdapter = {
      healthCheck: jest.fn(),
    } as unknown as jest.Mocked<DeepSeekAdapter>;
    ollamaAdapter = {
      healthCheck: jest.fn(),
    } as unknown as jest.Mocked<OllamaAdapter>;

    service = new HealthService(
      openAiAdapter,
      claudeAdapter,
      deepSeekAdapter,
      ollamaAdapter,
    );
  });

  // -----------------------------------------------------------------------
  // 전체 정상 케이스
  // -----------------------------------------------------------------------
  describe('checkAllAdapters() - 전체 정상', () => {
    it('모든 어댑터가 healthy이면 4개 모두 true를 반환한다', async () => {
      openAiAdapter.healthCheck.mockResolvedValueOnce(true);
      claudeAdapter.healthCheck.mockResolvedValueOnce(true);
      deepSeekAdapter.healthCheck.mockResolvedValueOnce(true);
      ollamaAdapter.healthCheck.mockResolvedValueOnce(true);

      const result = await service.checkAllAdapters();

      expect(result).toEqual({
        openai: true,
        claude: true,
        deepseek: true,
        ollama: true,
      });
    });
  });

  // -----------------------------------------------------------------------
  // 부분 실패 케이스
  // -----------------------------------------------------------------------
  describe('checkAllAdapters() - 부분 실패', () => {
    it('Ollama만 false이면 ollama: false, 나머지 true를 반환한다', async () => {
      openAiAdapter.healthCheck.mockResolvedValueOnce(true);
      claudeAdapter.healthCheck.mockResolvedValueOnce(true);
      deepSeekAdapter.healthCheck.mockResolvedValueOnce(true);
      ollamaAdapter.healthCheck.mockResolvedValueOnce(false);

      const result = await service.checkAllAdapters();

      expect(result.openai).toBe(true);
      expect(result.claude).toBe(true);
      expect(result.deepseek).toBe(true);
      expect(result.ollama).toBe(false);
    });

    it('OpenAI만 false이면 openai: false를 반환한다', async () => {
      openAiAdapter.healthCheck.mockResolvedValueOnce(false);
      claudeAdapter.healthCheck.mockResolvedValueOnce(true);
      deepSeekAdapter.healthCheck.mockResolvedValueOnce(true);
      ollamaAdapter.healthCheck.mockResolvedValueOnce(true);

      const result = await service.checkAllAdapters();

      expect(result.openai).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 예외 처리 — 어댑터 에러가 전체를 중단시키지 않아야 한다
  // -----------------------------------------------------------------------
  describe('checkAllAdapters() - 어댑터 예외 처리', () => {
    it('어댑터 healthCheck()가 예외를 던지면 해당 어댑터를 false로 처리한다', async () => {
      openAiAdapter.healthCheck.mockRejectedValueOnce(
        new Error('Network error'),
      );
      claudeAdapter.healthCheck.mockResolvedValueOnce(true);
      deepSeekAdapter.healthCheck.mockResolvedValueOnce(true);
      ollamaAdapter.healthCheck.mockResolvedValueOnce(true);

      const result = await service.checkAllAdapters();

      expect(result.openai).toBe(false);
      expect(result.claude).toBe(true);
    });

    it('모든 어댑터가 예외를 던져도 결과 객체를 반환한다', async () => {
      openAiAdapter.healthCheck.mockRejectedValueOnce(new Error('err1'));
      claudeAdapter.healthCheck.mockRejectedValueOnce(new Error('err2'));
      deepSeekAdapter.healthCheck.mockRejectedValueOnce(new Error('err3'));
      ollamaAdapter.healthCheck.mockRejectedValueOnce(new Error('err4'));

      const result = await service.checkAllAdapters();

      expect(result).toEqual({
        openai: false,
        claude: false,
        deepseek: false,
        ollama: false,
      });
    });
  });

  // -----------------------------------------------------------------------
  // 병렬 실행 검증
  // -----------------------------------------------------------------------
  describe('checkAllAdapters() - 병렬 실행', () => {
    it('4개 어댑터 healthCheck가 모두 한 번씩 호출된다', async () => {
      openAiAdapter.healthCheck.mockResolvedValueOnce(true);
      claudeAdapter.healthCheck.mockResolvedValueOnce(true);
      deepSeekAdapter.healthCheck.mockResolvedValueOnce(true);
      ollamaAdapter.healthCheck.mockResolvedValueOnce(true);

      await service.checkAllAdapters();

      expect(openAiAdapter.healthCheck).toHaveBeenCalledTimes(1);
      expect(claudeAdapter.healthCheck).toHaveBeenCalledTimes(1);
      expect(deepSeekAdapter.healthCheck).toHaveBeenCalledTimes(1);
      expect(ollamaAdapter.healthCheck).toHaveBeenCalledTimes(1);
    });
  });
});
