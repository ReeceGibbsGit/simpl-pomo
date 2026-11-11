// Desktop helpers for the Electron main process: window options, the data
// folder, navigation checks and the local server. No electron import, so
// tests run in plain Node.

import { createServer, listen, HOST } from './app-server.js';

// Matches --bg in public/style.css so the window does not flash white.
const BACKGROUND = '#2b1d14';

export const MIN_SIZE = { width: 360, height: 640 };

/**
 * Content size that shows the whole page with no scrollbar: the page size
 * rounded up, at least `min`, and at most the screen work area minus the
 * window frame (the work area wins over `min` on a very small screen).
 * @param {{
 *   content: { width: number, height: number },
 *   workArea: { width: number, height: number },
 *   frame?: { width: number, height: number },
 *   min?: { width: number, height: number },
 * }} options
 * @returns {{ width: number, height: number }}
 */
export function fitContentSize({ content, workArea, frame = { width: 0, height: 0 }, min = MIN_SIZE }) {
  // The small allowance stops float noise (700 * 1.1 = 770.0000000000001)
  // from adding a pixel.
  const fit = (want, least, most) => Math.max(1, Math.min(Math.max(Math.ceil(want - 0.001), least), Math.floor(most)));
  return {
    width: fit(content.width, min.width, workArea.width - frame.width),
    height: fit(content.height, min.height, workArea.height - frame.height),
  };
}

/**
 * @param {string} userDataDir Electron's app.getPath('userData')
 * @param {(...parts: string[]) => string} join path.join for the platform
 * @returns {string}
 */
export function dataDirFor(userDataDir, join) {
  return join(userDataDir, 'data');
}

/**
 * True only when url is on the app's own origin (same scheme, host and port).
 * A URL that does not parse is refused.
 * @param {string} url
 * @param {string} appOrigin for example http://127.0.0.1:5123
 * @returns {boolean}
 */
export function isAppUrl(url, appOrigin) {
  try {
    return new URL(url).origin === appOrigin;
  } catch {
    return false;
  }
}

/**
 * BrowserWindow options. SIMPL_POMO_DISABLE_SANDBOX=1 turns off only the
 * sandbox, for machines whose endpoint security blocks sandboxed renderers.
 * @param {{ env: Record<string, string | undefined> }} options
 */
export function windowOptions({ env }) {
  return {
    // Sizes are the page (content) size, not the outer frame. The main
    // process fits the content to the page after it loads.
    useContentSize: true,
    width: 472,
    height: 780,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: BACKGROUND,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: env.SIMPL_POMO_DISABLE_SANDBOX !== '1',
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  };
}

/**
 * Starts the existing server on 127.0.0.1 with a free port picked by the
 * system. Rejects if the server cannot listen.
 * @param {{ dataDir: string, publicDir: string }} options
 * @returns {Promise<{ server: import('node:http').Server, url: string }>}
 */
export async function startLocalServer({ dataDir, publicDir }) {
  const server = await listen(createServer({ dataDir, publicDir }), 0);
  return { server, url: `http://${HOST}:${server.address().port}/` };
}
