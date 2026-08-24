import React,{useEffect,useMemo,useState} from 'react';
import {Bot,Clipboard,Check,Loader2,RefreshCw,ShieldCheck,Sparkles} from 'lucide-react';
import {AiCapabilityKey,ProductivityAiStatus,productivityService} from '../../lib/productivityService';

type CopilotMode={key:string;label:string;help:string;capability:AiCapabilityKey};
type ResearchSource={title:string;url:string};
const modesByEntity:Record<string,CopilotMode[]>={
 meeting:[
  {key:'meeting_brief',label:'Meeting preparation',help:'Prepare goals, known context, risks and useful discovery questions.',capability:'meeting_preparation'},
  {key:'meeting_summary',label:'Structure meeting notes',help:'Turn the confirmed meeting context into requirements, objections and next steps.',capability:'meeting_summary'},
  {key:'objection_coaching',label:'Objection coaching',help:'Use approved ProFox objection training to prepare a calm response approach.',capability:'sales_coaching'},
  {key:'follow_up_draft',label:'Follow-up draft',help:'Draft a concise post-meeting follow-up for human review.',capability:'outreach_drafting'},
  {key:'next_action_explanation',label:'Explain next action',help:'Explain the deterministic ProFox next-best-action recommendation.',capability:'next_best_action_explanation'}
 ],
 lead:[
  {key:'lead_research',label:'Research brief',help:'Organize known lead facts, qualification signals, unknowns and research questions.',capability:'lead_research'},
  {key:'loom_brief',label:'Loom preparation',help:'Prepare personalized Loom talking points from verified context.',capability:'loom_preparation'},
  {key:'follow_up_draft',label:'Outreach / follow-up draft',help:'Draft a relevant ProFox message using the lead context only.',capability:'outreach_drafting'},
  {key:'next_action_explanation',label:'Explain next action',help:'Explain why ProFox is recommending the current next action.',capability:'next_best_action_explanation'}
 ],
 opportunity:[
  {key:'lead_research',label:'Opportunity research brief',help:'Organize company context, qualification signals and remaining unknowns.',capability:'lead_research'},
  {key:'loom_brief',label:'Loom preparation',help:'Prepare personalized Loom talking points without inventing website findings.',capability:'loom_preparation'},
  {key:'meeting_brief',label:'Meeting preparation',help:'Prepare for discovery from current opportunity and approved sales guidance.',capability:'meeting_preparation'},
  {key:'objection_coaching',label:'Objection coaching',help:'Prepare a response approach using deal context and approved ProFox training.',capability:'sales_coaching'},
  {key:'follow_up_draft',label:'Follow-up draft',help:'Draft the next sales follow-up for human review.',capability:'outreach_drafting'},
  {key:'quotation_draft',label:'Quotation brief',help:'Prepare a commercial brief using verified requirements and the active Sales Catalog.',capability:'quotation_assistant'},
  {key:'next_action_explanation',label:'Explain next action',help:'Explain the existing deterministic ProFox recommendation.',capability:'next_best_action_explanation'},
  {key:'lost_reason_summary',label:'Loss / risk analysis',help:'Summarize known loss or risk evidence without inventing reasons.',capability:'sales_coaching'}
 ],
 quotation:[
  {key:'quotation_draft',label:'Quotation review brief',help:'Review scope, approved catalog alignment, terms and missing information.',capability:'quotation_assistant'},
  {key:'follow_up_draft',label:'Quotation follow-up',help:'Draft a concise quotation follow-up for human review.',capability:'outreach_drafting'},
  {key:'next_action_explanation',label:'Explain next action',help:'Explain the current quotation workflow recommendation.',capability:'next_best_action_explanation'}
 ],
 project:[
  {key:'project_handover',label:'Project handover brief',help:'Turn connected sales and project context into a clean delivery brief.',capability:'project_handover'},
  {key:'task_breakdown',label:'Task breakdown',help:'Suggest practical tasks from the confirmed scope without assigning people.',capability:'project_task_breakdown'},
  {key:'next_action_explanation',label:'Explain next action',help:'Explain the current deterministic delivery recommendation.',capability:'next_best_action_explanation'}
 ],
 client:[
  {key:'follow_up_draft',label:'Client follow-up draft',help:'Draft a client message from connected context for human review.',capability:'outreach_drafting'},
  {key:'next_action_explanation',label:'Explain next action',help:'Explain the current client workflow recommendation.',capability:'next_best_action_explanation'}
 ],
 payment:[{key:'next_action_explanation',label:'Explain next action',help:'Explain the protected payment workflow recommendation. AI cannot verify payment.',capability:'next_best_action_explanation'}],
 project_task:[{key:'next_action_explanation',label:'Explain next action',help:'Explain why this task is prioritized without changing its state.',capability:'next_best_action_explanation'}]
};

export default function ProductivityCopilot({entityType,entityId,compact=false}:{entityType:string;entityId:string;compact?:boolean}){
 const[status,setStatus]=useState<ProductivityAiStatus|null>(null);const[mode,setMode]=useState('');const[instructions,setInstructions]=useState('');const[output,setOutput]=useState('');const[model,setModel]=useState('');const[sources,setSources]=useState<ResearchSource[]>([]);const[externalResearchUsed,setExternalResearchUsed]=useState(false);const[loading,setLoading]=useState(true);const[running,setRunning]=useState(false);const[error,setError]=useState('');const[copied,setCopied]=useState(false);
 const allModes=useMemo(()=>modesByEntity[entityType]||[],[entityType]);
 const modes=useMemo(()=>status?allModes.filter(item=>status.capabilities?.[item.capability]===true):[],[allModes,status]);
 useEffect(()=>{setMode(modes[0]?.key||'');setOutput('');setSources([]);setExternalResearchUsed(false);setError('');},[entityType,entityId,modes]);
 useEffect(()=>{let live=true;(async()=>{setLoading(true);try{const s=await productivityService.getAiStatus();if(live)setStatus(s);}catch(e:any){if(live)setError(e?.message||'Unable to load AI assistance status.');}finally{if(live)setLoading(false);}})();return()=>{live=false};},[]);
 const run=async()=>{if(!mode)return;setRunning(true);setError('');setCopied(false);setSources([]);setExternalResearchUsed(false);try{const result=await productivityService.runCopilot(entityType,entityId,mode,instructions.trim());setOutput(result.output);setModel(result.model);setSources(result.sources||[]);setExternalResearchUsed(Boolean(result.externalResearchUsed));}catch(e:any){setError(e?.message||'AI assistance could not prepare the draft.');}finally{setRunning(false);}};
 const copy=async()=>{if(!output)return;await navigator.clipboard.writeText(output);setCopied(true);setTimeout(()=>setCopied(false),1500);};
 if(allModes.length===0)return null;
 if(loading)return <div className={`rounded-3xl border border-slate-200 bg-white ${compact?'p-4':'p-5'}`}><Loader2 className="h-4 w-4 animate-spin text-[#000080]"/></div>;
 return <section className={`rounded-3xl border border-slate-200 bg-white shadow-sm ${compact?'p-4':'p-5 sm:p-6'}`}>
   <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><Bot className="h-5 w-5"/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">ProFox AI Assistance</div><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">Human review required</span></div><h3 className="mt-1 text-base font-black">Prepare, do not replace judgment.</h3><p className="mt-1 text-xs leading-5 text-slate-500">AI uses only authorized connected context and approved ProFox guidance. Protected business actions stay in the normal workflow, and ProFox continues normally when AI is off.</p></div></div>
   {!status?.enabled||!status.providerConfigured?<div className="mt-4 flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"/><span>AI assistance is currently off or not configured. CRM, booking, notifications, email automation, quotations, payments, projects, recruitment, commissions and reporting continue normally.</span></div>:modes.length===0?<div className="mt-4 flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"/><span>AI is on, but the capabilities available for this record are switched off by Admin. The normal ProFox workflow remains available.</span></div>:<>
     <div className="mt-5 grid gap-2 sm:grid-cols-2">{modes.map(item=><button key={item.key} onClick={()=>{setMode(item.key);setOutput('');setSources([]);setExternalResearchUsed(false);setError('');}} className={`rounded-2xl border p-3 text-left transition ${mode===item.key?'border-indigo-300 bg-indigo-50':'border-slate-200 bg-slate-50 hover:border-slate-300'}`}><div className="text-xs font-black text-slate-800">{item.label}</div><div className="mt-1 text-[10px] leading-4 text-slate-500">{item.help}</div></button>)}</div>
     <label className="mt-4 block text-[10px] font-black uppercase tracking-wider text-slate-500">Optional instruction<input value={instructions} onChange={e=>setInstructions(e.target.value)} maxLength={2000} placeholder="e.g. Keep it concise and focus on the confirmed business outcome" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-medium normal-case tracking-normal outline-none focus:border-indigo-400"/></label>
     <button onClick={()=>void run()} disabled={running||!mode} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{running?<Loader2 className="h-4 w-4 animate-spin"/>:<Sparkles className="h-4 w-4"/>}Prepare draft</button>
   </>}
   {error&&<div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}
   {output&&<div className="mt-5 overflow-hidden rounded-2xl border border-indigo-100"><div className="flex items-center justify-between border-b border-indigo-100 bg-indigo-50 px-4 py-2.5"><div className="text-[10px] font-black uppercase tracking-wider text-indigo-700">Review before using {model&&`· ${model}`}</div><div className="flex items-center gap-1"><button onClick={()=>void run()} className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-100" title="Regenerate"><RefreshCw className="h-3.5 w-3.5"/></button><button onClick={()=>void copy()} className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-100" title="Copy">{copied?<Check className="h-3.5 w-3.5"/>:<Clipboard className="h-3.5 w-3.5"/>}</button></div></div><div className="whitespace-pre-wrap p-4 text-sm leading-6 text-slate-700">{output}</div>{externalResearchUsed&&<div className="border-t border-indigo-100 bg-slate-50 px-4 py-3"><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Public website evidence</div>{sources.length>0?<div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{sources.map(source=><a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#000080] hover:underline">{source.title||source.url}</a>)}</div>:<p className="mt-1 text-[10px] leading-4 text-slate-500">Public website context was used. Verify material website observations against the prospect site before using them.</p>}</div>}</div>}
 </section>;
}
