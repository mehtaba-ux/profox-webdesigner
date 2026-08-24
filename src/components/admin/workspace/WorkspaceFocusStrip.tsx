import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Clock3, Loader2, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ProductivityCommandCenter, productivityService } from '../../../lib/productivityService';

export default function WorkspaceFocusStrip() {
  const navigate = useNavigate();
  const [data, setData] = useState<ProductivityCommandCenter | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await productivityService.getCommandCenter('mine');
        if (active) setData(result);
      } catch {
        if (active) setData(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) {
    return <div className="pf-reference-card mb-5 flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-[#000080]" /></div>;
  }
  if (!data) return null;

  const first = data.items.slice(0, 3);
  return (
    <section className="pf-reference-card mb-5 overflow-hidden border-blue-100">
      <div className="flex flex-col gap-4 border-b border-slate-100 bg-[linear-gradient(135deg,#f8fbff,#ffffff)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#FF0E0E]"><Sparkles className="h-3.5 w-3.5" /> Start here</div>
          <h2 className="mt-1 text-base font-extrabold">{data.counts.total === 0 ? 'You are clear to focus.' : 'Your next work is already organized.'}</h2>
          <p className="mt-1 text-[10px] text-slate-500">
            {data.counts.overdue > 0
              ? `${data.counts.overdue} overdue item${data.counts.overdue === 1 ? '' : 's'} need attention first.`
              : `${data.counts.doNow} item${data.counts.doNow === 1 ? '' : 's'} to do now · no need to hunt through apps.`}
          </p>
        </div>
        <button onClick={() => navigate('/admin/today')} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#000080] px-4 text-[10px] font-extrabold text-white">Open Today <ArrowRight className="h-3.5 w-3.5" /></button>
      </div>

      {first.length > 0 && (
        <div className="grid gap-px bg-slate-100 md:grid-cols-3">
          {first.map(item => (
            <button key={item.itemKey} onClick={() => navigate(`/admin/focus/${item.entityType}/${item.entityId}`)} className="bg-white p-4 text-left transition hover:bg-blue-50/50">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-extrabold text-slate-800">{item.title}</span>
                {item.bucket === 'Overdue' ? <AlertCircle className="h-4 w-4 shrink-0 text-red-500" /> : <Clock3 className="h-4 w-4 shrink-0 text-slate-300" />}
              </div>
              <div className="mt-1 line-clamp-1 text-[9px] text-slate-400">{item.subtitle}</div>
              <div className="mt-3 text-[9px] font-extrabold text-[#000080]">{item.actionLabel} →</div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
