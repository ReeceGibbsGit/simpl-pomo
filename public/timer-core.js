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
