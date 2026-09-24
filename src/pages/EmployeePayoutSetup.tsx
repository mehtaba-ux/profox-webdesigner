import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Landmark, Loader2, LockKeyhole, ShieldCheck, WalletCards } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { razorpayxPayoutService } from '../lib/razorpayxPayoutService';

type Method = 'Bank Account' | 'UPI';
const blockedRoles = new Set(['client', 'talent_partner', 'applicant']);
const control = 'mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-[#000080] focus:ring-4 focus:ring-blue-100';

export default function EmployeePayoutSetup() {
  const { user, profile, loading: authLoading } = useAuth();
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [method, setMethod] = useState<Method>('Bank Account');
  const [details, setDetails] = useState({ accountHolderName: '', accountNumber: '', ifsc: '', vpa: '' });
  const role = String(profile?.role || '');
  const eligible = Boolean(user && profile?.status === 'active' && !blockedRoles.has(role));

  const load = async () => {
    if (!eligible) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const next = await razorpayxPayoutService.getMyProfile();
      setState(next);
      setMethod(next?.payoutMethod || 'Bank Account');
      setEditing(!next?.profileId || ['Rejected', 'Disabled', 'Setup Required'].includes(next?.status));
    } catch (e: any) { setError(e?.message || 'Payout setup could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [user?.id, role, profile?.status]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const payload = method === 'UPI'
        ? { accountHolderName: details.accountHolderName.trim(), vpa: details.vpa.trim().toLowerCase() }
        : { accountHolderName: details.accountHolderName.trim(), accountNumber: details.accountNumber.replace(/\s/g, ''), ifsc: details.ifsc.trim().toUpperCase() };
      const next = await razorpayxPayoutService.submitMyProfile(method, payload);
      setState(next); setDetails({ accountHolderName: '', accountNumber: '', ifsc: '', vpa: '' }); setEditing(false);
      setMessage('Payout details were encrypted and submitted. Finance verification is required before they can enter a RazorpayX batch.');
    } catch (e: any) { setError(e?.message || 'Payout details could not be saved.'); }
    finally { setSaving(false); }
  };

  if (authLoading || loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  if (!user) return <State title="Sign in required" text="Sign in with your ProFox staff account to configure employee payouts." />;
  if (!eligible) return <State title="Staff payout access only" text="This secure setup is for active ProFox staff and project workers. Talent Partners use their dedicated payout setup." />;

  const masked = state?.maskedDetails || {};
  const tone = state?.status === 'Verified' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : state?.status === 'Rejected' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800';
  return <div className="min-h-screen bg-[#f5f7fb] px-4 py-8 text-slate-900 sm:px-6">
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><div className="text-[10px] font-black uppercase tracking-[.16em] text-[#FF0E0E]">Finance · Secure employee payout</div><h1 className="mt-2 text-3xl font-black tracking-[-.04em]">Bank or UPI payout setup</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Your full details are encrypted. Only an audited Finance review can reveal them, and a verified version is snapshotted into each payout batch.</p></div><Link to="/admin/workspace" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black"><ArrowLeft className="h-4 w-4" />Workspace</Link></div>
      {error && <Notice danger>{error}</Notice>}{message && <Notice>{message}</Notice>}
      <div className="mt-6 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><div className="text-[10px] font-black uppercase text-slate-400">Current status</div><div className="mt-2 text-xl font-black">{state?.status || 'Setup Required'}</div></div><span className={`rounded-full border px-3 py-1.5 text-[10px] font-black ${tone}`}>{state?.status || 'Setup Required'}</span></div><div className="mt-5 space-y-3 text-xs leading-5 text-slate-600"><Row icon={LockKeyhole} text="Raw account details never return to the normal workspace." /><Row icon={ShieldCheck} text="Changing details creates a new version and resets verification." /><Row icon={CheckCircle2} text="RazorpayX webhooks, not a browser click, confirm final payment." /></div></section>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {!editing && state?.profileId ? <div><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase text-slate-400">Saved destination</div><h2 className="mt-2 text-2xl font-black">{state.payoutMethod}</h2><p className="mt-1 text-xs text-slate-500">INR · India · version {state.detailsVersion}</p></div><WalletCards className="h-7 w-7 text-[#000080]" /></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{Object.entries(masked).map(([key, value]) => <div key={key} className="rounded-xl bg-slate-50 p-4"><div className="text-[9px] font-black uppercase text-slate-400">{key.replace(/([A-Z])/g, ' $1')}</div><div className="mt-1 break-all text-sm font-bold">{String(value)}</div></div>)}</div>{state.rejectionReason && <Notice danger>{state.rejectionReason}</Notice>}<button onClick={() => setEditing(true)} className="mt-5 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black">Change payout details</button></div>
          : <form onSubmit={submit} className="space-y-5"><div><div className="text-[10px] font-black uppercase text-[#000080]">Encrypted destination</div><h2 className="mt-2 text-2xl font-black">{state?.profileId ? 'Update payout details' : 'Complete payout setup'}</h2></div><label className="block text-xs font-black">Payout method<select className={control} value={method} onChange={e => setMethod(e.target.value as Method)}><option>Bank Account</option><option>UPI</option></select></label><label className="block text-xs font-black">Account holder name<input className={control} required autoComplete="name" value={details.accountHolderName} onChange={e => setDetails(v => ({ ...v, accountHolderName: e.target.value }))} /></label>{method === 'Bank Account' ? <><label className="block text-xs font-black">Bank account number<input className={control} required inputMode="numeric" autoComplete="off" value={details.accountNumber} onChange={e => setDetails(v => ({ ...v, accountNumber: e.target.value.replace(/[^0-9 ]/g, '') }))} /></label><label className="block text-xs font-black">IFSC code<input className={control} required autoComplete="off" maxLength={11} value={details.ifsc} onChange={e => setDetails(v => ({ ...v, ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))} /></label></> : <label className="block text-xs font-black">UPI ID<input className={control} required autoComplete="off" placeholder="name@bank" value={details.vpa} onChange={e => setDetails(v => ({ ...v, vpa: e.target.value }))} /></label>}<label className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-slate-600"><input required type="checkbox" className="mt-0.5 h-4 w-4 accent-[#000080]" /><span>I confirm these details belong to me or my authorized account and are correct for INR payouts.</span></label><div className="flex gap-2"><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}Save securely</button>{state?.profileId && <button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-black">Cancel</button>}</div></form>}
        </section>
      </div>
    </div>
  </div>;
}

function Row({ icon: Icon, text }: { icon: any; text: string }) { return <div className="flex gap-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]" /><span>{text}</span></div>; }
function Notice({ children, danger = false }: { children: any; danger?: boolean }) { return <div className={`mt-4 rounded-xl border p-4 text-sm ${danger ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{children}</div>; }
function State({ title, text }: { title: string; text: string }) { return <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4"><div className="max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><WalletCards className="mx-auto h-10 w-10 text-[#000080]" /><h1 className="mt-4 text-2xl font-black">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p><Link to="/admin/workspace" className="mt-5 inline-flex rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black">Back to workspace</Link></div></div>; }
