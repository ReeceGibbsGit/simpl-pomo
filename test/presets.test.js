import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_PRESETS, isBuiltinPresetId, normalisePreset, formatTime } from '../public/timer-core.js';

// Scenario: Preset sets the duration
test('built-in presets are 15, 30, 45 and 60 minutes with builtin-<n> ids', () => {
  assert.deepEqual(BUILTIN_PRESETS, [
    { id: 'builtin-15', minutes: 15, label: '15 min' },
    { id: 'builtin-30', minutes: 30, label: '30 min' },
    { id: 'builtin-45', minutes: 45, label: '45 min' },
    { id: 'builtin-60', minutes: 60, label: '60 min' },
  ]);
});

test('the 45 minute preset gives duration box 45 and display 45:00', () => {
  const p = BUILTIN_PRESETS.find((x) => x.id === 'builtin-45');
  assert.equal(String(p.minutes), '45');
  assert.equal(formatTime(p.minutes * 60), '45:00');
});

// Scenario: Built-ins cannot be removed
test('built-in presets cannot be changed', () => {
  assert.ok(Object.isFrozen(BUILTIN_PRESETS));
  assert.ok(BUILTIN_PRESETS.every((p) => Object.isFrozen(p)));
});

test('isBuiltinPresetId spots built-in ids only', () => {
  for (const p of BUILTIN_PRESETS) assert.equal(isBuiltinPresetId(p.id), true);
  assert.equal(isBuiltinPresetId('custom-abc'), false);
  assert.equal(isBuiltinPresetId(undefined), false);
});

// normalisePreset: valid input
test('normalisePreset accepts whole minutes with the default label', () => {
  assert.deepEqual(normalisePreset({ minutes: 25 }), { ok: true, preset: { minutes: 25, label: '25 min' } });
});

test('normalisePreset accepts decimal minutes and exactly 1440', () => {
  assert.deepEqual(normalisePreset({ minutes: 1.5 }), { ok: true, preset: { minutes: 1.5, label: '1.5 min' } });
  assert.deepEqual(normalisePreset({ minutes: 1440 }), { ok: true, preset: { minutes: 1440, label: '1440 min' } });
});

test('normalisePreset trims the label and cuts it to 40 characters', () => {
  assert.deepEqual(normalisePreset({ minutes: 25, label: '  Focus  ' }), {
    ok: true,
    preset: { minutes: 25, label: 'Focus' },
  });
  const long = 'x'.repeat(60);
  assert.equal(normalisePreset({ minutes: 25, label: long }).preset.label, 'x'.repeat(40));
});

test('normalisePreset uses the default label for a blank or non-string label', () => {
  assert.equal(normalisePreset({ minutes: 25, label: '   ' }).preset.label, '25 min');
  assert.equal(normalisePreset({ minutes: 25, label: 7 }).preset.label, '25 min');
});

// Scenario: Invalid custom preset is refused
for (const minutes of [0, -5, '25', 'abc', NaN, Infinity, 1441, null, undefined]) {
  test(`normalisePreset refuses minutes ${String(minutes)} with a message`, () => {
    const result = normalisePreset({ minutes });
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, 'string');
    assert.ok(result.error.length > 0);
    assert.equal('preset' in result, false);
  });
}

test('normalisePreset refuses a non-object body', () => {
  for (const body of [null, undefined, 25, 'x', []]) {
    assert.equal(normalisePreset(body).ok, false);
  }
});
