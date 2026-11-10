// Pure timer logic shared by the browser page and the Node tests.
// No DOM and no node:* imports here.

const MAX_SECONDS = 24 * 60 * 60;
const INVALID_DURATION =
  'That duration is not valid. Use minutes (25 or 1.5), mm:ss (2:30) or h:mm:ss (1:05:00), more than zero and at most 24 hours.';

const MINUTES_RE = /^\d+(\.\d+)?$|^\.\d+$/;
const CLOCK_RE = /^\d+(:\d{1,2}){1,2}$/;

function invalid() {
  return { ok: false, error: INVALID_DURATION };
}

/**
 * Parse a typed duration.
 * Accepts minutes (`25`, `1.5`), `mm:ss` (`2:30`) or `h:mm:ss` (`1:05:00`).
 * @param {unknown} text
 * @returns {{ ok: true, seconds: number } | { ok: false, error: string }}
 */
export function parseDuration(text) {
  if (typeof text !== 'string') return invalid();
  const value = text.trim();
  let seconds;
  if (MINUTES_RE.test(value)) {
    seconds = Math.round(Number(value) * 60);
  } else if (CLOCK_RE.test(value)) {
    const parts = value.split(':').map(Number);
    const secs = parts[parts.length - 1];
    if (secs > 59) return invalid();
    if (parts.length === 3) {
      const [h, m] = parts;
      if (m > 59) return invalid();
      seconds = h * 3600 + m * 60 + secs;
    } else {
      seconds = parts[0] * 60 + secs;
    }
  } else {
    return invalid();
  }
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_SECONDS) return invalid();
  return { ok: true, seconds };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Format seconds as `mm:ss`, or `h:mm:ss` at one hour or more.
 * Fractional seconds round up; negative values show `00:00`.
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

// Timer state model. Every function returns a new state; `now` is a
// Date.now()-style millisecond clock reading, so remaining time comes from
// the clock and not from counting ticks.

/**
 * @typedef {{ durationMs: number, leftMs: number, running: boolean, endAt: number | null }} TimerState
 */

/**
 * @param {number} durationSeconds
 * @returns {TimerState}
 */
export function createTimer(durationSeconds) {
  const durationMs = Math.max(0, Number(durationSeconds) || 0) * 1000;
  return { durationMs, leftMs: durationMs, running: false, endAt: null };
}

/**
 * Remaining milliseconds at `now`, never below 0.
 * @param {TimerState} state
 * @param {number} now
 */
export function remainingMs(state, now) {
  if (state.running) return Math.max(0, state.endAt - now);
  return Math.max(0, state.leftMs);
}

/** Start or resume. @param {TimerState} state @param {number} now @returns {TimerState} */
export function start(state, now) {
  if (state.running) return { ...state };
  return { ...state, running: true, endAt: now + state.leftMs };
}

/** Pause, keeping the remaining time. @param {TimerState} state @param {number} now @returns {TimerState} */
export function pause(state, now) {
  if (!state.running) return { ...state };
  return { ...state, running: false, endAt: null, leftMs: remainingMs(state, now) };
}

/** Stop and restore the full duration. @param {TimerState} state @returns {TimerState} */
export function reset(state) {
  return { ...state, running: false, endAt: null, leftMs: state.durationMs };
}

/**
 * Hourglass sand split: top shrinks and bottom grows with elapsed time.
 * `flowing` is true only while running with time left (the falling stream).
 * @param {TimerState} state
 * @param {number} now
 * @returns {{ top: number, bottom: number, flowing: boolean }}
 */
export function sandFractions(state, now) {
  const left = remainingMs(state, now);
  const top = state.durationMs > 0 ? Math.min(1, left / state.durationMs) : 0;
  return { top, bottom: 1 - top, flowing: state.running && left > 0 };
}

// Presets. Shape: { id, minutes, label }. Built-ins are fixed here and never
// stored; custom presets get their id from storage.

const BUILTIN_PREFIX = 'builtin-';
const MAX_PRESET_MINUTES = 1440;
const MAX_LABEL_LENGTH = 40;

/** @type {ReadonlyArray<Readonly<{ id: string, minutes: number, label: string }>>} */
export const BUILTIN_PRESETS = Object.freeze(
  [15, 30, 45, 60].map((minutes) =>
    Object.freeze({ id: `${BUILTIN_PREFIX}${minutes}`, minutes, label: `${minutes} min` }),
  ),
);

/** @param {unknown} id */
export function isBuiltinPresetId(id) {
  return typeof id === 'string' && id.startsWith(BUILTIN_PREFIX);
}

/**
 * Validate and clean a custom preset body `{ minutes, label? }`.
 * @param {unknown} input
 * @returns {{ ok: true, preset: { minutes: number, label: string } } | { ok: false, error: string }}
 */
export function normalisePreset(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'A preset needs a minutes value.' };
  }
  const { minutes, label } = /** @type {{ minutes?: unknown, label?: unknown }} */ (input);
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_PRESET_MINUTES) {
    return { ok: false, error: `Preset minutes must be a number more than 0 and at most ${MAX_PRESET_MINUTES}.` };
  }
  const trimmed = typeof label === 'string' ? label.trim().slice(0, MAX_LABEL_LENGTH).trim() : '';
  return { ok: true, preset: { minutes, label: trimmed || `${minutes} min` } };
}
