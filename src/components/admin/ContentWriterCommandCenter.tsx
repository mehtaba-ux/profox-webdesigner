import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Banknote, CheckCircle2, Clock3, FileCheck2, Gauge, Loader2, MessageCircleQuestion, ShieldCheck, TrendingUp, WalletCards } from 'lucide-react';
import { format } from 'date-fns';
import { contentDeliveryService, WorkerCommandCenter } from '../../lib/contentDeliveryService';

const money = (amount: number, currency = 'USD') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount || 0));
const stageGroup = (stage: string) => {
  if (['Requested', 'Intake Validated', 'Strategy / Brief', 'Ready for Writing'].includes(stage)) return 'Brief';
  if (stage === 'Research') return 'Research';
  if (['Drafting', 'Writer Self-QA'].includes(stage)) return 'Writing';
  if (['SME / Fact Check', 'In-Context QA'].includes(stage)) return 'QA';
  if (['2i Editorial Review', 'SEO / Conversion Review', 'Ready for Client Review'].includes(stage)) return 'Review';
  if (['Client Approved', 'Ready for Implementation', 'Implemented', 'Approved for Publication', 'Published', 'Measured / Maintained'].includes(stage)) return 'Approved';
  if (stage === 'Blocked — Information Required') return 'Blocked';
  return 'Brief';
};

export default function ContentWriterCommandCenter({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const [data, setData] = useState<WorkerCommandCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scopeChanges, setScopeChanges] = useState<any[]>([]);
  const load = async () => {
    setLoading(true); setError('');
    try {
      const next = await contentDeliveryService.getMyCommandCenter();
      setData(next);
      setScopeChanges(await contentDeliveryService.getScopeChanges(next.assignments.map((assignment: any) => assignment.id)));
    }
    catch (e: any) { setError(e?.message || 'Unable to load project compensation information.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const priority = useMemo(() => data?.assignments.find((item: any) => !['Paid', 'Cancelled', 'Voided', 'Reversed'].includes(item.status)) || null, [data]);
  const attention = useMemo(() => (data?.assignments || []).filter((item: any) => item.status === 'Offered' || item.status === 'Clarification Requested' || item.status === 'Changes Required' || item.status === 'On Hold' || new Date(`${item.dueDate}T23:59:59`) < new Date()), [data]);
  const act = async (assignmentId: string, action: 'Accept' | 'Request Clarification') => {
    let message = '';
    if (action === 'Request Clarification') {
      message = window.prompt('What needs clarification before you accept this project?')?.trim() || '';
      if (!message) return;
    }
    setBusy(assignmentId); setError('');
    try { await contentDeliveryService.respondToAssignment(assignmentId, action, message); await load(); }
    catch (e: any) { setError(e?.message || 'Unable to update assignment.'); }
    finally { setBusy(''); }
  };
  const respondScope = async (change: any, accepted: boolean) => {
    const message = accepted ? '' : window.prompt('Why are you rejecting this scope change?')?.trim() || '';
    if (!accepted && !message) return;
    setBusy(change.id); setError('');
    try { await contentDeliveryService.respondToScopeChange(change.id, accepted, message); await load(); }
    catch (e: any) { setError(e?.message || 'Unable to respond to the scope change.'); }
    finally { setBusy(''); }
  };

  if (loading) return <div className="flex items-center justify-center rounded-3xl border border-slate-200 bg-white p-10"><Loader2 className="h-6 w-6 animate-spin text-[#000080]" /></div>;
  if (error && !data) return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">{error}</div>;
  if (!data) return null;
  const currency = priority?.currency || data.assignments[0]?.currency || data.config.defaultCurrency;

  return <div className="space-y-5">
    {error && <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-[#000080] to-[#00004f] p-5 text-white shadow-xl shadow-blue-950/10 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-200">Content Writer Command Center</div><h2 className="mt-2 text-xl font-black">Your work, quality and earnings</h2><p className="mt-1 text-xs text-blue-100">{data.workload.active} active project{data.workload.active === 1 ? '' : 's'} · {data.summary.needsAttention} need{data.summary.needsAttention === 1 ? 's' : ''} attention · {money(data.summary.payable, currency)} ready for payout</p></div>
        <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-blue-100"><Gauge className="h-4 w-4" />Workload</div><div className="mt-1 text-lg font-black">{data.workload.active} / {data.workload.limit}</div><div className="text-[10px] text-blue-100">{data.workload.active >= data.workload.limit ? 'Complete active work before starting another project.' : 'Capacity available'}</div></div>
      </div>
    </section>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric icon={<FileCheck2 />} label="Active Project Value" value={money(data.summary.activeValue, currency)} />
      <Metric icon={<Clock3 />} label="Waiting Approval" value={money(data.summary.waitingApproval, currency)} />
      <Metric icon={<WalletCards />} label="Ready for Payout" value={money(data.summary.payable, currency)} good />
      <Metric icon={<Banknote />} label="Paid This Month" value={money(data.summary.paidThisMonth, currency)} />
    </div>

    {priority ? <section className="rounded-[28px] border border-blue-100 bg-gradient-to-r from-blue-50 to-white p-5 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#000080]">Your next priority</div><h3 className="mt-1 text-lg font-black text-slate-900">{priority.projectName}</h3><p className="mt-1 text-xs text-slate-500">{scopeLabel(priority)} · {priority.status}</p><div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold"><Pill>Due {format(new Date(`${priority.dueDate}T00:00:00`), 'MMM d, yyyy')}</Pill><Pill>{money(priority.agreedFee, priority.currency)}</Pill><Pill>Quality {priority.qualityThreshold}+</Pill><Pill>{priority.includedRevisions} revisions included</Pill></div></div>
      <AssignmentActions assignment={priority} busy={busy} onAct={act} onOpenTask={onOpenTask} /></div>
      <Progress stage={priority.items?.[0]?.stage || priority.status} earned={priority.payoutStatus === 'Payable' || priority.payoutStatus === 'Paid'} />
    </section> : <Empty text="No active assignments. New approved projects will appear here." />}

    {attention.length > 0 && <section className="rounded-[28px] border border-amber-100 bg-white p-5"><div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-600" /><h3 className="text-sm font-black text-slate-900">Needs My Attention</h3></div><div className="mt-3 divide-y divide-slate-100">{attention.slice(0, 5).map((item: any) => <div key={item.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black text-slate-800">{item.projectName}</div><div className="mt-0.5 text-[10px] text-slate-500">{attentionLabel(item)}</div></div><AssignmentActions compact assignment={item} busy={busy} onAct={act} onOpenTask={onOpenTask} /></div>)}</div></section>}

    {scopeChanges.some(change => change.status === 'Pending Writer Acceptance') && <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-5"><div className="flex items-center gap-2"><MessageCircleQuestion className="h-4 w-4 text-amber-700"/><h3 className="text-sm font-black text-slate-900">Scope changes awaiting your decision</h3></div><div className="mt-3 space-y-3">{scopeChanges.filter(change => change.status === 'Pending Writer Acceptance').map(change => { const assignment=data.assignments.find((item:any)=>item.id===change.assignment_id); return <div key={change.id} className="rounded-2xl border border-amber-100 bg-white p-4"><div className="text-xs font-black">{assignment?.projectName || 'Project assignment'}</div><div className="mt-1 text-[10px] text-slate-600">{change.reason} · Additional fee {money(change.additional_fee_agreed,assignment?.currency||currency)}</div><div className="mt-3 flex gap-2"><button disabled={busy===change.id} onClick={()=>void respondScope(change,true)} className="rounded-xl bg-emerald-700 px-3 py-2 text-[10px] font-black text-white">Accept change</button><button disabled={busy===change.id} onClick={()=>void respondScope(change,false)} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-black text-red-700">Reject</button></div></div>})}</div></section>}

    <section className="rounded-[28px] border border-slate-200 bg-white p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-slate-900">Active Projects</h3><p className="mt-1 text-xs text-slate-500">Detailed PF-SOP-07 stages remain inside each Content Workspace.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black text-slate-600">{data.assignments.length} total</span></div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">{data.assignments.filter((a: any) => !['Paid','Cancelled','Voided','Reversed'].includes(a.status)).map((item: any) => <article key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-black text-slate-900">{item.projectName}</h4><p className="mt-1 text-[10px] text-slate-500">{scopeLabel(item)}</p></div><span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-[#000080]">{item.status}</span></div><div className="mt-3 grid grid-cols-3 gap-2"><Small label="Project Fee" value={money(item.agreedFee,item.currency)} /><Small label="Due" value={format(new Date(`${item.dueDate}T00:00:00`),'MMM d')} /><Small label="Quality" value={`${item.qualityThreshold}+`} /></div><Progress stage={item.items?.[0]?.stage || item.status} earned={item.payoutStatus === 'Payable'} /><div className="mt-3"><AssignmentActions compact assignment={item} busy={busy} onAct={act} onOpenTask={onOpenTask} /></div></article>)}</div>
    </section>

    <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-[28px] border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-[#000080]" /><h3 className="text-sm font-black">My Performance</h3></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"><Small label="Projects Completed" value={data.performance.projectsCompleted} /><Small label="On-Time" value={`${data.performance.onTimeRate}%`} /><Small label="Average Quality" value={`${data.performance.averageQuality}/100`} /><Small label="First-Pass" value={`${data.performance.firstPassRate}%`} /><Small label="Avg. Revisions" value={data.performance.averageRevisionRounds} /><Small label="Avg. Cycle" value={`${data.performance.averageCycleTimeDays} days`} /></div>{data.performance.qualityTrend?.length>0&&<div className="mt-3 flex items-center gap-2"><span className="text-[9px] font-black uppercase text-slate-400">Recent quality</span>{data.performance.qualityTrend.map((score,index)=><span key={index} className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700">{score}</span>)}</div>}<p className="mt-3 text-[10px] leading-4 text-slate-400">Performance comes from authoritative content reviews and verified delivery events. Verified external blocked time is excluded when configured.</p></section>
    <section className="rounded-[28px] border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><WalletCards className="h-4 w-4 text-emerald-700" /><h3 className="text-sm font-black">Earnings & Payouts</h3></div><button onClick={() => setHistoryOpen(v => !v)} className="text-[10px] font-black text-[#000080]">{historyOpen ? 'Hide history' : 'View history'}</button></div><p className="mt-2 text-xs text-slate-500">Potential project value, approved earnings and actual payouts remain clearly separated.</p><div className="mt-3 grid grid-cols-2 gap-2"><Small label="Due This Week" value={data.week.projectsDue}/><Small label="Potential This Week" value={money(data.week.potentialEarnings,currency)}/><Small label="Review Returned" value={data.week.reviewsReturned}/><Small label="Waiting Client" value={data.week.waitingClient}/></div>{historyOpen && <div className="mt-4 space-y-2">{data.earnings.length === 0 ? <div className="text-xs text-slate-400">No earnings yet.</div> : data.earnings.map((earning: any) => <div key={earning.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><div><div className="text-xs font-black">{earning.projectName}</div><div className="mt-0.5 text-[9px] text-slate-500">{earning.status}{earning.payout?.transactionReference ? ` · ${earning.payout.transactionReference}` : ''}</div></div><div className="text-xs font-black text-emerald-700">{money(earning.amount,earning.currency)}</div></div>)}</div>}</section></div>
  </div>;
}

function AssignmentActions({ assignment, busy, onAct, onOpenTask, compact = false }: any) {
  const taskId = assignment.items?.[0]?.taskId;
  if (assignment.status === 'Offered') return <div className="flex flex-wrap gap-2"><button disabled={busy === assignment.id} onClick={() => void onAct(assignment.id,'Accept')} className="rounded-xl bg-[#000080] px-3 py-2 text-[10px] font-black text-white disabled:opacity-50">{busy === assignment.id ? 'Saving…' : 'Accept Project'}</button><button disabled={busy === assignment.id} onClick={() => void onAct(assignment.id,'Request Clarification')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-600"><MessageCircleQuestion className="mr-1 inline h-3.5 w-3.5" />Clarify</button></div>;
  if (taskId && ['Accepted','In Progress','Changes Required','In Review','Approved','Earned','Scheduled for Payout'].includes(assignment.status)) return <button onClick={() => onOpenTask(taskId)} className={`inline-flex items-center gap-1 rounded-xl bg-[#000080] px-3 ${compact ? 'py-2' : 'py-2.5'} text-[10px] font-black text-white`}>{assignment.status === 'Changes Required' ? 'Review Feedback' : 'Continue Work'}<ArrowRight className="h-3.5 w-3.5" /></button>;
  return <span className="rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black text-slate-500">{assignment.status}</span>;
}
function Progress({ stage, earned }: { stage: string; earned: boolean }) { const steps=['Brief','Research','Writing','QA','Review','Approved','Earned']; const current=earned?6:Math.max(0,steps.indexOf(stageGroup(stage))); return <div className="mt-4 flex items-center gap-1">{steps.map((step,index)=><React.Fragment key={step}><div className={`rounded-full px-2 py-1 text-[8px] font-black ${index<=current?'bg-[#000080] text-white':'bg-slate-200 text-slate-500'}`}>{step}</div>{index<steps.length-1&&<div className={`h-px min-w-1 flex-1 ${index<current?'bg-[#000080]':'bg-slate-200'}`} />}</React.Fragment>)}</div>; }
function Metric({ icon,label,value,good=false }: any){return <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className={`h-4 w-4 ${good?'text-emerald-700':'text-[#000080]'}`}>{React.cloneElement(icon,{className:'h-4 w-4'})}</div><div className="mt-2 text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className={`mt-1 text-base font-black ${good?'text-emerald-700':'text-slate-900'}`}>{value}</div></div>}
function Small({label,value}:{label:string;value:any}){return <div className="rounded-xl bg-white p-2.5"><div className="text-[8px] font-black uppercase text-slate-400">{label}</div><div className="mt-1 text-xs font-black text-slate-800">{value}</div></div>}
function Pill({children}:{children:React.ReactNode}){return <span className="rounded-full border border-blue-100 bg-white px-2.5 py-1 text-[#000080]">{children}</span>}
function Empty({text}:{text:string}){return <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-slate-300"/><p className="mt-3 text-sm font-bold text-slate-600">{text}</p></div>}
function scopeLabel(item:any){const scopes=(item.items||[]).map((i:any)=>`${Number(i.quantity||1)} ${i.contentType}`).join(' + ');return scopes||item.package||'Content scope'}
function attentionLabel(item:any){if(item.status==='Offered')return `New assignment · ${money(item.agreedFee,item.currency)}`;if(item.status==='Changes Required')return 'Independent review returned changes';if(item.status==='On Hold')return 'Scope or payment decision is on hold';if(new Date(`${item.dueDate}T23:59:59`)<new Date())return 'Deadline overdue';return item.status}
