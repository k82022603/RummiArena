import type { TileCode } from "@/types/tile";

/**
 * 연습 모드 스테이지 목표 타입
 * - group: 같은 숫자 다른 색상 3~4개 (그룹)
 * - run:   같은 색상 연속 숫자 3개 이상 (런)
 * - joker: 조커 포함 유효 세트
 */
export type StageGoal = "group" | "run" | "joker";

export interface StageConfig {
  stage: number;
  name: string;
  description: string;
  tutorialMessage: string;
  hand: TileCode[];
  goal: StageGoal;
  /** 클리어 조건 설명 (힌트 패널에 노출) */
  clearCondition: string;
  /** 잘못된 배치 시 표시할 기본 힌트 */
  defaultHint: string;
}

export const STAGE_CONFIGS: Record<1 | 2 | 3, StageConfig> = {
  1: {
    stage: 1,
    name: "그룹 만들기",
    description: "같은 숫자, 3가지 이상 색상으로 그룹을 만드세요",
    tutorialMessage:
      "같은 숫자를 가진 타일 3~4개를 모아 그룹을 만들어 보세요. 단, 같은 색상이 두 개 있으면 안 됩니다.",
    hand: ["R7a", "B7a", "Y7a", "K7a", "R3a", "B5a"],
    goal: "group",
    clearCondition: "유효한 그룹 1개 이상 배치",
    defaultHint: "같은 숫자, 서로 다른 색상 3~4개를 함께 올려놓으세요.",
  },
  2: {
    stage: 2,
    name: "런 만들기",
    description: "같은 색상, 연속된 숫자로 런을 만드세요",
    tutorialMessage:
      "같은 색상 타일 3개 이상을 연속된 숫자 순서로 배치하면 '런'이 됩니다. 숫자 순서가 중요합니다.",
    hand: ["R4a", "R5a", "R6a", "R7a", "B3a", "K8a"],
    goal: "run",
    clearCondition: "유효한 런 1개 이상 배치",
    defaultHint: "같은 색상, 숫자가 연속되어야 합니다 (예: R4-R5-R6).",
  },
  3: {
    stage: 3,
    name: "조커 활용",
    description: "조커를 활용하여 유효한 세트를 만드세요",
    tutorialMessage:
      "조커(JK)는 어떤 타일로든 대체할 수 있습니다. 조커를 포함한 그룹 또는 런을 만들어 보세요.",
    hand: ["JK1", "R5a", "R6a", "B7a", "Y7a", "K7a"],
    goal: "joker",
    clearCondition: "조커 포함 유효한 세트(그룹 또는 런) 1개 이상 배치",
    defaultHint: "조커는 빠진 타일 자리에 넣으면 세트가 완성됩니다.",
  },
};

/** 스테이지 번호 목록 */
export const STAGE_NUMBERS = [1, 2, 3] as const;
export type StageNumber = (typeof STAGE_NUMBERS)[number];
