import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  Loader2,
  Save,
  ShieldCheck,
  Trash2,
  UserRound
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { bookingService, AvailabilityBlock, BookingProfile } from '../../lib/bookingService';
import { meetingService, MeetingSettings, UserCalendarSettings, DEFAULT_MEETING_SETTINGS } from '../../lib/meetingService';
import { profileService } from '../../lib/profileService';
import { formatInTimeZone, zonedLocalToIso } from '../../lib/timezoneUtils';
import { UserProfile } from '../../types';
import AppAvatar from './workspace/AppAvatar';

const SELLER_ROLES = ['sales', 'sales_rep', 'sales_team'];
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100';
const days = [['Sun',0],['Mon',1],['Tue',2],['Wed',3],['Thu',4],['Fri',5],['Sat',6]] as const;

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function splitList(value: string) {
  return Array.from(new Set(value.split(',').map(item => item.trim()).filter(Boolean)));
}

function profileDefaults(person: UserProfile, settings: MeetingSettings): BookingProfile {
  return {
    salespersonId: person.id,
    slug: `${slugify(person.fullName || 'expert')}-${person.id.slice(0,8)}`,
    displayName: person.fullName || '',
    headline: '',
    bio: '',
    country: person.country || '',
    avatarUrl: person.avatarUrl || '',
    niches: [],
    serviceExpertise: [],
    languages: ['English'],
    meetingType: settings.defaultMeetingType,
    meetingDurationMinutes: settings.defaultDurationMinutes,
    isPublic: false,
    acceptingBookings: false,
    sortOrder: 100
  };
}

function calendarDefaults(person: UserProfile, settings: MeetingSettings, current?: UserCalendarSettings | null) {
  return {
    userId: person.id,
    provider: 'Manual',
    calendarEmail: current?.calendarEmail || '',
    timezone: current?.timezone || person.timezone || settings.defaultTimezone,
    workingDays: current?.workingDays || [1,2,3,4,5],
    workStart: current?.workStart || '09:00',
    workEnd: current?.workEnd || '17:00',
    defaultDurationMinutes: current?.defaultDurationMinutes || settings.defaultDurationMinutes,
    bufferBeforeMinutes: current?.bufferBeforeMinutes ?? settings.bufferBeforeMinutes,
    bufferAfterMinutes: current?.bufferAfterMinutes ?? settings.bufferAfterMinutes,
    bookingUrl: current?.bookingUrl || '',
    defaultPlatform: current?.defaultPlatform || 'ProFox Calendar',
    connectionStatus: 'Not Connected' as const,
    active: current?.active ?? true
  };
}

export default function BookingSetupWorkspace() {
  const navigate = useNavigate();
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const allowed = Boolean(user && (isAdmin || (profile?.status === 'active' && SELLER_ROLES.includes(profile?.role || ''))));
  const [people, setPeople] = useState<UserProfile[]>([]);
  const [targetId, setTargetId] = useState('');
  const [meetingSettings, setMeetingSettings] = useState<MeetingSettings>(DEFAULT_MEETING_SETTINGS);
  const [bookingProfile, setBookingProfile] = useState<BookingProfile | null>(null);
  const [calendarForm, setCalendarForm] = useState<ReturnType<typeof calendarDefaults> | null>(null);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [savingBlock, setSavingBlock] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [blockStart, setBlockStart] = useState('');
  const [blockEnd, setBlockEnd] = useState('');
  const [blockReason, setBlockReason] = useState('');

  const targetPerson = useMemo(() => people.find(person => person.id===targetId) || null, [people,targetId]);
  const publicBookingUrl = typeof window !== 'undefined' ? `${window.location.origin}/book-a-meeting` : '/book-a-meeting';

  useEffect(() => {
    if (authLoading || !allowed || !profile) {
      if (!authLoading) setLoading(false);
      return;
    }
    void (async () => {
      try {
        setLoading(true);
        const settings = await meetingService.getMeetingSettings();
        setMeetingSettings(settings);
        if (isAdmin) {
          const result = await profileService.getAllProfiles();
          if (result.error) throw result.error;
          const eligible = result.data.filter(person => person.status==='active' && (SELLER_ROLES.includes(person.role) || person.role==='admin'));
          setPeople(eligible);
          setTargetId(current => current || eligible.find(person => person.id===profile.id)?.id || eligible[0]?.id || '');
        } else {
          setPeople([profile]);
          setTargetId(profile.id);
        }
      } catch (err: any) {
        setError(err?.message || 'Unable to load booking setup.');
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading,allowed,isAdmin,profile?.id]);

  useEffect(() => {
    if (!targetId || !targetPerson) return;
    void loadTarget(targetId,targetPerson);
  }, [targetId,targetPerson?.id]);

  const loadTarget = async (id: string, person: UserProfile) => {
    setError('');
    setMessage('');
    try {
      setLoading(true);
      const [storedProfile, currentCalendar, currentBlocks] = await Promise.all([
        bookingService.getProfile(id),
        meetingService.getCalendarSettings(id),
        bookingService.listBlocks(id)
      ]);
      setBookingProfile(storedProfile ? { ...storedProfile, avatarUrl: person.avatarUrl || '' } : profileDefaults(person,meetingSettings));
      setCalendarForm(calendarDefaults(person,meetingSettings,currentCalendar));
      setBlocks(currentBlocks);
    } catch (err: any) {
      setError(err?.message || 'Unable to load this booking profile.');
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    if (!bookingProfile) return;
    setSavingProfile(true); setError(''); setMessage('');
    try {
      if (!bookingProfile.displayName.trim()) throw new Error('Display name is required.');
      if (!bookingProfile.slug.trim()) throw new Error('Booking profile slug is required.');
      if (bookingProfile.isPublic && !bookingProfile.headline.trim()) throw new Error('Add a short headline before publishing the profile.');
      const saved = await bookingService.saveProfile({ ...bookingProfile, avatarUrl: targetPerson?.avatarUrl || '' });
      setBookingProfile(saved);
      setMessage('Booking profile saved. Public expert information is up to date.');
    } catch (err: any) { setError(err?.message || 'Booking profile could not be saved.'); }
    finally { setSavingProfile(false); }
  };

  const saveAvailability = async () => {
    if (!calendarForm || !bookingProfile) return;
    setSavingCalendar(true); setError(''); setMessage('');
    try {
      if (!calendarForm.workingDays.length) throw new Error('Choose at least one working day.');
      if (calendarForm.workEnd <= calendarForm.workStart) throw new Error('Working end time must be after the start time.');
      if (!meetingSettings.allowedDurations.includes(bookingProfile.meetingDurationMinutes)) throw new Error('The public meeting duration is not allowed by Meeting Settings.');
      const saved = await meetingService.saveCalendarSettings({
        ...calendarForm,
        provider: 'Manual',
        connectionStatus: 'Not Connected',
        bookingUrl: publicBookingUrl,
        defaultDurationMinutes: bookingProfile.meetingDurationMinutes,
        defaultPlatform: 'ProFox Calendar'
      });
      setCalendarForm(calendarDefaults(targetPerson!,meetingSettings,saved));
      setMessage('Availability saved. Public slots now follow these working hours, buffers and time zone.');
    } catch (err: any) { setError(err?.message || 'Availability could not be saved.'); }
    finally { setSavingCalendar(false); }
  };

  const addTimeOff = async () => {
    if (!calendarForm || !targetId) return;
    setSavingBlock(true); setError(''); setMessage('');
    try {
      if (!blockStart || !blockEnd) throw new Error('Choose the blocked start and end time.');
      const startAt = zonedLocalToIso(blockStart,calendarForm.timezone);
      const endAt = zonedLocalToIso(blockEnd,calendarForm.timezone);
      if (new Date(endAt)<=new Date(startAt)) throw new Error('Blocked end time must be after the start time.');
      await bookingService.addBlock(targetId,startAt,endAt,blockReason);
      setBlocks(await bookingService.listBlocks(targetId));
      setBlockStart(''); setBlockEnd(''); setBlockReason('');
      setMessage('Time off added. Visitors will no longer see slots inside that period.');
    } catch (err: any) { setError(err?.message || 'Time off could not be added.'); }
    finally { setSavingBlock(false); }
  };

  const removeBlock = async (id: string) => {
    setError(''); setMessage('');
    try {
      await bookingService.deleteBlock(id);
      setBlocks(rows => rows.filter(row => row.id!==id));
      setMessage('Blocked time removed.');
    } catch (err: any) { setError(err?.message || 'Blocked time could not be removed.'); }
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(publicBookingUrl); setMessage('Public booking link copied.'); }
    catch { setMessage(publicBookingUrl); }
  };

  if (authLoading || loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  if (!allowed) return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><div className="max-w-md rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto h-9 w-9 text-amber-500"/><h1 className="mt-4 text-xl font-black">Booking setup is restricted</h1><p className="mt-2 text-sm text-slate-500">Only active Sales Representatives and Administrators can manage public booking availability.</p><button onClick={()=>navigate('/admin/workspace')} className="mt-5 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-bold text-white">Back to Workspace</button></div></div>;
  if (!targetPerson || !bookingProfile || !calendarForm) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">No eligible booking profile is available.</div>;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur-xl sm:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-3"><button onClick={()=>navigate('/admin/calendar')} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50" title="Back to Calendar"><ArrowLeft className="h-4 w-4"/></button><div><h1 className="text-xl font-black">Booking Setup</h1><p className="text-xs text-slate-500">Control how visitors see you, when they can book, and when you are unavailable.</p></div></div>
        <div className="flex gap-2"><button onClick={()=>void copyLink()} className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 sm:flex"><Copy className="h-4 w-4"/> Copy booking link</button><button onClick={()=>window.open(publicBookingUrl,'_blank','noopener,noreferrer')} className="flex items-center gap-2 rounded-xl bg-[#000080] px-3 py-2 text-xs font-bold text-white"><ExternalLink className="h-4 w-4"/> Preview</button></div>
      </div>
    </header>

    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      {isAdmin && people.length>1 && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><label className="block max-w-md"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Manage booking profile</span><select value={targetId} onChange={e=>setTargetId(e.target.value)} className={inputClass}>{people.map(person=><option key={person.id} value={person.id}>{person.fullName} · {person.role}</option>)}</select></label></section>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</div>}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#000080]"><UserRound className="h-5 w-5"/></div><div><h2 className="font-black">Public expert profile</h2><p className="text-xs text-slate-500">The information visitors use to choose the right specialist.</p></div></div><div className="flex gap-2"><StatusPill active={bookingProfile.isPublic} label={bookingProfile.isPublic?'Published':'Hidden'}/><StatusPill active={bookingProfile.acceptingBookings} label={bookingProfile.acceptingBookings?'Accepting bookings':'Bookings paused'}/></div></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Display name"><input value={bookingProfile.displayName} onChange={e=>setBookingProfile({...bookingProfile,displayName:e.target.value})} className={inputClass}/></Field><Field label="Booking profile slug"><input value={bookingProfile.slug} onChange={e=>setBookingProfile({...bookingProfile,slug:slugify(e.target.value)})} className={inputClass}/></Field><Field label="Headline"><input value={bookingProfile.headline} onChange={e=>setBookingProfile({...bookingProfile,headline:e.target.value})} placeholder="e.g. Roofing & home-services growth specialist" className={inputClass}/></Field><Field label="Country"><input value={bookingProfile.country} onChange={e=>setBookingProfile({...bookingProfile,country:e.target.value})} className={inputClass}/></Field><Field label="Team profile photo"><div className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3"><AppAvatar name={targetPerson?.fullName || bookingProfile.displayName} src={targetPerson?.avatarUrl} size="xs"/><span className="text-[11px] font-semibold text-slate-500">Managed from My Profile</span></div></Field><Field label="Languages"><input value={bookingProfile.languages.join(', ')} onChange={e=>setBookingProfile({...bookingProfile,languages:splitList(e.target.value)})} placeholder="English, Hindi" className={inputClass}/></Field><Field label="Niche expertise"><input value={bookingProfile.niches.join(', ')} onChange={e=>setBookingProfile({...bookingProfile,niches:splitList(e.target.value)})} placeholder="Roofing, SaaS, E-commerce" className={inputClass}/></Field><Field label="Service expertise"><input value={bookingProfile.serviceExpertise.join(', ')} onChange={e=>setBookingProfile({...bookingProfile,serviceExpertise:splitList(e.target.value)})} placeholder="Website, Web App, Automation" className={inputClass}/></Field><Field label="Meeting type"><select value={bookingProfile.meetingType} onChange={e=>setBookingProfile({...bookingProfile,meetingType:e.target.value})} className={inputClass}>{meetingSettings.meetingTypes.map(type=><option key={type}>{type}</option>)}</select></Field><Field label="Public meeting duration"><select value={bookingProfile.meetingDurationMinutes} onChange={e=>setBookingProfile({...bookingProfile,meetingDurationMinutes:Number(e.target.value)})} className={inputClass}>{meetingSettings.allowedDurations.map(value=><option key={value} value={value}>{value} minutes</option>)}</select></Field></div>
        <Field label="Short bio"><textarea rows={4} value={bookingProfile.bio} onChange={e=>setBookingProfile({...bookingProfile,bio:e.target.value})} placeholder="Explain the kind of businesses and problems you are best equipped to help with." className={`${inputClass} mt-4`}/></Field>
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><Toggle checked={bookingProfile.isPublic} onChange={checked=>setBookingProfile({...bookingProfile,isPublic:checked})} title="Show on booking page" description="Visitors can see this expert profile."/><Toggle checked={bookingProfile.acceptingBookings} onChange={checked=>setBookingProfile({...bookingProfile,acceptingBookings:checked})} title="Accept new bookings" description="Turn off instantly when the seller is unavailable."/></div>
        <div className="mt-6 flex justify-end"><button disabled={savingProfile} onClick={()=>void saveProfile()} className="flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{savingProfile?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>} Save profile</button></div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-6 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-700"><CalendarDays className="h-5 w-5"/></div><div><h2 className="font-black">Working availability</h2><p className="text-xs text-slate-500">ProFox calculates public slots from these hours, existing meetings, buffers and time off.</p></div></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Time zone"><input value={calendarForm.timezone} onChange={e=>setCalendarForm({...calendarForm,timezone:e.target.value})} className={inputClass}/></Field><Field label="Calendar status"><select value={calendarForm.active?'active':'paused'} onChange={e=>setCalendarForm({...calendarForm,active:e.target.value==='active'})} className={inputClass}><option value="active">Accepting calendar bookings</option><option value="paused">Pause calendar availability</option></select></Field><Field label="Working day starts"><input type="time" value={calendarForm.workStart} onChange={e=>setCalendarForm({...calendarForm,workStart:e.target.value})} className={inputClass}/></Field><Field label="Working day ends"><input type="time" value={calendarForm.workEnd} onChange={e=>setCalendarForm({...calendarForm,workEnd:e.target.value})} className={inputClass}/></Field><Field label="Buffer before"><select value={calendarForm.bufferBeforeMinutes} onChange={e=>setCalendarForm({...calendarForm,bufferBeforeMinutes:Number(e.target.value)})} className={inputClass}>{[0,5,10,15,30,45,60].map(v=><option key={v} value={v}>{v} minutes</option>)}</select></Field><Field label="Buffer after"><select value={calendarForm.bufferAfterMinutes} onChange={e=>setCalendarForm({...calendarForm,bufferAfterMinutes:Number(e.target.value)})} className={inputClass}>{[0,5,10,15,30,45,60].map(v=><option key={v} value={v}>{v} minutes</option>)}</select></Field></div>
        <div className="mt-5"><div className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Working days</div><div className="flex flex-wrap gap-2">{days.map(([label,value])=>{const active=calendarForm.workingDays.includes(value);return <button key={value} onClick={()=>setCalendarForm({...calendarForm,workingDays:active?calendarForm.workingDays.filter(day=>day!==value):[...calendarForm.workingDays,value].sort()})} className={`rounded-xl border px-3 py-2 text-xs font-black transition ${active?'border-[#000080] bg-blue-50 text-[#000080]':'border-slate-200 text-slate-400'}`}>{label}</button>;})}</div></div>
        <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-800"><strong>ProFox Calendar is primary.</strong> Google Calendar is not required. When optional external sync is added later, it will only contribute additional busy times and event synchronization.</div>
        <div className="mt-6 flex justify-end"><button disabled={savingCalendar} onClick={()=>void saveAvailability()} className="flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{savingCalendar?<Loader2 className="h-4 w-4 animate-spin"/>:<Clock3 className="h-4 w-4"/>} Save availability</button></div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-6"><h2 className="font-black">Time off & blocked periods</h2><p className="mt-1 text-xs text-slate-500">Add holidays, personal time, internal commitments or any period visitors must not be able to book.</p></div>
        <div className="grid gap-4 sm:grid-cols-3"><Field label={`Blocked from (${calendarForm.timezone})`}><input type="datetime-local" value={blockStart} onChange={e=>setBlockStart(e.target.value)} className={inputClass}/></Field><Field label={`Blocked until (${calendarForm.timezone})`}><input type="datetime-local" value={blockEnd} onChange={e=>setBlockEnd(e.target.value)} className={inputClass}/></Field><Field label="Reason"><input value={blockReason} onChange={e=>setBlockReason(e.target.value)} placeholder="Holiday, internal meeting..." className={inputClass}/></Field></div>
        <div className="mt-4 flex justify-end"><button disabled={savingBlock} onClick={()=>void addTimeOff()} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 disabled:opacity-50">{savingBlock?<Loader2 className="h-4 w-4 animate-spin"/>:<CalendarDays className="h-4 w-4"/>} Add blocked time</button></div>
        <div className="mt-6 divide-y divide-slate-100 rounded-2xl border border-slate-200">{blocks.length===0?<div className="p-6 text-center text-xs text-slate-400">No upcoming blocked periods.</div>:blocks.map(block=><div key={block.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-bold">{formatInTimeZone(block.startAt,calendarForm.timezone)} → {formatInTimeZone(block.endAt,calendarForm.timezone)}</div><div className="mt-1 text-xs text-slate-400">{block.reason || 'Unavailable'}</div></div><button onClick={()=>void removeBlock(block.id)} className="self-start rounded-xl border border-red-200 bg-red-50 p-2 text-red-600 sm:self-auto" title="Remove blocked time"><Trash2 className="h-4 w-4"/></button></div>)}</div>
      </section>
    </main>
  </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}) { return <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>; }
function StatusPill({active,label}:{active:boolean;label:string}) { return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${active?'border-emerald-200 bg-emerald-50 text-emerald-700':'border-slate-200 bg-slate-50 text-slate-500'}`}>{label}</span>; }
function Toggle({checked,onChange,title,description}:{checked:boolean;onChange:(value:boolean)=>void;title:string;description:string}) { return <button type="button" onClick={()=>onChange(!checked)} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${checked?'border-[#000080] bg-blue-50':'border-slate-200 bg-white'}`}><span className={`flex h-6 w-6 items-center justify-center rounded-lg border ${checked?'border-[#000080] bg-[#000080] text-white':'border-slate-300 bg-white text-transparent'}`}><Check className="h-4 w-4"/></span><span><span className="block text-sm font-black text-slate-800">{title}</span><span className="mt-0.5 block text-xs text-slate-500">{description}</span></span></button>; }
