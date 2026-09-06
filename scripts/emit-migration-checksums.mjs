import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const files = [
  'supabase/migrations/20260906113000_crm_sales_discovery_foundation_part_1.sql',
  'supabase/migrations/20260906113500_crm_sales_discovery_foundation_hardening.sql',
];

const result = {};
for (const file of files) {
  const source = await readFile(file, 'utf8');
  result[file] = createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');
}

await writeFile('dist/migration-checksums.json', `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(result);
