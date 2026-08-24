import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const TRACK_COPY: Record<string, { academy: string; access: string }> = {
  sales: { academy: 'ProFox Sales Academy', access: 'Operational Sales workspace access' },
  content_delivery: { academy: 'ProFox Content Academy', access: 'Production Content Delivery workspace and client-project access' },
  uiux_design: { academy: 'ProFox Design Academy', access: 'Production UI/UX workspace access' },
  web_development: { academy: 'ProFox Developer Academy', access: 'Production Development workspace and client-project access' }
};

export default function SalesOnboardingSetup() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [checking, setChecking] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  const routeDefaultTrack = location.pathname.includes('/team-onboarding/') ? 'content_delivery' : 'sales';
  const track = searchParams.get('track') || routeDefaultTrack;
  const copy = useMemo(() => TRACK_COPY[track] || { academy: 'ProFox Academy', access: 'Production workspace access' }, [track]);

  useEffect(() => {
    let mounted = true;
    let timer: number | undefined;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data?.session?.user) { setSessionReady(true); setChecking(false); }
      else timer = window.setTimeout(() => { if (!mounted) return; setSessionReady(false); setChecking(false); }, 1800);
    };
    void check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      if (!mounted) return;
      if (session?.user) { if (timer) window.clearTimeout(timer); setSessionReady(true); setChecking(false); }
    });
    return () => { mounted = false; if (timer) window.clearTimeout(timer); subscription.unsubscribe(); };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 12) { setError('Use at least 12 characters for your password.'); return; }
    if (password !== confirmPassword) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setComplete(true);
      window.setTimeout(() => navigate('/admin', { replace: true }), 900);
    } catch (err) {
      const text = err && typeof err === 'object' && 'message' in err ? String((err as any).message) : 'Your password could not be saved.';
      setError(text);
    } finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 sm:py-16">
      <div className="mx-auto w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
        <div className="border-b border-slate-100 px-6 py-7 sm:px-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#000080] text-white"><LockKeyhole className="h-5 w-5" /></div>
          <div className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{copy.academy}</div>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Set up your account</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Create your password to enter the {copy.academy.replace('ProFox ', '')}. {copy.access} remains locked until required training, Final Certification and Management activation are complete.</p>
        </div>
        <div className="p-6 sm:p-8">
          {checking ? <div className="flex min-h-[220px] flex-col items-center justify-center text-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /><p className="mt-3 text-xs font-bold text-slate-500">Verifying your secure invitation...</p></div> : complete ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><h2 className="mt-3 text-base font-black text-emerald-800">Account ready</h2><p className="mt-1 text-xs leading-5 text-emerald-700">Your password is saved. Opening your {copy.academy.replace('ProFox ', '')} workspace now.</p></div> : !sessionReady ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><h2 className="text-sm font-black text-amber-800">This setup link is not active</h2><p className="mt-1 text-xs leading-5 text-amber-700">The invitation may have expired or already been used. Return to the newest {copy.academy} access email. If needed, ask the recruitment team to resend access from your candidate record.</p></div></div></div> : <form onSubmit={submit} className="space-y-5">
            {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
            <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-500">New password</span><div className="relative"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-sm outline-none focus:border-[#000080]" /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div><p className="mt-1.5 text-[10px] leading-4 text-slate-400">Use at least 12 characters and choose a password you do not reuse elsewhere.</p></label>
            <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-500">Confirm password</span><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#000080]" /></label>
            <button type="submit" disabled={busy || password.length < 12 || confirmPassword.length < 12} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Save Password & Open Academy</button>
          </form>}
        </div>
      </div>
    </main>
  );
}
