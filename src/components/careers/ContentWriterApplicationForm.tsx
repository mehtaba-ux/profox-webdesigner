import { FormEvent, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, HelpCircle, Loader2, UploadCloud, Video } from 'lucide-react';
import type { CareerJob } from '../../lib/careerService';
import { applicantService } from '../../lib/applicantService';
import { talentPartnerService } from '../../lib/talentPartnerService';
import { supabase } from '../../lib/supabase';
import {
  getContentWriterApplicationFormConfig,
  type ContentWriterApplicationField,
  type ContentWriterApplicationFormConfig,
} from '../../lib/contentWriterApplicationFormConfig';

type Answer = string|string[]|boolean;
type Answers = Record<string,Answer>;

type Props={job:CareerJob};

const inputClass='w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#000080] focus:bg-white focus:ring-4 focus:ring-blue-100';

export default function ContentWriterApplicationForm({job}:Props){
  const config=useMemo<ContentWriterApplicationFormConfig>(()=>getContentWriterApplicationFormConfig(job.roleDetails?.applicationForm),[job.roleDetails?.applicationForm]);
  const steps=useMemo(()=>config.steps.filter(step=>step.active!==false&&config.fields.some(field=>field.active!==false&&field.stepId===step.id)),[config]);
  const initialAnswers=useMemo(()=>{
    const next:Answers={availableHoursPerWeek:String(config.minimumWeeklyHours)};
    config.fields.forEach(field=>{if(field.type==='checkbox')next[field.key]=false;if(field.type==='multiselect')next[field.key]=[];});
    return next;
  },[config]);
  const [answers,setAnswers]=useState<Answers>(initialAnswers);
  const [files,setFiles]=useState<Record<string,File|null>>({});
  const [stepIndex,setStepIndex]=useState(0);
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [formError,setFormError]=useState('');
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState(0);
  const [uploadLabel,setUploadLabel]=useState('');
  const [reference,setReference]=useState('');

  const step=steps[Math.min(stepIndex,Math.max(0,steps.length-1))];
  const fields=useMemo(()=>config.fields.filter(field=>field.active!==false&&field.stepId===step?.id),[config,step?.id]);
  const setAnswer=(key:string,value:Answer)=>{setAnswers(current=>({...current,[key]:value}));setErrors(current=>{const next={...current};delete next[key];return next;});};
  const setFile=(key:string,file:File|null)=>{setFiles(current=>({...current,[key]:file}));setErrors(current=>{const next={...current};delete next[key];return next;});};

  const fieldError=(field:ContentWriterApplicationField)=>{
    const value=answers[field.key];
    if(field.type==='file'||field.type==='video')return field.required&&!files[field.key]?`${field.label} is required.`:'';
    if(field.type==='checkbox')return field.required&&value!==true?'Please confirm this item.':'';
    if(field.type==='multiselect')return field.required&&(!Array.isArray(value)||value.length===0)?`Please select at least one option.`:'';
    const text=String(value??'').trim();
    if(field.required&&!text)return `${field.label} is required.`;
    if(text&&field.minLength&&text.length<field.minLength)return `Please provide a little more detail (at least ${field.minLength} characters).`;
    if(text&&field.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))return 'Please enter a valid email address.';
    if(text&&field.type==='url'){try{new URL(text);}catch{return 'Please enter a complete URL, including https://.';}}
    if(text&&field.type==='number'){
      const number=Number(text);if(!Number.isFinite(number))return 'Please enter a valid number.';
      if(field.min!==undefined&&number<field.min)return `Please enter ${field.min} or more.`;
      if(field.max!==undefined&&number>field.max)return `Please enter ${field.max} or less.`;
    }
    if(text&&(field.type==='select')&&field.options?.length&&!field.options.includes(text))return 'Please choose one of the available options.';
    if(Array.isArray(value)&&field.type==='multiselect'&&field.options?.length&&value.some(item=>!field.options?.includes(item)))return 'Please choose only available options.';
    return '';
  };

  const validateFields=(list:ContentWriterApplicationField[])=>{
    const next:Record<string,string>={};
    list.forEach(field=>{const message=fieldError(field);if(message)next[field.key]=message;});
    setErrors(next);
    if(Object.keys(next).length){setFormError('Please check the highlighted fields before continuing.');window.setTimeout(()=>document.querySelector('[data-field-error="true"]')?.scrollIntoView({behavior:'smooth',block:'center'}),0);return false;}
    setFormError('');return true;
  };

  const nextStep=()=>{if(!validateFields(fields))return;setStepIndex(index=>Math.min(index+1,steps.length-1));window.setTimeout(()=>document.getElementById('content-application-card')?.scrollIntoView({behavior:'smooth',block:'start'}),0);};
  const previousStep=()=>{setFormError('');setErrors({});setStepIndex(index=>Math.max(0,index-1));window.setTimeout(()=>document.getElementById('content-application-card')?.scrollIntoView({behavior:'smooth',block:'start'}),0);};

  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    const allFields=config.fields.filter(field=>field.active!==false&&config.steps.some(step=>step.active!==false&&step.id===field.stepId));
    if(!validateFields(allFields))return;
    setBusy(true);setFormError('');
    try{
      const email=String(answers.email||'').trim().toLowerCase();
      const cvField=allFields.find(field=>field.type==='file'&&field.key==='cv')||allFields.find(field=>field.type==='file');
      const videoField=allFields.find(field=>field.type==='video'&&field.key==='video')||allFields.find(field=>field.type==='video');
      let cvStoragePath='';let videoStoragePath='';
      if(cvField&&files[cvField.key]){setUploadLabel('Uploading CV / resume');setProgress(0);const uploaded=await applicantService.uploadPublicApplicationFile(email,'cv',files[cvField.key] as File,setProgress);cvStoragePath=uploaded.path;}
      if(videoField&&files[videoField.key]){setUploadLabel('Uploading introduction video');setProgress(0);const uploaded=await applicantService.uploadPublicApplicationFile(email,'video',files[videoField.key] as File,setProgress);videoStoragePath=uploaded.path;}
      setUploadLabel('Submitting application');
      const params=new URLSearchParams(window.location.search);
      const payload={
        ...answers,
        responses:answers,
        fullName:String(answers.fullName||'').trim(),email,
        availableHoursPerWeek:Number(answers.availableHoursPerWeek||0),
        timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',
        cvStoragePath,videoStoragePath,
        formSchemaVersion:config.schemaVersion,
        utmSource:params.get('utm_source')||'',utmMedium:params.get('utm_medium')||'',utmCampaign:params.get('utm_campaign')||'',utmContent:params.get('utm_content')||'',utmTerm:params.get('utm_term')||'',
        landingPage:window.location.pathname,referrerUrl:document.referrer||'',
      };
      const result=await supabase.rpc('submit_public_content_writer_application',{p_application:payload});
      if(result.error)throw result.error;
      if(!result.data?.success){const key=String(result.data?.field||'');if(key)setErrors({[key]:result.data?.error||'Please check this field.'});throw new Error(result.data?.error||'Your application could not be submitted.');}
      if(result.data.reference)await talentPartnerService.claimApplication(result.data.reference,email);
      setReference(result.data.reference||'Submitted');
      window.setTimeout(()=>document.getElementById('apply')?.scrollIntoView({behavior:'smooth',block:'start'}),0);
    }catch(error:any){setFormError(error?.message||'Your application could not be submitted. Please try again.');}
    finally{setBusy(false);setUploadLabel('');}
  };

  if(reference)return <div className="mx-auto max-w-[940px] px-6"><div className="border border-emerald-200 bg-white p-8 text-center shadow-sm sm:p-10"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600"/><h2 className="mt-5 text-3xl font-black text-[#22252b]">Application received</h2><p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">Your Content Writer application, resume and introduction video are now in the ProFox recruitment workflow. Please do not send portfolio material yet. If you pass the initial review, we will send the secure Portfolio Review step.</p><div className="mx-auto mt-5 w-fit rounded-md bg-slate-50 px-4 py-2 text-xs font-black text-slate-700">Reference: {reference}</div></div></div>;

  return <form onSubmit={submit} noValidate className="mx-auto max-w-[940px] px-6" aria-labelledby="content-application-title">
    <div className="grid gap-6 lg:grid-cols-[.72fr_1.28fr] lg:items-end"><div><div className="text-[11px] font-black uppercase tracking-[.17em] text-[#000080]">Ready to apply?</div><h2 id="content-application-title" className="mt-3 text-3xl font-black tracking-[-.035em] text-[#22252b] sm:text-4xl">{config.title}</h2></div><div><p className="text-sm leading-7 text-slate-600">{config.description}</p><p className="mt-2 text-xs font-bold text-[#000080]">Your answers are saved while you move between steps. Required fields are checked before you continue.</p></div></div>

    <div id="content-application-card" className="mt-7 scroll-mt-28 overflow-hidden border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-[#fbfcff] px-5 py-5 sm:px-7">
        <div className="flex items-center justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[.16em] text-[#000080]">Step {stepIndex+1} of {steps.length}</div><h3 className="mt-1 text-xl font-black text-[#22252b]">{step?.title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{step?.description}</p></div><div className="hidden text-right sm:block"><div className="text-2xl font-black text-[#22252b]">{Math.round(((stepIndex+1)/Math.max(1,steps.length))*100)}%</div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">complete</div></div></div>
        <div className="mt-5 grid grid-cols-5 gap-1.5" aria-hidden="true">{steps.map((item,index)=><div key={item.id} className={`h-1.5 rounded-full ${index<=stepIndex?'bg-[#000080]':'bg-slate-200'}`}/>)}</div>
      </div>

      <div className="p-5 sm:p-7">
        {formError&&<div role="alert" className="mb-6 border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{formError}</div>}
        <div className="grid gap-5 sm:grid-cols-2">{fields.map(field=><FieldRenderer key={field.key} field={field} value={answers[field.key]} file={files[field.key]||null} error={errors[field.key]} onChange={value=>setAnswer(field.key,value)} onFile={value=>setFile(field.key,value)}/>)}</div>
        {busy&&progress>0&&<div className="mt-6"><div className="mb-2 flex justify-between text-[11px] font-bold text-slate-500"><span>{uploadLabel}</span><span>{progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-[#000080] transition-all" style={{width:`${progress}%`}}/></div></div>}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-[#fbfcff] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <button type="button" disabled={stepIndex===0||busy} onClick={previousStep} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:border-slate-300 disabled:opacity-40"><ArrowLeft className="h-4 w-4"/>Back</button>
        {stepIndex<steps.length-1?<button type="button" onClick={nextStep} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-6 py-3 text-sm font-black text-white transition hover:bg-[#000066]">Continue <ArrowRight className="h-4 w-4"/></button>:<button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-6 py-3 text-sm font-black text-white transition hover:bg-[#000066] disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<FileText className="h-4 w-4"/>}{busy?(uploadLabel||'Submitting securely...'):'Submit Content Writer Application'}</button>}
      </div>
    </div>
    <p className="mt-4 text-center text-xs leading-6 text-slate-500">No full portfolio required yet. Shortlisted applicants receive the next step securely.</p>
  </form>;
}

function FieldRenderer({field,value,file,error,onChange,onFile}:{field:ContentWriterApplicationField;value:Answer|undefined;file:File|null;error?:string;onChange:(value:Answer)=>void;onFile:(file:File|null)=>void}){
  const full=field.type==='textarea'||field.type==='multiselect'||field.type==='checkbox'||field.type==='file'||field.type==='video';
  const helpId=`help-${field.key}`;const errorId=`error-${field.key}`;
  return <div className={full?'sm:col-span-2':''} data-field-error={error?'true':undefined}>
    {field.type!=='checkbox'&&<div className="mb-2 flex items-center gap-2"><label htmlFor={`field-${field.key}`} className="text-xs font-black text-slate-700">{field.label}{field.required&&<span className="ml-1 text-red-600">*</span>}</label>{field.help&&<Tooltip text={field.help} id={helpId}/>}</div>}
    {field.type==='textarea'&&<textarea id={`field-${field.key}`} rows={4} value={String(value||'')} placeholder={field.placeholder} onChange={event=>onChange(event.target.value)} aria-describedby={[field.help?helpId:'',error?errorId:''].filter(Boolean).join(' ')||undefined} aria-invalid={Boolean(error)} className={`${inputClass} resize-y`}/>} 
    {['text','email','tel','url','date','number'].includes(field.type)&&<input id={`field-${field.key}`} type={field.type} value={String(value||'')} min={field.min} max={field.max} placeholder={field.placeholder} onChange={event=>onChange(event.target.value)} aria-describedby={[field.help?helpId:'',error?errorId:''].filter(Boolean).join(' ')||undefined} aria-invalid={Boolean(error)} className={inputClass}/>} 
    {field.type==='select'&&<select id={`field-${field.key}`} value={String(value||'')} onChange={event=>onChange(event.target.value)} aria-describedby={[field.help?helpId:'',error?errorId:''].filter(Boolean).join(' ')||undefined} aria-invalid={Boolean(error)} className={inputClass}><option value="">Select an option</option>{(field.options||[]).map(option=><option key={option} value={option}>{option}</option>)}</select>}
    {field.type==='multiselect'&&<div className="grid gap-2 sm:grid-cols-2" role="group" aria-describedby={[field.help?helpId:'',error?errorId:''].filter(Boolean).join(' ')||undefined}>{(field.options||[]).map(option=>{const selected=Array.isArray(value)&&value.includes(option);return <label key={option} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-bold transition ${selected?'border-[#000080] bg-blue-50 text-[#000080]':'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'}`}><input type="checkbox" checked={selected} onChange={()=>onChange(selected?(value as string[]).filter(item=>item!==option):[...(Array.isArray(value)?value:[]),option])} className="h-4 w-4 accent-[#000080]"/>{option}</label>})}</div>}
    {field.type==='checkbox'&&<div className={`rounded-xl border p-4 ${error?'border-red-200 bg-red-50':'border-slate-200 bg-slate-50'}`}><label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-slate-700"><input type="checkbox" checked={value===true} onChange={event=>onChange(event.target.checked)} aria-describedby={[field.help?helpId:'',error?errorId:''].filter(Boolean).join(' ')||undefined} className="mt-1 h-4 w-4 shrink-0 accent-[#000080]"/><span><strong>{field.label}{field.required&&<span className="ml-1 text-red-600">*</span>}</strong>{field.help&&<span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{field.help}</span>}</span></label></div>}
    {(field.type==='file'||field.type==='video')&&<label className={`flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 text-xs font-bold transition ${error?'border-red-300 bg-red-50 text-red-700':'border-slate-300 bg-slate-50 text-slate-600 hover:border-[#000080] hover:bg-white'}`}>{field.type==='video'?<Video className="h-5 w-5 text-[#000080]"/>:<UploadCloud className="h-5 w-5 text-[#000080]"/>}<span className="min-w-0 flex-1 truncate">{file?file.name:(field.type==='video'?'Choose introduction video':'Choose CV / resume')}</span><input id={`field-${field.key}`} type="file" accept={field.accept} className="hidden" onChange={event=>onFile(event.target.files?.[0]||null)}/></label>}
    {error&&<p id={errorId} className="mt-2 text-xs font-bold text-red-600">{error}</p>}
  </div>;
}

function Tooltip({text,id}:{text:string;id:string}){
  return <span className="group relative inline-flex"><button type="button" aria-label="Field help" aria-describedby={id} className="rounded-full text-slate-400 outline-none hover:text-[#000080] focus:text-[#000080] focus:ring-2 focus:ring-blue-200"><HelpCircle className="h-4 w-4"/></button><span id={id} role="tooltip" className="pointer-events-none absolute left-1/2 top-6 z-30 hidden w-64 -translate-x-1/2 rounded-xl bg-[#22252b] px-3 py-2.5 text-[11px] font-medium leading-5 text-white shadow-xl group-hover:block group-focus-within:block">{text}</span></span>;
}
