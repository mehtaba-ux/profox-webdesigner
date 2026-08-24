import React,{useEffect,useMemo,useState} from 'react';
import {AlertCircle,ArrowLeft,ArrowRight,CheckCircle2,Clock3,Layers3,Loader2,RefreshCw,Sparkles,Target,UsersRound} from 'lucide-react';
import {Navigate,useNavigate} from 'react-router-dom';
import {useAuth} from '../../lib/AuthContext';
import {ProductivityBucket,ProductivityCommandCenter as CommandCenter,ProductivityItem,ProductivityMetrics,productivityService} from '../../lib/productivityService';

const bucketOrder:ProductivityBucket[]=['Do Now','Overdue','Upcoming','Waiting'];
const bucketTone:Record<ProductivityBucket,string>={
  'Do Now':'border-blue-200 bg-blue-50 text-[#000080]',
  'Overdue':'border-red-200 bg-red-50 text-red-700',
  'Upcoming':'border-slate-200 bg-white text-slate-700',
  'Waiting':'border-amber-200 bg-amber-50 text-amber-700'
};
function fmt(value?:string|null){if(!value)return '';try{return new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));}catch{return '';}}

export default function ProductivityCommandCenter(){
  const nav=useNavigate();
  const {user,profile,isAdmin,loading:authLoading}=useAuth();
  const allowed=Boolean(user&&profile?.status==='active'&&!['customer','pending'].includes(profile.role));
  const [scope,setScope]=useState<'mine'|'team'>('mine');
  const [data,setData]=useState<CommandCenter|null>(null);
  const [metrics,setMetrics]=useState<ProductivityMetrics|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [running,setRunning]=useState('');
  const [showAll,setShowAll]=useState(false);
  const [dayClose,setDayClose]=useState(false);
  const [notes,setNotes]=useState('');
  const [tomorrow,setTomorrow]=useState('');
  const [savedClose,setSavedClose]=useState(false);

  const load=async()=>{setLoading(true);setError('');try{const [center,m]=await Promise.all([productivityService.getCommandCenter(scope),productivityService.getMetrics(7)]);setData(center);setMetrics(m);}catch(e:any){setError(e?.message||'Unable to load your priorities.');}finally{setLoading(false);}};
  useEffect(()=>{if(allowed)void load();},[allowed,scope]);
  const visible=useMemo(()=>showAll?(data?.items||[]):(data?.items||[]).slice(0,12),[data,showAll]);
  const grouped=useMemo(()=>Object.fromEntries(bucketOrder.map(b=>[b,visible.filter(i=>i.bucket===b)])) as Record<ProductivityBucket,ProductivityItem[]>,[visible]);

  if(authLoading)return <div className="min-h-screen bg-slate-50"/>;
  if(!allowed)return <Navigate to="/admin" replace/>;

  const act=async(item:ProductivityItem)=>{
    if(!item.quick){nav(item.actionUrl);return;}
    setRunning(item.itemKey);setError('');
    try{await productivityService.executeAction(item.actionKey,item.entityType,item.entityId);await load();}
    catch(e:any){setError(e?.message||'The action could not be completed.');}
    finally{setRunning('');}
  };
  const closeDay=async()=>{setRunning('day-close');setError('');try{await productivityService.completeDay(notes,tomorrow);setSavedClose(true);setDayClose(false);await load();}catch(e:any){setError(e?.message||'Unable to close the day.');}finally{setRunning('');}};

  const counts=data?.counts||{doNow:0,overdue:0,upcoming:0,waiting:0,total:0};
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3"><button onClick={()=>nav('/admin/workspace')} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50" aria-label="All apps"><ArrowLeft className="h-4 w-4"/></button><div><div className="flex items-center gap-2"><h1 className="text-xl font-black">Today</h1><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#000080]">Action Center</span></div><p className="text-xs text-slate-500">Work from the top. ProFox brings the next important action to you.</p></div></div>
        <div className="flex items-center gap-2">{isAdmin&&<div className="hidden rounded-xl border border-slate-200 bg-slate-50 p-1 sm:flex"><button onClick={()=>setScope('mine')} className={`rounded-lg px-3 py-1.5 text-[11px] font-black ${scope==='mine'?'bg-white text-[#000080] shadow-sm':'text-slate-500'}`}>My work</button><button onClick={()=>setScope('team')} className={`rounded-lg px-3 py-1.5 text-[11px] font-black ${scope==='team'?'bg-white text-[#000080] shadow-sm':'text-slate-500'}`}>Team exceptions</button></div>}<button onClick={()=>void load()} disabled={loading} className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/></button></div>
      </div>
    </header>
    <main className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8">
      {error&&<div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
      {savedClose&&<div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Day review saved. Tomorrow's focus is recorded.</div>}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Summary label="Do now" value={counts.doNow} icon={Target} tone="bg-blue-50 text-[#000080]"/><Summary label="Overdue" value={counts.overdue} icon={AlertCircle} tone="bg-red-50 text-red-700"/><Summary label="Upcoming" value={counts.upcoming} icon={Clock3} tone="bg-slate-100 text-slate-700"/><Summary label="Waiting" value={counts.waiting} icon={Layers3} tone="bg-amber-50 text-amber-700"/><button onClick={()=>setDayClose(true)} className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-left transition hover:-translate-y-0.5"><CheckCircle2 className="h-5 w-5 text-emerald-700"/><div className="mt-4 text-sm font-black text-emerald-900">Close my day</div><div className="mt-1 text-xs text-emerald-700">Review loose ends in under a minute.</div></button>
      </section>

      {loading&&!data?<div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>:<>
        <section className="mt-7 rounded-[2rem] border border-blue-200 bg-[linear-gradient(135deg,#000080,#10106f)] p-6 text-white shadow-xl shadow-blue-950/10 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-200"><Sparkles className="h-4 w-4"/> Focus first</div><h2 className="mt-2 text-2xl font-black">{data?.items[0]?.title||'Your queue is clear.'}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">{data?.items[0]?.subtitle||'No urgent work is waiting. Use the time for planned work instead of hunting through screens.'}</p></div>{data?.items[0]&&<button onClick={()=>void act(data.items[0])} disabled={running===data.items[0].itemKey} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-[#000080] disabled:opacity-60">{running===data.items[0].itemKey?<Loader2 className="h-4 w-4 animate-spin"/>:<ArrowRight className="h-4 w-4"/>}{data.items[0].actionLabel}</button>}</div>
        </section>

        <section className="mt-7 grid gap-6 xl:grid-cols-2">
          {bucketOrder.map(bucket=><div key={bucket} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-black">{bucket}</h3><p className="mt-1 text-xs text-slate-400">{grouped[bucket].length} visible item{grouped[bucket].length===1?'':'s'}</p></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${bucketTone[bucket]}`}>{bucket}</span></div>{grouped[bucket].length===0?<div className="rounded-2xl border border-dashed border-slate-200 p-7 text-center text-xs font-semibold text-slate-400">Nothing here.</div>:<div className="space-y-3">{grouped[bucket].map(item=><ActionRow key={item.itemKey} item={item} running={running===item.itemKey} onAction={()=>void act(item)} onFocus={()=>nav(`/admin/focus/${item.entityType}/${item.entityId}`)}/>)}</div>}</div>)}
        </section>
        {(data?.items.length||0)>12&&<div className="mt-6 text-center"><button onClick={()=>setShowAll(v=>!v)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">{showAll?'Show focused 12':`Show all ${data?.items.length}`}</button></div>}

        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black uppercase tracking-wider text-slate-400">7-day rhythm</div><h3 className="mt-1 text-lg font-black">Progress without vanity metrics</h3><p className="mt-1 text-xs text-slate-500">These numbers measure completed work, not screen time.</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{[['Actions',metrics?.actionsCompleted],['Activities',metrics?.activitiesCompleted],['Tasks',metrics?.projectTasksCompleted],['Meetings',metrics?.meetingsCompleted],['Day closes',metrics?.dayReviews]].map(([label,value])=><div key={String(label)} className="rounded-2xl bg-slate-50 px-4 py-3 text-center"><div className="text-xl font-black">{Number(value||0)}</div><div className="text-[10px] font-bold text-slate-400">{label}</div></div>)}</div></div></section>
      </>}
    </main>

    {dayClose&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-5 w-5"/></div><div><h3 className="text-xl font-black">Close the day</h3><p className="text-xs text-slate-500">Capture only what helps tomorrow. No long report.</p></div></div><label className="mt-6 block text-xs font-black text-slate-600">Anything important to remember?<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 p-3 text-sm outline-none focus:border-[#000080]" placeholder="Blockers, decisions, handoffs..."/></label><label className="mt-4 block text-xs font-black text-slate-600">Tomorrow's single main focus<textarea value={tomorrow} onChange={e=>setTomorrow(e.target.value)} rows={2} className="mt-2 w-full rounded-2xl border border-slate-200 p-3 text-sm outline-none focus:border-[#000080]" placeholder="The most important result for tomorrow"/></label><div className="mt-6 flex justify-end gap-2"><button onClick={()=>setDayClose(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600">Cancel</button><button onClick={()=>void closeDay()} disabled={running==='day-close'} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{running==='day-close'&&<Loader2 className="h-4 w-4 animate-spin"/>}Save & close day</button></div></div></div>}
  </div>;
}

function Summary({label,value,icon:Icon,tone}:{label:string;value:number;icon:any;tone:string}){return <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tone}`}><Icon className="h-5 w-5"/></div><div className="mt-4 text-3xl font-black">{value}</div><div className="mt-1 text-xs font-bold text-slate-500">{label}</div></div>}
function ActionRow({item,running,onAction,onFocus}:{item:ProductivityItem;running:boolean;onAction:()=>void;onFocus:()=>void}){return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex gap-3"><button onClick={onFocus} className="min-w-0 flex-1 text-left"><div className="truncate text-sm font-black text-slate-900">{item.title}</div><div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.subtitle}</div>{item.dueAt&&<div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-slate-400"><Clock3 className="h-3 w-3"/>{fmt(item.dueAt)}</div>}</button><button onClick={onAction} disabled={running} className="h-fit shrink-0 rounded-xl bg-white px-3 py-2 text-[10px] font-black text-[#000080] shadow-sm ring-1 ring-slate-200 hover:ring-blue-200 disabled:opacity-50">{running?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:item.actionLabel}</button></div></div>}
