import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

async function module(path) {
  const output = await build({ entryPoints: [path], bundle: true, format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
}
const { formatPurchaseAmount } = await module('src/admin/purchaseModel.ts');
const { AdminClient } = await module('src/admin/AdminClient.ts');

test('pending amounts preserve exact token units and reject malformed values', () => {
  assert.equal(formatPurchaseAmount('1000000001', 9), '1.000000001');
  assert.equal(formatPurchaseAmount('18446744073709551615', 9), '18446744073.709551615');
  assert.equal(formatPurchaseAmount('1', 9), '0.000000001');
  assert.equal(formatPurchaseAmount('100', 0), '100');
  assert.equal(formatPurchaseAmount('2e3', 6), '—');
  assert.equal(formatPurchaseAmount('1', 19), '—');
});
test('pending list requests the admin endpoint with the API session', async () => {
  const previous = globalThis.fetch; let sent;
  globalThis.fetch = async (url, init) => { sent = { url, init }; return Response.json({ items: [], limit: 50, offset: 50, hasMore: false }); };
  try {
    await new AdminClient().getPendingPurchases(50);
    assert.match(sent.url, /\/api\/admin\/pending-purchases\?limit=50&offset=50$/);
    assert.equal(sent.init.credentials, 'include');
  } finally { globalThis.fetch = previous; }
});
test('pending purchase panel identifies unverified attempts without payment controls', async () => {
  const html = await readFile('public/index.html', 'utf8');
  assert.match(html, /data-admin-section="purchases"/);
  assert.match(html, /Some may have been cancelled before payment/);
  assert.match(html, /data-purchase-rows/);
});
