export const session = {
  get: () => JSON.parse(localStorage.getItem('session') || 'null'),
  set: (s) => localStorage.setItem('session', JSON.stringify(s)),
  clear: () => localStorage.removeItem('session'),
};

export async function api(path, { method = 'GET', body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v)) : '';
  const s = session.get();
  let res;
  try {
    res = await fetch('/api' + path + qs, {
      method,
      headers: { 'Content-Type': 'application/json', ...(s ? { Authorization: 'Bearer ' + s.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Can't reach the server. Check your connection.");
  }
  if (res.status === 429) throw new Error('Too many attempts. Please wait a minute and try again.');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && s) { session.clear(); window.location.reload(); }
    throw new Error(data.message || 'Something went wrong.');
  }
  return data;
}

// Same rules as the backend.
export const rules = {
  name: (s) => (s.trim().length >= 20 && s.trim().length <= 60) || 'Name must be 20 to 60 characters.',
  email: (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()) || 'Enter a valid email address.',
  address: (s) => (s.trim().length >= 1 && s.length <= 400) || 'Address is required (max 400 characters).',
  password: (s) =>
    (s.length >= 8 && s.length <= 16 && /[A-Z]/.test(s) && /[^A-Za-z0-9]/.test(s)) ||
    'Password: 8 to 16 characters, one uppercase letter and one special character.',
};
export const firstError = (fields, values) => {
  for (const f of fields) { const r = rules[f](values[f] || ''); if (r !== true) return r; }
  return null;
};
