import React,{useEffect,useMemo,useState}from'react';
import{Check,Copy,Loader2,MessageSquare}from'lucide-react';
import{trainingService}from'../../lib/trainingService';
import{OutreachPlaybook,outreachMessagingTrainingService}from'../../lib/outreachMessagingTrainingService';
import OutreachMessagingTraining from'./OutreachMessagingTraining';

interface Props{onComplete?:()=>void}

export default function OutreachTemplatesView({onComplete}:Props){
  // My Training historically renders this component for Module 7. Preserve that route while
  // upgrading it to the dedicated sequential certification experience.
  if(onComplete)return <OutreachMessagingTraining/>;
  return <ApprovedPlaybookLibrary/>;
}

function ApprovedPlaybookLibrary(){
 const[items,setItems]=useState<OutreachPlaybook[]>([]);const[loading,setLoading]=useState(true);const[category,setCategory]=useState('all');const[copied,setCopied]=useState('');
 useEffect(()=>{void(async()=>{setLoading(true);const mr=await trainingService.getModules();const m=(mr.data||[]).find(x=>x.slug==='outreach-cadence');if(m){const cr=await outreachMessagingTrainingService.getConfig(m.id);if(cr.data)setItems(cr.data.playbooks||[]);}setLoading(false);})();},[]);
 const cats=useMemo(()=>['all',...Array.from(new Set(items.map(x=>x.category)))],[items]);const filtered=category==='all'?items:items.filter(x=>x.category===category);
 const copy=async(x:OutreachPlaybook)=>{await navigator.clipboard.writeText(`${x.subjectTemplate?`Subject: ${x.subjectTemplate}\n\n`:''}${x.bodyTemplate}`);setCopied(x.id);setTimeout(()=>setCopied(''),1500)};
 if(loading)return <div className="flex justify-center rounded-3xl border bg-white p-10"><Loader2 className="h-6 w-6 animate-spin text-[#000080]"/></div>;
 return <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
  <div className="border-b border-slate-100 pb-5"><div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">Live Admin-Approved Reference</div><h2 className="mt-1 text-2xl font-black">Outreach Message Playbooks</h2><p className="mt-1 text-xs text-slate-500">These are structures, not copy-paste substitutes for research. The live library is Admin-managed so sellers always see the current approved wording.</p></div>
  <div className="flex gap-2 overflow-x-auto pb-1">{cats.map(c=><button key={c} onClick={()=>setCategory(c)} className={`whitespace-nowrap rounded-xl border px-3 py-2 text-[10px] font-black uppercase ${category===c?'border-[#000080] bg-[#000080] text-white':'bg-slate-50 text-slate-600'}`}>{c.replaceAll('_',' ')}</button>)}</div>
  {filtered.length===0?<div className="rounded-2xl bg-slate-50 p-8 text-center text-xs text-slate-500">No active approved playbooks are available.</div>:<div className="grid gap-5 md:grid-cols-2">{filtered.map(x=><article key={x.id} className="rounded-2xl border bg-slate-50 p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-[#000080]"><MessageSquare className="h-3.5 w-3.5"/>{x.channel} · {x.category}</div><h3 className="mt-1 text-sm font-black">{x.title}</h3>{x.nicheSlug&&<div className="mt-1 text-[10px] text-slate-500">Niche: {x.nicheSlug}</div>}</div><button onClick={()=>void copy(x)} className="rounded-xl border bg-white p-2 text-xs font-bold">{copied===x.id?<Check className="h-4 w-4 text-emerald-600"/>:<Copy className="h-4 w-4"/>}</button></div>{x.subjectTemplate&&<div className="mt-3 rounded-lg bg-white p-2 text-xs"><strong>Subject:</strong> {x.subjectTemplate}</div>}<pre className="mt-2 whitespace-pre-wrap rounded-xl bg-white p-3 font-sans text-xs leading-relaxed text-slate-700">{x.bodyTemplate}</pre><div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-2.5 text-[11px] text-blue-950"><strong>Coaching note:</strong> {x.coachingNote}</div>{x.variables?.length>0&&<div className="mt-2 flex flex-wrap gap-1">{x.variables.map(v=><span key={v} className="rounded bg-[#000080]/10 px-2 py-1 font-mono text-[9px] font-bold text-[#000080]">{`{{${v}}}`}</span>)}</div>}</article>)}</div>}
 </div>;
}
