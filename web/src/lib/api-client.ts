import { TOKEN_KEY } from '../api/client.js';

function normalizePamsUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input !== 'string') return input;
  if (input.startsWith('/PAMS/api')) return input.replace('/PAMS/api', '/api/pams');
  return input;
}

export async function pamsFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('X-Requested-By', 'RADAR');
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await window.fetch(normalizePamsUrl(input), { ...init, headers });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return res;

  const json = await res.json();
  const normalized = Object.prototype.hasOwnProperty.call(json || {}, 'code')
    ? {
        success: json.code === 0,
        data: json.data,
        error: json.message,
        message: json.message,
        ...((json.data && typeof json.data === 'object' && !Array.isArray(json.data)) ? json.data : {}),
      }
    : json;

  return new Response(JSON.stringify(normalized), {
    status: res.status,
    statusText: res.statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const fetchClient = pamsFetch;
