import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enqueuePendingTalentPartnerClaim,
  isTerminalTalentPartnerClaimReason,
  markPendingTalentPartnerClaimAttempt,
  normalizePendingTalentPartnerClaims,
  PENDING_TALENT_PARTNER_CLAIMS_KEY,
  readPendingTalentPartnerClaims,
  removePendingTalentPartnerClaim,
  TALENT_PARTNER_CLAIM_MAX_AGE_MS,
  TALENT_PARTNER_CLAIM_QUEUE_LIMIT,
  type StorageLike
} from '../../src/lib/talentPartnerClaimQueue';

class MemoryStorage implements StorageLike {
  private values = new Map<string,string>();
  getItem(key:string){ return this.values.get(key) ?? null; }
  setItem(key:string,value:string){ this.values.set(key,value); }
  removeItem(key:string){ this.values.delete(key); }
}

const NOW = Date.parse('2026-08-29T14:30:00.000Z');

function claim(index=1, overrides:Record<string,unknown>={}) {
  return {
    applicationReference:`PF-APP-${index}`,
    email:`Candidate${index}@Example.com`,
    partnerCode:'tp-abcd',
    sessionId:`session-${index}`,
    createdAt:new Date(NOW-index*1000).toISOString(),
    attempts:0,
    ...overrides
  };
}

test('normalization cleans identifiers and removes invalid or expired claims', () => {
  const expired = claim(2,{createdAt:new Date(NOW-TALENT_PARTNER_CLAIM_MAX_AGE_MS).toISOString()});
  const result = normalizePendingTalentPartnerClaims([claim(1),expired,{foo:'bar'}],NOW);
  assert.equal(result.length,1);
  assert.equal(result[0].email,'candidate1@example.com');
  assert.equal(result[0].partnerCode,'TP-ABCD');
});

test('queue deduplicates one application and preserves the original claim time', () => {
  const storage = new MemoryStorage();
  const first = enqueuePendingTalentPartnerClaim(claim(1),storage,NOW);
  assert.ok(first);
  const second = enqueuePendingTalentPartnerClaim(claim(1,{partnerCode:'TP-SECOND',createdAt:new Date(NOW+500).toISOString()}),storage,NOW+500);
  const items = readPendingTalentPartnerClaims(storage,NOW+500);
  assert.equal(items.length,1);
  assert.equal(items[0].createdAt,first!.createdAt);
  assert.equal(second?.partnerCode,'TP-SECOND');
});

test('attempt metadata is persisted and claim removal clears the queue', () => {
  const storage = new MemoryStorage();
  const queued = enqueuePendingTalentPartnerClaim(claim(1),storage,NOW)!;
  markPendingTalentPartnerClaimAttempt(queued,storage,NOW+1000);
  const attempted = readPendingTalentPartnerClaims(storage,NOW+1000);
  assert.equal(attempted[0].attempts,1);
  assert.equal(attempted[0].lastAttemptAt,new Date(NOW+1000).toISOString());
  removePendingTalentPartnerClaim(queued,storage,NOW+1000);
  assert.deepEqual(readPendingTalentPartnerClaims(storage,NOW+1000),[]);
  assert.equal(storage.getItem(PENDING_TALENT_PARTNER_CLAIMS_KEY),null);
});

test('queue remains bounded when many claims are submitted', () => {
  const input = Array.from({length:TALENT_PARTNER_CLAIM_QUEUE_LIMIT+7},(_,index)=>claim(index+1));
  const normalized = normalizePendingTalentPartnerClaims(input,NOW);
  assert.equal(normalized.length,TALENT_PARTNER_CLAIM_QUEUE_LIMIT);
  assert.equal(normalized.at(-1)?.applicationReference,'PF-APP-1');
});

test('only definitive server outcomes are terminal', () => {
  assert.equal(isTerminalTalentPartnerClaimReason('disabled'),true);
  assert.equal(isTerminalTalentPartnerClaimReason('claim_window_closed'),true);
  assert.equal(isTerminalTalentPartnerClaimReason('self_referral_blocked'),true);
  assert.equal(isTerminalTalentPartnerClaimReason('application_not_found'),false);
  assert.equal(isTerminalTalentPartnerClaimReason('valid_first_touch_not_found'),false);
});
