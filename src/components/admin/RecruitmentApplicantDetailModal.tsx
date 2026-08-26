import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Video,
  XCircle,
} from 'lucide-react';
import {
  applicantService,
  type ApplicantRecord,
  type ApplicantReviewSnapshot,
  type ApplicantTimelineEvent,
} from '../../lib/applicantService';
import { useAuth } from '../../lib/AuthContext';
import RecruitmentWorkflowPanel from './RecruitmentWorkflowPanel';

interface Props {
  applicant: ApplicantRecord;
  onClose: () => void;
  onUpdate: () => Promise<void>;
}

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as any).message || fallback);
  return fallback;
}

function formatDateTime(value?: string) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function humanize(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, letter => letter.toUpperCase());
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return 'Not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Not provided';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export default function RecruitmentApplicantDetailModal({ applicant, onClose, onUpdate }: Props) {
  const { user } = useAuth();
  const [current, setCurrent] = useState(applicant);
  const [tab, setTab] = useState<'overview' | 'application' | 'timeline'>('overview');
  const [snapshot, setSnapshot] = useState<ApplicantReviewSnapshot | null>(null);
  const [timeline, setTimeline] = useState<ApplicantTimelineEvent[]>([]);
  const [cvUrl, setCvUrl] = useState(applicant.cvUrl || '');
  const [videoUrl, setVideoUrl] = useState(applicant.videoUrl || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const fresh = await applicantService.getApplicantById(applicant.id);
      setCurrent(fresh);
      const [review, events, cv, video] = await Promise.all([
        applicantService.getApplicantReviewSnapshot(applicant.id),
        applicantService.getApplicantTimeline(applicant.id),
        fresh.cvStoragePath ? applicantService.getSecureApplicationFileUrl(fresh.cvStoragePath) : Promise.resolve(fresh.cvUrl || ''),
        fresh.videoStoragePath ? applicantService.getSecureApplicationFileUrl(fresh.videoStoragePath) : Promise.resolve(fresh.videoUrl || ''),
      ]);
      setSnapshot(review);
      setTimeline(events);
      setCvUrl(cv);
      setVideoUrl(video);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the complete candidate record.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [applicant.id]);

  const workflowChanged = async () => {
    await onUpdate();
    await load();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm sm:p-4">
      <div className="flex max-h-[96vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-8">
          <div>
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black text-slate-900">{current.fullName}</h2>{current.applicationReference && <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-500">{current.applicationReference}</span>}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-600">{current.careerJobTitle || current.position}</span><span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-black text-[#000080]">{current.stage}</span>{current.finalApproval && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">Final Approved</span>}{current.refusalReason && <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-black text-red-700">Closed</span>}</div>
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50"><XCircle className="h-5 w-5" /></button>
        </header>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 sm:px-8">
          <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">{(['overview', 'application', 'timeline'] as const).map(item => <button type="button" key={item} onClick={() => setTab(item)} className={`min-h-10 rounded-lg px-3 text-sm font-black capitalize ${tab === item ? 'bg-[#000080] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{item === 'timeline' ? `Timeline${timeline.length ? ` (${timeline.length})` : ''}` : item}</button>)}</div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-500 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && <div className="mx-5 mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:mx-8"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
          {loading ? <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /></div> : <div className="grid gap-8 p-5 sm:p-8 xl:grid-cols-[minmax(0,1fr)_360px]">
            <main>{tab === 'overview' ? <Overview applicant={current} snapshot={snapshot} cvUrl={cvUrl} videoUrl={videoUrl} /> : tab === 'application' ? <ApplicationDetail applicant={current} snapshot={snapshot} cvUrl={cvUrl} videoUrl={videoUrl} /> : <Timeline events={timeline} />}</main>
            <aside>{current.refusalReason ? <div className="rounded-2xl border border-red-200 bg-red-50 p-5"><div className="flex items-center gap-2 text-sm font-black text-red-700"><XCircle className="h-5 w-5" />Candidate closed</div><p className="mt-2 text-sm leading-6 text-red-700">{current.refusalReason}</p><p className="mt-3 text-xs leading-5 text-slate-500">The record and timeline remain available for audit. Reopening is intentionally outside the normal workflow.</p></div> : <RecruitmentWorkflowPanel applicant={current} currentAdminId={user?.id} onChanged={workflowChanged} />}</aside>
          </div>}
        </div>
      </div>
    </div>
  );
}

function Overview({ applicant, snapshot, cvUrl, videoUrl }: { applicant: ApplicantRecord; snapshot: ApplicantReviewSnapshot | null; cvUrl: string; videoUrl: string }) {
  const answers = snapshot?.answers && Object.keys(snapshot.answers).length ? snapshot.answers : applicant.applicationAnswers;
  return <div className="space-y-7">
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Summary label="Application" value={applicant.applicationReference || 'Legacy record'} /><Summary label="Completeness" value={snapshot ? `${snapshot.completenessPercent}%` : 'Unscored'} tone={snapshot?.readyForReview ? 'success' : 'default'} /><Summary label="Role" value={applicant.careerJobTitle || applicant.position || 'Candidate'} /><Summary label="Current stage" value={String(applicant.stage || 'Not set')} /></section>
    {snapshot && <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black text-slate-900">Application readiness</h3><p className="mt-1 text-sm text-slate-500">Checks are derived from the candidate’s Job Post and canonical application record.</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-black ${snapshot.readyForReview ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{snapshot.passedChecks}/{snapshot.totalChecks} checks</span></div><div className="mt-5 grid gap-2 sm:grid-cols-2">{snapshot.checks.map(check => <div key={check.key} className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${check.passed ? 'border-emerald-100 bg-emerald-50/60' : 'border-amber-100 bg-amber-50/60'}`}>{check.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}<div><div className="font-bold text-slate-700">{check.label}</div>{check.detail && <div className="mt-1 text-xs text-slate-500">{check.detail}</div>}</div></div>)}</div></section>}
    <section><SectionLabel>Candidate snapshot</SectionLabel><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Info label="Email"><a className="font-bold text-[#000080] hover:underline" href={`mailto:${applicant.email}`}>{applicant.email}</a></Info><Info label="Phone">{applicant.phone || 'Not provided'}</Info><Info label="Country / Time zone">{applicant.country || 'Not provided'}{applicant.timezone ? ` · ${applicant.timezone}` : ''}</Info><Info label="Current role">{applicant.currentJobTitle || 'Not provided'}</Info><Info label="Recruiting for">{applicant.careerJobTitle || applicant.position || 'Not provided'}</Info><Info label="Submitted">{formatDateTime(applicant.applicationSubmittedAt || applicant.createdAt)}</Info></div>{applicant.linkedinUrl && <a href={applicant.linkedinUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-black text-[#000080]">Open LinkedIn <ExternalLink className="h-4 w-4" /></a>}</section>
    <Materials applicant={applicant} snapshot={snapshot} cvUrl={cvUrl} videoUrl={videoUrl} />
    {answers && Object.keys(answers).length > 0 && <RoleEvidence answers={answers} />}
  </div>;
}

function ApplicationDetail({ applicant, snapshot, cvUrl, videoUrl }: { applicant: ApplicantRecord; snapshot: ApplicantReviewSnapshot | null; cvUrl: string; videoUrl: string }) {
  const answers = snapshot?.answers && Object.keys(snapshot.answers).length ? snapshot.answers : applicant.applicationAnswers;
  const structured: Array<[string, unknown]> = [
    ['Application reference', applicant.applicationReference], ['Application version', applicant.applicationVersion], ['Policy version', applicant.applicationPolicyVersion], ['Submitted', formatDateTime(applicant.applicationSubmittedAt || applicant.createdAt)],
    ['Full name', applicant.fullName], ['Email', applicant.email], ['Phone', applicant.phone], ['Country', applicant.country], ['Time zone', applicant.timezone], ['Current role', applicant.currentJobTitle], ['Target role', applicant.careerJobTitle || applicant.position],
    ['Sales experience', applicant.salesExperience], ['Digital sales experience', applicant.digitalSalesExperience], ['International sales experience', applicant.internationalSalesExperience], ['English rating', applicant.englishRating], ['Sales experience months', applicant.salesExperienceMonths], ['B2B experience months', applicant.b2bExperienceMonths],
    ['Target markets', applicant.targetMarkets], ['Prospecting channels', applicant.prospectingChannels], ['CRM experience', applicant.crmExperience], ['Available days', applicant.availableDays], ['Hours per week', applicant.availableHoursPerWeek], ['Preferred work window', applicant.preferredWorkWindow], ['Earliest start', applicant.earliestStartDate],
    ['Previous results', applicant.previousSalesResults], ['Sample outreach', applicant.sampleOutreachMessage], ['Professional reference', applicant.professionalReference], ['Motivation / context', applicant.motivation],
  ];
  return <div className="space-y-7"><section><SectionLabel>Structured application record</SectionLabel><div className="grid gap-4 sm:grid-cols-2">{structured.filter(([, value]) => value !== undefined && value !== null && value !== '').map(([label, value]) => <TextCard key={label} title={label} text={displayValue(value)} />)}</div></section>{answers && Object.keys(answers).length > 0 && <RoleEvidence answers={answers} />}<Materials applicant={applicant} snapshot={snapshot} cvUrl={cvUrl} videoUrl={videoUrl} /></div>;
}

function Materials({ applicant, snapshot, cvUrl, videoUrl }: { applicant: ApplicantRecord; snapshot: ApplicantReviewSnapshot | null; cvUrl: string; videoUrl: string }) {
  return <section><SectionLabel>Application materials</SectionLabel><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><MaterialCard label="CV / Resume" available={Boolean(cvUrl)} url={cvUrl} icon={<FileText className="h-5 w-5" />} /><MaterialCard label="Introduction Video" available={Boolean(videoUrl)} url={videoUrl} icon={<Video className="h-5 w-5" />} /><MaterialCard label="Portfolio / Work Evidence" available={Boolean(snapshot?.portfolioUrl || applicant.portfolioUrl)} url={snapshot?.portfolioUrl || applicant.portfolioUrl} icon={<Briefcase className="h-5 w-5" />} /></div></section>;
}

function RoleEvidence({ answers }: { answers: Record<string, any> }) {
  const entries = Object.entries(answers).filter(([, value]) => value !== null && value !== undefined && value !== '');
  return <section><SectionLabel>Role-specific application evidence</SectionLabel><div className="grid gap-4 lg:grid-cols-2">{entries.map(([key, value]) => { const text = displayValue(value); const isUrl = /^https?:\/\//i.test(text); return <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-400">{humanize(key)}</div>{isUrl ? <a href={text} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-start gap-2 break-all text-sm font-bold leading-6 text-[#000080] hover:underline"><ExternalLink className="mt-1 h-4 w-4 shrink-0" />{text}</a> : <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{text}</div>}</div>; })}</div></section>;
}

function Timeline({ events }: { events: ApplicantTimelineEvent[] }) {
  return <div><div className="mb-5"><h3 className="font-black text-slate-900">Recruitment timeline</h3><p className="mt-1 text-sm text-slate-500">Application, evidence, interview, assessment, communication, agreement, Academy and activation events.</p></div>{events.length ? <div className="relative space-y-4 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-slate-200">{events.map(event => <div key={event.id} className="relative pl-9"><span className="absolute left-0 top-3 h-[23px] w-[23px] rounded-full border-4 border-white bg-[#000080] shadow-sm" /><div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black text-slate-900">{event.title}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black uppercase text-slate-500">{event.category}</span>{event.status && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-black text-[#000080]">{event.status}</span>}</div>{event.detail && <p className="mt-2 text-sm leading-6 text-slate-600">{event.detail}</p>}</div><div className="text-right"><div className="text-xs font-black text-slate-600">{formatDateTime(event.occurredAt)}</div><div className="mt-1 text-xs text-slate-400">{event.actor || 'System'}</div></div></div>{event.metadata && Object.keys(event.metadata).length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs font-black text-[#000080]">Event details</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-200">{JSON.stringify(event.metadata, null, 2)}</pre></details>}</div></div>)}</div> : <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">No timeline events yet.</div>}</div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) { return <h3 className="mb-4 border-b border-slate-100 pb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400">{children}</h3>; }
function Info({ label, children }: { label: string; children: React.ReactNode }) { return <div><div className="mb-1 text-xs font-black uppercase text-slate-400">{label}</div><div className="break-words text-sm font-medium leading-6 text-slate-700">{children}</div></div>; }
function Summary({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' }) { return <div className={`rounded-2xl border p-4 ${tone === 'success' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}><div className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</div><div className={`mt-2 text-sm font-black ${tone === 'success' ? 'text-emerald-700' : 'text-slate-800'}`}>{value}</div></div>; }
function MaterialCard({ label, available, url, icon }: { label: string; available: boolean; url?: string; icon: React.ReactNode }) { return <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">{icon}</div><div><p className="text-sm font-black text-slate-900">{label}</p><p className="text-xs text-slate-500">{available ? 'Available' : 'Missing'}</p></div></div>{available && url && <a href={url} target="_blank" rel="noreferrer" className="flex h-10 w-10 items-center justify-center rounded-lg text-[#000080]"><ArrowRight className="h-4 w-4" /></a>}</div>; }
function TextCard({ title, text }: { title: string; text?: string }) { return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-400">{title}</div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{text || 'Not provided'}</p></div>; }
