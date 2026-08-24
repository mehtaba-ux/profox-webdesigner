import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, FileCheck2, Loader2, ShieldCheck } from 'lucide-react';
import type { UserProgress } from '../../lib/trainingService';

export interface ContentPracticalSubmission {
  type: 'content_writer_practical';
  content: string;
  contentUrl: string;
  researchNotes: string;
  claimsEvidence: string;
  selfQaNotes: string;
  handoffNotes: string;
  declarations: {
    originalWork: boolean;
    noInventedFacts: boolean;
    evidenceVerified: boolean;
    noRawAi: boolean;
  };
  submittedAt: string;
}

interface Props {
  progress?: UserProgress;
  submission?: Partial<ContentPracticalSubmission> | null;
  isSubmitting?: boolean;
  passingScore?: number;
  onSubmit: (submission: ContentPracticalSubmission) => Promise<void> | void;
}

const declarationRows = [
  ['originalWork', 'This work is original and does not copy competitor content.'],
  ['noInventedFacts', 'I did not invent client facts, statistics, testimonials, credentials or results.'],
  ['evidenceVerified', 'Material claims are supported by approved evidence or clearly identified for verification.'],
  ['noRawAi', 'No raw AI-generated copy is being submitted as final work; I reviewed every sentence.'],
] as const;

export default function ContentPracticalCertification({ progress, submission, isSubmitting=false, passingScore=90, onSubmit }: Props) {
  const [content,setContent]=useState('');
  const [contentUrl,setContentUrl]=useState('');
  const [researchNotes,setResearchNotes]=useState('');
  const [claimsEvidence,setClaimsEvidence]=useState('');
  const [selfQaNotes,setSelfQaNotes]=useState('');
  const [handoffNotes,setHandoffNotes]=useState('');
  const [declarations,setDeclarations]=useState<Record<string,boolean>>({});
  const [error,setError]=useState('');

  useEffect(()=>{
    if (!submission) return;
    setContent(String(submission.content||''));
    setContentUrl(String(submission.contentUrl||''));
    setResearchNotes(String(submission.researchNotes||''));
    setClaimsEvidence(String(submission.claimsEvidence||''));
    setSelfQaNotes(String(submission.selfQaNotes||''));
    setHandoffNotes(String(submission.handoffNotes||''));
    setDeclarations({...(submission.declarations||{})});
  },[submission]);

  const submitted=progress?.status==='Submitted';
  const passed=progress?.status==='Passed'||progress?.status==='Completed';
  const retry=progress?.status==='Retry Required';
  const allDeclarations=declarationRows.every(([key])=>Boolean(declarations[key]));
  const validUrl=!contentUrl.trim()||/^https?:\/\//i.test(contentUrl.trim());
  const evidenceReady=content.trim().length>=300||Boolean(contentUrl.trim());
  const ready=evidenceReady&&validUrl&&researchNotes.trim().length>=80&&handoffNotes.trim().length>=80&&claimsEvidence.trim().length>=40&&selfQaNotes.trim().length>=40&&allDeclarations;

  const guidance=useMemo(()=>[
    {label:'Final content evidence',done:evidenceReady,detail:'Paste at least 300 characters of your final sample or provide a complete https:// URL.'},
    {label:'Research & source reasoning',done:researchNotes.trim().length>=80,detail:'Explain the audience, source quality, customer language and research decisions.'},
    {label:'Claims & evidence',done:claimsEvidence.trim().length>=40,detail:'Identify factual/material claims and how they were verified or flagged.'},
    {label:'Writer Self-QA',done:selfQaNotes.trim().length>=40,detail:'Summarize clarity, conversion, accuracy, brand and scanability checks.'},
    {label:'UI/UX handoff',done:handoffNotes.trim().length>=80,detail:'Explain hierarchy, CTA priority, required proof and implementation notes for design.'},
    {label:'PF-SOP-07 declarations',done:allDeclarations,detail:'All four professional-integrity declarations are mandatory.'},
  ],[evidenceReady,researchNotes,claimsEvidence,selfQaNotes,handoffNotes,allDeclarations]);

  const submit=async()=>{
    setError('');
    if(!ready){setError('Complete every practical-certification requirement before submitting for independent review.');return;}
    if(!validUrl){setError('The content evidence URL must begin with http:// or https://.');return;}
    await onSubmit({
      type:'content_writer_practical',content:content.trim(),contentUrl:contentUrl.trim(),researchNotes:researchNotes.trim(),
      claimsEvidence:claimsEvidence.trim(),selfQaNotes:selfQaNotes.trim(),handoffNotes:handoffNotes.trim(),
      declarations:{
        originalWork:Boolean(declarations.originalWork),noInventedFacts:Boolean(declarations.noInventedFacts),
        evidenceVerified:Boolean(declarations.evidenceVerified),noRawAi:Boolean(declarations.noRawAi)
      },submittedAt:new Date().toISOString()
    });
  };

  if(passed)return <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6"><CheckCircle2 className="h-8 w-8 text-emerald-600"/><h2 className="mt-3 text-xl font-black text-emerald-900">Content Writer certification passed</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-800">Your independent practical review passed at the required standard. Production activation is handled by the protected ProFox workflow.</p>{typeof progress?.score==='number'&&<div className="mt-4 inline-flex rounded-full bg-white px-3 py-1 text-xs font-black text-emerald-700">Verified score · {progress.score}%</div>}</section>;

  if(submitted)return <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6"><ShieldCheck className="h-8 w-8 text-amber-600"/><h2 className="mt-3 text-xl font-black text-amber-900">Practical submitted for independent review</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-amber-800">Your evidence is locked in the review queue. You cannot self-pass this module. A Content reviewer must score it at {passingScore}% or higher before production access can activate.</p></section>;

  return <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <div><div className="text-[10px] font-black uppercase tracking-[.18em] text-[#000080]">Content Academy · Independent Certification</div><h2 className="mt-2 text-2xl font-black text-slate-900">Content Writer Practical Certification</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Demonstrate the complete PF-SOP-07 thinking chain: research, evidence, writing, self-QA and implementation handoff. Passing standard: {passingScore}%.</p></div>

    {retry&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4"><div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600"/><div><div className="text-xs font-black text-red-800">Retry required</div><p className="mt-1 text-xs leading-5 text-red-700">{progress?.feedback||'Review the practical against PF-SOP-07, correct the gaps, and resubmit a new attempt.'}</p></div></div></div>}
    {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700"><AlertCircle className="mr-2 inline h-4 w-4"/>{error}</div>}

    <div className="grid gap-3 md:grid-cols-2">{guidance.map(item=><div key={item.label} className={`rounded-2xl border p-4 ${item.done?'border-emerald-100 bg-emerald-50':'border-slate-200 bg-slate-50'}`}><div className="flex items-center gap-2 text-xs font-black text-slate-800">{item.done?<CheckCircle2 className="h-4 w-4 text-emerald-600"/>:<FileCheck2 className="h-4 w-4 text-slate-400"/>}{item.label}</div><p className="mt-2 text-[11px] leading-5 text-slate-500">{item.detail}</p></div>)}</div>

    <div className="grid gap-5">
      <Field label="Final content / website copy sample" help="Paste the implementation-ready copy. If the sample is hosted elsewhere, the URL below can be used instead."><textarea rows={10} value={content} onChange={e=>setContent(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 outline-none focus:border-[#000080]" placeholder="Paste the final copy here..."/></Field>
      <Field label="Content evidence URL" help="Optional when at least 300 characters are pasted above."><div className="relative"><ExternalLink className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={contentUrl} onChange={e=>setContentUrl(e.target.value)} placeholder="https://..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#000080]"/></div></Field>
      <Field label="Research & source reasoning" help="Minimum 80 characters. Explain why the evidence and customer language are trustworthy."><textarea rows={5} value={researchNotes} onChange={e=>setResearchNotes(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 outline-none focus:border-[#000080]"/></Field>
      <Field label="Claims & evidence register summary" help="Identify material claims and the evidence supporting them. No evidence = no factual performance claim."><textarea rows={4} value={claimsEvidence} onChange={e=>setClaimsEvidence(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 outline-none focus:border-[#000080]"/></Field>
      <Field label="Writer Self-QA summary" help="Explain what you checked before asking another person to review your work."><textarea rows={4} value={selfQaNotes} onChange={e=>setSelfQaNotes(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 outline-none focus:border-[#000080]"/></Field>
      <Field label="UI/UX implementation handoff" help="Minimum 80 characters. Give the designer the hierarchy, CTA, proof and presentation context needed to implement correctly."><textarea rows={5} value={handoffNotes} onChange={e=>setHandoffNotes(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 outline-none focus:border-[#000080]"/></Field>
    </div>

    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="text-xs font-black text-slate-900">Required professional declarations</div><div className="mt-3 space-y-3">{declarationRows.map(([key,label])=><label key={key} className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-slate-600"><input type="checkbox" checked={Boolean(declarations[key])} onChange={e=>setDeclarations(current=>({...current,[key]:e.target.checked}))} className="mt-0.5 h-4 w-4 accent-[#000080]"/><span>{label}</span></label>)}</div></div>

    <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><div className="text-xs leading-5 text-slate-500">Submitting sends this attempt to an independent reviewer. It does not activate your account by itself.</div><button type="button" disabled={isSubmitting||!ready} onClick={()=>void submit()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{isSubmitting?<Loader2 className="h-4 w-4 animate-spin"/>:<ShieldCheck className="h-4 w-4"/>}{retry?'Resubmit Practical':'Submit for Independent Review'}</button></div>
  </section>;
}

function Field({label,help,children}:{label:string;help:string;children:React.ReactNode}){return <label className="block"><span className="text-xs font-black text-slate-800">{label}</span><span className="mt-1 block text-[11px] leading-5 text-slate-400">{help}</span><div className="mt-2">{children}</div></label>}
