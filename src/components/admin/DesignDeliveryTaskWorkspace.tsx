import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  X
} from 'lucide-react';
import ProductivityPlaybookChecklist from './ProductivityPlaybookChecklist';
import {
  DesignDeliveryEvidence,
  DesignDeliveryWorkspace,
  DesignEvidenceType,
  designDeliveryService
} from '../../lib/designDeliveryService';

const EVIDENCE_OPTIONS: Array<{ type: DesignEvidenceType; label: string; readiness?: boolean }> = [
  { type: 'business_objective', label: 'Business objective', readiness: true },
  { type: 'target_audience', label: 'Target audience', readiness: true },
  { type: 'primary_conversion', label: 'Primary conversion', readiness: true },
  { type: 'approved_content', label: 'Approved/current content', readiness: true },
  { type: 'brand_assets', label: 'Brand assets / guidelines', readiness: true },
  { type: 'research', label: 'Research evidence' },
  { type: 'information_architecture', label: 'Information architecture' },
  { type: 'user_flow', label: 'User flow' },
  { type: 'wireframe', label: 'Wireframe' },
  { type: 'design_system', label: 'Design system / component library' },
  { type: 'design_file', label: 'Approved/current Figma design' },
  { type: 'prototype', label: 'Prototype' },
  { type: 'handoff_notes', label: 'Developer handoff notes' },
  { type: 'implementation_reference', label: 'Staging / implementation reference' }
];

function value(row: any, camel: string, snake: string) {
  return row?.[camel] ?? row?.[snake] ?? '';
}

function evidenceLabel(type: DesignEvidenceType | string) {
  return EVIDENCE_OPTIONS.find(option => option.type === type)?.label || type.replaceAll('_', ' ');
}

function EvidencePill({ item }: { item: DesignDeliveryEvidence }) {
  const label = evidenceLabel(item.evidence_type);
  return (
    <div className={`rounded-2xl border p-3 ${item.active ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-100 bg-slate-50 opacity-70'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div>
          <div className="mt-1 text-xs font-bold text-slate-800">{item.label || item.version_label || item.status}</div>
          {item.reference_note && <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-slate-600">{item.reference_note}</p>}
        </div>
        {item.reference_url && (
          <a href={item.reference_url} target="_blank" rel="noreferrer" className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-[#000080] hover:bg-blue-50" title="Open source">
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function DesignDeliveryTaskWorkspace({
  taskId,
  onClose,
  onChanged
}: {
  taskId: string;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
}) {
  const [workspace, setWorkspace] = useState<DesignDeliveryWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState('');
  const [error, setError] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [evidenceType, setEvidenceType] = useState<DesignEvidenceType>('business_objective');
  const [evidenceLabelText, setEvidenceLabelText] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [evidenceVersion, setEvidenceVersion] = useState('');
  const [evidenceStatus, setEvidenceStatus] = useState<'Draft' | 'Approved'>('Approved');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setWorkspace(await designDeliveryService.getWorkspace(taskId));
    } catch (e: any) {
      setError(e?.message || 'Unable to load Design Delivery workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [taskId]);

  const activeEvidence = useMemo(
    () => (workspace?.evidence || []).filter(item => item.active),
    [workspace?.evidence]
  );

  const approvedEvidenceTypes = useMemo(
    () => new Set(activeEvidence.filter(item => item.status === 'Approved').map(item => item.evidence_type)),
    [activeEvidence]
  );

  const requiredSubmissionEvidence = workspace?.packageContext?.requiredSubmissionEvidence || [];

  const execute = async (key: string, action: () => Promise<any>) => {
    setRunning(key);
    setError('');
    try {
      await action();
      await load();
      await onChanged?.();
    } catch (e: any) {
      setError(e?.message || 'Unable to complete the action.');
    } finally {
      setRunning('');
    }
  };

  const saveEvidence = async () => {
    await execute('evidence', async () => {
      await designDeliveryService.addEvidence({
        taskId,
        type: evidenceType,
        label: evidenceLabelText,
        referenceUrl: evidenceUrl,
        referenceNote: evidenceNote,
        versionLabel: evidenceVersion,
        status: evidenceStatus
      });
      setEvidenceLabelText('');
      setEvidenceUrl('');
      setEvidenceNote('');
      setEvidenceVersion('');
      setShowEvidenceForm(false);
    });
  };

  if (loading && !workspace) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#000080]" />
      </div>
    );
  }

  const task = workspace?.task || {};
  const project = workspace?.project || {};
  const client = workspace?.client || {};
  const readiness = workspace?.readiness;
  const taskStatus = value(task, 'status', 'status');
  const projectStage = value(project, 'stage', 'stage');
  const packageSnapshot = workspace?.packageContext?.packageSnapshot || value(project, 'packageSnapshot', 'package_snapshot');
  const processDepth = workspace?.packageContext?.depth || 'Unmapped';
  const productCode = workspace?.packageContext?.primaryProductCode;

  return (
    <div className="max-h-[90vh] overflow-y-auto rounded-[28px] bg-slate-50">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#000080]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[#000080]">PF-SOP-08</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{taskStatus}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{projectStage}</span>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black text-violet-700">{processDepth} process</span>
            </div>
            <h2 className="mt-2 text-xl font-black text-slate-900">{task.title || 'Design Delivery'}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {project.project_number || 'Project'} · {project.project_name || ''} · {client.company_name || 'Client'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-7">
        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{error}</div>}

        <section className={`rounded-3xl border p-5 ${readiness?.ready ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/70'}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${readiness?.ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {readiness?.ready ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Definition of Ready</div>
                <h3 className="mt-1 text-base font-black text-slate-900">{readiness?.status || 'Checking readiness'}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">The server gate checks canonical project data plus approved evidence references. Critical inputs cannot be bypassed from the browser.</p>
              </div>
            </div>
            <button type="button" onClick={() => void load()} className="rounded-xl border border-white/70 bg-white p-2 text-slate-500 hover:text-[#000080]" title="Recheck readiness"><RefreshCw className="h-4 w-4" /></button>
          </div>
          {!!readiness?.blockers?.length && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {readiness.blockers.map(blocker => <div key={blocker} className="rounded-xl bg-white/80 px-3 py-2 text-[11px] font-bold text-amber-800">• {blocker}</div>)}
            </div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Connected design brief</div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div><div className="text-[10px] font-black uppercase text-slate-400">Package</div><div className="mt-1 text-xs font-bold text-slate-800">{packageSnapshot || 'Not recorded'}</div></div>
              <div><div className="text-[10px] font-black uppercase text-slate-400">Process depth</div><div className="mt-1 text-xs font-bold text-slate-800">{processDepth}{productCode ? ` · ${productCode}` : ''}</div></div>
              <div><div className="text-[10px] font-black uppercase text-slate-400">Due date</div><div className="mt-1 text-xs font-bold text-slate-800">{task.due_date || 'No due date'}</div></div>
              <div><div className="text-[10px] font-black uppercase text-slate-400">Submission evidence</div><div className="mt-1 text-xs font-bold text-slate-800">{requiredSubmissionEvidence.length} required for this package</div></div>
              <div className="sm:col-span-2"><div className="text-[10px] font-black uppercase text-slate-400">Approved scope</div><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">{project.scope_summary || 'Not recorded'}</p></div>
              <div className="sm:col-span-2"><div className="text-[10px] font-black uppercase text-slate-400">Requirements</div><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">{project.requirements_summary || 'Not recorded'}</p></div>
              {!!project.exclusions && <div className="sm:col-span-2"><div className="text-[10px] font-black uppercase text-slate-400">Exclusions</div><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">{project.exclusions}</p></div>}
              {!!project.sales_handover_notes && <div className="sm:col-span-2"><div className="text-[10px] font-black uppercase text-slate-400">Sales handover</div><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">{project.sales_handover_notes}</p></div>}
              {!!task.description && <div className="sm:col-span-2"><div className="text-[10px] font-black uppercase text-slate-400">Task instructions</div><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">{task.description}</p></div>}
            </div>
            {!!requiredSubmissionEvidence.length && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Package-required proof before review</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {requiredSubmissionEvidence.map(type => {
                    const complete = approvedEvidenceTypes.has(type);
                    return <span key={type} className={`rounded-full px-2.5 py-1 text-[10px] font-black ${complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{complete ? '✓ ' : '○ '}{evidenceLabel(type)}</span>;
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#000080]" /><div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Quality routing</div></div>
            <div className="mt-4 space-y-3 text-xs font-bold text-slate-700">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Designer self-QA</div>
              <div className="flex items-center gap-2"><ArrowRight className="h-4 w-4 text-slate-400" /> Independent Design QA</div>
              <div className="flex items-center gap-2"><ArrowRight className="h-4 w-4 text-slate-400" /> Accessibility review</div>
              <div className="flex items-center gap-2"><ArrowRight className="h-4 w-4 text-slate-400" /> Technical feasibility</div>
              <div className="flex items-center gap-2"><ArrowRight className="h-4 w-4 text-slate-400" /> Client Design Approval</div>
              <div className="flex items-center gap-2"><ArrowRight className="h-4 w-4 text-slate-400" /> Development → Design Implementation QA</div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Evidence references</div>
              <h3 className="mt-1 text-base font-black text-slate-900">One source of truth, referenced — not copied</h3>
              <p className="mt-1 text-xs text-slate-500">Add links/notes to approved content, brand assets, research, Figma, design systems and prototype sources. New versions supersede old active references while preserving history.</p>
            </div>
            <button type="button" onClick={() => setShowEvidenceForm(v => !v)} className="flex items-center gap-2 rounded-xl bg-[#000080] px-3 py-2 text-xs font-black text-white hover:bg-[#000066]"><Plus className="h-4 w-4" /> Add evidence</button>
          </div>

          {showEvidenceForm && (
            <div className="mt-4 grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/40 p-4 sm:grid-cols-2">
              <select value={evidenceType} onChange={e => setEvidenceType(e.target.value as DesignEvidenceType)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800">
                {EVIDENCE_OPTIONS.map(option => <option key={option.type} value={option.type}>{option.label}</option>)}
              </select>
              <input value={evidenceLabelText} onChange={e => setEvidenceLabelText(e.target.value)} placeholder="Label / source name" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs" />
              <input value={evidenceUrl} onChange={e => setEvidenceUrl(e.target.value)} placeholder="Source URL (Figma, Drive, approved content...)" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:col-span-2" />
              <input value={evidenceVersion} onChange={e => setEvidenceVersion(e.target.value)} placeholder="Version / milestone (optional)" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs" />
              <select value={evidenceStatus} onChange={e => setEvidenceStatus(e.target.value as 'Draft' | 'Approved')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"><option value="Approved">Approved/current</option><option value="Draft">Draft</option></select>
              <textarea value={evidenceNote} onChange={e => setEvidenceNote(e.target.value)} rows={3} placeholder="Evidence note / objective / audience / conversion detail" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:col-span-2" />
              <div className="flex justify-end gap-2 sm:col-span-2">
                <button type="button" onClick={() => setShowEvidenceForm(false)} className="px-3 py-2 text-xs font-bold text-slate-500">Cancel</button>
                <button type="button" disabled={running==='evidence'} onClick={() => void saveEvidence()} className="flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2 text-xs font-black text-white disabled:opacity-50">{running==='evidence'&&<Loader2 className="h-3.5 w-3.5 animate-spin" />} Save reference</button>
              </div>
            </div>
          )}

          {activeEvidence.length ? <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{activeEvidence.map(item => <EvidencePill key={item.id} item={item} />)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-5 text-center text-xs font-semibold text-slate-500">No design evidence references recorded yet.</div>}
        </section>

        <ProductivityPlaybookChecklist entityType="project_task" entityId={taskId} />

        {!!workspace?.clientFeedback?.length && (
          <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5">
            <div className="text-[10px] font-black uppercase tracking-widest text-amber-700">Client Design Approval history</div>
            <div className="mt-3 space-y-2">{workspace.clientFeedback.slice(0,5).map((item:any) => <div key={item.id} className="rounded-2xl bg-white px-4 py-3"><div className="text-xs font-black text-slate-800">{item.action}</div>{item.notes&&<p className="mt-1 text-xs leading-5 text-slate-600">{item.notes}</p>}</div>)}</div>
          </section>
        )}

        {!!workspace?.reviews?.length && (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Review history</div>
            <div className="mt-3 space-y-2">{workspace.reviews.slice(0,12).map(review => <div key={review.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 px-4 py-3"><div><div className="text-xs font-black text-slate-800">{review.review_type}</div><div className="mt-0.5 text-[10px] font-semibold text-slate-500">Round {review.review_round}{review.quality_score!=null?` · Score ${review.quality_score}`:''}</div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${review.status==='Pass'?'bg-emerald-100 text-emerald-700':review.status==='Pending'?'bg-blue-100 text-blue-700':'bg-amber-100 text-amber-700'}`}>{review.status}</span>{review.notes&&<p className="w-full text-xs leading-5 text-slate-600">{review.notes}</p>}</div>)}</div>
          </section>
        )}

        <section className="sticky bottom-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <LockKeyhole className="h-4 w-4 text-[#000080]" /> Workflow transitions are server-enforced.
            </div>
            <div className="flex flex-wrap gap-2">
              {(taskStatus==='To Do'||taskStatus==='Changes Required') && (
                <button type="button" disabled={!readiness?.ready||!!running} onClick={() => void execute('start',()=>designDeliveryService.startTask(taskId))} className="flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{running==='start'?<Loader2 className="h-4 w-4 animate-spin"/>:<ArrowRight className="h-4 w-4"/>} {taskStatus==='Changes Required'?'Start revision':'Start design work'}</button>
              )}
              {taskStatus==='In Progress' && (
                <>
                  <input value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Optional review context" className="min-w-[220px] rounded-xl border border-slate-200 px-3 py-2 text-xs" />
                  <button type="button" disabled={!!running} onClick={() => void execute('submit',()=>designDeliveryService.submitForReview(taskId,reviewNote))} className="flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{running==='submit'?<Loader2 className="h-4 w-4 animate-spin"/>:<FileCheck2 className="h-4 w-4"/>} Submit for internal gates</button>
                </>
              )}
              {taskStatus==='Review' && <div className="rounded-xl bg-blue-50 px-4 py-2.5 text-xs font-black text-blue-700">Waiting for structured reviews</div>}
              {taskStatus==='Done' && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-xs font-black text-emerald-700">Internal design gates passed</div>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
