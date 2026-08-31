import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Save, Settings, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { DEFAULT_MEETING_SETTINGS, MeetingSettings, meetingService } from '../../lib/meetingService';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#000080] focus:ring-2 focus:ring-[#000080]/10';

function parseNumberList(value: string) {
  return Array.from(new Set(value.split(',').map(v => Number(v.trim())).filter(Number.isFinite)));
}

function parseTextList(value: string) {
  return Array.from(new Set(value.split(',').map(v => v.trim()).filter(Boolean)));
}

export default function MeetingSettingsAdmin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [form, setForm] = useState<MeetingSettings>(DEFAULT_MEETING_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const openedFromSettings = (location.state as { fromWorkspaceApp?: string } | null)?.fromWorkspaceApp === 'settings';
  const backTarget = openedFromSettings ? '/admin/app/settings?tab=configuration' : '/admin/meetings';
  const backLabel = openedFromSettings ? 'Back to Settings' : 'Back to Meetings';

  useEffect(() => {
    if (!user || !isAdmin) {
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        setForm(await meetingService.getMeetingSettings());
      } catch (err: any) {
        setError(err?.message || 'Unable to load meeting configuration.');
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id, isAdmin]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (!form.allowedDurations.length) throw new Error('At least one allowed duration is required.');
      if (!form.allowedDurations.includes(form.defaultDurationMinutes)) throw new Error('Default duration must be one of the allowed durations.');
      if (!form.meetingTypes.length) throw new Error('At least one meeting type is required.');
      if (!form.meetingTypes.includes(form.defaultMeetingType)) throw new Error('Default meeting type must be one of the configured meeting types.');
      if (!form.providers.includes('Manual')) throw new Error('Manual must remain an enabled provider.');
      if (form.defaultProvider !== 'Manual') throw new Error('Manual remains the default provider until secure external calendar authorization is enabled.');
      const saved = await meetingService.saveMeetingSettings(form);
      setForm(saved);
      setMessage('Meeting configuration saved and audited.');
    } catch (err: any) {
      setError(err?.message || 'Meeting configuration could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-[#000080]" /></div>;
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-4 shadow-sm">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
          <h1 className="text-xl font-bold">Admin access required</h1>
          <p className="text-sm text-slate-500">Only an active ProFox Administrator may change company meeting configuration.</p>
          <button onClick={() => navigate('/admin')} className="px-4 py-2.5 rounded-xl bg-[#000080] text-white text-xs font-bold">Back to Admin</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-8 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(backTarget)} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50" title={backLabel} aria-label={backLabel}><ArrowLeft className="w-4 h-4" /></button>
            <div>
              <h1 className="text-xl font-black">Meeting & Calendar Settings</h1>
              <p className="text-xs text-slate-500">Business configuration is editable; RLS, OAuth secrets and authorization remain protected.</p>
            </div>
          </div>
          <ShieldCheck className="w-6 h-6 text-emerald-600" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-8">
        <form onSubmit={save} className="space-y-6">
          {error && <div className="p-3 rounded-xl bg-red-50 text-red-800 border border-red-200 text-xs font-bold flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}
          {message && <div className="p-3 rounded-xl bg-green-50 text-green-800 border border-green-200 text-xs font-bold flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{message}</div>}

          <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
            <div className="flex items-center gap-2"><Settings className="w-5 h-5 text-[#000080]" /><div><h2 className="font-bold">Scheduling Defaults</h2><p className="text-xs text-slate-500">Defaults used by the CRM meeting workflow.</p></div></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Default Duration (minutes)"><input type="number" min={10} max={240} value={form.defaultDurationMinutes} onChange={e => setForm({...form, defaultDurationMinutes:Number(e.target.value)})} className={inputClass} /></Field>
              <Field label="Allowed Durations"><input value={form.allowedDurations.join(', ')} onChange={e => setForm({...form, allowedDurations:parseNumberList(e.target.value)})} className={inputClass} placeholder="15, 30, 45, 60" /></Field>
              <Field label="Minimum Booking Notice (minutes)"><input type="number" min={0} max={10080} value={form.minimumBookingNoticeMinutes} onChange={e => setForm({...form, minimumBookingNoticeMinutes:Number(e.target.value)})} className={inputClass} /></Field>
              <Field label="Default Timezone"><input value={form.defaultTimezone} onChange={e => setForm({...form, defaultTimezone:e.target.value})} className={inputClass} placeholder="Asia/Kolkata" /></Field>
              <Field label="Buffer Before (minutes)"><input type="number" min={0} max={240} value={form.bufferBeforeMinutes} onChange={e => setForm({...form, bufferBeforeMinutes:Number(e.target.value)})} className={inputClass} /></Field>
              <Field label="Buffer After (minutes)"><input type="number" min={0} max={240} value={form.bufferAfterMinutes} onChange={e => setForm({...form, bufferAfterMinutes:Number(e.target.value)})} className={inputClass} /></Field>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
            <div><h2 className="font-bold">Meeting Types & Templates</h2><p className="text-xs text-slate-500">Customize the business language without changing stable system security keys.</p></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Meeting Types"><input value={form.meetingTypes.join(', ')} onChange={e => setForm({...form, meetingTypes:parseTextList(e.target.value)})} className={inputClass} /></Field>
              <Field label="Default Meeting Type"><input value={form.defaultMeetingType} onChange={e => setForm({...form, defaultMeetingType:e.target.value})} className={inputClass} /></Field>
            </div>
            <Field label="Meeting Title Template"><input value={form.titleTemplate} onChange={e => setForm({...form, titleTemplate:e.target.value})} className={inputClass} /><p className="text-[11px] text-slate-400 mt-1">Supported placeholders: {'{{company}}'} and {'{{meetingType}}'}.</p></Field>
            <Field label="Meeting Description Template"><textarea rows={3} value={form.descriptionTemplate} onChange={e => setForm({...form, descriptionTemplate:e.target.value})} className={inputClass} /><p className="text-[11px] text-slate-400 mt-1">Supported placeholders: {'{{company}}'} and {'{{contact}}'}.</p></Field>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
            <div><h2 className="font-bold">Provider & Reminder Policy</h2><p className="text-xs text-slate-500">Provider names may be prepared here, but external connection state is never granted by this screen.</p></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Permitted Providers"><input value={form.providers.join(', ')} onChange={e => setForm({...form, providers:parseTextList(e.target.value)})} className={inputClass} /><p className="text-[11px] text-slate-400 mt-1">Manual keeps ProFox as the source of truth. Google Calendar/Meet and Zoho Calendar/Meeting are assigned and authorized securely from Professional Integrations and Calendar.</p></Field>
              <Field label="Default Provider"><input value={form.defaultProvider} readOnly className={`${inputClass} bg-slate-50 text-slate-500`} /></Field>
              <Field label="Reminder Minutes"><input value={form.reminderMinutes.join(', ')} onChange={e => setForm({...form, reminderMinutes:parseNumberList(e.target.value)})} className={inputClass} placeholder="1440, 60" /></Field>
              <Field label="Module Active"><label className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200"><input type="checkbox" checked={form.active} onChange={e => setForm({...form, active:e.target.checked})} /><span className="text-sm font-semibold">Allow new Sales meetings</span></label></Field>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
            <div><h2 className="font-bold">Sales Meeting SOP</h2><p className="text-xs text-slate-500">Operational instructions shown to staff and used as company guidance.</p></div>
            <Field label="Booking Instructions"><textarea rows={3} value={form.bookingInstructions} onChange={e => setForm({...form, bookingInstructions:e.target.value})} className={inputClass} /></Field>
            <Field label="Cancellation Instructions"><textarea rows={3} value={form.cancellationInstructions} onChange={e => setForm({...form, cancellationInstructions:e.target.value})} className={inputClass} /></Field>
            <Field label="Rescheduling Instructions"><textarea rows={3} value={form.reschedulingInstructions} onChange={e => setForm({...form, reschedulingInstructions:e.target.value})} className={inputClass} /></Field>
          </section>

          <div className="flex justify-end">
            <button disabled={saving} className="px-5 py-3 rounded-xl bg-[#000080] hover:bg-[#000066] text-white text-xs font-black flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Meeting Configuration
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function Field({label, children}:{label:string;children:React.ReactNode}) {
  return <label className="block space-y-1.5"><span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{label}</span>{children}</label>;
}
