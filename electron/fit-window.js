// Fits a loaded window's content to the page so it opens with no scrollbar,
// capped to the screen work area. Gets `screen` passed in (from electron).

import { MIN_SIZE, fitContentSize } from '../src/desktop.js';

// Resolves once the page has stopped changing (no DOM changes for 150 ms,
// at most 1.5 s), so content the page fetches after load, such as custom
// presets, is in place before the page is measured.
const SETTLED = `new Promise((resolve) => {
  let quiet;
  const done = () => { observer.disconnect(); clearTimeout(quiet); clearTimeout(cap); requestAnimationFrame(() => resolve(true)); };
  const observer = new MutationObserver(() => { clearTimeout(quiet); quiet = setTimeout(done, 150); });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
  quiet = setTimeout(done, 150);
  const cap = setTimeout(done, 1500);
})`;

// Natural page size in CSS pixels. The body is a min-height: 100vh flex box
// that stretches .app to the window height, so neither scrollHeight nor the
// .app box shrink below the window. The height comes from the bottom of the
// last thing in .app plus the paddings, borders and margins below it.
const PAGE_SIZE = `(() => {
  const doc = document.documentElement;
  const app = document.querySelector('.app');
  const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]) || 0;
  const width = window.innerWidth + (doc.scrollWidth - doc.clientWidth);
  let height = doc.scrollHeight;
  const last = app && app.lastElementChild;
  if (last) {
    height = last.getBoundingClientRect().bottom + window.scrollY
      + px(last, 'marginBottom') + px(app, 'paddingBottom') + px(app, 'borderBottomWidth')
      + px(app, 'marginBottom') + px(document.body, 'paddingBottom');
  }
  return { width, height, dpr: window.devicePixelRatio };
})()`;

/**
 * @param {import('electron').BrowserWindow} win a window whose page has loaded
 * @param {import('electron').Screen} screen
 */
export async function fitWindowToPage(win, screen) {
  const display = screen.getDisplayMatching(win.getBounds());
  const [outerWidth, outerHeight] = win.getSize();
  const [contentWidth, contentHeight] = win.getContentSize();
  const frame = { width: outerWidth - contentWidth, height: outerHeight - contentHeight };

  await win.webContents.executeJavaScript(SETTLED);

  // Two passes: a scrollbar showing during the first one can make the
  // page wrap a little taller than it is once the scrollbar is gone.
  for (let pass = 0; pass < 2; pass += 1) {
    const page = await win.webContents.executeJavaScript(PAGE_SIZE);
    // CSS pixels to window (DIP) pixels; they differ only with page zoom.
    const scale = page.dpr / display.scaleFactor;
    const size = fitContentSize({
      content: { width: page.width * scale, height: page.height * scale },
      workArea: display.workAreaSize,
      frame,
      min: MIN_SIZE,
    });
    // The minimum from windowOptions is a content size. Only lower it on a
    // screen too small for it (setMinimumSize takes a window size).
    if (size.width < MIN_SIZE.width || size.height < MIN_SIZE.height) {
      win.setMinimumSize(Math.min(MIN_SIZE.width, size.width), Math.min(MIN_SIZE.height, size.height));
    }
    win.setContentSize(size.width, size.height);
  }
}
