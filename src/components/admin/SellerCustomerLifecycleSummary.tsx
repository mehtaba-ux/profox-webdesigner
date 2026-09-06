import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, ChevronDown, ChevronUp, Circle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SellerCustomerLifecycle, sellerLifecycleService } from '../../lib/sellerLifecycleService';

const MILESTONES: Array<{ key: keyof SellerCustomerLifecycle['milestones']; label: string }> = [
  { key: 'lead', label: 'Lead' },
  { key: 'quotation', label: 'Quote' },
  { key: 'payment', label: 'Payment' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'handoff', label: 'Handoff' },
  { key: 'production', label: 'Production' },
  { key: 'completed', label: 'Completed' }
];

type Props = {
  leadId?: string | null;
  projectId?: string | null;
  showAction?: boolean;
  compact?: boolean;
  collapsible?: boolean;
  defaultExpanded?: boolean;
};

export default function SellerCustomerLifecycleSummary({
  leadId,
  projectId,
  showAction = true,
  compact = false,
  collapsible = false,
  defaultExpanded = true,
}: Props) {
  const navigate = useNavigate();
  const [data, setData] = useState<SellerCustomerLifecycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setExpanded(defaultExpanded);
    sellerLifecycleService.getCustomerLifecycle({ leadId, projectId })
      .then(value => { if (active) setData(value); })
      .catch((err: any) => { if (active) setError(err?.message || 'Lifecycle status could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [leadId, projectId, defaultExpanded]);

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs font-bold text-slate-500 shadow-sm"><Loader2 className="mr-2 inline h-4 w-4 animate-spin text-[#000080]" />Loading customer journey…</div>;
  if (error || !data) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error || 'Lifecycle status unavailable.'}</div>;

  const completedCount = MILESTONES.filter(({ key }) => Boolean(data.milestones?.[key])).length;

  if (collapsible && !expanded) {
    return (
      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded="false"
          aria-label="Expand customer journey"
          className="flex w-full min-w-0 items-center gap-3 px-3 py-3 text-left transition hover:bg-slate-50"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#000080]">
            <Check className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-[9px] font-black uppercase tracking-[.14em] text-[#000080]">Customer Journey</span>
              <span className="truncate text-xs font-black text-slate-900">{data.lifecycleStage}</span>
            </div>
            <div className="mt-0.5 truncate text-[9px] font-semibold text-slate-400">{data.projectStage || 'Not started'} · {data.currentOwnerName || data.currentOwnerRole || 'Management'}</div>
          </div>
          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-black text-slate-500">{completedCount}/{MILESTONES.length}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
      </section>
    );
  }

  return (
    <section className={`min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-black uppercase tracking-[.16em] text-[#000080]">Customer Journey</div>
          <div className="mt-1 break-words text-lg font-black text-slate-950">{data.lifecycleStage}</div>
          <div className="mt-1 break-words text-[10px] leading-4 text-slate-500">Project Stage: <span className="font-black text-slate-700">{data.projectStage || 'Not started'}</span></div>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <div className="min-w-[110px] rounded-xl bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
            <div className="font-black uppercase tracking-wide text-slate-400">Current Owner</div>
            <div className="mt-1 break-words font-black text-slate-800">{data.currentOwnerName || data.currentOwnerRole || 'Management'}</div>
            <div className="break-words">{data.currentOwnerRole || ''}</div>
          </div>
          {collapsible && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-expanded="true"
              aria-label="Minimize customer journey"
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:bg-slate-50 hover:text-[#000080]"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className={`mt-4 grid gap-x-2 gap-y-3 ${collapsible ? 'grid-cols-4 sm:grid-cols-7' : compact ? 'grid-cols-4' : 'grid-cols-4 sm:grid-cols-7'}`}>
        {MILESTONES.map(({ key, label }) => {
          const done = Boolean(data.milestones?.[key]);
          const current = !done && ((key === 'handoff' && data.queueKey === 'ready_for_handoff') || (key === 'onboarding' && data.queueKey === 'onboarding') || (key === 'payment' && data.queueKey === 'awaiting_payment') || (key === 'production' && data.lifecycleStage.includes('Production')));
          return (
            <div key={key} className="min-w-0 text-center">
              <div className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full border ${done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : current ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-300'}`}>{done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}</div>
              <div className="mt-1 break-words text-[8px] font-black leading-3 text-slate-500">{label}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
        <div className="text-[9px] font-black uppercase tracking-[.14em] text-[#000080]">NEXT ACTION</div>
        <div className="mt-1 break-words text-xs font-black leading-5 text-slate-900">{data.nextActionLabel}</div>
        {data.blocker && <div className="mt-2 flex items-start gap-2 break-words text-[10px] font-bold leading-4 text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Blocker: {data.blocker}</span></div>}
        {showAction && data.actionUrl && <button type="button" onClick={() => navigate(data.actionUrl)} className="mt-3 inline-flex max-w-full items-center gap-2 rounded-lg bg-[#000080] px-3 py-2 text-left text-[10px] font-black leading-4 text-white"><span className="break-words">{data.nextActionLabel}</span><ArrowRight className="h-3.5 w-3.5 shrink-0" /></button>}
      </div>
    </section>
  );
}
