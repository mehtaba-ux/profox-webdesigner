import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const migrationPath = 'supabase/migrations/20260908100000_crm_sales_probing_discovery_part_3.sql';
const migrationSource = await readFile(migrationPath, 'utf8');
const migrationChecksum = createHash('sha256')
  .update(migrationSource.replace(/\r\n/g, '\n'))
  .digest('hex');

const checks = [
  { name: 'typecheck', command: 'npm', args: ['run', 'lint'] },
  { name: 'migration_integrity', command: 'npm', args: ['run', 'migrations:check'] },
  { name: 'tests', command: 'npm', args: ['test'] },
].map(check => {
  const result = spawnSync(check.command, check.args, {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const failureLines = output.split('\n').filter(line => /^not ok \d+/.test(line));
  return {
    name: check.name,
    exitCode: result.status ?? 1,
    signal: result.signal ?? null,
    outputTail: output.slice(-20000),
    failureLines,
  };
});

const payload = {
  part: 3,
  generatedAt: new Date().toISOString(),
  migration: '20260908100000_crm_sales_probing_discovery_part_3',
  migrationChecksum,
  checks,
  allPassed: checks.every(check => check.exitCode === 0),
};

await mkdir('public', { recursive: true });
await writeFile('public/part3-validation.json', JSON.stringify(payload, null, 2) + '\n');
console.log(JSON.stringify({ migrationChecksum, checks: checks.map(({ name, exitCode, failureLines }) => ({ name, exitCode, failureLines })) }));
