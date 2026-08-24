import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Plus, RefreshCw, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';

type Section='knowledge'|'scenario'|'recommendation';
type Track={id:string;module_id:string;niche_name:string;slug:string;content_status:string;passing_score:number;};
type Question={id:string;module_id:string;niche_slug:string;prompt:string;options:string[];correct_index:number;explanation:string;sort_order:number;active:boolean;assessment_section:Section;case_key:string;critical:boolean;};
const input='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100';
const msg=(e:any,f:string)=>e?.message||f;

export default function NicheAssessmentAdmin(){
  const {isAdmin,loading:authLoading}=useAuth();
  const navigate=useNavigate();
  const [tracks,setTracks]=useState<Track[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [questions,setQuestions]=useState<Question[]>([]);
  const [expanded,setExpanded]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const selected=useMemo(()=>tracks.find(t=>t.id===selectedId)||null,[tracks,selectedId]);

  const loadTracks=async()=>{
    setLoading(true);setError('');
    try{
      const {data:mods,error:me}=await supabase.from('training_modules').select('id').eq('slug','niche-training').limit(1);if(me)throw me;
      const moduleId=mods?.[0]?.id;if(!moduleId)throw new Error('Niche Training module not found.');
      const {data,error:e}=await supabase.from('niche_training_tracks').select('id,module_id,niche_name,slug,content_status,passing_score').eq('module_id',moduleId).order('sort_order',{ascending:true});if(e)throw e;
      const rows=(data||[]) as Track[];setTracks(rows);const id=selectedId&&rows.some(r=>r.id===selectedId)?selectedId:(rows[0]?.id||'');setSelectedId(id);
    }catch(e:any){setError(msg(e,'Niche assessment settings could not be loaded.'));}finally{setLoading(false);}
  };

  const loadQuestions=async(track:Track)=>{
    setLoading(true);setError('');
    try{const {data,error:e}=await supabase.from('training_assessment_questions').select('*').eq('module_id',track.module_id).eq('niche_slug',track.slug).order('sort_order',{ascending:true});if(e)throw e;setQuestions((data||[]) as Question[]);setExpanded(null);}
    catch(e:any){setError(msg(e,'Certification questions could not be loaded.'));}finally{setLoading(false);}
  };

  useEffect(()=>{if(isAdmin)void loadTracks();},[isAdmin]);
  useEffect(()=>{if(selected)void loadQuestions(selected);},[selectedId,selected?.slug]);

  const updateQ=(id:string,u:Partial<Question>)=>setQuestions(p=>p.map(q=>q.id===id?{...q,...u}:q));
  const updateOption=(id:string,index:number,value:string)=>setQuestions(p=>p.map(q=>q.id===id?{...q,options:q.options.map((o,i)=>i===index?value:o)}:q));

  const addQuestion=async()=>{
    if(!selected)return;setBusy(true);setError('');setMessage('');
    try{
      const next=questions.length?Math.max(...questions.map(q=>q.sort_order))+1:1;
      const {data,error:e}=await supabase.from('training_assessment_questions').insert({module_id:selected.module_id,niche_slug:selected.slug,prompt:'New niche certification question',options:['Option A','Option B','Option C','Option D'],correct_index:0,explanation:'Explain why the approved answer is correct.',sort_order:next,active:false,assessment_section:'knowledge',case_key:`niche:${selected.slug}:new-${next}`,critical:false}).select('*').single();if(e)throw e;
      const q=data as Question;setQuestions(p=>[...p,q]);setExpanded(q.id);setMessage('Draft certification question added. It is inactive until approved.');
    }catch(e:any){setError(msg(e,'Certification question could not be added.'));}finally{setBusy(false);}
  };

  const saveQuestion=async(q:Question)=>{
    const options=q.options.map(o=>o.trim());if(!q.prompt.trim()||options.length<2||options.some(o=>!o)){setError('Question and every answer option are required.');return;}if(q.correct_index<0||q.correct_index>=options.length){setError('Select a valid correct answer.');return;}
    setBusy(true);setError('');setMessage('');
    try{const {error:e}=await supabase.from('training_assessment_questions').update({prompt:q.prompt.trim(),options,correct_index:q.correct_index,explanation:q.explanation.trim(),sort_order:q.sort_order,active:q.active,assessment_section:q.assessment_section,case_key:q.case_key.trim()||`niche:${selected?.slug||'track'}:${q.id}`,critical:q.critical,updated_at:new Date().toISOString()}).eq('id',q.id);if(e)throw e;setMessage('Certification question saved.');}
    catch(e:any){setError(msg(e,'Certification question could not be saved.'));}finally{setBusy(false);}
  };

  const deleteQuestion=async(q:Question)=>{if(!window.confirm(`Delete “${q.prompt}”?`))return;setBusy(true);setError('');try{const {error:e}=await supabase.from('training_assessment_questions').delete().eq('id',q.id);if(e)throw e;setQuestions(p=>p.filter(x=>x.id!==q.id));setMessage('Certification question deleted.');}catch(e:any){setError(msg(e,'Question could not be deleted.'));}finally{setBusy(false);}};

  if(authLoading)return null;if(!isAdmin)return <Navigate to="/admin/workspace" replace/>;
  if(loading&&tracks.length===0)return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>;

  const activeCount=questions.filter(q=>q.active).length;const criticalCount=questions.filter(q=>q.active&&q.critical).length;
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b bg-white px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><div className="flex items-start gap-3"><button onClick={()=>navigate('/admin/niche-catalog')} className="rounded-xl border p-2"><ArrowLeft className="h-4 w-4"/></button><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-[#000080]">Sales Academy · Niche Certification</div><h1 className="text-xl font-black">Niche Assessment Builder</h1><p className="mt-1 text-xs text-slate-500">Create and maintain server-scored certification questions for every niche without code.</p></div></div><button onClick={()=>void loadTracks()} disabled={busy} className="rounded-xl border p-2.5"><RefreshCw className="h-4 w-4"/></button></div></header>
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">{error&&<Notice danger>{error}</Notice>}{message&&<Notice>{message}</Notice>}
      <section className="rounded-3xl border bg-white p-6 shadow-sm"><div className="grid gap-5 lg:grid-cols-[1fr_260px] lg:items-end"><div><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Niche track</label><select className={`${input} mt-2 max-w-xl font-bold`} value={selectedId} onChange={e=>setSelectedId(e.target.value)}>{tracks.map(t=><option key={t.id} value={t.id}>{t.niche_name} · {t.content_status.replace('_',' ')}</option>)}</select><div className="mt-4 flex items-center gap-2 text-[#000080]"><ShieldCheck className="h-5 w-5"/><span className="text-sm font-black">Correct answers remain Admin-only until submission</span></div></div><div className="rounded-2xl border bg-slate-50 p-4"><div className="text-[10px] font-black uppercase text-slate-500">Active assessment</div><div className="mt-2 text-2xl font-black">{activeCount}</div><div className="text-[10px] text-slate-500">questions · {criticalCount} critical</div></div></div></section>
      <section className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-lg font-black">Certification questions</h2><p className="text-xs text-slate-500">Use Critical only for rules that must never be missed.</p></div><button disabled={busy||!selected} onClick={()=>void addQuestion()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white"><Plus className="h-4 w-4"/> Add Question</button></div>
        {questions.length===0&&<div className="rounded-3xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">No certification questions yet. Add the first question when this niche content is ready.</div>}
        {questions.map((q,i)=><div key={q.id} className="overflow-hidden rounded-3xl border bg-white shadow-sm"><button onClick={()=>setExpanded(expanded===q.id?null:q.id)} className="flex w-full items-center justify-between p-5 text-left"><div><div className="flex flex-wrap gap-2 text-[10px] font-black uppercase"><span className="text-[#000080]">Question {i+1}</span><span className="text-slate-400">{q.assessment_section}</span>{q.critical&&<span className="text-red-600">Critical</span>}{!q.active&&<span className="text-amber-600">Draft</span>}</div><div className="mt-2 text-sm font-bold">{q.prompt}</div></div>{expanded===q.id?<ChevronUp className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>}</button>{expanded===q.id&&<div className="space-y-5 border-t p-5"><Field label="Question"><textarea rows={3} className={input} value={q.prompt} onChange={e=>updateQ(q.id,{prompt:e.target.value})}/></Field><div className="grid gap-3">{q.options.map((o,index)=><label key={index} className="flex items-center gap-3 rounded-2xl border p-3"><input type="radio" name={`correct-${q.id}`} checked={q.correct_index===index} onChange={()=>updateQ(q.id,{correct_index:index})}/><input className={input} value={o} onChange={e=>updateOption(q.id,index,e.target.value)}/></label>)}</div><Field label="Explanation shown after submission"><textarea rows={3} className={input} value={q.explanation} onChange={e=>updateQ(q.id,{explanation:e.target.value})}/></Field><div className="grid gap-4 sm:grid-cols-3"><Field label="Section"><select className={input} value={q.assessment_section} onChange={e=>updateQ(q.id,{assessment_section:e.target.value as Section})}><option value="knowledge">Knowledge</option><option value="scenario">Scenario</option><option value="recommendation">Recommendation</option></select></Field><Field label="Case key"><input className={input} value={q.case_key} onChange={e=>updateQ(q.id,{case_key:e.target.value})}/></Field><Field label="Sort order"><input type="number" className={input} value={q.sort_order} onChange={e=>updateQ(q.id,{sort_order:Number(e.target.value)})}/></Field></div><div className="flex flex-wrap gap-5 text-xs font-bold"><label className="flex items-center gap-2"><input type="checkbox" checked={q.active} onChange={e=>updateQ(q.id,{active:e.target.checked})}/> Active</label><label className="flex items-center gap-2 text-red-700"><input type="checkbox" checked={q.critical} onChange={e=>updateQ(q.id,{critical:e.target.checked})}/> Critical — must be correct</label></div><div className="flex justify-between"><button onClick={()=>void deleteQuestion(q)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600"><Trash2 className="h-4 w-4"/> Delete</button><button disabled={busy} onClick={()=>void saveQuestion(q)} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2 text-xs font-black text-white"><Save className="h-4 w-4"/> Save Question</button></div></div>}</div>)}
      </section>
    </main>
  </div>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span><div className="mt-2">{children}</div></label>}
function Notice({danger=false,children}:{danger?:boolean;children:React.ReactNode}){return <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${danger?'border-red-200 bg-red-50 text-red-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{children}</div>}
