export const PENDING_TALENT_PARTNER_CLAIMS_KEY = 'profox:talent-partner-pending-claims:v1';
export const TALENT_PARTNER_CLAIM_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const TALENT_PARTNER_CLAIM_QUEUE_LIMIT = 20;

export interface PendingTalentPartnerClaim {
  applicationReference: string;
  email: string;
  partnerCode: string;
  sessionId: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt?: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage; } catch { return null; }
}

function cleanClaim(value: any): PendingTalentPartnerClaim | null {
  if (!value || typeof value !== 'object') return null;
  const applicationReference = String(value.applicationReference || '').trim();
  const email = String(value.email || '').trim().toLowerCase();
  const partnerCode = String(value.partnerCode || '').trim().toUpperCase();
  const sessionId = String(value.sessionId || '').trim();
  const createdAt = String(value.createdAt || '').trim();
  const createdMs = Date.parse(createdAt);
  if (!applicationReference || !email || !partnerCode || !sessionId || !Number.isFinite(createdMs)) return null;
  return {
    applicationReference,
    email,
    partnerCode,
    sessionId,
    createdAt: new Date(createdMs).toISOString(),
    attempts: Math.max(0, Number.isFinite(Number(value.attempts)) ? Math.floor(Number(value.attempts)) : 0),
    lastAttemptAt: Number.isFinite(Date.parse(String(value.lastAttemptAt || ''))) ? new Date(String(value.lastAttemptAt)).toISOString() : undefined
  };
}

function keyFor(claim: Pick<PendingTalentPartnerClaim, 'applicationReference' | 'email'>) {
  return `${claim.applicationReference.trim().toUpperCase()}::${claim.email.trim().toLowerCase()}`;
}

export function normalizePendingTalentPartnerClaims(input: unknown, nowMs = Date.now()): PendingTalentPartnerClaim[] {
  if (!Array.isArray(input)) return [];
  const byKey = new Map<string, PendingTalentPartnerClaim>();
  for (const raw of input) {
    const claim = cleanClaim(raw);
    if (!claim) continue;
    const createdMs = Date.parse(claim.createdAt);
    if (createdMs > nowMs + 60_000 || nowMs - createdMs >= TALENT_PARTNER_CLAIM_MAX_AGE_MS) continue;
    const key = keyFor(claim);
    const existing = byKey.get(key);
    if (!existing || Date.parse(claim.createdAt) < Date.parse(existing.createdAt)) byKey.set(key, claim);
  }
  return [...byKey.values()]
    .sort((a,b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-TALENT_PARTNER_CLAIM_QUEUE_LIMIT);
}

export function readPendingTalentPartnerClaims(storage: StorageLike | null = browserStorage(), nowMs = Date.now()) {
  if (!storage) return [] as PendingTalentPartnerClaim[];
  try {
    const parsed = JSON.parse(storage.getItem(PENDING_TALENT_PARTNER_CLAIMS_KEY) || '[]');
    const normalized = normalizePendingTalentPartnerClaims(parsed, nowMs);
    if (normalized.length) storage.setItem(PENDING_TALENT_PARTNER_CLAIMS_KEY, JSON.stringify(normalized));
    else storage.removeItem(PENDING_TALENT_PARTNER_CLAIMS_KEY);
    return normalized;
  } catch {
    try { storage.removeItem(PENDING_TALENT_PARTNER_CLAIMS_KEY); } catch { /* ignore unavailable storage */ }
    return [] as PendingTalentPartnerClaim[];
  }
}

export function enqueuePendingTalentPartnerClaim(
  input: Omit<PendingTalentPartnerClaim, 'createdAt' | 'attempts'> & Partial<Pick<PendingTalentPartnerClaim, 'createdAt' | 'attempts' | 'lastAttemptAt'>>,
  storage: StorageLike | null = browserStorage(),
  nowMs = Date.now()
) {
  if (!storage) return null;
  const next = cleanClaim({ ...input, createdAt: input.createdAt || new Date(nowMs).toISOString(), attempts: input.attempts || 0 });
  if (!next) return null;
  const claims = readPendingTalentPartnerClaims(storage, nowMs);
  const key = keyFor(next);
  const existing = claims.find(item => keyFor(item) === key);
  const stored: PendingTalentPartnerClaim = existing ? {
    ...next,
    createdAt: existing.createdAt,
    attempts: existing.attempts,
    lastAttemptAt: existing.lastAttemptAt
  } : next;
  const updated = normalizePendingTalentPartnerClaims([...claims.filter(item => keyFor(item) !== key), stored], nowMs);
  try { storage.setItem(PENDING_TALENT_PARTNER_CLAIMS_KEY, JSON.stringify(updated)); } catch { return null; }
  return stored;
}

export function markPendingTalentPartnerClaimAttempt(
  claim: PendingTalentPartnerClaim,
  storage: StorageLike | null = browserStorage(),
  nowMs = Date.now()
) {
  if (!storage) return claim;
  const claims = readPendingTalentPartnerClaims(storage, nowMs);
  const key = keyFor(claim);
  const marked: PendingTalentPartnerClaim = {
    ...claim,
    attempts: Math.max(0, Number(claim.attempts || 0)) + 1,
    lastAttemptAt: new Date(nowMs).toISOString()
  };
  const updated = normalizePendingTalentPartnerClaims([...claims.filter(item => keyFor(item) !== key), marked], nowMs);
  try { storage.setItem(PENDING_TALENT_PARTNER_CLAIMS_KEY, JSON.stringify(updated)); } catch { /* retry remains best effort */ }
  return marked;
}

export function removePendingTalentPartnerClaim(
  claim: Pick<PendingTalentPartnerClaim, 'applicationReference' | 'email'>,
  storage: StorageLike | null = browserStorage(),
  nowMs = Date.now()
) {
  if (!storage) return;
  const key = keyFor(claim);
  const updated = readPendingTalentPartnerClaims(storage, nowMs).filter(item => keyFor(item) !== key);
  try {
    if (updated.length) storage.setItem(PENDING_TALENT_PARTNER_CLAIMS_KEY, JSON.stringify(updated));
    else storage.removeItem(PENDING_TALENT_PARTNER_CLAIMS_KEY);
  } catch { /* storage can be unavailable */ }
}

export function isTerminalTalentPartnerClaimReason(reason?: string) {
  return new Set(['disabled','claim_window_closed','self_referral_blocked']).has(String(reason || '').trim().toLowerCase());
}
