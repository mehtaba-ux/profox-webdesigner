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

function javascriptModuleReferences(source) {
  const references = new Set();
  const patterns = [
    /\bfrom\s*["']([^"']+\.js)["']/g,
    /\bimport\s*\(\s*["']([^"']+\.js)["']\s*\)/g,
    /\bimport\s*["']([^"']+\.js)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) references.add(match[1]);
  }
  return [...references];
}

async function verifyDeployedSupabaseConfiguration(entryUrl, cacheBuster) {
  const queue = [entryUrl];
  const visited = new Set();
  const maxModules = 120;
  let foundUrl = false;
  let foundKey = false;

  while (queue.length > 0 && visited.size < maxModules && !(foundUrl && foundKey)) {
    const current = queue.shift();
    const canonical = new URL(current);
    canonical.search = '';
    const canonicalHref = canonical.href;
    if (visited.has(canonicalHref)) continue;
    visited.add(canonicalHref);

    const requestUrl = new URL(canonicalHref);
    requestUrl.searchParams.set('deployment', cacheBuster);
    const source = await (await fetchChecked(requestUrl, `Deployed JavaScript module ${visited.size}`)).text();
    if (source.includes(supabaseUrl)) foundUrl = true;
    if (source.includes(publishableKey)) foundKey = true;

    for (const reference of javascriptModuleReferences(source)) {
      const next = new URL(reference, canonicalHref);
      if (next.origin !== canonical.origin || !next.pathname.endsWith('.js')) continue;
      next.search = '';
      if (!visited.has(next.href)) queue.push(next.href);
    }
  }

  if (!foundUrl || !foundKey) {
    const missing = [!foundUrl ? 'Supabase URL' : null, !foundKey ? 'publishable key' : null].filter(Boolean).join(' and ');
    throw new Error(`The deployed frontend module graph does not contain the validated ${missing}. Scanned ${visited.size} JavaScript modules.`);
  }

  console.log(`Verified deployed Supabase configuration across ${visited.size} JavaScript module${visited.size === 1 ? '' : 's'}.`);
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

  await verifyDeployedSupabaseConfiguration(new URL(scriptPaths[0], publicAppUrl), cacheBuster);

  await Promise.all([
    fetchChecked(`${publicAppUrl}/pricing?deployment=${cacheBuster}`, 'Pricing route'),
    fetchChecked(`${publicAppUrl}/careers?deployment=${cacheBuster}`, 'Careers route'),
    fetchChecked(`${publicAppUrl}/talent-partner-program?deployment=${cacheBuster}`, 'Talent Partner route')
  ]);

  console.log('Deployed frontend configuration and public routes verified.');
}

const supabase = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const [contentResult, jobsResult, catalogResult, talentPartnerResult] = await Promise.all([
  supabase.from('content').select('data').eq('id', 'customPages').maybeSingle(),
  supabase.from('career_jobs').select('slug').order('display_order', { ascending: true }),
  supabase.rpc('get_public_sales_catalog'),
  supabase.rpc('public_get_talent_partner_program')
]);

for (const [label, result] of [
  ['public CMS content', contentResult],
  ['public career jobs', jobsResult],
  ['public pricing catalog', catalogResult],
  ['public Talent Partner program', talentPartnerResult]
]) {
  if (result.error) throw new Error(`${label} check failed: ${result.error.message}`);
}

const customPages = Array.isArray(contentResult.data?.data) ? contentResult.data.data : [];
const requiredPages = ['pricing', 'careers', 'talent-partner-program'];
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

const talentPartnerProgram = talentPartnerResult.data;
if (!talentPartnerProgram || typeof talentPartnerProgram !== 'object' || Array.isArray(talentPartnerProgram)) {
  throw new Error('The public Talent Partner program did not return an object.');
}
if (!Array.isArray(talentPartnerProgram.roles)) {
  throw new Error('The public Talent Partner program did not return its role configuration.');
}

const publishedRewardRoles = talentPartnerProgram.roles.filter((role) => role?.rewardPublished === true);
for (const role of publishedRewardRoles) {
  if (!role?.careerJobId || !role?.jobTitle || !role?.jobSlug) {
    throw new Error('A published Talent Partner reward role is missing its career identity.');
  }
  if (!['sales', 'project'].includes(role.rewardModel)) {
    throw new Error(`Published Talent Partner role ${role.jobSlug} has an invalid reward model.`);
  }
  if (!/^[A-Z]{3}$/.test(String(role.currency || ''))) {
    throw new Error(`Published Talent Partner role ${role.jobSlug} has an invalid currency.`);
  }

  const requiredCount = Number(role.qualifyingEventCount || 0);
  const rewards = Array.isArray(role.eventRewards) ? role.eventRewards : [];
  if (requiredCount < 1 || rewards.length < requiredCount) {
    throw new Error(`Published Talent Partner role ${role.jobSlug} is missing qualifying reward rules.`);
  }

  for (let rank = 1; rank <= requiredCount; rank += 1) {
    const rule = rewards.find((item) => Number(item?.rank) === rank);
    if (!rule) throw new Error(`Published Talent Partner role ${role.jobSlug} is missing reward #${rank}.`);
    if (rule.kind === 'percent') {
      const value = Number(rule.ratePercent || 0);
      if (!(value > 0 && value <= 100)) throw new Error(`Published Talent Partner role ${role.jobSlug} has an invalid percentage for reward #${rank}.`);
    } else if (rule.kind === 'fixed') {
      if (!(Number(rule.fixedAmount || 0) > 0)) throw new Error(`Published Talent Partner role ${role.jobSlug} has an invalid fixed amount for reward #${rank}.`);
    } else {
      throw new Error(`Published Talent Partner role ${role.jobSlug} has an unknown reward type for reward #${rank}.`);
    }
  }

  if (role.retentionEnabled) {
    if (!(Number(role.retentionMonths || 0) > 0)) throw new Error(`Published Talent Partner role ${role.jobSlug} has an invalid retention period.`);
    if (role.retentionRewardKind === 'percent') {
      const value = Number(role.retentionRatePercent || 0);
      if (!(value > 0 && value <= 100)) throw new Error(`Published Talent Partner role ${role.jobSlug} has an invalid retention percentage.`);
    } else if (role.retentionRewardKind === 'fixed') {
      if (!(Number(role.retentionFixedAmount || 0) > 0)) throw new Error(`Published Talent Partner role ${role.jobSlug} has an invalid retention fixed amount.`);
    } else {
      throw new Error(`Published Talent Partner role ${role.jobSlug} has an invalid retention reward type.`);
    }
  }
}

const salesRole = talentPartnerProgram.roles.find((role) => role?.jobSlug === 'independent-sales-representative');
if (salesRole?.rewardPublished && salesRole.rewardModel !== 'sales') {
  throw new Error('The public Independent Sales Representative reward plan is not using the sales reward model.');
}

const rewardSummary = publishedRewardRoles.map((role) => ({
  slug: role.jobSlug,
  rewards: role.eventRewards.map((rule) => rule.kind === 'percent'
    ? `${rule.rank}:${Number(rule.ratePercent)}%`
    : `${rule.rank}:${role.currency} ${Number(rule.fixedAmount)}`),
  retention: role.retentionEnabled
    ? (role.retentionRewardKind === 'percent'
        ? `${Number(role.retentionRatePercent)}% after ${Number(role.retentionMonths)} months`
        : `${role.currency} ${Number(role.retentionFixedAmount)} after ${Number(role.retentionMonths)} months`)
    : 'disabled'
}));

console.log(`Public content verified: ${packages.length} pricing packages and ${jobs.length} career jobs.`);
console.log(`Talent Partner public rewards verified: ${JSON.stringify(rewardSummary)}`);

if (process.env.VERIFY_DEPLOYED_APP === 'true') {
  await verifyDeployedApplication();
}
