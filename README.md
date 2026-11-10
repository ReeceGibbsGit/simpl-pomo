# simpl-pomo

A quick and simple local pomodoro timer with an old-style hourglass display.

- Type any duration: minutes (`25`, `1.5`), `mm:ss` (`2:30`) or `h:mm:ss` (`1:05:00`), up to 24 hours.
- Built-in presets for 15, 30, 45 and 60 minutes, plus your own presets (add from the duration box, delete with `x`).
- Start, pause, resume and reset. The sand drains as time passes.
- An alarm sounds when the time is up. Press Stop alarm, Reset or Start to stop it.
- The last duration you started is remembered.

## Requirements

Node.js 24 or newer. The only npm dependency is Electron (a dev dependency). Install it once:

```sh
npm install
```

This also downloads the Electron binary.

## Run

```sh
npm start
```

This opens the timer in a small desktop window with no menu bar. Close the window to quit. Starting it again while it is open brings the open window to the front.

Inside the app a local server listens on `127.0.0.1` only, on a free port picked at start. If it cannot start, a dialog says why and the app quits.

If the window does not open (some endpoint security tools stop sandboxed Electron windows from launching), turn off only the sandbox:

```sh
SIMPL_POMO_DISABLE_SANDBOX=1 npm start           # bash
$env:SIMPL_POMO_DISABLE_SANDBOX=1; npm start     # PowerShell
```

## Test

```sh
npm test
```

This runs Node's built-in test runner over `test/*.test.js`.

## Data

Custom presets and settings are saved as JSON files in a `data` folder inside the Electron user data folder (for example `%APPDATA%\simpl-pomo\data` on Windows, `~/Library/Application Support/simpl-pomo/data` on macOS):

- `presets.json` - your custom presets
- `settings.json` - the last duration you started

The folder is created on first save. Delete it to start fresh.

Presets saved by the old browser version in `data/` in the repo are not carried over. Add them again in the app if you want them.
