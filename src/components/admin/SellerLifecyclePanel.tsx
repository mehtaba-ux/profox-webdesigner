import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  Users
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import {
  SellerLifecycleQueue,
  SellerLifecycleQueueKey,
  sellerLifecycleService
} from '../../lib/sellerLifecycleService';

const SELLER_ROLES = ['sales', 'sales_rep', 'sales_team'];

const QUEUES: Array<{
  key: SellerLifecycleQueueKey;
  label: string;
  countKey: keyof SellerLifecycleQueue['counts'];
  icon: typeof Users;
  note: string;
}> = [
  { key: 'active_leads', label: 'Active Leads', countKey: 'activeLeads', icon: Users, note: 'Prospects still being qualified or followed up.' },
  { key: 'deals_quotations', label: 'Deals & Quotations', countKey: 'dealsQuotations', icon: FileText, note: 'Qualified commercial work moving toward acceptance.' },
  { key: 'awaiting_payment', label: 'Awaiting Payment', countKey: 'awaitingPayment', icon: CreditCard, note: 'Accepted work waiting for the qualifying payment.' },
  { key: 'onboarding', label: 'Client Onboarding', countKey: 'onboarding', icon: ClipboardList, note: 'Paid customers completing the secure onboarding brief.' },
  { key: 'ready_for_handoff', label: 'Ready for Handoff', countKey: 'readyForHandoff', icon: Send, note: 'Onboarding complete. Review and send the brief to Project Management.' },
  { key: 'closed_customers', label: 'Closed Customers', countKey: 'closedCustomers', icon: CheckCircle2, note: 'Sales ownership is finished or the project is in production.' }
];

function formatWhen(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function SellerLifecyclePanel() {
  const navigate = useNavigate();
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const allowed = Boolean(user && profile && profile.status === 'active' && (isAdmin || SELLER_ROLES.includes(profile.role)));
  const [data, setData] = useState<SellerLifecycleQueue | null>(null);
  const [selected, setSelected] = useState<SellerLifecycleQueueKey>('ready_for_handoff');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    if (!allowed) return;
    setLoading(true);
    setError('');
    try {
      const next = await sellerLifecycleService.get();
      setData(next);
      if (next.counts.readyForHandoff > 0) setSelected('ready_for_handoff');
      else if (next.counts.onboarding > 0) setSelected('onboarding');
      else if (next.counts.awaitingPayment > 0) setSelected('awaiting_payment');
      else if (next.counts.dealsQuotations > 0) setSelected('deals_quotations');
      else if (next.counts.activeLeads > 0) setSelected('active_leads');
      else setSelected('closed_customers');
    } catch (err: any) {
      setError(err?.message || 'Unable to load the Sales lifecycle queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const rows = useMemo(() => {
    if (!data) return [];
    if (selected === 'closed_customers') {
      return data.recentClosed.map(item => ({
        ...item,
        queueKey: 'closed_customers' as const,
        nextActionLabel: 'View customer',
        blocker: ''
      }));
    }
    return data.items.filter(item => item.queueKey === selected);
  }, [data, selected]);

  if (authLoading || !allowed) return null;

  return (
    <section className="border-b border-slate-200 bg-[#f3f7fc] px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#000080]">Sales · Customer Lifecycle</div>
            <h2 className="mt-1 text-xl font-black text-slate-900">One clear queue from lead to production</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              This is a live operational view over the existing CRM, quotations, payments, onboarding and project workflow. It does not create a second pipeline.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data?.scope === 'team' && <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[10px] font-black text-blue-800">Management team view</span>}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600 shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh lifecycle
            </button>
          </div>
        </div>

        {error && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">{error}</div>}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {QUEUES.map(queue => {
            const Icon = queue.icon;
            const count = data?.counts?.[queue.countKey] || 0;
            const active = selected === queue.key;
            const priority = queue.key === 'ready_for_handoff' && count > 0;
            return (
              <button
                key={queue.key}
                type="button"
                onClick={() => setSelected(queue.key)}
                className={`rounded-2xl border p-4 text-left shadow-sm transition ${
                  active
                    ? 'border-[#000080] bg-white ring-2 ring-[#000080]/10'
                    : priority
                      ? 'border-amber-300 bg-amber-50 hover:border-amber-400'
                      : 'border-slate-200 bg-white hover:border-[#000080]/30'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <Icon className={`h-4 w-4 ${priority ? 'text-amber-700' : 'text-[#000080]'}`} />
                  <span className={`text-2xl font-black ${priority ? 'text-amber-800' : 'text-[#000080]'}`}>{count}</span>
                </div>
                <div className="mt-3 text-[11px] font-black text-slate-800">{queue.label}</div>
                <p className="mt-1 text-[9px] leading-4 text-slate-500">{queue.note}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-black text-slate-900">{QUEUES.find(queue => queue.key === selected)?.label}</div>
              <div className="mt-1 text-[10px] text-slate-500">Open the exact existing record for the next required action.</div>
            </div>
            {loading && <div className="inline-flex items-center gap-2 text-[10px] font-bold text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating</div>}
          </div>

          {!loading && rows.length === 0 ? (
            <div className="p-6 text-center text-xs font-semibold text-slate-500">No customers are currently in this lifecycle queue.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map((item: any, index) => (
                <button
                  key={`${item.leadId || item.projectId || 'row'}-${index}`}
                  type="button"
                  onClick={() => item.actionUrl && navigate(item.actionUrl)}
                  disabled={!item.actionUrl}
                  className="flex w-full flex-col gap-3 px-5 py-4 text-left hover:bg-blue-50/30 disabled:cursor-default sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-black text-slate-900">{item.companyName || item.projectName || 'Customer'}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${item.queueKey === 'ready_for_handoff' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                        {item.lifecycleStage}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                      {item.projectNumber && <span>{item.projectNumber}</span>}
                      {item.quotationNumber && <span>{item.quotationNumber}</span>}
                      {item.paymentReference && <span>{item.paymentReference}</span>}
                      {item.currentOwnerName && <span>Owner: {item.currentOwnerName}</span>}
                      {formatWhen(item.updatedAt) && <span>Updated {formatWhen(item.updatedAt)}</span>}
                    </div>
                    {item.blocker && <div className="mt-2 text-[10px] font-bold text-red-700">{item.blocker}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[10px] font-black text-[#000080]">
                    {item.nextActionLabel || 'Open record'} <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
