import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Loader2, Save, Trash2, Video } from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { DEFAULT_MEETING_SETTINGS, MeetingSettings, SalesMeeting, meetingService } from '../../lib/meetingService';

const SELLER_ROLES = ['sales', 'sales_rep', 'sales_team'];

function zonedLocalToIso(localValue: string, timeZone: string) {
  const match = localValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error('Choose a valid meeting date and time.');
  const [, year, month, day, hour, minute] = match;
  const desiredUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  const adjust = (candidate: number) => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).formatToParts(new Date(candidate));
    const values: Record<string,string> = {};
    for (const part of parts) if (part.type !== 'literal') values[part.type] = part.value;
    const renderedUtc = Date.UTC(Number(values.year), Number(values.month)-1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
    return desiredUtc - (renderedUtc - candidate);
  };
  let result = adjust(desiredUtc);
  result = adjust(result);
  return new Date(result).toISOString();
}

function isoToZonedLocal(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(new Date(iso));
  const values: Record<string,string> = {};
  for (const part of parts) if (part.type !== 'literal') values[part.type] = part.value;
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export default function MeetingManageView() {
  const { id = '' } = useParams<{id:string}>();
  const navigate = useNavigate();
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const allowed = Boolean(user && (isAdmin || (profile?.status === 'active' && SELLER_ROLES.includes(profile?.role || ''))));
  const [meeting, setMeeting] = useState<SalesMeeting | null>(null);
  const [settings, setSettings] = useState<MeetingSettings>(DEFAULT_MEETING_SETTINGS);
  const [startLocal, setStartLocal] = useState('');
  const [duration, setDuration] = useState(30);
  const [timezone, setTimezone] = useState(profile?.timezone || DEFAULT_MEETING_SETTINGS.defaultTimezone);
  const [meetingUrl, setMeetingUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const closed = useMemo(() => Boolean(meeting && ['Completed','Cancelled','No Show'].includes(meeting.status)), [meeting]);
  const providerManaged = Boolean(meeting?.externalEventId);

  const load = async () => {
    if (!allowed || !id) return;
    setLoading(true); setError('');
    try {
      const [row, config] = await Promise.all([meetingService.getMeeting(id), meetingService.getMeetingSettings()]);
      if (!row) throw new Error('Meeting not found.');
      setMeeting(row); setSettings(config);
      const tz = row.timezone || profile?.timezone || config.defaultTimezone;
      setTimezone(tz);
      setStartLocal(isoToZonedLocal(row.startAt, tz));
      setDuration(Math.round((new Date(row.endAt).getTime()-new Date(row.startAt).getTime())/60000));
      setMeetingUrl(row.meetingUrl || '');
    } catch (err:any) { setError(err?.message || 'Meeting could not be loaded.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [allowed, id]);

  const save = async () => {
    if (!meeting) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const startIso = zonedLocalToIso(startLocal, timezone);
      const endIso = new Date(new Date(startIso).getTime() + duration * 60000).toISOString();
      const updated = await meetingService.reschedule(meeting.id, startIso, endIso, timezone, providerManaged ? undefined : (meetingUrl || undefined));
      setMeeting(updated);
      setMeetingUrl(updated.meetingUrl || '');
      setMessage('Meeting rescheduled through the existing ProFox Calendar workflow.');
    } catch (err:any) { setError(err?.message || 'Meeting could not be rescheduled.'); }
    finally { setSaving(false); }
  };

  const cancelMeeting = async () => {
    if (!meeting) return;
    const reason = window.prompt('Cancellation reason (optional):', '') ?? '';
    if (!window.confirm('Cancel this meeting? The existing CRM-linked meeting history will be preserved.')) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const updated = await meetingService.cancel(meeting.id, reason.trim());
      setMeeting(updated);
      setMeetingUrl('');
      setMessage('Meeting cancelled and the linked CRM activity was updated.');
    } catch (err:any) { setError(err?.message || 'Meeting could not be cancelled.'); }
    finally { setSaving(false); }
  };

  if (authLoading) return <div className="min-h-screen bg-slate-50" />;
  if (!allowed) return <Navigate to="/admin" replace />;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-4xl items-center gap-3"><button onClick={()=>navigate('/admin/today')} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button><div><h1 className="text-xl font-black">Manage Meeting</h1><p className="text-xs text-slate-500">Reschedule or cancel the exact canonical Calendar record.</p></div></div></header>
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      {loading ? <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div> : error && !meeting ? <Notice type="error" text={error} /> : meeting ? <div className="space-y-5">
        {error && <Notice type="error" text={error} />}{message && <Notice type="success" text={message} />}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-[10px] font-black uppercase tracking-wider text-[#000080]">{meeting.meetingType}</div><h2 className="mt-1 text-2xl font-black">{meeting.title}</h2><p className="mt-2 text-sm text-slate-500">{meeting.attendeeName || meeting.attendeeEmail || 'CRM contact'}</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase text-slate-600">{meeting.status}</span>{meeting.meetingUrl && !closed && <a href={meeting.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white"><Video className="h-4 w-4"/>Open Meeting</a>}</div></div></section>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-5 flex items-center gap-2"><CalendarDays className="h-5 w-5 text-[#000080]" /><h3 className="font-black">Reschedule</h3></div>{closed ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">This meeting is closed and can no longer be rescheduled.</div> : <div className="grid gap-4 md:grid-cols-2"><label className="text-xs font-bold text-slate-600">Start<input type="datetime-local" value={startLocal} onChange={e=>setStartLocal(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="text-xs font-bold text-slate-600">Timezone<input value={timezone} onChange={e=>setTimezone(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="text-xs font-bold text-slate-600">Duration<select value={duration} onChange={e=>setDuration(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{settings.allowedDurations.map(value=><option key={value} value={value}>{value} minutes</option>)}</select></label>{providerManaged ? <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"><div className="font-black">Meeting link managed by ProFox</div><p className="mt-1 leading-5">The provider link is protected and updates automatically when this meeting is rescheduled. Sellers cannot replace it manually.</p></div> : <label className="text-xs font-bold text-slate-600">Manual Meeting URL<input value={meetingUrl} onChange={e=>setMeetingUrl(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="https://..." /></label>}</div>}
          {!closed && <div className="mt-5 flex flex-wrap gap-2"><button onClick={()=>void save()} disabled={saving||!startLocal||!timezone} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving?<Loader2 className="h-4 w-4 animate-spin" />:<Save className="h-4 w-4" />} Save Reschedule</button><button onClick={()=>void cancelMeeting()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-black text-red-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Cancel Meeting</button></div>}
        </section>
        <div className="flex flex-wrap gap-2"><button onClick={()=>navigate(`/admin/meeting-prep/${meeting.id}`)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black">Prepare Meeting</button><button onClick={()=>navigate('/admin/meetings')} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black">All Meetings</button></div>
      </div> : null}
    </main>
  </div>;
}

function Notice({type,text}:{type:'error'|'success';text:string}){return <div className={`rounded-2xl border p-4 text-sm font-semibold ${type==='error'?'border-red-200 bg-red-50 text-red-700':'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{text}</div>}