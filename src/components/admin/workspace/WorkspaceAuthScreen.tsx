import React from 'react';
import { ArrowLeft, Check, Key, LogIn, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Logo from '../../Logo';

interface WorkspaceAuthScreenProps {
  authMode: 'login' | 'register';
  authLoading: boolean;
  authError: string;
  registerSuccessMsg: string;
  fullName: string;
  email: string;
  password: string;
  onModeChange: (mode: 'login' | 'register') => void;
  onFullNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onGoogle: () => void;
  onResendVerification: () => void;
}

export default function WorkspaceAuthScreen({
  authMode,
  authLoading,
  authError,
  registerSuccessMsg,
  fullName,
  email,
  password,
  onModeChange,
  onFullNameChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onGoogle,
  onResendVerification
}: WorkspaceAuthScreenProps) {
  const navigate = useNavigate();
  const changeMode = (mode: 'login' | 'register') => onModeChange(mode);

  return (
    <div className="min-h-screen bg-[#f3f7fc] p-3 font-sans sm:p-5 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-24px)] w-full max-w-[1360px] overflow-hidden rounded-[24px] border border-white bg-white shadow-[0_24px_70px_rgba(31,42,68,0.10)] sm:min-h-[calc(100vh-40px)] lg:min-h-[calc(100vh-64px)] lg:grid-cols-[1fr_1fr]">
        <aside className="relative hidden overflow-hidden bg-[radial-gradient(circle_at_78%_18%,_#2929a5_0,_transparent_30%),linear-gradient(145deg,#000080,#08086f)] p-12 text-white lg:flex lg:flex-col xl:p-16">
          <div className="relative z-10 h-12 w-44"><Logo light className="h-full max-w-full" /></div>
          <div className="relative z-10 mt-14 max-w-lg">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/60">ProFox Workspace</div>
            <h1 className="mt-4 text-[clamp(34px,3.2vw,50px)] font-bold leading-[1.12] tracking-[-0.04em]">Your place to work.<br />Plan. Create. Deliver.</h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-white/68">One professional workspace for your projects, customers, team and daily operations.</p>
          </div>
          <img src="/assets/admin/workspace-auth-illustration.png" alt="Team member organizing a project board" className="relative z-10 mt-auto w-full max-w-[620px] self-center object-contain" />
          <div className="pointer-events-none absolute -bottom-28 -left-24 h-72 w-72 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -bottom-10 -left-4 h-40 w-40 rounded-full border border-white/10" />
        </aside>

        <section className="flex min-w-0 items-center justify-center overflow-y-auto px-5 py-10 sm:px-10 lg:px-14 xl:px-20">
          <div className="w-full max-w-[430px]">
            <div className="mb-8 lg:hidden"><div className="h-12 w-40"><Logo className="h-full max-w-full" /></div></div>
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#000080]">Secure employee access</div>
              <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.03em] text-[#111b30] sm:text-[30px]">{authMode === 'login' ? 'Sign in to ProFox' : 'Request your ProFox account'}</h2>
              <p className="mt-2 text-xs leading-6 text-[#7b8799]">{authMode === 'login' ? 'Use the email connected to your ProFox account. Your professional @profoxwebdesigner.com mailbox is for customer communication, not sign-in.' : 'Your request continues through the existing qualification, certification and approval flow.'}</p>
            </div>

            {registerSuccessMsg && (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
                <div className="flex items-center gap-2 font-extrabold"><Check className="h-4 w-4 text-emerald-600" />Registration submitted</div>
                <p className="mt-2 text-[11px] leading-5 text-emerald-700">{registerSuccessMsg}</p>
                <button type="button" onClick={() => changeMode('login')} className="mt-2 text-[11px] font-extrabold text-emerald-900 underline">Proceed to sign in</button>
              </div>
            )}

            {authError && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700">
                <p>{authError}</p>
                {authError.includes('not been confirmed') && (
                  <button type="button" onClick={onResendVerification} disabled={authLoading} className="mt-2 text-[10px] font-extrabold uppercase tracking-wider text-red-700 underline disabled:opacity-50">{authLoading ? 'Sending...' : 'Resend verification email'}</button>
                )}
              </div>
            )}

            <form onSubmit={onSubmit} className="mt-7 space-y-5">
              {authMode === 'register' && (
                <div>
                  <label htmlFor="workspace-full-name" className="mb-2 block text-[11px] font-extrabold text-[#344054]">Full name</label>
                  <input id="workspace-full-name" type="text" required autoComplete="name" value={fullName} onChange={event => onFullNameChange(event.target.value)} placeholder="e.g. Alex Morgan" className="h-12 w-full rounded-xl border border-[#dde4ee] bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-[#000080]/40 focus:ring-4 focus:ring-[#000080]/5" />
                </div>
              )}

              <div>
                <label htmlFor="workspace-email" className="mb-2 block text-[11px] font-extrabold text-[#344054]">{authMode === 'login' ? 'Account email address' : 'Email address'}</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input id="workspace-email" type="email" required autoComplete="email" value={email} onChange={event => onEmailChange(event.target.value)} placeholder="your.account@email.com" className="h-12 w-full rounded-xl border border-[#dde4ee] bg-white pl-11 pr-4 text-sm text-slate-800 outline-none transition focus:border-[#000080]/40 focus:ring-4 focus:ring-[#000080]/5" />
                </div>
              </div>

              <div>
                <label htmlFor="workspace-password" className="mb-2 block text-[11px] font-extrabold text-[#344054]">Password</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input id="workspace-password" type="password" required autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => onPasswordChange(event.target.value)} placeholder="••••••••" className="h-12 w-full rounded-xl border border-[#dde4ee] bg-white pl-11 pr-4 text-sm text-slate-800 outline-none transition focus:border-[#000080]/40 focus:ring-4 focus:ring-[#000080]/5" />
                </div>
              </div>

              {authMode === 'register' && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-[10px] leading-5 text-blue-900">
                  <p className="flex items-center gap-2 font-extrabold"><ShieldCheck className="h-3.5 w-3.5" />Controlled access</p>
                  New accounts remain pending until the existing administrator approval and role qualification process is completed.
                </div>
              )}

              <button type="submit" disabled={authLoading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#000080] text-xs font-extrabold text-white shadow-[0_9px_22px_rgba(0,0,128,0.18)] transition hover:bg-[#000066] disabled:opacity-60">
                {authLoading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : authMode === 'login' ? <><LogIn className="h-4 w-4" />Sign in</> : <><UserPlus className="h-4 w-4" />Submit account request</>}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3 text-[9px] font-bold uppercase tracking-wider text-slate-400"><span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" /></div>
            <button type="button" onClick={onGoogle} disabled={authLoading} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#dde4ee] bg-white text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.2 9 5 12 5z"/><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"/><path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9c-.8-.9-1.3-2.1-1.3-3.6z"/><path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.2-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"/></svg>
              Continue with Google
            </button>

            <div className="mt-6 flex flex-col items-center justify-between gap-3 text-[11px] sm:flex-row">
              <button type="button" onClick={() => changeMode(authMode === 'login' ? 'register' : 'login')} className="font-extrabold text-[#000080] hover:underline">{authMode === 'login' ? "Don't have an account? Request access" : 'Already approved? Sign in'}</button>
              <button type="button" onClick={() => navigate('/')} className="inline-flex items-center gap-1.5 font-bold text-slate-400 transition hover:text-slate-600"><ArrowLeft className="h-3.5 w-3.5" />Website</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
