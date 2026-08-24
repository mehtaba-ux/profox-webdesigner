import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronDown, ChevronUp, Loader2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';

type ContentStatus = 'draft' | 'coming_soon' | 'published';
type Track = {
  id:string; module_id:string; niche_name:string; slug:string; summary:string; passing_score:number; sort_order:number;
  required:boolean; active:boolean; content_status:ContentStatus; pre_survey_questions:string[]; diagnostic_questions:string[];
};
type Lesson = { id:string; module_id:string; niche_slug:string; title:string; content:string; video_url?:string; sort_order:number; active:boolean; };

const input='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100';
const msg=(e:any,f:string)=>e?.message||f;
const slugify=(value:string)=>value.toLowerCase().trim().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64);

export default function NicheCatalogAdmin(){
  const {isAdmin,loading:authLoading}=useAuth();
  const navigate=useNavigate();
  const [moduleId,setModuleId]=useState('');
  const [tracks,setTracks]=useState<Track[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [lessons,setLessons]=useState<Lesson[]>([]);
  const [expandedLesson,setExpandedLesson]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [creating,setCreating]=useState(false);
  const [newName,setNewName]=useState('');
  const [newSlug,setNewSlug]=useState('');
  const [newSummary,setNewSummary]=useState('');

  const selected=useMemo(()=>tracks.find(t=>t.id===selectedId)||null,[tracks,selectedId]);

  const load=async(preferred?:string)=>{
    setLoading(true);setError('');
    try{
      const {data:mods,error:modError}=await supabase.from('training_modules').select('id').eq('slug','niche-training').limit(1);
      if(modError)throw modError;
      const id=mods?.[0]?.id;
      if(!id)throw new Error('Module 4 · Niche Training was not found.');
      setModuleId(id);
      const {data,error:e}=await supabase.from('niche_training_tracks').select('*').eq('module_id',id).order('sort_order',{ascending:true});
      if(e)throw e;
      const rows=(data||[]) as Track[];setTracks(rows);
      const next=preferred||selectedId||rows[0]?.id||'';setSelectedId(rows.some(r=>r.id===next)?next:(rows[0]?.id||''));
    }catch(e:any){setError(msg(e,'Niche catalog could not be loaded.'));}
    finally{setLoading(false);}
  };

  const loadLessons=async(track:Track)=>{
    const {data,error:e}=await supabase.from('training_lessons').select('*').eq('module_id',track.module_id).eq('niche_slug',track.slug).order('sort_order',{ascending:true});
    if(e){setError(msg(e,'Niche lessons could not be loaded.'));return;}
    setLessons((data||[]) as Lesson[]);setExpandedLesson(null);
  };

  useEffect(()=>{if(isAdmin)void load();},[isAdmin]);
  useEffect(()=>{if(selected)void loadLessons(selected);else setLessons([]);},[selectedId,selected?.slug]);

  const updateSelected=(u:Partial<Track>)=>setTracks(p=>p.map(t=>t.id===selectedId?{...t,...u}:t));
  const updateLesson=(id:string,u:Partial<Lesson>)=>setLessons(p=>p.map(l=>l.id===id?{...l,...u}:l));

  const createNiche=async()=>{
    if(!moduleId)return;
    const name=newName.trim();const slug=(newSlug.trim()||slugify(name));
    if(!name||!slug){setError('Niche name and slug are required.');return;}
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){setError('Slug may contain lowercase letters, numbers and single hyphens only.');return;}
    setBusy(true);setError('');setMessage('');
    try{
      const nextOrder=tracks.length?Math.max(...tracks.map(t=>t.sort_order))+1:1;
      const {data,error:e}=await supabase.from('niche_training_tracks').insert({
        module_id:moduleId,niche_name:name,slug,summary:newSummary.trim()||'Planned ProFox niche certification. Content can be built from Admin.',
        passing_score:85,sort_order:nextOrder,required:false,active:true,content_status:'draft',pre_survey_questions:[],diagnostic_questions:[]
      }).select('*').single();
      if(e)throw e;
      setCreating(false);setNewName('');setNewSlug('');setNewSummary('');setMessage(`${name} added as a Draft niche.`);await load((data as Track).id);
    }catch(e:any){setError(msg(e,'Niche could not be created.'));}
    finally{setBusy(false);}
  };

  const validatePublish=async(track:Track)=>{
    if(track.content_status!=='published')return true;
    const [lessonResult,questionResult]=await Promise.all([
      supabase.from('training_lessons').select('id',{count:'exact',head:true}).eq('module_id',track.module_id).eq('niche_slug',track.slug).eq('active',true),
      supabase.from('training_assessment_questions').select('id',{count:'exact',head:true}).eq('module_id',track.module_id).eq('niche_slug',track.slug).eq('active',true)
    ]);
    if(lessonResult.error)throw lessonResult.error;if(questionResult.error)throw questionResult.error;
    const missing:string[]=[];
    if(!track.pre_survey_questions?.length)missing.push('baseline survey');
    if(!track.diagnostic_questions?.length)missing.push('business diagnostic');
    if(!(lessonResult.count||0))missing.push('lessons');
    if(!(questionResult.count||0))missing.push('certification questions');
    if(missing.length){setError(`Cannot publish ${track.niche_name} yet. Add ${missing.join(', ')} first.`);return false;}
    return true;
  };

  const saveTrack=async()=>{
    if(!selected)return;
    if(!selected.niche_name.trim()){setError('Niche name is required.');return;}
    setBusy(true);setError('');setMessage('');
    try{
      if(!(await validatePublish(selected)))return;
      const {error:e}=await supabase.from('niche_training_tracks').update({
        niche_name:selected.niche_name.trim(),summary:selected.summary.trim(),passing_score:Math.max(1,Math.min(100,Math.round(selected.passing_score))),
        sort_order:selected.sort_order,required:selected.required,active:selected.active,content_status:selected.content_status,updated_at:new Date().toISOString()
      }).eq('id',selected.id);
      if(e)throw e;setMessage(`${selected.niche_name} catalog settings saved.`);await load(selected.id);
    }catch(e:any){setError(msg(e,'Niche settings could not be saved.'));}
    finally{setBusy(false);}
  };

  const addLesson=async()=>{
    if(!selected)return;setBusy(true);setError('');setMessage('');
    try{
      const next=lessons.length?Math.max(...lessons.map(l=>l.sort_order))+1:1000;
      const {data,error:e}=await supabase.from('training_lessons').insert({module_id:selected.module_id,niche_slug:selected.slug,title:'New niche training lesson',content:'# New lesson\n\nAdd approved industry training content here.',video_url:'',sort_order:next,active:false}).select('*').single();
      if(e)throw e;const item=data as Lesson;setLessons(p=>[...p,item]);setExpandedLesson(item.id);setMessage('Draft lesson added. It is inactive until you publish it.');
    }catch(e:any){setError(msg(e,'Lesson could not be added.'));}finally{setBusy(false);}
  };

  const saveLesson=async(l:Lesson)=>{
    if(!l.title.trim()||!l.content.trim()){setError('Lesson title and content are required.');return;}
    setBusy(true);setError('');setMessage('');
    try{const {error:e}=await supabase.from('training_lessons').update({title:l.title.trim(),content:l.content.trim(),video_url:(l.video_url||'').trim(),sort_order:l.sort_order,active:l.active,updated_at:new Date().toISOString()}).eq('id',l.id);if(e)throw e;setMessage('Lesson saved.');}
    catch(e:any){setError(msg(e,'Lesson could not be saved.'));}finally{setBusy(false);}
  };

  const deleteLesson=async(l:Lesson)=>{
    if(!window.confirm(`Delete “${l.title}”?`))return;setBusy(true);setError('');
    try{const {error:e}=await supabase.from('training_lessons').delete().eq('id',l.id);if(e)throw e;setLessons(p=>p.filter(x=>x.id!==l.id));setMessage('Lesson deleted.');}
    catch(e:any){setError(msg(e,'Lesson could not be deleted.'));}finally{setBusy(false);}
  };

  if(authLoading)return null;if(!isAdmin)return <Navigate to="/admin/workspace" replace/>;
  if(loading)return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b bg-white px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><div className="flex items-start gap-3"><button onClick={()=>navigate('/admin/app/recruitment?tab=onboarding')} className="rounded-xl border p-2"><ArrowLeft className="h-4 w-4"/></button><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-[#000080]">Sales Academy · Module 4</div><h1 className="text-xl font-black">Niche Catalog & Builder</h1><p className="mt-1 text-xs text-slate-500">Create future niches, control availability, and build lesson content without code.</p></div></div><button onClick={()=>void load(selectedId)} disabled={busy} className="rounded-xl border p-2.5"><RefreshCw className="h-4 w-4"/></button></div></header>
    <main className="mx-auto grid max-w-7xl gap-6 p-4 sm:p-8 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-3 rounded-3xl border bg-white p-4 shadow-sm"><button onClick={()=>setCreating(v=>!v)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 py-3 text-xs font-black text-white"><Plus className="h-4 w-4"/> Add New Niche</button>{tracks.map((t,i)=><button key={t.id} onClick={()=>setSelectedId(t.id)} className={`w-full rounded-2xl border p-4 text-left ${t.id===selectedId?'border-[#000080] bg-blue-50':'border-slate-200 bg-slate-50'}`}><div className="text-[10px] font-black uppercase text-slate-400">Niche {i+1} · {t.content_status.replace('_',' ')}</div><div className="mt-1 text-sm font-black">{t.niche_name}</div><div className="mt-1 text-[10px] text-slate-500">{t.required?'Required':'Optional'} · {t.active?'Visible':'Hidden'}</div></button>)}</aside>
      <section className="space-y-6">{error&&<Notice danger>{error}</Notice>}{message&&<Notice>{message}</Notice>}
        {creating&&<div className="rounded-3xl border bg-white p-6 shadow-sm"><h2 className="text-sm font-black">Create a new niche</h2><p className="mt-1 text-xs text-slate-500">New niches start as Draft and never affect seller completion until you intentionally publish and mark them Required.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Niche name"><input className={input} value={newName} onChange={e=>{setNewName(e.target.value);if(!newSlug)setNewSlug(slugify(e.target.value));}}/></Field><Field label="Stable slug"><input className={input} value={newSlug} onChange={e=>setNewSlug(slugify(e.target.value))}/></Field></div><Field label="Summary"><textarea rows={3} className={`${input} mt-2`} value={newSummary} onChange={e=>setNewSummary(e.target.value)}/></Field><div className="mt-4 flex justify-end"><button disabled={busy} onClick={()=>void createNiche()} className="rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white">Create Draft Niche</button></div></div>}
        {selected&&<>
          <div className="rounded-3xl border bg-white p-6 shadow-sm"><div className="flex items-center gap-2 text-[#000080]"><BookOpen className="h-5 w-5"/><span className="font-black">Catalog settings</span></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Niche name"><input className={input} value={selected.niche_name} onChange={e=>updateSelected({niche_name:e.target.value})}/></Field><Field label="Stable slug"><input readOnly className={`${input} bg-slate-100 text-slate-500`} value={selected.slug}/></Field><Field label="Availability"><select className={input} value={selected.content_status} onChange={e=>updateSelected({content_status:e.target.value as ContentStatus})}><option value="draft">Draft — Admin only</option><option value="coming_soon">Coming Soon — visible, locked</option><option value="published">Published — training available</option></select></Field><Field label="Passing score"><input type="number" min={1} max={100} className={input} value={selected.passing_score} onChange={e=>updateSelected({passing_score:Number(e.target.value)})}/></Field><Field label="Sort order"><input type="number" className={input} value={selected.sort_order} onChange={e=>updateSelected({sort_order:Number(e.target.value)})}/></Field></div><Field label="Seller-facing summary"><textarea rows={4} className={`${input} mt-2`} value={selected.summary} onChange={e=>updateSelected({summary:e.target.value})}/></Field><div className="mt-4 flex gap-5 text-xs font-bold"><label className="flex items-center gap-2"><input type="checkbox" checked={selected.active} onChange={e=>updateSelected({active:e.target.checked})}/> Visible</label><label className="flex items-center gap-2"><input type="checkbox" checked={selected.required} onChange={e=>updateSelected({required:e.target.checked})}/> Required for Module 4</label></div><div className="mt-4 rounded-xl bg-amber-50 p-3 text-[11px] leading-5 text-amber-900"><strong>Publish guard:</strong> a niche cannot be switched to Published until it has a baseline survey, diagnostic prompts, at least one active lesson and at least one active certification question.</div><div className="mt-4 flex flex-wrap justify-end gap-2"><button onClick={()=>navigate('/admin/niche-academy')} className="rounded-xl border px-4 py-2.5 text-xs font-bold">Survey, Diagnostic & Assessment</button><button disabled={busy} onClick={()=>void saveTrack()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-2.5 text-xs font-black text-white"><Save className="h-4 w-4"/> Save Catalog</button></div></div>

          <div className="rounded-3xl border bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-black">Niche lesson builder</h2><p className="mt-1 text-xs text-slate-500">Build and edit training lessons for {selected.niche_name}. Keep drafts inactive until approved.</p></div><button disabled={busy} onClick={()=>void addLesson()} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"><Plus className="h-4 w-4"/> Add Lesson</button></div><div className="mt-5 space-y-3">{lessons.length===0&&<div className="rounded-2xl bg-slate-50 p-5 text-xs text-slate-500">No lesson content yet. This is expected for a Coming Soon niche.</div>}{lessons.map((l,i)=><div key={l.id} className="rounded-2xl border bg-slate-50"><button onClick={()=>setExpandedLesson(expandedLesson===l.id?null:l.id)} className="flex w-full items-center justify-between p-4 text-left"><div><div className="text-[10px] font-black uppercase text-slate-400">Lesson {i+1} · {l.active?'Active':'Draft'}</div><div className="mt-1 text-xs font-bold">{l.title}</div></div>{expandedLesson===l.id?<ChevronUp className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>}</button>{expandedLesson===l.id&&<div className="space-y-4 border-t bg-white p-4"><Field label="Title"><input className={input} value={l.title} onChange={e=>updateLesson(l.id,{title:e.target.value})}/></Field><Field label="Lesson content (Markdown)"><textarea rows={14} className={`${input} font-mono text-xs`} value={l.content} onChange={e=>updateLesson(l.id,{content:e.target.value})}/></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Video URL (optional)"><input className={input} value={l.video_url||''} onChange={e=>updateLesson(l.id,{video_url:e.target.value})}/></Field><Field label="Sort order"><input type="number" className={input} value={l.sort_order} onChange={e=>updateLesson(l.id,{sort_order:Number(e.target.value)})}/></Field></div><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={l.active} onChange={e=>updateLesson(l.id,{active:e.target.checked})}/> Active / learner-visible</label><div className="flex justify-between"><button onClick={()=>void deleteLesson(l)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600"><Trash2 className="h-4 w-4"/> Delete</button><button onClick={()=>void saveLesson(l)} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2 text-xs font-black text-white"><Save className="h-4 w-4"/> Save Lesson</button></div></div>}</div>)}</div></div>
        </>}
      </section>
    </main>
  </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span><div className="mt-2">{children}</div></label>}
function Notice({danger=false,children}:{danger?:boolean;children:React.ReactNode}){return <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${danger?'border-red-200 bg-red-50 text-red-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{children}</div>}
