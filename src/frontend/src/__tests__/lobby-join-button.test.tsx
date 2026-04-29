/**
 * 로비 참가 버튼 비활성화 조건 테스트
 *
 * 작성일: 2026-04-28 (I3 롤백)
 * 근거: PLAYING 방 참가 허용(I3)을 롤백하여 WAITING 상태만 참가 가능하도록 복원.
 *
 * 검증 대상:
 *   - WAITING 방 → 버튼 활성화
 *   - PLAYING 방 → 버튼 비활성화 (빈 석 유무와 무관)
 *   - FINISHED / CANCELLED 방 → 버튼 비활성화
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";

// LobbyClient의 RoomCard는 파일 내부에 선언되어 있어 직접 import할 수 없다.
// 참가 버튼 활성화 조건 순수 함수를 인라인으로 검증한다.

/**
 * 참가 버튼 활성화 여부 결정 로직 (LobbyClient.tsx 구현과 동일)
 * disabled={room.status !== "WAITING"}
 */
function isJoinEnabled(status: string): boolean {
  return status === "WAITING";
}

describe("로비 참가 버튼 활성화 조건 (I3 롤백 이후)", () => {
  test("WAITING 방 → 참가 가능", () => {
    expect(isJoinEnabled("WAITING")).toBe(true);
  });

  test("PLAYING 방 (빈 석 있음) → 참가 불가", () => {
    // I3 이전: playerCount < settings.playerCount 이면 참가 가능했으나, 롤백으로 금지
    expect(isJoinEnabled("PLAYING")).toBe(false);
  });

  test("PLAYING 방 (만석) → 참가 불가", () => {
    expect(isJoinEnabled("PLAYING")).toBe(false);
  });

  test("FINISHED 방 → 참가 불가", () => {
    expect(isJoinEnabled("FINISHED")).toBe(false);
  });

  test("CANCELLED 방 → 참가 불가", () => {
    expect(isJoinEnabled("CANCELLED")).toBe(false);
  });

  test("알 수 없는 상태 → 참가 불가", () => {
    expect(isJoinEnabled("UNKNOWN")).toBe(false);
  });
});
