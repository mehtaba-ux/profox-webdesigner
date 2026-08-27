import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, KeyRound, Loader2, Lock, LogOut, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import ClientDashboard from './ClientDashboard';

function messageOf(error: any, fallback: string) {
  return error?.message || fallback;
}

export default function ClientPortalEntry() {
  const { user, profile, loading, refreshProfile, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite') || '';
  const [inviteInfo, setInviteInfo] = useState<any>(null);
  const [inviteLoading, setInviteLoading] = useState(Boolean(inviteToken));
  const [inviteError, setInviteError] = useState('');
  const [mode, setMode] = useState<'signin' | 'activate'>(inviteToken ? 'activate' : 'signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState('');
  const claimAttempt = useRef('');

  useEffect(() => {
    if (!inviteToken) { setInviteLoading(false); return; }
    setInviteLoading(true);
    setInviteError('');
    void supabase.rpc('public_client_portal_invite_status', { p_token: inviteToken }).then(({ data, error }) => {
      if (error || !data) {
        setInviteError(messageOf(error, 'This Client Portal activation link is invalid or expired.'));
        setInviteInfo(null);
        setMode('signin');
      } else {
        setInviteInfo(data);
        setEmail(data.email || '');
        setFullName(data.contactName || '');
        setMode(data.alreadyLinked ? 'signin' : 'activate');
      }
      setInviteLoading(false);
    });
  }, [inviteToken]);

  useEffect(() => {
    if (!user || !profile || profile.role === 'customer' && profile.status === 'active') return;
    if (!inviteToken || !['pending', 'customer'].includes(profile.role)) return;
    const key = `${user.id}:${inviteToken}:${profile.role}:${profile.status}`;
    if (claimAttempt.current === key) return;
    claimAttempt.current = key;
    setClaimBusy(true);
    setClaimError('');
    void supabase.rpc('customer_portal_claim_identity', { p_invite_token: inviteToken }).then(async ({ error }) => {
      if (error) setClaimError(messageOf(error, 'Client Portal activation could not be completed.'));
      else await refreshProfile();
      setClaimBusy(false);
    });
  }, [user?.id, profile?.role, profile?.status, inviteToken, refreshProfile]);

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError('');
    setAuthNotice('');
    const normalizedEmail = email.trim().toLowerCase();

    if (mode === 'activate') {
      if (!inviteToken || !inviteInfo) {
        setAuthError('A valid Client Portal invitation is required to create an account.');
        setAuthBusy(false);
        return;
      }
      if (normalizedEmail !== String(inviteInfo.email || '').trim().toLowerCase()) {
        setAuthError('Use the same email address registered for this ProFox client relationship.');
        setAuthBusy(false);
        return;
      }
      const redirectTo = `${window.location.origin}/client-portal?invite=${encodeURIComponent(inviteToken)}`;
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { emailRedirectTo: redirectTo, data: { full_name: fullName.trim() || inviteInfo.contactName || '' } }
      });
      if (error) setAuthError(messageOf(error, 'Client Portal account could not be created.'));
      else if (data.session) setAuthNotice('Account created. Activating your ProFox Client Portal…');
      else setAuthNotice('Account created. Verify the email we sent you, then you will return here to finish portal activation.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) setAuthError('Invalid email/password or this Client Portal account has not been confirmed yet.');
    }
    setAuthBusy(false);
  };

  const resetPassword = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) { setAuthError('Enter your registered Client Portal email first.'); return; }
    setAuthBusy(true);
    setAuthError('');
    const suffix = inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : '';
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: `${window.location.origin}/client-portal${suffix}` });
    setAuthNotice(error ? '' : 'If this email has a Client Portal account, a password reset link has been sent.');
    if (error) setAuthError('Password reset email could not be sent.');
    setAuthBusy(false);
  };

  if (loading || inviteLoading || claimBusy) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /><p className="text-sm font-semibold text-slate-500">{claimBusy ? 'Activating your secure Client Portal…' : 'Loading secure Client Portal…'}</p></div>;
  }

  if (user && profile?.role === 'customer' && profile.status === 'active') return <ClientDashboard />;

  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-xl">
          <ShieldCheck className="mx-auto h-12 w-12 text-[#000080]" />
          <h1 className="mt-4 text-xl font-black text-slate-900">Client Portal activation is not complete</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">You are signed in as <strong>{user.email}</strong>. Full Client Portal access requires a verified first payment, completed client onboarding, and the activation invitation issued for that same email.</p>
          {(claimError || inviteError) && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">{claimError || inviteError}</div>}
          <button type="button" onClick={() => void logout()} className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-bold text-slate-700"><LogOut className="h-4 w-4" />Sign Out</button>
        </div>
      </div>
    );
  }

  const canActivate = Boolean(inviteToken && inviteInfo && !inviteInfo.alreadyLinked && !inviteError);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-[2.5rem] border border-slate-100 bg-white shadow-2xl">
        <div className="bg-[#000080] p-9 text-center text-white">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">{mode === 'activate' ? <UserPlus className="h-8 w-8" /> : <Lock className="h-8 w-8" />}</div>
          <h1 className="text-2xl font-black">{mode === 'activate' ? 'Activate Client Portal' : 'Secure Client Portal'}</h1>
          <p className="mt-2 text-sm leading-6 text-blue-200">{mode === 'activate' ? 'Create access only with the verified email attached to your completed ProFox onboarding.' : 'Sign in to your existing ProFox Client Portal.'}</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-5 p-8">
          {inviteInfo && <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-800"><div className="font-black">{inviteInfo.projectNumber} · {inviteInfo.projectName}</div><div className="mt-1">Portal identity: {inviteInfo.email}</div></div>}
          {inviteError && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">{inviteError}</div>}
          {authError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{authError}</div>}
          {authNotice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{authNotice}</div>}

          {mode === 'activate' && <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Your Name</span><input required value={fullName} onChange={event => setFullName(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-[#000080]" /></label>}
          <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Email</span><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="email" required autoComplete="email" readOnly={mode === 'activate'} value={email} onChange={event => setEmail(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none focus:border-[#000080] read-only:text-slate-500" /></div></label>
          <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">{mode === 'activate' ? 'Create Password' : 'Password'}</span><div className="relative"><KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="password" required minLength={6} autoComplete={mode === 'activate' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none focus:border-[#000080]" /></div></label>

          <button type="submit" disabled={authBusy || (mode === 'activate' && !canActivate)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#000080] py-3.5 text-sm font-bold text-white disabled:opacity-50">{authBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{mode === 'activate' ? 'Create & Verify Portal Account' : 'Sign In'}</button>

          {canActivate && <button type="button" disabled={authBusy} onClick={() => { setMode(current => current === 'signin' ? 'activate' : 'signin'); setAuthError(''); setAuthNotice(''); }} className="w-full text-center text-xs font-bold text-[#000080] hover:underline">{mode === 'activate' ? 'Already created your account? Sign in' : 'Use this invitation to create your account'}</button>}
          {mode === 'signin' && <button type="button" disabled={authBusy} onClick={() => void resetPassword()} className="w-full text-center text-xs font-bold text-slate-500 hover:underline">Forgot password?</button>}

          {!inviteToken && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-500"><strong>New client?</strong> Portal accounts are invitation-only. After your first required payment is verified and mandatory onboarding is completed, ProFox sends your activation link automatically.</div>}
        </form>
      </div>
    </div>
  );
}
