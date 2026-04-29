/**
 * Turn-by-turn snapshot 헬퍼
 *
 * 룰 SSOT 매핑:
 *   - V-01 (세트 유효성), V-02 (세트 크기), V-03 (랙 ≥1 추가),
 *     V-06 (타일 보존, 코드 빈도 비교), V-07 (조커 회수 후 즉시 사용),
 *     V-08 (자기 턴 확인), V-13a (재배치 권한)
 *   - D-04 (tile code 파싱), D-08 (조커 일관성)
 *   - INV: I1 (pendingGroupIds 일관성), I2 (currentTableGroups 단조성),
 *           I3 (랙 카운트 == 렌더 tile 수), I4 (hasInitialMeld 단조 비역행)
 *
 * 목적:
 *   1게임 완주 메타 시나리오에서 turn 별 상태를 캡처하고,
 *   실패 시 직전 N턴 trace 를 JSON 으로 저장해 회귀 분석을 가능케 한다.
 *
 * 캡처 항목 (`TurnSnapshot`):
 *   - 메타: turnNumber / wallClockMs / loopIndex
 *   - 턴 주체: currentSeat / mySeat / isMyTurn / aiThinkingSeat
 *   - 보드: tableGroups[] (id, type, tiles, count) / totalTableTileInstances
 *   - 랙: myRackCount / myRackSample (앞 5장)
 *   - 타이머: remainingMs / turnTimeoutSec / drawPileCount
 *   - 게임 진행: hasInitialMeld / pendingGroupIdsSize / pendingRecoveredJokers
 *   - 종료: gameEnded
 *   - 무결성: duplicatedTiles[] (V-06 위반 후보)
 *   - 액션: lastAction (직전 루프와의 diff 로 추론한 텍스트)
 *
 * 사용:
 *   const recorder = new SnapshotRecorder({ keepLastN: 5 });
 *   const snap = await recorder.capture(page, { loopIndex });
 *   ...
 *   await recorder.persistOnFailure(testInfo, "I3 violation");
 */

import { test, type Page, type TestInfo } from "@playwright/test";
import { promises as fs } from "node:fs";
import { dirname } from "node:path";

// ==================================================================
// 타입
// ==================================================================

export interface TableGroupSnapshot {
  id: string;
  type: string | null;
  tiles: string[];
  count: number;
}

export interface TurnSnapshot {
  /** 단조 증가 wall-clock 시각 (ms) */
  wallClockMs: number;
  /** 루프 카운터 (capture 호출 순번, 0-based) */
  loopIndex: number;

  // 턴 주체
  turnNumber: number;
  currentSeat: number;
  mySeat: number;
  isMyTurn: boolean;
  aiThinkingSeat: number | null;

  // 보드
  tableGroups: TableGroupSnapshot[];
  tableGroupsCount: number;
  totalTableTileInstances: number;
  /** V-06: 같은 코드가 여러 그룹/슬롯에 등장 (조커 제외) */
  duplicatedTiles: string[];

  // 랙
  myRackCount: number;
  myRackSample: string[];

  // 타이머
  remainingMs: number;
  turnTimeoutSec: number | null;
  drawPileCount: number | null;

  // 게임 진행
  hasInitialMeld: boolean;
  pendingGroupIdsSize: number;
  pendingRecoveredJokers: string[];

  // 종료
  gameEnded: boolean;

  // 직전 루프 대비 액션 추론 (capture 시점에서 채워짐, 첫 호출은 "init")
  lastAction?: string;
}

export interface CaptureMeta {
  loopIndex: number;
}

// ==================================================================
// 캡처 — page.evaluate 단발 호출로 store 전체 일관 스냅
// ==================================================================

/**
 * 단일 turn snapshot 을 캡처한다. 캡처는 한 번의 page.evaluate 안에서
 * gameStore + pendingStore 를 동시 읽어 race 를 최소화한다.
 *
 * 룰 매핑:
 *   - I3: rack 카운트 = pendingStore.draft.myTiles ?? gameStore.myTiles
 *   - V-06: tableGroups 전 그룹의 코드 빈도 합산 후 >1 인 코드 (조커 제외)
 *   - I1: AI 턴인데 pendingGroupIds.size > 0 이면 위반 (호출자 검사)
 *
 * store 가 아직 초기화되지 않으면 null 반환.
 */
export async function captureTurnState(
  page: Page,
  meta: CaptureMeta
): Promise<TurnSnapshot | null> {
  const raw = await page.evaluate(() => {
    const w = window as unknown as {
      __gameStore?: { getState: () => Record<string, unknown> };
      __pendingStore?: { getState: () => Record<string, unknown> };
    };
    const gStore = w.__gameStore;
    const pStore = w.__pendingStore;
    if (!gStore) return null;

    const g = gStore.getState();
    const gs = g.gameState as Record<string, unknown> | null;
    if (!gs) return null;

    const draft = pStore?.getState().draft as
      | {
          groups?: { id: string; tiles: string[]; type?: string }[];
          pendingGroupIds?: Set<string> | string[];
          myTiles?: string[];
          recoveredJokers?: string[];
        }
      | null
      | undefined;

    // 보드: pending draft 가 있으면 우선 (사용자 시야 SSOT), 없으면 server tableGroups
    const draftGroups = draft?.groups;
    const serverGroups = gs.tableGroups as
      | { id: string; tiles: string[]; type?: string }[]
      | undefined;
    const groupsRaw = draftGroups ?? serverGroups ?? [];

    // 코드 빈도 (조커 제외) → V-06 duplicate 후보
    const counts = new Map<string, number>();
    let totalInstances = 0;
    const tableGroups = groupsRaw.map((grp) => {
      const tiles = Array.isArray(grp.tiles) ? grp.tiles : [];
      for (const t of tiles) {
        if (typeof t !== "string") continue;
        if (t.startsWith("JK")) {
          totalInstances++;
          continue;
        }
        counts.set(t, (counts.get(t) ?? 0) + 1);
        totalInstances++;
      }
      return {
        id: grp.id ?? "",
        type: (grp.type as string | undefined) ?? null,
        tiles: tiles.slice(),
        count: tiles.length,
      };
    });
    const duplicatedTiles = Array.from(counts.entries())
      .filter(([, c]) => c > 1)
      .map(([t]) => t);

    // 랙: pendingStore.draft.myTiles 우선 (P3-2 SSOT), 없으면 gameStore.myTiles
    const myTiles =
      (draft?.myTiles as string[] | undefined) ??
      (g.myTiles as string[] | undefined) ??
      [];

    // pendingGroupIds size
    let pgIdsSize = 0;
    const pgIds = draft?.pendingGroupIds;
    if (pgIds) {
      if (pgIds instanceof Set) pgIdsSize = pgIds.size;
      else if (Array.isArray(pgIds)) pgIdsSize = pgIds.length;
    }

    return {
      // store 메타
      turnNumber: (g.turnNumber as number) ?? (gs.turnNumber as number) ?? 0,
      currentSeat: (gs.currentSeat as number) ?? -1,
      mySeat: (g.mySeat as number) ?? -1,
      aiThinkingSeat: (g.aiThinkingSeat as number | null) ?? null,

      // 보드
      tableGroups,
      totalTableTileInstances: totalInstances,
      duplicatedTiles,

      // 랙
      myRackCount: myTiles.length,
      myRackSample: myTiles.slice(0, 5),

      // 타이머
      remainingMs: (g.remainingMs as number) ?? 0,
      turnTimeoutSec: (gs.turnTimeoutSec as number | undefined) ?? null,
      drawPileCount: (gs.drawPileCount as number | undefined) ?? null,

      // 게임 진행
      hasInitialMeld: (g.hasInitialMeld as boolean) ?? false,
      pendingGroupIdsSize: pgIdsSize,
      pendingRecoveredJokers: (draft?.recoveredJokers as string[] | undefined) ?? [],

      gameEnded: !!(g.gameEnded as boolean),
    };
  });

  if (!raw) return null;

  return {
    wallClockMs: Date.now(),
    loopIndex: meta.loopIndex,
    isMyTurn: raw.currentSeat >= 0 && raw.currentSeat === raw.mySeat,
    tableGroupsCount: raw.tableGroups.length,
    ...raw,
  };
}

// ==================================================================
// SnapshotRecorder — N개 ring buffer + 실패 시 trace 직렬화
// ==================================================================

export interface RecorderOpts {
  /** 실패 시 보존할 직전 turn 수 (기본 5) */
  keepLastN?: number;
  /** 디버그 라벨 (파일명 prefix) */
  label?: string;
}

/**
 * Turn snapshot 을 ring buffer 로 보관한다.
 *
 * - capture: snapshot 한 건 추가, lastAction 자동 추론
 * - peekLastN: 마지막 N개 반환
 * - persistOnFailure: testInfo.outputPath 에 JSON 저장 + Playwright attachment 첨부
 */
export class SnapshotRecorder {
  private readonly snapshots: TurnSnapshot[] = [];
  private readonly keepLastN: number;
  private readonly label: string;

  constructor(opts: RecorderOpts = {}) {
    this.keepLastN = Math.max(1, opts.keepLastN ?? 5);
    this.label = opts.label ?? "turn-snapshot";
  }

  /**
   * snapshot 한 건을 캡처해 buffer 에 추가한다.
   *
   * lastAction 추론 규칙 (직전 snapshot 과 비교):
   *   - currentSeat 변경 → "turn-end (seat N→M)"
   *   - turnNumber 단조 증가 → "turn-advance (#X → #Y)"
   *   - tableGroupsCount 증가 → "table-grow (+K)"
   *   - tableGroupsCount 감소 → "table-shrink (−K)" (재배치/병합 후보)
   *   - myRackCount 감소 → "rack-place (−K)"
   *   - myRackCount 증가 → "rack-draw (+K)"
   *   - 변화 없음 → "idle"
   *   - 첫 호출 → "init"
   */
  async capture(page: Page, meta: CaptureMeta): Promise<TurnSnapshot | null> {
    const snap = await captureTurnState(page, meta);
    if (!snap) return null;
    snap.lastAction = this.inferLastAction(snap);
    this.snapshots.push(snap);
    return snap;
  }

  /** 마지막 N개 snapshot 반환 (chronological) */
  peekLastN(n?: number): TurnSnapshot[] {
    const k = Math.max(1, n ?? this.keepLastN);
    return this.snapshots.slice(-k);
  }

  /** 누적 snapshot 전체 반환 (얕은 복사) */
  all(): TurnSnapshot[] {
    return this.snapshots.slice();
  }

  size(): number {
    return this.snapshots.length;
  }

  /**
   * 마지막에 캡처된 snapshot 중 turnNumber 가 최댓값인 것을 반환.
   * 진행 검증 (최소 N턴 도달) 용.
   */
  maxTurnReached(): number {
    let m = 0;
    for (const s of this.snapshots) if (s.turnNumber > m) m = s.turnNumber;
    return m;
  }

  /**
   * 실패 trace 를 testInfo.outputPath 에 JSON 으로 디스크에 저장한 뒤
   * Playwright attachment 를 path 모드로 첨부한다.
   *
   * 디스크 저장 + path attachment 두 경로를 모두 사용하는 이유:
   *   - body Buffer attachment 는 in-memory only → test-results/ 에 파일이 떨어지지 않음
   *   - path attachment 는 Playwright 가 파일 자체를 트레이스 뷰어/HTML 리포트에 인덱싱
   *   - 사람이 직접 `test-results/<test>/<label>-trace.json` 으로 파일 접근 가능
   *
   * 저장 내용:
   *   - reason: 실패 사유 (호출자 전달)
   *   - failedAt: ISO timestamp
   *   - totalSnapshots: 누적 캡처 수
   *   - lastN: keepLastN 개 snapshot (full)
   *   - allTurnNumbers: 누적된 turn 번호 시계열 (요약 분석용)
   *
   * 반환: 디스크에 기록된 절대경로
   */
  async persistOnFailure(testInfo: TestInfo, reason: string): Promise<string> {
    const lastN = this.peekLastN();
    const payload = {
      label: this.label,
      reason,
      failedAt: new Date().toISOString(),
      keepLastN: this.keepLastN,
      totalSnapshots: this.snapshots.length,
      lastN,
      allTurnNumbers: this.snapshots.map((s) => ({
        loopIndex: s.loopIndex,
        turnNumber: s.turnNumber,
        currentSeat: s.currentSeat,
        myRackCount: s.myRackCount,
        tableGroupsCount: s.tableGroupsCount,
        lastAction: s.lastAction ?? null,
      })),
    };

    // testInfo.outputPath 는 test-results/<test-name>/ 디렉터리를 가리킴.
    const filePath = testInfo.outputPath(`${this.label}-trace.json`);

    // outputPath 자체가 디렉터리를 보장하지만, 안전하게 부모 디렉터리 보장.
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify(payload, null, 2),
      "utf-8"
    );

    // path 모드 attach: Playwright 가 파일을 리포트에 인덱싱.
    await testInfo.attach(`${this.label}-trace.json`, {
      path: filePath,
      contentType: "application/json",
    });

    return filePath;
  }

  // ----------------------------------------------------------------
  // 내부: lastAction 추론
  // ----------------------------------------------------------------
  private inferLastAction(snap: TurnSnapshot): string {
    const prev = this.snapshots[this.snapshots.length - 1];
    if (!prev) return "init";
    const parts: string[] = [];
    if (prev.turnNumber !== snap.turnNumber) {
      parts.push(`turn-advance(#${prev.turnNumber}→#${snap.turnNumber})`);
    }
    if (prev.currentSeat !== snap.currentSeat) {
      parts.push(`turn-end(seat ${prev.currentSeat}→${snap.currentSeat})`);
    }
    const tgDelta = snap.tableGroupsCount - prev.tableGroupsCount;
    if (tgDelta > 0) parts.push(`table-grow(+${tgDelta})`);
    if (tgDelta < 0) parts.push(`table-shrink(${tgDelta})`);
    const rackDelta = snap.myRackCount - prev.myRackCount;
    if (rackDelta > 0) parts.push(`rack-draw(+${rackDelta})`);
    if (rackDelta < 0) parts.push(`rack-place(${rackDelta})`);
    if (snap.gameEnded && !prev.gameEnded) parts.push("game-end");
    return parts.length > 0 ? parts.join(" | ") : "idle";
  }
}

// ==================================================================
// step 헬퍼 — Playwright trace 가독성 향상
// ==================================================================

/**
 * Playwright `test.step` 으로 감싼 capture.
 * trace viewer 에서 turn 단위로 그룹핑된다.
 */
export async function captureWithStep(
  recorder: SnapshotRecorder,
  page: Page,
  meta: CaptureMeta
): Promise<TurnSnapshot | null> {
  return await test.step(`turn-snapshot loop=${meta.loopIndex}`, async () => {
    return await recorder.capture(page, meta);
  });
}
