import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as desktop from '../src/desktop.js';

// Scenario: Secure defaults
test('window options keep the renderer locked down by default', () => {
  const { webPreferences } = desktop.windowOptions({ env: {} });
  assert.equal(webPreferences.contextIsolation, true);
  assert.equal(webPreferences.nodeIntegration, false);
  assert.equal(webPreferences.sandbox, true);
});

test('only the value 1 turns the sandbox off', () => {
  for (const value of ['0', '', 'true', 'yes']) {
    const { webPreferences } = desktop.windowOptions({ env: { SIMPL_POMO_DISABLE_SANDBOX: value } });
    assert.equal(webPreferences.sandbox, true, `value ${JSON.stringify(value)}`);
  }
});

test('window options keep the alarm on time in the background', () => {
  const { webPreferences } = desktop.windowOptions({ env: {} });
  assert.equal(webPreferences.backgroundThrottling, false);
  assert.equal(webPreferences.autoplayPolicy, 'no-user-gesture-required');
});

// Scenario: Sandbox opt-out
test('SIMPL_POMO_DISABLE_SANDBOX=1 turns off only the sandbox', () => {
  const { webPreferences } = desktop.windowOptions({ env: { SIMPL_POMO_DISABLE_SANDBOX: '1' } });
  assert.equal(webPreferences.sandbox, false);
  assert.equal(webPreferences.contextIsolation, true);
  assert.equal(webPreferences.nodeIntegration, false);
});

// Scenario: Window shape
test('the window is compact, has a minimum size and hides the menu bar', () => {
  const options = desktop.windowOptions({ env: {} });
  assert.equal(typeof options.width, 'number');
  assert.equal(typeof options.height, 'number');
  assert.ok(options.width > 0 && options.width <= 600, `width ${options.width}`);
  assert.ok(options.height > 0 && options.height <= 1000, `height ${options.height}`);
  assert.ok(options.minWidth > 0 && options.minWidth <= options.width);
  assert.ok(options.minHeight > 0 && options.minHeight <= options.height);
  assert.equal(options.autoHideMenuBar, true);
  assert.equal(options.title, undefined);
});

// Scenario: Data folder location
test('data is saved under <userData>/data on Windows paths', () => {
  assert.equal(
    desktop.dataDirFor('C:\\Users\\me\\AppData\\Roaming\\simpl-pomo', path.win32.join),
    'C:\\Users\\me\\AppData\\Roaming\\simpl-pomo\\data',
  );
});

test('data is saved under <userData>/data on posix paths', () => {
  assert.equal(
    desktop.dataDirFor('/Users/me/Library/Application Support/simpl-pomo', path.posix.join),
    '/Users/me/Library/Application Support/simpl-pomo/data',
  );
});
