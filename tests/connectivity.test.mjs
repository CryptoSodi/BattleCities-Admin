import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundled = await build({ entryPoints: ['src/network/api.ts'], bundle: true, format: 'esm', write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

test('only the production API receives dashboard requests', () => {
  assert.equal(api.getApiUrl('/api/admin/session'), 'https://api.battlecities.com/api/admin/session');
  assert.throws(() => api.getApiUrl('https://example.com/api/session'));
  assert.throws(() => api.getApiUrl('//example.com/api/session'));
  assert.equal(api.GAME_ORIGIN, 'https://play.battlecities.com');
});

test('requests include the API session cookie and never cache admin data', async () => {
  const original = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => { captured = { url, init }; return new Response('{}'); };
  try {
    await api.apiFetchDirect('/api/admin/session', { credentials: 'omit', cache: 'force-cache' });
    assert.equal(captured.init.credentials, 'include');
    assert.equal(captured.init.cache, 'no-store');
    await api.apiFetchDirect('/api/admin/site-settings/live-users', { method: 'PATCH', body: '{"enabled":true}' });
    assert.equal(captured.init.method, 'PATCH');
    assert.equal(captured.init.body, '{"enabled":true}');
  } finally { globalThis.fetch = original; }
});

test('dashboard keeps every required control and does not load game assets', async () => {
  const source = await readFile('src/admin/main.ts', 'utf8');
  const html = await readFile('public/index.html', 'utf8');
  for (const match of source.matchAll(/requireElement(?:<[^>]*>)?\('(?:\[)(data-[\w-]+)(?:\])'\)/g)) {
    assert.ok(html.includes(match[1]), `Missing dashboard control: ${match[1]}`);
  }
  assert.ok(!html.includes('/main.css'));
  assert.ok(!html.includes('/main.js'));
  assert.ok(source.includes('`${GAME_ORIGIN}/?adminReplay='));
  assert.ok(html.includes('data-admin-wallet-login'));
  const profile = await readFile('src/playerProfile/main.ts', 'utf8');
  assert.ok(profile.includes("new URL('/', GAME_ORIGIN)"));
});
