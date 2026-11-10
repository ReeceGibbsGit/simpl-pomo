// Electron main process: `npm start`. Starts the local server on a free
// 127.0.0.1 port and shows the page in one small window locked to that origin.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Menu, dialog, screen } from 'electron';
import { dataDirFor, isAppUrl, startLocalServer, windowOptions } from '../src/desktop.js';
import { fitWindowToPage } from './fit-window.js';

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
  win.on('closed', () => {
    win = null;
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url, origin)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // loadURL resolves on did-finish-load. Fit the window to the page while it
  // is still hidden, then show it, so it opens with no scrollbar.
  await win.loadURL(started.url);
  await fitWindowToPage(win, screen);
  win.show();
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
