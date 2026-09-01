import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const CANONICAL_SUPABASE_URL = 'https://calabtayklhltyiriiwo.supabase.co';
const CANONICAL_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_pLllPWGRcNcofWhD-GrHcg_t34HYo9a';
const PRODUCTION_INIT_FAILURE = 'ProFox production Supabase initialization failed.';

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await javascriptFiles(target));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(target);
  }
  return files;
}

const distDirectory = path.resolve('dist');
const bundles = await javascriptFiles(distDirectory);
if (bundles.length === 0) {
  throw new Error('Production build verification found no JavaScript bundles in dist.');
}

let hasCanonicalUrl = false;
let hasCanonicalPublishableKey = false;
let hasProductionGuard = false;

for (const bundle of bundles) {
  const source = await readFile(bundle, 'utf8');
  if (source.includes(CANONICAL_SUPABASE_URL)) hasCanonicalUrl = true;
  if (source.includes(CANONICAL_SUPABASE_PUBLISHABLE_KEY)) hasCanonicalPublishableKey = true;
  if (source.includes(PRODUCTION_INIT_FAILURE)) hasProductionGuard = true;
}

if (!hasCanonicalUrl) {
  throw new Error('Production bundle is missing the canonical ProFox Supabase URL.');
}
if (!hasCanonicalPublishableKey) {
  throw new Error('Production bundle is missing the canonical browser-safe Supabase publishable key.');
}
if (!hasProductionGuard) {
  throw new Error('Production bundle is missing the fail-closed Supabase initialization guard.');
}

console.log('Production Supabase browser configuration verified.');
