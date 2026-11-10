import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStorage } from '../src/storage.js';

let root;
let dataDir;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'simpl-pomo-'));
  dataDir = join(root, 'data');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// Scenario: First run with no data folder
test('with no data folder there are no custom presets, no settings and no error', async () => {
  const storage = createStorage(dataDir);
  assert.deepEqual(await storage.listPresets(), []);
  assert.deepEqual(await storage.getSettings(), {});
  await assert.rejects(readdir(dataDir), { code: 'ENOENT' });
});

test('the first write creates the data folder', async () => {
  const storage = createStorage(dataDir);
  await storage.addPreset({ minutes: 25 });
  const files = await readdir(dataDir);
  assert.ok(files.includes('presets.json'));
  assert.equal(files.some((f) => f.endsWith('.tmp')), false);
});

// Scenario: Corrupt file is tolerated
test('a corrupt presets.json reads as empty and the next save writes valid JSON', async () => {
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, 'presets.json'), '{not json', 'utf8');
  const storage = createStorage(dataDir);
  assert.deepEqual(await storage.listPresets(), []);

  await storage.addPreset({ minutes: 10 });
  const saved = JSON.parse(await readFile(join(dataDir, 'presets.json'), 'utf8'));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].minutes, 10);
});

test('a presets.json that is not a list, or holds bad entries, is tolerated', async () => {
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, 'presets.json'), '{"a":1}', 'utf8');
  assert.deepEqual(await createStorage(dataDir).listPresets(), []);

  await writeFile(
    join(dataDir, 'presets.json'),
    JSON.stringify([{ id: 'custom-1', minutes: 5, label: '5 min' }, { id: 'x', minutes: 0 }, null, 'junk']),
    'utf8',
  );
  assert.deepEqual(await createStorage(dataDir).listPresets(), [{ id: 'custom-1', minutes: 5, label: '5 min' }]);
});

test('a corrupt settings.json reads as empty', async () => {
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, 'settings.json'), 'nope', 'utf8');
  assert.deepEqual(await createStorage(dataDir).getSettings(), {});
});

// Scenario: Add a custom preset
test('an added preset gets an id, a default label, and is still there after reload', async () => {
  const result = await createStorage(dataDir).addPreset({ minutes: 25 });
  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.preset.minutes, 25);
  assert.equal(result.preset.label, '25 min');
  assert.equal(typeof result.preset.id, 'string');
  assert.match(result.preset.id, /^custom-/);

  const reloaded = createStorage(dataDir);
  assert.deepEqual(await reloaded.listPresets(), [result.preset]);
});

test('an added preset keeps a trimmed custom label', async () => {
  const result = await createStorage(dataDir).addPreset({ minutes: 50, label: '  Deep work ' });
  assert.equal(result.preset.label, 'Deep work');
});

// Scenario: Invalid custom preset is refused
test('an invalid preset is refused with a message and nothing is saved', async () => {
  const storage = createStorage(dataDir);
  for (const body of [{ minutes: 0 }, { minutes: 'abc' }, { minutes: -1 }, null]) {
    const result = await storage.addPreset(body);
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, 'string');
  }
  assert.deepEqual(await storage.listPresets(), []);
  await assert.rejects(readdir(dataDir), { code: 'ENOENT' });
});

// Scenario: Duplicate preset is ignored
test('adding the same minutes again returns the existing preset and adds nothing', async () => {
  const storage = createStorage(dataDir);
  const first = await storage.addPreset({ minutes: 25 });
  const second = await storage.addPreset({ minutes: 25, label: 'Again' });
  assert.equal(second.ok, true);
  assert.equal(second.created, false);
  assert.deepEqual(second.preset, first.preset);
  assert.equal((await createStorage(dataDir).listPresets()).length, 1);
});

// Scenario: Delete a custom preset
test('a deleted preset disappears and stays gone after reload', async () => {
  const storage = createStorage(dataDir);
  const keep = await storage.addPreset({ minutes: 10 });
  const gone = await storage.addPreset({ minutes: 25 });
  assert.deepEqual(await storage.deletePreset(gone.preset.id), { ok: true });
  assert.deepEqual(await createStorage(dataDir).listPresets(), [keep.preset]);
});

test('deleting an unknown id says not found', async () => {
  assert.deepEqual(await createStorage(dataDir).deletePreset('custom-nope'), { ok: false, reason: 'not-found' });
});

// Scenario: Built-ins cannot be removed
test('deleting a built-in preset is refused', async () => {
  assert.deepEqual(await createStorage(dataDir).deletePreset('builtin-15'), { ok: false, reason: 'builtin' });
});

// Scenario: Last duration is restored
test('the last duration is saved and restored after reload', async () => {
  const saved = await createStorage(dataDir).saveSettings({ lastDurationSeconds: 1200 });
  assert.deepEqual(saved, { ok: true, settings: { lastDurationSeconds: 1200 } });
  const settings = await createStorage(dataDir).getSettings();
  assert.deepEqual(settings, { lastDurationSeconds: 1200 });
  assert.equal(String(settings.lastDurationSeconds / 60), '20');
});

test('invalid settings are refused and nothing is saved', async () => {
  const storage = createStorage(dataDir);
  for (const body of [{ lastDurationSeconds: 0 }, { lastDurationSeconds: 'x' }, { lastDurationSeconds: 86401 }, null]) {
    const result = await storage.saveSettings(body);
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, 'string');
  }
  assert.deepEqual(await storage.getSettings(), {});
});
