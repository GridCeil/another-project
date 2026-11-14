import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import EmbeddedPostgres from 'embedded-postgres';

const root = fileURLToPath(new URL('..', import.meta.url));
const runtime = join(root, '.runtime');
mkdirSync(runtime, { recursive: true });
const bundled = join(runtime, 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3');
const venv = join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const python = process.env.PYTHON || (existsSync(venv) ? venv : existsSync(bundled) ? bundled : process.platform === 'win32' ? 'python' : 'python3');
const passwordFile = join(runtime, 'local-db-password');
if (!existsSync(passwordFile)) writeFileSync(passwordFile, randomBytes(24).toString('hex'), { mode: 0o600 });
const password = readFileSync(passwordFile, 'utf8').trim();
const dbPort = Number(process.env.LOCAL_DB_PORT || 55432);
const webPort = Number(process.env.PORT || 5000);
const databaseDir = join(runtime, 'local-postgres');
const postgres = new EmbeddedPostgres({ databaseDir, user: 'postgres', password, port: dbPort, persistent: true, initdbFlags: ['--locale=C', '--lc-messages=C', '--encoding=UTF8'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} });
const env = { ...process.env, DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${dbPort}/postgres` };
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command exited with ${result.status}`);
}
let server;
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server?.kill();
  await postgres.stop();
}
try {
  run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'frontend/vite.config.js']);
  if (!existsSync(join(databaseDir, 'PG_VERSION'))) await postgres.initialise();
  await postgres.start();
  run(python, ['-m', 'flask', '--app', 'backend.server:create_app', 'init-db']);
  server = spawn(python, ['-m', 'waitress', `--host=127.0.0.1`, `--port=${webPort}`, '--call', 'backend.server:create_app'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
  server.on('error', async error => { console.error(error.message); await stop(); process.exitCode = 1; });
  server.on('exit', async code => { await stop(); process.exitCode = code || 0; });
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  console.log(`Unsaid local server starting at http://localhost:${webPort}. Press Ctrl+C to stop. Posts persist in app/.runtime/local-postgres.`);
} catch (error) {
  console.error(error.message);
  await stop();
  process.exitCode = 1;
}
