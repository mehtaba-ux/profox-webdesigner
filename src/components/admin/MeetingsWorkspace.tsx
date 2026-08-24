import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Video,
  X
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { crmService } from '../../lib/crmService';
import { salesService } from '../../lib/salesService';
import {
  DEFAULT_MEETING_SETTINGS,
  MeetingSettings,
  SalesMeeting,
  UserCalendarSettings,
  meetingService
} from '../../lib/meetingService';
import { CRMLead, CRMOpportunity, SalesClient } from '../../types';
import './MeetingsWorkspace.css';

type WorkspaceTab = 'meetings' | 'availability';
type TargetType = 'lead' | 'opportunity' | 'client' | 'external';

const SELLER_ROLES = ['sales', 'sales_rep', 'sales_team'];
const inputClass = 'meetings-input';
const primaryButtonClass = 'meetings-btn-primary';
const secondaryButtonClass = 'meetings-btn-secondary';

function getErrorMessage(error: any, fallback: string) { return error?.message || fallback; }
function isValidTimeZone(timeZone: string) { try { new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date()); return true; } catch { return false; } }
function zonedLocalToIso(localValue: string, timeZone: string) {
  if (!isValidTimeZone(timeZone)) throw new Error(`Invalid timezone: ${timeZone}`);
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
  let result = adjust(desiredUtc); result = adjust(result); return new Date(result).toISOString();
}
function isoToZonedLocal(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(new Date(iso));
  const values: Record<string,string> = {}; for (const part of parts) if (part.type !== 'literal') values[part.type] = part.value;
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
function formatMeetingTime(iso: string, timeZone: string) { try { return new Intl.DateTimeFormat('en-US', { timeZone, weekday:'short', month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short' }).format(new Date(iso)); } catch { return new Date(iso).toLocaleString(); } }
function sameCalendarDay(iso: string, date: Date, timeZone: string) { try { const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }); return formatter.format(new Date(iso)) === formatter.format(date); } catch { return new Date(iso).toDateString() === date.toDateString(); } }

export default function MeetingsWorkspace() {
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<WorkspaceTab>('meetings');
  const [meetings, setMeetings] = useState<SalesMeeting[]>([]);
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [opportunities, setOpportunities] = useState<CRMOpportunity[]>([]);
  const [clients, setClients] = useState<SalesClient[]>([]);
  const [meetingSettings, setMeetingSettings] = useState<MeetingSettings>(DEFAULT_MEETING_SETTINGS);
  const [calendarSettings, setCalendarSettings] = useState<UserCalendarSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showScheduler, setShowScheduler] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<SalesMeeting | null>(null);

  const isSales = Boolean(profile && SELLER_ROLES.includes(profile.role) && profile.status === 'active');
  const allowed = Boolean(user && (isAdmin || isSales));
  const displayTimezone = calendarSettings?.timezone || profile?.timezone || meetingSettings.defaultTimezone;

  const loadAll = async () => {
    if (!user || !allowed) return;
    setLoading(true); setError(null);
    try {
      const [meetingRows, leadRows, opportunityRows, clientResult, settings, userSettings] = await Promise.all([
        meetingService.listMeetings(), crmService.getLeads(), crmService.getOpportunities(), salesService.getClients(), meetingService.getMeetingSettings(), meetingService.getCalendarSettings(user.id)
      ]);
      if (clientResult.error) throw clientResult.error;
      setMeetings(meetingRows); setLeads(leadRows); setOpportunities(opportunityRows); setClients(clientResult.data || []); setMeetingSettings(settings); setCalendarSettings(userSettings);
      if (searchParams.get('leadId') || searchParams.get('opportunityId') || searchParams.get('clientId')) setShowScheduler(true);
    } catch (err: any) { setError(getErrorMessage(err, 'Unable to load Sales Meetings.')); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadAll(); }, [user?.id, allowed]);
  useEffect(() => {
    if (searchParams.get('action') !== 'new') return;
    setShowScheduler(true);
    const next = new URLSearchParams(searchParams); next.delete('action');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const grouped = useMemo(() => {
    const now = Date.now();
    return {
      today: meetings.filter(m => sameCalendarDay(m.startAt, new Date(), displayTimezone) && ['Scheduled','Rescheduled'].includes(m.status)),
      upcoming: meetings.filter(m => new Date(m.startAt).getTime() > now && ['Scheduled','Rescheduled'].includes(m.status)),
      completed: meetings.filter(m => m.status === 'Completed'),
      closed: meetings.filter(m => ['Cancelled','No Show'].includes(m.status))
    };
  }, [meetings, displayTimezone]);

  if (authLoading) return <FullScreenLoader />;
  if (!user) return <AccessPanel title="Sign in required" message="Sign in through the ProFox Admin area before opening Sales Meetings." onBack={() => navigate('/admin')} />;
  if (!allowed) return <AccessPanel title="Meeting access restricted" message="Sales Meetings are available only to active Sales Representatives and Administrators." onBack={() => navigate('/admin')} />;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-4 py-4 sm:px-8"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><button onClick={()=>navigate('/admin')} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><ArrowLeft className="h-4 w-4"/></button><div><h1 className="text-xl font-black">Sales Meetings</h1><p className="text-xs text-slate-500">CRM-linked scheduling, meeting outcomes, follow-ups and availability.</p></div></div><div className="flex flex-wrap gap-2">{isAdmin&&<button onClick={()=>navigate('/admin/meeting-settings')} className={secondaryButtonClass}><Settings className="h-4 w-4"/>Meeting Settings</button>}<button onClick={()=>void loadAll()} className={secondaryButtonClass}><RefreshCw className="h-4 w-4"/>Refresh</button><button onClick={()=>setShowScheduler(true)} className={primaryButtonClass}><Plus className="h-4 w-4"/>Schedule Meeting</button></div></div></header>
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8"><div className="flex gap-2 overflow-x-auto"><TabButton active={tab==='meetings'} onClick={()=>setTab('meetings')} icon={<Calendar className="h-4 w-4"/>} label="My Meetings"/><TabButton active={tab==='availability'} onClick={()=>setTab('availability')} icon={<Clock className="h-4 w-4"/>} label="Availability"/></div>{error&&<Notice type="error" text={error}/>} {message&&<Notice type="success" text={message}/>} {loading?<div className="flex justify-center rounded-2xl border border-slate-200 bg-white p-16"><Loader2 className="h-7 w-7 animate-spin text-[#000080]"/></div>:tab==='meetings'?<MeetingsOverview grouped={grouped} onSelect={setSelectedMeeting}/>:<CalendarSettingsPanel userId={user.id} current={calendarSettings} profileTimezone={profile?.timezone||meetingSettings.defaultTimezone} defaults={meetingSettings} onSaved={saved=>{setCalendarSettings(saved);setMessage('Availability settings saved.');}} onError={setError}/>}</main>
    {showScheduler&&<ScheduleMeetingModal currentUserId={user.id} leads={leads} opportunities={opportunities} clients={clients} settings={meetingSettings} calendarSettings={calendarSettings} initialLeadId={searchParams.get('leadId')||undefined} initialOpportunityId={searchParams.get('opportunityId')||undefined} initialClientId={searchParams.get('clientId')||undefined} onClose={()=>setShowScheduler(false)} onCreated={async()=>{setShowScheduler(false);setMessage('Meeting scheduled and linked to CRM successfully.');await loadAll();}} onError={setError}/>} 
    {selectedMeeting&&<MeetingDetailModal meeting={selectedMeeting} settings={meetingSettings} onClose={()=>setSelectedMeeting(null)} onUpdated={async text=>{setSelectedMeeting(null);setMessage(text);await loadAll();}} onError={setError}/>} 
  </div>;
}

function MeetingsOverview({grouped,onSelect}:{grouped:{today:SalesMeeting[];upcoming:SalesMeeting[];completed:SalesMeeting[];closed:SalesMeeting[]};onSelect:(meeting:SalesMeeting)=>void}){
  const sections:Array<[string,SalesMeeting[]]>=[['Today',grouped.today],['Upcoming',grouped.upcoming],['Completed',grouped.completed],['Cancelled / No Show',grouped.closed]];
  return <div className="space-y-6"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{sections.map(([label,rows])=><div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-2xl font-black text-[#000080]">{rows.length}</div><div className="text-xs font-bold text-slate-500">{label}</div></div>)}</div>{sections.map(([label,rows])=><section key={label} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold">{label}</h2><span className="text-xs text-slate-400">{rows.length}</span></div>{rows.length===0?<div className="px-5 py-8 text-center text-xs text-slate-400">No meetings in this section.</div>:<div className="divide-y divide-slate-100">{rows.map(meeting=><button key={meeting.id} onClick={()=>onSelect(meeting)} className="flex w-full flex-col justify-between gap-3 p-5 text-left hover:bg-slate-50 md:flex-row md:items-center"><div className="min-w-0"><div className="truncate text-sm font-bold">{meeting.title}</div><div className="mt-1 text-xs text-slate-500">{meeting.attendeeName||meeting.attendeeEmail||'CRM contact'} · {meeting.meetingType}</div><div className="mt-1 text-[11px] text-slate-400">{formatMeetingTime(meeting.startAt,meeting.timezone)}</div></div><div className="flex shrink-0 items-center gap-2"><span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-bold">{meeting.status}</span>{meeting.meetingUrl&&<ExternalLink className="h-4 w-4 text-[#000080]"/>}</div></button>)}</div>}</section>)}</div>;
}

function ScheduleMeetingModal(props:{currentUserId:string;leads:CRMLead[];opportunities:CRMOpportunity[];clients:SalesClient[];settings:MeetingSettings;calendarSettings:UserCalendarSettings|null;initialLeadId?:string;initialOpportunityId?:string;initialClientId?:string;onClose:()=>void;onCreated:()=>Promise<void>;onError:(message:string)=>void}){
  const initialType:TargetType=props.initialOpportunityId?'opportunity':props.initialLeadId?'lead':props.initialClientId?'client':'lead';
  const initialId=props.initialOpportunityId||props.initialLeadId||props.initialClientId||'';
  const timezone=props.calendarSettings?.timezone||props.settings.defaultTimezone;
  const [targetType,setTargetType]=useState<TargetType>(initialType);const [targetId,setTargetId]=useState(initialId);const [meetingType,setMeetingType]=useState(props.settings.defaultMeetingType);const [startLocal,setStartLocal]=useState('');const [duration,setDuration]=useState(props.calendarSettings?.defaultDurationMinutes||props.settings.defaultDurationMinutes);const [meetingUrl,setMeetingUrl]=useState('');const [title,setTitle]=useState('');const [description,setDescription]=useState('');const [attendeeName,setAttendeeName]=useState('');const [attendeeEmail,setAttendeeEmail]=useState('');const [saving,setSaving]=useState(false);
  const targets:Array<CRMLead|CRMOpportunity|SalesClient>=targetType==='lead'?props.leads:targetType==='opportunity'?props.opportunities.filter(o=>o.status==='Open'):targetType==='client'?props.clients:[];
  useEffect(()=>{if(targetType==='external')return;const selected:any=targets.find(item=>item.id===targetId);if(!selected)return;const company=selected.companyName||selected.name||'Prospect';const contact=selected.contactName||selected.primaryContactName||'';setAttendeeName(contact);setAttendeeEmail(selected.email||'');setTitle(props.settings.titleTemplate.replace(/{{company}}/g,company).replace(/{{meetingType}}/g,meetingType));setDescription(props.settings.descriptionTemplate.replace(/{{company}}/g,company).replace(/{{contact}}/g,contact||'the prospect'));},[targetId,targetType,meetingType,props.settings.titleTemplate,props.settings.descriptionTemplate]);
  const submit=async(event:React.FormEvent)=>{event.preventDefault();setSaving(true);try{if(!props.settings.active)throw new Error('New Sales meetings are currently disabled by Admin configuration.');if(!startLocal)throw new Error('Choose a meeting date and time.');if(targetType!=='external'&&!targetId)throw new Error('Select the CRM record for this meeting.');if(targetType==='external'&&!attendeeEmail.trim())throw new Error('External meetings require an attendee email.');if(!props.settings.allowedDurations.includes(duration))throw new Error('Choose an Admin-approved meeting duration.');const startAt=zonedLocalToIso(startLocal,timezone);const endAt=new Date(new Date(startAt).getTime()+duration*60000).toISOString();if(new Date(startAt).getTime()<Date.now()+props.settings.minimumBookingNoticeMinutes*60000)throw new Error(`Meeting must respect the ${props.settings.minimumBookingNoticeMinutes}-minute minimum booking notice.`);if(await meetingService.hasConflict(props.currentUserId,startAt,endAt))throw new Error('This time overlaps another scheduled meeting.');await meetingService.schedule({requestKey:crypto.randomUUID(),salespersonId:props.currentUserId,leadId:targetType==='lead'?targetId:undefined,opportunityId:targetType==='opportunity'?targetId:undefined,clientId:targetType==='client'?targetId:undefined,meetingType,title:title.trim()||meetingType,description,startAt,endAt,timezone,provider:'Manual',meetingUrl:meetingUrl.trim(),attendeeName:attendeeName.trim(),attendeeEmail:attendeeEmail.trim()});await props.onCreated();}catch(err:any){props.onError(getErrorMessage(err,'Meeting could not be scheduled.'));}finally{setSaving(false);}};
  return <Modal title="Schedule Meeting" onClose={props.onClose}><form onSubmit={submit} className="space-y-4"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Meeting For"><select value={targetType} onChange={e=>{setTargetType(e.target.value as TargetType);setTargetId('');}} className={inputClass}><option value="lead">Lead</option><option value="opportunity">Opportunity</option><option value="client">Client</option><option value="external">External Contact</option></select></Field>{targetType!=='external'&&<Field label="CRM Record"><select required value={targetId} onChange={e=>setTargetId(e.target.value)} className={inputClass}><option value="">Select...</option>{targets.map((item:any)=><option key={item.id} value={item.id}>{item.companyName||item.name}</option>)}</select></Field>}<Field label="Meeting Type"><select value={meetingType} onChange={e=>setMeetingType(e.target.value)} className={inputClass}>{props.settings.meetingTypes.map(type=><option key={type}>{type}</option>)}</select></Field><Field label={`Start (${timezone})`}><input type="datetime-local" required value={startLocal} onChange={e=>setStartLocal(e.target.value)} className={inputClass}/></Field><Field label="Duration"><select value={duration} onChange={e=>setDuration(Number(e.target.value))} className={inputClass}>{props.settings.allowedDurations.map(value=><option key={value} value={value}>{value} minutes</option>)}</select></Field><Field label="Manual Meeting Link"><input value={meetingUrl} onChange={e=>setMeetingUrl(e.target.value)} className={inputClass} placeholder="https://... (optional)"/></Field><Field label="Attendee Name"><input value={attendeeName} onChange={e=>setAttendeeName(e.target.value)} className={inputClass}/></Field><Field label="Attendee Email"><input type="email" value={attendeeEmail} onChange={e=>setAttendeeEmail(e.target.value)} className={inputClass}/></Field></div><Field label="Title"><input required value={title} onChange={e=>setTitle(e.target.value)} className={inputClass}/></Field><Field label="Description"><textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)} className={inputClass}/></Field><div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">ProFox Calendar remains the system of record. External calendar sync is optional and does not replace native availability.</div><div className="flex justify-end gap-2"><button type="button" onClick={props.onClose} className={secondaryButtonClass}>Cancel</button><button disabled={saving} className={primaryButtonClass}>{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Calendar className="h-4 w-4"/>}Schedule</button></div></form></Modal>;
}

function MeetingDetailModal({meeting,settings,onClose,onUpdated,onError}:{meeting:SalesMeeting;settings:MeetingSettings;onClose:()=>void;onUpdated:(message:string)=>Promise<void>;onError:(message:string)=>void}){
  const originalDuration=Math.max(10,Math.round((new Date(meeting.endAt).getTime()-new Date(meeting.startAt).getTime())/60000));
  const [outcome,setOutcome]=useState(meeting.outcome);const [requirements,setRequirements]=useState(meeting.requirementsSummary);const [problems,setProblems]=useState(meeting.problemsIdentified);const [decisionMakers,setDecisionMakers]=useState(meeting.decisionMakers);const [commercial,setCommercial]=useState(meeting.commercialNotes);const [timeline,setTimeline]=useState(meeting.timelineNotes);const [nextStep,setNextStep]=useState(meeting.nextStep);const [followUp,setFollowUp]=useState('');const [rescheduleOpen,setRescheduleOpen]=useState(false);const [rescheduleLocal,setRescheduleLocal]=useState(()=>isoToZonedLocal(meeting.startAt,meeting.timezone));const [rescheduleDuration,setRescheduleDuration]=useState(originalDuration);const [rescheduleUrl,setRescheduleUrl]=useState(meeting.meetingUrl);const [saving,setSaving]=useState(false);const isOpen=!['Completed','Cancelled','No Show'].includes(meeting.status);
  const finalize=async(status:'Completed'|'No Show')=>{setSaving(true);try{await meetingService.finalize(meeting.id,{status,outcome,requirementsSummary:requirements,problemsIdentified:problems,decisionMakers,commercialNotes:commercial,timelineNotes:timeline,nextStep,followUpAt:followUp?zonedLocalToIso(followUp,meeting.timezone):undefined});await onUpdated(status==='Completed'?'Meeting completed and outcome saved.':'Meeting marked No Show.');}catch(err:any){onError(getErrorMessage(err,'Meeting could not be finalized.'));}finally{setSaving(false);}};
  const cancel=async()=>{const reason=window.prompt('Cancellation reason (optional):','')||'';setSaving(true);try{await meetingService.cancel(meeting.id,reason);await onUpdated('Meeting cancelled and CRM history preserved.');}catch(err:any){onError(getErrorMessage(err,'Meeting could not be cancelled.'));}finally{setSaving(false);}};
  const reschedule=async()=>{setSaving(true);try{if(!settings.allowedDurations.includes(rescheduleDuration))throw new Error('Choose an Admin-approved meeting duration.');const startAt=zonedLocalToIso(rescheduleLocal,meeting.timezone);const endAt=new Date(new Date(startAt).getTime()+rescheduleDuration*60000).toISOString();if(await meetingService.hasConflict(meeting.salespersonId,startAt,endAt,meeting.id))throw new Error('This time overlaps another scheduled meeting.');await meetingService.reschedule(meeting.id,startAt,endAt,meeting.timezone,rescheduleUrl.trim());await onUpdated('Meeting rescheduled without creating a duplicate.');}catch(err:any){onError(getErrorMessage(err,'Meeting could not be rescheduled.'));}finally{setSaving(false);}};
  return <Modal title={meeting.title} onClose={onClose}><div className="space-y-5"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><InfoCard label="When" value={formatMeetingTime(meeting.startAt,meeting.timezone)}/><InfoCard label="Status" value={meeting.status}/><InfoCard label="Attendee" value={meeting.attendeeName||meeting.attendeeEmail||'CRM contact'}/><InfoCard label="Provider" value={meeting.provider}/></div><div className="flex flex-wrap gap-2">{meeting.meetingUrl&&<a href={meeting.meetingUrl} target="_blank" rel="noreferrer" className={primaryButtonClass}><Video className="h-4 w-4"/>Join Meeting</a>}{isOpen&&<button type="button" onClick={()=>setRescheduleOpen(value=>!value)} className={secondaryButtonClass}><Clock className="h-4 w-4"/>Reschedule</button>}</div>{rescheduleOpen&&isOpen&&<div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-4"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label={`New Start (${meeting.timezone})`}><input type="datetime-local" value={rescheduleLocal} onChange={e=>setRescheduleLocal(e.target.value)} className={inputClass}/></Field><Field label="Duration"><select value={rescheduleDuration} onChange={e=>setRescheduleDuration(Number(e.target.value))} className={inputClass}>{settings.allowedDurations.map(value=><option key={value} value={value}>{value} minutes</option>)}</select></Field></div><Field label="Meeting Link"><input value={rescheduleUrl} onChange={e=>setRescheduleUrl(e.target.value)} className={inputClass}/></Field><div className="flex justify-end"><button type="button" disabled={saving} onClick={()=>void reschedule()} className={primaryButtonClass}><RefreshCw className="h-4 w-4"/>Save Reschedule</button></div></div>}{isOpen&&<div className="space-y-3"><Field label="Outcome"><textarea rows={2} value={outcome} onChange={e=>setOutcome(e.target.value)} className={inputClass}/></Field><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Requirements"><textarea rows={3} value={requirements} onChange={e=>setRequirements(e.target.value)} className={inputClass}/></Field><Field label="Problems Identified"><textarea rows={3} value={problems} onChange={e=>setProblems(e.target.value)} className={inputClass}/></Field><Field label="Decision Makers"><textarea rows={2} value={decisionMakers} onChange={e=>setDecisionMakers(e.target.value)} className={inputClass}/></Field><Field label="Budget / Commercial"><textarea rows={2} value={commercial} onChange={e=>setCommercial(e.target.value)} className={inputClass}/></Field><Field label="Timeline"><textarea rows={2} value={timeline} onChange={e=>setTimeline(e.target.value)} className={inputClass}/></Field><Field label="Next Step"><textarea rows={2} value={nextStep} onChange={e=>setNextStep(e.target.value)} className={inputClass}/></Field></div><Field label={`Follow-Up (${meeting.timezone})`}><input type="datetime-local" value={followUp} onChange={e=>setFollowUp(e.target.value)} className={inputClass}/></Field><div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={()=>void cancel()} className={`${secondaryButtonClass} text-red-600`}>Cancel Meeting</button><button type="button" disabled={saving} onClick={()=>void finalize('No Show')} className={secondaryButtonClass}>Mark No Show</button><button type="button" disabled={saving} onClick={()=>void finalize('Completed')} className={primaryButtonClass}><CheckCircle2 className="h-4 w-4"/>Complete Meeting</button></div></div>}</div></Modal>;
}

function CalendarSettingsPanel({userId,current,profileTimezone,defaults,onSaved,onError}:{userId:string;current:UserCalendarSettings|null;profileTimezone:string;defaults:MeetingSettings;onSaved:(saved:UserCalendarSettings)=>void;onError:(message:string)=>void}){
  const [form,setForm]=useState<Omit<UserCalendarSettings,'updatedAt'>>({userId,provider:current?.provider||'Manual',calendarEmail:current?.calendarEmail||'',timezone:current?.timezone||profileTimezone||defaults.defaultTimezone,workingDays:current?.workingDays||[1,2,3,4,5],workStart:current?.workStart?.slice(0,5)||'09:00',workEnd:current?.workEnd?.slice(0,5)||'17:00',defaultDurationMinutes:current?.defaultDurationMinutes||defaults.defaultDurationMinutes,bufferBeforeMinutes:current?.bufferBeforeMinutes??defaults.bufferBeforeMinutes,bufferAfterMinutes:current?.bufferAfterMinutes??defaults.bufferAfterMinutes,bookingUrl:current?.bookingUrl||'',defaultPlatform:current?.defaultPlatform||'Google Meet',connectionStatus:current?.connectionStatus||'Not Connected',active:current?.active??true});const [saving,setSaving]=useState(false);const days=[['Sun',0],['Mon',1],['Tue',2],['Wed',3],['Thu',4],['Fri',5],['Sat',6]] as const;
  useEffect(()=>{if(!current)return;setForm({userId,provider:current.provider,calendarEmail:current.calendarEmail,timezone:current.timezone,workingDays:current.workingDays,workStart:current.workStart.slice(0,5),workEnd:current.workEnd.slice(0,5),defaultDurationMinutes:current.defaultDurationMinutes,bufferBeforeMinutes:current.bufferBeforeMinutes,bufferAfterMinutes:current.bufferAfterMinutes,bookingUrl:current.bookingUrl,defaultPlatform:current.defaultPlatform,connectionStatus:current.connectionStatus,active:current.active});},[current,userId]);
  const save=async(event:React.FormEvent)=>{event.preventDefault();setSaving(true);try{if(!isValidTimeZone(form.timezone))throw new Error('Enter a valid IANA timezone, for example Asia/Kolkata or America/New_York.');if(!form.workingDays.length)throw new Error('Select at least one working day.');if(form.workEnd<=form.workStart)throw new Error('Work end time must be after work start time.');if(!defaults.allowedDurations.includes(form.defaultDurationMinutes))throw new Error('Choose an Admin-approved default meeting duration.');const saved=await meetingService.saveCalendarSettings(form);onSaved(saved);}catch(err:any){onError(getErrorMessage(err,'Availability settings could not be saved.'));}finally{setSaving(false);}};
  return <form onSubmit={save} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div><h2 className="font-bold">My Availability</h2><p className="text-xs text-slate-500">Set working timezone, hours and booking preferences. ProFox Calendar remains primary.</p></div><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Timezone"><input required value={form.timezone} onChange={e=>setForm({...form,timezone:e.target.value})} className={inputClass}/></Field><Field label="Calendar Email"><input type="email" value={form.calendarEmail} onChange={e=>setForm({...form,calendarEmail:e.target.value})} className={inputClass}/></Field><Field label="Work Starts"><input type="time" value={form.workStart} onChange={e=>setForm({...form,workStart:e.target.value})} className={inputClass}/></Field><Field label="Work Ends"><input type="time" value={form.workEnd} onChange={e=>setForm({...form,workEnd:e.target.value})} className={inputClass}/></Field><Field label="Default Duration"><select value={form.defaultDurationMinutes} onChange={e=>setForm({...form,defaultDurationMinutes:Number(e.target.value)})} className={inputClass}>{defaults.allowedDurations.map(value=><option key={value} value={value}>{value} minutes</option>)}</select></Field><Field label="Booking Link"><input value={form.bookingUrl} onChange={e=>setForm({...form,bookingUrl:e.target.value})} className={inputClass}/></Field><Field label="Buffer Before"><input type="number" min={0} max={240} value={form.bufferBeforeMinutes} onChange={e=>setForm({...form,bufferBeforeMinutes:Number(e.target.value)})} className={inputClass}/></Field><Field label="Buffer After"><input type="number" min={0} max={240} value={form.bufferAfterMinutes} onChange={e=>setForm({...form,bufferAfterMinutes:Number(e.target.value)})} className={inputClass}/></Field></div><Field label="Working Days"><div className="flex flex-wrap gap-2">{days.map(([label,value])=><button key={value} type="button" onClick={()=>setForm({...form,workingDays:form.workingDays.includes(value)?form.workingDays.filter(day=>day!==value):[...form.workingDays,value].sort()})} className={`rounded-xl border px-3 py-2 text-xs font-bold ${form.workingDays.includes(value)?'border-[#000080] bg-[#000080] text-white':'border-slate-200 bg-white text-slate-600'}`}>{label}</button>)}</div></Field><label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/>Accept new meetings within this availability</label><div className="flex justify-end"><button disabled={saving} className={primaryButtonClass}>{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}Save Availability</button></div></form>;
}

function FullScreenLoader(){return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-7 w-7 animate-spin text-[#000080]"/></div>}
function AccessPanel({title,message,onBack}:{title:string;message:string;onBack:()=>void}){return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="w-full max-w-md space-y-4 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><AlertCircle className="mx-auto h-10 w-10 text-amber-500"/><h1 className="text-xl font-bold">{title}</h1><p className="text-sm text-slate-500">{message}</p><button onClick={onBack} className={`${primaryButtonClass} mx-auto`}><ArrowLeft className="h-4 w-4"/>Back to Admin</button></div></div>}
function Notice({type,text}:{type:'success'|'error';text:string}){return <div className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-bold ${type==='success'?'border-green-200 bg-green-50 text-green-800':'border-red-200 bg-red-50 text-red-800'}`}>{type==='success'?<CheckCircle2 className="h-4 w-4"/>:<AlertCircle className="h-4 w-4"/>}{text}</div>}
function TabButton({active,onClick,icon,label}:{active:boolean;onClick:()=>void;icon:React.ReactNode;label:string}){return <button onClick={onClick} className={`flex items-center gap-2 whitespace-nowrap rounded-xl border px-4 py-2.5 text-xs font-bold ${active?'border-[#000080] bg-[#000080] text-white':'border-slate-200 bg-white text-slate-600'}`}>{icon}{label}</button>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block space-y-1.5"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>{children}</label>}
function InfoCard({label,value}:{label:string;value:string}){return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase text-slate-400">{label}</div><div className="mt-1 text-xs font-bold">{value}</div></div>}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"><div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4"><h2 className="font-bold">{title}</h2><button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100"><X className="h-5 w-5"/></button></div><div className="p-6">{children}</div></div></div>}
