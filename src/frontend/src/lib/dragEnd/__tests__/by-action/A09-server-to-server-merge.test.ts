/**
 * A9 — 서버 → 다른 서버 (merge server) — INC-T11-IDDUP 회귀 핵심 셀
 *
 * SSOT 매핑:
 * - 56 §3.10 셀: A9 (SERVER_BOARD → SERVER_BOARD)
 * - 룰 ID: V-13a, V-13c, INV-G1, V-17, UR-14
 * - 상태 전이: S5 → S4 → S5
 * - 사용자 시나리오: F-06 (60 §1.2)
 *
 * 사고 매핑 (직접 회귀 방지):
 * - INC-T11-IDDUP (docs/04-testing/86 §3.1): 본 셀에서 양쪽 ID 보존 후 충돌 (D-01 위반)
 * - 본 테스트는 §4.2 INC-T11-IDDUP 회귀 시나리오의 단위 layer
 */

import { describe, it } from '@jest/globals';

describe('[A9] [V-13a] [V-13c] [V-17] [INV-G1] server → server (merge)', () => {
  describe('[A9.1] [V-13a] [UR-13] PRE_MELD reject', () => {
    it.todo('hasInitialMeld=false + server tile → server group drop → 거절');
  });

  describe('[A9.2] [V-13c] [UR-14] POST_MELD COMPAT allow', () => {
    it.todo('POST_MELD + server [R7,B7,Y7] + 다른 server [K7] → R7 → [K7] drop → 결과 [K7,R7] (이후 4색 그룹 가능)');
  });

  describe('[A9.3] [UR-19] POST_MELD INCOMPAT reject', () => {
    it.todo('POST_MELD + 다른 그룹/숫자 → 거절 (UR-19)');
  });

  describe('[A9.4] [INV-G1] [V-17] **INC-T11-IDDUP 직접 회귀** — 양쪽 ID 보존 시 충돌 검증', () => {
    it.todo('서버 [그룹A id=uuid-A], [그룹B id=uuid-B] → 부분 합병 시도 → 결과 그룹 ID INV-G1 유니크 보장');
    // GREEN 기대값 (INV-G1 + V-17):
    // - 합병 후 결과 그룹들 .map(g => g.id) 가 multiset 유니크
    // - 한쪽은 pending- prefix, 한쪽은 server UUID 보존 (혼합 X)
    // - V-17 위반 (id="" 또는 id 충돌) 발생 시 throw 또는 reject
    //
    // 사고 86 §3.1 직접 reproduction:
    // - GPT가 9장 배치 (서버 그룹 신규 생성, processAIPlace ID 누락 → id="")
    // - 사용자가 그 그룹과 다른 서버 그룹 합병 시도
    // - 회귀 코드: 양쪽 id 보존 → React key 충돌 → ghost group 부패
    //
    // 본 테스트가 GREEN = INC-T11-IDDUP 회귀 100% 차단
  });

  describe('[A9.5] [D-12] pending 전환 정합성 (양쪽 server → pending)', () => {
    it.todo('merge 후 양쪽 server 그룹 모두 pending 마킹, ConfirmTurn 시 새 commit');
  });
});
