// Only public service URLs belong in this frontend. Authentication remains
// in the API's HttpOnly session cookie; no tokens or secrets are stored here.
export const API_ORIGIN = 'https://api.battlecities.com';
export const GAME_ORIGIN = 'https://play.battlecities.com';

export function getApiUrl(path: string): string {
  if (!path.startsWith('/api/') || path.startsWith('//')) {
    throw new Error('Only Battle Cities API paths are allowed.');
  }
  return `${API_ORIGIN}${path}`;
}

export function apiFetchDirect(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(getApiUrl(path), { ...init, credentials: 'include', cache: 'no-store' });
}
