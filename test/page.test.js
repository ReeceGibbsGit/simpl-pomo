import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

const LONG_DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

const hasId = (html, id) => new RegExp(`\\bid="${id}"`).test(html);

test('index.html has the timer controls', async () => {
  const html = await read('index.html');
  for (const id of [
    'duration',
    'duration-message',
    'display',
    'start',
    'pause',
    'reset',
    'stop-alarm',
    'presets',
    'add-preset',
  ]) {
    assert.ok(hasId(html, id), `missing #${id}`);
  }
  assert.match(html, /<input[^>]*\bid="duration"/);
});

test('index.html has the hourglass SVG with top and bottom sand and a stream', async () => {
  const html = await read('index.html');
  assert.match(html, /<svg[^>]*\bid="hourglass"/);
  for (const id of ['sand-top', 'sand-bottom', 'sand-stream']) {
    assert.ok(hasId(html, id), `missing #${id}`);
  }
  assert.match(html, /<clipPath/);
});

test('index.html loads app.js as a module and style.css', async () => {
  const html = await read('index.html');
  assert.match(html, /<script[^>]*type="module"[^>]*src="\/?app\.js"|<script[^>]*src="\/?app\.js"[^>]*type="module"/);
  assert.match(html, /<link[^>]*href="\/?style\.css"/);
});

test('app.js imports timer-core.js', async () => {
  const js = await read('app.js');
  assert.match(js, /import\s*\{[^}]*\}\s*from\s*['"]\.\/timer-core\.js['"]/);
});

test('page files have no long dash characters', async () => {
  for (const name of ['index.html', 'app.js', 'style.css']) {
    const text = await read(name);
    assert.equal(LONG_DASHES.test(text), false, `${name} has a long dash`);
  }
});
