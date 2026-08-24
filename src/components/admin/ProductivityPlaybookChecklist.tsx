import React,{useEffect,useMemo,useState} from 'react';
import {Check,CheckCircle2,ClipboardCheck,Loader2} from 'lucide-react';
import {ProductivityPlaybookState,productivityService} from '../../lib/productivityService';

export default function ProductivityPlaybookChecklist({entityType,entityId,compact=false}:{entityType:string;entityId:string;compact?:boolean}){
 const [state,setState]=useState<ProductivityPlaybookState|null>(null);const [loading,setLoading]=useState(true);const [running,setRunning]=useState('');const [error,setError]=useState('');
 const load=async()=>{setLoading(true);setError('');try{setState(await productivityService.getPlaybook(entityType,entityId));}catch(e:any){setError(e?.message||'Unable to load the checklist.');}finally{setLoading(false);}};
 useEffect(()=>{void load();},[entityType,entityId]);
 const done=useMemo(()=>new Set(state?.completedItems||[]),[state]);
 const total=state?.playbook?.checklist.length||0;const complete=state?.playbook?.checklist.filter(i=>done.has(i.key)).length||0;
 const toggle=async(key:string,checked:boolean)=>{if(!state?.playbook)return;setRunning(key);setError('');try{const next=await productivityService.setChecklistItem(state.playbook.id,entityType,entityId,key,checked);setState({...state,completedItems:next.completedItems});}catch(e:any){setError(e?.message||'Unable to update the checklist.');}finally{setRunning('');}};
 if(loading)return <div className={`rounded-3xl border border-slate-200 bg-white ${compact?'p-4':'p-5'}`}><Loader2 className="h-4 w-4 animate-spin text-[#000080]"/></div>;
 if(!state?.playbook)return null;
 return <section className={`rounded-3xl border border-slate-200 bg-white shadow-sm ${compact?'p-4':'p-5 sm:p-6'}`}>
  <div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700"><ClipboardCheck className="h-5 w-5"/></div><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-600">Stage playbook</div><h3 className="mt-1 text-base font-black">{state.playbook.name}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{state.playbook.description}</p></div></div><div className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">{complete}/{total}</div></div>
  {error&&<div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}
  <div className="mt-5 space-y-2">{state.playbook.checklist.map(item=>{const checked=done.has(item.key);return <button key={item.key} type="button" disabled={running===item.key} onClick={()=>void toggle(item.key,!checked)} className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${checked?'border-emerald-200 bg-emerald-50/70':'border-slate-100 bg-slate-50 hover:border-blue-200 hover:bg-blue-50/40'}`}><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked?'border-emerald-600 bg-emerald-600 text-white':'border-slate-300 bg-white text-transparent'}`}>{running===item.key?<Loader2 className="h-3 w-3 animate-spin text-slate-400"/>:<Check className="h-3 w-3"/>}</span><span className={`text-xs font-bold leading-5 ${checked?'text-emerald-900 line-through decoration-emerald-400':'text-slate-700'}`}>{item.label}</span></button>})}</div>
  {total>0&&complete===total&&<div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4"/> Stage checklist complete. Move forward when the business record is ready.</div>}
 </section>;
}
