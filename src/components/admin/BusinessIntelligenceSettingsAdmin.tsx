import React,{useEffect,useState} from 'react';
import {ArrowLeft,CheckCircle2,Loader2,Save,ShieldCheck} from 'lucide-react';
import {Navigate,useNavigate} from 'react-router-dom';
import {useAuth} from '../../lib/AuthContext';
import {BusinessIntelligenceSettings,businessIntelligenceService} from '../../lib/businessIntelligenceService';

const stageOrder=['Qualified','Meeting Scheduled','Requirements Confirmed','Quotation Sent','Negotiation / Decision Pending','Awaiting Advance Payment','Won'];
const inputClass='w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100';

export default function BusinessIntelligenceSettingsAdmin(){
  const nav=useNavigate();
  const {user,profile,isAdmin,loading:authLoading}=useAuth();
  const allowed=Boolean(user&&profile?.status==='active'&&isAdmin);
  const [value,setValue]=useState<BusinessIntelligenceSettings|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState(false);

  useEffect(()=>{if(allowed)void (async()=>{setLoading(true);setError('');try{setValue(await businessIntelligenceService.getSettings());}catch(e:any){setError(e?.message||'Unable to load KPI rules.');}finally{setLoading(false);}})();},[allowed]);
  if(authLoading)return <div className="min-h-screen bg-slate-50"/>;
  if(!allowed)return <Navigate to="/admin" replace/>;

  const patchThreshold=(key:keyof BusinessIntelligenceSettings['thresholds'],raw:string)=>{if(!value)return;setSaved(false);setValue({...value,thresholds:{...value.thresholds,[key]:Number(raw)}})};
  const patchWeight=(key:string,raw:string)=>{if(!value)return;setSaved(false);setValue({...value,stageForecastWeights:{...value.stageForecastWeights,[key]:Number(raw)}})};
  const save=async()=>{if(!value)return;setSaving(true);setError('');setSaved(false);try{setValue(await businessIntelligenceService.saveSettings(value));setSaved(true);}catch(e:any){setError(e?.message||'Unable to save KPI rules.');}finally{setSaving(false);}};

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8"><div className="flex items-center gap-3"><button onClick={()=>nav('/admin/intelligence')} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><ArrowLeft className="h-4 w-4"/></button><div><h1 className="text-lg font-black">Business Intelligence Rules</h1><p className="mt-0.5 text-xs text-slate-500">Simple thresholds that decide when ProFox should surface a management exception.</p></div></div><button onClick={()=>void save()} disabled={!value||saving} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}Save rules</button></div></header>
    <main className="mx-auto max-w-5xl px-5 py-7 sm:px-8">
      <div className="mb-5 flex items-start gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-[#000080]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/><span>These settings control prioritization and forecasting only. They do not change payments, accounting records, CRM stages, projects or commissions.</span></div>
      {error&&<div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
      {saved&&<div className="mb-5 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4"/>Rules saved. Founder Control and Today will use them immediately.</div>}
      {loading||!value?<div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>:<div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-black">General</h2><p className="mt-1 text-xs text-slate-500">Keep one display currency for top-line cards; all detailed finance remains separated by currency.</p><div className="mt-5 grid gap-4 sm:grid-cols-3"><Field label="Primary currency"><input value={value.primaryCurrency} maxLength={3} onChange={e=>{setSaved(false);setValue({...value,primaryCurrency:e.target.value.toUpperCase()})}} className={inputClass}/></Field><Field label="Default reporting period"><input type="number" min={7} max={90} value={value.defaultPeriodDays} onChange={e=>{setSaved(false);setValue({...value,defaultPeriodDays:Number(e.target.value)})}} className={inputClass}/></Field><label className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3"><div><div className="text-xs font-black">Intelligence active</div><div className="mt-1 text-[10px] text-slate-400">Turn exception detection on/off.</div></div><input type="checkbox" checked={value.active} onChange={e=>{setSaved(false);setValue({...value,active:e.target.checked})}} className="h-4 w-4"/></label></div></section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-black">Exception thresholds</h2><p className="mt-1 text-xs text-slate-500">Use conservative limits. The goal is to surface real problems, not create notification noise.</p><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="New lead response" suffix="hours" value={value.thresholds.leadResponseHours} min={1} max={168} onChange={v=>patchThreshold('leadResponseHours',v)}/>
          <NumberField label="Lead stale after" suffix="days" value={value.thresholds.staleLeadDays} min={1} max={30} onChange={v=>patchThreshold('staleLeadDays',v)}/>
          <NumberField label="Opportunity stale after" suffix="days" value={value.thresholds.staleOpportunityDays} min={1} max={60} onChange={v=>patchThreshold('staleOpportunityDays',v)}/>
          <NumberField label="Quotation stale after" suffix="days" value={value.thresholds.staleQuotationDays} min={1} max={30} onChange={v=>patchThreshold('staleQuotationDays',v)}/>
          <NumberField label="Payment grace" suffix="days" value={value.thresholds.overduePaymentGraceDays} min={0} max={30} onChange={v=>patchThreshold('overduePaymentGraceDays',v)}/>
          <NumberField label="Project risk window" suffix="days" value={value.thresholds.projectRiskDays} min={1} max={60} onChange={v=>patchThreshold('projectRiskDays',v)}/>
          <NumberField label="Candidate stage aging" suffix="days" value={value.thresholds.applicantStageDays} min={1} max={30} onChange={v=>patchThreshold('applicantStageDays',v)}/>
          <NumberField label="Open-task capacity" suffix="tasks" value={value.thresholds.maxOpenTasksPerPerson} min={1} max={50} onChange={v=>patchThreshold('maxOpenTasksPerPerson',v)}/>
        </div></section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-black">Sales forecast weights</h2><p className="mt-1 text-xs text-slate-500">Used only when an opportunity does not already have its own probability. 0% means no forecast value; 100% means full expected value.</p><div className="mt-5 space-y-3">{stageOrder.map(stage=><div key={stage} className="grid items-center gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-[1fr_120px]"><div className="text-xs font-black text-slate-700">{stage}</div><div className="relative"><input type="number" min={0} max={100} value={value.stageForecastWeights[stage]??0} onChange={e=>patchWeight(stage,e.target.value)} className={`${inputClass} pr-8`}/><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span></div></div>)}</div></section>
      </div>}
    </main>
  </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="mb-2 block text-xs font-black text-slate-600">{label}</span>{children}</label>}
function NumberField({label,suffix,value,min,max,onChange}:{label:string;suffix:string;value:number;min:number;max:number;onChange:(v:string)=>void}){return <Field label={label}><div className="relative"><input type="number" min={min} max={max} value={value} onChange={e=>onChange(e.target.value)} className={`${inputClass} pr-14`}/><span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{suffix}</span></div></Field>}
