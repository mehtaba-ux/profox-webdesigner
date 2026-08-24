import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileSignature,
  FileText,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Star,
  UserCheck,
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
import { APPLICANT_STAGES } from '../../types';
import RecruitmentOperationsControls from './RecruitmentOperationsControls';
import RecruitmentWorkflowPanel from './RecruitmentWorkflowPanel';

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
}

function formatDateTime(value?: string) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function agreementLabel(value: string) {
  if (value === 'not_sent') return 'Not issued';
  if (value === 'sent') return 'Issued / awaiting signatures';
  if (value === 'signed') return 'Signed & verified';
  if (value === 'declined') return 'Declined';
  return value?.replaceAll('_', ' ') || 'Not issued';
}

function humanizeKey(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, letter => letter.toUpperCase());
}

function evidenceValue(value: unknown) {
  if (value == null || value === '') return 'Not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Not provided';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export default function RecruitmentDashboard() {
  const [view, setView] = useState<'board' | 'list'>('board');
  const [applicants, setApplicants] = useState<ApplicantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState<ApplicantRecord | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const fetchApplicants = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await applicantService.getApplicants();
      setApplicants(rows);
      if (selectedApplicant) {
        const fresh = rows.find(row => row.id === selectedApplicant.id);
        if (fresh) setSelectedApplicant(fresh);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load applicants.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchApplicants(); }, []);

  const visibleApplicants = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return applicants.filter(applicant => {
      if (!showClosed && applicant.refusalReason) return false;
      if (!query) return true;
      return applicant.fullName.toLowerCase().includes(query)
        || applicant.email.toLowerCase().includes(query)
        || (applicant.applicationReference || '').toLowerCase().includes(query)
        || (applicant.position || '').toLowerCase().includes(query)
        || (applicant.country || '').toLowerCase().includes(query);
    });
  }, [applicants, searchTerm, showClosed]);

  const activeCount = applicants.filter(item => !item.refusalReason && item.stage !== 'Activated').length;
  const activatedCount = applicants.filter(item => item.stage === 'Activated').length;
  const closedCount = applicants.filter(item => Boolean(item.refusalReason)).length;

  if (loading && !applicants.length) {
    return <div className="flex h-[600px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">People · Recruitment</div>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Team Recruitment</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">One protected candidate record from application and evidence review through the correct role agreement, Academy, Final Approval and activation.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RecruitmentOperationsControls />
          <a href="/admin/agreements" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-[#000080] shadow-sm"><FileSignature className="h-4 w-4" />Candidate Agreements</a>
          <button type="button" onClick={() => setIsAdding(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white shadow-sm"><Plus className="h-4 w-4" />Add Manual Applicant</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="In recruitment" value={activeCount} />
        <Metric label="Activated" value={activatedCount} tone="success" />
        <Metric label="Closed" value={closedCount} />
      </div>

      {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search candidate, role, email, country or application reference..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[#000080]" /></div>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-500"><input type="checkbox" checked={showClosed} onChange={event => setShowClosed(event.target.checked)} className="h-4 w-4 accent-[#000080]" />Show closed</label>
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1"><button type="button" onClick={() => setView('board')} aria-label="Board view" className={`rounded-lg p-2 ${view === 'board' ? 'bg-white text-[#000080] shadow-sm' : 'text-slate-400'}`}><LayoutGrid className="h-4 w-4" /></button><button type="button" onClick={() => setView('list')} aria-label="List view" className={`rounded-lg p-2 ${view === 'list' ? 'bg-white text-[#000080] shadow-sm' : 'text-slate-400'}`}><ListIcon className="h-4 w-4" /></button></div>
        <button type="button" onClick={() => void fetchApplicants()} disabled={loading} className="rounded-xl border border-slate-200 p-2.5 text-slate-400 hover:text-[#000080] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      {view === 'board'
        ? <RecruitmentBoard applicants={visibleApplicants} onSelect={setSelectedApplicant} />
        : <ApplicantList applicants={visibleApplicants} onSelect={setSelectedApplicant} />}

      {selectedApplicant && <ApplicantDetailModal applicant={selectedApplicant} onClose={() => setSelectedApplicant(null)} onUpdate={fetchApplicants} />}
      {isAdding && <AddApplicantModal onClose={() => setIsAdding(false)} onUpdate={fetchApplicants} />}
    </div>
  );
}

function Metric({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'success' }) {
  return <div className={`rounded-2xl border p-4 ${tone === 'success' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</div><div className={`mt-1 text-2xl font-black ${tone === 'success' ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</div></div>;
}

function RecruitmentBoard({ applicants, onSelect }: { applicants: ApplicantRecord[]; onSelect: (applicant: ApplicantRecord) => void }) {
  return <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-6 sm:-mx-6 sm:px-6">{APPLICANT_STAGES.map(stage => {
    const rows = applicants.filter(applicant => applicant.stage === stage);
    return <div key={stage} className="w-[290px] min-w-[290px]"><div className="mb-2 flex items-center justify-between px-1"><h3 className="text-[10px] font-black uppercase tracking-wide text-slate-500">{stage}</h3><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">{rows.length}</span></div><div className="flex min-h-[360px] flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-2">{rows.map(applicant => <button type="button" key={applicant.id} onClick={() => onSelect(applicant)} className={`group rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-[#000080]/30 hover:shadow-md ${applicant.refusalReason ? 'border-red-200 opacity-75' : 'border-slate-200'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate text-sm font-black text-slate-900 group-hover:text-[#000080]">{applicant.fullName}</h4><div className="mt-0.5 truncate text-[9px] font-bold text-slate-400">{applicant.applicationReference || 'Manual / legacy'}</div></div>{applicant.rating > 0 && <span className="flex items-center text-[9px] font-black text-amber-500"><Star className="mr-0.5 h-3 w-3 fill-current" />{applicant.rating}</span>}</div><div className="mt-3 space-y-1.5 text-[10px] font-medium text-slate-500"><div className="flex items-center gap-1.5"><Briefcase className="h-3 w-3" />{applicant.position}</div><div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{applicant.country || 'Global'}{applicant.timezone ? ` · ${applicant.timezone}` : ''}</div></div><div className="mt-3 flex items-center justify-between"><div className="flex items-center gap-1">{(applicant.cvUrl || applicant.cvStoragePath) && <FileText className="h-3.5 w-3.5 text-blue-600" />}{(applicant.videoUrl || applicant.videoStoragePath) && <Video className="h-3.5 w-3.5 text-purple-600" />}{applicant.linkedUserId && <UserCheck className="h-3.5 w-3.5 text-emerald-600" />}</div><span className="flex items-center gap-1 text-[9px] font-black text-slate-400">{applicant.refusalReason ? 'Closed' : applicant.source || 'Manual'}<ChevronRight className="h-3 w-3" /></span></div></button>)}{!rows.length && <div className="flex flex-1 items-center justify-center text-[10px] font-bold text-slate-300">No candidates</div>}</div></div>;
  })}</div>;
}

function ApplicantList({ applicants, onSelect }: { applicants: ApplicantRecord[]; onSelect: (applicant: ApplicantRecord) => void }) {
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full text-left"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-4">Candidate</th><th className="px-5 py-4">Reference</th><th className="px-5 py-4">Role</th><th className="px-5 py-4">Stage</th><th className="px-5 py-4">Agreement</th><th className="px-5 py-4">Applied</th><th className="px-5 py-4 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{applicants.map(applicant => <tr key={applicant.id} onClick={() => onSelect(applicant)} className="cursor-pointer hover:bg-slate-50"><td className="px-5 py-4"><div className="text-sm font-black text-slate-900">{applicant.fullName}</div><div className="text-[10px] text-slate-400">{applicant.email}{applicant.refusalReason ? ` · Closed: ${applicant.refusalReason}` : ''}</div></td><td className="px-5 py-4 text-[10px] font-black text-slate-600">{applicant.applicationReference || 'Legacy'}</td><td className="px-5 py-4 text-[10px] font-bold text-slate-600">{applicant.position}</td><td className="px-5 py-4"><span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[9px] font-black text-[#000080]">{applicant.stage}</span></td><td className="px-5 py-4 text-[10px] font-bold text-slate-600">{agreementLabel(applicant.agreementStatus)}</td><td className="px-5 py-4 text-[10px] text-slate-500">{formatDateTime(applicant.applicationSubmittedAt || applicant.createdAt)}</td><td className="px-5 py-4 text-right"><MoreHorizontal className="ml-auto h-4 w-4 text-slate-400" /></td></tr>)}{!applicants.length && <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-400">No candidates found.</td></tr>}</tbody></table></div></div>;
}

function ApplicantDetailModal({ applicant, onClose, onUpdate }: { applicant: ApplicantRecord; onClose: () => void; onUpdate: () => Promise<void> }) {
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
      setError(getErrorMessage(err, 'Could not load the complete candidate record.'));
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
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-8"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black text-slate-900">{current.fullName}</h2>{current.applicationReference && <span className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-500">{current.applicationReference}</span>}</div><div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-black text-slate-600">{current.position}</span><span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[9px] font-black text-[#000080]">{current.stage}</span>{current.finalApproval && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-700">Final Approved</span>}{current.refusalReason && <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[9px] font-black text-red-700">Closed</span>}<span className="text-[9px] font-medium text-slate-400">Submitted {formatDateTime(current.applicationSubmittedAt || current.createdAt)}</span></div></div><button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><XCircle className="h-6 w-6" /></button></header>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 sm:px-8"><div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">{(['overview', 'application', 'timeline'] as const).map(item => <button type="button" key={item} onClick={() => setTab(item)} className={`rounded-lg px-3 py-2 text-xs font-black capitalize ${tab === item ? 'bg-[#000080] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{item === 'timeline' ? `Timeline${timeline.length ? ` (${timeline.length})` : ''}` : item}</button>)}</div><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-500 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div>
        <div className="min-h-0 flex-1 overflow-y-auto">{error && <div className="mx-5 mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 sm:mx-8"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}{loading ? <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /></div> : <div className="grid gap-8 p-5 sm:p-8 xl:grid-cols-[minmax(0,1fr)_340px]"><main>{tab === 'overview' ? <Overview applicant={current} snapshot={snapshot} cvUrl={cvUrl} videoUrl={videoUrl} /> : tab === 'application' ? <ApplicationDetail applicant={current} snapshot={snapshot} cvUrl={cvUrl} videoUrl={videoUrl} /> : <Timeline events={timeline} />}</main><aside>{current.refusalReason ? <div className="rounded-2xl border border-red-200 bg-red-50 p-5"><div className="flex items-center gap-2 text-sm font-black text-red-700"><XCircle className="h-5 w-5" />Candidate closed</div><p className="mt-2 text-xs leading-5 text-red-700">{current.refusalReason}</p><p className="mt-3 text-[10px] leading-4 text-slate-500">The record and timeline remain available for audit. Reopening a closed candidate is intentionally not available from the normal workflow.</p></div> : <RecruitmentWorkflowPanel applicant={current} currentAdminId={user?.id} onChanged={workflowChanged} />}</aside></div>}</div>
      </div>
    </div>
  );
}

function Overview({ applicant, snapshot, cvUrl, videoUrl }: { applicant: ApplicantRecord; snapshot: ApplicantReviewSnapshot | null; cvUrl: string; videoUrl: string }) {
  const roleAnswers = snapshot?.answers && Object.keys(snapshot.answers).length ? snapshot.answers : applicant.applicationAnswers;
  return <div className="space-y-7"><section className="grid gap-4 sm:grid-cols-4"><Summary label="Application" value={applicant.applicationReference || 'Legacy record'} /><Summary label="Completeness" value={snapshot ? `${snapshot.completenessPercent}%` : 'Legacy / unscored'} tone={snapshot?.readyForReview ? 'success' : 'default'} /><Summary label="Role" value={applicant.position || 'Candidate'} /><Summary label="Availability" value={applicant.availableHoursPerWeek ? `${applicant.availableHoursPerWeek} hrs/week` : 'See application evidence'} /></section>{snapshot && <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-black text-slate-900">Application readiness</h3><p className="mt-1 text-xs text-slate-500">Derived from the candidate's active Job Post, role policy and canonical application record.</p></div><span className={`rounded-full px-3 py-1 text-[9px] font-black ${snapshot.readyForReview ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{snapshot.passedChecks}/{snapshot.totalChecks} checks</span></div><div className="mt-5 grid gap-2 sm:grid-cols-2">{snapshot.checks.map(check => <div key={check.key} className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${check.passed ? 'border-emerald-100 bg-emerald-50/60' : 'border-amber-100 bg-amber-50/60'}`}>{check.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}<div><div className="font-bold text-slate-700">{check.label}</div>{check.detail && <div className="mt-0.5 text-[10px] text-slate-500">{check.detail}</div>}</div></div>)}</div></section>}
    <section><SectionLabel>Candidate snapshot</SectionLabel><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Info label="Email"><a className="font-bold text-[#000080] hover:underline" href={`mailto:${applicant.email}`}>{applicant.email}</a></Info><Info label="Phone">{applicant.phone || 'Not provided'}</Info><Info label="Country / Time zone">{applicant.country || 'Not provided'}{applicant.timezone ? ` · ${applicant.timezone}` : ''}</Info><Info label="Current role">{applicant.currentJobTitle || 'Not provided'}</Info><Info label="Target position">{applicant.position || 'Not provided'}</Info><Info label="Earliest start">{applicant.earliestStartDate || 'Not provided'}</Info></div>{applicant.linkedinUrl && <a href={applicant.linkedinUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-xs font-black text-[#000080]">Open LinkedIn <ExternalLink className="h-3.5 w-3.5" /></a>}</section>
    <section><SectionLabel>Application materials</SectionLabel><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><MaterialCard label="CV / Resume" available={Boolean(cvUrl)} url={cvUrl} icon={<FileText className="h-5 w-5" />} /><MaterialCard label="Introduction Video" available={Boolean(videoUrl)} url={videoUrl} icon={<Video className="h-5 w-5" />} /><MaterialCard label="Portfolio / Work Evidence" available={Boolean(snapshot?.portfolioUrl || applicant.portfolioUrl)} url={snapshot?.portfolioUrl || applicant.portfolioUrl} icon={<Briefcase className="h-5 w-5" />} /></div></section>
    {roleAnswers && Object.keys(roleAnswers).length > 0 ? <RoleEvidence answers={roleAnswers} /> : <section><SectionLabel>Evidence at a glance</SectionLabel><div className="grid gap-4 lg:grid-cols-2"><TextCard title="Previous measurable sales result" text={applicant.previousSalesResults} /><TextCard title="Sample cold outreach" text={applicant.sampleOutreachMessage} /></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><TagCard title="Target markets" items={applicant.targetMarkets} /><TagCard title="Prospecting channels" items={applicant.prospectingChannels} /></div></section>}
  </div>;
}

function ApplicationDetail({ applicant, snapshot, cvUrl, videoUrl }: { applicant: ApplicantRecord; snapshot: ApplicantReviewSnapshot | null; cvUrl: string; videoUrl: string }) {
  const roleAnswers = snapshot?.answers && Object.keys(snapshot.answers).length ? snapshot.answers : applicant.applicationAnswers;
  return <div className="space-y-7"><section><SectionLabel>Application identity</SectionLabel><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Info label="Reference">{applicant.applicationReference || 'Legacy'}</Info><Info label="Application version">{applicant.applicationVersion || 'legacy'}</Info><Info label="Policy version">{applicant.applicationPolicyVersion || 'Not recorded'}</Info><Info label="Submitted">{formatDateTime(applicant.applicationSubmittedAt || applicant.createdAt)}</Info><Info label="Source">{applicant.source || 'Not provided'}</Info><Info label="Target role">{applicant.position || 'Not provided'}</Info></div></section>
    <section><SectionLabel>Personal details</SectionLabel><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Info label="Full name">{applicant.fullName}</Info><Info label="Email">{applicant.email}</Info><Info label="Phone">{applicant.phone || 'Not provided'}</Info><Info label="Country">{applicant.country || 'Not provided'}{applicant.countryCode ? ` (${applicant.countryCode})` : ''}</Info><Info label="Time zone">{applicant.timezone || 'Not provided'}</Info><Info label="Current role">{applicant.currentJobTitle || 'Not provided'}</Info></div></section>
    {roleAnswers && Object.keys(roleAnswers).length > 0 ? <RoleEvidence answers={roleAnswers} /> : <><section><SectionLabel>Sales experience</SectionLabel><div className="grid gap-4 sm:grid-cols-3"><Summary label="Total sales experience" value={applicant.salesExperienceMonths != null ? `${applicant.salesExperienceMonths} months` : 'Legacy / not structured'} /><Summary label="B2B experience" value={applicant.b2bExperienceMonths != null ? `${applicant.b2bExperienceMonths} months` : 'Not provided'} /><Summary label="English" value={applicant.englishRating || 'Not provided'} /></div><div className="mt-4 space-y-4"><TextCard title="Sales experience" text={applicant.salesExperience} /><TextCard title="Digital / SaaS / website sales" text={applicant.digitalSalesExperience} /><TextCard title="International sales experience" text={applicant.internationalSalesExperience} /><TextCard title="Previous measurable sales result" text={applicant.previousSalesResults} /><TextCard title="CRM experience" text={applicant.crmExperience} /></div></section>
    <section><SectionLabel>Availability & practical evidence</SectionLabel><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Info label="Hours per week">{applicant.availableHoursPerWeek ? `${applicant.availableHoursPerWeek} hours` : 'Not provided'}</Info><Info label="Available days">{applicant.availableDays.length ? applicant.availableDays.join(', ') : 'Not provided'}</Info><Info label="Preferred window">{applicant.preferredWorkWindow || 'Not provided'}</Info><Info label="Earliest start">{applicant.earliestStartDate || 'Not provided'}</Info></div><div className="mt-4"><TextCard title="Sample cold outreach message" text={applicant.sampleOutreachMessage} /></div></section></>}
    <section><SectionLabel>Proof & context</SectionLabel><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><MaterialCard label="CV / Resume" available={Boolean(cvUrl)} url={cvUrl} icon={<FileText className="h-5 w-5" />} /><MaterialCard label="Introduction Video" available={Boolean(videoUrl)} url={videoUrl} icon={<Video className="h-5 w-5" />} /><MaterialCard label="Portfolio / Work Evidence" available={Boolean(snapshot?.portfolioUrl || applicant.portfolioUrl)} url={snapshot?.portfolioUrl || applicant.portfolioUrl} icon={<Briefcase className="h-5 w-5" />} /></div>{!roleAnswers && <div className="mt-4 grid gap-4 lg:grid-cols-2"><TextCard title="Professional reference" text={applicant.professionalReference} /><TextCard title="Why ProFox / additional context" text={applicant.motivation} /></div>}</section>
    {!roleAnswers && <section><SectionLabel>Applicant confirmations & consent</SectionLabel><div className="grid gap-2 sm:grid-cols-2">{[['Equipment & reliable internet', applicant.hasLaptopInternet], ['Commission-based starting model', applicant.comfortableCommission], ['Initial self-sourcing', applicant.comfortableSourcing], ['Professional English sales calls', applicant.comfortableEnglishCalls], ['Introduction video commitment', applicant.videoCommitment]].map(([label, value]) => <div key={String(label)} className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-bold ${value ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>{value ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{String(label)}</div>)}</div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Info label="Accuracy confirmed at">{formatDateTime(applicant.accuracyConfirmedAt)}</Info><Info label="Privacy consent at">{formatDateTime(applicant.privacyConsentAt)}</Info></div></section>}
  </div>;
}

function RoleEvidence({ answers }: { answers: Record<string, any> }) {
  const entries = Object.entries(answers).filter(([, value]) => value !== null && value !== undefined && value !== '');
  return <section><SectionLabel>Role-specific application evidence</SectionLabel><div className="grid gap-4 lg:grid-cols-2">{entries.map(([key, value]) => {
    const text = evidenceValue(value);
    const looksLikeUrl = /^https?:\/\//i.test(text);
    return <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{humanizeKey(key)}</div>{looksLikeUrl ? <a href={text} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-start gap-2 break-all text-xs font-bold leading-5 text-[#000080] hover:underline"><ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />{text}</a> : <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{text}</div>}</div>;
  })}</div></section>;
}

function Timeline({ events }: { events: ApplicantTimelineEvent[] }) {
  return <div><div className="mb-5"><h3 className="font-black text-slate-900">Recruitment timeline</h3><p className="mt-1 text-xs text-slate-500">Application, evidence, interview, assessment, communication, agreement, Academy and activation events.</p></div>{events.length ? <div className="relative space-y-4 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-slate-200">{events.map(event => <div key={event.id} className="relative pl-9"><span className="absolute left-0 top-3 h-[23px] w-[23px] rounded-full border-4 border-white bg-[#000080] shadow-sm" /><div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black text-slate-900">{event.title}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-500">{event.category}</span>{event.status && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black text-[#000080]">{event.status}</span>}</div>{event.detail && <p className="mt-2 text-xs leading-5 text-slate-600">{event.detail}</p>}</div><div className="text-right"><div className="text-[10px] font-black text-slate-600">{formatDateTime(event.occurredAt)}</div><div className="mt-1 text-[9px] text-slate-400">{event.actor || 'System'}</div></div></div>{event.metadata && Object.keys(event.metadata).length > 0 && <details className="mt-3"><summary className="cursor-pointer text-[10px] font-black text-[#000080]">Event details</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-3 text-[9px] leading-4 text-slate-200">{JSON.stringify(event.metadata, null, 2)}</pre></details>}</div></div>)}</div> : <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">No timeline events yet.</div>}</div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) { return <h3 className="mb-4 border-b border-slate-100 pb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{children}</h3>; }
function Info({ label, children }: { label: string; children: React.ReactNode }) { return <div><div className="mb-1 text-[9px] font-black uppercase text-slate-400">{label}</div><div className="break-words text-sm font-medium leading-6 text-slate-700">{children}</div></div>; }
function Summary({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' }) { return <div className={`rounded-2xl border p-4 ${tone === 'success' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className={`mt-2 text-sm font-black ${tone === 'success' ? 'text-emerald-700' : 'text-slate-800'}`}>{value}</div></div>; }
function MaterialCard({ label, available, url, icon }: { label: string; available: boolean; url?: string; icon: React.ReactNode }) { return <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">{icon}</div><div><p className="text-xs font-black text-slate-900">{label}</p><p className="text-[10px] text-slate-500">{available ? 'Available' : 'Missing'}</p></div></div>{available && url && <a href={url} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-[#000080]"><ArrowRight className="h-4 w-4" /></a>}</div>; }
function TextCard({ title, text }: { title: string; text?: string }) { return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{title}</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{text || 'Not provided'}</p></div>; }
function TagCard({ title, items }: { title: string; items: string[] }) { return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{title}</div><div className="mt-3 flex flex-wrap gap-2">{items.length ? items.map(item => <span key={item} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">{item}</span>) : <span className="text-xs text-slate-400">Not provided</span>}</div></div>; }

function AddApplicantModal({ onClose, onUpdate }: { onClose: () => void; onUpdate: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<ApplicantRecord>>({ fullName: '', email: '', position: 'Independent Commission-Based Sales Representative', stage: 'New Application', rating: 0, source: 'Manual Entry' });
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setLoading(true); setError(null); try { await applicantService.createApplicant(form); await onUpdate(); onClose(); } catch (err) { setError(getErrorMessage(err, 'Could not create applicant.')); } finally { setLoading(false); } };
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"><div className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl"><form onSubmit={submit}><div className="flex items-center justify-between border-b border-slate-100 px-8 py-6"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Recruitment</div><h2 className="mt-1 text-xl font-black text-slate-900">Add Manual Sales Applicant</h2></div><button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400"><XCircle className="h-6 w-6" /></button></div><div className="space-y-5 p-8">{error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}<label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase text-slate-500">Full Name *</span><input required value={form.fullName || ''} onChange={event => setForm({ ...form, fullName: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#000080]" /></label><label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase text-slate-500">Email *</span><input type="email" required value={form.email || ''} onChange={event => setForm({ ...form, email: event.target.value.trim().toLowerCase() })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#000080]" /></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-1.5 block text-[10px] font-black uppercase text-slate-500">Country</span><input value={form.country || ''} onChange={event => setForm({ ...form, country: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#000080]" /></label><label><span className="mb-1.5 block text-[10px] font-black uppercase text-slate-500">Source</span><input value={form.source || ''} onChange={event => setForm({ ...form, source: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#000080]" /></label></div><p className="text-[10px] leading-4 text-slate-400">Manual entry remains a controlled legacy Sales exception. New Development and UI/UX candidates should use their structured public Careers application so the correct job policy, evidence, consent and attribution are captured automatically.</p></div><div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-8 py-6"><button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold text-slate-500">Cancel</button><button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-6 py-2.5 text-xs font-black text-white disabled:opacity-50">{loading && <Loader2 className="h-4 w-4 animate-spin" />}Create Applicant</button></div></form></div></div>;
}
