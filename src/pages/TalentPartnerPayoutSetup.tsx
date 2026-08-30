import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock3, CreditCard, Landmark, Loader2, LockKeyhole, RefreshCw, ShieldCheck, WalletCards } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

type PayoutMethod = 'PayPal' | 'Wise' | 'Bank Transfer' | 'Other';
type SetupState = {
  setupRequired: boolean;
  setupComplete?: boolean;
  workAccessGranted?: boolean;
  accountStatus?: 'Pending' | 'Active' | 'Suspended' | 'Closed';
  status: 'Not Required' | 'Setup Required' | 'Verification Pending' | 'Verified' | 'Rejected' | 'Disabled';
  profileId?: string | null;
  payoutMethod?: PayoutMethod | null;
  preferredCurrency?: string | null;
  countryCode?: string | null;
  detailsVersion?: number | null;
  maskedDetails?: Record<string,string>;
  submittedAt?: string | null;
  verifiedAt?: string | null;
  rejectionReason?: string | null;
  verificationMode?: string;
  automaticTransferSupported?: boolean;
  automaticVerificationSupported?: boolean;
  settlementMode?: string;
  approvedBalances?: Array<{currency:string;amount:number}>;
};

const emptyDetails = {
  accountHolderName: '', paypalEmail: '', wiseEmail: '', bankName: '', accountNumber: '',
  routingType: 'IFSC', routingCode: '', accountType: '', paymentInstructions: ''
};

export default function TalentPartnerPayoutSetup() {
  const { user, profile, loading: authLoading } = useAuth();
  const [state,setState] = useState<SetupState|null>(null);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [editing,setEditing] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [method,setMethod] = useState<PayoutMethod>('PayPal');
  const [currency,setCurrency] = useState('USD');
  const [country,setCountry] = useState('');
  const [details,setDetails] = useState(emptyDetails);
  const role = String(profile?.role || '');

  const load = async () => {
    if (!user || role !== 'talent_partner') { setLoading(false); return; }
    setLoading(true); setError('');
    const { data, error: rpcError } = await supabase.rpc('talent_partner_payout_setup_state');
    if (rpcError) setError(rpcError.message || 'Could not load payout setup.');
    else {
      const next = data as SetupState;
      setState(next);
      setMethod((next.payoutMethod as PayoutMethod) || 'PayPal');
      setCurrency(String(next.preferredCurrency || 'USD'));
      setCountry(String(next.countryCode || ''));
      setEditing(next.status === 'Setup Required' || next.status === 'Rejected' || next.status === 'Disabled');
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, [user?.id, role]);

  const patch = (key:keyof typeof emptyDetails,value:string) => setDetails(v=>({...v,[key]:value}));
  const clearSensitive = () => setDetails(emptyDetails);

  const submit = async (e:FormEvent) => {
    e.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const payload:any = { accountHolderName: details.accountHolderName.trim() };
      if (method === 'PayPal') payload.paypalEmail = details.paypalEmail.trim();
      if (method === 'Wise') payload.wiseEmail = details.wiseEmail.trim();
      if (method === 'Bank Transfer') Object.assign(payload, {
        bankName: details.bankName.trim(), accountNumber: details.accountNumber.trim(), routingType: details.routingType.trim(),
        routingCode: details.routingCode.trim(), accountType: details.accountType.trim()
      });
      if (method === 'Other') payload.paymentInstructions = details.paymentInstructions.trim();

      const { data, error: rpcError } = await supabase.rpc('talent_partner_submit_payout_profile', {
        p_payout_method: method,
        p_preferred_currency: currency.trim().toUpperCase(),
        p_country_code: country.trim().toUpperCase() || null,
        p_details: payload
      });
      if (rpcError) throw rpcError;
      const next = data as SetupState;
      setState(next);
      clearSensitive(); setEditing(false);
      setMessage(next.workAccessGranted
        ? 'Payout setup saved securely. Your Talent Partner work access is now enabled; payouts still require ProFox verification.'
        : 'Payout setup saved securely. You are ready for work access as soon as your Talent Partner account is approved; payouts still require ProFox verification.');
    } catch (err:any) {
      setError(err?.message || 'Could not submit payout details.');
    } finally { setSaving(false); }
  };

  if (authLoading || loading) return <Loader/>;
  if (!user) return <State title="Sign in required" text="Sign in with your dedicated Talent Partner account to manage payout details."><Link className="primary mt-5 inline-flex" to="/talent-partner/login">Sign in</Link></State>;
  if (role !== 'talent_partner') return <State title="Talent Partner access only" text="This secure payout setup is isolated from employee, seller, client and administrator accounts."><Link className="light-button mt-5 inline-flex" to="/talent-partner">Back</Link></State>;
  if (error && !state) return <State title="Payout setup unavailable" text={error}><button onClick={load} className="primary mt-5"><RefreshCw className="h-4 w-4"/>Retry</button></State>;
  if (!state) return <Loader/>;

  const masked = state.maskedDetails || {};
  const hasProfile = Boolean(state.profileId);
  const statusTone = state.status === 'Verified' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : state.status === 'Rejected' || state.status === 'Disabled' ? 'text-red-700 bg-red-50 border-red-200' : 'text-amber-800 bg-amber-50 border-amber-200';

  return <div className="min-h-screen bg-[#f5f7fb] px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><div className="text-[10px] font-black uppercase tracking-[.16em] text-[#FF0E0E]">Talent Partner · Mandatory onboarding</div><h1 className="mt-2 text-3xl font-black tracking-[-.04em] text-[#071126]">Set up how you will be paid</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">A secure payout method is required before Talent Partner referral work is enabled. Your details are encrypted at rest and are never exposed in the normal partner dashboard.</p></div>
        <Link to="/talent-partner" className="light-button"><ArrowLeft className="h-4 w-4"/>Back to portal</Link>
      </div>

      {error&&<Notice tone="error">{error}</Notice>}{message&&<Notice tone="success">{message}</Notice>}
      {state.setupRequired&&<Notice tone="warn"><strong>Required before you start:</strong> referral links and new referral tracking stay disabled until you submit a valid payout method. Admin verification is required later for an actual payout, but you do not need to wait for verification before starting work.</Notice>}
      {state.setupComplete&&state.accountStatus==='Pending'&&<Notice tone="info"><strong>Payout onboarding complete.</strong> Your payout details are saved. Your Talent Partner account is still awaiting approval; once approved, referral work can start immediately.</Notice>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4"><div><div className="text-[10px] font-black uppercase text-slate-400">Current state</div><div className="mt-2 text-xl font-black">{state.status}</div></div><span className={`rounded-full border px-3 py-1.5 text-[10px] font-black ${statusTone}`}>{state.status}</span></div>
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600"><strong className="text-slate-900">Work access:</strong> {state.workAccessGranted?'Enabled':'Not enabled yet'}{state.accountStatus?` · Account ${state.accountStatus}`:''}</div>
            {state.approvedBalances?.length ? <div className="mt-5 space-y-2"><div className="text-[10px] font-black uppercase text-slate-400">Approved, unpaid rewards</div>{state.approvedBalances.map(x=><div key={x.currency} className="flex justify-between rounded-xl bg-slate-50 p-3 text-sm"><span>{x.currency}</span><strong>{Number(x.amount||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div>)}</div> : <p className="mt-4 text-xs leading-5 text-slate-500">No approved unpaid rewards yet. Payout setup is still required as part of Talent Partner onboarding.</p>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-black"><LockKeyhole className="h-4 w-4 text-[#000080]"/>Security</div>
            <div className="mt-4 space-y-3 text-xs leading-5 text-slate-600"><Row icon={ShieldCheck} text="Full account details are encrypted in Supabase and never returned to the normal partner dashboard."/><Row icon={Clock3} text="ProFox verification is separate from onboarding: submission can unlock work, but unverified details can never be used for payout."/><Row icon={CheckCircle2} text="Changing verified details resets verification before another payout can use them."/></div>
          </section>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {!editing && hasProfile ? <div>
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="text-[10px] font-black uppercase text-slate-400">Saved payout profile</div><h2 className="mt-2 text-2xl font-black">{state.payoutMethod || 'Payout method'}</h2><p className="mt-2 text-sm text-slate-500">Version {state.detailsVersion || 1} · {state.preferredCurrency || 'USD'}{state.countryCode?` · ${state.countryCode}`:''}</p></div><StatusBadge value={state.status}/></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">{Object.entries(masked).filter(([,v])=>Boolean(v)).map(([k,v])=><div key={k} className="rounded-xl bg-slate-50 p-4"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{labelFor(k)}</div><div className="mt-1 break-all text-sm font-bold">{String(v)}</div></div>)}</div>
            {state.rejectionReason&&<Notice tone="error"><strong>Verification issue:</strong> {state.rejectionReason}</Notice>}
            {state.status==='Verification Pending'&&<Notice tone="info"><strong>Onboarding requirement complete.</strong> If your Talent Partner account is Active, you may start referral work now. ProFox must still verify these details before any approved reward can enter a payout batch.</Notice>}
            {state.status==='Verified'&&<Notice tone="success">This payout profile is verified and can be used for future eligible payout batches. If you change it, verification will be required again.</Notice>}
            <button onClick={()=>{clearSensitive();setEditing(true)}} className="light-button mt-4">{state.status==='Rejected'||state.status==='Disabled'?'Correct payout details':'Change payout details'}</button>
          </div> : <form onSubmit={submit} className="space-y-5">
            <div><div className="text-[10px] font-black uppercase tracking-[.14em] text-[#000080]">Secure details</div><h2 className="mt-2 text-2xl font-black">{hasProfile?'Update payout profile':'Complete mandatory payout setup'}</h2><p className="mt-2 text-sm leading-6 text-slate-500">Choose how ProFox should pay you and provide the complete account details. Previously stored sensitive values are intentionally never sent back to your browser.</p></div>

            <div className="grid gap-4 sm:grid-cols-2"><Field label="Payout method"><select value={method} onChange={e=>setMethod(e.target.value as PayoutMethod)}><option>PayPal</option><option>Wise</option><option>Bank Transfer</option><option>Other</option></select></Field><Field label="Preferred currency"><input required maxLength={3} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase().replace(/[^A-Z]/g,''))} placeholder="USD"/></Field></div>
            <Field label="Account holder name"><input required autoComplete="name" value={details.accountHolderName} onChange={e=>patch('accountHolderName',e.target.value)}/></Field>

            {method==='PayPal'&&<Field label="PayPal email"><input required type="email" autoComplete="off" value={details.paypalEmail} onChange={e=>patch('paypalEmail',e.target.value)}/></Field>}
            {method==='Wise'&&<><Notice tone="info">Wise is currently handled through manual ProFox verification and settlement in this workflow. No automatic provider verification is claimed.</Notice><Field label="Wise account email"><input required type="email" autoComplete="off" value={details.wiseEmail} onChange={e=>patch('wiseEmail',e.target.value)}/></Field></>}
            {method==='Bank Transfer'&&<div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Bank country (ISO 2-letter)"><input required maxLength={2} value={country} onChange={e=>setCountry(e.target.value.toUpperCase().replace(/[^A-Z]/g,''))} placeholder="IN"/></Field><Field label="Bank name"><input required autoComplete="off" value={details.bankName} onChange={e=>patch('bankName',e.target.value)}/></Field></div><Field label="Account number / IBAN"><input required autoComplete="off" value={details.accountNumber} onChange={e=>patch('accountNumber',e.target.value)}/></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Routing code type"><select value={details.routingType} onChange={e=>patch('routingType',e.target.value)}><option>IFSC</option><option>SWIFT/BIC</option><option>Routing/ABA</option><option>BSB</option><option>Sort Code</option><option>Other</option></select></Field><Field label="Routing / IFSC / SWIFT / BIC code"><input required autoComplete="off" value={details.routingCode} onChange={e=>patch('routingCode',e.target.value)}/></Field></div><Field label="Account type (optional)"><input autoComplete="off" value={details.accountType} onChange={e=>patch('accountType',e.target.value)} placeholder="Current / Savings / Checking"/></Field></div>}
            {method==='Other'&&<Field label="Secure payment instructions"><textarea required rows={4} value={details.paymentInstructions} onChange={e=>patch('paymentInstructions',e.target.value)} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none" placeholder="Describe the payout account/instructions ProFox should verify."/></Field>}

            <label className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-xs leading-5 text-slate-600"><input required type="checkbox" className="mt-0.5 h-4 w-4 accent-[#000080]"/><span>I confirm these payout details belong to me or my authorized business account and are accurate. I understand this setup is mandatory before referral work and that ProFox must verify the details before any payout is processed.</span></label>
            <div className="flex flex-col gap-2 sm:flex-row"><button disabled={saving} className="primary">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<CreditCard className="h-4 w-4"/>}{saving?'Encrypting & saving...':'Save payout method & continue'}</button>{hasProfile&&<button type="button" onClick={()=>{clearSensitive();setEditing(false)}} className="light-button">Cancel</button>}</div>
          </form>}
        </section>
      </div>
    </div>
  </div>;
}

function Field({label,children}:{label:string;children:any}){return <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase text-slate-500">{label}</span><div className="[&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-slate-200 [&_input]:px-3.5 [&_input]:py-3 [&_input]:text-sm [&_input]:outline-none [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-slate-200 [&_select]:px-3.5 [&_select]:py-3 [&_select]:text-sm [&_select]:outline-none">{children}</div></label>}
function Notice({tone,children}:{tone:'error'|'success'|'warn'|'info';children:any}){const c={error:'border-red-200 bg-red-50 text-red-700',success:'border-emerald-200 bg-emerald-50 text-emerald-700',warn:'border-amber-200 bg-amber-50 text-amber-800',info:'border-blue-100 bg-blue-50 text-slate-600'}[tone];return <div className={`mt-4 rounded-xl border p-4 text-sm leading-6 ${c}`}>{children}</div>}
function StatusBadge({value}:{value:string}){const l=value.toLowerCase();const c=l==='verified'?'border-emerald-200 bg-emerald-50 text-emerald-700':l==='rejected'||l==='disabled'?'border-red-200 bg-red-50 text-red-700':'border-amber-200 bg-amber-50 text-amber-800';return <span className={`rounded-full border px-3 py-1.5 text-[10px] font-black ${c}`}>{value}</span>}
function Row({icon:Icon,text}:{icon:any;text:string}){return <div className="flex gap-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]"/><span>{text}</span></div>}
function State({title,text,children}:{title:string;text:string;children?:any}){return <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-5"><div className="max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><Landmark className="mx-auto h-10 w-10 text-[#000080]"/><h1 className="mt-4 text-2xl font-black">{title}</h1><p className="mt-3 text-sm leading-6 text-slate-500">{text}</p>{children}</div></div>}
function Loader(){return <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb]"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>}
function labelFor(key:string){return ({accountHolderName:'Account holder',paypalEmail:'PayPal email',wiseEmail:'Wise email',bankName:'Bank',accountNumber:'Account / IBAN',routingType:'Routing type',routingCode:'Routing code',accountType:'Account type',paymentInstructions:'Instructions'} as Record<string,string>)[key]||key.replace(/([A-Z])/g,' $1')}