import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, ShieldCheck, X } from 'lucide-react';
import {
  DesignDeliveryWorkspace,
  DesignReviewDecision,
  DesignReviewQueueItem,
  designDeliveryService
} from '../../lib/designDeliveryService';

const DECISIONS: DesignReviewDecision[] = ['Pass', 'Minor Revision', 'Major Revision', 'Reject / Rework'];

export default function DesignReviewQueue({ onChanged }: { onChanged?: () => void | Promise<void> }) {
  const [items, setItems] = useState<DesignReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<DesignReviewQueueItem | null>(null);
  const [workspace, setWorkspace] = useState<DesignDeliveryWorkspace | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [decision, setDecision] = useState<DesignReviewDecision>('Pass');
  const [score, setScore] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await designDeliveryService.getMyReviews());
    } catch (e: any) {
      setError(e?.message || 'Unable to load Design Delivery reviews.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const reviewTask = new URLSearchParams(window.location.search).get('reviewTask');
    if (!reviewTask || !items.length) return;
    const item = items.find(row => row.taskId === reviewTask);
    if (item) void openReview(item);
  }, [items]);

  const openReview = async (item: DesignReviewQueueItem) => {
    setSelected(item);
    setWorkspace(null);
    setDecision('Pass');
    setScore('');
    setNotes('');
    setDetailLoading(true);
    setError('');
    try {
      setWorkspace(await designDeliveryService.getWorkspace(item.taskId));
    } catch (e: any) {
      setError(e?.message || 'Unable to load review context.');
    } finally {
      setDetailLoading(false);
    }
  };

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError('');
    try {
      const parsedScore = score.trim() === '' ? null : Number(score);
      if (parsedScore != null && (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > 100)) {
        throw new Error('Quality score must be between 0 and 100.');
      }
      await designDeliveryService.submitReviewDecision({
        reviewId: selected.reviewId,
        decision,
        qualityScore: parsedScore,
        notes
      });
      setSelected(null);
      setWorkspace(null);
      await load();
      await onChanged?.();
    } catch (e: any) {
      setError(e?.message || 'Unable to submit review decision.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeEvidence = useMemo(() => (workspace?.evidence || []).filter(item => item.active), [workspace?.evidence]);
  if (!loading && !items.length && !error) return null;

  return (
    <>
      <section className="rounded-3xl border border-violet-200 bg-violet-50/50 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700"><ShieldCheck className="h-5 w-5" /></div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-600">Design quality queue</div>
              <h2 className="mt-1 text-base font-black text-slate-900">Reviews assigned to you</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">Structured PF-SOP-08 review gates replace scattered review messages and automatically return work to the correct owner when changes are required.</p>
            </div>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-violet-700">{items.length}</span>
        </div>
        {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</div>}
        {loading ? <div className="mt-4"><Loader2 className="h-4 w-4 animate-spin text-violet-700" /></div> : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {items.map(item => (
              <button key={item.reviewId} type="button" onClick={() => void openReview(item)} className="rounded-2xl border border-white bg-white p-4 text-left shadow-sm transition hover:border-violet-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-widest text-violet-600">{item.reviewType}</div><h3 className="mt-1 truncate text-sm font-black text-slate-900">{item.taskTitle}</h3><p className="mt-1 text-[11px] font-semibold text-slate-500">{item.projectNumber} · {item.projectName} · {item.clientName || 'Client'}</p></div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${item.slaStatus==='Breached'?'bg-red-100 text-red-700':item.slaStatus==='Due Soon'?'bg-amber-100 text-amber-700':'bg-emerald-100 text-emerald-700'}`}>{item.slaStatus}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-[10px] font-bold text-slate-500"><span>Designer: {item.designerName || 'Assigned designer'}</span><span>Round {item.reviewRound}</span><span>{item.ageHours}h in review</span></div>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[30px] bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
              <div><div className="text-[10px] font-black uppercase tracking-widest text-violet-600">{selected.reviewType} · Round {selected.reviewRound}</div><h2 className="mt-1 text-lg font-black text-slate-900">{selected.taskTitle}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{selected.projectNumber} · {selected.projectName} · {selected.clientName}</p></div>
              <button onClick={() => { setSelected(null); setWorkspace(null); }} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-5 p-6">
              {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{error}</div>}
              {detailLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#000080]" /></div> : workspace && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5"><div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Approved scope</div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{workspace.project?.scope_summary || 'Not recorded'}</p></div>
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5"><div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Requirements</div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{workspace.project?.requirements_summary || 'Not recorded'}</p></div>
                  </div>

                  <section className="rounded-3xl border border-slate-200 p-5">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current design evidence</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {activeEvidence.map(item => <div key={item.id} className="rounded-2xl bg-slate-50 p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase text-slate-400">{item.evidence_type.replaceAll('_',' ')}</div><div className="mt-1 text-xs font-bold text-slate-800">{item.label || item.version_label || item.status}</div>{item.reference_note&&<p className="mt-1 text-[11px] leading-5 text-slate-600">{item.reference_note}</p>}</div>{item.reference_url&&<a href={item.reference_url} target="_blank" rel="noreferrer" className="rounded-xl bg-white p-2 text-[#000080]"><ExternalLink className="h-4 w-4" /></a>}</div></div>)}
                    </div>
                  </section>

                  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#000080]" /><div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Structured decision</div></div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <select value={decision} onChange={e => setDecision(e.target.value as DesignReviewDecision)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-800">{DECISIONS.map(item => <option key={item} value={item}>{item}</option>)}</select>
                      {selected.reviewType==='Independent Design QA' ? <input type="number" min={0} max={100} step={1} value={score} onChange={e => setScore(e.target.value)} placeholder="PF-SOP-08 quality score (90+ to pass)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs" /> : <div className="flex items-center rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] font-bold text-slate-500">No numeric score required for this gate.</div>}
                      <textarea rows={5} value={notes} onChange={e => setNotes(e.target.value)} placeholder={decision==='Pass'?'Optional review notes / evidence':'Required: specific finding, impact and correction required'} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs sm:col-span-2" />
                    </div>
                    {decision!=='Pass' && <div className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-[11px] font-bold text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />This decision returns the canonical design task to Changes Required and cancels the remaining review gates for this round so the revised design is reviewed cleanly again.</div>}
                    <div className="mt-4 flex justify-end"><button type="button" onClick={() => void submit()} disabled={submitting} className="flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{submitting&&<Loader2 className="h-4 w-4 animate-spin" />} Submit review decision</button></div>
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
