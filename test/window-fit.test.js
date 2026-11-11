import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fit from '../src/window-fit.js';

// A tiny fake clock: timers run only when the test advances time.
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
    get pending() {
      return timers.size;
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

// A fake page shaped like public/index.html: body > .app > children.
function fakePage({ lastBottom = 700, scrollY = 0, styles = {}, innerWidth = 472, scrollWidth = 472, clientWidth = 472, scrollHeight = 900, withApp = true } = {}) {
  const last = { getBoundingClientRect: () => ({ bottom: lastBottom }), name: 'last' };
  const app = { lastElementChild: last, children: [{ name: 'h1' }, last], name: 'app' };
  const body = { name: 'body' };
  const doc = {
    body,
    documentElement: { scrollWidth, clientWidth, scrollHeight },
    querySelector: (sel) => (sel === '.app' && withApp ? app : null),
  };
  const win = {
    innerWidth,
    scrollY,
    devicePixelRatio: 1.25,
    getComputedStyle: (el) => styles[el.name] ?? {},
  };
  return { win, doc, app, last };
}

// Scenario: Window shape (the page is measured at its natural size)
test('measurePage takes the height from the last child of .app plus the space below it', () => {
  const { win, doc } = fakePage({
    lastBottom: 700.5,
    scrollY: 10,
    styles: {
      last: { marginBottom: '2px' },
      app: { paddingBottom: '24px', borderBottomWidth: '1px', marginBottom: '0px' },
      body: { paddingBottom: '24px' },
    },
  });
  assert.deepEqual(fit.measurePage(win, doc), { width: 472, height: 761.5, dpr: 1.25 });
});

test('measurePage adds any sideways overflow to the width', () => {
  const { win, doc } = fakePage({ innerWidth: 400, scrollWidth: 430, clientWidth: 385 });
  assert.equal(fit.measurePage(win, doc).width, 445);
});

test('measurePage falls back to scrollHeight when the page has no .app', () => {
  const { win, doc } = fakePage({ withApp: false, scrollHeight: 818 });
  assert.equal(fit.measurePage(win, doc).height, 818);
});

test('measurePage runs as an in-page script string', () => {
  const script = fit.pageScript(fit.measurePage);
  assert.match(script, /^\(function measurePage\(/);
  assert.match(script, /\)\(window, document\)$/);
  const { win, doc } = fakePage({ lastBottom: 500 });
  const run = new Function('window', 'document', `return ${script};`);
  assert.equal(run(win, doc).height, 500);
});

// Fake page timers and observers for settle and watchContentSize.
function fakePageWindow(clock) {
  const observers = [];
  const logs = [];
  class MutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.connected = false;
      observers.push(this);
    }
    observe() {
      this.connected = true;
    }
    disconnect() {
      this.connected = false;
    }
  }
  class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
      observers.push(this);
    }
    observe(target) {
      this.targets.push(target);
    }
  }
  return {
    observers,
    logs,
    win: {
      MutationObserver,
      ResizeObserver,
      setTimeout: (fn, ms) => clock.setTimeout(fn, ms),
      clearTimeout: (id) => clock.clearTimeout(id),
      requestAnimationFrame: (fn) => clock.setTimeout(fn, 0),
      console: { log: (text) => logs.push(text) },
    },
  };
}

// Scenario: Window shape (custom presets are in place before the fit)
test('settle resolves after the page has been quiet for the quiet period', async () => {
  const clock = fakeClock();
  const { win, observers } = fakePageWindow(clock);
  let settled = false;
  fit.settle(win, { body: {} }, 150, 1500).then(() => (settled = true));
  clock.advance(149);
  await flush();
  assert.equal(settled, false);
  clock.advance(1);
  await flush();
  assert.equal(settled, true);
  assert.equal(observers[0].connected, false);
  assert.equal(clock.pending, 0);
});

test('settle waits again after each page change', async () => {
  const clock = fakeClock();
  const { win, observers } = fakePageWindow(clock);
  let settled = false;
  fit.settle(win, { body: {} }, 150, 1500).then(() => (settled = true));
  clock.advance(100);
  observers[0].callback();
  clock.advance(100);
  await flush();
  assert.equal(settled, false);
  clock.advance(50);
  await flush();
  assert.equal(settled, true);
});

test('settle gives up waiting at the maximum even if the page keeps changing', async () => {
  const clock = fakeClock();
  const { win, observers } = fakePageWindow(clock);
  let settled = false;
  fit.settle(win, { body: {} }, 150, 1500).then(() => (settled = true));
  for (let t = 0; t < 1400; t += 100) {
    clock.advance(100);
    observers[0].callback();
  }
  await flush();
  assert.equal(settled, false);
  clock.advance(100);
  await flush();
  assert.equal(settled, true);
  assert.equal(clock.pending, 0);
});

// Scenario: Window refits when presets change
test('watchContentSize signals when a child of .app changes size, not on the first report', () => {
  const clock = fakeClock();
  const { win, observers, logs } = fakePageWindow(clock);
  const { doc, app } = fakePage();
  assert.equal(fit.watchContentSize(win, doc, 'signal-x'), true);
  const observer = observers[0];
  assert.deepEqual(observer.targets, app.children);
  observer.callback([]);
  assert.deepEqual(logs, []);
  observer.callback([]);
  assert.deepEqual(logs, ['signal-x']);
});

test('watchContentSize does nothing on a page without .app', () => {
  const clock = fakeClock();
  const { win } = fakePageWindow(clock);
  const { doc } = fakePage({ withApp: false });
  assert.equal(fit.watchContentSize(win, doc, 'signal-x'), false);
});

// Fake BrowserWindow and screen.
function fakeWindow({ content = [472, 780], frame = [16, 39], workArea = { width: 1920, height: 1040 }, scaleFactor = 1 } = {}) {
  const calls = [];
  const listeners = {};
  const contentListeners = {};
  let size = [...content];
  const win = {
    getBounds: () => ({ x: 0, y: 0, width: size[0] + frame[0], height: size[1] + frame[1] }),
    getSize: () => [size[0] + frame[0], size[1] + frame[1]],
    getContentSize: () => [...size],
    setContentSize: (w, h) => {
      calls.push(['setContentSize', w, h]);
      size = [w, h];
    },
    setMinimumSize: (w, h) => calls.push(['setMinimumSize', w, h]),
    isDestroyed: () => false,
    on: (name, fn) => (listeners[name] = fn),
    webContents: { on: (name, fn) => (contentListeners[name] = fn) },
  };
  const screen = {
    getDisplayMatching: () => ({ workAreaSize: workArea, scaleFactor }),
  };
  return { win, screen, calls, listeners, contentListeners };
}

// Scenario: Window shape (no scrollbar on open)
test('fitWindowToPage waits for the page, then sets the content to the page size in two passes', async () => {
  const { win, screen, calls } = fakeWindow();
  const order = [];
  const pages = [
    { width: 472, height: 818.2, dpr: 1 },
    { width: 472, height: 772, dpr: 1 },
  ];
  const size = await fit.fitWindowToPage(win, screen, {
    settle: async () => order.push('settle'),
    measure: async () => {
      order.push('measure');
      return pages.shift();
    },
  });
  assert.deepEqual(order, ['settle', 'measure', 'measure']);
  assert.deepEqual(calls, [
    ['setContentSize', 472, 819],
    ['setContentSize', 472, 772],
  ]);
  assert.deepEqual(size, { width: 472, height: 772 });
});

test('fitWindowToPage converts CSS pixels to window pixels under page zoom', async () => {
  const { win, screen, calls } = fakeWindow({ scaleFactor: 1.5 });
  await fit.fitWindowToPage(win, screen, {
    settle: async () => {},
    measure: async () => ({ width: 472, height: 700, dpr: 1.5 * 1.1 }),
  });
  assert.deepEqual(calls[0], ['setContentSize', 520, 770]);
});

test('fitWindowToPage caps the content to the work area minus the frame', async () => {
  const { win, screen, calls } = fakeWindow({ workArea: { width: 1366, height: 728 } });
  await fit.fitWindowToPage(win, screen, {
    settle: async () => {},
    measure: async () => ({ width: 472, height: 1200, dpr: 1 }),
  });
  assert.deepEqual(calls, [['setContentSize', 472, 689]]);
});

test('fitWindowToPage keeps the minimum size unless the screen is too small for it', async () => {
  const roomy = fakeWindow();
  await fit.fitWindowToPage(roomy.win, roomy.screen, {
    settle: async () => {},
    measure: async () => ({ width: 472, height: 772, dpr: 1 }),
  });
  assert.equal(roomy.calls.some(([name]) => name === 'setMinimumSize'), false);

  const tiny = fakeWindow({ workArea: { width: 336, height: 600 } });
  await fit.fitWindowToPage(tiny.win, tiny.screen, {
    settle: async () => {},
    measure: async () => ({ width: 472, height: 772, dpr: 1 }),
  });
  assert.deepEqual(tiny.calls[0], ['setMinimumSize', 320, 561]);
});

test('fitWindowToPage with heightOnly keeps the current width', async () => {
  const { win, screen, calls } = fakeWindow({ content: [500, 772] });
  await fit.fitWindowToPage(win, screen, {
    heightOnly: true,
    settle: async () => {},
    measure: async () => ({ width: 472, height: 960, dpr: 1 }),
  });
  assert.deepEqual(calls, [['setContentSize', 500, 960]]);
});

// Scenario: Window refits when presets change
test('autoFit refits once, after a short pause, when the page signals a size change', async () => {
  const clock = fakeClock();
  const { win, contentListeners } = fakeWindow();
  let fits = 0;
  fit.createAutoFit({ win, refit: async () => fits++, signal: 'signal-x', debounceMs: 100, setTimer: clock.setTimeout, clearTimer: clock.clearTimeout });
  contentListeners['console-message']({ message: 'signal-x' });
  clock.advance(50);
  contentListeners['console-message']({ message: 'signal-x' });
  clock.advance(99);
  assert.equal(fits, 0);
  clock.advance(1);
  await flush();
  assert.equal(fits, 1);
});

test('autoFit ignores other console messages', () => {
  const clock = fakeClock();
  const { win, contentListeners } = fakeWindow();
  let fits = 0;
  fit.createAutoFit({ win, refit: async () => fits++, signal: 'signal-x', setTimer: clock.setTimeout, clearTimer: clock.clearTimeout });
  contentListeners['console-message']({ message: 'hello' });
  contentListeners['console-message']({ message: 'signal-x and more' });
  clock.advance(1000);
  assert.equal(fits, 0);
  assert.equal(clock.pending, 0);
});

test('autoFit stops for the session once the user resizes or maximises the window', () => {
  for (const userEvent of ['will-resize', 'maximize']) {
    const clock = fakeClock();
    const { win, listeners, contentListeners } = fakeWindow();
    let fits = 0;
    const auto = fit.createAutoFit({ win, refit: async () => fits++, signal: 'signal-x', setTimer: clock.setTimeout, clearTimer: clock.clearTimeout });
    contentListeners['console-message']({ message: 'signal-x' });
    listeners[userEvent]();
    clock.advance(1000);
    contentListeners['console-message']({ message: 'signal-x' });
    clock.advance(1000);
    assert.equal(fits, 0, userEvent);
    assert.equal(auto.stopped, true, userEvent);
  }
});
