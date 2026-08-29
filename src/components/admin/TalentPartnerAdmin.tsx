import { FormEvent, useEffect, useState } from 'react';
import {
  BadgeDollarSign, BriefcaseBusiness, CheckCircle2, CircleDollarSign, FileText, Gift, Link2,
  Loader2, MousePointerClick, RefreshCw, Settings2, ShieldCheck, Trash2, UserCheck, Users, WalletCards
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { talentPartnerService, type TalentPartnerAdminData, type TalentPartnerStatus } from '../../lib/talentPartnerService';

const sections = [
  ['overview','Overview'],['partners','Partners'],['plans','Reward Plans'],['rewards','Rewards'],['projects','Project Rewards'],
  ['retention','Retention'],['payouts','Payouts'],['attribution','Attribution'],['resources','Resources'],['settings','Settings']
] as const;
type Section = typeof sections[number][0];
type SelectOption = readonly [string, string];
const option = (value: unknown, label: unknown): SelectOption => [String(value ?? ''), String(label ?? '')];

export default function TalentPartnerAdmin() {
  const [data,setData] = useState<TalentPartnerAdminData|null>(null);
  const [users,setUsers] = useState<any[]>([]);
  const [visits,setVisits] = useState<any[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [section,setSection] = useState<Section>('overview');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [main,userRows,visitRows] = await Promise.all([
        talentPartnerService.getAdminData(),
        supabase.from('user_profiles').select('id,full_name,email,status,role').order('full_name'),
        supabase.from('talent_partner_visits').select('id,partner_user_id,career_job_id,session_id,utm_source,referrer_host,occurred_at').order('occurred_at',{ascending:false}).limit(5000)
      ]);
      if (userRows.error) throw userRows.error;
      if (visitRows.error) throw visitRows.error;
      setData(main); setUsers(userRows.data || []); setVisits(visitRows.data || []);
    } catch (err:any) {
      setError(err?.message || 'Could not load Talent Partner administration.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const run = async (action:()=>Promise<any>, success:string) => {
    setMessage(''); setError('');
    try { await action(); setMessage(success); await load(); }
    catch (err:any) { setError(err?.message || 'Action failed.'); }
  };

  if (loading && !data) return <Loader/>;
  if (!data) return <div className="p-8"><Alert>{error || 'Talent Partner administration is unavailable.'}</Alert><button onClick={load} className="mt-4 btn-primary">Retry</button></div>;

  const activePartners = data.partners.filter(p=>p.status==='Active').length;
  const uniqueVisitors = new Set(visits.map(v=>v.session_id)).size;
  const pendingRewards = data.rewards.filter(r=>r.status==='Pending').reduce((a,r)=>a+Number(r.reward_amount||0),0);
  const paidRewards = data.rewards.filter(r=>r.status==='Paid').reduce((a,r)=>a+Number(r.reward_amount||0),0);

  return <div className="min-h-screen bg-[#f5f7fb] p-4 text-slate-900 sm:p-6 lg:p-8">
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div><div className="text-[10px] font-black uppercase tracking-[.16em] text-[#FF0E0E]">People & Talent</div><h1 className="mt-2 text-3xl font-black tracking-[-.04em] text-[#071126] sm:text-4xl">Talent Partner Management</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Control partner approval, attribution, job reward plans, first-three performance rewards, retention, project qualification and payouts without creating a parallel recruitment or sales system.</p></div>
        <button onClick={load} className="btn-light"><RefreshCw className="h-4 w-4"/>Refresh</button>
      </div>
      {(error||message) && <div className="mt-5">{error ? <Alert>{error}</Alert> : <Success>{message}</Success>}</div>}
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">{sections.map(([id,label])=><button key={id} onClick={()=>setSection(id)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-black ${section===id?'bg-[#000080] text-white':'border border-slate-200 bg-white text-slate-600'}`}>{label}</button>)}</div>
      <div className="mt-6">
        {section==='overview' && <Overview data={data} visits={visits} activePartners={activePartners} uniqueVisitors={uniqueVisitors} pendingRewards={pendingRewards} paidRewards={paidRewards}/>} 
        {section==='partners' && <Partners data={data} users={users} run={run}/>} 
        {section==='plans' && <Plans data={data} run={run}/>} 
        {section==='rewards' && <Rewards data={data} users={users} run={run}/>} 
        {section==='projects' && <ProjectRewards data={data} users={users} run={run}/>} 
        {section==='retention' && <Retention data={data} users={users} run={run}/>} 
        {section==='payouts' && <Payouts data={data} users={users} run={run}/>} 
        {section==='attribution' && <Attribution data={data} users={users} visits={visits} run={run}/>} 
        {section==='resources' && <Resources data={data} run={run}/>} 
        {section==='settings' && <ProgramSettings settings={data.settings} run={run}/>} 
      </div>
    </div>
  </div>;
}

function Overview({data,visits,activePartners,uniqueVisitors,pendingRewards,paidRewards}:{data:TalentPartnerAdminData;visits:any[];activePartners:number;uniqueVisitors:number;pendingRewards:number;paidRewards:number}) {
  const applications=data.referrals.length;
  const activated=data.referrals.filter(r=>['Activated','Retained'].includes(r.status)).length;
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6"><Kpi icon={Users} label="Partners" value={data.partners.length} detail={`${activePartners} active`}/><Kpi icon={MousePointerClick} label="Visits" value={visits.length} detail={`${uniqueVisitors} unique`}/><Kpi icon={FileText} label="Attributed applications" value={applications}/><Kpi icon={UserCheck} label="Activated hires" value={activated}/><Kpi icon={CircleDollarSign} label="Pending rewards" value={moneyNumber(pendingRewards)}/><Kpi icon={WalletCards} label="Paid rewards" value={moneyNumber(paidRewards)}/></div>
    <div className="grid gap-6 xl:grid-cols-2"><Panel title="Program architecture" icon={ShieldCheck}><div className="space-y-3 text-sm leading-6 text-slate-600"><Rule title="Recruitment stays canonical">Partner attribution attaches to the existing applicant record; it never creates a second candidate pipeline.</Rule><Rule title="Sales rewards stay server-authoritative">Only a backend-verified customer payment on each of the referred seller's first three distinct quotations can create a reward.</Rule><Rule title="Project rewards need real delivery">Content, Design and Development rewards require a completed project, worker assignment and an admin-approved payable amount.</Rule><Rule title="Retention is a separate gate">The final reward requires the configured retention period and an actual salary transition, including the existing Sales Career Progression flow.</Rule></div></Panel><Panel title="Current exposure" icon={BadgeDollarSign}><div className="grid gap-3 sm:grid-cols-2"><Mini label="Pending" value={moneyNumber(pendingRewards)}/><Mini label="Approved" value={moneyNumber(data.rewards.filter(r=>r.status==='Approved').reduce((a,r)=>a+Number(r.reward_amount||0),0))}/><Mini label="Paid" value={moneyNumber(paidRewards)}/><Mini label="Reversed" value={String(data.rewards.filter(r=>r.status==='Reversed').length)}/></div><p className="mt-4 text-[11px] leading-5 text-slate-500">Currency values may span multiple currencies. Use the reward and payout ledgers for exact currency-level accounting.</p></Panel></div>
  </div>;
}

function Partners({data,users,run}:{data:TalentPartnerAdminData;users:any[];run:any}) {
  const byId=Object.fromEntries(users.map(u=>[u.id,u]));
  const setStatus=(id:string,status:TalentPartnerStatus)=>run(()=>talentPartnerService.adminSetPartnerStatus(id,status),'Partner status updated.');
  return <Panel title="Talent Partner accounts" icon={Users}><div className="space-y-3">{data.partners.map(p=>{const u=byId[p.user_id]||{};return <div key={p.user_id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><div className="text-sm font-black text-slate-900">{u.full_name||'Talent Partner'} <span className="ml-1 text-xs font-bold text-[#000080]">{p.partner_code}</span></div><div className="mt-1 text-xs text-slate-500">{u.email||'—'} · Joined {date(p.created_at)}</div></div><div className="flex flex-wrap items-center gap-2"><Status value={p.status}/>{p.status!=='Active'&&p.status!=='Closed'&&<button onClick={()=>setStatus(p.user_id,'Active')} className="btn-primary">Approve</button>}{p.status==='Active'&&<button onClick={()=>setStatus(p.user_id,'Suspended')} className="btn-light">Suspend</button>}{p.status==='Suspended'&&<button onClick={()=>setStatus(p.user_id,'Active')} className="btn-primary">Reactivate</button>}{p.status!=='Closed'&&<button onClick={()=>setStatus(p.user_id,'Closed')} className="btn-danger">Close</button>}</div></div><div className="mt-4 grid gap-3 sm:grid-cols-4"><Mini label="Company" value={p.company_name||'—'}/><Mini label="Channels" value={(p.promotion_channels||[]).join(', ')||'—'}/><Mini label="Payout" value={p.payout_method||'Not set'}/><Mini label="Preferred currency" value={p.preferred_currency||'USD'}/></div></div>})}{!data.partners.length&&<Empty text="No Talent Partner registrations yet."/>}</div></Panel>;
}

function Plans({data,run}:{data:TalentPartnerAdminData;run:any}) {
  return <div className="space-y-5"><div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 text-sm leading-6 text-slate-600"><strong className="text-[#000080]">Financial safety:</strong> every job gets a reward-plan record automatically, but it is disabled by default. Configure the rule and explicitly enable it.</div>{data.jobs.map(job=><PlanEditor key={job.id} job={job} existing={data.plans.find(p=>p.career_job_id===job.id)} onSave={(plan:any)=>run(()=>talentPartnerService.adminSavePlan(job.id,plan),`${job.title} reward plan saved.`)}/>)}</div>;
}

function PlanEditor({job,existing,onSave}:{job:any;existing:any;onSave:any}) {
  const defaultModel=job.application_type==='sales_representative'?'sales':['content_writer'].includes(job.application_type)||['content_writer','uiux_designer','developer','web_developer','developer_designer'].includes(job.role_details?.systemRole)?'project':'none';
  const initialRules=Array.isArray(existing?.event_rewards)?existing.event_rewards:[];
  const [enabled,setEnabled]=useState(Boolean(existing?.enabled));
  const [model,setModel]=useState(existing?.reward_model||defaultModel);
  const [rules,setRules]=useState([1,2,3].map(rank=>{const found=initialRules.find((r:any)=>Number(r.rank)===rank)||{};return{rank,kind:found.kind==='fixed'?'fixed':'percent',ratePercent:Number(found.ratePercent||0),fixedAmount:Number(found.fixedAmount||0)}}));
  const [retEnabled,setRetEnabled]=useState(existing?.retention_enabled!==false);
  const [months,setMonths]=useState(Number(existing?.retention_months||6));
  const [retKind,setRetKind]=useState(existing?.retention_reward_kind||'fixed');
  const [retRate,setRetRate]=useState(Number(existing?.retention_rate_percent||0));
  const [retFixed,setRetFixed]=useState(Number(existing?.retention_fixed_amount||0));
  const [currency,setCurrency]=useState(existing?.currency||'USD');
  const [hold,setHold]=useState(existing?.payout_hold_days??'');
  const [busy,setBusy]=useState(false);
  const save=async()=>{setBusy(true);try{await onSave({enabled,rewardModel:model,qualifyingEventCount:3,eventRewards:rules,retentionEnabled:retEnabled,retentionMonths:months,retentionRewardKind:retKind,retentionRatePercent:retRate,retentionFixedAmount:retFixed,currency,payoutHoldDays:hold})}finally{setBusy(false)}};
  const patch=(rank:number,key:string,value:any)=>setRules(v=>v.map(r=>r.rank===rank?{...r,[key]:value}:r));
  return <Panel title={job.title} icon={Gift}><div className="grid gap-4 lg:grid-cols-4"><Toggle label="Reward plan enabled" checked={enabled} onChange={setEnabled}/><Select label="Reward model" value={model} onChange={setModel} options={[option('sales','Sales performance'),option('project','Completed projects'),option('none','No performance reward')]}/><Input label="Currency" value={currency} onChange={setCurrency}/><Input label="Payout hold days" type="number" value={hold} onChange={setHold} placeholder="Use program default"/></div><div className="mt-5 grid gap-3 md:grid-cols-3">{rules.map(rule=><div key={rule.rank} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black text-slate-900">{model==='project'?'Project':'Sale'} #{rule.rank}</div><select value={rule.kind} onChange={e=>patch(rule.rank,'kind',e.target.value)} className="input mt-3"><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select><input type="number" min="0" step="0.01" value={rule.kind==='fixed'?rule.fixedAmount:rule.ratePercent} onChange={e=>patch(rule.rank,rule.kind==='fixed'?'fixedAmount':'ratePercent',Number(e.target.value))} className="input mt-2"/><div className="mt-1 text-[10px] text-slate-400">{rule.kind==='fixed'?currency:'% of eligible amount'}</div></div>)}</div><div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/50 p-4"><div className="grid gap-4 lg:grid-cols-5"><Toggle label="Final retention reward" checked={retEnabled} onChange={setRetEnabled}/><Input label="Retention months" type="number" value={months} onChange={v=>setMonths(Number(v))}/><Select label="Reward type" value={retKind} onChange={setRetKind} options={[option('fixed','Fixed amount'),option('percent','% of monthly salary')]}/>{retKind==='fixed'?<Input label={`Final reward (${currency})`} type="number" value={retFixed} onChange={v=>setRetFixed(Number(v))}/>:<Input label="Final reward %" type="number" value={retRate} onChange={v=>setRetRate(Number(v))}/>}<div className="flex items-end"><button disabled={busy} onClick={save} className="btn-primary w-full">{busy?'Saving...':'Save plan'}</button></div></div></div></Panel>;
}

function Rewards({data,users,run}:{data:TalentPartnerAdminData;users:any[];run:any}) {
  const partnerName=(id:string)=>users.find(u=>u.id===id)?.full_name||id.slice(0,8);
  const jobName=(id:string)=>data.jobs.find(j=>j.id===id)?.title||'Job';
  return <Panel title="Talent Partner reward ledger" icon={BadgeDollarSign}><div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400"><th className="p-3">Partner</th><th className="p-3">Event</th><th className="p-3">Job</th><th className="p-3">Reward</th><th className="p-3">Available</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody>{data.rewards.map(r=><tr key={r.id} className="border-b border-slate-100"><td className="p-3 font-bold">{partnerName(r.partner_user_id)}</td><td className="p-3">{r.event_type==='retention'?'Retention':`${r.event_type} #${r.event_rank}`}</td><td className="p-3">{jobName(r.career_job_id)}</td><td className="p-3 font-black text-[#000080]">{money(r.reward_amount,r.currency)}</td><td className="p-3">{date(r.available_at)}</td><td className="p-3"><Status value={r.status}/></td><td className="p-3"><div className="flex gap-2">{r.status==='Pending'&&new Date(r.available_at)<=new Date()&&<button onClick={()=>run(()=>talentPartnerService.adminUpdateRewardStatus(r.id,'Approved'),'Reward approved.')} className="btn-primary">Approve</button>}{['Pending','Approved'].includes(r.status)&&<button onClick={()=>{const reason=window.prompt('Reason for reversal?')||'';if(reason)void run(()=>talentPartnerService.adminUpdateRewardStatus(r.id,'Reversed',reason),'Reward reversed.')}} className="btn-danger">Reverse</button>}</div></td></tr>)}</tbody></table>{!data.rewards.length&&<Empty text="No reward entries have been generated yet."/>}</div></Panel>;
}

function ProjectRewards({data,users,run}:{data:TalentPartnerAdminData;users:any[];run:any}) {
  const [referralId,setReferralId]=useState(''); const [projectId,setProjectId]=useState(''); const [amount,setAmount]=useState(''); const [currency,setCurrency]=useState('USD'); const [notes,setNotes]=useState('');
  const eligible=data.referrals.filter(r=>{const plan=data.plans.find(p=>p.career_job_id===r.career_job_id);return r.referred_user_id&&['Activated','Retained'].includes(r.status)&&plan?.enabled&&plan.reward_model==='project'});
  const selected=eligible.find(r=>r.id===referralId);
  const projects=selected?data.completedProjects.filter(p=>data.projectTeam.some(t=>t.project_id===p.id&&t.user_id===selected.referred_user_id)):[];
  const referralOptions:SelectOption[]=[option('','Select referral'),...eligible.map(r=>option(r.id,`${users.find(u=>u.id===r.referred_user_id)?.full_name||'Worker'} · ${data.jobs.find(j=>j.id===r.career_job_id)?.title||'Job'}`))];
  const projectOptions:SelectOption[]=[option('','Select project'),...projects.map(p=>option(p.id,`${p.project_number||''} ${p.project_name}`.trim()))];
  const submit=(e:FormEvent)=>{e.preventDefault();void run(()=>talentPartnerService.adminApproveProjectReward(referralId,projectId,Number(amount),currency,notes),'Qualifying project reward created.').then(()=>{setProjectId('');setAmount('');setNotes('')})};
  return <Panel title="Approve a qualifying project" icon={BriefcaseBusiness}><p className="mb-5 text-sm leading-6 text-slate-500">Only fully completed projects assigned to the referred worker can count. Enter the worker's approved payable amount—not total project revenue. A project can only count once for that referral.</p><form onSubmit={submit} className="grid gap-4 lg:grid-cols-2"><Select label="Activated project-based referral" value={referralId} onChange={v=>{setReferralId(v);setProjectId('')}} options={referralOptions}/><Select label="Completed assigned project" value={projectId} onChange={setProjectId} options={projectOptions}/><Input label="Approved worker payment amount" type="number" value={amount} onChange={setAmount}/><Input label="Currency" value={currency} onChange={setCurrency}/><div className="lg:col-span-2"><label className="label">Notes</label><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} className="input resize-y"/></div><div className="lg:col-span-2"><button disabled={!referralId||!projectId||Number(amount)<=0} className="btn-primary">Approve project reward</button></div></form></Panel>;
}

function Retention({data,users,run}:{data:TalentPartnerAdminData;users:any[];run:any}) {
  const [referralId,setReferralId]=useState(''); const [effective,setEffective]=useState(new Date().toISOString().slice(0,10)); const [salary,setSalary]=useState(''); const [currency,setCurrency]=useState('USD'); const [notes,setNotes]=useState('');
  const eligible=data.referrals.filter(r=>r.referred_user_id&&r.activated_at&&['Activated','Retained'].includes(r.status)&&data.plans.find(p=>p.career_job_id===r.career_job_id)?.retention_enabled);
  const workerOptions:SelectOption[]=[option('','Select worker'),...eligible.map(r=>option(r.id,`${users.find(u=>u.id===r.referred_user_id)?.full_name||'Worker'} · ${data.jobs.find(j=>j.id===r.career_job_id)?.title||'Job'} · activated ${date(r.activated_at)}`))];
  const submit=(e:FormEvent)=>{e.preventDefault();void run(()=>talentPartnerService.adminRecordSalaryTransition(referralId,effective,salary?Number(salary):null,currency,notes),'Salary transition recorded; the final reward will activate only when the configured retention date is reached.').then(()=>setNotes(''))};
  return <Panel title="Record salary transition" icon={UserCheck}><div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800"><strong>Sales note:</strong> the existing Sales Career Progression workflow automatically connects an Accepted salary proposal to Talent Partner retention. Use this form for project-based roles or a controlled administrative correction.</div><form onSubmit={submit} className="grid gap-4 lg:grid-cols-2"><Select label="Activated referred worker" value={referralId} onChange={setReferralId} options={workerOptions}/><Input label="Salary effective date" type="date" value={effective} onChange={setEffective}/><Input label="Monthly salary (optional for fixed final reward)" type="number" value={salary} onChange={setSalary}/><Input label="Currency" value={currency} onChange={setCurrency}/><div className="lg:col-span-2"><label className="label">Notes / approval reference</label><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} className="input resize-y"/></div><button disabled={!referralId||!effective} className="btn-primary">Record transition</button></form></Panel>;
}

function Payouts({data,users,run}:{data:TalentPartnerAdminData;users:any[];run:any}) {
  const [transactions,setTransactions]=useState<Record<string,string>>({});
  const name=(id:string)=>users.find(u=>u.id===id)?.full_name||'Partner';
  return <div className="space-y-6"><Panel title="Create payout batch" icon={WalletCards}><p className="text-sm leading-6 text-slate-500">Only Approved rewards whose hold period has ended and whose partner/currency total meets the configured minimum payout are included.</p><button onClick={()=>run(()=>talentPartnerService.adminCreatePayoutBatch(),'Payout batch created.')} className="btn-primary mt-4">Create payout batch</button></Panel><Panel title="Partner payouts"><div className="space-y-3">{data.payouts.map(p=><div key={p.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><div className="text-sm font-black text-slate-900">{name(p.partner_user_id)} · {money(p.amount,p.currency)}</div><div className="mt-1 text-xs text-slate-500">{p.entry_count} reward entries · {p.payout_method_snapshot||'method not set'}</div></div><Status value={p.status}/></div>{p.status==='Ready'&&<div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={transactions[p.id]||''} onChange={e=>setTransactions(v=>({...v,[p.id]:e.target.value}))} placeholder="Payment transaction/reference ID" className="input flex-1"/><button disabled={!transactions[p.id]?.trim()} onClick={()=>run(()=>talentPartnerService.adminMarkPayoutPaid(p.id,transactions[p.id]),'Payout marked paid.')} className="btn-primary">Confirm paid</button></div>}</div>)}{!data.payouts.length&&<Empty text="No Talent Partner payouts yet."/>}</div></Panel></div>;
}

function Attribution({data,users,visits,run}:{data:TalentPartnerAdminData;users:any[];visits:any[];run:any}) {
  const [applicantId,setApplicantId]=useState(''); const [partnerId,setPartnerId]=useState(''); const [reason,setReason]=useState('');
  const partnerName=(id:string)=>users.find(u=>u.id===id)?.full_name||'Partner'; const app=(id:string)=>data.applicants.find(a=>a.id===id); const job=(id:string)=>data.jobs.find(j=>j.id===id)?.title||'Job';
  const applicantOptions:SelectOption[]=[option('','Select applicant'),...data.applicants.map(a=>option(a.id,`${a.application_reference||''} · ${a.full_name}`))];
  const partnerOptions:SelectOption[]=[option('','Select partner'),...data.partners.map(p=>option(p.user_id,`${partnerName(p.user_id)} · ${p.partner_code}`))];
  const submit=(e:FormEvent)=>{e.preventDefault();void run(()=>talentPartnerService.adminOverrideReferral(applicantId,partnerId,reason),'Referral attribution updated with audit reason.').then(()=>setReason(''))};
  return <div className="space-y-6"><Panel title="Attribution audit" icon={Link2}><div className="grid gap-4 sm:grid-cols-3"><Mini label="Recorded visits" value={visits.length.toLocaleString()}/><Mini label="Unique browser sessions" value={new Set(visits.map(v=>v.session_id)).size.toLocaleString()}/><Mini label="Locked referrals" value={data.referrals.length.toLocaleString()}/></div><div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] uppercase text-slate-400"><th className="p-3">Partner</th><th className="p-3">Candidate</th><th className="p-3">Job</th><th className="p-3">Status</th><th className="p-3">Attributed</th><th className="p-3">Override</th></tr></thead><tbody>{data.referrals.map(r=><tr key={r.id} className="border-b border-slate-100"><td className="p-3">{partnerName(r.partner_user_id)}</td><td className="p-3">{app(r.applicant_id)?.full_name||app(r.applicant_id)?.application_reference||'Applicant'}</td><td className="p-3">{job(r.career_job_id)}</td><td className="p-3"><Status value={r.status}/></td><td className="p-3">{date(r.attributed_at)}</td><td className="p-3 text-slate-500">{r.overridden_at?`Yes · ${date(r.overridden_at)}`:'First-touch lock'}</td></tr>)}</tbody></table></div></Panel><Panel title="Controlled attribution override" icon={ShieldCheck}><p className="mb-4 text-xs leading-5 text-slate-500">Use only to correct documented attribution disputes. Ownership cannot be changed after financial reward activity exists, and a clear reason is mandatory.</p><form onSubmit={submit} className="grid gap-4 lg:grid-cols-2"><Select label="Applicant" value={applicantId} onChange={setApplicantId} options={applicantOptions}/><Select label="Talent Partner" value={partnerId} onChange={setPartnerId} options={partnerOptions}/><div className="lg:col-span-2"><label className="label">Reason (minimum 10 characters)</label><textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} className="input resize-y"/></div><button disabled={!applicantId||!partnerId||reason.trim().length<10} className="btn-primary">Apply audited override</button></form></Panel></div>;
}

function Resources({data,run}:{data:TalentPartnerAdminData;run:any}) {
  const [title,setTitle]=useState(''); const [type,setType]=useState('copy'); const [jobId,setJobId]=useState(''); const [content,setContent]=useState(''); const [url,setUrl]=useState('');
  const jobOptions:SelectOption[]=[option('','All jobs'),...data.jobs.map(j=>option(j.id,j.title))];
  const create=(e:FormEvent)=>{e.preventDefault();void run(async()=>{const{error}=await supabase.from('talent_partner_resources').insert({career_job_id:jobId||null,title,resource_type:type,content:content||null,resource_url:url||null,enabled:true});if(error)throw error},'Partner resource published.').then(()=>{setTitle('');setContent('');setUrl('')})};
  const remove=(id:string)=>run(async()=>{const{error}=await supabase.from('talent_partner_resources').delete().eq('id',id);if(error)throw error},'Resource removed.');
  return <div className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]"><Panel title="Publish partner resource" icon={FileText}><form onSubmit={create} className="space-y-4"><Input label="Title" value={title} onChange={setTitle}/><Select label="Related job" value={jobId} onChange={setJobId} options={jobOptions}/><Select label="Type" value={type} onChange={setType} options={[option('copy','Approved copy'),option('guide','Guide'),option('creative_link','Creative link')]}/><div><label className="label">Content</label><textarea value={content} onChange={e=>setContent(e.target.value)} rows={5} className="input resize-y"/></div><Input label="Resource URL (optional)" value={url} onChange={setUrl}/><button disabled={!title.trim()} className="btn-primary">Publish resource</button></form></Panel><Panel title="Current partner resources" icon={Gift}><div className="space-y-3">{data.resources.map(r=><div key={r.id} className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4"><div><div className="text-sm font-black text-slate-900">{r.title}</div><div className="mt-1 text-xs text-slate-500">{r.resource_type} · {r.career_job_id?data.jobs.find(j=>j.id===r.career_job_id)?.title:'All jobs'}</div></div><button onClick={()=>remove(r.id)} className="rounded-lg border border-red-200 p-2 text-red-600"><Trash2 className="h-4 w-4"/></button></div>)}{!data.resources.length&&<Empty text="No promotion resources have been published yet."/>}</div></Panel></div>;
}

function ProgramSettings({settings,run}:{settings:any;run:any}) {
  const [enabled,setEnabled]=useState(settings.enabled!==false); const [windowDays,setWindowDays]=useState(Number(settings.attribution_window_days||30)); const [hold,setHold]=useState(Number(settings.payout_hold_days||14)); const [min,setMin]=useState(Number(settings.minimum_payout||0)); const [currency,setCurrency]=useState(settings.default_currency||'USD'); const [approval,setApproval]=useState(settings.require_admin_approval!==false); const [terms,setTerms]=useState(settings.terms_version||'2026-08-29');
  const save=(e:FormEvent)=>{e.preventDefault();void run(()=>talentPartnerService.adminSaveSettings({enabled,attributionWindowDays:windowDays,payoutHoldDays:hold,minimumPayout:min,defaultCurrency:currency,requireAdminApproval:approval,termsVersion:terms}),'Talent Partner program settings saved.')};
  return <Panel title="Program settings" icon={Settings2}><form onSubmit={save} className="grid gap-4 lg:grid-cols-2"><Toggle label="Talent Partner registration & tracking enabled" checked={enabled} onChange={setEnabled}/><Toggle label="Admin approval required" checked={approval} onChange={setApproval}/><Input label="Attribution window (days)" type="number" value={windowDays} onChange={v=>setWindowDays(Number(v))}/><Input label="Default payout hold (days)" type="number" value={hold} onChange={v=>setHold(Number(v))}/><Input label="Minimum payout" type="number" value={min} onChange={v=>setMin(Number(v))}/><Input label="Default currency" value={currency} onChange={setCurrency}/><Input label="Terms version" value={terms} onChange={setTerms}/><div className="flex items-end"><button className="btn-primary">Save program settings</button></div></form></Panel>;
}

function Kpi({icon:Icon,label,value,detail}:{icon:any;label:string;value:any;detail?:string}){return <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</span><Icon className="h-4 w-4 text-[#000080]"/></div><div className="mt-2 text-2xl font-black text-[#071126]">{value}</div>{detail&&<div className="mt-1 text-[10px] text-slate-500">{detail}</div>}</div>}
function Panel({title,icon:Icon,children}:{title:string;icon?:any;children:any}){return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">{title}</h2>{Icon&&<Icon className="h-4 w-4 text-[#000080]"/>}</div>{children}</section>}
function Rule({title,children}:{title:string;children:any}){return <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"/><div><strong className="text-slate-900">{title}.</strong> {children}</div></div>}
function Mini({label,value}:{label:string;value:any}){return <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 break-words text-xs font-bold text-slate-700">{value}</div></div>}
function Input({label,value,onChange,type='text',placeholder}:{label:string;value:any;onChange:(v:string)=>void;type?:string;placeholder?:string}){return <label><span className="label">{label}</span><input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="input"/></label>}
function Select({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:readonly SelectOption[]}){return <label><span className="label">{label}</span><select value={value} onChange={e=>onChange(e.target.value)} className="input">{options.map(([v,l],index)=><option key={`${v}-${index}`} value={v}>{l}</option>)}</select></label>}
function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}){return <label className="flex min-h-[68px] cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><span className="text-xs font-black text-slate-700">{label}</span><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} className="h-5 w-5 accent-[#000080]"/></label>}
function Status({value}:{value:string}){const v=String(value||'');const l=v.toLowerCase();const c=l.includes('active')||l.includes('paid')||l.includes('approved')||l.includes('retained')?'border-emerald-200 bg-emerald-50 text-emerald-700':l.includes('closed')||l.includes('reversed')||l.includes('suspend')?'border-red-200 bg-red-50 text-red-700':'border-amber-200 bg-amber-50 text-amber-700';return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${c}`}>{v}</span>}
function Alert({children}:{children:any}){return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{children}</div>}
function Success({children}:{children:any}){return <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{children}</div>}
function Empty({text}:{text:string}){return <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-7 text-center text-sm text-slate-500">{text}</div>}
function Loader(){return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>}
function date(v?:string){if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})}
function money(v:any,currency='USD'){try{return new Intl.NumberFormat(undefined,{style:'currency',currency}).format(Number(v||0))}catch{return`${currency} ${Number(v||0).toFixed(2)}`}}
function moneyNumber(v:number){return Number(v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
