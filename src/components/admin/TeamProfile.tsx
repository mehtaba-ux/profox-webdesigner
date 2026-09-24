import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Save, ShieldCheck, UserRound } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { departmentDefinitionForRole } from '../../lib/organization';
import { ROLE_LABELS } from '../../types';
import AppAvatar from './workspace/AppAvatar';
import ProfileImageUploader from './workspace/ProfileImageUploader';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100';

export default function TeamProfile() {
  const navigate = useNavigate();
  const { user, profile, role, loading, updateMyProfile } = useAuth();
  const [form, setForm] = useState({ fullName: '', phone: '', country: '', timezone: '', avatarUrl: '' });
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile) return;
    setForm({
      fullName: profile.fullName || '',
      phone: profile.phone || '',
      country: profile.country || '',
      timezone: profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      avatarUrl: profile.avatarUrl || ''
    });
  }, [profile]);

  if (loading) return <div className="min-h-screen bg-[#f3f7fc]" />;
  if (!user || !profile || ['customer', 'pending'].includes(String(role || ''))) {
    return <Navigate to="/admin" replace />;
  }

  const department = departmentDefinitionForRole(role);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (!form.fullName.trim()) throw new Error('Full name is required.');
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: form.timezone.trim() }).format(new Date());
      } catch {
        throw new Error('Enter a valid timezone such as Asia/Kolkata or America/New_York.');
      }
      const result = await updateMyProfile({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        country: form.country.trim(),
        timezone: form.timezone.trim(),
        avatarUrl: form.avatarUrl.trim()
      });
      if (!result.success) throw new Error(result.error || 'Profile could not be saved.');
      setMessage('Your profile has been updated across the ProFox workspace.');
    } catch (saveError: any) {
      setError(saveError?.message || 'Profile could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordSaving(true);
    setError('');
    setMessage('');
    try {
      if (password.length < 12) throw new Error('Use a password with at least 12 characters.');
      if (password !== confirmPassword) throw new Error('The two password fields do not match.');
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;
      setPassword('');
      setConfirmPassword('');
      setMessage('Your password has been updated securely.');
    } catch (passwordError: any) {
      setError(passwordError?.message || 'Password could not be updated.');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="profox-app-shell min-h-screen bg-[#f3f7fc] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 px-4 py-4 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => navigate('/admin/workspace')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:text-[#000080]" aria-label="Back to workspace">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-black tracking-tight sm:text-xl">My Profile</h1>
              <p className="truncate text-[11px] text-slate-500">Your shared identity across the ProFox application</p>
            </div>
          </div>
          <AppAvatar name={profile.fullName || user.email} src={form.avatarUrl} size="md" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
        {message && <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />{message}</div>}

        <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-[linear-gradient(135deg,#000080,#2d4fd7)] px-5 py-7 text-white sm:px-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <AppAvatar name={profile.fullName || user.email} src={form.avatarUrl} size="xl" className="ring-white/20" />
              <div className="min-w-0">
                <h2 className="truncate text-2xl font-black tracking-tight">{profile.fullName || user.email}</h2>
                <p className="mt-1 text-sm font-semibold text-blue-100">{ROLE_LABELS[profile.role] || profile.role}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider">
                  <span className="rounded-full bg-white/15 px-3 py-1">{department.shortLabel}</span>
                  <span className="rounded-full bg-white/15 px-3 py-1">{profile.status}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <form onSubmit={saveProfile} className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#000080]"><UserRound className="h-5 w-5" /></div>
              <div><h2 className="font-black">Contact and profile information</h2><p className="mt-1 text-xs leading-5 text-slate-500">Your photo and details are reused dynamically wherever your team identity appears.</p></div>
            </div>

            <ProfileImageUploader value={form.avatarUrl} name={form.fullName || profile.email} onChange={avatarUrl => setForm(current => ({ ...current, avatarUrl }))} disabled={saving} />

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Full name"><input value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} className={inputClass} /></Field>
              <Field label="Email"><input value={profile.email} disabled className={`${inputClass} bg-slate-50 text-slate-500`} /></Field>
              <Field label="Phone"><input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} className={inputClass} /></Field>
              <Field label="Country"><input value={form.country} onChange={event => setForm({ ...form, country: event.target.value })} className={inputClass} /></Field>
              <Field label="Timezone"><input value={form.timezone} onChange={event => setForm({ ...form, timezone: event.target.value })} className={inputClass} placeholder="Asia/Kolkata" /></Field>
              <Field label="Department"><input value={department.label} disabled className={`${inputClass} bg-slate-50 text-slate-500`} /></Field>
            </div>
            <div className="mt-6 flex justify-end">
              <button disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-5 text-xs font-black text-white shadow-sm transition hover:bg-[#000066] disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save profile
              </button>
            </div>
          </form>

          <div className="space-y-5">
            <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div><div><h2 className="font-black">Canonical team identity</h2><p className="mt-1 text-xs leading-5 text-slate-500">The database profile is the source for Team, internal chat and other staff-facing screens.</p></div></div>
            </section>

            <form onSubmit={changePassword} className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#000080]"><KeyRound className="h-5 w-5" /></div><div><h2 className="font-black">Password and security</h2><p className="mt-1 text-xs leading-5 text-slate-500">Passwords are handled directly by Supabase Auth.</p></div></div>
              <div className="mt-5 space-y-4">
                <Field label="New password"><input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className={inputClass} placeholder="12+ characters" /></Field>
                <Field label="Confirm password"><input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className={inputClass} /></Field>
              </div>
              <button disabled={passwordSaving || !password} className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-900 px-4 text-xs font-black text-white disabled:opacity-50">
                {passwordSaving && <Loader2 className="h-4 w-4 animate-spin" />} Update password
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>;
}
