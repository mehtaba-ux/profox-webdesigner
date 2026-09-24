import React, { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import type { ApplicantRecord } from '../../lib/applicantService';
import { recruitmentWorkflowService } from '../../lib/recruitmentWorkflowService';

function messageFromError(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message || fallback);
  return fallback;
}

export default function SalesAcademyTestBypassControl({ applicant, onChanged }: { applicant: ApplicantRecord; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const continueToPractical = async () => {
    if (!applicant.linkedUserId || String(applicant.stage) !== 'Sales Academy Training' || busy) return;
    setBusy(true);
    setError(null);
    try {
      await recruitmentWorkflowService.advanceStage(applicant.id);
      await onChanged();
    } catch (err) {
      setError(messageFromError(err, 'Sales Academy requirements are not complete yet.'));
    } finally {
      setBusy(false);
    }
  };

  if (!applicant.linkedUserId || String(applicant.stage) !== 'Sales Academy Training') return null;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-sm leading-6 text-slate-700">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]" />
        <div className="min-w-0 flex-1">
          <div className="font-black text-[#000080]">Protected Sales Academy completion gate</div>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Continue only after the candidate has completed the required Sales Academy training. The server verifies the signed agreement, linked account, Academy start and deadline state, required modules, Management reviews, and all non-bypassable training gates before allowing Sales Practical Assessment.
          </p>
          <button
            type="button"
            onClick={() => void continueToPractical()}
            disabled={busy}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#000080] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#000066] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Advance to Sales Practical Assessment
          </button>
          {error && <div className="mt-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-900">{error}</div>}
        </div>
      </div>
    </div>
  );
}
