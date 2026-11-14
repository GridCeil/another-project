import test from 'node:test';
import { runChecks } from '../scripts/check.mjs';

test('React builds and Flask satisfies anonymous posting against PostgreSQL', { timeout: 120000 }, async () => {
  await runChecks();
});
