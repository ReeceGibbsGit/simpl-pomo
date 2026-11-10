// Electron main process: `npm start`. Starts the local server on a free
// 127.0.0.1 port and shows the page in one small window locked to that origin.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Menu, dialog } from 'electron';
import { dataDirFor, isAppUrl, startLocalServer, windowOptions } from '../src/desktop.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

let server = null;
let win = null;

async function start() {
  const dataDir = dataDirFor(app.getPath('userData'), path.join);
  const started = await startLocalServer({ dataDir, publicDir });
  server = started.server;
  const origin = new URL(started.url).origin;

  Menu.setApplicationMenu(null);
  win = new BrowserWindow(windowOptions({ env: process.env }));
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    win = null;
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url, origin)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  await win.loadURL(started.url);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.on('window-all-closed', () => app.quit());

  app.on('will-quit', () => {
    if (server) server.close();
  });

  app.whenReady().then(start).catch((err) => {
    dialog.showErrorBox('simpl-pomo could not start', (err && err.message) || String(err));
    app.quit();
  });
}
