import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Award,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound
} from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { profileService } from '../../lib/profileService';
import { professionalMailService, type ProfessionalMailSendStatus } from '../../lib/professionalMailService';
import { SellerProfileContext, sellerProfileService } from '../../lib/sellerProfileService';
import { supabase } from '../../lib/supabase';
import AppAvatar from './workspace/AppAvatar';
import ProfileImageUploader from './workspace/ProfileImageUploader';

const SELLER_ROLES = ['sales', 'sales_rep', 'sales_team'];
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100';

function dateTime(value?: string | null) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function label(value?: string | null) {
  if (!value) return 'Not recorded';
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function SellerProfile() {
  const navigate = useNavigate();
  const { user, profile, isAdmin, loading: authLoading, refreshProfile } = useAuth();
  const allowed = Boolean(user && profile?.status === 'active' && (isAdmin || SELLER_ROLES.includes(profile.role)));
  const [context, setContext] = useState<SellerProfileContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ fullName: '', phone: '', country: '', timezone: '', avatarUrl: '' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mailStatus, setMailStatus] = useState<ProfessionalMailSendStatus | null>(null);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailConnecting, setMailConnecting] = useState(false);
  const [mailError, setMailError] = useState('');
  const [mailMessage, setMailMessage] = useState('');
  const oauthWindowRef = useRef<Window | null>(null);
  const oauthOriginRef = useRef('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await sellerProfileService.getMyContext();
      setContext(result);
      setForm({
        fullName: result.profile.fullName || '',
        phone: result.profile.phone || '',
        country: result.profile.country || '',
        timezone: result.profile.timezone || 'UTC',
        avatarUrl: result.profile.avatarUrl || ''
      });
    } catch (err: any) {
      setError(err?.message || 'Unable to load your profile.');
    } finally {
      setLoading(false);
    }
  };

  const loadMailStatus = async () => {
    setMailLoading(true);
    setMailError('');
    try {
      setMailStatus(await professionalMailService.getMyStatus());
    } catch (err: any) {
      setMailError(err?.message || 'Professional email status could not be loaded.');
    } finally {
      setMailLoading(false);
    }
  };

  useEffect(() => {
    if (allowed) {
      void load();
      void loadMailStatus();
    }
  }, [allowed]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== oauthWindowRef.current) return;
      if (oauthOriginRef.current && event.origin !== oauthOriginRef.current) return;
      if (event.data?.type !== 'profox-zoho-mail-send-oauth') return;
      setMailConnecting(false);
      oauthWindowRef.current = null;
      oauthOriginRef.current = '';
      if (event.data?.success) {
        setMailError('');
        setMailMessage('Professional email connected. ProFox can now send and synchronize customer replies through this mailbox.');
        void loadMailStatus();
      } else {
        setMailMessage('');
        setMailError(String(event.data?.message || 'Professional email permission was not connected.'));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const connectProfessionalEmail = async () => {
    setMailConnecting(true);
    setMailError('');
    setMailMessage('');
    try {
      const start = await professionalMailService.startAuthorization();
      oauthOriginRef.current = new URL(start.callbackUrl).origin;
      const popup = window.open(start.authorizeUrl, 'profox-zoho-professional-mail', 'popup=yes,width=680,height=760,resizable=yes,scrollbars=yes');
      if (!popup) throw new Error('Your browser blocked the Zoho authorization window. Allow pop-ups for ProFox and try again.');
      oauthWindowRef.current = popup;
      popup.focus();
    } catch (err: any) {
      setMailConnecting(false);
      oauthWindowRef.current = null;
      oauthOriginRef.current = '';
      setMailError(err?.message || 'Professional email connection could not be started.');
    }
  };

  const syncProfessionalInbox = async () => {
    setMailLoading(true);
    setMailError('');
    setMailMessage('');
    try {
      const result = await professionalMailService.syncInbox();
      setMailMessage(result.synced > 0 ? `${result.synced} customer email ${result.synced === 1 ? 'reply was' : 'replies were'} synchronized into ProFox.` : 'Professional inbox is synchronized. No new matched customer replies were found.');
      await loadMailStatus();
    } catch (err: any) {
      setMailError(err?.message || 'Professional inbox could not be synchronized.');
    } finally {
      setMailLoading(false);
    }
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setSaving(true); setError(''); setMessage('');
    try {
      if (!form.fullName.trim()) throw new Error('Full name is required.');
      try { new Intl.DateTimeFormat('en-US', { timeZone: form.timezone }).format(new Date()); }
      catch { throw new Error('Enter a valid IANA timezone such as Asia/Kolkata or America/New_York.'); }
      const result = await profileService.updateMyProfile(user.id, {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        country: form.country.trim(),
        timezone: form.timezone.trim(),
        avatarUrl: form.avatarUrl.trim()
      });
      if (result.error) throw result.error;
      setMessage('Profile updated. Your canonical ProFox account information is now current.');
      await refreshProfile();
      await load();
    } catch (err: any) {
      setError(err?.message || 'Profile could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordSaving(true); setError(''); setMessage('');
    try {
      if (password.length < 12) throw new Error('Use a password with at least 12 characters.');
      if (password !== confirmPassword) throw new Error('The two password fields do not match.');
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword(''); setConfirmPassword('');
      setMessage('Password updated securely. The password was sent directly to Supabase Auth and was not stored by ProFox.');
    } catch (err: any) {
      setError(err?.message || 'Password could not be updated.');
    } finally {
      setPasswordSaving(false);
    }
  };

  if (authLoading) return <div className="min-h-screen bg-slate-50" />;
  if (!allowed) return <Navigate to="/admin/workspace" replace />;

  const accountEmail = user?.email || context?.profile.email || '';
  const activeMailbox = Boolean(mailStatus?.eligible && mailStatus?.mailboxStatus === 'active' && mailStatus?.mailProvider === 'zoho' && mailStatus?.workEmail);
  const connectedMailbox = Boolean(activeMailbox && mailStatus?.sendConnected);

  return <div className="profox-app-shell min-h-screen bg-[#f3f7fc] text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <button onClick={() => navigate('/admin/seller-command-center')} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1"><h1 className="truncate text-xl font-black">My Profile & Security</h1><p className="truncate text-xs text-slate-500">Your account, professional email, activation evidence, Academy status, agreement and calendar identity in one place.</p></div>
        <AppAvatar name={profile?.fullName || accountEmail} src={form.avatarUrl} size="md" />
      </div>
    </header>

    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</div>}
      {loading || !context ? <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div> : <>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatusCard icon={ShieldCheck} label="Account" value={label(context.profile.status)} note={`${label(context.profile.role)} access`} good={context.profile.status === 'active'} />
          <StatusCard icon={Mail} label="Professional Email" value={connectedMailbox ? 'Connected' : activeMailbox ? 'Setup required' : 'Not ready'} note={mailStatus?.workEmail || 'Customer-facing mailbox'} good={connectedMailbox} />
          <StatusCard icon={FileCheck2} label="Partner Agreement" value={label(context.agreement.status)} note={context.agreement.agreementNumber || 'No agreement number available'} good={Boolean(context.agreement.verifiedAt)} />
          <StatusCard icon={Award} label="Final Certification" value={label(context.academy.finalCertificationStatus)} note={context.academy.finalCertificationScore == null ? label(context.academy.finalCertificationReviewStatus) : `Score ${context.academy.finalCertificationScore}%`} good={context.academy.finalCertificationStatus === 'Passed' || context.academy.finalCertificationStatus === 'Completed'} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <form onSubmit={saveProfile} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="mb-6 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#000080]"><UserRound className="h-5 w-5" /></div><div><h2 className="font-black">Contact & account profile</h2><p className="text-xs text-slate-500">Updates the existing user profile. Role, status and activation authority remain protected.</p></div></div>
            <ProfileImageUploader value={form.avatarUrl} name={form.fullName || accountEmail} onChange={avatarUrl => setForm({...form, avatarUrl})} disabled={saving} />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Full name"><input value={form.fullName} onChange={e => setForm({...form,fullName:e.target.value})} className={inputClass} /></Field>
              <Field label="Account email"><input value={accountEmail} disabled className={`${inputClass} bg-slate-50 text-slate-500`} /></Field>
              <Field label="Phone"><input value={form.phone} onChange={e => setForm({...form,phone:e.target.value})} className={inputClass} /></Field>
              <Field label="Country"><input value={form.country} onChange={e => setForm({...form,country:e.target.value})} className={inputClass} /></Field>
              <Field label="Timezone"><input value={form.timezone} onChange={e => setForm({...form,timezone:e.target.value})} className={inputClass} placeholder="Asia/Kolkata" /></Field>
              <Field label="Department"><input value="Sales & Client Growth" disabled className={`${inputClass} bg-slate-50 text-slate-500`} /></Field>
            </div>
            <div className="mt-6 flex justify-end"><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save profile</button></div>
          </form>

          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><CheckCircle2 className="h-5 w-5" /></div><div><h2 className="font-black">Seller standing</h2><p className="text-xs text-slate-500">Read-only evidence from the owning systems.</p></div></div>
              <div className="mt-5 divide-y divide-slate-100 text-xs">
                <InfoRow label="Activated" value={context.activation.activatedAt ? dateTime(context.activation.activatedAt) : label(context.activation.stage)} />
                <InfoRow label="Onboarding" value={`${label(context.profile.onboardingStatus)} · ${context.profile.onboardingProgress}%`} />
                <InfoRow label="Agreement verified" value={dateTime(context.agreement.verifiedAt)} />
                <InfoRow label="Partner signed" value={dateTime(context.agreement.partnerSignedAt)} />
                <InfoRow label="ProFox countersigned" value={dateTime(context.agreement.companySignedAt)} />
                <InfoRow label="Certification completed" value={dateTime(context.academy.finalCertificationCompletedAt)} />
                <InfoRow label="Commission terms" value={context.agreement.commissionTermsAcknowledgedThroughAgreement ? 'Covered by executed Partner Agreement' : 'No verified agreement evidence'} />
                <InfoRow label="Payout schedule" value={context.commission.payoutSchedule || 'See Commission Settings'} />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2"><button onClick={() => navigate('/admin/app/academy?tab=training')} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-700">Open Sales Academy</button><button onClick={() => navigate('/admin/app/commissions?tab=my_commissions')} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-700">My Commissions</button><button onClick={() => navigate('/admin/booking-setup')} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-700 sm:col-span-2">Calendar & public booking profile</button></div>
            </section>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Mail className="h-5 w-5" /></div><div><h2 className="font-black">Professional Email Setup</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Your Account Email signs you into ProFox. Your Professional Email is the customer-facing identity. Zoho stays in the background as the secure mail transport.</p></div></div>
            <button type="button" disabled={mailLoading} onClick={() => void loadMailStatus()} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-[10px] font-black text-slate-600 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${mailLoading ? 'animate-spin' : ''}`} />Refresh status</button>
          </div>

          {mailError && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-700">{mailError}</div>}
          {mailMessage && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-700">{mailMessage}</div>}

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <EmailIdentityCard label="Account Email" value={accountEmail} note="Use this to sign in to ProFox." good />
            <EmailIdentityCard label="Professional Email" value={mailStatus?.workEmail || 'Not provisioned'} note="Customers see this address." good={activeMailbox} />
            <EmailIdentityCard label="ProFox Mail Connection" value={connectedMailbox ? 'Connected' : mailStatus?.sendConnectionStatus === 'reconnect_required' ? 'Reconnect required' : activeMailbox ? 'Connection required' : 'Not ready'} note={connectedMailbox ? 'Send + customer reply sync enabled.' : 'No mailbox password is stored in the browser.'} good={connectedMailbox} />
          </div>

          <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600 md:grid-cols-3">
            <div><span className="font-black text-slate-900">1. Sign in</span><br />Always use your Account Email and ProFox password.</div>
            <div><span className="font-black text-slate-900">2. Connect once</span><br />Authorize the exact Professional Zoho mailbox shown above.</div>
            <div><span className="font-black text-slate-900">3. Work in ProFox</span><br />Send email and read matched customer replies without operating Zoho day to day.</div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {activeMailbox && !connectedMailbox && <button type="button" disabled={mailConnecting} onClick={() => void connectProfessionalEmail()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{mailConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}{mailConnecting ? 'Waiting for Zoho…' : mailStatus?.sendConnectionStatus === 'reconnect_required' ? 'Reconnect professional email' : 'Connect professional email'}</button>}
            {connectedMailbox && <button type="button" disabled={mailLoading} onClick={() => void syncProfessionalInbox()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{mailLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Sync customer replies</button>}
            {!activeMailbox && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">Your active professional mailbox must be provisioned before connection is available.</div>}
          </div>
        </section>

        <form onSubmit={changePassword} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-[#000080]"><KeyRound className="h-5 w-5" /></div><div><h2 className="font-black">Password & security</h2><p className="text-xs text-slate-500">Change your Supabase Auth password. ProFox never stores the password in application tables.</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="New password"><input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} placeholder="12+ characters" /></Field><Field label="Confirm new password"><input type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} /></Field></div>
          <div className="mt-5 flex items-center justify-between gap-4"><div className="flex items-center gap-2 text-[11px] text-slate-500"><Clock3 className="h-4 w-4" /> Use a unique password and keep your account private.</div><button disabled={passwordSaving || !password} className="rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{passwordSaving ? 'Updating...' : 'Update password'}</button></div>
        </form>
      </>}
    </main>
  </div>;
}

function Field({ label: fieldLabel, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">{fieldLabel}</span>{children}</label>; }
function InfoRow({ label: rowLabel, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4 py-3"><span className="font-bold text-slate-500">{rowLabel}</span><span className="text-right font-black text-slate-800">{value}</span></div>; }
function StatusCard({ icon: Icon, label: cardLabel, value, note, good }: { icon: React.ElementType; label: string; value: string; note: string; good: boolean }) { return <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${good ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}><Icon className="h-5 w-5" /></div><div className="mt-4 text-[10px] font-black uppercase tracking-wider text-slate-400">{cardLabel}</div><div className="mt-1 text-sm font-black text-slate-900">{value}</div><div className="mt-1 break-all text-[10px] leading-4 text-slate-500">{note}</div></div>; }
function EmailIdentityCard({ label: cardLabel, value, note, good }: { label: string; value: string; note: string; good: boolean }) { return <div className={`rounded-2xl border p-4 ${good ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{cardLabel}</div><div className={`mt-1 break-all text-xs font-black ${good ? 'text-emerald-800' : 'text-slate-800'}`}>{value}</div><div className="mt-1 text-[10px] leading-4 text-slate-500">{note}</div></div>; }
