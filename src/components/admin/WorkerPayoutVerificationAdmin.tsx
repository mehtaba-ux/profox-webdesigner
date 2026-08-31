import React, { useEffect, useState } from 'react';
import { CheckCircle2, Eye, Loader2, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { razorpayxPayoutService } from '../../lib/razorpayxPayoutService';

const display = (value: unknown) => value == null || value === '' ? '—' : String(value);

export default function WorkerPayoutVerificationAdmin() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [revealed, setRevealed] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setBusy('load'); setError('');
    try { setProfiles((await razorpayxPayoutService.getAdminState()).profiles || []); }
    catch (e: any) { setError(e?.message || 'Employee payout profiles could not be loaded.'); }
    finally { setBusy(''); }
  };
  useEffect(() => { void load(); }, []);

  const reveal = async (profile: any) => {
    const reason = window.prompt('Why do you need to inspect these payment details? (minimum 10 characters)')?.trim() || '';
    if (reason.length < 10) return;
    setBusy(profile.id); setError('');
    try { const details = await razorpayxPayoutService.revealProfile(profile.id, reason); setRevealed(current => ({ ...current, [profile.id]: details })); }
    catch (e: any) { setError(e?.message || 'Payment details could not be revealed.'); }
    finally { setBusy(''); }
  };

  const review = async (profile: any, decision: 'Verified' | 'Rejected') => {
    const reason = decision === 'Rejected' ? window.prompt('Rejection reason (required)')?.trim() || '' : '';
    if (decision === 'Rejected' && reason.length < 5) return;
    const reference = decision === 'Verified' ? window.prompt('Verification reference (optional)')?.trim() || '' : '';
    setBusy(profile.id); setError('');
    try {
      await razorpayxPayoutService.reviewProfile(profile.id, decision, reason, reference);
      setRevealed(current => { const next = { ...current }; delete next[profile.id]; return next; });
      await load();
    } catch (e: any) { setError(e?.message || 'Payment profile review failed.'); }
    finally { setBusy(''); }
  };

  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-black">Employee payout verification</h2><p className="mt-1 text-xs leading-5 text-slate-500">Employees submit encrypted bank or UPI details. Finance must reveal and verify the current version before it can enter a payout batch.</p></div><button onClick={() => void load()} disabled={busy === 'load'} className="rounded-xl border border-slate-200 p-2.5 text-slate-600">{busy === 'load' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button></div>
    {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
    <div className="mt-4 space-y-3">{profiles.length === 0 ? <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">No employee has submitted payout details yet.</div> : profiles.map(profile => {
      const details = revealed[profile.id]?.details;
      return <div key={profile.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-black">{profile.fullName}</div><div className="text-xs text-slate-500">{profile.email} · {profile.payoutMethod || 'Not selected'} · version {profile.detailsVersion || 0}</div><div className="mt-2 text-xs">{Object.entries(profile.maskedDetails || {}).map(([key, value]) => <span key={key} className="mr-3"><span className="text-slate-400">{key}:</span> {display(value)}</span>)}</div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${profile.status === 'Verified' ? 'bg-emerald-50 text-emerald-700' : profile.status === 'Rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{profile.status}</span></div>
        {details && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="flex items-center gap-2 text-[10px] font-black uppercase text-amber-900"><ShieldAlert className="h-4 w-4" />Sensitive · audited access</div><div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">{Object.entries(details).map(([key, value]) => <div key={key}><span className="text-amber-700">{key}:</span> <span className="font-bold">{display(value)}</span></div>)}</div></div>}
        <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void reveal(profile)} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black"><Eye className="h-3.5 w-3.5" />Reveal current details</button>{details && <><button onClick={() => void review(profile, 'Verified')} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-black text-white"><CheckCircle2 className="h-3.5 w-3.5" />Verify</button><button onClick={() => void review(profile, 'Rejected')} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-[10px] font-black text-red-700"><XCircle className="h-3.5 w-3.5" />Reject</button></>}</div>
      </div>;
    })}</div>
  </section>;
}
