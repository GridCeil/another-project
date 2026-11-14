import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import EmbeddedPostgres from 'embedded-postgres';

const appRoot = fileURLToPath(new URL('..', import.meta.url));

function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: appRoot, stdio: 'inherit', env: { ...process.env, ...env }, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

export async function runChecks() {
  const localPython = join(appRoot, '.runtime', 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3');
  const venvPython = join(appRoot, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const python = process.env.PYTHON || (existsSync(venvPython) ? venvPython : existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3');
  run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'frontend/vite.config.js']);
  const directory = mkdtempSync(join(tmpdir(), 'unsaid-check-'));
  const port = await availablePort();
  const password = randomBytes(24).toString('hex');
  const postgres = new EmbeddedPostgres({ databaseDir: join(directory, 'data'), user: 'postgres', password, port, persistent: false, initdbFlags: ['--locale=C', '--lc-messages=C', '--encoding=UTF8'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: message => console.error(message) });
  let started = false;
  try {
    await postgres.initialise();
    await postgres.start();
    started = true;
    console.log('Running Flask integration tests against isolated PostgreSQL.');
    run(python, ['tests/test_api.py'], { TEST_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/postgres` });
  } finally {
    if (started) await postgres.stop();
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runChecks();
}
