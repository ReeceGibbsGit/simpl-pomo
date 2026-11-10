// HTTP server: static files from publicDir and a small JSON API backed by
// src/storage.js. Zero dependencies. Listens on 127.0.0.1 only.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createStorage } from './storage.js';

export const HOST = '127.0.0.1';
const BODY_LIMIT = 10 * 1024;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body, type) {
  res.writeHead(status, {
    'content-type': type,
    'content-length': Buffer.byteLength(body),
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), 'application/json; charset=utf-8');
}

function sendError(res, status, error) {
  sendJson(res, status, { ok: false, error });
}

// Reads the whole body (up to BODY_LIMIT) and parses it as JSON.
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) tooBig = true;
      else chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooBig) return reject(new HttpError(413, 'The request body is too large (limit 10 KB).'));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'The request body is not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, pathname, storage) {
  const method = req.method;

  if (pathname === '/api/presets') {
    if (method === 'GET') return sendJson(res, 200, { ok: true, presets: await storage.listPresets() });
    if (method === 'POST') {
      const result = await storage.addPreset(await readJsonBody(req));
      if (!result.ok) return sendError(res, 400, result.error);
      return sendJson(res, result.created ? 201 : 200, { ok: true, preset: result.preset });
    }
    return sendError(res, 405, 'Method not allowed.');
  }

  const match = /^\/api\/presets\/([^/]+)$/.exec(pathname);
  if (match) {
    if (method !== 'DELETE') return sendError(res, 405, 'Method not allowed.');
    const result = await storage.deletePreset(match[1]);
    if (result.ok) return sendJson(res, 200, { ok: true });
    if (result.reason === 'builtin') return sendError(res, 400, 'Built-in presets cannot be deleted.');
    return sendError(res, 404, 'That preset does not exist.');
  }

  if (pathname === '/api/settings') {
    if (method === 'GET') return sendJson(res, 200, { ok: true, settings: await storage.getSettings() });
    if (method === 'PUT') {
      const result = await storage.saveSettings(await readJsonBody(req));
      if (!result.ok) return sendError(res, 400, result.error);
      return sendJson(res, 200, { ok: true, settings: result.settings });
    }
    return sendError(res, 405, 'Method not allowed.');
  }

  return sendError(res, 404, 'Not found.');
}

async function handleStatic(req, res, pathname, publicDir) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain; charset=utf-8');
  const notFound = () => send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  if (pathname.includes('\0')) return notFound();

  const relativePath = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(publicDir, '.' + relativePath);
  const rel = path.relative(publicDir, file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
  }

  let body;
  try {
    if (!(await stat(file)).isFile()) return notFound();
    body = await readFile(file);
  } catch {
    return notFound();
  }
  const type = CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'content-length': body.length,
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

/**
 * @param {{ dataDir: string, publicDir: string }} options
 * @returns {http.Server} not yet listening; use `listen(server, port)`
 */
export function createServer({ dataDir, publicDir }) {
  const storage = createStorage(dataDir);
  const root = path.resolve(publicDir);

  return http.createServer(async (req, res) => {
    try {
      const rawPath = (req.url ?? '/').split('?')[0];
      let pathname;
      try {
        pathname = decodeURIComponent(rawPath);
      } catch {
        throw new HttpError(400, 'The request path is not valid.');
      }
      if (rawPath.startsWith('/api/')) await handleApi(req, res, pathname, storage);
      else await handleStatic(req, res, pathname, root);
    } catch (err) {
      if (res.headersSent) return res.destroy();
      if (err instanceof HttpError) sendError(res, err.status, err.message);
      else sendError(res, 500, 'Something went wrong on the server.');
    }
  });
}

/**
 * Listen on 127.0.0.1 only. Resolves once listening; rejects on errors
 * such as EADDRINUSE.
 * @param {http.Server} server
 * @param {number} port
 * @returns {Promise<http.Server>}
 */
export function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => reject(err);
    server.once('error', onError);
    server.listen(port, HOST, () => {
      server.off('error', onError);
      resolve(server);
    });
  });
}
