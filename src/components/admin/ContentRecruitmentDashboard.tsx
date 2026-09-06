import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, BriefcaseBusiness, CheckCircle2, ExternalLink, FileSignature, Loader2, RefreshCw, ShieldCheck, UserCheck, XCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { applicantService, type ApplicantRecord, type ApplicantReviewSnapshot } from '../../lib/applicantService';
import { careerService, type CareerJob } from '../../lib/careerService';
import { recruitmentWorkflowService, type RecruitmentAssessment, type RecruitmentInterview, type RecruitmentStagePolicy } from '../../lib/recruitmentWorkflowService';
import { profileService } from '../../lib/profileService';
import { agreementService } from '../../lib/agreementService';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import ContentPracticalReviewPanel from './ContentPracticalReviewPanel';
import ContentPortfolioTaskControls from './ContentPortfolioTaskControls';

const CONTENT_REFUSAL_REASONS = [
  'Video / Resume Review Below Requirement','Insufficient Content Writing Experience','Portfolio Quality Below Requirement','Written English Below Requirement',
  'Content Assessment Failed','Project-Based Agreement Declined','Content Academy Failed','Practical Certification Failed',
  'Availability Below Requirement','Equipment/Internet Issue','Unresponsive','Incorrect Information','Duplicate Application','Other'
];

const CONTENT_STAGE_LABELS: Record<string,string> = {
  'New Application':'Application',
  'Video & Resume Review':'Video & Resume Review',
  'Portfolio Review':'Portfolio Review',
  'Content Assessment':'Content Assessment',
  'Selected':'Conditional Selected',
  'Agreement Pending':'Project Agreement',
  'Content Academy':'Content Academy',
  'Practical Certification':'Practical Certification',
  'Final Approval':'Final Approval',
  'Ready for System Access':'System Access',
  'Activated':'Activated',
};

type PortfolioCase = {
  projectTitle?:string; industry?:string; contentType?:string; briefProblem?:string; contribution?:string;
  researchProcess?:string; resultOutcome?:string; sampleUrl?:string;
};

type RecruitmentTask = {
  id:string; stage:string; attemptNo:number; maxAttempts?:number; status:string; title:string; requiredItems:number;
  issuedAt?:string; dueAt?:string; viewedAt?:string; firstSavedAt?:string; lastSavedAt?:string;
  submittedAt?:string; reviewedAt?:string; retryFeedback?:string; finalData?:{portfolioCases?:PortfolioCase[]}|null;
};

const stageLabel = (stage:string) => CONTENT_STAGE_LABELS[stage] || stage;

export default function ContentRecruitmentDashboard(){
  const {user,isAdmin}=useAuth();
  const [searchParams]=useSearchParams();
  const [job,setJob]=useState<CareerJob|null>(null);
  const [applicants,setApplicants]=useState<ApplicantRecord[]>([]);
  const [policies,setPolicies]=useState<RecruitmentStagePolicy[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [snapshot,setSnapshot]=useState<ApplicantReviewSnapshot|null>(null);
  const [assessments,setAssessments]=useState<RecruitmentAssessment[]>([]);
  const [interviews,setInterviews]=useState<RecruitmentInterview[]>([]);
  const [tasks,setTasks]=useState<RecruitmentTask[]>([]);
  const [linkedProfile,setLinkedProfile]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [search,setSearch]=useState('');
  const [stageFilter,setStageFilter]=useState('All');

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const [jobRow,rows]=await Promise.all([careerService.getPublicJobBySlug('content-writer'),applicantService.getApplicants()]);
      if(!jobRow)throw new Error('The Content Creator job configuration is unavailable.');
      const contentRows=rows.filter(row=>row.applicationType==='content_writer'||row.careerJobSlug==='content-writer');
      const policyRows=await recruitmentWorkflowService.getStagePolicies(jobRow.id);
      const requested=searchParams.get('applicantId')||'';
      setJob(jobRow);setApplicants(contentRows);setPolicies(policyRows);
      setSelectedId(current=>{
        if(requested&&contentRows.some(row=>row.id===requested))return requested;
        if(current&&contentRows.some(row=>row.id===current))return current;
        return contentRows[0]?.id||'';
      });
    }catch(err:any){setError(err?.message||'Content Creator recruitment could not be loaded.');}
    finally{setLoading(false)}
  };

  useEffect(()=>{void load()},[]);
  const selected=useMemo(()=>applicants.find(row=>row.id===selectedId)||null,[applicants,selectedId]);

  useEffect(()=>{
    if(!selected){setSnapshot(null);setAssessments([]);setInterviews([]);setTasks([]);setLinkedProfile(null);return;}
    void (async()=>{
      try{
        const [s,a,i,t]=await Promise.all([
          applicantService.getApplicantReviewSnapshot(selected.id),
          recruitmentWorkflowService.getAssessments(selected.id),
          recruitmentWorkflowService.getInterviews(selected.id),
          supabase.rpc('admin_get_recruitment_tasks',{p_applicant_id:selected.id}),
        ]);
        if(t.error)throw t.error;
        setSnapshot(s);setAssessments(a);setInterviews(i);setTasks(Array.isArray(t.data)?t.data:[]);
        if(selected.linkedUserId){const {data}=await profileService.getProfile(selected.linkedUserId);setLinkedProfile(data)}else setLinkedProfile(null);
      }catch(err:any){setError(err?.message||'Candidate evidence could not be loaded.');}
    })();
  },[selected?.id,selected?.stage,selected?.linkedUserId]);

  const orderedStages=useMemo(()=>[...policies].filter(p=>p.active).sort((a,b)=>a.sortOrder-b.sortOrder).map(p=>p.stage),[policies]);
  const filtered=applicants.filter(a=>(stageFilter==='All'||a.stage===stageFilter)&&(`${a.fullName} ${a.email} ${a.applicationReference||''}`.toLowerCase().includes(search.toLowerCase())));
  const currentPolicy=selected?policies.find(p=>p.stage===selected.stage):undefined;
  const latestAssessment=selected?assessments.find(a=>a.stage===selected.stage):undefined;
  const stageInterviews=selected?interviews.filter(i=>i.stage===selected.stage):[];
  const interviewComplete=stageInterviews.some(i=>i.status==='Completed');
  const selectedStage=selected?String(selected.stage):'';
  const manualStages=['Selected','Agreement Pending','Content Academy','Practical Certification','Final Approval','Ready for System Access','Activated'];
  const canAdvance=Boolean(selected&&!manualStages.includes(selectedStage)&&(!currentPolicy?.assessmentRequired||latestAssessment?.status==='Passed')&&(!currentPolicy?.interviewRequired||interviewComplete));
  const portfolioTask=tasks.find(task=>task.stage==='Portfolio Review'&&(task.finalData?.portfolioCases||task.title?.toLowerCase().includes('portfolio')))||null;

  const run=async(action:()=>Promise<any>,success:string)=>{setBusy(true);setError('');setNotice('');try{await action();setNotice(success);await load()}catch(err:any){setError(err?.message||'The protected action could not be completed.')}finally{setBusy(false)}};

  if(loading&&!job)return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]"/></div>;

  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-[#000080]">Content Team · Recruitment</div><h1 className="mt-1 text-2xl font-black text-slate-900">Content Creator Hiring Pipeline</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Application → evidence review → project agreement → Content Academy → independent practical certification → Final Approval → System Access → Activation.</p></div><button onClick={()=>void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600"><RefreshCw className="h-4 w-4"/>Refresh</button></div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Candidates" value={applicants.length}/><Metric label="In Review" value={applicants.filter(a=>!['Content Academy','Practical Certification','Final Approval','Ready for System Access','Activated'].includes(String(a.stage))&&!a.refusalReason).length}/><Metric label="Onboarding" value={applicants.filter(a=>['Content Academy','Practical Certification','Final Approval','Ready for System Access'].includes(String(a.stage))).length}/><Metric label="Activated" value={applicants.filter(a=>a.stage==='Activated').length}/></div>
    </section>

    {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700"><AlertCircle className="mr-2 inline h-4 w-4"/>{error}</div>}
    {notice&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-700"><CheckCircle2 className="mr-2 inline h-4 w-4"/>{notice}</div>}

    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search candidate..." className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs outline-none focus:border-[#000080]"/><select value={stageFilter} onChange={e=>setStageFilter(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold"><option value="All">All stages</option>{orderedStages.map(stage=><option key={stage} value={stage}>{stageLabel(stage)}</option>)}</select></div>
        <div className="max-h-[760px] divide-y divide-slate-100 overflow-y-auto">{filtered.length===0?<div className="p-8 text-center text-xs text-slate-400">No Content Creator candidates match this view.</div>:filtered.map(a=><button key={a.id} onClick={()=>setSelectedId(a.id)} className={`w-full p-4 text-left transition ${selectedId===a.id?'bg-blue-50':'hover:bg-slate-50'}`}><div className="flex items-start justify-between gap-2"><div><div className="text-sm font-black text-slate-900">{a.fullName}</div><div className="mt-0.5 text-[11px] text-slate-500">{a.email}</div></div><StageBadge stage={String(a.stage)} closed={Boolean(a.refusalReason)}/></div><div className="mt-3 flex items-center justify-between text-[10px] font-bold text-slate-400"><span>{a.applicationReference||'Application'}</span><span>{a.availableHoursPerWeek||0}h/week</span></div></button>)}</div>
      </section>

      {!selected?<section className="rounded-[28px] border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-400">Select a candidate to review the connected workflow.</section>:<CandidateDetail key={`${selected.id}-${selected.stage}`} applicant={selected} snapshot={snapshot} policy={currentPolicy} latestAssessment={latestAssessment} interviews={stageInterviews} linkedProfile={linkedProfile} portfolioTask={portfolioTask} busy={busy} canAdvance={canAdvance} isAdmin={isAdmin} onRefresh={load} onAdvance={()=>run(()=>recruitmentWorkflowService.advanceStage(selected.id),'Candidate moved to the next valid Content Creator stage.')} onIssueAgreement={()=>run(()=>agreementService.issue(selected.id),'Project-based Content Creator agreement issued securely.')} onSendAccess={()=>run(()=>recruitmentWorkflowService.sendAcademyAccess(selected.id),'Content Academy access sent securely.')} onApproveFinal={()=>run(async()=>{const {error}=await supabase.rpc('approve_content_writer_final',{p_applicant_id:selected.id});if(error)throw error;},'Final Approval granted. Candidate is ready for system access.')} onActivate={()=>run(async()=>{const {error}=await supabase.rpc('activate_content_writer',{p_applicant_id:selected.id});if(error)throw error;},'Content Creator activated successfully.')} onAssess={(input)=>run(()=>recruitmentWorkflowService.recordAssessment({applicantId:selected.id,stage:String(selected.stage),...input}),input.status==='Passed'?'Structured assessment passed.':input.status==='Failed'?'Final portfolio attempt marked failed.':'Revision requested and secure retry prepared where applicable.')} onSchedule={(input)=>run(()=>recruitmentWorkflowService.scheduleInterview({applicantId:selected.id,interviewerId:user?.id||null,...input}),'Content Creator interview scheduled.')} onCompleteInterview={(id,notes)=>run(()=>recruitmentWorkflowService.updateInterview({interviewId:id,status:'Completed',outcomeNotes:notes}),'Interview marked complete.')} onClose={(reason,notes)=>run(()=>recruitmentWorkflowService.closeApplicant(selected.id,reason,notes),'Candidate workflow closed and onboarding access handled.')}/>} 
    </div>
  </div>;
}

function CandidateDetail({applicant,snapshot,policy,latestAssessment,interviews,linkedProfile,portfolioTask,busy,canAdvance,isAdmin,onRefresh,onAdvance,onIssueAgreement,onSendAccess,onApproveFinal,onActivate,onAssess,onSchedule,onCompleteInterview,onClose}:any){
  const answers=applicant.applicationAnswers||{};
  const [scores,setScores]=useState<Record<string,number>>({});
  const [evidence,setEvidence]=useState('');
  const [evidenceUrl,setEvidenceUrl]=useState('');
  const [assessmentNotes,setAssessmentNotes]=useState('');
  const [dateTime,setDateTime]=useState('');
  const [meetingUrl,setMeetingUrl]=useState('');
  const [interviewNotes,setInterviewNotes]=useState('');
  const [closeReason,setCloseReason]=useState(CONTENT_REFUSAL_REASONS[0]);
  const [closeNotes,setCloseNotes]=useState('');
  const total=(policy?.rubric||[]).reduce((sum:number,item:any)=>sum+Math.max(0,Number(item.maxPoints||0)),0);
  const earned=(policy?.rubric||[]).reduce((sum:number,item:any)=>sum+Math.min(Number(item.maxPoints||0),Math.max(0,Number(scores[item.key]||0))),0);
  const score=total?Math.round(earned/total*100):0;
  const latestInterview=interviews[0];
  const agreementSigned=String(applicant.agreementStatus||'').toLowerCase()==='signed';
  const portfolioCases:PortfolioCase[]=Array.isArray(portfolioTask?.finalData?.portfolioCases)?portfolioTask.finalData.portfolioCases:[];
  const portfolioAttempt=Number(portfolioTask?.attemptNo||1);
  const portfolioMaxAttempts=Number(portfolioTask?.maxAttempts||2);
  const isFinalPortfolioAttempt=applicant.stage==='Portfolio Review'&&portfolioAttempt>=portfolioMaxAttempts;

  const review=(status:'Passed'|'Retry Required'|'Failed')=>{
    if(status!=='Passed'&&assessmentNotes.trim().length<10)return;
    if(status==='Failed'&&!window.confirm('Mark this final Portfolio Review attempt as failed? This decision will be recorded in the recruitment audit trail.'))return;
    const recordedScore=status==='Passed'?score:Math.min(score,Math.max(0,(policy?.passingScore||1)-1));
    void onAssess({status,score:recordedScore,rubricScores:scores,criticalFailures:[],evidence,evidenceUrl,notes:assessmentNotes});
  };

  return <section className="space-y-5">
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="text-[10px] font-black uppercase tracking-[.16em] text-[#000080]">{applicant.applicationReference||'Content application'}</div><h2 className="mt-1 text-xl font-black text-slate-900">{applicant.fullName}</h2><p className="mt-1 text-xs text-slate-500">{applicant.email} · {applicant.country||'Location not recorded'}</p></div><StageBadge stage={String(applicant.stage)} closed={Boolean(applicant.refusalReason)}/></div><div className="mt-5 grid gap-3 sm:grid-cols-4"><Info label="Weekly capacity" value={`${applicant.availableHoursPerWeek||0} hours`}/><Info label="Agreement" value={agreementSigned?'Verified & signed':String(applicant.agreementStatus||'Not issued')}/><Info label="Account" value={linkedProfile?`${linkedProfile.status} · ${linkedProfile.role}`:'Not provisioned'}/><Info label="Onboarding" value={`${applicant.onboardingProgress||0}%`}/></div></div>

    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#000080]"/><h3 className="text-sm font-black">Application readiness</h3></div><div className="mt-4 flex items-center gap-3"><div className="text-2xl font-black text-slate-900">{snapshot?.completenessPercent??0}%</div><div className="text-xs text-slate-500">{snapshot?.passedChecks??0} of {snapshot?.totalChecks??0} required evidence checks ready</div></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{(snapshot?.checks||[]).map((check:any)=><div key={check.key} className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${check.passed?'border-emerald-100 bg-emerald-50 text-emerald-800':'border-amber-100 bg-amber-50 text-amber-800'}`}>{check.passed?<CheckCircle2 className="h-4 w-4 shrink-0"/>:<AlertCircle className="h-4 w-4 shrink-0"/>}<span><strong>{check.label}</strong>{check.detail&&<span className="block text-[10px] opacity-70">{check.detail}</span>}</span></div>)}</div><div className="mt-4 flex flex-wrap gap-2">{applicant.cvStoragePath&&<SecureAsset path={applicant.cvStoragePath} label="Open secure CV"/>}{applicant.videoStoragePath&&<SecureAsset path={applicant.videoStoragePath} label="Open introduction video"/>}{!applicant.videoStoragePath&&applicant.videoUrl&&<a href={applicant.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-700">Open introduction video <ExternalLink className="h-3.5 w-3.5"/></a>}</div></div>

    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-sm font-black">Application responses</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><Evidence label="Content experience" value={answers.contentExperience}/><Evidence label="Research approach" value={answers.researchApproach}/><Evidence label="Quality process" value={answers.qualityProcess}/><Evidence label="Skills / tools" value={answers.skills}/><Evidence label="Weekly availability" value={applicant.weeklyAvailability}/><Evidence label="Motivation" value={applicant.motivation}/></div></div>

    {portfolioTask&&<div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-[10px] font-black uppercase tracking-[.14em] text-[#000080]">Secure portfolio evidence</div><h3 className="mt-1 text-sm font-black">{portfolioTask.title||'Three-case-study Portfolio Review'}</h3></div><StageBadge stage={`${portfolioTask.status} · Attempt ${portfolioTask.attemptNo||1}`}/></div>{portfolioTask.retryFeedback&&<div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"><strong>Retry feedback:</strong> {portfolioTask.retryFeedback}</div>}<ContentPortfolioTaskControls task={portfolioTask} isAdmin={Boolean(isAdmin)} onChanged={onRefresh}/>{portfolioCases.length?<div className="mt-4 grid gap-4">{portfolioCases.map((item,index)=><div key={index} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-[9px] font-black uppercase text-slate-400">Case study {index+1}</div><div className="mt-1 text-sm font-black text-slate-900">{item.projectTitle||'Untitled project'}</div><div className="mt-1 text-[11px] text-slate-500">{item.industry||'Industry not supplied'} · {item.contentType||'Content type not supplied'}</div></div>{item.sampleUrl&&<a href={item.sampleUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-black text-[#000080]">Open sample <ExternalLink className="h-3.5 w-3.5"/></a>}</div><div className="mt-4 grid gap-3 lg:grid-cols-2"><Evidence label="Brief / problem" value={item.briefProblem}/><Evidence label="Candidate contribution" value={item.contribution}/><Evidence label="Research process" value={item.researchProcess}/><Evidence label="Result / impact" value={item.resultOutcome}/></div></div>)}</div>:<div className="mt-4 rounded-2xl border border-dashed border-slate-200 p-5 text-xs text-slate-400">Portfolio task status: {portfolioTask.status}. Submitted case studies will appear here for scoring.</div>}</div>}

    {policy?.assessmentRequired&&<div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><div className="text-[10px] font-black uppercase text-[#000080]">Structured assessment</div><h3 className="mt-1 text-sm font-black">{stageLabel(String(applicant.stage))}</h3></div>{latestAssessment&&<StageBadge stage={`${latestAssessment.status} · ${latestAssessment.score}%`} closed={latestAssessment.status==='Failed'}/>}</div><div className="mt-5 grid gap-3 sm:grid-cols-2">{(policy.rubric||[]).map((item:any)=><label key={item.key} className="rounded-xl border border-slate-200 p-3 text-xs font-bold text-slate-700">{item.label}<span className="ml-1 text-slate-400">/ {item.maxPoints}</span><input type="number" min={0} max={item.maxPoints} value={scores[item.key]??''} onChange={e=>setScores(s=>({...s,[item.key]:Number(e.target.value)}))} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2"/></label>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><input value={evidenceUrl} onChange={e=>setEvidenceUrl(e.target.value)} placeholder="Evidence / work URL" className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs"/><input value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="Evidence summary" className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs"/></div><textarea value={assessmentNotes} onChange={e=>setAssessmentNotes(e.target.value)} rows={3} placeholder="Reviewer notes (required for retry or fail)" className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-xs"/><div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs font-black text-slate-600">Calculated score: {score}% · pass {policy.passingScore??0}%</span><div className="flex gap-2">{applicant.stage==='Portfolio Review'&&isFinalPortfolioAttempt?<button disabled={busy||assessmentNotes.trim().length<10} onClick={()=>review('Failed')} className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-black text-red-700 disabled:opacity-40">Fail Portfolio Review</button>:<button disabled={busy||assessmentNotes.trim().length<10} onClick={()=>review('Retry Required')} className="rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-xs font-black text-amber-700 disabled:opacity-40">{applicant.stage==='Portfolio Review'?'Request Revision':'Require Retry'}</button>}<button disabled={busy||score<(policy.passingScore??0)||(applicant.stage==='Portfolio Review'&&!portfolioCases.length)} onClick={()=>review('Passed')} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">Record Pass</button></div></div></div>}

    {policy?.interviewRequired&&<div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-sm font-black">Required interview</h3>{latestInterview?<div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs text-slate-600"><strong className="text-slate-900">{latestInterview.status}</strong><div className="mt-1">{new Date(latestInterview.startAt).toLocaleString()} · {latestInterview.timezone}</div>{latestInterview.meetingUrl&&<a className="mt-2 inline-flex items-center gap-1 font-bold text-[#000080]" href={latestInterview.meetingUrl} target="_blank" rel="noreferrer">Open meeting <ExternalLink className="h-3 w-3"/></a>}{latestInterview.status!=='Completed'&&<div className="mt-3 flex gap-2"><input value={interviewNotes} onChange={e=>setInterviewNotes(e.target.value)} placeholder="Outcome notes" className="flex-1 rounded-lg border border-slate-200 px-3 py-2"/><button disabled={busy} onClick={()=>onCompleteInterview(latestInterview.id,interviewNotes)} className="rounded-lg bg-[#000080] px-3 py-2 font-black text-white">Complete</button></div>}</div>:<div className="mt-4 grid gap-3 sm:grid-cols-2"><input type="datetime-local" value={dateTime} onChange={e=>setDateTime(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs"/><input value={meetingUrl} onChange={e=>setMeetingUrl(e.target.value)} placeholder="Meeting URL" className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs"/><button disabled={busy||!dateTime} onClick={()=>{const start=new Date(dateTime);const end=new Date(start.getTime()+45*60000);void onSchedule({startAt:start.toISOString(),endAt:end.toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',meetingUrl})}} className="rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">Schedule Interview</button></div>}</div>}

    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-sm font-black">Next protected action</h3><div className="mt-4 flex flex-wrap gap-2">
      {canAdvance&&<button disabled={busy} onClick={onAdvance} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white">Advance to {nextLabel(applicant.stage)} <ArrowRight className="h-4 w-4"/></button>}
      {applicant.stage==='Selected'&&(isAdmin?<button disabled={busy} onClick={onIssueAgreement} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white"><FileSignature className="h-4 w-4"/>Issue Project-Based Agreement</button>:<GuardMessage>Admin must issue the approved project-based Content Creator agreement.</GuardMessage>)}
      {applicant.stage==='Agreement Pending'&&(agreementSigned?<button disabled={busy} onClick={onSendAccess} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white"><UserCheck className="h-4 w-4"/>Send Content Academy Access</button>:<GuardMessage>Agreement must be signed and verified before Academy access. <a href="/admin/agreements" className="font-black underline">Open Agreements</a></GuardMessage>)}
      {applicant.stage==='Content Academy'&&<GuardMessage>The trainee must complete every required Content Academy module and submit the practical. Production access remains locked.</GuardMessage>}
      {applicant.stage==='Practical Certification'&&<GuardMessage>The practical requires independent review at 90% or above. Passing moves the candidate to Final Approval; it does not activate them.</GuardMessage>}
      {applicant.stage==='Final Approval'&&(isAdmin?<button disabled={busy} onClick={onApproveFinal} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white"><ShieldCheck className="h-4 w-4"/>Grant Final Approval</button>:<GuardMessage>Final Approval is restricted to an active Admin.</GuardMessage>)}
      {applicant.stage==='Ready for System Access'&&(isAdmin?<button disabled={busy} onClick={onActivate} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white"><UserCheck className="h-4 w-4"/>Confirm Access & Activate</button>:<GuardMessage>An active Admin must confirm system access before activation.</GuardMessage>)}
      {applicant.stage==='Activated'&&<div className="rounded-xl bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800"><CheckCircle2 className="mr-1 inline h-4 w-4"/>Active Content Creator. Eligible for approved project assignment with independent quality review.</div>}
    </div></div>

    {applicant.linkedUserId&&['Content Academy','Practical Certification','Final Approval','Ready for System Access','Activated'].includes(String(applicant.stage))&&<ContentPracticalReviewPanel traineeUserId={applicant.linkedUserId} onChanged={onRefresh}/>} 

    {applicant.stage!=='Activated'&&!applicant.refusalReason&&<div className="rounded-[28px] border border-red-100 bg-red-50/40 p-5"><div className="text-xs font-black text-red-800">Close candidate</div><div className="mt-3 grid gap-2 sm:grid-cols-[240px_1fr_auto]"><select value={closeReason} onChange={e=>setCloseReason(e.target.value)} className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs">{CONTENT_REFUSAL_REASONS.map(r=><option key={r}>{r}</option>)}</select><input value={closeNotes} onChange={e=>setCloseNotes(e.target.value)} placeholder="Internal closure notes" className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs"/><button disabled={busy} onClick={()=>onClose(closeReason,closeNotes)} className="rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-black text-red-700"><XCircle className="mr-1 inline h-4 w-4"/>Close</button></div></div>}
  </section>;
}

function nextLabel(stage:string){const map:Record<string,string>={'New Application':'Video & Resume Review','Video & Resume Review':'Portfolio Review','Portfolio Review':'Content Assessment','Content Assessment':'Conditional Selected'};return map[stage]||'next valid stage'}
function Metric({label,value}:{label:string;value:number}){return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 text-xl font-black text-slate-900">{value}</div></div>}
function StageBadge({stage,closed=false}:{stage:string;closed?:boolean}){const display=stage.includes(' · ')?stage:stageLabel(stage);return <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${closed?'bg-red-100 text-red-700':stage.includes('Activated')||stage.includes('Passed')?'bg-emerald-100 text-emerald-700':stage.includes('Retry')||stage.includes('Failed')?'bg-amber-100 text-amber-800':'bg-blue-100 text-[#000080]'}`}>{display}</span>}
function Info({label,value}:{label:string;value:string}){return <div className="rounded-2xl bg-slate-50 p-3"><div className="text-[9px] font-black uppercase text-slate-400">{label}</div><div className="mt-1 text-xs font-black text-slate-800">{value}</div></div>}
function Evidence({label,value}:{label:string;value?:string}){if(!value)return <div className="rounded-2xl border border-dashed border-slate-200 p-4"><div className="text-[9px] font-black uppercase text-slate-400">{label}</div><div className="mt-2 text-xs text-slate-400">Not supplied</div></div>;return <div className="rounded-2xl border border-slate-200 p-4"><div className="text-[9px] font-black uppercase text-slate-400">{label}</div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{value}</p></div>}
function SecureAsset({path,label}:{path:string;label:string}){const [loading,setLoading]=useState(false);const open=async()=>{setLoading(true);try{const signed=await applicantService.getSecureApplicationFileUrl(path);window.open(signed,'_blank','noopener,noreferrer')}finally{setLoading(false)}};return <button onClick={()=>void open()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-700">{loading?<Loader2 className="h-4 w-4 animate-spin"/>:<BriefcaseBusiness className="h-4 w-4"/>}{label}</button>}
function GuardMessage({children}:{children:any}){return <div className="rounded-xl bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-800">{children}</div>}