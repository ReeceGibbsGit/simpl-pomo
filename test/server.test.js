import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, listen, HOST } from '../src/app-server.js';

const SECRET = 'outside public - must never be served';

let root;
let dataDir;
let publicDir;
let server;
let base;
let port;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'simpl-pomo-server-'));
  dataDir = join(root, 'data');
  publicDir = join(root, 'public');
  await mkdir(publicDir, { recursive: true });
  await writeFile(join(publicDir, 'index.html'), '<!doctype html><title>pomo</title>', 'utf8');
  await writeFile(join(publicDir, 'app.js'), 'export const x = 1;\n', 'utf8');
  await writeFile(join(publicDir, 'style.css'), 'body {}\n', 'utf8');
  await writeFile(join(root, 'server.js'), SECRET, 'utf8');
  server = createServer({ dataDir, publicDir });
  await listen(server, 0);
  port = server.address().port;
  base = `http://${HOST}:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
});

// Sends a raw path (no URL normalising, unlike fetch).
function rawGet(path) {
  return new Promise((resolve, reject) => {
    const req = request({ host: HOST, port, path, method: 'GET' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

const json = (method, body) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('the server binds 127.0.0.1 only', () => {
  assert.equal(HOST, '127.0.0.1');
  assert.equal(server.address().address, '127.0.0.1');
});

test('GET / returns index.html as html', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/html/);
  assert.equal(await res.text(), '<!doctype html><title>pomo</title>');
});

test('static files get js and css content types', async () => {
  const js = await fetch(`${base}/app.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /^text\/javascript/);
  const css = await fetch(`${base}/style.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /^text\/css/);
});

test('a missing file is 404', async () => {
  const res = await fetch(`${base}/nope.html`);
  assert.equal(res.status, 404);
});

// Scenario: Path traversal is blocked
for (const path of [
  '/../server.js',
  '/%2e%2e/server.js',
  '/..%2fserver.js',
  '/%2e%2e%2fserver.js',
  '/..%5cserver.js',
  '/%2e%2e%5cserver.js',
  '/a/../../server.js',
]) {
  test(`path traversal ${path} is refused`, async () => {
    const res = await rawGet(path);
    assert.ok([403, 404].includes(res.status), `status ${res.status}`);
    assert.ok(!res.body.includes(SECRET));
  });
}

test('bad percent-encoding is 400', async () => {
  const res = await rawGet('/%E0%A4%A');
  assert.equal(res.status, 400);
});

test('presets: GET, POST, duplicate POST and DELETE round-trip', async () => {
  let res = await fetch(`${base}/api/presets`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, presets: [] });

  res = await fetch(`${base}/api/presets`, json('POST', { minutes: 25 }));
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.equal(created.ok, true);
  assert.equal(created.preset.minutes, 25);
  assert.equal(created.preset.label, '25 min');
  assert.match(created.preset.id, /^custom-/);

  res = await fetch(`${base}/api/presets`, json('POST', { minutes: 25, label: 'again' }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, preset: created.preset });

  res = await fetch(`${base}/api/presets`);
  assert.deepEqual(await res.json(), { ok: true, presets: [created.preset] });

  res = await fetch(`${base}/api/presets/${encodeURIComponent(created.preset.id)}`, { method: 'DELETE' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });

  res = await fetch(`${base}/api/presets`);
  assert.deepEqual(await res.json(), { ok: true, presets: [] });

  res = await fetch(`${base}/api/presets/${encodeURIComponent(created.preset.id)}`, { method: 'DELETE' });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).ok, false);
});

// Scenario: Built-ins cannot be removed
test('deleting a built-in preset is refused with 400', async () => {
  const res = await fetch(`${base}/api/presets/builtin-15`, { method: 'DELETE' });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(typeof body.error, 'string');
});

test('settings: GET and PUT round-trip', async () => {
  let res = await fetch(`${base}/api/settings`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, settings: {} });

  res = await fetch(`${base}/api/settings`, json('PUT', { lastDurationSeconds: 1200 }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, settings: { lastDurationSeconds: 1200 } });

  res = await fetch(`${base}/api/settings`);
  assert.deepEqual(await res.json(), { ok: true, settings: { lastDurationSeconds: 1200 } });
});

// Scenario: Bad body is rejected
test('bad bodies are rejected with 400 and nothing is saved', async () => {
  const before = await (await fetch(`${base}/api/presets`)).json();
  for (const body of ['{not json', '', { minutes: 0 }, { minutes: 'abc' }, [25], 'null']) {
    const res = await fetch(`${base}/api/presets`, json('POST', body));
    assert.equal(res.status, 400, `body ${JSON.stringify(body)}`);
    const out = await res.json();
    assert.equal(out.ok, false);
    assert.equal(typeof out.error, 'string');
  }
  const afterList = await (await fetch(`${base}/api/presets`)).json();
  assert.deepEqual(afterList, before);

  const settingsBefore = await (await fetch(`${base}/api/settings`)).json();
  for (const body of ['{not json', { lastDurationSeconds: 0 }, { lastDurationSeconds: 'abc' }]) {
    const res = await fetch(`${base}/api/settings`, json('PUT', body));
    assert.equal(res.status, 400);
  }
  assert.deepEqual(await (await fetch(`${base}/api/settings`)).json(), settingsBefore);
});

test('a body over 10 KB is refused', async () => {
  const big = JSON.stringify({ minutes: 5, label: 'x'.repeat(11 * 1024) });
  const res = await fetch(`${base}/api/presets`, json('POST', big));
  assert.ok([400, 413].includes(res.status), `status ${res.status}`);
  const list = await (await fetch(`${base}/api/presets`)).json();
  assert.equal(list.presets.some((p) => p.minutes === 5), false);
});

test('unknown api routes and wrong methods are 404 or 405', async () => {
  let res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
  res = await fetch(`${base}/api/presets`, { method: 'PUT' });
  assert.equal(res.status, 405);
});
