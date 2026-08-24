import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Award,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
  UserRound
} from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { profileService } from '../../lib/profileService';
import { SellerProfileContext, sellerProfileService } from '../../lib/sellerProfileService';
import { supabase } from '../../lib/supabase';

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
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
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

  useEffect(() => {
    if (allowed) void load();
  }, [allowed]);

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

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <button onClick={() => navigate('/admin/seller-command-center')} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button>
        <div><h1 className="text-xl font-black">My Profile & Security</h1><p className="text-xs text-slate-500">Your account, activation evidence, Academy status, agreement and calendar identity in one place.</p></div>
      </div>
    </header>

    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</div>}
      {loading || !context ? <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div> : <>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatusCard icon={ShieldCheck} label="Account" value={label(context.profile.status)} note={`${label(context.profile.role)} access`} good={context.profile.status === 'active'} />
          <StatusCard icon={CalendarDays} label="Activated" value={context.activation.activatedAt ? dateTime(context.activation.activatedAt) : label(context.activation.stage)} note={context.activation.finalApproval ? 'Final Approval recorded' : 'Canonical recruitment record'} good={context.activation.stage === 'Activated'} />
          <StatusCard icon={FileCheck2} label="Partner Agreement" value={label(context.agreement.status)} note={context.agreement.agreementNumber || 'No agreement number available'} good={Boolean(context.agreement.verifiedAt)} />
          <StatusCard icon={Award} label="Final Certification" value={label(context.academy.finalCertificationStatus)} note={context.academy.finalCertificationScore == null ? label(context.academy.finalCertificationReviewStatus) : `Score ${context.academy.finalCertificationScore}%`} good={context.academy.finalCertificationStatus === 'Passed' || context.academy.finalCertificationStatus === 'Completed'} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <form onSubmit={saveProfile} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="mb-6 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#000080]"><UserRound className="h-5 w-5" /></div><div><h2 className="font-black">Contact & account profile</h2><p className="text-xs text-slate-500">Updates the existing user profile. Role, status and activation authority remain protected.</p></div></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name"><input value={form.fullName} onChange={e => setForm({...form,fullName:e.target.value})} className={inputClass} /></Field>
              <Field label="Email"><input value={context.profile.email} disabled className={`${inputClass} bg-slate-50 text-slate-500`} /></Field>
              <Field label="Phone"><input value={form.phone} onChange={e => setForm({...form,phone:e.target.value})} className={inputClass} /></Field>
              <Field label="Country"><input value={form.country} onChange={e => setForm({...form,country:e.target.value})} className={inputClass} /></Field>
              <Field label="Timezone"><input value={form.timezone} onChange={e => setForm({...form,timezone:e.target.value})} className={inputClass} placeholder="Asia/Kolkata" /></Field>
              <Field label="Avatar URL"><input value={form.avatarUrl} onChange={e => setForm({...form,avatarUrl:e.target.value})} className={inputClass} placeholder="https://" /></Field>
            </div>
            <div className="mt-6 flex justify-end"><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save profile</button></div>
          </form>

          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><CheckCircle2 className="h-5 w-5" /></div><div><h2 className="font-black">Seller standing</h2><p className="text-xs text-slate-500">Read-only evidence from the owning systems.</p></div></div>
              <div className="mt-5 divide-y divide-slate-100 text-xs">
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
function StatusCard({ icon: Icon, label: cardLabel, value, note, good }: { icon: React.ElementType; label: string; value: string; note: string; good: boolean }) { return <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${good ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}><Icon className="h-5 w-5" /></div><div className="mt-4 text-[10px] font-black uppercase tracking-wider text-slate-400">{cardLabel}</div><div className="mt-1 text-sm font-black text-slate-900">{value}</div><div className="mt-1 text-[10px] leading-4 text-slate-500">{note}</div></div>; }
