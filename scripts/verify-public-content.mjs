import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(process.env.VITE_SUPABASE_URL || '').trim();
const publishableKey = String(process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const validPublishableKey = /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(publishableKey)
  || /^eyJ[A-Za-z0-9._-]{100,}$/.test(publishableKey);

if (!/^https:\/\/[a-z]{20}\.supabase\.co\/?$/.test(supabaseUrl)) {
  throw new Error('VITE_SUPABASE_URL is missing or malformed.');
}
if (!validPublishableKey) {
  throw new Error('VITE_SUPABASE_ANON_KEY is missing or malformed.');
}

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

const bundles = await javascriptFiles(path.resolve('dist'));
let embedded = false;
for (const bundle of bundles) {
  if ((await readFile(bundle, 'utf8')).includes(publishableKey)) {
    embedded = true;
    break;
  }
}
if (!embedded) {
  throw new Error('The production bundle does not contain the validated Supabase publishable key.');
}

async function fetchChecked(url, label) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}.`);
  return response;
}

async function verifyDeployedApplication() {
  const publicAppUrl = String(process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
  if (!/^https:\/\//.test(publicAppUrl)) {
    throw new Error('PUBLIC_APP_URL is required for deployed frontend verification.');
  }

  const cacheBuster = encodeURIComponent(process.env.GITHUB_SHA || String(Date.now()));
  const homeResponse = await fetchChecked(`${publicAppUrl}/?deployment=${cacheBuster}`, 'Public application');
  const homeHtml = await homeResponse.text();
  const scriptPaths = [...homeHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((source) => source.startsWith('/assets/index-') && source.endsWith('.js'));

  if (scriptPaths.length !== 1) {
    throw new Error('The deployed application entry bundle could not be identified uniquely.');
  }

  const entryUrl = new URL(scriptPaths[0], publicAppUrl);
  entryUrl.searchParams.set('deployment', cacheBuster);
  const entryBundle = await (await fetchChecked(entryUrl, 'Deployed entry bundle')).text();
  if (!entryBundle.includes(publishableKey)) {
    throw new Error('The deployed frontend does not contain the validated Supabase publishable key.');
  }

  await Promise.all([
    fetchChecked(`${publicAppUrl}/pricing?deployment=${cacheBuster}`, 'Pricing route'),
    fetchChecked(`${publicAppUrl}/careers?deployment=${cacheBuster}`, 'Careers route')
  ]);

  console.log('Deployed frontend configuration and public routes verified.');
}

const supabase = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const [contentResult, jobsResult, catalogResult] = await Promise.all([
  supabase.from('content').select('data').eq('id', 'customPages').maybeSingle(),
  supabase.from('career_jobs').select('slug').order('display_order', { ascending: true }),
  supabase.rpc('get_public_sales_catalog')
]);

for (const [label, result] of [
  ['public CMS content', contentResult],
  ['public career jobs', jobsResult],
  ['public pricing catalog', catalogResult]
]) {
  if (result.error) throw new Error(`${label} check failed: ${result.error.message}`);
}

const customPages = Array.isArray(contentResult.data?.data) ? contentResult.data.data : [];
const requiredPages = ['pricing', 'careers'];
for (const slug of requiredPages) {
  if (!customPages.some((page) => page?.slug === slug && page?.status === 'published')) {
    throw new Error(`Published CMS page is missing: ${slug}`);
  }
}

const jobs = Array.isArray(jobsResult.data) ? jobsResult.data : [];
const catalog = Array.isArray(catalogResult.data) ? catalogResult.data : [];
const packages = catalog.filter((item) => item?.productType === 'package' || item?.productType === 'custom');

if (jobs.length === 0) throw new Error('The public Careers page has no published jobs.');
if (packages.length === 0) throw new Error('The public Pricing page has no public packages.');

console.log(`Public content verified: ${packages.length} pricing packages and ${jobs.length} career jobs.`);

if (process.env.VERIFY_DEPLOYED_APP === 'true') {
  await verifyDeployedApplication();
}
