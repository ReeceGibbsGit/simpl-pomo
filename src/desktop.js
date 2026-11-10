// Desktop helpers for the Electron main process: window options, the data
// folder, navigation checks and the local server. No electron import, so
// tests run in plain Node.

import { createServer, listen, HOST } from './app-server.js';

// Matches --bg in public/style.css so the window does not flash white.
const BACKGROUND = '#2b1d14';

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
    width: 440,
    height: 820,
    minWidth: 360,
    minHeight: 640,
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
