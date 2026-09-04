import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, KeyRound, Loader2, Lock, LogOut, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import ClientDashboard from './ClientDashboard';

const CLIENT_PORTAL_RECOVERY_ORIGIN = 'https://www.profoxwebdesigner.com';

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
  const [verificationQueued, setVerificationQueued] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(() => window.location.hash.includes('type=recovery') || searchParams.get('type') === 'recovery' || searchParams.get('recovery') === '1');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryComplete, setRecoveryComplete] = useState(false);
  const claimAttempt = useRef('');

  useEffect(() => {
    setVerificationQueued(false);
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        setRecoveryError('');
        setRecoveryComplete(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

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

  const queuePortalVerification = async (action: 'create' | 'resend') => {
    const { data, error } = await supabase.functions.invoke('client-portal-verification', {
      body: {
        action,
        inviteToken,
        fullName: fullName.trim() || inviteInfo?.contactName || '',
        ...(action === 'create' ? { password } : {}),
      },
    });
    if (error || data?.verificationQueued !== true) {
      throw new Error(String(data?.error || messageOf(error, 'Client Portal verification email could not be queued.')));
    }
    return data;
  };

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
      try {
        await queuePortalVerification('create');
        setVerificationQueued(true);
        setPassword('');
        setAuthNotice('Verification email queued securely through ProFox. Open that email to verify your address and return here to finish activation.');
      } catch (error) {
        setAuthError(messageOf(error, 'Client Portal account could not be prepared.'));
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) setAuthError('Invalid email/password or this Client Portal account has not been confirmed yet.');
    }
    setAuthBusy(false);
  };

  const resendVerification = async () => {
    if (!inviteToken || !inviteInfo) return;
    setAuthBusy(true);
    setAuthError('');
    setAuthNotice('');
    try {
      const data = await queuePortalVerification('resend');
      setVerificationQueued(true);
      setAuthNotice(`Another verification email was queued securely through ProFox${data?.attempt ? ` (attempt ${data.attempt})` : ''}.`);
    } catch (error) {
      setAuthError(messageOf(error, 'Verification email could not be queued again.'));
    }
    setAuthBusy(false);
  };

  const resetPassword = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) { setAuthError('Enter your registered Client Portal email first.'); return; }
    setAuthBusy(true);
    setAuthError('');
    const recoveryParams = new URLSearchParams({ recovery: '1' });
    if (inviteToken) recoveryParams.set('invite', inviteToken);
    const redirectTo = `${CLIENT_PORTAL_RECOVERY_ORIGIN}/client-portal?${recoveryParams.toString()}`;
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
    setAuthNotice(error ? '' : 'If this email has a Client Portal account, a password reset link has been sent.');
    if (error) setAuthError('Password reset email could not be sent.');
    setAuthBusy(false);
  };

  const updateRecoveredPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setRecoveryError('');
    if (!user) {
      setRecoveryError('This password recovery link is no longer valid. Request a new password reset email.');
      return;
    }
    if (recoveryPassword.length < 6) {
      setRecoveryError('Password must be at least 6 characters.');
      return;
    }
    if (recoveryPassword !== recoveryConfirm) {
      setRecoveryError('Passwords do not match.');
      return;
    }

    setRecoveryBusy(true);
    const { error } = await supabase.auth.updateUser({ password: recoveryPassword });
    if (error) {
      setRecoveryError(messageOf(error, 'Your password could not be updated. Request a new recovery link and try again.'));
    } else {
      setRecoveryComplete(true);
      setRecoveryPassword('');
      setRecoveryConfirm('');
      const cleanUrl = inviteToken ? `/client-portal?invite=${encodeURIComponent(inviteToken)}` : '/client-portal';
      window.history.replaceState({}, document.title, cleanUrl);
    }
    setRecoveryBusy(false);
  };

  if (loading || inviteLoading || claimBusy) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /><p className="text-sm font-semibold text-slate-500">{claimBusy ? 'Activating your secure Client Portal…' : 'Loading secure Client Portal…'}</p></div>;
  }

  if (recoveryMode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md overflow-hidden rounded-[2.5rem] border border-slate-100 bg-white shadow-2xl">
          <div className="bg-[#000080] p-9 text-center text-white">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">{recoveryComplete ? <CheckCircle2 className="h-8 w-8" /> : <KeyRound className="h-8 w-8" />}</div>
            <h1 className="text-2xl font-black">{recoveryComplete ? 'Password Updated' : 'Set a New Password'}</h1>
            <p className="mt-2 text-sm leading-6 text-blue-200">{recoveryComplete ? 'Your Client Portal password has been changed securely.' : 'Choose a new password for your verified ProFox Client Portal account.'}</p>
          </div>

          {recoveryComplete ? (
            <div className="space-y-5 p-8 text-center">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold leading-5 text-emerald-800">Your new password is active. Continue to your Client Portal.</div>
              <button type="button" onClick={() => setRecoveryMode(false)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#000080] py-3.5 text-sm font-bold text-white"><ArrowRight className="h-4 w-4" />Continue to Client Portal</button>
            </div>
          ) : (
            <form onSubmit={updateRecoveredPassword} className="space-y-5 p-8">
              {recoveryError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{recoveryError}</div>}
              {!user && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">This recovery session is unavailable or expired. Return to sign in and request a new password reset email.</div>}
              <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">New Password</span><div className="relative"><KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="password" required minLength={6} autoComplete="new-password" value={recoveryPassword} onChange={event => setRecoveryPassword(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none focus:border-[#000080]" /></div></label>
              <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Confirm New Password</span><div className="relative"><KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="password" required minLength={6} autoComplete="new-password" value={recoveryConfirm} onChange={event => setRecoveryConfirm(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none focus:border-[#000080]" /></div></label>
              <button type="submit" disabled={recoveryBusy || !user} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#000080] py-3.5 text-sm font-bold text-white disabled:opacity-50">{recoveryBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Update Password</button>
              <button type="button" disabled={recoveryBusy} onClick={() => setRecoveryMode(false)} className="w-full text-center text-xs font-bold text-slate-500 hover:underline">Return to sign in</button>
            </form>
          )}
        </div>
      </div>
    );
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
          <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">{mode === 'activate' ? 'Create Password' : 'Password'}</span><div className="relative"><KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="password" required={!verificationQueued || mode === 'signin'} minLength={6} autoComplete={mode === 'activate' ? 'new-password' : 'current-password'} disabled={mode === 'activate' && verificationQueued} value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none focus:border-[#000080] disabled:opacity-60" /></div></label>

          <button type="submit" disabled={authBusy || (mode === 'activate' && (!canActivate || verificationQueued))} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#000080] py-3.5 text-sm font-bold text-white disabled:opacity-50">{authBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{mode === 'activate' ? (verificationQueued ? 'Verification Queued' : 'Create & Verify Portal Account') : 'Sign In'}</button>

          {mode === 'activate' && verificationQueued && <button type="button" disabled={authBusy} onClick={() => void resendVerification()} className="w-full rounded-xl border border-[#000080]/20 bg-blue-50 py-3 text-xs font-black text-[#000080] disabled:opacity-50">Queue another verification email</button>}
          {canActivate && <button type="button" disabled={authBusy} onClick={() => { setMode(current => current === 'signin' ? 'activate' : 'signin'); setAuthError(''); setAuthNotice(''); }} className="w-full text-center text-xs font-bold text-[#000080] hover:underline">{mode === 'activate' ? 'Already created your account? Sign in' : 'Use this invitation to create your account'}</button>}
          {mode === 'signin' && <button type="button" disabled={authBusy} onClick={() => void resetPassword()} className="w-full text-center text-xs font-bold text-slate-500 hover:underline">Forgot password?</button>}

          {!inviteToken && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-500"><strong>New client?</strong> Portal accounts are invitation-only. After your first required payment is verified and mandatory onboarding is completed, ProFox sends your activation link automatically.</div>}
        </form>
      </div>
    </div>
  );
}
