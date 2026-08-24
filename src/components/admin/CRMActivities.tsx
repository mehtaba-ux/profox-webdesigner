import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Building2, Calendar, CheckCircle2, Clock, Loader2, Mail, Phone, Plus, Video, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { crmService } from '../../lib/crmService';
import { CRMActivity, CRMLead, CRMOpportunity, ActivityType, ACTIVITY_TYPES } from '../../types';
import { useAuth } from '../../lib/AuthContext';

function defaultDueAt() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function CRMActivities(_props: { onNavigate?: (tab: string) => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAdmin } = useAuth();
  const [activities, setActivities] = useState<CRMActivity[]>([]);
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [opportunities, setOpportunities] = useState<CRMOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'today' | 'upcoming' | 'overdue' | 'completed'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [presetType, setPresetType] = useState<ActivityType>('Follow-Up');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [activityRows, leadRows, opportunityRows] = await Promise.all([
        crmService.getActivities(), crmService.getLeads(), crmService.getOpportunities()
      ]);
      setActivities(activityRows); setLeads(leadRows); setOpportunities(opportunityRows);
    } catch (err: any) { setError(err?.message || 'Unable to load CRM activities.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (searchParams.get('action') !== 'new') return;
    const requested = searchParams.get('type');
    const type = ACTIVITY_TYPES.includes(requested as ActivityType) ? requested as ActivityType : 'Follow-Up';
    setPresetType(type); setShowCreate(true);
    const next = new URLSearchParams(searchParams); next.delete('action'); next.delete('type');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const filteredActivities = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return activities.filter(act => {
      if (!(isAdmin || act.assignedTo === user?.id)) return false;
      const due = new Date(act.dueAt);
      if (filter === 'today') return act.status === 'Scheduled' && due >= start && due <= end;
      if (filter === 'upcoming') return act.status === 'Scheduled' && due > end;
      if (filter === 'overdue') return act.status === 'Scheduled' && due < start;
      if (filter === 'completed') return act.status === 'Completed';
      return true;
    });
  }, [activities, filter, isAdmin, user?.id]);

  const handleMarkComplete = async (id: string) => {
    try {
      await crmService.updateActivity(id, { status: 'Completed', completedAt: new Date().toISOString() });
      await load();
    } catch (err: any) { setError(err?.message || 'Activity could not be completed.'); }
  };

  const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);

  if (loading && activities.length === 0) return <div className="flex h-[600px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><h1 className="text-2xl font-bold text-slate-900">My Activities</h1><p className="text-sm text-slate-500">Calls, follow-ups and outreach stay on the canonical CRM activity record.</p></div><div className="flex flex-wrap gap-2"><button onClick={()=>{setPresetType('Cold Call');setShowCreate(true);}} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700"><Phone className="h-4 w-4" /> Log Call</button><button onClick={()=>{setPresetType('Follow-Up');setShowCreate(true);}} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2 text-xs font-black text-white"><Plus className="h-4 w-4" /> Add Follow-Up</button></div></div>
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">{(['all','overdue','today','upcoming','completed'] as const).map(value=><button key={value} onClick={()=>setFilter(value)} className={`rounded-lg px-3 py-2 text-xs font-bold capitalize ${filter===value?'bg-slate-100 text-[#000080]':'text-slate-400'}`}>{value}</button>)}</div>
    <div className="grid gap-4">{filteredActivities.map(activity=><div key={activity.id} className={`flex flex-col justify-between gap-5 rounded-2xl border bg-white p-5 shadow-sm md:flex-row md:items-center ${activity.status==='Scheduled'&&new Date(activity.dueAt)<startOfToday?'border-red-200':'border-slate-200'}`}><div className="flex items-start gap-4"><div className={`rounded-2xl p-3 ${activity.activityType.includes('Call')?'bg-blue-50 text-blue-600':activity.activityType.includes('Email')?'bg-amber-50 text-amber-600':activity.activityType.includes('Loom')?'bg-purple-50 text-purple-600':'bg-slate-50 text-slate-600'}`}>{activity.activityType.includes('Call')?<Phone className="h-5 w-5"/>:activity.activityType.includes('Email')?<Mail className="h-5 w-5"/>:activity.activityType.includes('Loom')?<Video className="h-5 w-5"/>:<Calendar className="h-5 w-5"/>}</div><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{activity.subject}</h3>{activity.status==='Scheduled'&&new Date(activity.dueAt)<startOfToday&&<span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-black uppercase text-red-700"><AlertCircle className="h-3 w-3"/> Overdue</span>}</div><div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{activity.leadId||activity.opportunityId||'General'}</span><span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{new Date(activity.dueAt).toLocaleString()}</span><span>{activity.activityType}</span></div></div></div>{activity.status==='Scheduled'&&<button onClick={()=>void handleMarkComplete(activity.id)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 py-2 text-xs font-black text-white"><CheckCircle2 className="h-4 w-4"/> Mark Complete</button>}</div>)}{filteredActivities.length===0&&<div className="rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-12 text-center text-sm text-slate-500">No activities match this filter.</div>}</div>
    {showCreate && <CreateActivityModal presetType={presetType} userId={user?.id||''} leads={leads.filter(l=>isAdmin||l.salespersonId===user?.id)} opportunities={opportunities.filter(o=>isAdmin||o.salespersonId===user?.id)} onClose={()=>setShowCreate(false)} onCreated={async()=>{setShowCreate(false);await load();}} />}
  </div>;
}

function CreateActivityModal({presetType,userId,leads,opportunities,onClose,onCreated}:{presetType:ActivityType;userId:string;leads:CRMLead[];opportunities:CRMOpportunity[];onClose:()=>void;onCreated:()=>Promise<void>}){
  const [type,setType]=useState<ActivityType>(presetType); const [target,setTarget]=useState(''); const [subject,setSubject]=useState(presetType==='Cold Call'?'Sales call':'Follow up'); const [dueAt,setDueAt]=useState(defaultDueAt()); const [notes,setNotes]=useState(''); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setError('');try{const [kind,id]=target.split(':');await crmService.createActivity({assignedTo:userId,activityType:type,subject:subject.trim(),dueAt:new Date(dueAt).toISOString(),status:'Scheduled',leadId:kind==='lead'?id:undefined,opportunityId:kind==='opportunity'?id:undefined,notes:notes.trim()});await onCreated();}catch(err:any){setError(err?.message||'Activity could not be created.');}finally{setSaving(false);}};
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><form onSubmit={submit} className="w-full max-w-xl rounded-3xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div><h2 className="text-lg font-black">{presetType==='Cold Call'?'Log Call':'Add Follow-Up'}</h2><p className="text-xs text-slate-500">Creates the existing secured CRM activity record.</p></div><button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5"/></button></div><div className="space-y-4 p-6">{error&&<div className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}<label className="block text-xs font-bold text-slate-600">Activity type<select value={type} onChange={e=>setType(e.target.value as ActivityType)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{ACTIVITY_TYPES.map(item=><option key={item}>{item}</option>)}</select></label><label className="block text-xs font-bold text-slate-600">Linked CRM record<select value={target} onChange={e=>setTarget(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">General activity</option><optgroup label="Leads">{leads.map(item=><option key={item.id} value={`lead:${item.id}`}>{item.companyName} — {item.title}</option>)}</optgroup><optgroup label="Opportunities">{opportunities.map(item=><option key={item.id} value={`opportunity:${item.id}`}>{item.companyName||item.name} — {item.stage}</option>)}</optgroup></select></label><label className="block text-xs font-bold text-slate-600">Subject<input required value={subject} onChange={e=>setSubject(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label><label className="block text-xs font-bold text-slate-600">Due date & time<input required type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label><label className="block text-xs font-bold text-slate-600">Notes<textarea value={notes} onChange={e=>setNotes(e.target.value)} className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label></div><div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-black text-slate-500">Cancel</button><button disabled={saving||!subject.trim()||!dueAt} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving&&<Loader2 className="h-4 w-4 animate-spin"/>}Save Activity</button></div></form></div>;
}
