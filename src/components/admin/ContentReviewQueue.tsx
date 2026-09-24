import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X
} from 'lucide-react';
import {
  ContentReviewDecision,
  ContentReviewType,
  ContentWorkspace,
  contentDeliveryService
} from '../../lib/contentDeliveryService';

function getError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as any).message || 'Something went wrong.');
  return 'Something went wrong.';
}

function reviewTypeForStage(stage: string): ContentReviewType | null {
  if (stage === 'SME / Fact Check') return 'SME Fact Check';
  if (stage === '2i Editorial Review') return '2i Editorial Review';
  if (stage === 'SEO / Conversion Review') return 'SEO / Conversion Review';
  if (stage === 'In-Context QA') return 'In-Context QA';
  return null;
}

function operationalAction(stage: string) {
  switch (stage) {
    case 'Client Approved': return { label: 'Send to Implementation', help: 'Client approval is recorded. Release this approved content to the implementation stage.' };
    case 'Ready for Implementation': return { label: 'Confirm Implemented', help: 'Confirm the approved content has been implemented in the actual page/product context.' };
    case 'Implemented': return { label: 'Start In-Context QA', help: 'Move the implemented content into its final in-context quality check.' };
    case 'Approved for Publication': return { label: 'Mark Published', help: 'Confirm the approved content is live in the intended production context.' };
    case 'Published': return { label: 'Move to Measurement', help: 'Move the published content into measurement and maintenance.' };
    default: return null;
  }
}

export default function ContentReviewQueue({ compact = false }: { compact?: boolean }) {
  const [items, setItems] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [workspace, setWorkspace] = useState<ContentWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [scores, setScores] = useState<Record<string, string>>({});
  const [defects, setDefects] = useState<Record<'C0' | 'C1' | 'C2' | 'C3', string>>({ C0: '', C1: '', C2: '', C3: '' });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [queue, summary] = await Promise.all([contentDeliveryService.getReviewQueue(), contentDeliveryService.getMetrics()]);
      setItems(queue as any[]);
      setMetrics(summary as any);
    } catch (e) {
      setError(getError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const open = async (item: any) => {
    setSelected(item);
    setDetailLoading(true);
    setError('');
    setFeedback('');
    setScores({});
    setDefects({ C0: '', C1: '', C2: '', C3: '' });
    try {
      setWorkspace(await contentDeliveryService.getWorkspace(item.taskId));
    } catch (e) {
      setError(getError(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const reviewType = selected ? reviewTypeForStage(selected.stage) : null;
  const operation = selected ? operationalAction(selected.stage) : null;
  const waitingClient = selected?.stage === 'Ready for Client Review';
  const numericReview = reviewType != null && ['2i Editorial Review', 'SEO / Conversion Review', 'In-Context QA'].includes(reviewType);
  const dimensions = workspace?.config?.qualityDimensions || [];
  const scoreTotal = useMemo(() => Object.values(scores).reduce((sum, value) => sum + (Number(value) || 0), 0), [scores]);
  const scoresComplete = !numericReview || dimensions.every(dimension => scores[dimension.key] !== undefined && scores[dimension.key] !== '');

  const submit = async (decision: ContentReviewDecision) => {
    if (!workspace || !reviewType) return;
    if (numericReview && !scoresComplete) {
      setError('Score every quality dimension before completing this review.');
      return;
    }
    setBusy('review');
    setError('');
    try {
      const defectList = (Object.entries(defects) as Array<['C0' | 'C1' | 'C2' | 'C3', string]>)
        .filter(([, note]) => note.trim())
        .map(([severity, note]) => ({ severity, note: note.trim() }));
      const result = await contentDeliveryService.recordReview({
        deliverableId: workspace.deliverable.id,
        reviewType,
        decision,
        scores: numericReview ? Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, Number(value)])) : {},
        defects: defectList,
        feedback
      });
      if (result.decision === 'Passed') await contentDeliveryService.advance(workspace.deliverable.id, `${reviewType} passed.`);
      await load();
      setSelected(null);
      setWorkspace(null);
    } catch (e) {
      setError(getError(e));
    } finally {
      setBusy('');
    }
  };

  const advanceOperation = async () => {
    if (!workspace || !operation) return;
    setBusy('advance');
    setError('');
    try {
      await contentDeliveryService.advance(workspace.deliverable.id, operation.label);
      await load();
      setSelected(null);
      setWorkspace(null);
    } catch (e) {
      setError(getError(e));
    } finally {
      setBusy('');
    }
  };

  const verifyClaim = async (claimId: string, status: 'Verified' | 'Rejected' | 'Not Required') => {
    if (!selected) return;
    setBusy(claimId);
    setError('');
    try {
      await contentDeliveryService.verifyClaim(claimId, status, status === 'Verified' ? 'Verified during independent content fact check.' : 'Reviewed during independent content fact check.');
      setWorkspace(await contentDeliveryService.getWorkspace(selected.taskId));
    } catch (e) {
      setError(getError(e));
    } finally {
      setBusy('');
    }
  };

  if (loading) return <div className="flex items-center justify-center rounded-3xl border border-slate-200 bg-white p-10"><Loader2 className="h-6 w-6 animate-spin text-[#000080]" /></div>;

  return (
    <section className={`rounded-[28px] border border-slate-200 bg-white shadow-sm ${compact ? 'p-4' : 'p-5 sm:p-6'}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]"><ClipboardCheck className="h-4 w-4" />Quality & handoff control</div><h2 className="mt-1 text-lg font-black text-slate-900">Content Control Queue</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">One queue for independent review, client-waiting status, implementation handoff, final QA and publication.</p></div>
        <button type="button" onClick={() => void load()} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>

      {metrics && !compact && <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5"><Metric label="Waiting Review" value={metrics.waitingReview} /><Metric label="Waiting Client" value={metrics.waitingClient} /><Metric label="Blocked" value={metrics.blocked} warn={metrics.blocked > 0} /><Metric label="Avg. Quality" value={metrics.averageQuality != null ? `${metrics.averageQuality}/100` : '—'} /><Metric label="Published" value={metrics.published} /></div>}
      {error && <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      <div className="mt-5 space-y-2">
        {items.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" /><div className="mt-2 text-sm font-black text-slate-800">Control queue is clear</div><p className="mt-1 text-xs text-slate-500">No Content Delivery item currently needs review, approval follow-up or handoff.</p></div> : items.map(item => <button key={item.deliverableId} type="button" onClick={() => void open(item)} className="flex w-full flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/30 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black text-slate-900">{item.taskTitle}</span><span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-black text-violet-700">{item.stage}</span>{item.revisionRound > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-800">Revision {item.revisionRound}</span>}<SlaBadge status={item.slaStatus} ageHours={item.ageHours} slaHours={item.slaHours} /></div><div className="mt-1 text-[11px] font-semibold text-slate-500">{item.projectNumber} · {item.projectName} · {item.clientName || 'Client'} · Writer: {item.writerName || 'Assigned writer'}</div></div><div className="flex items-center gap-2 text-[11px] font-bold text-[#000080]">Open <ChevronRight className="h-4 w-4" /></div></button>)}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5">
          <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-[30px] bg-slate-50 shadow-2xl">
            <div className="sticky top-0 z-20 flex items-start justify-between gap-4 rounded-t-[30px] border-b border-slate-200 bg-white/95 p-5 backdrop-blur sm:p-6"><div><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]">{selected.stage}</span><SlaBadge status={selected.slaStatus} ageHours={selected.ageHours} slaHours={selected.slaHours} /></div><h3 className="mt-1 text-xl font-black text-slate-900">{selected.taskTitle}</h3><p className="mt-1 text-xs font-semibold text-slate-500">{selected.projectNumber} · {selected.projectName} · {selected.clientName || 'Client'}</p></div><button type="button" onClick={() => { setSelected(null); setWorkspace(null); }} className="rounded-xl p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700"><X className="h-5 w-5" /></button></div>

            {detailLoading || !workspace ? <div className="flex min-h-[400px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /></div> : <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1.2fr_.8fr]">
              <div className="space-y-5">
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-[#000080]" /><h4 className="text-sm font-black">Latest Content Version</h4></div><div className="mt-3 max-h-[520px] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-800">{workspace.versions[0]?.content || 'No saved version is available.'}</div></section>

                {selected.stage === 'SME / Fact Check' && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-700" /><h4 className="text-sm font-black">Claim Verification</h4></div><div className="mt-4 space-y-3">{workspace.claims.filter(claim => claim.material).length === 0 ? <div className="text-xs text-slate-500">No material claims are registered.</div> : workspace.claims.filter(claim => claim.material).map(claim => <div key={claim.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex flex-wrap items-center gap-2"><span className="text-[9px] font-black uppercase text-slate-500">{claim.claim_type}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${claim.verification_status === 'Verified' ? 'bg-emerald-100 text-emerald-800' : claim.verification_status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{claim.verification_status}</span></div><p className="mt-2 text-sm font-semibold leading-6 text-slate-800">{claim.claim_text}</p>{claim.source_url && <div className="mt-2 break-all text-[11px] text-blue-700">{claim.source_url}</div>}{claim.source_note && <div className="mt-1 text-[11px] leading-5 text-slate-500">{claim.source_note}</div>}{claim.verification_status === 'Pending' && <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy === claim.id} onClick={() => void verifyClaim(claim.id, 'Verified')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold text-white">Verified</button><button type="button" disabled={busy === claim.id} onClick={() => void verifyClaim(claim.id, 'Rejected')} className="rounded-lg bg-red-50 px-3 py-1.5 text-[10px] font-bold text-red-700">Reject</button><button type="button" disabled={busy === claim.id} onClick={() => void verifyClaim(claim.id, 'Not Required')} className="rounded-lg bg-slate-200 px-3 py-1.5 text-[10px] font-bold text-slate-700">Not Required</button></div>}</div>)}</div></section>}
              </div>

              <div className="space-y-5">
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]">Current gate</div>
                  <h4 className="mt-1 text-base font-black">{reviewType || (waitingClient ? 'Client Approval' : operation?.label || selected.stage)}</h4>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Writer: {selected.writerName || 'Assigned writer'}. Independent reviewers cannot approve a version they authored.</p>

                  {numericReview && <div className="mt-5 space-y-3"><div className="flex items-center justify-between"><div className="text-xs font-black text-slate-700">Quality score</div><div className={`rounded-full px-2.5 py-1 text-xs font-black ${scoreTotal >= (workspace.config.qualityPassScore || 90) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{scoreTotal}/100</div></div>{dimensions.map(dimension => <label key={dimension.key} className="grid grid-cols-[1fr_74px] items-center gap-3"><span className="text-[11px] font-semibold text-slate-600">{dimension.label} <span className="text-slate-400">/{dimension.weight}</span></span><input type="number" min={0} max={dimension.weight} value={scores[dimension.key] ?? ''} onChange={event => setScores(current => ({ ...current, [dimension.key]: event.target.value }))} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-xs font-bold outline-none focus:border-[#000080]" /></label>)}</div>}

                  {reviewType && <><div className="mt-5 border-t border-slate-100 pt-4"><div className="text-xs font-black text-slate-700">Defects</div><p className="mt-1 text-[10px] leading-4 text-slate-400">C0/C1 always block approval even if the score is 90+.</p><div className="mt-3 space-y-2">{(['C0','C1','C2','C3'] as const).map(severity => <label key={severity} className="block"><span className={`mb-1 block text-[9px] font-black ${severity === 'C0' || severity === 'C1' ? 'text-red-600' : 'text-slate-500'}`}>{severity} {severity === 'C0' ? 'Critical' : severity === 'C1' ? 'Major' : severity === 'C2' ? 'Medium' : 'Minor'}</span><input value={defects[severity]} onChange={event => setDefects(current => ({ ...current, [severity]: event.target.value }))} placeholder="Optional defect note" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] outline-none focus:border-[#000080]" /></label>)}</div></div><label className="mt-4 block"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Consolidated feedback</span><textarea rows={5} value={feedback} onChange={event => setFeedback(event.target.value)} placeholder="What is good, what must change, and why..." className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 outline-none focus:border-[#000080]" /></label><div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" disabled={busy === 'review'} onClick={() => void submit('Changes Required')} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800 disabled:opacity-50">Changes Required</button><button type="button" disabled={busy === 'review' || (numericReview && !scoresComplete)} onClick={() => void submit('Passed')} className="flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">{busy === 'review' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Pass & Advance</button></div></>}

                  {waitingClient && <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4"><div className="flex items-center gap-2 text-xs font-black text-[#000080]"><Clock className="h-4 w-4" />Waiting for client decision</div><p className="mt-2 text-[11px] leading-5 text-slate-600">The exact internally approved content is visible in the existing Client Portal. The client’s approve/change decision is written into the canonical project approval ledger automatically. No internal sync button is needed.</p></div>}

                  {operation && <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><div className="text-xs font-black text-emerald-900">{operation.label}</div><p className="mt-1 text-[11px] leading-5 text-emerald-800">{operation.help}</p><button type="button" disabled={busy === 'advance'} onClick={() => void advanceOperation()} className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy === 'advance' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{operation.label}</button></div>}
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Context</div><dl className="mt-3 space-y-2 text-xs">{[['Version', `V${workspace.deliverable.current_version_no || 0}`],['Revision round', String(workspace.deliverable.revision_round)],['Quality', workspace.deliverable.quality_score != null ? `${workspace.deliverable.quality_score}/100` : workspace.deliverable.quality_status],['Package', workspace.package.name || 'Project package']].map(([label,value]) => <div key={label} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-0"><dt className="font-bold text-slate-400">{label}</dt><dd className="text-right font-bold text-slate-800">{value}</dd></div>)}</dl></section>
              </div>
            </div>}
          </div>
        </div>
      )}
    </section>
  );
}

function SlaBadge({ status, ageHours, slaHours }: { status?: string; ageHours?: number; slaHours?: number }) {
  if (!status || ageHours == null || slaHours == null) return null;
  const className = status === 'Breached' ? 'bg-red-100 text-red-700' : status === 'Due Soon' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700';
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${className}`}>{status} · {ageHours}h/{slaHours}h</span>;
}

function Metric({ label, value, warn = false }: { label: string; value: any; warn?: boolean }) {
  return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className={`mt-1 text-base font-black ${warn ? 'text-red-600' : 'text-slate-900'}`}>{value}</div></div>;
}
