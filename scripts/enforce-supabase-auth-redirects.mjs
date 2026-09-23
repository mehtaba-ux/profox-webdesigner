const projectRef = String(process.env.SUPABASE_PROJECT_REF || '').trim();
const accessToken = String(process.env.SUPABASE_ACCESS_TOKEN || '').trim();
const canonicalOrigin = 'https://www.profoxwebdesigner.com';
const apexOrigin = 'https://profoxwebdesigner.com';

if (!projectRef) throw new Error('SUPABASE_PROJECT_REF is required.');
if (!accessToken) throw new Error('SUPABASE_ACCESS_TOKEN is required.');

const endpoint = `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/config/auth`;
const headers = {
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

function splitAllowList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function isLocalRedirect(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return false;
  try {
    const normalized = candidate.replace(/\*+/g, 'path');
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
  } catch {
    return /(^|[/:.])localhost([/:.*]|$)|127\.0\.0\.1|\[?::1\]?/i.test(candidate);
  }
}

async function managementRequest(method, body) {
  const response = await fetch(endpoint, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(`Supabase Auth configuration ${method} failed with HTTP ${response.status}.`);
  }
  return payload;
}

const before = await managementRequest('GET');
const existingAllowList = splitAllowList(before.uri_allow_list);
const retained = existingAllowList.filter(item => !isLocalRedirect(item));
const required = [
  `${canonicalOrigin}/**`,
  `${apexOrigin}/**`,
];
const nextAllowList = [...new Set([...retained, ...required])];

console.log(`Supabase Auth Site URL before enforcement: ${String(before.site_url || '(unset)')}`);
console.log(`Removed ${existingAllowList.length - retained.length} localhost redirect entr${existingAllowList.length - retained.length === 1 ? 'y' : 'ies'} from production Auth configuration.`);

await managementRequest('PATCH', {
  site_url: canonicalOrigin,
  uri_allow_list: nextAllowList.join(','),
  password_hibp_enabled: true,
});

const after = await managementRequest('GET');
const finalAllowList = splitAllowList(after.uri_allow_list);

if (String(after.site_url || '').replace(/\/$/, '') !== canonicalOrigin) {
  throw new Error(`Supabase Auth Site URL verification failed. Received ${String(after.site_url || '(unset)')}.`);
}
if (finalAllowList.some(isLocalRedirect)) {
  throw new Error('Production Supabase Auth redirect allow list still contains a localhost destination.');
}
if (!finalAllowList.includes(`${canonicalOrigin}/**`)) {
  throw new Error('Canonical Client Portal redirect pattern is missing from Supabase Auth allow list.');
}
if (!finalAllowList.includes(`${apexOrigin}/**`)) {
  throw new Error('Apex production redirect pattern is missing from Supabase Auth allow list.');
}
if (after.password_hibp_enabled !== true) {
  throw new Error('Supabase Auth leaked-password protection is not enabled.');
}

console.log(`Verified Supabase Auth Site URL: ${after.site_url}`);
console.log(`Verified production Auth redirect entries: ${finalAllowList.join(', ')}`);
console.log('Verified Supabase Auth leaked-password protection: enabled');
