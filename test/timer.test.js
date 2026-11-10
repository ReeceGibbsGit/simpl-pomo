import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTimer,
  start,
  pause,
  reset,
  remainingMs,
  sandFractions,
  formatTime,
} from '../public/timer-core.js';

const MIN = 60 * 1000;
const show = (state, now) => formatTime(remainingMs(state, now) / 1000);

// Scenario: Remaining time shows while running
test('15 minute timer started 61 seconds ago shows 13:59', () => {
  const t0 = 1_000_000;
  const running = start(createTimer(15 * 60), t0);
  assert.equal(remainingMs(running, t0 + 61_000), 15 * MIN - 61_000);
  assert.equal(show(running, t0 + 61_000), '13:59');
});

test('a new timer is stopped with the full duration left', () => {
  const t = createTimer(15 * 60);
  assert.equal(t.running, false);
  assert.equal(t.durationMs, 15 * MIN);
  assert.equal(remainingMs(t, 123), 15 * MIN);
  assert.equal(show(t, 123), '15:00');
});

test('remaining time never goes below zero', () => {
  const running = start(createTimer(60), 0);
  assert.equal(remainingMs(running, 10 * MIN), 0);
  assert.equal(show(running, 10 * MIN), '00:00');
});

// Scenario: Pause keeps the remaining time
test('pause keeps the remaining time and resume counts down from it', () => {
  const t0 = 5_000;
  const running = start(createTimer(15 * 60), t0);
  const pausedAt = t0 + 5 * MIN; // 10:00 left
  const paused = pause(running, pausedAt);
  assert.equal(paused.running, false);
  assert.equal(show(paused, pausedAt), '10:00');
  assert.equal(show(paused, pausedAt + 30_000), '10:00');

  const resumedAt = pausedAt + 30_000;
  const resumed = start(paused, resumedAt);
  assert.equal(resumed.running, true);
  assert.equal(show(resumed, resumedAt), '10:00');
  assert.equal(show(resumed, resumedAt + 1_000), '09:59');
});

test('timer functions do not change the state they are given', () => {
  const t = createTimer(60);
  const running = start(t, 0);
  pause(running, 1_000);
  assert.equal(t.running, false);
  assert.equal(running.running, true);
  assert.equal(remainingMs(running, 1_000), 59_000);
});

// Scenario: Reset restores the full duration
test('reset of a running timer stops it and shows the full duration', () => {
  const running = start(createTimer(30 * 60), 0);
  const r = reset(running);
  assert.equal(r.running, false);
  assert.equal(show(r, 7 * MIN), '30:00');
});

test('reset of a paused timer stops it and shows the full duration', () => {
  const paused = pause(start(createTimer(30 * 60), 0), 4 * MIN);
  const r = reset(paused);
  assert.equal(r.running, false);
  assert.equal(show(r, 9 * MIN), '30:00');
});

// Scenario: Sand follows progress
test('25% elapsed puts 75% of the sand in the top and 25% in the bottom', () => {
  const running = start(createTimer(20 * 60), 0);
  const sand = sandFractions(running, 5 * MIN);
  assert.equal(sand.top, 0.75);
  assert.equal(sand.bottom, 0.25);
  assert.equal(sand.flowing, true);
});

// Scenario: Full and empty
test('a timer that has not started has all sand in the top and no stream', () => {
  const sand = sandFractions(createTimer(25 * 60), 999);
  assert.deepEqual(sand, { top: 1, bottom: 0, flowing: false });
});

test('at zero all sand is in the bottom and the stream stops', () => {
  const running = start(createTimer(60), 0);
  assert.deepEqual(sandFractions(running, 60_000), { top: 0, bottom: 1, flowing: false });
  assert.deepEqual(sandFractions(running, 90_000), { top: 0, bottom: 1, flowing: false });
});

test('a paused timer keeps its sand and has no stream', () => {
  const paused = pause(start(createTimer(100), 0), 50_000);
  assert.deepEqual(sandFractions(paused, 80_000), { top: 0.5, bottom: 0.5, flowing: false });
});
