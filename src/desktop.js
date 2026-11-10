// Desktop helpers for the Electron main process: window options and the data
// folder. Pure functions with no electron import, so tests run in plain Node.

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
