import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import type { ApplicantRecord } from '../../lib/applicantService';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';

type TestBypassStatus = {
  applicantId: string;
  stage: string;
  totalRequired: number;
  completedRequired: number;
  actualProgressPercent: number;
  globallyUsed: boolean;
  usedForThisCandidate: boolean;
  active: boolean;
  consumed: boolean;
  expiresAt?: string | null;
  eligible: boolean;
  liveActivationStillBlocked: boolean;
};

function messageFromError(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message || fallback);
  return fallback;
}

export default function SalesAcademyTestBypassControl({ applicant, onChanged }: { applicant: ApplicantRecord; onChanged: () => Promise<void> }) {
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState<TestBypassStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    if (!isAdmin || !applicant.linkedUserId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_get_sales_academy_test_bypass_status', { p_user_id: applicant.linkedUserId });
      if (rpcError) throw rpcError;
      setStatus((data || null) as TestBypassStatus | null);
    } catch (err) {
      setError(messageFromError(err, 'Could not verify the one-time Academy test bypass.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadStatus(); }, [isAdmin, applicant.id, applicant.linkedUserId, applicant.stage]);

  const applyTestBypass = async () => {
    if (!applicant.linkedUserId || !status?.eligible || busy) return;
    const confirmed = window.confirm(
      `TEST ONLY — ONE-TIME ACTION\n\nSkip Sales Academy Training for ${applicant.fullName} and move this test candidate to Final Approval?\n\nThis will NOT mark the ${status.totalRequired} Academy modules complete, will NOT change scores or training evidence, and will NOT grant live Sales/CRM access. The exception can be used only once and supports testing only through Ready for System Access. Live activation will remain blocked until the real Academy is completed.\n\nContinue?`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('admin_test_skip_sales_academy', {
        p_user_id: applicant.linkedUserId,
        p_reason: 'One-time Admin test of the post-Academy recruitment and notification flow',
      });
      if (rpcError) throw rpcError;
      await onChanged();
    } catch (err) {
      setError(messageFromError(err, 'The one-time Academy test bypass could not be applied.'));
      await loadStatus();
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin || !applicant.linkedUserId || String(applicant.stage) !== 'Sales Academy Training') return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-sm leading-6 text-amber-950">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <div className="font-black">Testing control · one-time only</div>
          <p className="mt-1 text-xs leading-5 text-amber-900">This exception exists only to test the post-Academy recruitment flow. Real training records stay unchanged and live Sales activation stays protected.</p>

          {loading ? (
            <div className="mt-3 flex items-center gap-2 text-xs font-bold text-amber-800"><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking test-bypass availability…</div>
          ) : status ? (
            <div className="mt-3 space-y-2">
              <div className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700">
                Real Academy progress: {status.completedRequired} of {status.totalRequired} required modules completed ({status.actualProgressPercent}%).
              </div>
              {status.eligible ? (
                <button type="button" onClick={() => void applyTestBypass()} disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-black text-white transition hover:bg-amber-800 disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Skip Sales Academy — Test Only
                </button>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-900">
                  {status.globallyUsed ? 'The one-time test bypass has already been used and cannot be issued again.' : 'This candidate is not eligible for the test bypass.'}
                </div>
              )}
            </div>
          ) : null}

          {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</div>}
        </div>
      </div>
    </div>
  );
}
