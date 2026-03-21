export interface PracticeProgress {
  id?: string;
  userId: string;
  stage: number;
  score: number;
  completedAt: string;
  createdAt?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * 연습 모드 진행 상태를 서버에 저장한다.
 * 서버 연동 실패 시 무시 (연습 모드는 로컬 localStorage 우선).
 */
export async function savePracticeProgress(
  progress: Omit<PracticeProgress, "id" | "createdAt">,
  token: string
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/practice/progress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(progress),
    });
  } catch {
    // 서버 연동 실패 시 무시 (연습 모드는 로컬 localStorage 우선)
  }
}

/**
 * 사용자의 연습 모드 진행 상태 목록을 반환한다.
 * 서버 연동 실패 시 빈 배열을 반환한다.
 */
export async function getPracticeProgress(
  token: string
): Promise<PracticeProgress[]> {
  try {
    const res = await fetch(`${API_BASE}/api/practice/progress`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return (await res.json()) as PracticeProgress[];
  } catch {
    return [];
  }
}
