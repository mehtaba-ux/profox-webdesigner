import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, Loader2, ShieldCheck, UploadCloud, Video } from 'lucide-react';
import type { CareerJob } from '../lib/careerService';
import { applicantService } from '../lib/applicantService';
import { supabase } from '../lib/supabase';

interface Props { job: CareerJob }

type FormState = {
  fullName:string;email:string;phone:string;country:string;linkedinUrl:string;currentRole:string;
  contentExperience:string;researchApproach:string;qualityProcess:string;skills:string;
  availableHoursPerWeek:string;weeklyAvailability:string;earliestStartDate:string;motivation:string;
  hasLaptopInternet:boolean;consentAccurate:boolean;consentPrivacy:boolean;
};

const initial:FormState={
  fullName:'',email:'',phone:'',country:'',linkedinUrl:'',currentRole:'',contentExperience:'',researchApproach:'',qualityProcess:'',skills:'',
  availableHoursPerWeek:'20',weeklyAvailability:'',earliestStartDate:'',motivation:'',hasLaptopInternet:false,consentAccurate:false,consentPrivacy:false
};

export default function ContentWriterJobView({job}:Props){
  const [form,setForm]=useState<FormState>(initial);
  const [cv,setCv]=useState<File|null>(null);
  const [video,setVideo]=useState<File|null>(null);
  const [progress,setProgress]=useState(0);
  const [uploadLabel,setUploadLabel]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [reference,setReference]=useState('');
  const minHours=Number(job.roleDetails?.applicationForm?.minimumWeeklyHours||20);
  const set=(key:keyof FormState,value:any)=>setForm(current=>({...current,[key]:value}));

  const submit=async(event:FormEvent)=>{
    event.preventDefault();setError('');
    if(!cv){setError('Please upload your CV or resume.');return;}
    if(!video){setError('Please upload your short introduction video.');return;}
    if(Number(form.availableHoursPerWeek)<minHours){setError(`This role currently requires at least ${minHours} available hours per week.`);return;}
    setBusy(true);
    try{
      setUploadLabel('Uploading CV / resume');setProgress(0);
      const uploadedCv=await applicantService.uploadPublicApplicationFile(form.email.trim().toLowerCase(),'cv',cv,setProgress);
      setUploadLabel('Uploading introduction video');setProgress(0);
      const uploadedVideo=await applicantService.uploadPublicApplicationFile(form.email.trim().toLowerCase(),'video',video,setProgress);
      setUploadLabel('Submitting application');
      const result=await supabase.rpc('submit_public_content_writer_application',{p_application:{
        ...form,
        fullName:form.fullName.trim(),email:form.email.trim().toLowerCase(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',
        availableHoursPerWeek:Number(form.availableHoursPerWeek),cvStoragePath:uploadedCv.path,videoStoragePath:uploadedVideo.path
      }});
      if(result.error)throw result.error;
      if(!result.data?.success)throw new Error(result.data?.error||'Your application could not be submitted.');
      setReference(result.data.reference||'Submitted');window.scrollTo({top:0,behavior:'smooth'});
    }catch(err:any){setError(err?.message||'Your application could not be submitted. Please try again.');}
    finally{setBusy(false);setUploadLabel('');}
  };

  if(reference)return <div className="min-h-screen bg-white px-6 pb-24 pt-36"><div className="mx-auto max-w-2xl rounded-[2rem] border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600"/><h1 className="mt-5 text-3xl font-black text-slate-900">Application received</h1><p className="mt-3 text-sm leading-7 text-slate-600">Your Content Creator application, resume and introduction video are now in the ProFox recruitment workflow. Please do not send portfolio material yet. If you pass the first review, we will email you a secure Portfolio Review link with the required three-case-study format.</p><div className="mx-auto mt-5 w-fit rounded-xl bg-white px-4 py-2 text-xs font-black text-slate-700">Reference: {reference}</div><Link to="/careers" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-black text-white"><ArrowLeft className="h-4 w-4"/>Back to Careers</Link></div></div>;

  return <div className="min-h-screen bg-white text-slate-900">
    <section className="border-b border-slate-200 bg-[#fbfcff] pb-16 pt-32"><div className="mx-auto max-w-6xl px-6"><Link to="/careers" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-500"><ArrowLeft className="h-3.5 w-3.5"/>Back to Careers</Link><div className="mt-9 max-w-4xl"><div className="text-[11px] font-black uppercase tracking-[.18em] text-[#FF0E0E]">{job.department} · {job.workplaceType}</div><h1 className="mt-4 text-4xl font-black tracking-[-.04em] text-[#071126] sm:text-6xl">{job.title}</h1><p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">{job.shortSummary}</p><a href="#apply" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-black text-white">Apply for Content Creator <ArrowRight className="h-4 w-4"/></a></div></div></section>

    <section className="py-16"><div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-[1fr_380px]"><div className="space-y-12"><section><Eyebrow>About the role</Eyebrow><h2 className="mt-3 text-3xl font-black">Produce content that is ready to perform and ready to design.</h2><p className="mt-5 whitespace-pre-line text-base leading-8 text-slate-600">{job.description}</p></section><Bullet title="Your responsibilities" items={job.responsibilities}/><Bullet title="What we're looking for" items={job.requirements}/><section><Eyebrow>Selection process</Eyebrow><div className="mt-6 grid gap-3 sm:grid-cols-2">{job.selectionProcess.map((step,index)=><div key={`${step.title}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="text-xs font-black text-[#FF0E0E]">{String(index+1).padStart(2,'0')}</div><h3 className="mt-2 font-black">{step.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{step.text}</p></div>)}</div></section></div><aside className="h-fit rounded-3xl border border-blue-100 bg-blue-50/50 p-6 lg:sticky lg:top-28"><ShieldCheck className="h-6 w-6 text-[#000080]"/><h3 className="mt-3 font-black">Project-based engagement</h3><p className="mt-2 text-sm leading-6 text-slate-600">This recruitment path is for project-based Content Creator work. Conditional selection is followed by the approved contractor agreement, Content Academy and certification before any production access.</p><div className="mt-5 rounded-2xl bg-white p-4 text-xs leading-6 text-slate-600"><strong className="text-slate-900">No self-approval.</strong> Practical Certification requires an independent review at 90% or higher. Final Approval and System Access are separate protected gates before activation.</div></aside></div></section>

    <section id="apply" className="border-t border-slate-200 bg-slate-50 py-16"><form onSubmit={submit} className="mx-auto max-w-4xl space-y-7 px-6"><div><Eyebrow>Application</Eyebrow><h2 className="mt-3 text-3xl font-black">Apply to the Content team</h2><p className="mt-2 text-sm text-slate-500">Start with your profile, resume and a short introduction video. Portfolio evidence is intentionally collected later only from candidates who pass the first review.</p></div>{error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
      <Card title="Contact & role fit"><Grid><Field label="Full name *"><input required value={form.fullName} onChange={e=>set('fullName',e.target.value)}/></Field><Field label="Email *"><input required type="email" value={form.email} onChange={e=>set('email',e.target.value)}/></Field><Field label="Phone"><input value={form.phone} onChange={e=>set('phone',e.target.value)}/></Field><Field label="Country *"><input required value={form.country} onChange={e=>set('country',e.target.value)}/></Field><Field label="Current role"><input value={form.currentRole} onChange={e=>set('currentRole',e.target.value)}/></Field><Field label="LinkedIn"><input type="url" value={form.linkedinUrl} onChange={e=>set('linkedinUrl',e.target.value)}/></Field></Grid></Card>
      <Card title="Required review material"><Grid><Field label="CV / Resume *"><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs font-bold text-slate-600"><UploadCloud className="h-4 w-4 text-[#000080]"/>{cv?cv.name:'Upload PDF, DOC or DOCX'}<input className="hidden" type="file" required accept=".pdf,.doc,.docx" onChange={e=>setCv(e.target.files?.[0]||null)}/></label></Field><Field label="Introduction video *"><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs font-bold text-slate-600"><Video className="h-4 w-4 text-[#000080]"/>{video?video.name:'Upload MP4, WebM or MOV'}<input className="hidden" type="file" required accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" onChange={e=>setVideo(e.target.files?.[0]||null)}/></label></Field></Grid><div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-6 text-slate-600"><strong className="text-slate-900">Introduction video guidance:</strong> briefly introduce yourself in clear English, summarize your relevant content experience, and explain how you approach quality and research. Keep it concise and professional. Portfolio links are not required at this stage.</div>{busy&&progress>0&&<div><div className="mb-2 flex justify-between text-[11px] font-bold text-slate-500"><span>{uploadLabel}</span><span>{progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-[#000080]" style={{width:`${progress}%`}}/></div></div>}</Card>
      <Card title="How you work"><Long label="Describe your relevant content-writing experience *" value={form.contentExperience} onChange={v=>set('contentExperience',v)}/><Long label="How do you research a client, audience and market before writing? *" value={form.researchApproach} onChange={v=>set('researchApproach',v)}/><Long label="How do you check accuracy, clarity and quality before submitting work? *" value={form.qualityProcess} onChange={v=>set('qualityProcess',v)}/><Long label="Skills / tools" value={form.skills} onChange={v=>set('skills',v)}/></Card>
      <Card title="Availability"><Grid><Field label={`Available hours per week * (minimum ${minHours})`}><input required type="number" min={minHours} max={80} value={form.availableHoursPerWeek} onChange={e=>set('availableHoursPerWeek',e.target.value)}/></Field><Field label="Earliest start date"><input type="date" value={form.earliestStartDate} onChange={e=>set('earliestStartDate',e.target.value)}/></Field></Grid><Long label="Typical weekly availability" value={form.weeklyAvailability} onChange={v=>set('weeklyAvailability',v)}/><Long label="Why do you want to work with the ProFox Content team?" value={form.motivation} onChange={v=>set('motivation',v)}/></Card>
      <Card title="Confirmations"><Check checked={form.hasLaptopInternet} onChange={v=>set('hasLaptopInternet',v)}>I have a reliable laptop and internet connection.</Check><Check checked={form.consentAccurate} onChange={v=>set('consentAccurate',v)}>The information and materials I submitted are accurate and genuinely represent me.</Check><Check checked={form.consentPrivacy} onChange={v=>set('consentPrivacy',v)}>I agree that ProFox may process this information for recruitment and assessment.</Check></Card>
      <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#000080] px-6 py-4 text-sm font-black text-white disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<FileText className="h-4 w-4"/>}{busy?(uploadLabel||'Submitting securely...'):'Submit Content Creator Application'}</button>
    </form></section>
  </div>;
}

function Eyebrow({children}:{children:string}){return <div className="text-[11px] font-black uppercase tracking-[.18em] text-[#FF0E0E]">{children}</div>}
function Bullet({title,items}:{title:string;items:string[]}){return <section><Eyebrow>{title}</Eyebrow><div className="mt-5 space-y-3">{items.map((item,index)=><div key={index} className="flex gap-3 text-sm leading-7 text-slate-600"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-600"/><span>{item}</span></div>)}</div></section>}
function Card({title,children}:{title:string;children:any}){return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="mb-5 text-sm font-black text-slate-900">{title}</h3><div className="space-y-5">{children}</div></section>}
function Grid({children}:{children:any}){return <div className="grid gap-5 sm:grid-cols-2">{children}</div>}
function Field({label,children}:{label:string;children:any}){return <label className="block text-xs font-bold text-slate-700"><span className="mb-2 block">{label}</span><div className="[&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-slate-200 [&_input]:bg-slate-50 [&_input]:px-3 [&_input]:py-3 [&_input]:text-sm [&_input]:font-normal [&_input]:outline-none focus-within:[&_input]:border-[#000080]">{children}</div></label>}
function Long({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){return <label className="block text-xs font-bold text-slate-700"><span className="mb-2 block">{label}</span><textarea required={label.includes('*')} rows={4} value={value} onChange={e=>onChange(e.target.value)} className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal outline-none focus:border-[#000080]"/></label>}
function Check({checked,onChange,children}:{checked:boolean;onChange:(value:boolean)=>void;children:any}){return <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-slate-600"><input required type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} className="mt-1 h-4 w-4 accent-[#000080]"/><span>{children}</span></label>}
