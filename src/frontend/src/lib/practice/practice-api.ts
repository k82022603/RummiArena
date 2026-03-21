export interface PracticeProgress {
  userId: string;
  stage: number;
  completedAt: string;
  score: number;
}

export async function savePracticeProgress(_progress: PracticeProgress): Promise<void> {
  // TODO: 서버 동기화 구현 후 활성화
  // const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  // await fetch(`${API_BASE}/api/practice/progress`, { method: 'POST', body: JSON.stringify(_progress) });
}

export async function getPracticeProgress(_userId: string): Promise<PracticeProgress[]> {
  return [];
}
