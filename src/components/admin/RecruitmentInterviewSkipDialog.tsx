import React, { useState } from 'react';
import { AlertTriangle, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { recruitmentInterviewService } from '../../lib/recruitmentInterviewService';

interface Props {
  applicantId: string;
  candidateName: string;
  stage: string;
  onClose: () => void;
  onSkipped: () => Promise<void>;
}

export default function RecruitmentInterviewSkipDialog({ applicantId, candidateName, stage, onClose, onSkipped }: Props) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (reason.trim().length < 12) return;
    setBusy(true);
    setError(null);
    try {
      await recruitmentInterviewService.skipInterview(applicantId, reason.trim());
      await onSkipped();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The required interview could not be skipped.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[155] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700"><ShieldCheck className="h-4 w-4" />Administrator exception</div><h3 className="mt-2 text-xl font-bold text-slate-900">Skip Required Interview?</h3><p className="mt-1 text-sm leading-6 text-slate-500">{candidateName} · {stage}</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="Close skip interview" className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:text-slate-800 disabled:opacity-50"><XCircle className="h-5 w-5" /></button></div>

        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div className="text-sm leading-6 text-amber-900"><strong>This action is audited.</strong> It satisfies only the interview requirement. Any structured assessment, agreement, Academy, Final Approval, or activation gate remains protected.</div></div>

        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">{error}</div>}

        <label className="mt-5 block"><span className="text-sm font-bold text-slate-900">Reason for skipping</span><span className="mt-1 block text-xs leading-5 text-slate-500">Required. Enter a specific operational reason so another reviewer can understand this exception later.</span><textarea value={reason} onChange={event => setReason(event.target.value)} rows={4} placeholder="Example: Candidate was previously interviewed and the verified interview evidence is already on record..." className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-base text-slate-900 outline-none transition focus:border-[#000080] focus:ring-2 focus:ring-[#000080]/10" /></label>
        <div className="mt-2 text-right text-[11px] font-semibold text-slate-400">Minimum 12 characters</div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-700 disabled:opacity-50">Cancel</button><button type="button" onClick={() => void submit()} disabled={busy || reason.trim().length < 12} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-700 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Skip Interview</button></div>
      </div>
    </div>
  );
}
