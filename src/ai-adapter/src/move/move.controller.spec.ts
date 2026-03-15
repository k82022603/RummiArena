import { MoveController, PostMoveBodyDto } from './move.controller';
import { MoveService } from './move.service';
import { MoveResponseDto } from '../common/dto/move-response.dto';

// -----------------------------------------------------------------------
// MoveController 단위 테스트
//
// 목적:
//   - POST /move 요청을 MoveService에 올바르게 위임하는지 확인
//   - body.model 분리, maxRetries/timeoutMs 기본값 처리 확인
// -----------------------------------------------------------------------

const makePostMoveBody = (
  overrides: Partial<PostMoveBodyDto> = {},
): PostMoveBodyDto => ({
  gameId: 'ctrl-test-001',
  playerId: 'ai-player-ctrl',
  model: 'ollama',
  persona: 'fox',
  difficulty: 'intermediate',
  psychologyLevel: 1,
  gameState: {
    tableGroups: [],
    myTiles: ['R5a', 'B5b', 'K5a'],
    opponents: [{ playerId: 'human-01', remainingTiles: 7 }],
    drawPileCount: 50,
    turnNumber: 4,
    initialMeldDone: true,
  } as any,
  ...overrides,
});

const makeDrawResponse = (): MoveResponseDto => ({
  action: 'draw',
  metadata: {
    modelType: 'ollama',
    modelName: 'llama3.2',
    latencyMs: 200,
    promptTokens: 80,
    completionTokens: 30,
    retryCount: 0,
    isFallbackDraw: false,
  },
});

describe('MoveController', () => {
  let controller: MoveController;
  let moveService: jest.Mocked<MoveService>;

  beforeEach(() => {
    moveService = {
      generateMove: jest.fn(),
    } as unknown as jest.Mocked<MoveService>;

    controller = new MoveController(moveService);
  });

  // -----------------------------------------------------------------------
  // 기본 위임 검증
  // -----------------------------------------------------------------------
  describe('generateMove()', () => {
    it('MoveService.generateMove()를 호출하고 결과를 반환한다', async () => {
      const body = makePostMoveBody();
      const expected = makeDrawResponse();
      moveService.generateMove.mockResolvedValueOnce(expected);

      const result = await controller.generateMove(body);

      expect(moveService.generateMove).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expected);
    });

    it('body.model이 model 인자로 MoveService에 전달된다', async () => {
      const body = makePostMoveBody({ model: 'claude' });
      moveService.generateMove.mockResolvedValueOnce(makeDrawResponse());

      await controller.generateMove(body);

      const [model] = moveService.generateMove.mock.calls[0];
      expect(model).toBe('claude');
    });

    it('model 필드는 MoveRequestDto에서 제외된다', async () => {
      const body = makePostMoveBody({ model: 'openai' });
      moveService.generateMove.mockResolvedValueOnce(makeDrawResponse());

      await controller.generateMove(body);

      const [, request] = moveService.generateMove.mock.calls[0];
      expect((request as any).model).toBeUndefined();
    });

    it('maxRetries 미설정 시 기본값 3이 MoveRequest에 설정된다', async () => {
      const body = makePostMoveBody();
      delete body.maxRetries;
      moveService.generateMove.mockResolvedValueOnce(makeDrawResponse());

      await controller.generateMove(body);

      const [, request] = moveService.generateMove.mock.calls[0];
      expect(request.maxRetries).toBe(3);
    });

    it('timeoutMs 미설정 시 기본값 30000이 MoveRequest에 설정된다', async () => {
      const body = makePostMoveBody();
      delete body.timeoutMs;
      moveService.generateMove.mockResolvedValueOnce(makeDrawResponse());

      await controller.generateMove(body);

      const [, request] = moveService.generateMove.mock.calls[0];
      expect(request.timeoutMs).toBe(30000);
    });

    it('maxRetries 설정 시 해당 값이 그대로 전달된다', async () => {
      const body = makePostMoveBody({ maxRetries: 5 });
      moveService.generateMove.mockResolvedValueOnce(makeDrawResponse());

      await controller.generateMove(body);

      const [, request] = moveService.generateMove.mock.calls[0];
      expect(request.maxRetries).toBe(5);
    });

    it('timeoutMs 설정 시 해당 값이 그대로 전달된다', async () => {
      const body = makePostMoveBody({ timeoutMs: 15000 });
      moveService.generateMove.mockResolvedValueOnce(makeDrawResponse());

      await controller.generateMove(body);

      const [, request] = moveService.generateMove.mock.calls[0];
      expect(request.timeoutMs).toBe(15000);
    });

    it('gameId, playerId, persona, difficulty, psychologyLevel이 MoveRequest에 포함된다', async () => {
      const body = makePostMoveBody({
        gameId: 'game-xyz',
        playerId: 'player-abc',
        persona: 'wall',
        difficulty: 'expert',
        psychologyLevel: 3,
      });
      moveService.generateMove.mockResolvedValueOnce(makeDrawResponse());

      await controller.generateMove(body);

      const [, request] = moveService.generateMove.mock.calls[0];
      expect(request.gameId).toBe('game-xyz');
      expect(request.playerId).toBe('player-abc');
      expect(request.persona).toBe('wall');
      expect(request.difficulty).toBe('expert');
      expect(request.psychologyLevel).toBe(3);
    });

    it('place 응답을 그대로 반환한다', async () => {
      const placeResponse: MoveResponseDto = {
        action: 'place',
        tableGroups: [{ tiles: ['R5a', 'B5b', 'K5a'] }],
        tilesFromRack: ['R5a'],
        metadata: {
          modelType: 'ollama',
          modelName: 'llama3.2',
          latencyMs: 300,
          promptTokens: 100,
          completionTokens: 40,
          retryCount: 0,
          isFallbackDraw: false,
        },
      };
      moveService.generateMove.mockResolvedValueOnce(placeResponse);

      const result = await controller.generateMove(makePostMoveBody());

      expect(result.action).toBe('place');
      expect(result.tableGroups).toHaveLength(1);
    });
  });
});
