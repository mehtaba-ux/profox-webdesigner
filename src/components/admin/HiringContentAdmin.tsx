import React,{useEffect,useMemo,useState}from'react';
import{ArrowLeft,ExternalLink,Loader2,Save}from'lucide-react';
import{Navigate,useNavigate}from'react-router-dom';
import{useAuth}from'../../lib/AuthContext';
import{useCMS}from'../../lib/CMSProvider';

const input='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#000080] focus:ring-4 focus:ring-blue-100';
const defaults={
 hero:{badge:'REMOTE · COMMISSION-BASED · INTERNATIONAL SALES',title:'Independent Sales Representative',line:'Help businesses move from site to system.',description:'Represent ProFox with businesses in the US, UK, Canada and Australia. Find qualified prospects, start useful conversations, run discovery calls and close website, application and automation projects.'},
 role:{location:'Remote · Worldwide',type:'Independent contractor · Commission-only',experience:'6+ months sales experience',summary:'This role is for salespeople who can work independently, communicate clearly in English and stay consistent from prospect research through follow-up and close.'},
 compensation:[
  {label:'Website Package',price:'$599',rate:'10%',example:'$59.90'},
  {label:'Business Package',price:'$2,379',rate:'12%',example:'$285.48'},
  {label:'Premium Package',price:'$5,799+',rate:'15%',example:'$869.85+'},
  {label:'Custom Web Application',price:'Approved quotation',rate:'10–15%',example:'Set per quotation'}
 ],
 responsibilities:[
  'Research and qualify businesses that fit ProFox services.',
  'Use thoughtful email, LinkedIn, phone and personalized outreach to start conversations.',
  'Book and conduct discovery meetings by Zoom or Google Meet.',
  'Understand the client’s goals, current website or workflow, decision process and next step.',
  'Present the right ProFox Web, ProFox Apps or ProFox Flow service without overselling.',
  'Keep leads, follow-ups, meetings and quotations accurate in the ProFox CRM.',
  'Close responsibly and hand verified sales into the delivery system.'
 ],
 requirements:[
  'At least 6 months of sales, business development or client-facing experience.',
  'Clear spoken and written English for international client conversations.',
  'Confidence conducting professional video meetings and asking discovery questions.',
  'A reliable laptop, internet connection and a suitable place for client calls.',
  'Comfort with a commission-only independent contractor model.',
  'Ability to research prospects, follow up consistently and work without daily supervision.'
 ],
 process:[
  {title:'Apply',text:'Tell us about your experience and send a 60–120 second introduction video.'},
  {title:'Review & assessment',text:'We review communication, sales judgment, lead research and CRM readiness.'},
  {title:'Agreement',text:'Selected candidates review and sign the ProFox Independent Sales Partner Agreement.'},
  {title:'Sales Academy',text:'Complete the required 20-module training, practical reviews and final certification.'},
  {title:'Final approval',text:'ProFox reviews training evidence and activation readiness.'},
  {title:'Start selling',text:'Approved representatives receive active sales access and begin managing their own pipeline.'}
 ]
};

function mergeData(value:any){return{...defaults,...value,hero:{...defaults.hero,...(value?.hero||{})},role:{...defaults.role,...(value?.role||{})},compensation:Array.isArray(value?.compensation)&&value.compensation.length?value.compensation:defaults.compensation,responsibilities:Array.isArray(value?.responsibilities)&&value.responsibilities.length?value.responsibilities:defaults.responsibilities,requirements:Array.isArray(value?.requirements)&&value.requirements.length?value.requirements:defaults.requirements,process:Array.isArray(value?.process)&&value.process.length?value.process:defaults.process}}

export default function HiringContentAdmin(){
 const navigate=useNavigate();const{isAdmin,loading:authLoading}=useAuth();const{content,loading:updateLoading,updateSection}=useCMS();
 const page=useMemo(()=>Array.isArray(content.customPages)?content.customPages.find((p:any)=>p.id==='careers'||p.slug==='careers'):null,[content.customPages]);
 const[data,setData]=useState<any>(defaults);const[saving,setSaving]=useState(false);const[message,setMessage]=useState('');const[error,setError]=useState('');
 useEffect(()=>{if(page)setData(mergeData(page.careersData))},[page]);
 if(authLoading||updateLoading)return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>;
 if(!isAdmin)return <Navigate to="/admin/workspace" replace/>;
 if(!page)return <div className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-4xl rounded-3xl border border-red-200 bg-white p-8 text-sm text-red-700">The Careers CMS page could not be found.</div></div>;
 const setHero=(key:string,value:string)=>setData((d:any)=>({...d,hero:{...d.hero,[key]:value}}));
 const setRole=(key:string,value:string)=>setData((d:any)=>({...d,role:{...d.role,[key]:value}}));
 const save=async()=>{setSaving(true);setError('');setMessage('');try{const pages=(content.customPages||[]).map((p:any)=>(p.id==='careers'||p.slug==='careers')?{...p,careersData:data,heroTitle:data.hero.title,heroSubtitle:data.hero.line,updatedAt:new Date().toISOString().slice(0,10)}:p);await updateSection('customPages',pages);setMessage('Hiring content saved. The public Careers page will use these values.')}catch(e:any){setError(e?.message||'Hiring content could not be saved.')}finally{setSaving(false)}};
 return <div className="min-h-screen bg-slate-50 text-slate-900"><header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><div className="flex items-center gap-3"><button onClick={()=>navigate('/admin/app/recruitment?tab=recruitment')} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><ArrowLeft className="h-4 w-4"/></button><div><h1 className="text-xl font-black">Hiring Content</h1><p className="text-xs text-slate-500">Candidate-facing offer and Careers messaging. Brand system: Navy leads. Red directs.</p></div></div><a href="/careers" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-[#000080]">Preview <ExternalLink className="h-3.5 w-3.5"/></a></div></header><main className="mx-auto max-w-6xl p-4 sm:p-8">{error&&<Notice tone="error">{error}</Notice>}{message&&<Notice tone="success">{message}</Notice>}
 <Card title="Hero & positioning" description="Keep one dominant idea. The master brand line remains From site to system."><div className="grid gap-4 sm:grid-cols-2"><Field label="Eyebrow"><input className={input} value={data.hero.badge} onChange={e=>setHero('badge',e.target.value)}/></Field><Field label="Role title"><input className={input} value={data.hero.title} onChange={e=>setHero('title',e.target.value)}/></Field><Field label="Campaign line"><input className={input} value={data.hero.line} onChange={e=>setHero('line',e.target.value)}/></Field><Field label="Hero description"><textarea rows={3} className={input} value={data.hero.description} onChange={e=>setHero('description',e.target.value)}/></Field></div></Card>
 <Card title="Role terms" description="Use plain language so candidates understand the arrangement before applying."><div className="grid gap-4 sm:grid-cols-2"><Field label="Location"><input className={input} value={data.role.location} onChange={e=>setRole('location',e.target.value)}/></Field><Field label="Engagement"><input className={input} value={data.role.type} onChange={e=>setRole('type',e.target.value)}/></Field><Field label="Experience"><input className={input} value={data.role.experience} onChange={e=>setRole('experience',e.target.value)}/></Field><Field label="Summary"><textarea rows={3} className={input} value={data.role.summary} onChange={e=>setRole('summary',e.target.value)}/></Field></div></Card>
 <Card title="Commission cards" description="These values must stay aligned with the approved sales offer and commission policy."><div className="space-y-3">{data.compensation.map((item:any,i:number)=><div key={i} className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-4"><Field label="Label"><input className={input} value={item.label} onChange={e=>setData((d:any)=>({...d,compensation:d.compensation.map((x:any,j:number)=>j===i?{...x,label:e.target.value}:x)}))}/></Field><Field label="Price"><input className={input} value={item.price} onChange={e=>setData((d:any)=>({...d,compensation:d.compensation.map((x:any,j:number)=>j===i?{...x,price:e.target.value}:x)}))}/></Field><Field label="Rate"><input className={input} value={item.rate} onChange={e=>setData((d:any)=>({...d,compensation:d.compensation.map((x:any,j:number)=>j===i?{...x,rate:e.target.value}:x)}))}/></Field><Field label="Example"><input className={input} value={item.example} onChange={e=>setData((d:any)=>({...d,compensation:d.compensation.map((x:any,j:number)=>j===i?{...x,example:e.target.value}:x)}))}/></Field></div>)}</div><div className="mt-4 rounded-2xl border-l-4 border-[#FF0E0E] bg-red-50 p-4 text-xs leading-5 text-slate-600"><strong className="text-slate-900">Locked compensation clarification:</strong> self-sourced + closed deals add 5 percentage points to the approved base rate. Change this only when the underlying commission policy changes.</div></Card>
 <TextList title="Responsibilities" description="One responsibility per line." value={data.responsibilities} onChange={(items)=>setData((d:any)=>({...d,responsibilities:items}))}/>
 <TextList title="Requirements" description="Keep this to genuine must-haves, not a long wish list." value={data.requirements} onChange={(items)=>setData((d:any)=>({...d,requirements:items}))}/>
 <Card title="Public selection journey" description="Keep the candidate view simple while the 14-stage internal pipeline remains unchanged."><div className="space-y-3">{data.process.map((item:any,i:number)=><div key={i} className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-[220px_1fr]"><Field label={`Step ${i+1}`}><input className={input} value={item.title} onChange={e=>setData((d:any)=>({...d,process:d.process.map((x:any,j:number)=>j===i?{...x,title:e.target.value}:x)}))}/></Field><Field label="Explanation"><input className={input} value={item.text} onChange={e=>setData((d:any)=>({...d,process:d.process.map((x:any,j:number)=>j===i?{...x,text:e.target.value}:x)}))}/></Field></div>)}</div></Card>
 <div className="sticky bottom-4 mt-6 flex justify-end"><button disabled={saving} onClick={()=>void save()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-black text-white shadow-xl disabled:opacity-50">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>} Save hiring content</button></div>
 </main></div>
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block text-xs font-black text-slate-600">{label}<div className="mt-2">{children}</div></label>}
function Card({title,description,children}:{title:string;description:string;children:React.ReactNode}){return <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-black text-[#000080]">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p><div className="mt-5">{children}</div></section>}
function TextList({title,description,value,onChange}:{title:string;description:string;value:string[];onChange:(items:string[])=>void}){return <Card title={title} description={description}><textarea rows={Math.max(6,value.length+1)} className={`${input} leading-6`} value={value.join('\n')} onChange={e=>onChange(e.target.value.split('\n').map(x=>x.trim()).filter(Boolean))}/></Card>}
function Notice({tone,children}:{tone:'error'|'success';children:React.ReactNode}){return <div className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${tone==='error'?'border-red-200 bg-red-50 text-red-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{children}</div>}
