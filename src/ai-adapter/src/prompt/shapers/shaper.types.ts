/**
 * ContextShaper v6 공개 타입 정의.
 *
 * 설계: docs/02-design/44-context-shaper-v6-architecture.md §5.1
 *
 * 핵심 원칙:
 *   - Shaper 는 Rack/Board/History 만 가공 (시스템 프롬프트, persona, difficulty 불변)
 *   - ShaperInput 은 완전 readonly — 내부 mutate 금지
 *   - reshape() 는 순수 함수 (동일 input → 동일 output, 난수 금지)
 *   - 50ms 초과 시 MoveService 가 Promise.race 로 abort + Passthrough fallback
 *
 * SSOT: 이 파일의 타입은 variant Registry 와 orthogonal.
 *       variant Registry 는 docs/02-design/42 표 B 관리,
 *       shaper Registry 는 42번 §2 shaper 컬럼에 동기화 (ADR 44 §6.1).
 */

import { Difficulty } from '../../common/dto/move-request.dto';
import { ModelType } from '../registry/prompt-registry.types';

// ---------------------------------------------------------------------------
// Shaper 식별자
// ---------------------------------------------------------------------------

/**
 * Shaper 식별자 — kebab-case, env 값 (DEEPSEEK_REASONER_CONTEXT_SHAPER 등) 과 동일.
 * 신규 Shaper 추가 시 이 타입에 union 멤버를 추가한다.
 */
export type ShaperId =
  | 'passthrough' // baseline — v2 동작 그대로 (A/B 대조군)
  | 'joker-hinter' // F1 대응 — 조커 활용 사전 계산 (Day 10~11 구현)
  | 'pair-warmup'; // F2 대응 — Pair 힌트 주입 (Day 10~11 구현)

// ---------------------------------------------------------------------------
// Shaper 입출력 타입
// ---------------------------------------------------------------------------

/**
 * Shaper 입력 — GameStateDto 에서 Shaper 가 필요한 필드만 추출한 읽기 전용 snapshot.
 * GameStateDto 전체를 받지 않고 필요한 필드만 받아 결합도를 낮춘다.
 */
export interface ShaperInput {
  /** 타일 코드 목록 (불변 — Shaper 는 원소를 추가/삭제할 수 없음) */
  readonly rack: readonly string[];
  /** 테이블 그룹 목록 (그룹 순서 재배치 허용, 그룹 내 타일 변경 금지) */
  readonly board: readonly ReadonlyTileGroup[];
  /** 최근 5턴 이내 상대 행동 히스토리 */
  readonly history: readonly OpponentAction[];
  /** 게임 메타 정보 */
  readonly meta: ShaperMeta;
}

/** 불변 타일 그룹 */
export interface ReadonlyTileGroup {
  readonly tiles: readonly string[];
}

/** 상대 행동 항목 */
export interface OpponentAction {
  readonly playerId: string;
  readonly action: string;
  readonly turnNumber: number;
}

/** Shaper 가 참조하는 게임 메타 정보 */
export interface ShaperMeta {
  readonly turnNumber: number;
  readonly drawPileCount: number;
  readonly initialMeldDone: boolean;
  /** 힌트 생성 범위 제한에 사용 (예: PairWarmup 은 psychologyLevel >= 2 에서만) */
  readonly difficulty: Difficulty;
  readonly modelType: ModelType;
}

/**
 * Shaper 출력 — PromptBuilderService 가 소비.
 *
 * 불변성 계약 (ADR 44 §5.2):
 *   - rackView: rack 의 순열(permutation) 만 허용 — 원소 집합 불변
 *   - boardView: 그룹 순서 재배치 허용 — 그룹 내 타일 변경 금지
 *   - historyView: 길이 단축만 허용 (최근 2턴 가중)
 *   - hints: 빈 배열 허용, undefined/null 금지
 */
export interface ShaperOutput {
  readonly rackView: readonly string[];
  readonly boardView: readonly ReadonlyTileGroup[];
  readonly historyView: readonly OpponentAction[];
  readonly hints: readonly ShaperHint[];
}

/**
 * 사전 계산된 힌트.
 * PromptBuilderService 가 userPrompt 의 "## 참고 힌트" 섹션에 주입한다 (shaped.hints.length > 0 일 때).
 */
export interface ShaperHint {
  /** 힌트 유형 — 'joker-candidate' | 'pair-extension' | 'set-finisher' 등 */
  readonly type: string;
  /** 힌트 본문 — 구조는 type 별 정의 */
  readonly payload: Readonly<Record<string, unknown>>;
  /** 신뢰도 0.0~1.0 — LLM 에게 "(신뢰도 H/M/L)" 로 표기 */
  readonly confidence: number;
}

// ---------------------------------------------------------------------------
// ContextShaper 인터페이스
// ---------------------------------------------------------------------------

/**
 * 모든 Shaper 가 구현해야 하는 인터페이스.
 *
 * 구현 규칙:
 *   1. reshape() 는 순수 함수. 외부 상태 접근 금지, 내부 캐시는 허용.
 *   2. reshape() 내부에서 throw 발생 시 MoveService 가 catch → PassthroughShaper 로 fallback.
 *   3. 50ms 초과 시 MoveService 가 abort + Passthrough fallback (§8.2 Promise.race 가드).
 */
export interface ContextShaper {
  readonly id: ShaperId;
  reshape(input: ShaperInput): ShaperOutput;
}

// ---------------------------------------------------------------------------
// Registry 관련 타입
// ---------------------------------------------------------------------------

/** ShaperRegistry.getActive() 반환 구조 — variant Registry 의 ActiveVariantInfo 와 대칭 */
export interface ActiveShaperInfo {
  modelType: ModelType;
  shaperId: ShaperId;
  source:
    | 'code-explicit' // opts.shaperId
    | 'env-per-model' // <MODEL>_CONTEXT_SHAPER
    | 'env-global' // DEFAULT_CONTEXT_SHAPER
    | 'builtin-default'; // 'passthrough' 내장 기본값
}

/** ShaperRegistry.resolve() 옵션 */
export interface ShaperResolveOptions {
  /** 코드에서 명시 지정하는 shaper id — 테스트/실험 오버라이드용 */
  shaperId?: ShaperId;
}
