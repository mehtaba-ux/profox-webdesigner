import { UserProfile } from '../types';
import { supabase } from './supabase';

const TEST_EMAIL_SUFFIX = '@profoxwebdesigner.test';
const TEST_STAFF_ROLES = new Set(['sales', 'content_writer', 'uiux_designer', 'developer']);
export const TEST_STAFF_LOGIN_ENABLED = import.meta.env.VITE_ENABLE_TEST_STAFF_LOGIN === 'true';

export function isSyntheticTestProfile(profile: UserProfile | null | undefined) {
  return Boolean(
    profile
    && profile.email.toLowerCase().endsWith(TEST_EMAIL_SUFFIX)
    && TEST_STAFF_ROLES.has(profile.role)
    && profile.status === 'active'
    && profile.onboardingStatus === 'completed'
    && profile.onboardingProgress === 100
  );
}

export function isSyntheticTestEmployee(profile: UserProfile) {
  return TEST_STAFF_LOGIN_ENABLED && isSyntheticTestProfile(profile);
}

async function invocationErrorMessage(error: any) {
  const fallback = error?.message || 'Test employee session could not be created.';
  const response = error?.context;
  if (!response || typeof response.clone !== 'function') return fallback;
  try {
    const payload = await response.clone().json();
    return String(payload?.error || fallback);
  } catch {
    return fallback;
  }
}

export const testStaffAccessService = {
  async loginAs(profile: UserProfile) {
    if (!isSyntheticTestEmployee(profile)) {
      throw new Error('Only active approved departmental test employees can be accessed.');
    }

    const { data, error } = await supabase.functions.invoke('test-staff-login', {
      body: { targetUserId: profile.id },
    });
    if (error) throw new Error(await invocationErrorMessage(error));
    if (!data?.ok || !data?.tokenHash) {
      throw new Error(data?.error || 'Test employee session could not be created.');
    }

    const { data: authData, error: verificationError } = await supabase.auth.verifyOtp({
      token_hash: String(data.tokenHash),
      type: 'magiclink',
    });
    if (verificationError || !authData.session) {
      throw new Error(verificationError?.message || 'The one-time employee session could not be verified.');
    }

    return authData;
  },
};
