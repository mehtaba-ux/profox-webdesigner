import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, FileCheck2, Loader2, Play, RefreshCw, Send, ShieldCheck, X } from 'lucide-react';
import { qualityAssuranceService, type QaDeliveryWorkspace, type QaEvidenceType } from '../../lib/qualityAssuranceService';
import DevelopmentQualityOperationsPanel from './DevelopmentQualityOperationsPanel';

const ALL_EVIDENCE: QaEvidenceType[] = [
  'test_result', 'browser_responsive_check', 'accessibility_check', 'staging_url', 'security_check',
  'performance_check', 'qa_handoff', 'smoke_test', 'analytics_check', 'monitoring_check'
];
const labelFor = (value: string) => value.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

export default function QualityAssuranceTaskWorkspace({ taskId, onClose, onChanged }: { taskId: string; onClose: () => void; onChanged?: () => void | Promise<void> }) {
  const [workspace, setWorkspace] = useState<QaDeliveryWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [evidenceType, setEvidenceType] = useState<QaEvidenceType>('test_result');
  const [evidenceLabel, setEvidenceLabel] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [referenceNote, setReferenceNote] = useState('');
  const [submissionNote, setSubmissionNote] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const next = await qualityAssuranceService.getWorkspace(taskId);
      setWorkspace(next);
      if (next.missingEvidence?.length) setEvidenceType(next.missingEvidence[0]);
    } catch (caught: any) {
      setError(caught?.message || 'Unable to load the QA workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [taskId]);

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError('');
    try {
      await action();
      await load();
      await onChanged?.();
    } catch (caught: any) {
      setError(caught?.message || 'Unable to complete the QA action.');
    } finally {
      setBusy('');
    }
  };

  const activeEvidence = useMemo(() => (workspace?.evidence || []).filter(item => item.active), [workspace?.evidence]);
  const task = workspace?.task;
  const project = workspace?.project;
  const projectId = task?.project_id || project?.id || '';

  const saveEvidence = () => run('evidence', async () => {
    await qualityAssuranceService.addEvidence({ taskId, type: evidenceType, label: evidenceLabel, referenceUrl, referenceNote });
    setEvidenceLabel('');
    setReferenceUrl('');
    setReferenceNote('');
  });

  const review = (decision: 'Pass' | 'Changes Required') => run(`review-${decision}`, async () => {
    await qualityAssuranceService.reviewDecision(taskId, decision, reviewNotes);
    setReviewNotes('');
  });

  return (
    <div className="max-h-[94vh] w-full overflow-y-auto rounded-[30px] bg-slate-50 shadow-2xl">
      <div className="sticky top-0 z-30 flex items-start justify-between border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#000080]/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[.16em] text-[#000080]">Controlled QA Gate</span>
            {task?.status && <span className="rounded-full border border-slate-200 px-2.5 py-1 text-[9px] font-black text-slate-600">{task.status}</span>}
          </div>
          <h2 className="mt-2 text-lg font-black text-slate-900">{task?.title || 'Quality Assurance Workspace'}</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">{project?.project_number} · {project?.project_name}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        {loading && !workspace ? <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-[#000080]" /></div> : null}
        {error && <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

        {workspace && (
          <>
            <section className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div className={`rounded-3xl border p-5 ${workspace.ready ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-slate-600"><ShieldCheck className="h-4 w-4" /> Submission readiness</div>
                <div className="mt-2 text-base font-black text-slate-900">{workspace.ready ? 'Evidence and release blockers are clear' : 'QA evidence or critical findings still need attention'}</div>
                {!!workspace.missingEvidence?.length && <div className="mt-3 flex flex-wrap gap-2">{workspace.missingEvidence.map(item => <span key={item} className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[9px] font-black text-amber-800">Missing · {labelFor(item)}</span>)}</div>}
              </div>
              <button type="button" onClick={() => void load()} className="h-fit rounded-2xl border border-slate-200 bg-white p-3 text-[#000080]"><RefreshCw className="h-4 w-4" /></button>
            </section>

            {task?.status === 'To Do' || task?.status === 'Changes Required' ? (
              <button type="button" disabled={Boolean(busy)} onClick={() => void run('start', () => qualityAssuranceService.startTask(taskId))} className="flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:opacity-50">
                {busy === 'start' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Start QA Work
              </button>
            ) : null}

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3"><div className="rounded-xl bg-blue-50 p-2 text-[#000080]"><FileCheck2 className="h-4 w-4" /></div><div><h3 className="text-sm font-black text-slate-900">QA evidence</h3><p className="mt-1 text-xs leading-5 text-slate-500">Record reproducible results and safe references. Never paste credentials, secret tokens or password-bearing links.</p></div></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label><span className="mb-1 block text-[10px] font-black uppercase text-slate-500">Evidence type</span><select value={evidenceType} onChange={event => setEvidenceType(event.target.value as QaEvidenceType)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold">{ALL_EVIDENCE.map(item => <option key={item} value={item}>{labelFor(item)}</option>)}</select></label>
                <Field label="Label" value={evidenceLabel} onChange={setEvidenceLabel} placeholder="Browser matrix, scan report, release check…" />
                <Field label="Reference URL" value={referenceUrl} onChange={setReferenceUrl} placeholder="https://…" />
                <label><span className="mb-1 block text-[10px] font-black uppercase text-slate-500">Evidence note</span><textarea rows={3} value={referenceNote} onChange={event => setReferenceNote(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs leading-5" placeholder="What was tested, result, environment and reproduction details." /></label>
              </div>
              <div className="mt-3 flex justify-end"><button type="button" disabled={Boolean(busy) || (!referenceUrl.trim() && !referenceNote.trim())} onClick={() => void saveEvidence()} className="rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">{busy === 'evidence' ? 'Saving…' : 'Save Evidence'}</button></div>
              <div className="mt-4 space-y-2">{activeEvidence.map(item => <div key={item.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black text-slate-800">{item.label || labelFor(item.evidence_type)}</div><div className="mt-1 text-[10px] font-bold text-slate-500">{labelFor(item.evidence_type)} · {item.status}</div>{item.reference_note && <p className="mt-1 max-w-3xl whitespace-pre-wrap text-[11px] leading-5 text-slate-600">{item.reference_note}</p>}</div>{item.reference_url && <a href={item.reference_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] font-black text-[#000080]">Open <ExternalLink className="h-3 w-3" /></a>}</div>)}{!activeEvidence.length && <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs font-bold text-slate-400">No QA evidence recorded yet.</div>}</div>
            </section>

            {projectId && <DevelopmentQualityOperationsPanel taskId={taskId} projectId={projectId} onChanged={load} />}

            {task?.status === 'In Progress' || task?.status === 'Changes Required' ? (
              <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
                <div className="text-sm font-black text-slate-900">Submit for delivery-manager review</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">The database verifies required evidence and blocks submission while any E0/E1 finding is unresolved or unverified.</p>
                <textarea rows={3} value={submissionNote} onChange={event => setSubmissionNote(event.target.value)} className="mt-3 w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-xs" placeholder="QA summary and known limitations…" />
                <div className="mt-3 flex justify-end"><button type="button" disabled={Boolean(busy) || !workspace.ready} onClick={() => void run('submit', () => qualityAssuranceService.submitForReview(taskId, submissionNote))} className="flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-40"><Send className="h-4 w-4" />{busy === 'submit' ? 'Submitting…' : 'Submit QA Review'}</button></div>
              </section>
            ) : null}

            {task?.status === 'Review' && workspace.canReview ? (
              <section className="rounded-3xl border border-violet-200 bg-violet-50 p-5">
                <div className="text-sm font-black text-slate-900">QA review decision</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">Pass only after checking the evidence and findings. Changes require specific feedback.</p>
                <textarea rows={3} value={reviewNotes} onChange={event => setReviewNotes(event.target.value)} className="mt-3 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-xs" placeholder="What passed, or what must be corrected?" />
                <div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => void review('Changes Required')} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-black text-amber-800">Changes Required</button><button type="button" disabled={Boolean(busy) || !workspace.ready} onClick={() => void review('Pass')} className="flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-40"><CheckCircle2 className="h-4 w-4" />Pass QA</button></div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label><span className="mb-1 block text-[10px] font-black uppercase text-slate-500">{label}</span><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs" /></label>;
}
