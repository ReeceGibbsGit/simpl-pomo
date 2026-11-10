// Entry point: `npm start`. Serves public/ and the JSON API on 127.0.0.1.
import { fileURLToPath } from 'node:url';
import { createServer, listen, HOST } from './src/app-server.js';

const appDir = fileURLToPath(new URL('.', import.meta.url));
const dataDir = fileURLToPath(new URL('./data/', import.meta.url));
const publicDir = fileURLToPath(new URL('./public/', import.meta.url));

const portText = process.env.PORT ?? '4321';
const port = Number(portText);
if (!/^\d+$/.test(portText) || port < 0 || port > 65535) {
  console.error(`PORT "${portText}" is not a valid port number.`);
  process.exit(1);
}

try {
  const server = await listen(createServer({ dataDir, publicDir }), port);
  console.log(`simpl-pomo is running at http://${HOST}:${server.address().port} (app folder ${appDir})`);
} catch (err) {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is in use. Set PORT to another port, for example PORT=4322 npm start.`);
  } else {
    console.error(`Could not start the server: ${err && err.message}`);
  }
  process.exit(1);
}
