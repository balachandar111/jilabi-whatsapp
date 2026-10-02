// Tiny fetch wrapper: adds the JWT, JSON-encodes bodies, throws Error(message) on failure.
// In dev Vite proxies /api -> :5000. For a separately hosted frontend build with VITE_API_URL=https://backend/api
// Forgiving: trims spaces and trailing slashes, and adds "/api" if you forgot it.
//   (unset)                          -> /api                  (local dev, proxied by Vite to :5000)
//   https://x.onrender.com           -> https://x.onrender.com/api
//   https://x.onrender.com/api/      -> https://x.onrender.com/api
const raw = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
const BASE = !raw ? '/api' : /\/api$/.test(raw) ? raw : raw + '/api';

export async function api(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('token');
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Check that the backend is running and VITE_API_URL / CORS (CLIENT_ORIGIN) are set correctly.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}