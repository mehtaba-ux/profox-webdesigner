import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  LockKeyhole,
  Loader2,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import {
  recruitmentPipelineService,
  type RecruitmentPipelineJob,
  type RecruitmentPipelineStage,
} from '../../lib/recruitmentPipelineService';
import type { RecruitmentSourceFunnelRow } from '../../lib/recruitmentWorkflowService';

function message(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as any).message || fallback);
  return fallback;
}

export default function RecruitmentOperationsControls() {
  const [mode, setMode] = useState<'settings' | 'funnel' | null>(null);
  const [jobs, setJobs] = useState<RecruitmentPipelineJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [stages, setStages] = useState<RecruitmentPipelineStage[]>([]);
  const [funnel, setFunnel] = useState<RecruitmentSourceFunnelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyStage, setBusyStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [removeStage, setRemoveStage] = useState<RecruitmentPipelineStage | null>(null);
  const [newStage, setNewStage] = useState({ name: '', afterStage: '', slaHours: 24, assessmentRequired: false, passingScore: 70, interviewRequired: false });

  const selectedJob = jobs.find(job => job.jobId === selectedJobId);
  const activeStages = useMemo(() => stages.filter(stage => stage.active), [stages]);
  const archivedStages = useMemo(() => stages.filter(stage => !stage.active), [stages]);
  const departments = useMemo(() => Array.from(new Set(jobs.map(job => job.department))).sort(), [jobs]);

  const refreshStages = async (jobId = selectedJobId) => {
    if (!jobId) { setStages([]); return; }
    setStages(await recruitmentPipelineService.getStages(jobId));
  };

  const load = async (nextMode: 'settings' | 'funnel') => {
    setMode(nextMode);
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const jobRows = await recruitmentPipelineService.getJobs();
      setJobs(jobRows);
      const initialJobId = selectedJobId && jobRows.some(job => job.jobId === selectedJobId)
        ? selectedJobId
        : jobRows.find(job => job.status === 'Published')?.jobId || jobRows[0]?.jobId || '';
      setSelectedJobId(initialJobId);
      if (nextMode === 'settings') setStages(initialJobId ? await recruitmentPipelineService.getStages(initialJobId) : []);
      else setFunnel(await recruitmentPipelineService.getSourceFunnel(initialJobId || null));
    } catch (err) {
      setError(message(err, 'Recruitment controls could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!mode) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (removeStage) setRemoveStage(null);
      else if (showAdd) setShowAdd(false);
      else setMode(null);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [mode, removeStage, showAdd]);

  const changeJob = async (jobId: string) => {
    setSelectedJobId(jobId);
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'settings') setStages(await recruitmentPipelineService.getStages(jobId));
      else setFunnel(await recruitmentPipelineService.getSourceFunnel(jobId));
    } catch (err) {
      setError(message(err, 'This recruitment pipeline could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  const updateStage = (stageId: string, updates: Partial<RecruitmentPipelineStage>) => {
    setStages(current => current.map(stage => stage.id === stageId ? { ...stage, ...updates } : stage));
  };

  const saveStage = async (stage: RecruitmentPipelineStage) => {
    setBusyStage(stage.id);
    setError(null);
    setNotice(null);
    try {
      await recruitmentPipelineService.saveStage(stage);
      setNotice(`${stage.stage} settings saved.`);
      await refreshStages(stage.jobId);
    } catch (err) {
      setError(message(err, 'Workflow stage could not be saved.'));
    } finally {
      setBusyStage(null);
    }
  };

  const addStage = async () => {
    if (!selectedJobId || newStage.name.trim().length < 2) return;
    setBusyStage('new');
    setError(null);
    setNotice(null);
    try {
      await recruitmentPipelineService.createStage({
        jobId: selectedJobId,
        stage: newStage.name,
        afterStage: newStage.afterStage || null,
        slaHours: newStage.slaHours,
        assessmentRequired: newStage.assessmentRequired,
        passingScore: newStage.assessmentRequired ? newStage.passingScore : null,
        interviewRequired: newStage.interviewRequired,
      });
      setNotice(`${newStage.name.trim()} added to ${selectedJob?.title || 'the recruitment pipeline'}.`);
      setNewStage({ name: '', afterStage: '', slaHours: 24, assessmentRequired: false, passingScore: 70, interviewRequired: false });
      setShowAdd(false);
      await refreshStages(selectedJobId);
    } catch (err) {
      setError(message(err, 'The recruitment stage could not be added.'));
    } finally {
      setBusyStage(null);
    }
  };

  const moveStage = async (stageId: string, direction: -1 | 1) => {
    const rows = activeStages;
    const index = rows.findIndex(stage => stage.id === stageId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= rows.length) return;
    if (rows[index].systemProtected || rows[target].systemProtected) {
      setError('Protected system milestones keep their fixed position. Reorder the customizable screening and assessment stages around the unlocked portion of the pipeline.');
      return;
    }
    const reordered = [...rows];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setBusyStage(stageId);
    setError(null);
    setNotice(null);
    try {
      await recruitmentPipelineService.reorderStages(selectedJobId, reordered.map(stage => stage.id));
      setNotice('Pipeline order updated.');
      await refreshStages(selectedJobId);
    } catch (err) {
      setError(message(err, 'The pipeline order could not be changed.'));
    } finally {
      setBusyStage(null);
    }
  };

  const confirmRemove = async () => {
    if (!removeStage) return;
    setBusyStage(removeStage.id);
    setError(null);
    setNotice(null);
    try {
      const result = await recruitmentPipelineService.removeStage(removeStage.id);
      setNotice(result.action === 'archived'
        ? `${result.stage} was removed from the active pipeline and archived because historical recruitment evidence references it.`
        : `${result.stage} was deleted from the pipeline.`);
      setRemoveStage(null);
      await refreshStages(selectedJobId);
    } catch (err) {
      setError(message(err, 'The recruitment stage could not be removed.'));
      setRemoveStage(null);
    } finally {
      setBusyStage(null);
    }
  };

  const restoreStage = async (stage: RecruitmentPipelineStage) => {
    setBusyStage(stage.id);
    setError(null);
    setNotice(null);
    try {
      await recruitmentPipelineService.restoreStage(stage.id);
      setNotice(`${stage.stage} restored before the protected selection/onboarding sequence.`);
      await refreshStages(selectedJobId);
    } catch (err) {
      setError(message(err, 'The archived recruitment stage could not be restored.'));
    } finally {
      setBusyStage(null);
    }
  };

  const addRubricItem = (stage: RecruitmentPipelineStage) => {
    const nextNo = stage.rubric.length + 1;
    updateStage(stage.id, { rubric: [...stage.rubric, { key: `criterion_${nextNo}_${Date.now()}`, label: `Criterion ${nextNo}`, maxPoints: 10 }] });
  };

  const addAfterOptions = activeStages.filter(stage => {
    if (stage.stage === 'Selected' || stage.stage === 'Activated') return false;
    if (selectedJob?.systemRole === 'sales') {
      const videoIndex = activeStages.findIndex(item => item.stage === 'Video Review');
      const index = activeStages.findIndex(item => item.id === stage.id);
      if (videoIndex >= 0 && index < videoIndex) return false;
    }
    const selectedIndex = activeStages.findIndex(item => item.stage === 'Selected');
    const index = activeStages.findIndex(item => item.id === stage.id);
    return selectedIndex < 0 || index < selectedIndex;
  });

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void load('funnel')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 shadow-sm transition hover:border-[#000080]/30 hover:text-[#000080]"><BarChart3 className="h-4 w-4" />Source Funnel</button>
        <button type="button" onClick={() => void load('settings')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 shadow-sm transition hover:border-[#000080]/30 hover:text-[#000080]"><Settings2 className="h-4 w-4" />Pipeline Settings</button>
      </div>

      {mode && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6">
          <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 sm:px-8">
              <div><div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">People · Recruitment</div><h2 className="mt-1 text-xl font-black text-slate-900">{mode === 'settings' ? 'Role Pipeline Settings' : 'Source & Campaign Funnel'}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{mode === 'settings' ? 'Each Job Post owns its own pipeline. Add, reorder, configure, remove or restore stages without changing another department’s hiring process.' : 'View recruitment attribution using the selected Job Post and its own stage order.'}</p></div>
              <button type="button" onClick={() => setMode(null)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50"><X className="h-4 w-4" /></button>
            </div>

            <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-6 py-4 sm:px-8">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(260px,420px)] md:items-end">
                <div className="flex flex-wrap gap-2">{departments.map(department => <span key={department} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600">{department}</span>)}</div>
                <label><span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Job / pipeline</span><select value={selectedJobId} onChange={event => void changeJob(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-[#000080]">{jobs.map(job => <option key={job.jobId} value={job.jobId}>{job.department} · {job.title}</option>)}</select></label>
              </div>
              {selectedJob && <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500"><span className="rounded-lg bg-white px-2.5 py-1.5 font-bold">{selectedJob.activeStageCount} active stages</span><span className="rounded-lg bg-white px-2.5 py-1.5 font-bold">{selectedJob.activeCandidates} in recruitment</span><span className="rounded-lg bg-white px-2.5 py-1.5 font-bold">{selectedJob.totalCandidates} total candidates</span></div>}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8">
              {loading ? <div className="flex min-h-[300px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /></div> : <>
                {error && <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
                {notice && <div className="mb-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}

                {mode === 'funnel' && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-400"><tr><th className="px-4 py-3">Source</th><th className="px-4 py-3">Campaign</th><th className="px-4 py-3 text-right">Applications</th><th className="px-4 py-3 text-right">Advanced</th><th className="px-4 py-3 text-right">Selected</th><th className="px-4 py-3 text-right">Activated</th><th className="px-4 py-3 text-right">Closed</th></tr></thead><tbody className="divide-y divide-slate-100">{funnel.map((row, index) => <tr key={`${row.source}:${row.campaign}:${index}`} className="text-sm text-slate-600"><td className="px-4 py-3 font-black text-slate-800">{row.source}</td><td className="px-4 py-3">{row.campaign || 'No campaign'}</td><td className="px-4 py-3 text-right font-bold">{row.applications}</td><td className="px-4 py-3 text-right">{row.shortlisted}</td><td className="px-4 py-3 text-right">{row.selected}</td><td className="px-4 py-3 text-right font-bold text-emerald-700">{row.activated}</td><td className="px-4 py-3 text-right text-red-600">{row.closed}</td></tr>)}{!funnel.length && <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">No applications are attributed to this pipeline yet.</td></tr>}</tbody></table></div>
                  </div>
                )}

                {mode === 'settings' && <div className="space-y-5">
                  <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-black text-slate-900">{selectedJob?.title || 'Recruitment pipeline'}</div><p className="mt-1 text-sm leading-6 text-slate-600">Custom stages can be placed in the evaluation portion of the pipeline. Secure intake, agreement, Academy and activation milestones stay protected because other workflows depend on them.</p></div><button type="button" onClick={() => setShowAdd(true)} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 text-sm font-black text-white"><Plus className="h-4 w-4" />Add Stage</button></div>

                  {activeStages.map((stage, index) => (
                    <section key={stage.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-black text-slate-900">{stage.sortOrder}. {stage.stage}</h3>{stage.systemProtected && <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600"><LockKeyhole className="h-3.5 w-3.5" />Protected milestone</span>}</div><p className="mt-1 text-sm text-slate-500">{stage.openCandidateCount ? `${stage.openCandidateCount} candidate(s) currently in this stage.` : stage.historyReferenceCount ? 'Historical assessment/interview/task evidence references this stage.' : 'No candidate is currently held in this stage.'}</p></div><div className="flex flex-wrap gap-2"><button type="button" aria-label="Move stage up" onClick={() => void moveStage(stage.id, -1)} disabled={busyStage !== null || index === 0 || stage.systemProtected || activeStages[index - 1]?.systemProtected} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500 disabled:cursor-not-allowed disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button><button type="button" aria-label="Move stage down" onClick={() => void moveStage(stage.id, 1)} disabled={busyStage !== null || index === activeStages.length - 1 || stage.systemProtected || activeStages[index + 1]?.systemProtected} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500 disabled:cursor-not-allowed disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button><button type="button" onClick={() => setRemoveStage(stage)} disabled={busyStage !== null || stage.systemProtected || stage.openCandidateCount > 0} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 px-3 text-sm font-black text-red-600 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 className="h-4 w-4" />Remove</button><button type="button" onClick={() => void saveStage(stage)} disabled={busyStage !== null} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 text-sm font-black text-white disabled:opacity-50">{busyStage === stage.id && <Loader2 className="h-4 w-4 animate-spin" />}Save</button></div></div>
                      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <label><span className="mb-1 block text-xs font-black uppercase text-slate-500">SLA hours</span><input type="number" min={0} max={720} value={stage.slaHours} onChange={event => updateStage(stage.id, { slaHours: Math.max(0, Number(event.target.value || 0)) })} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-[#000080]" /></label>
                        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3"><input type="checkbox" checked={stage.assessmentRequired} onChange={event => updateStage(stage.id, { assessmentRequired: event.target.checked })} className="h-4 w-4 accent-[#000080]" /><span className="text-sm font-bold text-slate-600">Assessment required</span></label>
                        <label><span className="mb-1 block text-xs font-black uppercase text-slate-500">Passing score</span><input type="number" min={0} max={100} disabled={!stage.assessmentRequired} value={stage.passingScore ?? ''} onChange={event => updateStage(stage.id, { passingScore: Number(event.target.value || 0) })} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-[#000080] disabled:bg-slate-50 disabled:text-slate-300" /></label>
                        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3"><input type="checkbox" checked={stage.interviewRequired} onChange={event => updateStage(stage.id, { interviewRequired: event.target.checked })} className="h-4 w-4 accent-[#000080]" /><span className="text-sm font-bold text-slate-600">Interview required</span></label>
                      </div>
                      {stage.assessmentRequired && <div className="mt-5"><div className="mb-2 flex items-center justify-between gap-3"><div className="text-xs font-black uppercase tracking-wide text-slate-500">Assessment rubric</div><button type="button" onClick={() => addRubricItem(stage)} className="text-xs font-black text-[#000080]">+ Add criterion</button></div><div className="space-y-2">{stage.rubric.map((item, itemIndex) => <div key={`${item.key}:${itemIndex}`} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[140px_minmax(0,1fr)_100px_44px]"><input value={item.key} disabled className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-mono text-slate-400" /><input value={item.label} onChange={event => updateStage(stage.id, { rubric: stage.rubric.map((entry, i) => i === itemIndex ? { ...entry, label: event.target.value } : entry) })} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm outline-none focus:border-[#000080]" /><input type="number" min={0} max={100} value={item.maxPoints} onChange={event => updateStage(stage.id, { rubric: stage.rubric.map((entry, i) => i === itemIndex ? { ...entry, maxPoints: Math.max(0, Number(event.target.value || 0)) } : entry) })} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-bold outline-none focus:border-[#000080]" /><button type="button" aria-label="Remove rubric criterion" onClick={() => updateStage(stage.id, { rubric: stage.rubric.filter((_, i) => i !== itemIndex) })} className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-red-600"><X className="h-4 w-4" /></button></div>)}{!stage.rubric.length && <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400">No rubric criteria yet. Add criteria before using structured scoring.</div>}</div><p className="mt-2 text-xs leading-5 text-slate-400">Rubric snapshots on completed assessments remain preserved even when the current policy changes.</p></div>}
                    </section>
                  ))}

                  {archivedStages.length > 0 && <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5"><div className="flex items-center gap-2"><ArchiveRestore className="h-5 w-5 text-slate-500" /><h3 className="font-black text-slate-800">Archived stages</h3></div><p className="mt-1 text-sm text-slate-500">These stages are hidden from the active pipeline but retained because historical records reference them.</p><div className="mt-4 space-y-2">{archivedStages.map(stage => <div key={stage.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-black text-slate-800">{stage.stage}</div><div className="mt-1 text-xs text-slate-500">{stage.historyReferenceCount + stage.currentCandidateCount} preserved reference(s)</div></div><button type="button" onClick={() => void restoreStage(stage)} disabled={busyStage !== null} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-[#000080] disabled:opacity-50"><RotateCcw className="h-4 w-4" />Restore</button></div>)}</div></section>}
                </div>}
              </>}
            </div>
          </div>

          {showAdd && <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/45 p-4"><div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{selectedJob?.department}</div><h3 className="mt-1 text-xl font-black text-slate-900">Add Recruitment Stage</h3><p className="mt-1 text-sm leading-6 text-slate-500">Add a custom evaluation stage before the protected selection/onboarding sequence.</p></div><button type="button" onClick={() => setShowAdd(false)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-400"><X className="h-4 w-4" /></button></div><div className="mt-6 space-y-4"><label className="block"><span className="mb-1 block text-xs font-black uppercase text-slate-500">Stage name</span><input autoFocus value={newStage.name} onChange={event => setNewStage(current => ({ ...current, name: event.target.value }))} placeholder="e.g. Copy Editing Exercise" className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#000080]" /></label><label className="block"><span className="mb-1 block text-xs font-black uppercase text-slate-500">Place after</span><select value={newStage.afterStage} onChange={event => setNewStage(current => ({ ...current, afterStage: event.target.value }))} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#000080]"><option value="">Automatically before Selected</option>{addAfterOptions.map(stage => <option key={stage.id} value={stage.stage}>{stage.stage}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-black uppercase text-slate-500">SLA hours</span><input type="number" min={0} max={720} value={newStage.slaHours} onChange={event => setNewStage(current => ({ ...current, slaHours: Math.max(0, Number(event.target.value || 0)) }))} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold" /></label><label><span className="mb-1 block text-xs font-black uppercase text-slate-500">Passing score</span><input type="number" min={0} max={100} disabled={!newStage.assessmentRequired} value={newStage.passingScore} onChange={event => setNewStage(current => ({ ...current, passingScore: Number(event.target.value || 0) }))} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold disabled:bg-slate-50 disabled:text-slate-300" /></label></div><div className="grid gap-3 sm:grid-cols-2"><label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3"><input type="checkbox" checked={newStage.assessmentRequired} onChange={event => setNewStage(current => ({ ...current, assessmentRequired: event.target.checked }))} className="h-4 w-4 accent-[#000080]" /><span className="text-sm font-bold text-slate-600">Assessment required</span></label><label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3"><input type="checkbox" checked={newStage.interviewRequired} onChange={event => setNewStage(current => ({ ...current, interviewRequired: event.target.checked }))} className="h-4 w-4 accent-[#000080]" /><span className="text-sm font-bold text-slate-600">Interview required</span></label></div></div><div className="mt-7 flex justify-end gap-3"><button type="button" onClick={() => setShowAdd(false)} className="min-h-11 px-4 text-sm font-bold text-slate-500">Cancel</button><button type="button" onClick={() => void addStage()} disabled={busyStage !== null || newStage.name.trim().length < 2} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-5 text-sm font-black text-white disabled:opacity-50">{busyStage === 'new' && <Loader2 className="h-4 w-4 animate-spin" />}Add Stage</button></div></div></div>}

          {removeStage && <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/45 p-4"><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl sm:p-8"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Trash2 className="h-5 w-5" /></div><h3 className="mt-4 text-xl font-black text-slate-900">Remove “{removeStage.stage}”?</h3><p className="mt-2 text-sm leading-6 text-slate-600">It will disappear from this Job Post’s active recruitment pipeline. If historical evidence references it, the backend will archive it instead of destroying that history.</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setRemoveStage(null)} className="min-h-11 px-4 text-sm font-bold text-slate-500">Cancel</button><button type="button" onClick={() => void confirmRemove()} disabled={busyStage !== null} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-black text-white disabled:opacity-50">{busyStage === removeStage.id && <Loader2 className="h-4 w-4 animate-spin" />}Remove Stage</button></div></div></div>}
        </div>
      )}
    </>
  );
}
