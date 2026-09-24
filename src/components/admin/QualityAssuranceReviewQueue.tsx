import React, { useEffect, useState } from 'react';
import { ClipboardCheck, RefreshCw } from 'lucide-react';
import { qualityAssuranceService, type QaReviewQueueItem } from '../../lib/qualityAssuranceService';
import QualityAssuranceTaskWorkspace from './QualityAssuranceTaskWorkspace';

export default function QualityAssuranceReviewQueue({ enabled, onChanged }: { enabled: boolean; onChanged?: () => void | Promise<void> }) {
  const [items, setItems] = useState<QaReviewQueueItem[]>([]);
  const [selected, setSelected] = useState<QaReviewQueueItem | null>(null);

  const load = async () => {
    if (!enabled) return;
    try { setItems(await qualityAssuranceService.getReviewQueue()); } catch { setItems([]); }
  };

  useEffect(() => { void load(); }, [enabled]);
  if (!enabled || !items.length) return null;

  return (
    <>
      <section className="rounded-3xl border border-orange-200 bg-orange-50/50 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-orange-700"><ClipboardCheck className="h-4 w-4" />QA review queue</div><h2 className="mt-1 text-base font-black text-slate-900">{items.length} QA gate{items.length === 1 ? '' : 's'} awaiting a decision</h2><p className="mt-1 text-xs leading-5 text-slate-600">Open the complete evidence and findings workspace before passing or returning QA.</p></div><button type="button" onClick={() => void load()} className="rounded-xl border border-orange-200 bg-white p-2 text-orange-700"><RefreshCw className="h-4 w-4" /></button></div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">{items.map(item => <button type="button" key={item.taskId} onClick={() => setSelected(item)} className="rounded-2xl border border-orange-100 bg-white p-4 text-left transition hover:border-orange-300 hover:shadow-sm"><div className="text-xs font-black text-slate-900">{item.taskTitle}</div><div className="mt-1 text-[10px] font-bold text-[#000080]">{item.projectNumber} · {item.projectName}</div><div className="mt-2 text-[10px] text-slate-500">QA specialist: {item.assigneeName || 'Assigned QA'} · {item.priority}</div></button>)}</div>
      </section>
      {selected && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/70 p-3 backdrop-blur-sm sm:p-5"><div className="w-full max-w-6xl"><QualityAssuranceTaskWorkspace taskId={selected.taskId} onClose={() => setSelected(null)} onChanged={async () => { await load(); await onChanged?.(); }} /></div></div>}
    </>
  );
}
