# simpl-pomo

A quick and simple local pomodoro timer with an old-style hourglass display.

- Type any duration: minutes (`25`, `1.5`), `mm:ss` (`2:30`) or `h:mm:ss` (`1:05:00`), up to 24 hours.
- Built-in presets for 15, 30, 45 and 60 minutes, plus your own presets (add from the duration box, delete with `x`).
- Start, pause, resume and reset. The sand drains as time passes.
- An alarm sounds when the time is up. Press Stop alarm, Reset or Start to stop it.
- The last duration you started is remembered.

## Requirements

Node.js 24 or newer. There are no npm dependencies, so there is nothing to install.

## Run

```sh
npm start
```

Then open http://127.0.0.1:4321 in your browser.

The server listens on `127.0.0.1` only. To use another port, set `PORT`:

```sh
PORT=4322 npm start          # bash
$env:PORT=4322; npm start    # PowerShell
```

If the port is already in use, the server says so and exits.

## Test

```sh
npm test
```

This runs Node's built-in test runner over `test/*.test.js`.

## Data

Custom presets and settings are saved as JSON files in `data/` next to `server.js`:

- `data/presets.json` - your custom presets
- `data/settings.json` - the last duration you started

The folder is created on first save and is gitignored. Delete it to start fresh.
