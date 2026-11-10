// Page wiring: timer loop, hourglass drawing, alarm, presets and settings.
import {
  parseDuration,
  formatTime,
  createTimer,
  start,
  pause,
  reset,
  remainingMs,
  sandFractions,
  BUILTIN_PRESETS,
  normalisePreset,
} from './timer-core.js';

const $ = (id) => document.getElementById(id);
const els = {
  display: $('display'),
  status: $('status'),
  form: $('duration-form'),
  duration: $('duration'),
  message: $('duration-message'),
  start: $('start'),
  pause: $('pause'),
  reset: $('reset'),
  stopAlarm: $('stop-alarm'),
  presets: $('presets'),
  addPreset: $('add-preset'),
  sandTop: $('sand-top'),
  sandBottom: $('sand-bottom'),
  stream: $('sand-stream'),
};

const APP_TITLE = 'simpl-pomo';
const TIMES_UP = "Time's up";

// Hourglass geometry (matches the SVG in index.html).
const NECK_Y = 160;
const TOP_FULL_Y = 60;
const BASE_Y = 286;
const BOTTOM_FULL_Y = 186;

let timer = createTimer(25 * 60);
let inputChanged = false; // duration box edited since the timer was set
let frame = 0;
let interval = 0;

// ---------- small helpers ----------

/** Seconds to the text the duration box shows: whole minutes as `20`, else mm:ss / h:mm:ss. */
function durationToInput(seconds) {
  return seconds % 60 === 0 ? String(seconds / 60) : formatTime(seconds);
}

function showMessage(text, kind = 'error') {
  els.message.textContent = text;
  els.message.classList.toggle('info', kind === 'info');
  els.duration.setAttribute('aria-invalid', text && kind === 'error' ? 'true' : 'false');
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = { ok: false, error: `The server replied with ${res.status}.` };
  }
  return { status: res.status, ...data };
}

function serverDown() {
  showMessage('Could not reach the simpl-pomo server. Is it still running?');
}

// ---------- drawing ----------

function drawHourglass(now) {
  const { top, bottom, flowing } = sandFractions(timer, now);
  const topHeight = (NECK_Y - TOP_FULL_Y) * top;
  els.sandTop.setAttribute('y', String(NECK_Y - topHeight));
  els.sandTop.setAttribute('height', String(topHeight));
  els.sandTop.dataset.fraction = top.toFixed(3);

  const surface = BASE_Y - (BASE_Y - BOTTOM_FULL_Y) * bottom;
  const mound = bottom > 0 ? Math.min(10, 40 * bottom) : 0;
  els.sandBottom.setAttribute(
    'd',
    `M40,${BASE_Y} V${surface + mound} Q100,${surface - mound} 160,${surface + mound} V${BASE_Y} Z`,
  );
  els.sandBottom.dataset.fraction = bottom.toFixed(3);

  els.stream.setAttribute('y2', String(Math.max(NECK_Y, surface - mound)));
  els.stream.classList.toggle('flowing', flowing);
}

function render() {
  const now = Date.now();
  const text = formatTime(remainingMs(timer, now) / 1000);
  els.display.textContent = text;
  drawHourglass(now);

  const paused = !timer.running && timer.leftMs > 0 && timer.leftMs < timer.durationMs;
  els.start.textContent = paused && !inputChanged ? 'Resume' : 'Start';
  els.pause.disabled = !timer.running;
  if (!alarm.titleTimer) document.title = timer.running ? `${text} - ${APP_TITLE}` : APP_TITLE;
}

// ---------- timer loop ----------

function tick() {
  if (timer.running && remainingMs(timer, Date.now()) <= 0) {
    timer = pause(timer, Date.now());
    stopLoop();
    timeUp();
  }
  render();
}

function loop() {
  tick();
  if (timer.running) frame = requestAnimationFrame(loop);
}

function startLoop() {
  stopLoop();
  frame = requestAnimationFrame(loop);
  // rAF pauses in background tabs; this keeps the alarm on time there.
  interval = setInterval(tick, 250);
}

function stopLoop() {
  cancelAnimationFrame(frame);
  clearInterval(interval);
  frame = 0;
  interval = 0;
}

// ---------- alarm (Web Audio, no audio file) ----------

const ALARM_MAX_MS = 30_000;
const alarm = { ctx: null, repeat: 0, stopAfter: 0, titleTimer: 0, nodes: new Set() };

function audioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!alarm.ctx) alarm.ctx = new Ctx();
  if (alarm.ctx.state === 'suspended') alarm.ctx.resume().catch(() => {});
  return alarm.ctx;
}

function beep(ctx, at, freq) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.4, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.25);
  alarm.nodes.add(osc);
  osc.onended = () => alarm.nodes.delete(osc);
}

function beepPattern() {
  const ctx = alarm.ctx;
  if (!ctx) return;
  const t = ctx.currentTime + 0.05;
  beep(ctx, t, 880);
  beep(ctx, t + 0.3, 880);
  beep(ctx, t + 0.6, 1175);
}

function startAlarm() {
  stopAlarm();
  audioContext();
  beepPattern();
  alarm.repeat = setInterval(beepPattern, 1500);
  alarm.stopAfter = setTimeout(stopAlarm, ALARM_MAX_MS);
  let flip = false;
  document.title = TIMES_UP;
  alarm.titleTimer = setInterval(() => {
    flip = !flip;
    document.title = flip ? `00:00 - ${APP_TITLE}` : TIMES_UP;
  }, 1000);
  els.stopAlarm.hidden = false;
}

function stopAlarm() {
  clearInterval(alarm.repeat);
  clearTimeout(alarm.stopAfter);
  clearInterval(alarm.titleTimer);
  alarm.repeat = 0;
  alarm.stopAfter = 0;
  alarm.titleTimer = 0;
  for (const osc of alarm.nodes) {
    try {
      osc.stop();
    } catch {
      // already stopped
    }
  }
  alarm.nodes.clear();
  els.stopAlarm.hidden = true;
  document.title = APP_TITLE;
}

function timeUp() {
  els.status.textContent = TIMES_UP;
  startAlarm();
}

// ---------- actions ----------

/** Set a new, stopped timer from a duration in seconds. */
function setDuration(seconds) {
  stopLoop();
  stopAlarm();
  timer = createTimer(seconds);
  inputChanged = false;
  els.status.textContent = '';
  render();
}

function onStart() {
  stopAlarm();
  audioContext(); // created on a click so the alarm may play later
  els.status.textContent = '';
  const paused = !timer.running && timer.leftMs > 0 && timer.leftMs < timer.durationMs;
  if (timer.running) return;
  if (!(paused && !inputChanged)) {
    const parsed = parseDuration(els.duration.value);
    if (!parsed.ok) {
      showMessage(parsed.error);
      render();
      return;
    }
    timer = createTimer(parsed.seconds);
    inputChanged = false;
    saveLastDuration(parsed.seconds);
  }
  showMessage('');
  timer = start(timer, Date.now());
  startLoop();
  render();
}

function onPause() {
  if (!timer.running) return;
  timer = pause(timer, Date.now());
  stopLoop();
  render();
}

function onReset() {
  stopLoop();
  stopAlarm();
  timer = reset(timer);
  els.status.textContent = '';
  render();
}

function onDurationInput() {
  inputChanged = true;
  showMessage('');
  if (timer.running) return;
  const parsed = parseDuration(els.duration.value);
  if (parsed.ok) setDuration(parsed.seconds);
  else render();
}

async function saveLastDuration(seconds) {
  try {
    await api('PUT', '/api/settings', { lastDurationSeconds: seconds });
  } catch {
    serverDown();
  }
}

// ---------- presets ----------

let customPresets = [];

function presetButton(preset, custom) {
  const wrap = document.createElement('span');
  wrap.className = custom ? 'preset custom' : 'preset';

  const set = document.createElement('button');
  set.type = 'button';
  set.className = 'preset-set';
  set.textContent = preset.label;
  set.title = `Set ${durationToInput(Math.round(preset.minutes * 60))}`;
  set.addEventListener('click', () => {
    const seconds = Math.round(preset.minutes * 60);
    els.duration.value = durationToInput(seconds);
    showMessage('');
    setDuration(seconds);
  });
  wrap.append(set);

  if (custom) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'preset-delete';
    del.textContent = 'x';
    del.title = `Delete ${preset.label}`;
    del.setAttribute('aria-label', `Delete preset ${preset.label}`);
    del.addEventListener('click', () => deletePreset(preset));
    wrap.append(del);
  }
  return wrap;
}

function renderPresets() {
  const items = [
    ...BUILTIN_PRESETS.map((p) => presetButton(p, false)),
    ...[...customPresets].sort((a, b) => a.minutes - b.minutes).map((p) => presetButton(p, true)),
  ];
  els.presets.replaceChildren(...items);
}

async function loadPresets() {
  try {
    const res = await api('GET', '/api/presets');
    if (res.ok) customPresets = res.presets;
  } catch {
    serverDown();
  }
  renderPresets();
}

async function addPreset() {
  const parsed = parseDuration(els.duration.value);
  if (!parsed.ok) {
    showMessage(`No preset added. ${parsed.error}`);
    return;
  }
  const minutes = parsed.seconds / 60;
  const body = { minutes };
  if (!Number.isInteger(minutes)) body.label = `${Math.round(minutes * 100) / 100} min`;
  const check = normalisePreset(body);
  if (!check.ok) {
    showMessage(`No preset added. ${check.error}`);
    return;
  }
  try {
    const res = await api('POST', '/api/presets', body);
    if (!res.ok) {
      showMessage(`No preset added. ${res.error}`);
      return;
    }
    if (res.status === 201) {
      showMessage(`Added the ${res.preset.label} preset.`, 'info');
    } else {
      showMessage(`A ${res.preset.label} preset already exists.`, 'info');
    }
    await loadPresets();
  } catch {
    serverDown();
  }
}

async function deletePreset(preset) {
  try {
    const res = await api('DELETE', `/api/presets/${encodeURIComponent(preset.id)}`);
    if (!res.ok && res.status !== 404) {
      showMessage(res.error);
      return;
    }
    showMessage('');
    await loadPresets();
  } catch {
    serverDown();
  }
}

// ---------- start up ----------

async function restoreLastDuration() {
  try {
    const res = await api('GET', '/api/settings');
    const seconds = res.ok ? res.settings.lastDurationSeconds : undefined;
    if (typeof seconds === 'number' && !timer.running && !inputChanged) {
      els.duration.value = durationToInput(seconds);
      setDuration(seconds);
    }
  } catch {
    serverDown();
  }
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  onStart();
});
els.duration.addEventListener('input', onDurationInput);
els.start.addEventListener('click', onStart);
els.pause.addEventListener('click', onPause);
els.reset.addEventListener('click', onReset);
els.stopAlarm.addEventListener('click', stopAlarm);
els.addPreset.addEventListener('click', addPreset);

const initial = parseDuration(els.duration.value);
if (initial.ok) timer = createTimer(initial.seconds);
render();
renderPresets();
loadPresets();
restoreLastDuration();
