import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, GripVertical, HelpCircle, Loader2, Plus, Save, Settings2, Trash2, X } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { careerService, type CareerJob } from '../../lib/careerService';
import {
  getContentWriterApplicationFormConfig,
  makeCustomContentWriterField,
  serializeContentWriterApplicationFormConfig,
  type ContentWriterApplicationField,
  type ContentWriterApplicationFormConfig,
  type ContentWriterFieldType,
} from '../../lib/contentWriterApplicationFormConfig';

const input='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100';
const types:ContentWriterFieldType[]=['text','email','tel','url','textarea','number','date','select','multiselect','checkbox'];

export default function ContentWriterApplicationFormAdminPanel(){
  const {isAdmin}=useAuth();
  const [open,setOpen]=useState(false);
  const [job,setJob]=useState<CareerJob|null>(null);
  const [config,setConfig]=useState<ContentWriterApplicationFormConfig|null>(null);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  const load=async()=>{
    setLoading(true);setError('');setMessage('');
    try{
      const jobs=await careerService.getAdminJobs();
      const row=jobs.find(item=>item.slug==='content-writer'||item.applicationType==='content_writer');
      if(!row)throw new Error('Content Writer job configuration was not found.');
      setJob(row);setConfig(getContentWriterApplicationFormConfig(row.roleDetails?.applicationForm));
    }catch(err:any){setError(err?.message||'Content Writer application form could not be loaded.');}
    finally{setLoading(false);}
  };

  useEffect(()=>{if(open&&isAdmin&&!job)void load();},[open,isAdmin]);
  const activeFields=useMemo(()=>config?.fields.filter(field=>field.active!==false).length||0,[config]);
  if(!isAdmin)return null;

  const updateField=(key:string,patch:Partial<ContentWriterApplicationField>)=>setConfig(current=>current?{...current,fields:current.fields.map(field=>field.key===key?{...field,...patch}:field)}:current);
  const moveField=(key:string,direction:-1|1)=>setConfig(current=>{
    if(!current)return current;const fields=[...current.fields];const index=fields.findIndex(field=>field.key===key);const target=index+direction;if(index<0||target<0||target>=fields.length)return current;[fields[index],fields[target]]=[fields[target],fields[index]];return {...current,fields};
  });
  const addField=()=>setConfig(current=>{
    if(!current)return current;const step=current.steps.find(item=>item.active!==false)||current.steps[0];if(!step)return current;return {...current,fields:[...current.fields,makeCustomContentWriterField(current.fields.length+1,step.id)]};
  });
  const removeField=(field:ContentWriterApplicationField)=>{if(field.system||field.locked)return;setConfig(current=>current?{...current,fields:current.fields.filter(item=>item.key!==field.key)}:current);};
  const moveStep=(id:string,direction:-1|1)=>setConfig(current=>{
    if(!current)return current;const steps=[...current.steps];const index=steps.findIndex(step=>step.id===id);const target=index+direction;if(index<0||target<0||target>=steps.length)return current;[steps[index],steps[target]]=[steps[target],steps[index]];return {...current,steps};
  });
  const save=async()=>{
    if(!job||!config)return;setSaving(true);setError('');setMessage('');
    try{
      const sanitized=serializeContentWriterApplicationFormConfig({...config,schemaVersion:Number(config.schemaVersion||3)+1});
      const saved=await careerService.updateJob(job.id,{roleDetails:{...job.roleDetails,applicationForm:sanitized}});
      setJob(saved);setConfig(getContentWriterApplicationFormConfig(saved.roleDetails?.applicationForm));setMessage('Content Writer application form saved. New applicants will use this version; historical applications keep their submitted snapshot.');
    }catch(err:any){setError(err?.message||'The application form could not be saved.');}
    finally{setSaving(false);}
  };

  return <>
    <button type="button" onClick={()=>setOpen(true)} className="fixed bottom-6 right-6 z-[80] inline-flex items-center gap-2 rounded-2xl bg-[#000080] px-4 py-3 text-xs font-black text-white shadow-2xl transition hover:-translate-y-0.5" aria-label="Edit Content Writer application form"><Settings2 className="h-4 w-4"/>Content Writer Form</button>
    {open&&<div className="fixed inset-0 z-[100] bg-slate-950/45 p-0 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label="Content Writer application form builder">
      <div className="ml-auto flex h-full w-full max-w-5xl flex-col overflow-hidden bg-slate-50 shadow-2xl sm:rounded-3xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7"><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-[#000080]">Admin · Careers</div><h2 className="mt-1 text-xl font-black text-slate-900">Content Writer Application Form</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Edit steps, labels, help tooltips, required status, options and custom fields without changing frontend code. Protected system fields cannot be removed.</p></div><div className="flex items-center gap-2"><a href="/careers/content-writer#apply" target="_blank" rel="noreferrer" className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-[#000080] sm:inline-flex">Preview <ExternalLink className="h-3.5 w-3.5"/></a><button type="button" onClick={()=>setOpen(false)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Close form builder"><X className="h-4 w-4"/></button></div></header>
        <div className="flex-1 overflow-y-auto p-4 sm:p-7">
          {loading||!config?<div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]"/></div>:<div className="space-y-6">
            {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">{error}</div>}
            {message&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-700">{message}</div>}

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-sm font-black text-slate-900">Form settings</h3><p className="mt-1 text-xs text-slate-500">Schema version {config.schemaVersion} · {config.steps.length} steps · {activeFields} active fields</p></div><label className="w-full max-w-[230px] text-[11px] font-black text-slate-600">Minimum weekly capacity<input type="number" min={1} max={80} className={`${input} mt-1.5`} value={config.minimumWeeklyHours} onChange={event=>setConfig({...config,minimumWeeklyHours:Number(event.target.value)})}/></label></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-[11px] font-black text-slate-600">Form heading<input className={`${input} mt-1.5`} value={config.title||''} onChange={event=>setConfig({...config,title:event.target.value})}/></label><label className="text-[11px] font-black text-slate-600">Intro text<textarea rows={3} className={`${input} mt-1.5 resize-y`} value={config.description||''} onChange={event=>setConfig({...config,description:event.target.value})}/></label></div></section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-4"><h3 className="text-sm font-black text-slate-900">Application steps</h3><p className="mt-1 text-xs text-slate-500">Change the candidate-facing step titles, descriptions and order.</p></div><div className="space-y-3">{config.steps.map((step,index)=><div key={step.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[34px_1fr_1.4fr_auto]"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-xs font-black text-slate-400">{index+1}</div><input className={input} value={step.title} onChange={event=>setConfig({...config,steps:config.steps.map(item=>item.id===step.id?{...item,title:event.target.value}:item)})}/><input className={input} value={step.description||''} placeholder="Short step explanation" onChange={event=>setConfig({...config,steps:config.steps.map(item=>item.id===step.id?{...item,description:event.target.value}:item)})}/><div className="flex gap-1"><button type="button" disabled={index===0} onClick={()=>moveStep(step.id,-1)} className="rounded-lg border border-slate-200 bg-white p-2 disabled:opacity-30" aria-label="Move step up"><ArrowUp className="h-3.5 w-3.5"/></button><button type="button" disabled={index===config.steps.length-1} onClick={()=>moveStep(step.id,1)} className="rounded-lg border border-slate-200 bg-white p-2 disabled:opacity-30" aria-label="Move step down"><ArrowDown className="h-3.5 w-3.5"/></button></div></div>)}</div></section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-black text-slate-900">Fields & questions</h3><p className="mt-1 text-xs leading-5 text-slate-500">Add questions, move them between steps, edit tooltips, and control whether custom fields are required or active.</p></div><button type="button" onClick={addField} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#000080] px-3 py-2 text-xs font-black text-white"><Plus className="h-3.5 w-3.5"/>Add field</button></div>
              <div className="mt-5 space-y-4">{config.fields.map((field,index)=><FieldEditor key={field.key} field={field} index={index} total={config.fields.length} steps={config.steps} onChange={patch=>updateField(field.key,patch)} onMove={direction=>moveField(field.key,direction)} onRemove={()=>removeField(field)}/>)}</div>
            </section>

            <section className="rounded-3xl border border-blue-100 bg-blue-50 p-5 text-xs leading-6 text-blue-900"><div className="flex gap-3"><HelpCircle className="mt-0.5 h-4 w-4 shrink-0"/><div><strong>Historical safety:</strong> every submitted application stores the exact schema version and form snapshot the candidate saw. Later edits affect new applications only.</div></div></section>
          </div>}
        </div>
        <footer className="flex items-center justify-between gap-4 border-t border-slate-200 bg-white px-5 py-4 sm:px-7"><span className="hidden text-xs text-slate-500 sm:block">Protected fields remain locked to keep public submission and recruitment security intact.</span><button type="button" disabled={saving||loading||!config} onClick={()=>void save()} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:opacity-50">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}{saving?'Saving...':'Save Form'}</button></footer>
      </div>
    </div>}
  </>;
}

function FieldEditor({field,index,total,steps,onChange,onMove,onRemove}:{field:ContentWriterApplicationField;index:number;total:number;steps:ContentWriterApplicationFormConfig['steps'];onChange:(patch:Partial<ContentWriterApplicationField>)=>void;onMove:(direction:-1|1)=>void;onRemove:()=>void}){
  const optionText=(field.options||[]).join('\n');
  return <div className="rounded-2xl border border-slate-200 bg-[#fbfcff] p-4"><div className="flex items-start gap-3"><GripVertical className="mt-2 h-4 w-4 shrink-0 text-slate-300"/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{field.key}</span>{field.locked&&<span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black text-[#000080]">Protected</span>}{field.system&&!field.locked&&<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">System</span>}</div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-[10px] font-black text-slate-500 lg:col-span-2">Label<input className={`${input} mt-1`} value={field.label} onChange={event=>onChange({label:event.target.value})}/></label><label className="text-[10px] font-black text-slate-500">Step<select className={`${input} mt-1`} value={field.stepId} onChange={event=>onChange({stepId:event.target.value})}>{steps.map(step=><option key={step.id} value={step.id}>{step.title}</option>)}</select></label><label className="text-[10px] font-black text-slate-500">Type<select className={`${input} mt-1 disabled:bg-slate-100`} value={field.type} disabled={field.system||field.locked} onChange={event=>onChange({type:event.target.value as ContentWriterFieldType})}>{field.system&&!types.includes(field.type)&&<option value={field.type}>{field.type}</option>}{types.map(type=><option key={type} value={type}>{type}</option>)}</select></label></div><label className="mt-3 block text-[10px] font-black text-slate-500">Tooltip / help text<textarea rows={2} className={`${input} mt-1 resize-y`} value={field.help||''} onChange={event=>onChange({help:event.target.value})}/></label>{(field.type==='select'||field.type==='multiselect')&&<label className="mt-3 block text-[10px] font-black text-slate-500">Options <span className="font-normal">(one per line)</span><textarea rows={4} className={`${input} mt-1 resize-y`} value={optionText} onChange={event=>onChange({options:event.target.value.split('\n').map(value=>value.trim()).filter(Boolean)})}/></label>}<div className="mt-3 flex flex-wrap items-center gap-4"><label className={`inline-flex items-center gap-2 text-xs font-bold ${field.locked?'text-slate-400':'text-slate-700'}`}><input type="checkbox" checked={field.required!==false} disabled={field.locked} onChange={event=>onChange({required:event.target.checked})} className="accent-[#000080]"/>Required</label><label className={`inline-flex items-center gap-2 text-xs font-bold ${field.locked?'text-slate-400':'text-slate-700'}`}><input type="checkbox" checked={field.active!==false} disabled={field.locked} onChange={event=>onChange({active:event.target.checked})} className="accent-[#000080]"/>Active</label><div className="ml-auto flex gap-1"><button type="button" disabled={index===0} onClick={()=>onMove(-1)} className="rounded-lg border border-slate-200 bg-white p-2 disabled:opacity-30" aria-label="Move field up"><ArrowUp className="h-3.5 w-3.5"/></button><button type="button" disabled={index===total-1} onClick={()=>onMove(1)} className="rounded-lg border border-slate-200 bg-white p-2 disabled:opacity-30" aria-label="Move field down"><ArrowDown className="h-3.5 w-3.5"/></button>{!field.system&&!field.locked&&<button type="button" onClick={onRemove} className="rounded-lg border border-red-100 bg-white p-2 text-red-600" aria-label="Remove custom field"><Trash2 className="h-3.5 w-3.5"/></button>}</div></div></div></div></div>;
}
