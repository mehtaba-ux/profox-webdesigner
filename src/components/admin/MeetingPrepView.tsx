import React, { useEffect, useState } from 'react';
import { ArrowLeft, BriefcaseBusiness, CalendarDays, CheckCircle2, ExternalLink, Globe2, Loader2, Target, UserRound, UsersRound, WalletCards } from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { sellerExperienceClosureService } from '../../lib/sellerExperienceClosureService';
import NextBestActionCard from './NextBestActionCard';
import ProductivityPlaybookChecklist from './ProductivityPlaybookChecklist';
import ProductivityCopilot from './ProductivityCopilot';

const SELLER_ROLES = ['sales', 'sales_rep', 'sales_team'];

function formatDateTime(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    }).format(new Date(value));
  } catch { return new Date(value).toLocaleString(); }
}

export default function MeetingPrepView() {
  const { id = '' } = useParams<{id:string}>();
  const navigate = useNavigate();
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const allowed = Boolean(user && (isAdmin || (profile?.status==='active' && SELLER_ROLES.includes(profile?.role || ''))));
  const [record,setRecord] = useState<any>(null);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');

  useEffect(()=>{
    if (!allowed || !id) return;
    void (async()=>{
      setLoading(true);setError('');
      try {
        const {data:meeting,error:meetingError}=await supabase.from('sales_meetings').select('*').eq('id',id).single();
        if (meetingError) throw meetingError;
        const [bookingResult,leadResult,opportunityResult] = await Promise.all([
          supabase.from('public_booking_submissions').select('*').eq('meeting_id',id).maybeSingle(),
          meeting.lead_id?supabase.from('crm_leads').select('*').eq('id',meeting.lead_id).maybeSingle():Promise.resolve({data:null,error:null} as any),
          meeting.opportunity_id?supabase.from('crm_opportunities').select('*').eq('id',meeting.opportunity_id).maybeSingle():Promise.resolve({data:null,error:null} as any)
        ]);
        setRecord({meeting,booking:bookingResult.data,lead:leadResult.data,opportunity:opportunityResult.data});
      } catch(err:any){setError(err?.message||'Meeting preparation could not be loaded.');}
      finally{setLoading(false);}
    })();
  },[allowed,id]);

  const markPrepared = async () => {
    if (!record?.meeting) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await sellerExperienceClosureService.markMeetingPrepared(id);
      const preparedAt = new Date().toISOString();
      setRecord((current:any)=>current ? {...current,meeting:{...current.meeting,prep_reviewed_at:preparedAt,prep_reviewed_by:user?.id}} : current);
      setMessage('Preparation reviewed. The canonical meeting record now reflects that this call is ready.');
    } catch(err:any){setError(err?.message||'Preparation status could not be saved.');}
    finally{setSaving(false);}
  };

  if(authLoading)return <div className="min-h-screen bg-slate-50"/>;
  if(!allowed)return <Navigate to="/admin/workspace" replace/>;
  const meeting=record?.meeting; const booking=record?.booking; const lead=record?.lead; const opportunity=record?.opportunity;
  const company=booking?.company_name||opportunity?.company_name||lead?.company_name||'Prospect';
  const contact=booking?.contact_name||opportunity?.contact_name||lead?.contact_name||meeting?.attendee_name||'';
  const website=booking?.website||opportunity?.website||lead?.website||'';
  const service=booking?.service_interest||opportunity?.service_interest||lead?.service_interest||'';
  const prepared = Boolean(meeting?.prep_reviewed_at && (!meeting?.rescheduled_at || new Date(meeting.prep_reviewed_at)>=new Date(meeting.rescheduled_at)));

  return <div className="min-h-screen bg-slate-50 text-slate-900"><header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-6xl items-center gap-3"><button onClick={()=>navigate('/admin/today')} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><ArrowLeft className="h-4 w-4"/></button><div><h1 className="text-xl font-black">Meeting Preparation</h1><p className="text-xs text-slate-500">Everything useful for the call, from the same CRM and Calendar records.</p></div></div></header><main className="mx-auto max-w-6xl p-4 sm:p-8">{loading?<div className="flex min-h-80 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>:error&&!meeting?<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>:meeting?<>
    {error&&<div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}{message&&<div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</div>}
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#FF0E0E]">{meeting.meeting_type}</div><h2 className="mt-2 text-3xl font-black">{company}</h2><p className="mt-2 text-sm text-slate-500">{contact}{service?` · ${service}`:''}</p><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-[#000080]"><CalendarDays className="mr-1 inline h-3.5 w-3.5"/>{formatDateTime(meeting.start_at,meeting.timezone)}</span><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{meeting.status}</span>{prepared&&<span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/> Preparation reviewed</span>}</div></div><div className="flex flex-wrap gap-2">{website&&<a href={website.startsWith('http')?website:`https://${website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-700"><Globe2 className="h-4 w-4"/> Website</a>}{meeting.meeting_url&&<a href={meeting.meeting_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2 text-xs font-black text-white">Join meeting <ExternalLink className="h-4 w-4"/></a>}<button onClick={()=>navigate(`/admin/meeting-manage/${id}`)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-700">Reschedule / Manage</button></div></div></section>

    <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><PrepStat icon={Target} label="Service" value={service||'Not specified'}/><PrepStat icon={WalletCards} label="Budget" value={meeting.commercial_notes||booking?.qualification_answers?.budget_range||'Not specified'}/><PrepStat icon={CalendarDays} label="Timeline" value={meeting.timeline_notes||booking?.qualification_answers?.timeline||'Not specified'}/><PrepStat icon={UsersRound} label="Decision maker" value={meeting.decision_makers||booking?.qualification_answers?.decision_maker||'Not specified'}/></section>

    <section className="mt-6 grid gap-6 lg:grid-cols-2"><InfoBlock title="What they want to achieve" icon={Target} text={booking?.qualification_answers?.project_goal||meeting.requirements_summary||'No project goal was captured yet.'}/><InfoBlock title="Qualification summary" icon={BriefcaseBusiness} text={meeting.requirements_summary||'No qualification summary was captured yet.'}/><InfoBlock title="Problems identified" icon={UserRound} text={meeting.problems_identified||'To be completed during the meeting.'}/><InfoBlock title="Next step" icon={ExternalLink} text={meeting.next_step||'No next step has been set yet. After the meeting, record the next action so the CRM stays moving.'}/></section>

    <section className="mt-6 grid gap-6 lg:grid-cols-2"><NextBestActionCard entityType="meeting" entityId={id}/><ProductivityPlaybookChecklist entityType="meeting" entityId={id}/><div className="lg:col-span-2"><ProductivityCopilot entityType="meeting" entityId={id}/></div></section>

    <section className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black text-emerald-950">Preparation acknowledgement</h3><p className="mt-1 text-xs leading-5 text-emerald-800">Save this only after you have reviewed the CRM context, meeting goal, qualification information and next-action guidance above. Rescheduling automatically makes preparation stale again until reviewed.</p></div><button onClick={()=>void markPrepared()} disabled={saving||prepared||!['Scheduled','Rescheduled'].includes(meeting.status)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<CheckCircle2 className="h-4 w-4"/>}{prepared?'Preparation Reviewed':'Mark Preparation Reviewed'}</button></div></section>
  </>:null}</main></div>;
}

function PrepStat({icon:Icon,label,value}:{icon:any;label:string;value:string}){return <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#000080]"><Icon className="h-4 w-4"/></div><div className="mt-4 text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 text-sm font-black leading-6 text-slate-800">{value}</div></div>}
function InfoBlock({title,icon:Icon,text}:{title:string;icon:any;text:string}){return <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><Icon className="h-5 w-5 text-[#000080]"/><h3 className="font-black">{title}</h3></div><div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-600">{text}</div></div>}
