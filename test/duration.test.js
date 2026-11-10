import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration, formatTime } from '../public/timer-core.js';

// Scenario: Minutes are accepted
test('parseDuration accepts whole minutes: 25 -> 1500 seconds', () => {
  assert.deepEqual(parseDuration('25'), { ok: true, seconds: 1500 });
});

test('parseDuration accepts decimal minutes: 1.5 -> 90 seconds', () => {
  assert.deepEqual(parseDuration('1.5'), { ok: true, seconds: 90 });
});

test('parseDuration trims surrounding spaces', () => {
  assert.deepEqual(parseDuration('  25 '), { ok: true, seconds: 1500 });
});

// Scenario: mm:ss is accepted
test('parseDuration accepts mm:ss: 2:30 -> 150 seconds', () => {
  assert.deepEqual(parseDuration('2:30'), { ok: true, seconds: 150 });
});

test('parseDuration accepts mm:ss: 25:00 -> 1500 seconds', () => {
  assert.deepEqual(parseDuration('25:00'), { ok: true, seconds: 1500 });
});

// Scenario: h:mm:ss is accepted
test('parseDuration accepts h:mm:ss: 1:05:00 -> 3900 seconds', () => {
  assert.deepEqual(parseDuration('1:05:00'), { ok: true, seconds: 3900 });
});

test('parseDuration accepts exactly 24 hours', () => {
  assert.deepEqual(parseDuration('24:00:00'), { ok: true, seconds: 86400 });
});

// Scenario: Invalid input is rejected
for (const input of ['abc', '0', '-5', '', '   ', '25:00:00', '2:75', '1:60:00', '1:2:3:4', '1e3', '0:00', undefined, null]) {
  test(`parseDuration rejects ${JSON.stringify(input)} with a message`, () => {
    const result = parseDuration(input);
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, 'string');
    assert.match(result.error, /not valid/i);
    assert.equal('seconds' in result, false);
  });
}

// Scenario: Remaining time shows while running (display format)
test('formatTime shows mm:ss: 839 seconds -> 13:59', () => {
  assert.equal(formatTime(839), '13:59');
});

test('formatTime pads to 00:00 at zero', () => {
  assert.equal(formatTime(0), '00:00');
});

test('formatTime shows 45:00 and 30:00', () => {
  assert.equal(formatTime(2700), '45:00');
  assert.equal(formatTime(1800), '30:00');
});

test('formatTime shows h:mm:ss at one hour or more', () => {
  assert.equal(formatTime(3600), '1:00:00');
  assert.equal(formatTime(3900), '1:05:00');
  assert.equal(formatTime(3599), '59:59');
});

test('formatTime rounds fractional seconds up and never shows below zero', () => {
  assert.equal(formatTime(838.2), '13:59');
  assert.equal(formatTime(-3), '00:00');
});
