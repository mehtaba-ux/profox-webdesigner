import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck2,
  FileSignature,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type { ApplicantRecord } from '../../lib/applicantService';
import { agreementService } from '../../lib/agreementService';
import { profileService } from '../../lib/profileService';
import { recruitmentAssessmentService } from '../../lib/recruitmentAssessmentService';
import { recruitmentInterviewService, type RecruitmentInterviewBookingContext } from '../../lib/recruitmentInterviewService';
import {
  recruitmentWorkflowService,
  type RecruitmentAssessment,
  type RecruitmentAssessmentStatus,
  type RecruitmentInterview,
  type RecruitmentInterviewStatus,
  type RecruitmentJobContext,
  type RecruitmentStagePolicy,
  type RecruitmentWorkflowMeta,
} from '../../lib/recruitmentWorkflowService';
import { REFUSAL_REASONS, type UserProfile } from '../../types';
import RecruitmentInterviewBookingDialog from './RecruitmentInterviewBookingDialog';
import RecruitmentInterviewSkipDialog from './RecruitmentInterviewSkipDialog';

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
  const [bookingContext, setBookingContext] = useState<RecruitmentInterviewBookingContext | null>(null);
  const [meta, setMeta] = useState<RecruitmentWorkflowMeta | null>(null);
  const [jobContext, setJobContext] = useState<RecruitmentJobContext>({ title: applicant.position || 'Candidate', department: '', systemRole: 'pending', trainingTrack: 'general' });
  const [linkedUser, setLinkedUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [assessmentStatus, setAssessmentStatus] = useState<RecruitmentAssessmentStatus>('Retry Required');
  const [rubricScores, setRubricScores] = useState<Record<string, number>>({});
  const [hasCriticalFailure, setHasCriticalFailure] = useState(false);
  const [criticalFailures, setCriticalFailures] = useState('');
  const [evidence, setEvidence] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [assessmentNotes, setAssessmentNotes] = useState('');

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
      const [policyRows, assessmentRows, interviewRows, context, interviewBooking] = await Promise.all([
        recruitmentWorkflowService.getStagePolicies(workflowMeta.careerJobId),
        recruitmentWorkflowService.getAssessments(applicant.id),
        recruitmentWorkflowService.getInterviews(applicant.id),
        recruitmentWorkflowService.getJobContext(workflowMeta.careerJobId),
        recruitmentInterviewService.getBookingContext(applicant.id),
      ]);
      setPolicies(policyRows);
      setAssessments(assessmentRows);
      setInterviews(interviewRows);
      setBookingContext(interviewBooking);
      setMeta(workflowMeta);
      setJobContext(context);
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
  const passedAssessment = latestAssessment?.status === 'Passed';
  const completedInterview = currentInterviews.some(item => item.status === 'Completed');
  const interviewSkipped = bookingContext?.interviewSkipped === true;
  const nextStage = recruitmentWorkflowService.nextStage(String(applicant.stage), policies);
  const hasVideo = Boolean(applicant.videoUrl || applicant.videoStoragePath);
  const academyStage = descriptor.academyStage;
  const protectedStages = ['Selected', 'Agreement Pending', academyStage, 'Final Approval', 'Ready for System Access', 'Activated'];
  const closeReasons = jobContext.systemRole === 'developer' ? DEVELOPMENT_CLOSE_REASONS : jobContext.systemRole === 'uiux_designer' ? DESIGN_CLOSE_REASONS : REFUSAL_REASONS;

  const stageHours = meta?.stageEnteredAt ? Math.max(0, (Date.now() - new Date(meta.stageEnteredAt).getTime()) / 3_600_000) : 0;
  const overdue = Boolean(policy?.slaHours && policy.slaHours > 0 && stageHours >= policy.slaHours);
  const rubricMax = (policy?.rubric || []).reduce((sum, item) => sum + Math.max(0, Number(item.maxPoints || 0)), 0);
  const rubricPoints = (policy?.rubric || []).reduce((sum, item) => sum + Math.max(0, Number(rubricScores[item.key] || 0)), 0);
  const assessmentScore = rubricMax > 0 ? Math.round((rubricPoints / rubricMax) * 100) : 0;
  const passingScore = Number(policy?.passingScore || 0);
  const meetsPassingScore = assessmentScore >= passingScore;
  const interviewPassReady = !policy?.interviewRequired || completedInterview || interviewSkipped;
  const passEligible = meetsPassingScore && !hasCriticalFailure && interviewPassReady;
  const parsedCriticalFailures = hasCriticalFailure
    ? criticalFailures.split('\n').map(item => item.trim()).filter(Boolean)
    : [];
  const assessmentValidationError = hasCriticalFailure && parsedCriticalFailures.length === 0
    ? 'Describe the critical failure before saving this assessment.'
    : assessmentStatus === 'Passed' && !meetsPassingScore
      ? `The score must reach the configured passing mark of ${passingScore}% before this assessment can be passed.`
      : assessmentStatus === 'Passed' && hasCriticalFailure
        ? 'A critical failure blocks a Passed decision regardless of the calculated score.'
        : assessmentStatus === 'Passed' && !interviewPassReady
          ? 'Complete the required interview or use the audited Admin skip before marking this assessment Passed.'
          : null;

  useEffect(() => {
    if (!closeReasons.includes(closeReason)) setCloseReason(closeReasons[0] || 'Other');
  }, [jobContext.systemRole]);

  useEffect(() => {
    if (assessmentStatus === 'Passed' && !passEligible) setAssessmentStatus('Retry Required');
  }, [assessmentStatus, passEligible]);

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

  const resetAssessmentForm = () => {
    setAssessmentStatus('Retry Required');
    setRubricScores({});
    setHasCriticalFailure(false);
    setCriticalFailures('');
    setEvidence('');
    setEvidenceUrl('');
    setAssessmentNotes('');
  };

  const openAssessmentForm = () => {
    resetAssessmentForm();
    setError(null);
    setNotice(null);
    setAssessmentOpen(true);
  };

  const submitAssessment = async () => {
    if (assessmentValidationError) {
      setError(assessmentValidationError);
      return;
    }

    const stageAtSubmission = String(applicant.stage);
    const successMessage = assessmentStatus === 'Passed'
      ? `${stageAtSubmission} assessment passed and saved. Candidate advanced to ${nextStage || 'the next valid stage'}.`
      : `${stageAtSubmission} assessment saved as ${assessmentStatus}. Candidate remains in ${stageAtSubmission}.`;

    await run(async () => {
      await recruitmentAssessmentService.recordAndProcess({
        applicantId: applicant.id,
        stage: stageAtSubmission,
        status: assessmentStatus,
        score: assessmentScore,
        rubricScores,
        criticalFailures: parsedCriticalFailures,
        evidence,
        evidenceUrl,
        notes: assessmentNotes,
      });
      setAssessmentOpen(false);
      resetAssessmentForm();
    }, successMessage);
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
    }, 'Documented pre-agreement stage correction applied.');
  };

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-[#000080]" />Loading secure workflow...</div></div>;
  }

  const normalAdvanceAllowed = !policy?.assessmentRequired || passedAssessment;
  const interviewReady = !policy?.interviewRequired || completedInterview || interviewSkipped;
  const preAgreement = recruitmentWorkflowService.isBeforeStage(String(applicant.stage), 'Agreement Pending', policies);
  const overrideStages = stageOrder.filter(stage => recruitmentWorkflowService.isBeforeStage(stage, 'Agreement Pending', policies));

  return (
    <div className="sticky top-0 space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Protected {jobContext.department || 'recruitment'} workflow</div>
            <h3 className="mt-1 text-base font-bold text-slate-900">{applicant.stage}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">{jobContext.title} · {descriptor.academyLabel}</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={busy} className="rounded-lg border border-slate-200 p-2 text-slate-400 transition hover:text-[#000080] disabled:opacity-50" title="Refresh workflow"><RefreshCw className="h-4 w-4" /></button>
        </div>

        <div className={`mt-4 rounded-xl border p-3 ${overdue ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex items-center justify-between gap-2 text-xs font-semibold">
            <span className={overdue ? 'text-red-700' : 'text-slate-600'}><Clock3 className="mr-1 inline h-3.5 w-3.5" />Stage age {formatDuration(stageHours)}</span>
            <span className={overdue ? 'text-red-700' : 'text-slate-400'}>{policy?.slaHours ? `${policy.slaHours}h SLA` : 'No SLA'}</span>
          </div>
          {overdue && <p className="mt-2 text-xs leading-5 text-red-700">This review is overdue. ProFox recruitment automation will continue surfacing it until the protected stage changes.</p>}
        </div>

        {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
        {notice && <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice}</span></div>}

        {policy?.interviewRequired && (
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex items-center justify-between gap-2"><div className="text-xs font-bold uppercase tracking-wide text-[#000080]">Required interview</div>{completedInterview ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : interviewSkipped ? <ShieldCheck className="h-4 w-4 text-amber-600" /> : <CalendarClock className="h-4 w-4 text-[#000080]" />}</div>
            {interviewSkipped ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><div className="font-bold">Skipped by Administrator</div><div className="mt-1">{bookingContext?.skipReason || 'Administrative exception recorded.'}</div><div className="mt-1 text-amber-700">{bookingContext?.skippedByName ? `By ${bookingContext.skippedByName}` : 'Admin action'}{bookingContext?.skippedAt ? ` · ${fmt(bookingContext.skippedAt)}` : ''}</div></div>
            ) : latestInterview ? (
              <div className="mt-2 text-xs leading-5 text-slate-600"><div className="font-semibold text-slate-800">{latestInterview.status}</div><div>{fmt(latestInterview.startAt)} · {latestInterview.timezone}</div>{latestInterview.interviewerName && <div>Interviewer: {latestInterview.interviewerName}</div>}{latestInterview.meetingUrl ? <a href={latestInterview.meetingUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block font-semibold text-[#000080]">Open meeting link</a> : latestInterview.status === 'Scheduled' ? <div className="mt-1 text-slate-400">Google Meet link is being created automatically.</div> : null}</div>
            ) : <p className="mt-2 text-xs leading-5 text-slate-600">Book and complete the required interview before this stage can be marked Passed. The meeting link is generated automatically from the responsible person&apos;s connected calendar.</p>}

            {!latestInterview && !interviewSkipped && <button type="button" onClick={() => setInterviewOpen(true)} disabled={busy} className="mt-3 w-full rounded-lg bg-[#000080] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50">Book Interview</button>}

            {latestInterview && !interviewSkipped && latestInterview.status !== 'Completed' && (
              <div className="mt-3 space-y-2">
                <select value={interviewStatus} onChange={event => setInterviewStatus(event.target.value as RecruitmentInterviewStatus)} className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-sm font-semibold">
                  {(['Completed', 'No Show', 'Cancelled', 'Rescheduled', 'Scheduled'] as RecruitmentInterviewStatus[]).map(status => <option key={status}>{status}</option>)}
                </select>
                <textarea value={interviewOutcome} onChange={event => setInterviewOutcome(event.target.value)} rows={2} placeholder="Interview outcome / notes" className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#000080]" />
                <button type="button" onClick={() => void updateLatestInterview()} disabled={busy} className="w-full rounded-lg border border-[#000080]/20 bg-white px-3 py-2.5 text-xs font-bold text-[#000080] disabled:opacity-50">Update Interview</button>
                {(['Rescheduled', 'Cancelled', 'No Show'] as RecruitmentInterviewStatus[]).includes(latestInterview.status) && <button type="button" onClick={() => setInterviewOpen(true)} disabled={busy} className="w-full rounded-lg bg-[#000080] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50">Book New Time</button>}
              </div>
            )}

            {bookingContext?.canSkip && !interviewSkipped && !completedInterview && <button type="button" onClick={() => setSkipInterviewOpen(true)} disabled={busy} className="mt-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-xs font-bold text-amber-800 disabled:opacity-50">Skip Interview (Admin)</button>}
          </div>
        )}

        {policy?.assessmentRequired && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Structured assessment</div>{passedAssessment ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <FileCheck2 className="h-4 w-4 text-slate-500" />}</div>
            <div className="mt-2 text-xs leading-5 text-slate-600">Passing score: <strong>{policy.passingScore ?? 0}%</strong>{latestAssessment ? <> · Latest: <strong>{latestAssessment.score}% {latestAssessment.status}</strong></> : ' · Not yet scored'}</div>
            <button type="button" onClick={openAssessmentForm} disabled={busy} className="mt-3 w-full rounded-lg bg-[#000080] px-3 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{latestAssessment ? 'Record New Assessment Attempt' : 'Record Assessment'}</button>
            {policy.interviewRequired && !completedInterview && !interviewSkipped && <p className="mt-2 text-xs leading-5 text-amber-700">You can record scores, Failed, or Retry Required now. Complete the required interview, or an Admin may use the audited skip exception, before choosing Passed.</p>}
            {policy.interviewRequired && interviewSkipped && <p className="mt-2 text-xs leading-5 text-amber-700">The interview requirement was skipped by Admin. The structured assessment is still required and remains fully protected.</p>}
          </div>
        )}

        <div className="mt-4 space-y-2">
          {String(applicant.stage) === 'Selected' && applicant.agreementStatus === 'not_sent' && <button type="button" onClick={() => void issueAgreement()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#000080] py-2.5 text-xs font-bold text-white disabled:opacity-50"><FileSignature className="h-4 w-4" />Issue & Send {descriptor.roleLabel} Agreement</button>}
          {['Selected', 'Agreement Pending'].includes(String(applicant.stage)) && applicant.agreementStatus !== 'not_sent' && <a href={`/admin/agreements?applicant=${encodeURIComponent(applicant.id)}`} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-2.5 text-xs font-bold text-[#000080]"><FileSignature className="h-4 w-4" />Open Agreement Record</a>}
          {['Selected', 'Agreement Pending', academyStage].includes(String(applicant.stage)) && applicant.agreementStatus === 'signed' && <button type="button" onClick={() => void sendAcademyAccess()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Mail className="h-4 w-4" />{meta?.onboardingInviteCount ? `Resend ${descriptor.academyLabel} Access` : `Send ${descriptor.academyLabel} Access`}</button>}
          {String(applicant.stage) === academyStage && <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-slate-600"><div className="flex items-center gap-2 font-bold text-[#000080]"><UserCheck className="h-4 w-4" />{descriptor.academyLabel}</div><p className="mt-1">The candidate must complete the assigned training track and independently reviewed final certification, then request Final Approval. Management cannot bypass these server-side gates.</p>{linkedUser && <p className="mt-2 font-semibold">Account: {linkedUser.email} · {linkedUser.status} · {linkedUser.onboardingProgress || 0}%</p>}{meta?.onboardingInviteLastSentAt && <p className="mt-1">Last access email: {fmt(meta.onboardingInviteLastSentAt)}</p>}</div>}
          {String(applicant.stage) === 'Final Approval' && <button type="button" onClick={() => void finalApprove()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 py-2.5 text-xs font-bold text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4" />Run {descriptor.roleLabel} Final Approval Gate</button>}
          {String(applicant.stage) === 'Ready for System Access' && <button type="button" onClick={() => void activate()} disabled={busy || !applicant.linkedUserId} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 py-2.5 text-xs font-bold text-white disabled:opacity-50"><UserCheck className="h-4 w-4" />Activate {descriptor.roleLabel}</button>}
          {String(applicant.stage) === 'Activated' && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />{descriptor.roleLabel} access is active.</div>}
          {!protectedStages.includes(String(applicant.stage)) && nextStage && <button type="button" onClick={() => void advance()} disabled={busy || !normalAdvanceAllowed || !interviewReady || (String(applicant.stage) === 'Video Pending' && !hasVideo)} className="w-full rounded-lg bg-[#000080] py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Advance to {nextStage}</button>}
          {String(applicant.stage) === 'Video Pending' && !hasVideo && <p className="text-xs leading-5 text-amber-700">The introduction video must be available before Video Review.</p>}
          {policy?.assessmentRequired && !passedAssessment && <p className="text-xs leading-5 text-slate-500">A passed structured assessment is required before progression.</p>}
        </div>

        {busy && <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Applying protected workflow...</div>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Attribution</div>
        <div className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
          <div><strong>Source:</strong> {meta?.utmSource || applicant.heardAboutSource || applicant.source || 'Unknown'}</div>
          {meta?.utmCampaign && <div><strong>Campaign:</strong> {meta.utmCampaign}</div>}
          {meta?.utmMedium && <div><strong>Medium:</strong> {meta.utmMedium}</div>}
          <div><strong>Workflow:</strong> {jobContext.workflowKey || 'default'} · {jobContext.trainingTrack}</div>
        </div>
      </section>

      {preAgreement && String(applicant.stage) !== 'Activated' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <button type="button" onClick={() => setOverrideOpen(value => !value)} className="flex w-full items-center justify-between text-left text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400"><span>Documented correction</span><ChevronDown className={`h-4 w-4 transition ${overrideOpen ? 'rotate-180' : ''}`} /></button>
          {overrideOpen && <div className="mt-3 space-y-2"><select value={overrideStage} onChange={event => setOverrideStage(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold">{overrideStages.map(stage => <option key={stage}>{stage}</option>)}</select><textarea value={overrideReason} onChange={event => setOverrideReason(event.target.value)} rows={2} placeholder="Specific correction reason, minimum 12 characters" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#000080]" /><button type="button" onClick={() => void applyOverride()} disabled={busy || overrideReason.trim().length < 12 || overrideStage === String(applicant.stage)} className="w-full rounded-lg border border-slate-200 py-2.5 text-xs font-bold text-slate-600 disabled:opacity-40">Apply Stage Correction</button><p className="text-xs leading-5 text-slate-400">This cannot bypass Agreement, Academy, Final Approval or activation.</p></div>}
        </section>
      )}

      {String(applicant.stage) !== 'Activated' && (
        <section className="rounded-2xl border border-red-100 bg-red-50/50 p-4">
          {!closeOpen ? <button type="button" onClick={() => setCloseOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white py-2.5 text-xs font-bold text-red-600"><XCircle className="h-4 w-4" />Close Candidate</button> : <div className="space-y-2"><select value={closeReason} onChange={event => setCloseReason(event.target.value)} className="w-full rounded-lg border border-red-200 bg-white px-3 py-2.5 text-sm">{closeReasons.map(reason => <option key={reason}>{reason}</option>)}</select><textarea value={closeNotes} onChange={event => setCloseNotes(event.target.value)} rows={2} placeholder="Optional internal closure notes" className="w-full rounded-lg border border-red-200 bg-white px-3 py-2.5 text-sm outline-none" /><div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><button type="button" onClick={() => void closeCandidate()} disabled={busy} className="rounded-lg bg-red-600 py-2.5 text-xs font-bold text-white">Confirm Close</button><button type="button" onClick={() => setCloseOpen(false)} className="rounded-lg border border-red-200 bg-white py-2.5 text-xs font-bold text-slate-600">Cancel</button></div><p className="text-xs leading-5 text-red-700">If onboarding access already exists, the protected close operation revokes it immediately.</p></div>}
        </section>
      )}

      {assessmentOpen && policy && (
        <div className="fixed inset-0 z-[140] flex items-stretch justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[94vh] sm:rounded-3xl">
            <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#000080]">Structured recruitment assessment</div>
                  <h3 className="mt-1 text-xl font-bold text-slate-900">{applicant.stage}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">Score the configured rubric for {applicant.fullName}. The form will prevent a decision that conflicts with the protected recruitment rules.</p>
                </div>
                <button type="button" onClick={() => setAssessmentOpen(false)} disabled={busy} className="shrink-0 rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:border-slate-300 hover:text-slate-800 disabled:opacity-50" aria-label="Close assessment"><XCircle className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-semibold text-slate-500">Calculated score</div><div className="mt-1 text-2xl font-bold text-slate-900">{assessmentScore}%</div></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-semibold text-slate-500">Passing score</div><div className="mt-1 text-2xl font-bold text-slate-900">{passingScore}%</div></div>
                <div className={`rounded-2xl border p-4 ${passEligible ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><div className={`text-xs font-semibold ${passEligible ? 'text-emerald-700' : 'text-amber-700'}`}>Pass eligibility</div><div className={`mt-1 text-base font-bold ${passEligible ? 'text-emerald-800' : 'text-amber-800'}`}>{passEligible ? 'Ready to pass' : 'Not ready'}</div></div>
              </div>

              <section className="mt-6">
                <div className="mb-3"><h4 className="text-sm font-bold text-slate-900">1. Score the assessment rubric</h4><p className="mt-1 text-xs leading-5 text-slate-500">Enter points for each configured criterion. The percentage is calculated automatically.</p></div>
                <div className="space-y-3">
                  {(policy.rubric || []).map(item => (
                    <div key={item.key} className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-[minmax(0,1fr)_130px] sm:items-center">
                      <div><div className="text-sm font-semibold leading-5 text-slate-800">{item.label}</div><div className="mt-1 text-xs text-slate-500">Maximum {item.maxPoints} points</div></div>
                      <label className="block"><span className="sr-only">Points for {item.label}</span><input type="number" inputMode="numeric" min={0} max={item.maxPoints} value={rubricScores[item.key] ?? 0} onChange={event => setRubricScores(values => ({ ...values, [item.key]: Math.max(0, Math.min(item.maxPoints, Number(event.target.value || 0))) }))} className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base font-semibold text-slate-900 outline-none transition focus:border-[#000080] focus:ring-2 focus:ring-[#000080]/10" /></label>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-6 rounded-2xl border border-slate-200 p-4 sm:p-5">
                <h4 className="text-sm font-bold text-slate-900">2. Critical failure check</h4>
                <p className="mt-1 text-xs leading-5 text-slate-500">Choose this explicitly. Do not type “none” into a failure field. A real critical failure blocks Passed regardless of the score.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => { setHasCriticalFailure(false); setCriticalFailures(''); }} className={`rounded-xl border p-4 text-left transition ${!hasCriticalFailure ? 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}><div className="flex items-center gap-2 text-sm font-bold text-slate-900"><CheckCircle2 className="h-4 w-4 text-emerald-600" />No critical failure</div><p className="mt-1 text-xs leading-5 text-slate-500">Use this when no disqualifying issue was found.</p></button>
                  <button type="button" onClick={() => { setHasCriticalFailure(true); if (assessmentStatus === 'Passed') setAssessmentStatus('Retry Required'); }} className={`rounded-xl border p-4 text-left transition ${hasCriticalFailure ? 'border-red-300 bg-red-50 ring-2 ring-red-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}><div className="flex items-center gap-2 text-sm font-bold text-slate-900"><AlertCircle className="h-4 w-4 text-red-600" />Critical failure found</div><p className="mt-1 text-xs leading-5 text-slate-500">Use only for a genuine failure that prevents a Passed decision.</p></button>
                </div>
                {hasCriticalFailure && <label className="mt-4 block"><span className="text-sm font-semibold text-slate-800">Critical failure details</span><span className="mt-1 block text-xs leading-5 text-slate-500">Enter one specific failure per line. At least one detail is required.</span><textarea value={criticalFailures} onChange={event => setCriticalFailures(event.target.value)} rows={3} placeholder="Example: Candidate could not demonstrate required identity / evidence standard" className="mt-2 w-full rounded-xl border border-red-200 bg-white px-3 py-3 text-base text-slate-900 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100" /></label>}
              </section>

              <section className="mt-6">
                <h4 className="text-sm font-bold text-slate-900">3. Select the assessment decision</h4>
                <p className="mt-1 text-xs leading-5 text-slate-500">Passed is available only when every configured passing condition is satisfied.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {(['Passed', 'Retry Required', 'Failed'] as RecruitmentAssessmentStatus[]).map(status => {
                    const disabled = status === 'Passed' && !passEligible;
                    const selected = assessmentStatus === status;
                    return <button key={status} type="button" disabled={disabled} onClick={() => setAssessmentStatus(status)} className={`rounded-xl border px-4 py-3 text-sm font-bold transition ${selected ? 'border-[#000080] bg-[#000080] text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-[#000080]/30'} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:border-slate-200`}>{status}</button>;
                  })}
                </div>
                {!meetsPassingScore && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />Score is below the configured {passingScore}% passing mark.</div>}
                {hasCriticalFailure && <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />A critical failure is recorded, so Passed is intentionally unavailable.</div>}
                {policy.interviewRequired && !completedInterview && !interviewSkipped && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"><CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />This stage requires a completed interview before Passed. An Administrator may use the audited skip only when the interview genuinely should not be required.</div>}
                {policy.interviewRequired && interviewSkipped && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />The interview requirement was administratively skipped and audited. Passed is still controlled by the score and critical-failure rules.</div>}
              </section>

              <section className="mt-6 space-y-4">
                <div><h4 className="text-sm font-bold text-slate-900">4. Evidence and evaluator notes</h4><p className="mt-1 text-xs leading-5 text-slate-500">Record enough evidence for another reviewer to understand how the score and decision were reached.</p></div>
                <label className="block"><span className="text-sm font-semibold text-slate-800">Assessment evidence</span><span className="mt-1 block text-xs leading-5 text-slate-500">Summarize the specific observations, answers, examples, or work reviewed.</span><textarea value={evidence} onChange={event => setEvidence(event.target.value)} rows={4} placeholder="Describe the evidence supporting the rubric scores..." className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-base text-slate-900 outline-none transition focus:border-[#000080] focus:ring-2 focus:ring-[#000080]/10" /></label>
                <label className="block"><span className="text-sm font-semibold text-slate-800">Evidence link <span className="font-normal text-slate-400">(optional)</span></span><span className="mt-1 block text-xs leading-5 text-slate-500">Add a shareable portfolio, GitHub, practical task, recording, or supporting file link when relevant.</span><input type="url" value={evidenceUrl} onChange={event => setEvidenceUrl(event.target.value)} placeholder="https://..." className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-base text-slate-900 outline-none transition focus:border-[#000080] focus:ring-2 focus:ring-[#000080]/10" /></label>
                <label className="block"><span className="text-sm font-semibold text-slate-800">Evaluator notes <span className="font-normal text-slate-400">(optional)</span></span><span className="mt-1 block text-xs leading-5 text-slate-500">Add internal context or follow-up instructions not already captured above.</span><textarea value={assessmentNotes} onChange={event => setAssessmentNotes(event.target.value)} rows={3} placeholder="Internal evaluator notes..." className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-base text-slate-900 outline-none transition focus:border-[#000080] focus:ring-2 focus:ring-[#000080]/10" /></label>
              </section>

              {assessmentValidationError && <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700"><AlertCircle className="mt-1 h-4 w-4 shrink-0" /><span>{assessmentValidationError}</span></div>}

              <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-xs leading-5 text-slate-600">
                <strong className="text-[#000080]">What happens when you save?</strong>
                <p className="mt-1">If the decision is <strong>Passed</strong>, the assessment and movement to the next valid recruitment stage are processed together. If the decision is <strong>Retry Required</strong> or <strong>Failed</strong>, the attempt is saved and the candidate stays in the current stage.</p>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setAssessmentOpen(false)} disabled={busy} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                <button type="button" onClick={() => void submitAssessment()} disabled={busy || Boolean(assessmentValidationError)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#000066] disabled:cursor-not-allowed disabled:opacity-40">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{assessmentStatus === 'Passed' ? 'Save & Process Passed Assessment' : 'Save Assessment'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {interviewOpen && bookingContext && <RecruitmentInterviewBookingDialog applicantId={applicant.id} candidateName={applicant.fullName} candidateTimezone={applicant.timezone} context={bookingContext} onClose={() => setInterviewOpen(false)} onBooked={interviewBooked} />}
      {skipInterviewOpen && <RecruitmentInterviewSkipDialog applicantId={applicant.id} candidateName={applicant.fullName} stage={String(applicant.stage)} onClose={() => setSkipInterviewOpen(false)} onSkipped={interviewSkippedByAdmin} />}
    </div>
  );
}
