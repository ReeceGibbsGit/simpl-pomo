// Fits the Electron window to the page so it shows with no scrollbar, and
// refits when the page content changes size (for example presets added or
// deleted). No electron import: the window, screen, page and clock are
// passed in, so tests use fakes. measurePage, settle and watchContentSize
// run inside the page through executeJavaScript (see pageScript), so they
// must only use their arguments.

import { MIN_SIZE, fitContentSize } from './desktop.js';

// The page logs this line when its content changes size. Main reads it from
// the console-message event, so no preload or IPC is needed.
export const FIT_SIGNAL = 'simpl-pomo:content-resized';

/**
 * Natural page size in CSS pixels. The body is a min-height: 100vh flex box
 * that stretches .app to the window height, so neither scrollHeight nor the
 * .app box shrink below the window. The height comes from the bottom of the
 * last thing in .app plus the paddings, borders and margins below it.
 * @returns {{ width: number, height: number, dpr: number }}
 */
export function measurePage(win, doc) {
  const px = (el, prop) => parseFloat(win.getComputedStyle(el)[prop]) || 0;
  const root = doc.documentElement;
  const app = doc.querySelector('.app');
  const width = win.innerWidth + (root.scrollWidth - root.clientWidth);
  let height = root.scrollHeight;
  const last = app && app.lastElementChild;
  if (last) {
    height =
      last.getBoundingClientRect().bottom +
      win.scrollY +
      px(last, 'marginBottom') +
      px(app, 'paddingBottom') +
      px(app, 'borderBottomWidth') +
      px(app, 'marginBottom') +
      px(doc.body, 'paddingBottom');
  }
  return { width, height, dpr: win.devicePixelRatio };
}

/**
 * Resolves once the page has had no DOM changes for quietMs (at most maxMs),
 * so content the page fetches after load, such as custom presets, is in
 * place before it is measured.
 * @returns {Promise<true>}
 */
export function settle(win, doc, quietMs, maxMs) {
  return new Promise((resolve) => {
    let finished = false;
    let quiet = null;
    let cap = null;
    const done = () => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      win.clearTimeout(quiet);
      win.clearTimeout(cap);
      win.requestAnimationFrame(() => resolve(true));
    };
    const observer = new win.MutationObserver(() => {
      win.clearTimeout(quiet);
      quiet = win.setTimeout(done, quietMs);
    });
    observer.observe(doc.body, { childList: true, subtree: true, characterData: true, attributes: true });
    quiet = win.setTimeout(done, quietMs);
    cap = win.setTimeout(done, maxMs);
  });
}

/**
 * Logs `signal` whenever a child of .app changes size. The first report,
 * which every ResizeObserver sends when it starts, is skipped.
 * @returns {boolean} false when the page has no .app
 */
export function watchContentSize(win, doc, signal) {
  const app = doc.querySelector('.app');
  if (!app || !win.ResizeObserver) return false;
  let first = true;
  const observer = new win.ResizeObserver(() => {
    if (first) {
      first = false;
      return;
    }
    win.console.log(signal);
  });
  for (const child of app.children) observer.observe(child);
  return true;
}

/**
 * A script that runs `fn(window, document, ...args)` in the page.
 * @param {Function} fn a function that only uses its arguments
 * @param {...unknown} args JSON-safe values
 * @returns {string}
 */
export function pageScript(fn, ...args) {
  const rest = args.map((arg) => `, ${JSON.stringify(arg)}`).join('');
  return `(${fn.toString()})(window, document${rest})`;
}

/** Page calls for a real BrowserWindow. */
export function pageCalls(win) {
  const run = (fn, ...args) => win.webContents.executeJavaScript(pageScript(fn, ...args));
  return {
    measure: () => run(measurePage),
    settle: () => run(settle, 150, 1500),
    watch: () => run(watchContentSize, FIT_SIGNAL),
  };
}

/**
 * Sets the window's content size to the page size, capped to the screen work
 * area. Two passes: a scrollbar showing during the first one can make the
 * page wrap a little taller than it is once the scrollbar is gone.
 * @param {*} win a BrowserWindow (or a fake) whose page has loaded
 * @param {*} screen electron's screen (or a fake)
 * @param {{ measure: () => Promise<{ width: number, height: number, dpr: number }>,
 *   settle: () => Promise<unknown>, heightOnly?: boolean }} page
 * @returns {Promise<{ width: number, height: number }>}
 */
export async function fitWindowToPage(win, screen, { measure, settle: waitForPage, heightOnly = false }) {
  await waitForPage();
  const display = screen.getDisplayMatching(win.getBounds());
  const [outerWidth, outerHeight] = win.getSize();
  const [contentWidth, contentHeight] = win.getContentSize();
  const frame = { width: outerWidth - contentWidth, height: outerHeight - contentHeight };

  let size = { width: contentWidth, height: contentHeight };
  for (let pass = 0; pass < 2; pass += 1) {
    const page = await measure();
    // CSS pixels to window (DIP) pixels; they differ only with page zoom.
    const scale = page.dpr / display.scaleFactor;
    const [currentWidth, currentHeight] = win.getContentSize();
    size = fitContentSize({
      content: { width: heightOnly ? currentWidth : page.width * scale, height: page.height * scale },
      workArea: display.workAreaSize,
      frame,
      min: MIN_SIZE,
    });
    if (heightOnly) size.width = currentWidth;
    // The minimum from windowOptions is a content size. Only lower it on a
    // screen too small for it (setMinimumSize takes a window size).
    if (size.width < MIN_SIZE.width || size.height < MIN_SIZE.height) {
      win.setMinimumSize(Math.min(MIN_SIZE.width, size.width), Math.min(MIN_SIZE.height, size.height));
    }
    if (size.width !== currentWidth || size.height !== currentHeight) {
      win.setContentSize(size.width, size.height);
    }
  }
  return size;
}

/**
 * Refits the window (debounced) each time the page logs `signal`, until the
 * user resizes or maximises the window; after that it stays as they left it.
 * @param {{ win: *, refit: () => Promise<unknown>, signal?: string, debounceMs?: number,
 *   setTimer?: typeof setTimeout, clearTimer?: typeof clearTimeout }} options
 * @returns {{ readonly stopped: boolean }}
 */
export function createAutoFit({ win, refit, signal = FIT_SIGNAL, debounceMs = 100, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let stopped = false;
  let timer = null;

  const stop = () => {
    stopped = true;
    clearTimer(timer);
    timer = null;
  };
  // will-resize fires only for resizes the user makes, not setContentSize.
  win.on('will-resize', stop);
  win.on('maximize', stop);

  win.webContents.on('console-message', (event) => {
    if (stopped || !event || event.message !== signal) return;
    clearTimer(timer);
    timer = setTimer(async () => {
      timer = null;
      if (stopped || win.isDestroyed()) return;
      try {
        await refit();
      } catch {
        // A failed refit leaves the window as it is.
      }
    }, debounceMs);
  });

  return {
    get stopped() {
      return stopped;
    },
  };
}
