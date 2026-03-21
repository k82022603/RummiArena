const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export async function getAdminToken(): Promise<string> {
  if (process.env.NEXT_PUBLIC_ADMIN_TOKEN) {
    return process.env.NEXT_PUBLIC_ADMIN_TOKEN;
  }
  if (typeof window !== 'undefined') {
    const cached = sessionStorage.getItem('admin_token');
    if (cached) return cached;
  }
  try {
    const res = await fetch(`${API_BASE}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'admin-user-001', displayName: '관리자' }),
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('admin_token', data.token);
      }
      return data.token as string;
    }
  } catch {
    // dev-login 실패
  }
  return '';
}
