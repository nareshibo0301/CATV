function csrfToken(): string {
  if (typeof document === 'undefined') return '';
  const row = document.cookie.split('; ').find((part) => part.startsWith('catv_csrf='));
  return row ? decodeURIComponent(row.slice('catv_csrf='.length)) : '';
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const request = () =>
    fetch(path, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken(),
        ...(init.headers ?? {}),
      },
    });

  const response = await request();
  if (response.status !== 401 || path.includes('/auth/')) {
    return response;
  }

  const refreshed = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
  if (!refreshed.ok) {
    window.location.href = '/login';
    return response;
  }
  return request();
}
