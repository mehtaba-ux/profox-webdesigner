import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  FileCheck2,
  FileSignature,
  Loader2,
  Mail,
  RefreshCw,
  Settings2,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type { ApplicantRecord } from '../../lib/applicantService';
import { agreementService } from '../../lib/agreementService';
import { profileService } from '../../lib/profileService';
import { recruitmentInterviewService, type RecruitmentInterviewBookingContext } from '../../lib/recruitmentInterviewService';
import { recruitmentTaskService, type AdminRecruitmentTask } from '../../lib/recruitmentTaskService';
import {
  recruitmentWorkflowService,
  type RecruitmentAssessment,
  type RecruitmentInterview,
  type RecruitmentInterviewStatus,
  type RecruitmentJobContext,
  type RecruitmentStagePolicy,
  type RecruitmentWorkflowMeta,
} from '../../lib/recruitmentWorkflowService';
import { REFUSAL_REASONS, type UserProfile } from '../../types';
import RecruitmentAssessmentDialog, { type RecruitmentAssessmentDialogMode } from './RecruitmentAssessmentDialog';
import RecruitmentInterviewBookingDialog from './RecruitmentInterviewBookingDialog';
import RecruitmentInterviewSkipDialog from './RecruitmentInterviewSkipDialog';
import RecruitmentTaskReviewDialog from './RecruitmentTaskReviewDialog';
import SalesAcademyTestBypassControl from './SalesAcademyTestBypassControl';

interface Props {
  applicant: ApplicantRecord;
  currentAdminId?: string;
  onChanged: () => Promise<void>;
}

const DEVELOPMENT_CLOSE_REASONS = [
  'Code / Portfolio Evidence Below Requirement',
  'Initial Screening Failed',
  'Technical Assessment Failed',
  'Development Practical Failed',
  'Technical Interview Failed',
  'Availability Below Requirement',
  'Equipment / Internet Issue',
  'Agreement Declined',
  'Developer Academy Failed',
  'Unresponsive',
  'Incorrect Information',
  'Other',
];

const DESIGN_CLOSE_REASONS = [
  'Portfolio Evidence Below Requirement',
  'Initial Screening Failed',
  'Design Assessment Failed',
  'Figma Practical Failed',
  'Design Interview Failed',
  'Availability Below Requirement',
  'Equipment / Internet Issue',
  'Agreement Declined',
  'Design Academy Failed',
  'Unresponsive',
  'Incorrect Information',
  'Other',
];

const CONTENT_CLOSE_REASONS = [
  'Insufficient Content Writing Experience',
  'Portfolio Quality Below Requirement',
  'Written English Below Requirement',
  'Content Assessment Failed',
  'Research & Evidence Test Failed',
  'Interview / Collaboration Fit',
  'Availability Below Requirement',
  'Equipment / Internet Issue',
  'Training Failed',
  'Practical Certification Failed',
  'Unresponsive',
  'Incorrect Information',
  'Duplicate Application',
  'Other',
];

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
}

function fmt(value?: string | null) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDuration(hours: number) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.floor(hours / 24)}d ${Math.round(hours % 24)}h`;
}

export default function RecruitmentWorkflowPanel({ applicant, currentAdminId, onChanged }: Props) {
  const [policies, setPolicies] = useState<RecruitmentStagePolicy[]>([]);
  const [assessments, setAssessments] = useState<RecruitmentAssessment[]>([]);
  const [interviews, setInterviews] = useState<RecruitmentInterview[]>([]);
  const [tasks, setTasks] = useState<AdminRecruitmentTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<AdminRecruitmentTask | null>(null);
  const [bookingContext, setBookingContext] = useState<RecruitmentInterviewBookingContext | null>(null);
  const [meta, setMeta] = useState<RecruitmentWorkflowMeta | null>(null);
  const [jobContext, setJobContext] = useState<RecruitmentJobContext>({ title: applicant.position || 'Candidate', department: '', systemRole: 'pending', trainingTrack: 'general' });
  const [linkedUser, setLinkedUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [assessmentMode, setAssessmentMode] = useState<RecruitmentAssessmentDialogMode>('new');

  const [interviewOpen, setInterviewOpen] = useState(false);
  const [skipInterviewOpen, setSkipInterviewOpen] = useState(false);
  const [interviewOutcome, setInterviewOutcome] = useState('');
  const [interviewStatus, setInterviewStatus] = useState<RecruitmentInterviewStatus>('Completed');

  const [closeOpen, setCloseOpen] = useState(false);
  const [closeReason, setCloseReason] = useState('Other');
  const [closeNotes, setCloseNotes] = useState('');
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideStage, setOverrideStage] = useState('New Application');
  const [overrideReason, setOverrideReason] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const workflowMeta = await recruitmentWorkflowService.getWorkflowMeta(applicant.id);
      const [policyRows, assessmentRows, interviewRows, taskRows, context, interviewBooking] = await Promise.all([
        recruitmentWorkflowService.getStagePolicies(workflowMeta.careerJobId),
        recruitmentWorkflowService.getAssessments(applicant.id),
        recruitmentWorkflowService.getInterviews(applicant.id),
        recruitmentTaskService.listForApplicant(applicant.id),
        recruitmentWorkflowService.getJobContext(workflowMeta.careerJobId),
        recruitmentInterviewService.getBookingContext(applicant.id),
      ]);
      setPolicies(policyRows);
      setAssessments(assessmentRows);
      setInterviews(interviewRows);
      setTasks(taskRows);
      setBookingContext(interviewBooking);
      setMeta(workflowMeta);
      setJobContext(context);
      if (selectedTask) setSelectedTask(taskRows.find(item => item.id === selectedTask.id) || null);
      if (applicant.linkedUserId) {
        const { data } = await profileService.getProfile(applicant.linkedUserId);
        setLinkedUser(data || null);
      } else {
        setLinkedUser(null);
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not load the protected recruitment workflow.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [applicant.id, applicant.stage, applicant.linkedUserId, applicant.agreementStatus]);

  const descriptor = recruitmentWorkflowService.roleDescriptor(jobContext.systemRole);
  const stageOrder = recruitmentWorkflowService.stageOrder(policies);
  const policy = useMemo(() => policies.find(item => item.stage === String(applicant.stage)), [policies, applicant.stage]);
  const currentAssessments = useMemo(() => assessments.filter(item => item.stage === String(applicant.stage)), [assessments, applicant.stage]);
  const latestAssessment = currentAssessments[0];
  const currentInterviews = useMemo(() => interviews.filter(item => item.stage === String(applicant.stage)), [interviews, applicant.stage]);
  const latestInterview = currentInterviews[0];
  const currentTasks = useMemo(() => tasks.filter(item => item.stage === String(applicant.stage)), [tasks, applicant.stage]);
  const latestTask = currentTasks[0];
  const isContentWriter = jobContext.systemRole === 'content_writer';
  const taskGateRequired = jobContext.systemRole === 'sales' && String(applicant.stage) === 'Lead Research Test';
  const taskReadyForAssessment = !taskGateRequired || Boolean(latestTask && ['Submitted', 'Under Review'].includes(latestTask.status));
  const passedAssessment = latestAssessment?.status === 'Passed';
  const completedInterview = currentInterviews.some(item => item.status === 'Completed');
  const interviewSkipped = bookingContext?.interviewSkipped === true;
  const nextStage = recruitmentWorkflowService.nextStage(String(applicant.stage), policies);
  const currentStageLabel = recruitmentWorkflowService.stageLabel(String(applicant.stage), jobContext.systemRole);
  const nextStageLabel = nextStage ? recruitmentWorkflowService.stageLabel(nextStage, jobContext.systemRole) : null;
  const hasVideo = Boolean(applicant.videoUrl || applicant.videoStoragePath);
  const academyStage = descriptor.academyStage;
  const protectedStages = isContentWriter
    ? ['Selected', 'Content Academy', 'Practical Certification', 'Activated']
    : ['Selected', 'Agreement Pending', academyStage, 'Final Approval', 'Ready for System Access', 'Activated'];
  const closeReasons = jobContext.systemRole === 'developer'
    ? DEVELOPMENT_CLOSE_REASONS
    : jobContext.systemRole === 'uiux_designer'
      ? DESIGN_CLOSE_REASONS
      : isContentWriter
        ? CONTENT_CLOSE_REASONS
        : REFUSAL_REASONS;

  const stageHours = meta?.stageEnteredAt ? Math.max(0, (Date.now() - new Date(meta.stageEnteredAt).getTime()) / 3_600_000) : 0;
  const overdue = Boolean(policy?.slaHours && policy.slaHours > 0 && stageHours >= policy.slaHours);

  useEffect(() => {
    if (!closeReasons.includes(closeReason)) setCloseReason(closeReasons[0] || 'Other');
  }, [jobContext.systemRole]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      await onChanged();
      await load();
    } catch (err) {
      setError(errorMessage(err, 'The protected recruitment action could not be completed.'));
    } finally {
      setBusy(false);
    }
  };

  const openNewAssessment = () => {
    if (!taskReadyForAssessment) {
      setError('The candidate must submit the current Lead Research Assessment attempt before evaluator scoring can be recorded.');
      return;
    }
    setAssessmentMode('new');
    setError(null);
    setNotice(null);
    setAssessmentOpen(true);
  };

  const openEditAssessment = () => {
    if (!latestAssessment) return;
    if (!taskReadyForAssessment) {
      setError('The current Lead Research Assessment retry must be submitted before this stage can be assessed again.');
      return;
    }
    setAssessmentMode('edit');
    setError(null);
    setNotice(null);
    setAssessmentOpen(true);
  };

  const assessmentSaved = async (message: string) => {
    setAssessmentOpen(false);
    setNotice(message);
    setError(null);
    await onChanged();
    await load();
  };

  const updateLatestInterview = async () => {
    if (!latestInterview) return;
    await run(async () => {
      await recruitmentWorkflowService.updateInterview({
        interviewId: latestInterview.id,
        status: interviewStatus,
        outcomeNotes: interviewOutcome,
        meetingUrl: null,
      });
      setInterviewOutcome('');
    }, `Interview marked ${interviewStatus}.`);
  };

  const interviewBooked = async () => {
    setNotice('Recruitment interview booked. Google Meet creation and the candidate email are automatic.');
    await onChanged();
    await load();
  };

  const interviewSkippedByAdmin = async () => {
    setNotice('Required interview skipped by Admin and recorded in the candidate audit trail. Any remaining recruitment gates stay protected.');
    await onChanged();
    await load();
  };

  const advance = async () => {
    await run(() => recruitmentWorkflowService.advanceStage(applicant.id), 'Candidate advanced to the next valid stage.');
  };

  const issueAgreement = async () => {
    await run(() => agreementService.issue(applicant.id), `${descriptor.roleLabel} agreement issued through the protected agreement workflow.`);
  };

  const sendAcademyAccess = async () => {
    await run(
      () => recruitmentWorkflowService.sendAcademyAccess(applicant.id),
      meta?.onboardingInviteCount ? `${descriptor.academyLabel} access link resent securely.` : `${descriptor.academyLabel} account access sent securely.`,
    );
  };

  const finalApprove = async () => {
    await run(
      () => recruitmentWorkflowService.approveFinal(applicant.id, jobContext.systemRole),
      `Final Approval passed. ${descriptor.roleLabel} is ready for controlled system activation.`,
    );
  };

  const activate = async () => {
    if (!applicant.linkedUserId) return;
    await run(
      () => recruitmentWorkflowService.activateCandidate(applicant.linkedUserId as string, jobContext.systemRole, currentAdminId),
      `${descriptor.roleLabel} activated successfully.`,
    );
  };

  const closeCandidate = async () => {
    await run(async () => {
      await recruitmentWorkflowService.closeApplicant(applicant.id, closeReason, closeNotes);
      setCloseOpen(false);
    }, 'Candidate closed. Any onboarding access and pending recruitment communications were handled securely.');
  };

  const applyOverride = async () => {
    await run(async () => {
      await recruitmentWorkflowService.overrideStage(applicant.id, overrideStage, overrideReason);
      setOverrideOpen(false);
      setOverrideReason('');
    }, 'Documented pre-onboarding stage correction applied.');
  };

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-[#000080]" />Loading secure workflow...</div></div>;
  }

  const normalAdvanceAllowed = !policy?.assessmentRequired || passedAssessment;
  const interviewReady = !policy?.interviewRequired || completedInterview || interviewSkipped;
  const correctionBoundary = isContentWriter ? 'Content Academy' : 'Agreement Pending';
  const preAgreement = recruitmentWorkflowService.isBeforeStage(String(applicant.stage), correctionBoundary, policies);
  const overrideStages = stageOrder.filter(stage => recruitmentWorkflowService.isBeforeStage(stage, correctionBoundary, policies));

  return (
    <div className="sticky top-0 space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Protected {jobContext.department || 'recruitment'} workflow</div>
            <h3 className="mt-1 text-base font-bold text-slate-900">{currentStageLabel}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">{jobContext.title} · {descriptor.academyLabel}</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={busy} className="rounded-lg border border-slate-200 p-2 text-slate-400 transition hover:text-[#000080] disabled:opacity-50" title="Refresh workflow"><RefreshCw className="h-4 w-4" /></button>
        </div>

        <div className={`mt-4 rounded-xl border p-3 ${overdue ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex items-center justify-between gap-2 text-sm font-semibold">
            <span className={overdue ? 'text-red-700' : 'text-slate-600'}><Clock3 className="mr-1 inline h-3.5 w-3.5" />Stage age {formatDuration(stageHours)}</span>
            <span className={overdue ? 'text-red-700' : 'text-slate-500'}>{policy?.slaHours ? `${policy.slaHours}h SLA` : 'No SLA'}</span>
          </div>
          {overdue && <p className="mt-2 text-sm leading-6 text-red-700">This review is overdue. ProFox recruitment automation will continue surfacing it until the protected stage changes.</p>}
        </div>

        {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
        {notice && <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice}</span></div>}

        {policy?.interviewRequired && (
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex items-center justify-between gap-2"><div className="text-sm font-bold uppercase tracking-wide text-[#000080]">Required interview</div>{completedInterview ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : interviewSkipped ? <ShieldCheck className="h-4 w-4 text-amber-600" /> : <CalendarClock className="h-4 w-4 text-[#000080]" />}</div>
            {interviewSkipped ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900"><div className="font-bold">Skipped by Administrator</div><div className="mt-1">{bookingContext?.skipReason || 'Administrative exception recorded.'}</div><div className="mt-1 text-amber-700">{bookingContext?.skippedByName ? `By ${bookingContext.skippedByName}` : 'Admin action'}{bookingContext?.skippedAt ? ` · ${fmt(bookingContext.skippedAt)}` : ''}</div></div>
            ) : latestInterview ? (
              <div className="mt-2 text-sm leading-6 text-slate-600"><div className="font-semibold text-slate-800">{latestInterview.status}</div><div>{fmt(latestInterview.startAt)} · {latestInterview.timezone}</div>{latestInterview.interviewerName && <div>Interviewer: {latestInterview.interviewerName}</div>}{latestInterview.meetingUrl ? <a href={latestInterview.meetingUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block font-semibold text-[#000080]">Open meeting link</a> : latestInterview.status === 'Scheduled' ? <div className="mt-1 text-slate-500">Google Meet link is being created automatically.</div> : null}</div>
            ) : <p className="mt-2 text-sm leading-6 text-slate-600">Book and complete the required interview before this stage can be marked Passed. The meeting link is generated automatically from the responsible person&apos;s connected calendar.</p>}

            {!latestInterview && !interviewSkipped && <button type="button" onClick={() => setInterviewOpen(true)} disabled={busy} className="mt-3 w-full rounded-lg bg-[#000080] px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">Book Interview</button>}

            {latestInterview && !interviewSkipped && latestInterview.status !== 'Completed' && (
              <div className="mt-3 space-y-2">
                <select value={interviewStatus} onChange={event => setInterviewStatus(event.target.value as RecruitmentInterviewStatus)} className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-sm font-semibold">
                  {(['Completed', 'No Show', 'Cancelled', 'Rescheduled', 'Scheduled'] as RecruitmentInterviewStatus[]).map(status => <option key={status}>{status}</option>)}
                </select>
                <textarea value={interviewOutcome} onChange={event => setInterviewOutcome(event.target.value)} rows={2} placeholder="Interview outcome / notes" className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#000080]" />
                <button type="button" onClick={() => void updateLatestInterview()} disabled={busy} className="w-full rounded-lg border border-[#000080]/20 bg-white px-3 py-2.5 text-sm font-bold text-[#000080] disabled:opacity-50">Update Interview</button>
                {(['Rescheduled', 'Cancelled', 'No Show'] as RecruitmentInterviewStatus[]).includes(latestInterview.status) && <button type="button" onClick={() => setInterviewOpen(true)} disabled={busy} className="w-full rounded-lg bg-[#000080] px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">Book New Time</button>}
              </div>
            )}

            {bookingContext?.canSkip && !interviewSkipped && !completedInterview && <button type="button" onClick={() => setSkipInterviewOpen(true)} disabled={busy} className="mt-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm font-bold text-amber-800 disabled:opacity-50">Skip Interview (Admin)</button>}
          </div>
        )}

        {(taskGateRequired || currentTasks.length > 0) && (
          <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div><div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[#000080]"><ClipboardList className="h-4 w-4"/>Candidate practical task</div><p className="mt-1 text-sm leading-6 text-slate-600">Candidate submission and evaluator scoring are stored separately. Final assessment is unlocked only after the current task attempt is submitted.</p></div>
              <a href="/admin/recruitment-task-settings" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-2 text-xs font-bold text-[#000080]"><Settings2 className="h-3.5 w-3.5"/>Settings</a>
            </div>
            {latestTask ? <div className="mt-4"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-indigo-100 bg-white p-3.5"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</div><div className="mt-1 text-base font-black text-slate-900">{latestTask.status}</div></div><div className="rounded-xl border border-indigo-100 bg-white p-3.5"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Attempt</div><div className="mt-1 text-base font-black text-slate-900">#{latestTask.attemptNo} of {latestTask.maxAttempts}</div></div><div className="rounded-xl border border-indigo-100 bg-white p-3.5"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Deadline</div><div className="mt-1 text-sm font-bold leading-5 text-slate-900">{fmt(latestTask.dueAt)}</div></div></div><div className="mt-3 text-sm leading-6 text-slate-600">{latestTask.submittedAt ? <>Submitted: <strong className="text-slate-900">{fmt(latestTask.submittedAt)}</strong></> : latestTask.lastSavedAt ? <>Last draft saved: <strong className="text-slate-900">{fmt(latestTask.lastSavedAt)}</strong></> : latestTask.viewedAt ? <>Candidate opened task: <strong className="text-slate-900">{fmt(latestTask.viewedAt)}</strong></> : <>Secure task issued: <strong className="text-slate-900">{fmt(latestTask.issuedAt)}</strong></>}</div><button type="button" onClick={()=>setSelectedTask(latestTask)} className="mt-4 w-full rounded-xl bg-[#000080] px-4 py-3 text-sm font-bold text-white">{latestTask.submittedAt ? 'Review Submission' : 'Manage Candidate Task'}</button>{!taskReadyForAssessment && <p className="mt-3 text-sm leading-6 text-amber-800">Waiting for final candidate submission. Assessment scoring is intentionally locked until this attempt is submitted.</p>}</div> : <div className="mt-4 rounded-xl border border-dashed border-indigo-200 bg-white p-4 text-sm leading-6 text-slate-600">The secure task has not been issued yet. Entering Lead Research Assessment automatically creates and emails the task; refresh if this candidate was already at the stage before the task system was enabled.</div>}
            {currentTasks.length > 1 && <div className="mt-3 text-xs font-semibold text-slate-500">{currentTasks.length} task attempts are preserved in this candidate history.</div>}
          </div>
        )}

        {policy?.assessmentRequired && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold uppercase tracking-wide text-[#000080]">Structured assessment</div>
                <p className="mt-1 text-sm leading-6 text-slate-600">Saved assessment scores remain available after refresh and navigation.</p>
              </div>
              {passedAssessment ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <FileCheck2 className="h-5 w-5 shrink-0 text-slate-500" />}
            </div>

            {latestAssessment ? (
              <div className="mt-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5"><div className="text-sm font-semibold text-slate-600">Saved score</div><div className="mt-1 text-2xl font-bold text-slate-950">{latestAssessment.score}%</div></div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5"><div className="text-sm font-semibold text-slate-600">Decision</div><div className="mt-1 text-base font-bold text-slate-950">{latestAssessment.status}</div></div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5"><div className="text-sm font-semibold text-slate-600">Attempt</div><div className="mt-1 text-base font-bold text-slate-950">#{latestAssessment.attemptNo}</div></div>
                </div>
                <div className="mt-3 text-sm leading-6 text-slate-600">
                  Passing score: <strong className="text-slate-900">{latestAssessment.passingScore ?? policy.passingScore ?? 0}%</strong>
                  {latestAssessment.evaluatorName && <> · Evaluator: <strong className="text-slate-900">{latestAssessment.evaluatorName}</strong></>}
                  {latestAssessment.evaluatedAt && <> · Saved: <strong className="text-slate-900">{fmt(latestAssessment.evaluatedAt)}</strong></>}
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={openEditAssessment} disabled={busy || !taskReadyForAssessment} className="rounded-xl bg-[#000080] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#000066] disabled:opacity-40">Edit Assessment</button>
                  <button type="button" onClick={openNewAssessment} disabled={busy || !taskReadyForAssessment} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-[#000080]/30 hover:text-[#000080] disabled:opacity-40">Record New Attempt</button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-600">No assessment has been saved for this stage yet.</div>
                <button type="button" onClick={openNewAssessment} disabled={busy || !taskReadyForAssessment} className="mt-3 w-full rounded-xl bg-[#000080] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#000066] disabled:opacity-40">Record Assessment</button>
              </div>
            )}

            {taskGateRequired && !taskReadyForAssessment && <p className="mt-3 text-sm leading-6 text-amber-800">Lead Research Assessment evidence must be submitted first. Open the Candidate Practical Task section to monitor or manage the secure task.</p>}
            {policy.interviewRequired && !completedInterview && !interviewSkipped && <p className="mt-3 text-sm leading-6 text-amber-800">You can save scoring as Failed or Retry Required now. Complete the required interview, or use the audited Admin skip when appropriate, before selecting Passed.</p>}
            {policy.interviewRequired && interviewSkipped && <p className="mt-3 text-sm leading-6 text-amber-800">The interview requirement was skipped by Admin. The structured assessment remains protected by its score and critical-failure rules.</p>}
          </div>
        )}

        <div className="mt-4 space-y-2">
          {!isContentWriter && String(applicant.stage) === 'Selected' && applicant.agreementStatus === 'not_sent' && <button type="button" onClick={() => void issueAgreement()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#000080] py-2.5 text-sm font-bold text-white disabled:opacity-50"><FileSignature className="h-4 w-4" />Issue & Send {descriptor.roleLabel} Agreement</button>}
          {!isContentWriter && ['Selected', 'Agreement Pending'].includes(String(applicant.stage)) && applicant.agreementStatus !== 'not_sent' && <a href={`/admin/agreements?applicant=${encodeURIComponent(applicant.id)}`} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-2.5 text-sm font-bold text-[#000080]"><FileSignature className="h-4 w-4" />Open Agreement Record</a>}
          {isContentWriter && ['Selected', 'Content Academy'].includes(String(applicant.stage)) && <button type="button" onClick={() => void sendAcademyAccess()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Mail className="h-4 w-4" />{meta?.onboardingInviteCount ? 'Resend Content Academy Access' : 'Send Content Academy Access'}</button>}
          {!isContentWriter && ['Selected', 'Agreement Pending', academyStage].includes(String(applicant.stage)) && applicant.agreementStatus === 'signed' && <button type="button" onClick={() => void sendAcademyAccess()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Mail className="h-4 w-4" />{meta?.onboardingInviteCount ? `Resend ${descriptor.academyLabel} Access` : `Send ${descriptor.academyLabel} Access`}</button>}
          {String(applicant.stage) === academyStage && <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-slate-600"><div className="flex items-center gap-2 font-bold text-[#000080]"><UserCheck className="h-4 w-4" />{descriptor.academyLabel}</div><p className="mt-1">{isContentWriter ? 'The candidate completes the Content Academy training track here. The protected training workflow moves the candidate into Practical Certification only after the required Academy work is complete.' : jobContext.systemRole === 'sales' ? 'The candidate completes the required Sales Academy training and Management-reviewed gates here. When those server-side requirements are satisfied, advance to Sales Practical Assessment, then Lead Research Assessment, CRM Assessment and Final Certification before Final Approval.' : 'The candidate must complete the assigned Academy and request Final Approval through the protected workflow. Management cannot bypass these server-side gates.'}</p>{linkedUser && <p className="mt-2 font-semibold">Account: {linkedUser.email} · {linkedUser.status} · {linkedUser.onboardingProgress || 0}%</p>}{meta?.onboardingInviteLastSentAt && <p className="mt-1">Last access email: {fmt(meta.onboardingInviteLastSentAt)}</p>}</div>}
          {jobContext.systemRole === 'sales' && String(applicant.stage) === 'Sales Academy Training' && applicant.linkedUserId && <SalesAcademyTestBypassControl applicant={applicant} onChanged={async () => { await onChanged(); await load(); }} />}
          {isContentWriter && String(applicant.stage) === 'Practical Certification' && <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm leading-6 text-slate-700"><div className="flex items-center gap-2 font-bold text-violet-800"><ShieldCheck className="h-4 w-4" />Protected Practical Certification</div><p className="mt-1">Content Writer activation is controlled by the practical certification review. It cannot be advanced manually from this shared panel.</p><a href="/admin/content-recruitment" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-bold text-[#000080] shadow-sm ring-1 ring-violet-200">Open Content Certification Review</a></div>}
          {!isContentWriter && String(applicant.stage) === 'Final Approval' && <button type="button" onClick={() => void finalApprove()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 py-2.5 text-sm font-bold text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4" />Run {descriptor.roleLabel} Final Approval Gate</button>}
          {!isContentWriter && String(applicant.stage) === 'Ready for System Access' && <button type="button" onClick={() => void activate()} disabled={busy || !applicant.linkedUserId} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 py-2.5 text-sm font-bold text-white disabled:opacity-50"><UserCheck className="h-4 w-4" />Activate {descriptor.roleLabel}</button>}
          {String(applicant.stage) === 'Activated' && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />{descriptor.roleLabel} access is active.</div>}
          {!protectedStages.includes(String(applicant.stage)) && nextStage && <button type="button" onClick={() => void advance()} disabled={busy || !normalAdvanceAllowed || !interviewReady || (String(applicant.stage) === 'Video Pending' && !hasVideo)} className="w-full rounded-lg bg-[#000080] py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Advance to {nextStageLabel || nextStage}</button>}
          {String(applicant.stage) === 'Video Pending' && !hasVideo && <p className="text-sm leading-6 text-amber-700">The introduction video must be available before Video Review.</p>}
          {policy?.assessmentRequired && !passedAssessment && <p className="text-sm leading-6 text-slate-600">A passed structured assessment is required before progression.</p>}
        </div>

        {busy && <div className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Applying protected workflow...</div>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Attribution</div>
        <div className="mt-2 space-y-1 text-sm leading-6 text-slate-600">
          <div><strong>Source:</strong> {meta?.utmSource || applicant.heardAboutSource || applicant.source || 'Unknown'}</div>
          {meta?.utmCampaign && <div><strong>Campaign:</strong> {meta.utmCampaign}</div>}
          {meta?.utmMedium && <div><strong>Medium:</strong> {meta.utmMedium}</div>}
          <div><strong>Workflow:</strong> {jobContext.workflowKey || 'default'} · {jobContext.trainingTrack}</div>
        </div>
      </section>

      {preAgreement && String(applicant.stage) !== 'Activated' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <button type="button" onClick={() => setOverrideOpen(value => !value)} className="flex w-full items-center justify-between text-left text-xs font-bold uppercase tracking-[0.14em] text-slate-500"><span>Documented correction</span><ChevronDown className={`h-4 w-4 transition ${overrideOpen ? 'rotate-180' : ''}`} /></button>
          {overrideOpen && <div className="mt-3 space-y-2"><select value={overrideStage} onChange={event => setOverrideStage(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold">{overrideStages.map(stage => <option key={stage} value={stage}>{recruitmentWorkflowService.stageLabel(stage, jobContext.systemRole)}</option>)}</select><textarea value={overrideReason} onChange={event => setOverrideReason(event.target.value)} rows={2} placeholder="Specific correction reason, minimum 12 characters" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#000080]" /><button type="button" onClick={() => void applyOverride()} disabled={busy || overrideReason.trim().length < 12 || overrideStage === String(applicant.stage)} className="w-full rounded-lg border border-slate-200 py-2.5 text-sm font-bold text-slate-600 disabled:opacity-40">Apply Stage Correction</button><p className="text-sm leading-6 text-slate-500">{isContentWriter ? 'This cannot bypass Content Academy, Practical Certification or activation.' : jobContext.systemRole === 'sales' ? 'This cannot bypass Agreement, Sales Academy, post-Academy assessments, Final Certification, Final Approval, System Access or activation.' : 'This cannot bypass Agreement, Academy, Final Approval or activation.'}</p></div>}
        </section>
      )}

      {String(applicant.stage) !== 'Activated' && (
        <section className="rounded-2xl border border-red-100 bg-red-50/50 p-4">
          {!closeOpen ? <button type="button" onClick={() => setCloseOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white py-2.5 text-sm font-bold text-red-600"><XCircle className="h-4 w-4" />Close Candidate</button> : <div className="space-y-2"><select value={closeReason} onChange={event => setCloseReason(event.target.value)} className="w-full rounded-lg border border-red-200 bg-white px-3 py-2.5 text-sm">{closeReasons.map(reason => <option key={reason}>{reason}</option>)}</select><textarea value={closeNotes} onChange={event => setCloseNotes(event.target.value)} rows={2} placeholder="Optional internal closure notes" className="w-full rounded-lg border border-red-200 bg-white px-3 py-2.5 text-sm outline-none" /><div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><button type="button" onClick={() => void closeCandidate()} disabled={busy} className="rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white">Confirm Close</button><button type="button" onClick={() => setCloseOpen(false)} className="rounded-lg border border-red-200 bg-white py-2.5 text-sm font-bold text-slate-600">Cancel</button></div><p className="text-sm leading-6 text-red-700">If onboarding access already exists, the protected close operation revokes it immediately.</p></div>}
        </section>
      )}

      {assessmentOpen && policy && (
        <RecruitmentAssessmentDialog
          key={`${assessmentMode}:${assessmentMode === 'edit' ? latestAssessment?.id || 'missing' : 'new'}`}
          applicantId={applicant.id}
          candidateName={applicant.fullName}
          stage={String(applicant.stage)}
          policy={policy}
          mode={assessmentMode}
          assessment={assessmentMode === 'edit' ? latestAssessment : undefined}
          completedInterview={completedInterview}
          interviewSkipped={interviewSkipped}
          nextStage={nextStageLabel || nextStage}
          onClose={() => setAssessmentOpen(false)}
          onSaved={assessmentSaved}
        />
      )}

      {selectedTask && <RecruitmentTaskReviewDialog task={selectedTask} candidateName={applicant.fullName} onClose={()=>setSelectedTask(null)} onChanged={async()=>{await onChanged();await load();}}/>}
      {interviewOpen && bookingContext && <RecruitmentInterviewBookingDialog applicantId={applicant.id} candidateName={applicant.fullName} candidateTimezone={applicant.timezone} context={bookingContext} onClose={() => setInterviewOpen(false)} onBooked={interviewBooked} />}
      {skipInterviewOpen && <RecruitmentInterviewSkipDialog applicantId={applicant.id} candidateName={applicant.fullName} stage={String(applicant.stage)} onClose={() => setSkipInterviewOpen(false)} onSkipped={interviewSkippedByAdmin} />}
    </div>
  );
}
