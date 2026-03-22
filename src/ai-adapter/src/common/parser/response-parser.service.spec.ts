import { ResponseParserService } from './response-parser.service';

describe('ResponseParserService', () => {
  let parser: ResponseParserService;

  beforeEach(() => {
    parser = new ResponseParserService();
  });

  const baseMetadata = {
    modelType: 'openai',
    modelName: 'gpt-4o',
    isFallbackDraw: false,
  };

  const makeRaw = (content: string) => ({
    content,
    promptTokens: 100,
    completionTokens: 50,
    latencyMs: 500,
  });

  describe('parse - 성공 케이스', () => {
    it('유효한 draw 응답을 파싱한다', () => {
      const raw = makeRaw('{"action": "draw", "reasoning": "드로우 선택"}');
      const result = parser.parse(raw, baseMetadata, 0);

      expect(result.success).toBe(true);
      expect(result.response?.action).toBe('draw');
      expect(result.response?.reasoning).toBe('드로우 선택');
      expect(result.response?.metadata.retryCount).toBe(0);
      expect(result.response?.metadata.isFallbackDraw).toBe(false);
    });

    it('유효한 place 응답을 파싱한다', () => {
      const raw = makeRaw(
        JSON.stringify({
          action: 'place',
          tableGroups: [
            { tiles: ['R7a', 'B7a', 'K7b'] },
            { tiles: ['Y3a', 'Y4a', 'Y5a'] },
          ],
          tilesFromRack: ['R7a', 'B7a'],
          reasoning: '그룹 배치',
        }),
      );
      const result = parser.parse(raw, baseMetadata, 0);

      expect(result.success).toBe(true);
      expect(result.response?.action).toBe('place');
      expect(result.response?.tableGroups).toHaveLength(2);
      expect(result.response?.tilesFromRack).toEqual(['R7a', 'B7a']);
    });

    it('코드 블록으로 감싸진 JSON도 파싱한다', () => {
      const raw = makeRaw(
        '```json\n{"action": "draw", "reasoning": "전략적 드로우"}\n```',
      );
      const result = parser.parse(raw, baseMetadata, 0);
      expect(result.success).toBe(true);
      expect(result.response?.action).toBe('draw');
    });

    it('조커 타일 코드(JK1, JK2)를 허용한다', () => {
      const raw = makeRaw(
        JSON.stringify({
          action: 'place',
          tableGroups: [{ tiles: ['JK1', 'B7a', 'K7b'] }],
          tilesFromRack: ['JK1'],
          reasoning: '조커 사용',
        }),
      );
      const result = parser.parse(raw, baseMetadata, 0);
      expect(result.success).toBe(true);
    });
  });

  describe('parse - 실패 케이스', () => {
    it('JSON 파싱 실패를 처리한다', () => {
      const raw = makeRaw('이것은 JSON이 아닙니다');
      const result = parser.parse(raw, baseMetadata, 0);

      expect(result.success).toBe(false);
      expect(result.errorReason).toContain('JSON 파싱 실패');
    });

    it('action 필드가 없으면 실패한다', () => {
      const raw = makeRaw('{"tableGroups": []}');
      const result = parser.parse(raw, baseMetadata, 0);

      expect(result.success).toBe(false);
      expect(result.errorReason).toContain('action');
    });

    it('place인데 tableGroups가 없으면 draw로 자동 변환한다 (소형 LLM 대응)', () => {
      const raw = makeRaw('{"action": "place", "tilesFromRack": ["R7a"]}');
      const result = parser.parse(raw, baseMetadata, 0);

      // 소형 LLM(4B급)이 place+빈 tableGroups를 반환하면 draw로 변환한다
      expect(result.success).toBe(true);
      expect(result.response?.action).toBe('draw');
    });

    it('그룹 타일이 3개 미만이면 draw로 자동 변환한다 (소형 LLM 대응)', () => {
      const raw = makeRaw(
        JSON.stringify({
          action: 'place',
          tableGroups: [{ tiles: ['R7a', 'B7a'] }],
          tilesFromRack: ['R7a'],
        }),
      );
      const result = parser.parse(raw, baseMetadata, 0);

      // 타일 수 부족 그룹도 draw로 변환한다
      expect(result.success).toBe(true);
      expect(result.response?.action).toBe('draw');
    });

    it('유효하지 않은 타일 코드를 거부한다', () => {
      const raw = makeRaw(
        JSON.stringify({
          action: 'place',
          tableGroups: [{ tiles: ['INVALID', 'B7a', 'K7b'] }],
          tilesFromRack: ['INVALID'],
        }),
      );
      const result = parser.parse(raw, baseMetadata, 0);

      expect(result.success).toBe(false);
      expect(result.errorReason).toContain('유효하지 않은 타일 코드');
    });
  });

  describe('buildFallbackDraw', () => {
    it('강제 드로우 응답을 생성한다', () => {
      const result = parser.buildFallbackDraw(baseMetadata, 3, 30000);

      expect(result.action).toBe('draw');
      expect(result.metadata.isFallbackDraw).toBe(true);
      expect(result.metadata.retryCount).toBe(3);
      expect(result.metadata.latencyMs).toBe(30000);
    });
  });
});
