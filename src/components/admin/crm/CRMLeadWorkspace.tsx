import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Clock3,
  Filter,
  Globe2,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../lib/AuthContext';
import { crmService } from '../../../lib/crmService';
import {
  CRMLead,
  CRMLeadPerson,
  INDUSTRIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  LeadOriginType,
  LeadQuality,
  LeadStatus,
} from '../../../types';
import CRMLeadDrawer, { LeadDrawerTab } from './CRMLeadDrawer';
import CRMLeadMeetingModal from './CRMLeadMeetingModal';

const qualityClasses: Record<LeadQuality,string> = {
  High: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Medium: 'border-amber-200 bg-amber-50 text-amber-700',
  Low: 'border-slate-200 bg-slate-100 text-slate-600',
};

const stageClasses: Record<LeadStatus,string> = {
  New: 'border-blue-200 bg-blue-50 text-blue-700',
  Researching: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  Contacted: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  'Follow-Up': 'border-amber-200 bg-amber-50 text-amber-700',
  Interested: 'border-violet-200 bg-violet-50 text-violet-700',
  Qualified: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'Not Qualified': 'border-rose-200 bg-rose-50 text-rose-700',
};

function dueState(value?: string) {
  if (!value) return { label: 'No follow-up', classes: 'text-slate-400', overdue: false };
  const date = new Date(value);
  const overdue = date.getTime() < Date.now();
  return {
    label: date.toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }),
    classes: overdue ? 'text-rose-600' : 'text-slate-600',
    overdue,
  };
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase() || 'PF';
}

function personFor(lead: CRMLead, people: Map<string,CRMLeadPerson>) {
  return lead.salespersonId ? people.get(lead.salespersonId) : undefined;
}

export default function CRMLeadWorkspace({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [searchParams,setSearchParams] = useSearchParams();
  const { user,isAdmin } = useAuth();
  const [leads,setLeads] = useState<CRMLead[]>([]);
  const [assignees,setAssignees] = useState<CRMLeadPerson[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [success,setSuccess] = useState('');
  const [search,setSearch] = useState('');
  const [stage,setStage] = useState<'all'|LeadStatus>('all');
  const [quality,setQuality] = useState<'all'|LeadQuality>('all');
  const [owner,setOwner] = useState('all');
  const [sort,setSort] = useState<'newest'|'score'|'follow_up'>('newest');
  const [selected,setSelected] = useState<CRMLead|null>(null);
  const [drawerTab,setDrawerTab] = useState<LeadDrawerTab>('overview');
  const [adding,setAdding] = useState(false);
  const [meetingLead,setMeetingLead] = useState<CRMLead|null>(null);
  const [busyLead,setBusyLead] = useState('');

  const load = async (quiet=false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [leadRows,people] = await Promise.all([crmService.getLeads(),crmService.getLeadAssignees()]);
      setLeads(leadRows);
      setAssignees(people);
      setSelected(current=>current ? leadRows.find(item=>item.id===current.id)||null : null);
    } catch (err:any) {
      setError(err?.message||'The CRM lead workspace could not be loaded.');
    } finally { setLoading(false); }
  };

  useEffect(()=>{ void load(); },[]);
  useEffect(()=>{
    if(searchParams.get('action')!=='new') return;
    setAdding(true);
    const next=new URLSearchParams(searchParams);next.delete('action');setSearchParams(next,{replace:true});
  },[searchParams,setSearchParams]);

  const people = useMemo(()=>new Map(assignees.map(person=>[person.id,person])),[assignees]);
  const filtered = useMemo(()=>{
    const query=search.trim().toLowerCase();
    return leads.filter(lead=>{
      const assignee=personFor(lead,people);
      return (!query||`${lead.title} ${lead.companyName} ${lead.contactName||''} ${lead.email||''} ${lead.source} ${assignee?.name||''}`.toLowerCase().includes(query))
        && (stage==='all'||lead.status===stage)
        && (quality==='all'||lead.leadQuality===quality)
        && (owner==='all'||(owner==='unassigned'?!lead.salespersonId:lead.salespersonId===owner));
    }).sort((a,b)=>sort==='score'?b.leadScore-a.leadScore:sort==='follow_up'?(new Date(a.nextFollowUpAt||'9999-12-31').getTime()-new Date(b.nextFollowUpAt||'9999-12-31').getTime()):new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
  },[leads,people,search,stage,quality,owner,sort]);

  const stats = useMemo(()=>({
    total:leads.length,
    high:leads.filter(item=>item.leadQuality==='High').length,
    overdue:leads.filter(item=>item.nextFollowUpAt&&new Date(item.nextFollowUpAt).getTime()<Date.now()).length,
    unassigned:leads.filter(item=>!item.salespersonId).length,
  }),[leads]);

  const updateStage = async (lead:CRMLead,next:LeadStatus) => {
    if(next===lead.status)return;
    setBusyLead(lead.id);setError('');
    const previous=lead.status;
    setLeads(rows=>rows.map(item=>item.id===lead.id?{...item,status:next}:item));
    try{await crmService.updateLead(lead.id,{status:next});setSuccess(`Stage updated to ${next}.`);await load(true);}
    catch(err:any){setLeads(rows=>rows.map(item=>item.id===lead.id?{...item,status:previous}:item));setError(err?.message||'Stage could not be updated.');}
    finally{setBusyLead('');}
  };

  const openLead=(lead:CRMLead,tab:LeadDrawerTab='overview')=>{setSelected(lead);setDrawerTab(tab);};

  if(loading&&leads.length===0)return <div className="flex min-h-[560px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>;

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><div className="text-[10px] font-black uppercase tracking-[.2em] text-[#000080]">Sales workspace</div><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Lead command center</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Ownership, scoring, communication, meetings and the complete customer history in one connected record.</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={()=>void load()} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/>Refresh</button><button type="button" onClick={()=>setAdding(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-5 text-xs font-black text-white shadow-lg shadow-blue-950/10"><Plus className="h-4 w-4"/>Add lead</button></div>
    </header>

    {error&&<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>}
    {success&&<div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"><span>{success}</span><button onClick={()=>setSuccess('')}><X className="h-4 w-4"/></button></div>}

    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric label="Active leads" value={stats.total} icon={<UsersRound className="h-5 w-5"/>} tone="bg-blue-50 text-[#000080]"/>
      <Metric label="High quality" value={stats.high} icon={<Sparkles className="h-5 w-5"/>} tone="bg-emerald-50 text-emerald-700"/>
      <Metric label="Overdue" value={stats.overdue} icon={<AlertCircle className="h-5 w-5"/>} tone="bg-rose-50 text-rose-700"/>
      <Metric label="Unassigned" value={stats.unassigned} icon={<UserRound className="h-5 w-5"/>} tone="bg-amber-50 text-amber-700"/>
    </section>

    <section className="rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_160px_190px_160px]">
        <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search lead, company, email or assignee" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-[#000080] focus:bg-white"/></label>
        <FilterSelect icon={<Filter className="h-4 w-4"/>} value={stage} onChange={value=>setStage(value as any)}><option value="all">All stages</option>{LEAD_STATUSES.map(value=><option key={value}>{value}</option>)}</FilterSelect>
        <FilterSelect value={quality} onChange={value=>setQuality(value as any)}><option value="all">All quality</option><option>High</option><option>Medium</option><option>Low</option></FilterSelect>
        <FilterSelect value={owner} onChange={setOwner}><option value="all">All assignees</option><option value="unassigned">Unassigned</option>{assignees.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</FilterSelect>
        <FilterSelect icon={<ArrowUpDown className="h-4 w-4"/>} value={sort} onChange={value=>setSort(value as any)}><option value="newest">Newest first</option><option value="score">Highest score</option><option value="follow_up">Next follow-up</option></FilterSelect>
      </div>

      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1080px] text-left"><thead><tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-black uppercase tracking-[.12em] text-slate-400"><th className="px-5 py-4">Lead</th><th className="px-5 py-4">Source & score</th><th className="px-5 py-4">Assignee</th><th className="px-5 py-4">Stage</th><th className="px-5 py-4">Next action</th><th className="px-5 py-4 text-right">Connect</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map(lead=><LeadRow key={lead.id} lead={lead} assignee={personFor(lead,people)} busy={busyLead===lead.id} onOpen={openLead} onStage={next=>void updateStage(lead,next)} onMeeting={()=>setMeetingLead(lead)}/>)}</tbody></table></div>
      <div className="divide-y divide-slate-100 md:hidden">{filtered.map(lead=><LeadCard key={lead.id} lead={lead} assignee={personFor(lead,people)} busy={busyLead===lead.id} onOpen={openLead} onStage={next=>void updateStage(lead,next)} onMeeting={()=>setMeetingLead(lead)}/>)}</div>
      {filtered.length===0&&<div className="px-6 py-16 text-center"><UsersRound className="mx-auto h-9 w-9 text-slate-300"/><div className="mt-3 text-sm font-black text-slate-700">No leads match these filters</div><p className="mt-1 text-xs text-slate-400">Clear a filter or add a new lead.</p></div>}
    </section>

    {selected&&<CRMLeadDrawer lead={selected} assignees={assignees} initialTab={drawerTab} isAdmin={isAdmin} currentUserId={user?.id||''} onClose={()=>setSelected(null)} onChanged={async message=>{setSuccess(message);await load(true);}} onOpenMeeting={()=>setMeetingLead(selected)} onNavigate={onNavigate}/>}
    {adding&&<AddLeadModal assignees={assignees} currentUserId={user?.id||''} isAdmin={isAdmin} onClose={()=>setAdding(false)} onCreated={async()=>{setAdding(false);setSuccess('Lead created, scored and added to the audit timeline.');await load(true);}}/>}
    {meetingLead&&<CRMLeadMeetingModal lead={meetingLead} currentUserId={user?.id||''} onClose={()=>setMeetingLead(null)} onCreated={async()=>{setMeetingLead(null);setSuccess('Meeting scheduled in ProFox Calendar and added to the lead timeline.');await load(true);}}/>}
  </div>;
}

function Metric({label,value,icon,tone}:{label:string;value:number;icon:React.ReactNode;tone:string}){return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>{icon}</div><div className="mt-4 text-2xl font-black text-slate-950">{value}</div><div className="mt-1 text-[10px] font-black uppercase tracking-[.12em] text-slate-400">{label}</div></article>}

function FilterSelect({value,onChange,children,icon}:{value:string;onChange:(value:string)=>void;children:React.ReactNode;icon?:React.ReactNode}){return <label className="relative flex h-11 items-center rounded-xl border border-slate-200 bg-white px-3">{icon&&<span className="mr-2 text-slate-400">{icon}</span>}<select value={value} onChange={event=>onChange(event.target.value)} className="h-full min-w-0 flex-1 appearance-none bg-transparent pr-6 text-xs font-bold text-slate-600 outline-none">{children}</select><ChevronDown className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-slate-400"/></label>}

function Assignee({person}:{person?:CRMLeadPerson}){return <div className="flex items-center gap-2.5">{person?.avatarUrl?<img src={person.avatarUrl} alt="" className="h-9 w-9 rounded-xl object-cover"/>:<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-[10px] font-black text-slate-500">{initials(person?.name||'Unassigned')}</div>}<div className="min-w-0"><div className="max-w-[150px] truncate text-xs font-black text-slate-700">{person?.name||'Unassigned'}</div><div className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">{person?'Sales owner':'Needs owner'}</div></div></div>}

function StageSelect({lead,busy,onStage}:{lead:CRMLead;busy:boolean;onStage:(value:LeadStatus)=>void}){return <label onClick={event=>event.stopPropagation()} className={`relative inline-flex min-w-[145px] items-center rounded-xl border ${stageClasses[lead.status]}`}><select aria-label={`Stage for ${lead.title}`} disabled={busy} value={lead.status} onChange={event=>onStage(event.target.value as LeadStatus)} className="h-10 w-full appearance-none bg-transparent px-3 pr-8 text-[11px] font-black outline-none disabled:opacity-50">{LEAD_STATUSES.map(value=><option key={value} value={value}>{value}</option>)}</select>{busy?<Loader2 className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 animate-spin"/>:<ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5"/>}</label>}

function ConnectButtons({lead,onOpen,onMeeting}:{lead:CRMLead;onOpen:(lead:CRMLead,tab:LeadDrawerTab)=>void;onMeeting:()=>void}){return <div className="flex items-center justify-end gap-1.5"><button onClick={event=>{event.stopPropagation();onOpen(lead,'communication')}} title="Chat with customer" className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:border-[#000080]/30 hover:bg-blue-50 hover:text-[#000080]"><MessageCircle className="h-4 w-4"/></button><button onClick={event=>{event.stopPropagation();onOpen(lead,'communication')}} title="Email customer" className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:border-[#000080]/30 hover:bg-blue-50 hover:text-[#000080]"><Mail className="h-4 w-4"/></button><button onClick={event=>{event.stopPropagation();onMeeting();}} title="Schedule meeting" className="rounded-xl bg-[#000080] p-2.5 text-white hover:bg-[#000066]"><CalendarDays className="h-4 w-4"/></button></div>}

function LeadRow({lead,assignee,busy,onOpen,onStage,onMeeting}:{lead:CRMLead;assignee?:CRMLeadPerson;busy:boolean;onOpen:(lead:CRMLead,tab?:LeadDrawerTab)=>void;onStage:(value:LeadStatus)=>void;onMeeting:()=>void}){const due=dueState(lead.nextFollowUpAt);return <tr onClick={()=>onOpen(lead)} className="cursor-pointer transition hover:bg-slate-50/80"><td className="px-5 py-4"><div className="max-w-[240px]"><div className="truncate text-sm font-black text-slate-900">{lead.title}</div><div className="mt-1 truncate text-xs text-slate-500">{lead.companyName} {lead.contactName?`· ${lead.contactName}`:''}</div><div className="mt-1 truncate text-[10px] text-slate-400">{lead.email||'No email address'}</div></div></td><td className="px-5 py-4"><div className="flex items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${qualityClasses[lead.leadQuality]}`}>{lead.leadQuality} · {lead.leadScore}</span></div><div className="mt-1.5 max-w-[170px] truncate text-[10px] font-semibold text-slate-400">{lead.source}</div></td><td className="px-5 py-4"><Assignee person={assignee}/></td><td className="px-5 py-4"><StageSelect lead={lead} busy={busy} onStage={onStage}/></td><td className="px-5 py-4"><div className={`flex items-center gap-1.5 text-xs font-bold ${due.classes}`}><Clock3 className="h-3.5 w-3.5"/>{due.label}</div>{due.overdue&&<div className="mt-1 text-[9px] font-black uppercase text-rose-500">Overdue</div>}</td><td className="px-5 py-4"><ConnectButtons lead={lead} onOpen={onOpen} onMeeting={onMeeting}/></td></tr>}

function LeadCard(props:{lead:CRMLead;assignee?:CRMLeadPerson;busy:boolean;onOpen:(lead:CRMLead,tab?:LeadDrawerTab)=>void;onStage:(value:LeadStatus)=>void;onMeeting:()=>void}){const {lead}=props;const due=dueState(lead.nextFollowUpAt);return <article onClick={()=>props.onOpen(lead)} className="space-y-4 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{lead.title}</div><div className="mt-1 truncate text-xs text-slate-500">{lead.companyName}</div></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black ${qualityClasses[lead.leadQuality]}`}>{lead.leadQuality} · {lead.leadScore}</span></div><div className="grid grid-cols-2 gap-3"><div><div className="mb-1 text-[9px] font-black uppercase text-slate-400">Assignee</div><Assignee person={props.assignee}/></div><div><div className="mb-1 text-[9px] font-black uppercase text-slate-400">Next action</div><div className={`flex items-center gap-1 text-xs font-bold ${due.classes}`}><Clock3 className="h-3.5 w-3.5"/>{due.label}</div></div></div><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><StageSelect lead={lead} busy={props.busy} onStage={props.onStage}/><ConnectButtons lead={lead} onOpen={props.onOpen} onMeeting={props.onMeeting}/></div></article>}

function originForSource(source:string):LeadOriginType{const value=source.toLowerCase();if(/ads|paid|campaign|ppc/.test(value))return'paid_ads';if(/website|live chat|contact form/.test(value))return'website';if(/referral|partner/.test(value))return'referral';return'manual'}
function scorePreview(origin:LeadOriginType){if(origin==='website')return{quality:'High',score:90,reason:'Direct website enquiry'};if(origin==='paid_ads')return{quality:'Medium',score:60,reason:'Paid advertising lead'};if(origin==='referral')return{quality:'High',score:75,reason:'Referral or partner lead'};return{quality:'Low',score:25,reason:'Manually entered CRM lead'}}

function AddLeadModal({assignees,currentUserId,isAdmin,onClose,onCreated}:{assignees:CRMLeadPerson[];currentUserId:string;isAdmin:boolean;onClose:()=>void;onCreated:()=>Promise<void>}){
  const initialSource='Google Maps';const [form,setForm]=useState<Partial<CRMLead>>({title:'',companyName:'',contactName:'',email:'',phone:'',website:'',country:'',industry:'Other',source:initialSource,originType:'manual',salespersonId:isAdmin?(assignees[0]?.id||undefined):currentUserId,serviceInterest:'',estimatedValue:0,currency:'USD',status:'New',initialOutreachChannel:'Email',notes:'',selfGenerated:true});const [saving,setSaving]=useState(false);const [error,setError]=useState('');const preview=scorePreview(form.originType||'manual');
  const patch=(value:Partial<CRMLead>)=>setForm(current=>({...current,...value}));
  const submit=async(event:React.FormEvent)=>{event.preventDefault();setSaving(true);setError('');try{if(!form.salespersonId)throw new Error('Assign the lead to a qualified Sales Representative.');await crmService.createLead(form);await onCreated();}catch(err:any){setError(err?.message||'Lead could not be created.');}finally{setSaving(false);}};
  return <Overlay><form onSubmit={submit} className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-[2rem] bg-white shadow-2xl"><ModalHeader title="Add lead" subtitle="Create one canonical CRM record with ownership, scoring and history." onClose={onClose}/><div className="max-h-[68vh] space-y-5 overflow-y-auto p-5 sm:p-7">{error&&<div className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</div>}<div className="grid gap-4 sm:grid-cols-2"><Field label="Lead title"><input required value={form.title||''} onChange={event=>patch({title:event.target.value})}/></Field><Field label="Company"><input required value={form.companyName||''} onChange={event=>patch({companyName:event.target.value})}/></Field><Field label="Contact name"><input value={form.contactName||''} onChange={event=>patch({contactName:event.target.value})}/></Field><Field label="Email"><input type="email" value={form.email||''} onChange={event=>patch({email:event.target.value})}/></Field><Field label="Phone"><input value={form.phone||''} onChange={event=>patch({phone:event.target.value})}/></Field><Field label="Website"><input value={form.website||''} onChange={event=>patch({website:event.target.value})} placeholder="https://"/></Field><Field label="Country"><input required value={form.country||''} onChange={event=>patch({country:event.target.value})}/></Field><Field label="Industry"><select value={form.industry||'Other'} onChange={event=>patch({industry:event.target.value})}>{INDUSTRIES.map(value=><option key={value}>{value}</option>)}</select></Field><Field label="Lead source"><select value={form.source||initialSource} onChange={event=>{const source=event.target.value;patch({source,originType:originForSource(source)})}}>{LEAD_SOURCES.map(value=><option key={value}>{value}</option>)}</select></Field><Field label="Acquisition class"><select value={form.originType||'manual'} onChange={event=>patch({originType:event.target.value as LeadOriginType})}><option value="manual">Manual CRM entry</option><option value="website">Direct website</option><option value="paid_ads">Paid advertising</option><option value="referral">Referral / partner</option><option value="other">Other</option></select></Field><Field label="Assignee"><select required value={form.salespersonId||''} disabled={!isAdmin} onChange={event=>patch({salespersonId:event.target.value})}><option value="">Choose salesperson</option>{assignees.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></Field><Field label="Estimated value"><input type="number" min={0} value={form.estimatedValue||0} onChange={event=>patch({estimatedValue:Number(event.target.value)})}/></Field><Field label="Service interest"><input value={form.serviceInterest||''} onChange={event=>patch({serviceInterest:event.target.value})}/></Field><Field label="Initial channel"><select value={form.initialOutreachChannel||'Email'} onChange={event=>patch({initialOutreachChannel:event.target.value})}><option>Email</option><option>Phone</option><option>LinkedIn</option><option>WhatsApp</option><option>Other</option></select></Field></div><Field label="Internal notes"><textarea rows={4} value={form.notes||''} onChange={event=>patch({notes:event.target.value})}/></Field><div className={`flex items-start gap-3 rounded-2xl border p-4 ${qualityClasses[preview.quality as LeadQuality]}`}><BarChart3 className="mt-0.5 h-5 w-5 shrink-0"/><div><div className="text-xs font-black">Automatic score: {preview.score}/100 · {preview.quality}</div><p className="mt-1 text-[11px] leading-5 opacity-80">{preview.reason}. Supabase recalculates this value from the saved origin and records it in the lead timeline.</p></div></div></div><div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:px-7"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-black text-slate-500">Cancel</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving&&<Loader2 className="h-4 w-4 animate-spin"/>}Create lead</button></div></form></Overlay>;
}

export function Overlay({children}:{children:React.ReactNode}){return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">{children}</div>}
export function ModalHeader({title,subtitle,onClose}:{title:string;subtitle:string;onClose:()=>void}){return <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-7"><div><h2 className="text-xl font-black text-slate-950">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p></div><button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5"/></button></div>}
export function Field({label,children}:{label:string;children:React.ReactElement}){return <label className="block text-[10px] font-black uppercase tracking-[.1em] text-slate-500"><span>{label}</span>{React.cloneElement(children as React.ReactElement<any>,{className:`mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none transition focus:border-[#000080] focus:bg-white ${(children.props as any).className||''}`})}</label>}
