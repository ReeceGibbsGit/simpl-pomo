// JSON file storage for custom presets and settings.
// Files: <dataDir>/presets.json (custom presets only) and <dataDir>/settings.json.
// Missing or corrupt files read as the default value. Writes go to a temp
// file first and are then renamed into place. The data dir is created on write.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isBuiltinPresetId, normalisePreset } from '../public/timer-core.js';

const MAX_DURATION_SECONDS = 24 * 60 * 60;

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function cleanPresets(value) {
  if (!Array.isArray(value)) return [];
  const presets = [];
  for (const entry of value) {
    if (!entry || typeof entry.id !== 'string' || isBuiltinPresetId(entry.id)) continue;
    const result = normalisePreset(entry);
    if (result.ok) presets.push({ id: entry.id, ...result.preset });
  }
  return presets;
}

function isValidDuration(seconds) {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 && seconds <= MAX_DURATION_SECONDS;
}

function cleanSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return isValidDuration(value.lastDurationSeconds) ? { lastDurationSeconds: value.lastDurationSeconds } : {};
}

/**
 * @param {string} dataDir folder that holds presets.json and settings.json
 */
export function createStorage(dataDir) {
  const presetsFile = join(dataDir, 'presets.json');
  const settingsFile = join(dataDir, 'settings.json');
  // Run changes one at a time so read-modify-write steps do not overlap.
  let queue = Promise.resolve();
  const serial = (task) => {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  };

  async function writeJson(file, value) {
    await mkdir(dataDir, { recursive: true });
    const tmp = `${file}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
    await rename(tmp, file);
  }

  const readPresets = async () => cleanPresets(await readJson(presetsFile, []));

  return {
    /** @returns {Promise<Array<{ id: string, minutes: number, label: string }>>} custom presets only */
    listPresets: () => readPresets(),

    /**
     * @param {unknown} input `{ minutes, label? }`
     * @returns {Promise<{ ok: true, created: boolean, preset: { id: string, minutes: number, label: string } } | { ok: false, error: string }>}
     */
    addPreset: (input) =>
      serial(async () => {
        const result = normalisePreset(input);
        if (!result.ok) return result;
        const presets = await readPresets();
        const existing = presets.find((p) => p.minutes === result.preset.minutes);
        if (existing) return { ok: true, created: false, preset: existing };
        const preset = { id: `custom-${randomUUID()}`, ...result.preset };
        await writeJson(presetsFile, [...presets, preset]);
        return { ok: true, created: true, preset };
      }),

    /**
     * @param {string} id
     * @returns {Promise<{ ok: true } | { ok: false, reason: 'builtin' | 'not-found' }>}
     */
    deletePreset: (id) =>
      serial(async () => {
        if (isBuiltinPresetId(id)) return { ok: false, reason: 'builtin' };
        const presets = await readPresets();
        const rest = presets.filter((p) => p.id !== id);
        if (rest.length === presets.length) return { ok: false, reason: 'not-found' };
        await writeJson(presetsFile, rest);
        return { ok: true };
      }),

    /** @returns {Promise<{ lastDurationSeconds?: number }>} */
    getSettings: async () => cleanSettings(await readJson(settingsFile, {})),

    /**
     * @param {unknown} input `{ lastDurationSeconds }`
     * @returns {Promise<{ ok: true, settings: { lastDurationSeconds: number } } | { ok: false, error: string }>}
     */
    saveSettings: (input) =>
      serial(async () => {
        if (!input || typeof input !== 'object' || !isValidDuration(input.lastDurationSeconds)) {
          return { ok: false, error: 'lastDurationSeconds must be a number more than 0 and at most 86400.' };
        }
        const settings = { lastDurationSeconds: input.lastDurationSeconds };
        await writeJson(settingsFile, settings);
        return { ok: true, settings };
      }),
  };
}
