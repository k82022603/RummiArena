import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { CostLimitGuard } from '../cost/cost-limit.guard';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsNumber,
  IsArray,
  IsBoolean,
  IsOptional,
  ValidateNested,
  Min,
  Max,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MoveService, ModelType } from './move.service';
import { MoveResponseDto } from '../common/dto/move-response.dto';
import {
  Persona,
  Difficulty,
  PsychologyLevel,
  TileGroupDto,
  OpponentInfoDto,
} from '../common/dto/move-request.dto';

// -----------------------------------------------------------------------
// POST /move 전용 요청 DTO
// game-server -> ai-adapter 엔드포인트 계약.
// model 필드를 포함하며, 내부 MoveRequestDto로 변환 후 어댑터에 전달한다.
// -----------------------------------------------------------------------

/**
 * POST /move 에서 GameState를 수신하기 위한 내부 DTO.
 * MoveRequestDto.GameStateDto와 동일한 구조이나 컨트롤러 레이어에서 독립 선언한다.
 */
class MoveGameStateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TileGroupDto)
  tableGroups!: TileGroupDto[];

  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(106)
  @IsString({ each: true })
  myTiles!: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpponentInfoDto)
  opponents!: OpponentInfoDto[];

  @IsNumber()
  @Min(0)
  drawPileCount!: number;

  @IsNumber()
  @Min(1)
  turnNumber!: number;

  @IsBoolean()
  initialMeldDone!: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  unseenTiles?: string[];
}

/**
 * POST /move 엔드포인트의 요청 바디 DTO.
 *
 * game-server가 보내는 형식으로, model 필드를 포함한다.
 * 어댑터 레이어의 MoveRequestDto에는 model이 없으므로 컨트롤러에서 분리하여 전달한다.
 */
export class PostMoveBodyDto {
  /** 게임 세션 ID */
  @IsString()
  @IsNotEmpty()
  gameId!: string;

  /** AI 플레이어 ID */
  @IsString()
  @IsNotEmpty()
  playerId!: string;

  /**
   * LLM 공급자 타입.
   * 어댑터 선택의 기준이 된다.
   */
  @IsEnum(['openai', 'claude', 'deepseek', 'ollama'])
  model!: ModelType;

  /** AI 캐릭터 페르소나 */
  @IsEnum(['rookie', 'calculator', 'shark', 'fox', 'wall', 'wildcard'])
  persona!: Persona;

  /** 난이도 등급 */
  @IsEnum(['beginner', 'intermediate', 'expert'])
  difficulty!: Difficulty;

  /** 심리전 레벨 (0~3) */
  @IsNumber()
  @Min(0)
  @Max(3)
  psychologyLevel!: PsychologyLevel;

  /** 현재 게임 상태 */
  @ValidateNested()
  @Type(() => MoveGameStateDto)
  gameState!: MoveGameStateDto;

  /**
   * 최대 재시도 횟수. 기본값 3.
   * 생략 시 기본값 3을 사용한다.
   */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  maxRetries?: number;

  /**
   * LLM API 호출 타임아웃(ms). 기본값 30000.
   * 생략 시 기본값 30000을 사용한다. 추론 모델은 최대 300s 필요.
   */
  @IsOptional()
  @IsNumber()
  @Min(5000)
  @Max(600000)
  timeoutMs?: number;
}

/**
 * Move 컨트롤러.
 * POST /move 엔드포인트를 제공한다.
 *
 * game-server는 이 엔드포인트를 호출하여 AI 플레이어의 다음 수를 요청한다.
 * 컨트롤러는 요청 검증과 서비스 위임만 담당한다.
 *
 * Guards:
 * - InternalTokenGuard: 내부 서비스 인증
 * - CostLimitGuard: 일일 비용 한도 초과 시 외부 LLM 요청 거부
 */
@Controller('move')
export class MoveController {
  private readonly logger = new Logger(MoveController.name);

  constructor(private readonly moveService: MoveService) {}

  /**
   * AI의 다음 수를 생성한다.
   *
   * 요청에서 model 필드를 분리하여 MoveService에 전달한다.
   * 나머지 필드는 MoveRequestDto로 변환하여 어댑터에 전달된다.
   *
   * POST /move
   */
  @Post()
  @Throttle({ default: { ttl: 60000, limit: 20 } }) // 20 req/min (LLM 호출 비용 높음)
  @UseGuards(InternalTokenGuard, CostLimitGuard)
  @HttpCode(HttpStatus.OK)
  async generateMove(@Body() body: PostMoveBodyDto): Promise<MoveResponseDto> {
    this.logger.log(
      `POST /move gameId=${body.gameId} model=${body.model} persona=${body.persona}`,
    );

    // MoveRequestDto 형태로 변환 (model 필드 제외)
    const moveRequest = {
      gameId: body.gameId,
      playerId: body.playerId,
      gameState: body.gameState,
      persona: body.persona,
      difficulty: body.difficulty,
      psychologyLevel: body.psychologyLevel,
      maxRetries: body.maxRetries ?? 3,
      timeoutMs: body.timeoutMs ?? 30000,
    };

    return this.moveService.generateMove(body.model, moveRequest);
  }
}
