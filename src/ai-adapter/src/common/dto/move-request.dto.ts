import {
  IsString,
  IsNotEmpty,
  IsEnum,
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

// -----------------------------------------------------------------------
// 타일 인코딩: {Color}{Number}{Set}
// Color: R(빨강) | B(파랑) | Y(노랑) | K(검정)
// Number: 1~13
// Set: a | b
// 조커: JK1 | JK2
// 예시: R7a, B13b, JK1
// -----------------------------------------------------------------------

export type Persona =
  | 'rookie'
  | 'calculator'
  | 'shark'
  | 'fox'
  | 'wall'
  | 'wildcard';

export type Difficulty = 'beginner' | 'intermediate' | 'expert';

export type PsychologyLevel = 0 | 1 | 2 | 3;

export class TileGroupDto {
  /** 그룹/런을 구성하는 타일 코드 목록 (예: ["R7a", "B7a", "K7b"]) */
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(13)
  @IsString({ each: true })
  tiles!: string[];
}

export class OpponentInfoDto {
  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @IsNumber()
  @Min(0)
  remainingTiles!: number;

  /** 최근 행동 히스토리 (expert 난이도에서만 제공) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  actionHistory?: string[];
}

export class GameStateDto {
  /** 현재 테이블에 놓인 그룹/런 목록 */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TileGroupDto)
  tableGroups!: TileGroupDto[];

  /** AI 플레이어의 현재 타일 랙 (초기 14장 + 드로우 누적으로 14장 초과 가능) */
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(106)
  @IsString({ each: true })
  myTiles!: string[];

  /** 상대 플레이어 정보 */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpponentInfoDto)
  opponents!: OpponentInfoDto[];

  /** 드로우 파일 남은 장수 */
  @IsNumber()
  @Min(0)
  drawPileCount!: number;

  /** 현재 턴 번호 */
  @IsNumber()
  @Min(1)
  turnNumber!: number;

  /** AI 플레이어의 최초 등록(Initial Meld) 완료 여부 */
  @IsBoolean()
  initialMeldDone!: boolean;

  /**
   * 미출현 타일 목록 (expert 난이도에서만 제공).
   * 테이블 + 자신의 랙에 없는 타일 = 상대 랙 또는 드로우 파일에 남은 타일.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  unseenTiles?: string[];
}

export class MoveRequestDto {
  /** 게임 세션 ID */
  @IsString()
  @IsNotEmpty()
  gameId!: string;

  /** AI 플레이어 ID */
  @IsString()
  @IsNotEmpty()
  playerId!: string;

  /** 현재 게임 상태 */
  @ValidateNested()
  @Type(() => GameStateDto)
  gameState!: GameStateDto;

  /**
   * AI 캐릭터 페르소나.
   * rookie | calculator | shark | fox | wall | wildcard
   */
  @IsEnum(['rookie', 'calculator', 'shark', 'fox', 'wall', 'wildcard'])
  persona!: Persona;

  /**
   * 난이도 등급.
   * beginner(하수) | intermediate(중수) | expert(고수)
   */
  @IsEnum(['beginner', 'intermediate', 'expert'])
  difficulty!: Difficulty;

  /**
   * 심리전 레벨 (0~3).
   * 0: 없음 / 1: 상대 타일 수 고려 / 2: 행동 패턴 분석 / 3: 블러핑+페이크
   */
  @IsNumber()
  @Min(0)
  @Max(3)
  psychologyLevel!: PsychologyLevel;

  /** 최대 재시도 횟수 (기본값: 3) */
  @IsNumber()
  @Min(1)
  @Max(5)
  maxRetries!: number;

  /** LLM API 호출 타임아웃(ms). 기본값: 30000. 로컬 추론 모델은 최대 600s 필요 */
  @IsNumber()
  @Min(5000)
  @Max(600000)
  timeoutMs!: number;
}
