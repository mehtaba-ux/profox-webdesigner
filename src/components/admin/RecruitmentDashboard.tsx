import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  ChevronRight,
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
} from 'lucide-react';
import { applicantService, type ApplicantRecord } from '../../lib/applicantService';
import {
  recruitmentPipelineService,
  type RecruitmentPipelineJob,
  type RecruitmentPipelineStage,
} from '../../lib/recruitmentPipelineService';
import { recruitmentTaskService, type AdminRecruitmentTask } from '../../lib/recruitmentTaskService';
import { recruitmentWorkflowService, type RecruitmentSystemRole } from '../../lib/recruitmentWorkflowService';
import RecruitmentApplicantDetailModal from './RecruitmentApplicantDetailModal';
import RecruitmentManualApplicantModal from './RecruitmentManualApplicantModal';
import RecruitmentOperationsControls from './RecruitmentOperationsControls';
import RecruitmentTaskReviewDialog from './RecruitmentTaskReviewDialog';

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as any).message || fallback);
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

export default function RecruitmentDashboard() {
  const [view, setView] = useState<'board' | 'list'>('board');
  const [applicants, setApplicants] = useState<ApplicantRecord[]>([]);
  const [jobs, setJobs] = useState<RecruitmentPipelineJob[]>([]);
  const [stages, setStages] = useState<RecruitmentPipelineStage[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState<ApplicantRecord | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deepLinkedTask, setDeepLinkedTask] = useState<AdminRecruitmentTask | null>(null);
  const [deepLinkedCandidateName, setDeepLinkedCandidateName] = useState('');
  const [deepLinkLoading, setDeepLinkLoading] = useState(false);
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  const [deepLinkTarget] = useState(() => {
    if (typeof window === 'undefined') return { applicantId: '', taskId: '' };
    const params = new URLSearchParams(window.location.search);
    return {
      applicantId: params.get('applicantId') || '',
      taskId: params.get('taskId') || '',
    };
  });

  const fetchApplicants = async () => {
    const rows = await applicantService.getApplicants();
    setApplicants(rows);
    if (selectedApplicant) {
      const fresh = rows.find(row => row.id === selectedApplicant.id);
      if (fresh) setSelectedApplicant(fresh);
    }
    return rows;
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, jobRows] = await Promise.all([fetchApplicants(), recruitmentPipelineService.getJobs()]);
      setJobs(jobRows);
      if (selectedJobId && jobRows.some(job => job.jobId === selectedJobId)) {
        setStages(await recruitmentPipelineService.getStages(selectedJobId));
      } else if (selectedDepartment !== 'all') {
        const first = jobRows.find(job => job.department === selectedDepartment);
        setSelectedJobId(first?.jobId || '');
        setStages(first ? await recruitmentPipelineService.getStages(first.jobId) : []);
      } else {
        setStages([]);
      }
      return rows;
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load recruitment pipelines.'));
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAll(); }, []);

  useEffect(() => {
    const refresh = () => { void loadAll(); };
    window.addEventListener('profox:recruitment-pipeline-changed', refresh);
    return () => window.removeEventListener('profox:recruitment-pipeline-changed', refresh);
  }, [selectedJobId, selectedDepartment, selectedApplicant?.id]);

  useEffect(() => {
    if (loading || deepLinkHandled || !deepLinkTarget.applicantId || !deepLinkTarget.taskId) return;
    const applicant = applicants.find(item => item.id === deepLinkTarget.applicantId);
    if (!applicant) {
      setError('The candidate linked from this recruitment notification is no longer available.');
      setDeepLinkHandled(true);
      return;
    }

    let cancelled = false;
    setDeepLinkLoading(true);
    void recruitmentTaskService.listForApplicant(applicant.id)
      .then(tasks => {
        if (cancelled) return;
        const task = tasks.find(item => item.id === deepLinkTarget.taskId);
        if (!task) {
          setError('The submitted Lead Research Assessment linked from this notification could not be found.');
          return;
        }
        setDeepLinkedCandidateName(applicant.fullName);
        setDeepLinkedTask(task);
        setError(null);
      })
      .catch(err => {
        if (!cancelled) setError(getErrorMessage(err, 'Unable to open the submitted Lead Research Assessment.'));
      })
      .finally(() => {
        if (!cancelled) {
          setDeepLinkLoading(false);
          setDeepLinkHandled(true);
        }
      });
    return () => { cancelled = true; };
  }, [applicants, deepLinkHandled, deepLinkTarget.applicantId, deepLinkTarget.taskId, loading]);

  const clearTaskDeepLink = () => {
    setDeepLinkedTask(null);
    setDeepLinkedCandidateName('');
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('applicantId');
    url.searchParams.delete('taskId');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const refreshDeepLinkedTask = async () => {
    if (!deepLinkTarget.applicantId || !deepLinkTarget.taskId) return;
    try {
      const [, tasks] = await Promise.all([
        fetchApplicants(),
        recruitmentTaskService.listForApplicant(deepLinkTarget.applicantId),
      ]);
      const fresh = tasks.find(item => item.id === deepLinkTarget.taskId);
      if (fresh) setDeepLinkedTask(fresh);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to refresh the submitted Lead Research Assessment.'));
    }
  };

  const departments = useMemo(() => Array.from(new Set(jobs.map(job => job.department || 'Unassigned'))).sort(), [jobs]);
  const departmentJobs = useMemo(() => jobs.filter(job => selectedDepartment === 'all' || job.department === selectedDepartment), [jobs, selectedDepartment]);
  const selectedJob = jobs.find(job => job.jobId === selectedJobId);
  const activeStageNames = useMemo(() => stages.filter(stage => stage.active).sort((a, b) => a.sortOrder - b.sortOrder).map(stage => stage.stage), [stages]);

  const baseVisibleApplicants = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return applicants.filter(applicant => {
      if (!showClosed && applicant.refusalReason) return false;
      if (selectedJobId && applicant.careerJobId !== selectedJobId) return false;
      if (!query) return true;
      return applicant.fullName.toLowerCase().includes(query)
        || applicant.email.toLowerCase().includes(query)
        || (applicant.applicationReference || '').toLowerCase().includes(query)
        || (applicant.position || '').toLowerCase().includes(query)
        || (applicant.careerJobTitle || '').toLowerCase().includes(query)
        || (applicant.country || '').toLowerCase().includes(query);
    });
  }, [applicants, searchTerm, showClosed, selectedJobId]);

  const scopedApplicants = selectedDepartment === 'all'
    ? baseVisibleApplicants
    : baseVisibleApplicants.filter(applicant => {
        if (selectedJobId) return applicant.careerJobId === selectedJobId;
        return departmentJobs.some(job => job.jobId === applicant.careerJobId);
      });

  const metricSource = selectedDepartment === 'all' && !selectedJobId ? applicants : applicants.filter(applicant => selectedJobId ? applicant.careerJobId === selectedJobId : departmentJobs.some(job => job.jobId === applicant.careerJobId));
  const activeCount = metricSource.filter(item => !item.refusalReason && item.stage !== 'Activated').length;
  const activatedCount = metricSource.filter(item => item.stage === 'Activated').length;
  const closedCount = metricSource.filter(item => Boolean(item.refusalReason)).length;

  const selectDepartment = async (department: string) => {
    setSelectedDepartment(department);
    setError(null);
    if (department === 'all') {
      setSelectedJobId('');
      setStages([]);
      return;
    }
    const first = jobs.find(job => job.department === department);
    setSelectedJobId(first?.jobId || '');
    try { setStages(first ? await recruitmentPipelineService.getStages(first.jobId) : []); }
    catch (err) { setError(getErrorMessage(err, 'Could not load this department pipeline.')); }
  };

  const selectJob = async (jobId: string) => {
    setSelectedJobId(jobId);
    setError(null);
    try { setStages(await recruitmentPipelineService.getStages(jobId)); }
    catch (err) { setError(getErrorMessage(err, 'Could not load this Job Post pipeline.')); }
  };

  if (loading && !jobs.length && !applicants.length) return <div className="flex h-[600px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div><div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">People · Recruitment</div><h1 className="mt-1 text-2xl font-black text-slate-900">Team Recruitment</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">One secure recruitment engine, with an independent hiring pipeline for every department and Job Post.</p></div>
      <div className="flex flex-wrap items-center gap-2"><RecruitmentOperationsControls /><a href="/admin/agreements" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-[#000080] shadow-sm"><FileSignature className="h-4 w-4" />Candidate Agreements</a><button type="button" onClick={() => setIsAdding(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-4 text-sm font-black text-white shadow-sm"><Plus className="h-4 w-4" />Add Manual Applicant</button></div>
    </div>

    <div className="grid gap-3 sm:grid-cols-3"><Metric label="In recruitment" value={activeCount} /><Metric label="Activated" value={activatedCount} tone="success" /><Metric label="Closed" value={closedCount} /></div>

    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void selectDepartment('all')} className={`min-h-11 rounded-xl px-4 text-sm font-black transition ${selectedDepartment === 'all' ? 'bg-[#000080] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-[#000080]/30'}`}>All Recruitment</button>{departments.map(department => <button type="button" key={department} onClick={() => void selectDepartment(department)} className={`min-h-11 rounded-xl px-4 text-sm font-black transition ${selectedDepartment === department ? 'bg-[#000080] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-[#000080]/30'}`}>{department}</button>)}</div>{selectedDepartment !== 'all' && departmentJobs.length > 1 && <div className="mt-3 border-t border-slate-100 pt-3"><label className="block max-w-xl"><span className="mb-1 block text-xs font-black uppercase text-slate-500">Job / hiring pipeline</span><select value={selectedJobId} onChange={event => void selectJob(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-[#000080]">{departmentJobs.map(job => <option key={job.jobId} value={job.jobId}>{job.title}</option>)}</select></label></div>}</div>

    {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
    {deepLinkLoading && <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-[#000080]"><Loader2 className="h-4 w-4 animate-spin" />Opening submitted Lead Research Assessment...</div>}

    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search candidate, role, email, country or reference..." className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none focus:border-[#000080]" /></div><label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-500"><input type="checkbox" checked={showClosed} onChange={event => setShowClosed(event.target.checked)} className="h-4 w-4 accent-[#000080]" />Show closed</label>{selectedDepartment !== 'all' && <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1"><button type="button" onClick={() => setView('board')} aria-label="Board view" className={`flex h-9 w-9 items-center justify-center rounded-lg ${view === 'board' ? 'bg-white text-[#000080] shadow-sm' : 'text-slate-400'}`}><LayoutGrid className="h-4 w-4" /></button><button type="button" onClick={() => setView('list')} aria-label="List view" className={`flex h-9 w-9 items-center justify-center rounded-lg ${view === 'list' ? 'bg-white text-[#000080] shadow-sm' : 'text-slate-400'}`}><ListIcon className="h-4 w-4" /></button></div>}<button type="button" onClick={() => void loadAll()} disabled={loading} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-[#000080] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div>

    {selectedDepartment === 'all' ? <RecruitmentOverview jobs={jobs} applicants={baseVisibleApplicants} onOpen={(department, jobId) => { setSelectedDepartment(department); void selectJob(jobId); }} /> : <>
      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wide text-slate-400">{selectedJob?.department}</div><h2 className="mt-1 text-lg font-black text-slate-900">{selectedJob?.title || 'Recruitment Pipeline'}</h2><p className="mt-1 text-sm text-slate-600">{activeStageNames.length} active stages · only candidates for this Job Post are shown below.</p></div><span className="rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-black text-[#000080]">Independent pipeline</span></div></div>
      {view === 'board' ? <RecruitmentBoard applicants={scopedApplicants} stages={activeStageNames} systemRole={selectedJob?.systemRole || 'pending'} onSelect={setSelectedApplicant} /> : <ApplicantList applicants={scopedApplicants} systemRole={selectedJob?.systemRole || 'pending'} onSelect={setSelectedApplicant} />}
    </>}

    {selectedApplicant && <RecruitmentApplicantDetailModal applicant={selectedApplicant} onClose={() => setSelectedApplicant(null)} onUpdate={async () => { await fetchApplicants(); }} />}
    {isAdding && <RecruitmentManualApplicantModal onClose={() => setIsAdding(false)} onUpdate={async () => { await fetchApplicants(); }} />}
    {deepLinkedTask && <RecruitmentTaskReviewDialog task={deepLinkedTask} candidateName={deepLinkedCandidateName || 'Candidate'} onClose={clearTaskDeepLink} onChanged={refreshDeepLinkedTask} />}
  </div>;
}

function Metric({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'success' }) {
  return <div className={`rounded-2xl border p-4 ${tone === 'success' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}><div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</div><div className={`mt-1 text-2xl font-black ${tone === 'success' ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</div></div>;
}

function RecruitmentOverview({ jobs, applicants, onOpen }: { jobs: RecruitmentPipelineJob[]; applicants: ApplicantRecord[]; onOpen: (department: string, jobId: string) => void }) {
  const departments = Array.from(new Set(jobs.map(job => job.department))).sort();
  const unassigned = applicants.filter(applicant => !applicant.careerJobId);
  return <div className="space-y-5"><div><h2 className="text-lg font-black text-slate-900">Recruitment overview</h2><p className="mt-1 text-sm leading-6 text-slate-500">Choose a department or Job Post to open its real stage board. Department-specific stages are intentionally not mixed into one giant Kanban.</p></div><div className="grid gap-4 xl:grid-cols-2">{departments.map(department => { const departmentJobs = jobs.filter(job => job.department === department); const deptApplicants = applicants.filter(applicant => departmentJobs.some(job => job.jobId === applicant.careerJobId)); const active = deptApplicants.filter(applicant => !applicant.refusalReason && applicant.stage !== 'Activated').length; const activated = deptApplicants.filter(applicant => applicant.stage === 'Activated').length; return <section key={department} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-wide text-slate-400">Department</div><h3 className="mt-1 text-lg font-black text-slate-900">{department}</h3><p className="mt-1 text-sm text-slate-500">{active} recruiting · {activated} activated</p></div><div className="rounded-xl bg-slate-50 px-3 py-2 text-center"><div className="text-lg font-black text-[#000080]">{departmentJobs.length}</div><div className="text-xs font-bold text-slate-400">pipeline{departmentJobs.length === 1 ? '' : 's'}</div></div></div><div className="mt-5 space-y-2">{departmentJobs.map(job => { const jobApplicants = deptApplicants.filter(applicant => applicant.careerJobId === job.jobId); const jobActive = jobApplicants.filter(applicant => !applicant.refusalReason && applicant.stage !== 'Activated').length; return <button type="button" key={job.jobId} onClick={() => onOpen(department, job.jobId)} className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-[#000080]/30 hover:bg-white"><div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{job.title}</div><div className="mt-1 text-xs text-slate-500">{job.activeStageCount} stages · {jobActive} in recruitment · {job.totalCandidates} total</div></div><ChevronRight className="h-5 w-5 shrink-0 text-slate-400" /></button>; })}</div></section>; })}</div>{unassigned.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="font-black text-amber-900">Unassigned / legacy recruitment records</div><p className="mt-1 text-sm leading-6 text-amber-800">{unassigned.length} candidate record(s) do not have a Job Post. They are kept out of department pipelines instead of being assumed to be Sales.</p></section>}</div>;
}

function RecruitmentBoard({ applicants, stages, systemRole, onSelect }: { applicants: ApplicantRecord[]; stages: string[]; systemRole: RecruitmentSystemRole; onSelect: (applicant: ApplicantRecord) => void }) {
  if (!stages.length) return <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">This Job Post has no active recruitment stages. Configure the pipeline in Pipeline Settings.</div>;
  return <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-6 sm:-mx-6 sm:px-6">{stages.map(stage => { const rows = applicants.filter(applicant => applicant.stage === stage); return <div key={stage} className="w-[300px] min-w-[300px]"><div className="mb-2 flex items-center justify-between px-1"><h3 className="text-xs font-black uppercase tracking-wide text-slate-500">{recruitmentWorkflowService.stageLabel(stage, systemRole)}</h3><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-500">{rows.length}</span></div><div className="flex min-h-[360px] flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-2">{rows.map(applicant => <CandidateCard key={applicant.id} applicant={applicant} onSelect={onSelect} />)}{!rows.length && <div className="flex flex-1 items-center justify-center text-sm font-bold text-slate-300">No candidates</div>}</div></div>; })}</div>;
}

function CandidateCard({ applicant, onSelect }: { applicant: ApplicantRecord; onSelect: (applicant: ApplicantRecord) => void }) {
  return <button type="button" onClick={() => onSelect(applicant)} className={`group rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-[#000080]/30 hover:shadow-md ${applicant.refusalReason ? 'border-red-200 opacity-75' : 'border-slate-200'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate text-sm font-black text-slate-900 group-hover:text-[#000080]">{applicant.fullName}</h4><div className="mt-1 truncate text-xs font-bold text-slate-400">{applicant.applicationReference || 'Manual / legacy'}</div></div>{applicant.rating > 0 && <span className="flex items-center text-xs font-black text-amber-500"><Star className="mr-0.5 h-3.5 w-3.5 fill-current" />{applicant.rating}</span>}</div><div className="mt-3 space-y-2 text-xs font-medium text-slate-500"><div className="flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" />{applicant.careerJobTitle || applicant.position}</div><div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{applicant.country || 'Global'}{applicant.timezone ? ` · ${applicant.timezone}` : ''}</div></div><div className="mt-3 flex items-center justify-between"><div className="flex items-center gap-1">{(applicant.cvUrl || applicant.cvStoragePath) && <FileText className="h-4 w-4 text-blue-600" />}{(applicant.videoUrl || applicant.videoStoragePath) && <Video className="h-4 w-4 text-purple-600" />}{applicant.linkedUserId && <UserCheck className="h-4 w-4 text-emerald-600" />}</div><span className="flex items-center gap-1 text-xs font-black text-slate-400">{applicant.refusalReason ? 'Closed' : applicant.source || 'Manual'}<ChevronRight className="h-3.5 w-3.5" /></span></div></button>;
}

function ApplicantList({ applicants, systemRole, onSelect }: { applicants: ApplicantRecord[]; systemRole: RecruitmentSystemRole; onSelect: (applicant: ApplicantRecord) => void }) {
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full text-left"><thead className="border-b border-slate-200 bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-4">Candidate</th><th className="px-5 py-4">Reference</th><th className="px-5 py-4">Role</th><th className="px-5 py-4">Stage</th><th className="px-5 py-4">Agreement</th><th className="px-5 py-4">Applied</th><th className="px-5 py-4 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{applicants.map(applicant => <tr key={applicant.id} onClick={() => onSelect(applicant)} className="cursor-pointer hover:bg-slate-50"><td className="px-5 py-4"><div className="text-sm font-black text-slate-900">{applicant.fullName}</div><div className="mt-1 text-xs text-slate-400">{applicant.email}{applicant.refusalReason ? ` · Closed: ${applicant.refusalReason}` : ''}</div></td><td className="px-5 py-4 text-xs font-black text-slate-600">{applicant.applicationReference || 'Legacy'}</td><td className="px-5 py-4 text-xs font-bold text-slate-600">{applicant.careerJobTitle || applicant.position}</td><td className="px-5 py-4"><span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-black text-[#000080]">{recruitmentWorkflowService.stageLabel(String(applicant.stage), systemRole)}</span></td><td className="px-5 py-4 text-xs font-bold text-slate-600">{agreementLabel(applicant.agreementStatus)}</td><td className="px-5 py-4 text-xs text-slate-500">{formatDateTime(applicant.applicationSubmittedAt || applicant.createdAt)}</td><td className="px-5 py-4 text-right"><MoreHorizontal className="ml-auto h-4 w-4 text-slate-400" /></td></tr>)}{!applicants.length && <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-400">No candidates found.</td></tr>}</tbody></table></div></div>;
}
