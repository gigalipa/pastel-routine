const test = require('node:test');
const assert = require('node:assert/strict');
const { createAppServer } = require('../server');

test('PWA static assets, manifest, Service Worker, and UI structure are served properly', async (t) => {
  const app = await createAppServer({ sqlitePath: ':memory:' });
  const port = await app.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  t.after(() => app.close());

  const indexRes = await fetch(`${baseUrl}/`);
  assert.equal(indexRes.status, 200);
  const html = await indexRes.text();
  assert.ok(html.includes('manifest.json'));
  assert.ok(html.includes('Pastel Routine'));

  const manifestRes = await fetch(`${baseUrl}/manifest.json`);
  assert.equal(manifestRes.status, 200);
  const manifest = await manifestRes.json();
  assert.equal(manifest.display, 'standalone');

  const swRes = await fetch(`${baseUrl}/sw.js`);
  assert.equal(swRes.status, 200);
  const swText = await swRes.text();
  assert.ok(swText.includes("addEventListener('push'"));

  const appJsRes = await fetch(`${baseUrl}/app.js`);
  assert.equal(appJsRes.status, 200);
  const appJsText = await appJsRes.text();
  assert.ok(appJsText.includes('function escapeHtml('));
});
