import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Save, ShieldCheck } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { recruitmentTaskService, type RecruitmentTaskTemplate } from '../../lib/recruitmentTaskService';

const inputClass='mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100';

export default function RecruitmentTaskSettingsAdmin(){
  const navigate=useNavigate();
  const { isAdmin, loading: authLoading }=useAuth();
  const [template,setTemplate]=useState<RecruitmentTaskTemplate|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  useEffect(()=>{
    if(authLoading||!isAdmin){if(!authLoading)setLoading(false);return;}
    void recruitmentTaskService.getTemplate().then(setTemplate).catch((err:any)=>setError(err?.message||'Task settings could not be loaded.')).finally(()=>setLoading(false));
  },[authLoading,isAdmin]);

  if(authLoading||loading)return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]"/></div>;
  if(!isAdmin)return <Navigate to="/admin/workspace" replace/>;
  if(!template)return <div className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-2xl rounded-3xl border border-red-200 bg-white p-8 text-sm text-red-700">{error||'Recruitment task template unavailable.'}</div></div>;

  const save=async()=>{
    setSaving(true);setError('');setNotice('');
    try{const next=await recruitmentTaskService.saveTemplate(template);setTemplate(next);setNotice('Lead Research Test settings saved. New task attempts will use this version; existing issued attempts keep their original snapshot.');}
    catch(err:any){setError(err?.message||'Task settings could not be saved.');}
    finally{setSaving(false);}
  };

  return <div className="min-h-screen bg-[#f4f5fb] text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-5xl items-center gap-3"><button onClick={()=>navigate('/admin/app/recruitment?tab=recruitment')} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"><ArrowLeft className="h-4 w-4"/></button><div><h1 className="text-xl font-black">Recruitment Practical Task Settings</h1><p className="mt-1 text-sm text-slate-500">Configure the Lead Research Test without editing code.</p></div></div></header>
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
      <section className="rounded-3xl border border-blue-100 bg-blue-50/60 p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#000080]"/><div><div className="font-black text-[#000080]">Versioned and snapshot-safe</div><p className="mt-1 text-sm leading-6 text-slate-700">Changes apply only to future task attempts. A task already issued to a candidate keeps the exact market, niche, instructions, deadline policy and task version it was issued with.</p></div></div></section>
      {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {notice&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</div>}
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Task title"><input className={inputClass} value={template.title} onChange={e=>setTemplate({...template,title:e.target.value})}/></Field><Field label="Current template version"><div className="mt-1.5 flex min-h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-bold">v{template.version}</div></Field></div>
        <div className="mt-5"><Field label="Candidate-facing task description"><textarea className={`${inputClass} min-h-[100px] resize-y leading-6`} value={template.description} onChange={e=>setTemplate({...template,description:e.target.value})}/></Field></div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2"><Field label="Target market"><input className={inputClass} value={template.targetMarket} onChange={e=>setTemplate({...template,targetMarket:e.target.value})} placeholder="United States"/></Field><Field label="Target niche"><input className={inputClass} value={template.targetNiche} onChange={e=>setTemplate({...template,targetNiche:e.target.value})} placeholder="Roofing Contractors"/></Field></div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"><NumberField label="Businesses required" value={template.requiredItems} min={1} max={20} onChange={value=>setTemplate({...template,requiredItems:value})}/><NumberField label="Deadline (hours)" value={template.deadlineHours} min={1} max={720} onChange={value=>setTemplate({...template,deadlineHours:value})}/><NumberField label="Estimated minutes" value={template.estimatedMinutes} min={5} max={480} onChange={value=>setTemplate({...template,estimatedMinutes:value})}/><NumberField label="Maximum attempts" value={template.maxAttempts} min={1} max={10} onChange={value=>setTemplate({...template,maxAttempts:value})}/></div>
        <div className="mt-6"><Field label="Candidate instructions" help="One instruction per line. Keep these specific, fair and based only on publicly available business information."><textarea className={`${inputClass} min-h-[190px] resize-y leading-7`} value={template.instructions.join('\n')} onChange={e=>setTemplate({...template,instructions:e.target.value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean)})}/></Field></div>
        <div className="mt-6 flex justify-end"><button type="button" disabled={saving} onClick={()=>void save()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 text-sm font-bold text-white disabled:opacity-50">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}Save Task Settings</button></div>
      </section>
    </main>
  </div>;
}

function Field({label,help,children}:{label:string;help?:string;children:React.ReactNode}){return <label className="block"><span className="text-sm font-bold text-slate-800">{label}</span>{help&&<span className="mt-1 block text-xs leading-5 text-slate-500">{help}</span>}{children}</label>}
function NumberField({label,value,min,max,onChange}:{label:string;value:number;min:number;max:number;onChange:(value:number)=>void}){return <Field label={label}><input type="number" min={min} max={max} className={inputClass} value={value} onChange={e=>onChange(Number(e.target.value||min))}/></Field>}
