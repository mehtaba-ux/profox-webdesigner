import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  X
} from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import {
  ManagerExceptionFilter,
  ManagerExceptionItem,
  ManagerExceptionWorkspace as WorkspaceData,
  managerExceptionService
} from '../../lib/managerExceptionService';

const PAGE_SIZE = 25;

const FILTERS: Array<{ key: ManagerExceptionFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'blocking', label: 'Blocking' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'proposal_readiness', label: 'Proposal Readiness' },
  { key: 'validations', label: 'Validations' },
  { key: 'quotation_approvals', label: 'Quotation Approvals' },
  { key: 'meeting_closeout', label: 'Meeting Close-Out' },
  { key: 'decision_process', label: 'Decision Process' },
  { key: 'next_action', label: 'Next Action' },
  { key: 'stage_sla', label: 'Stage SLA' },
  { key: 'returned_handoffs', label: 'Returned Handoffs' },
  { key: 'promise_coverage', label: 'Promise Coverage' },
  { key: 'overrides', label: 'Audited Overrides' },
];

const PRIORITY_CLASSES: Record<string, string> = {
  CRITICAL: 'border-red-200 bg-red-50 text-red-800',
  HIGH: 'border-amber-200 bg-amber-50 text-amber-900',
  NORMAL: 'border-slate-200 bg-slate-50 text-slate-700',
};

function formatDate(value?: string | null) {
  if (!value) return 'Not applicable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ageLabel(hours?: number | null) {
  if (hours === null || hours === undefined || !Number.isFinite(Number(hours))) return 'Age unavailable';
  const value = Number(hours);
  if (value < 1) return '< 1 hour';
  if (value < 24) return `${Math.round(value)} hours`;
  const days = value / 24;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)} days`;
}

function humanize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
}

export default function ManagerExceptionWorkspace() {
  const navigate = useNavigate();
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const allowed = Boolean(user && profile?.status === 'active' && isAdmin);
  const [filter, setFilter] = useState<ManagerExceptionFilter>('all');
  const [search, setSearch] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [selected, setSelected] = useState<ManagerExceptionItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    if (!allowed) return;
    setLoading(true);
    setError('');
    try {
      const next = await managerExceptionService.getWorkspace({
        filter,
        search: search.trim(),
        ownerId: ownerId || null,
        limit: PAGE_SIZE,
        offset,
      });
      setData(next);
      setSelected(current => current ? next.items.find(item => item.exceptionKey === current.exceptionKey) || null : null);
    } catch (err: any) {
      setError(err?.message || 'Manager Exceptions could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!allowed) return;
    const timer = window.setTimeout(() => void load(), search ? 250 : 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, filter, search, ownerId, offset]);

  useEffect(() => {
    setOffset(0);
  }, [filter, search, ownerId]);

  const counts = data?.counts;
  const pageStart = data?.total ? offset + 1 : 0;
  const pageEnd = data ? Math.min(offset + PAGE_SIZE, data.total) : 0;

  const summary = useMemo(() => [
    { label: 'Total Exceptions', value: counts?.total || 0, note: 'Current source-derived attention items' },
    { label: 'Blocking', value: counts?.blocking || 0, note: 'Hard blockers requiring source remediation' },
    { label: 'Overdue', value: counts?.overdue || 0, note: 'Past a canonical due time or SLA' },
    { label: 'Pending Review', value: counts?.pendingReview || 0, note: 'Validation / quotation-review work' },
  ], [counts]);

  if (authLoading) return <div className="min-h-[520px] bg-[#f3f7fc]" />;
  if (!allowed) return <Navigate to="/admin" replace />;

  return (
    <div className="min-h-screen bg-[#f3f7fc] text-slate-900">
      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-red-600">Sales SOP · Manager Oversight</div>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Manager Exceptions</h1>
              <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
                Only deals and handoffs that need intervention. Every exception is derived from the existing authoritative workflow and disappears when that source is resolved.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-wider">
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[#000080]">Admin Team Scope</span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">Source-Derived</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">Read-Only Triage</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 shadow-sm hover:border-[#000080]/30 hover:text-[#000080] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080]"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh source truth
            </button>
          </div>
        </header>

        {error && (
          <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div><div className="font-black">Manager Exceptions could not be loaded.</div><div className="mt-1 text-xs">{error}</div></div>
          </div>
        )}

        <section aria-label="Exception summary" className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summary.map(card => (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-3xl font-black tracking-tight">{card.value}</div>
              <div className="mt-1 text-xs font-black text-slate-800">{card.label}</div>
              <div className="mt-1 text-[10px] leading-4 text-slate-400">{card.note}</div>
            </div>
          ))}
        </section>

        <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Manager Exception filters">
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_220px_auto]">
            <label className="relative block">
              <span className="sr-only">Search Manager Exceptions</span>
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search exception, deal, owner or reason…"
                className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-xs font-semibold outline-none focus:border-[#000080] focus:ring-2 focus:ring-[#000080]/10"
              />
            </label>

            <label>
              <span className="sr-only">Filter by Seller or owner</span>
              <select
                aria-label="Filter by Seller or owner"
                value={ownerId}
                onChange={event => setOwnerId(event.target.value)}
                className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:border-[#000080] focus:ring-2 focus:ring-[#000080]/10"
              >
                <option value="">All owners</option>
                {(data?.owners || []).map(owner => <option key={owner.id} value={owner.id}>{owner.name} ({owner.count})</option>)}
              </select>
            </label>

            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[10px] font-bold text-slate-500">
              <Filter className="h-4 w-4" />
              {data ? `${data.total} matching` : 'Loading source state'}
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Exception type filters">
            {FILTERS.map(item => (
              <button
                key={item.key}
                type="button"
                aria-pressed={filter === item.key}
                onClick={() => setFilter(item.key)}
                className={`shrink-0 rounded-xl px-3 py-2 text-[10px] font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080] ${
                  filter === item.key ? 'bg-[#000080] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" aria-labelledby="manager-exception-list-title">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 id="manager-exception-list-title" className="text-sm font-black">Exceptions requiring attention</h2>
              <p className="mt-1 text-[10px] text-slate-400">No card can be resolved here. Open the authoritative workflow to act.</p>
            </div>
            {loading && <Loader2 className="h-5 w-5 animate-spin text-[#000080]" aria-label="Loading Manager Exceptions" />}
          </div>

          {loading && !data ? (
            <div className="flex min-h-[360px] items-center justify-center" role="status" aria-label="Loading Manager Exceptions">
              <Loader2 className="h-7 w-7 animate-spin text-[#000080]" />
            </div>
          ) : (data?.items || []).length === 0 ? (
            <div className="px-5 py-14 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
              <h3 className="mt-3 text-sm font-black text-emerald-900">No matching Sales exceptions.</h3>
              <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-slate-500">
                This is a valid operational state. Normal healthy deals are intentionally absent, and zero-state categories are not filled with fake production exceptions.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data?.items.map(item => (
                <ExceptionRow
                  key={item.exceptionKey}
                  item={item}
                  onInspect={() => setSelected(item)}
                  onOpen={() => navigate(item.actionUrl)}
                />
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 text-[10px] font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <div>{data ? `Showing ${pageStart}–${pageEnd} of ${data.total}` : 'No page loaded'}</div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={offset === 0 || loading}
                onClick={() => setOffset(current => Math.max(0, current - PAGE_SIZE))}
                className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-200 px-3 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </button>
              <button
                type="button"
                disabled={!data?.hasMore || loading}
                onClick={() => setOffset(current => current + PAGE_SIZE)}
                className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-200 px-3 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </section>

        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-[10px] font-semibold leading-5 text-[#000080]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Source-specific authorization remains authoritative. This aggregate creates no approval, validation, payment, Won, handoff, project-stage, bypass, ignore or fake-resolve authority.</span>
        </div>
      </main>

      {selected && (
        <ExceptionDrawer
          item={selected}
          onClose={() => setSelected(null)}
          onOpen={() => navigate(selected.actionUrl)}
        />
      )}
    </div>
  );
}

function ExceptionRow({ item, onInspect, onOpen }: {
  item: ManagerExceptionItem;
  onInspect: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="p-5 hover:bg-slate-50/60">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
        <button
          type="button"
          onClick={onInspect}
          className="min-w-0 flex-1 text-left focus-visible:rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080]"
          aria-label={`Inspect ${item.title}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-wider ${PRIORITY_CLASSES[item.workspacePriority] || PRIORITY_CLASSES.NORMAL}`}>
              {item.workspacePriority}
            </span>
            {item.blocking && <span className="rounded-full border border-red-200 bg-white px-2 py-1 text-[8px] font-black uppercase tracking-wider text-red-700">Blocking</span>}
            {item.overdue && <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-red-700">Overdue</span>}
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{humanize(item.category)}</span>
          </div>
          <h3 className="mt-2 text-sm font-black text-slate-900">{item.title}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.reason}</p>
        </button>

        <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[500px]">
          <Mini label="Owner" value={item.ownerName || 'Unassigned'} icon={<UserRound className="h-3.5 w-3.5" />} />
          <Mini label="Age" value={ageLabel(item.ageHours)} icon={<Clock3 className="h-3.5 w-3.5" />} />
          <Mini label="Source" value={humanize(item.sourceSystem)} />
          <Mini label="Status" value={humanize(item.sourceStatus || 'Attention')} />
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white hover:bg-[#000066] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080]"
        >
          {item.actionLabel} <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}

function Mini({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-slate-400">{icon}{label}</div>
      <div className="mt-1 truncate text-[10px] font-black text-slate-700" title={value}>{value}</div>
    </div>
  );
}

function ExceptionDrawer({ item, onClose, onOpen }: {
  item: ManagerExceptionItem;
  onClose: () => void;
  onOpen: () => void;
}) {
  const facts = safeMetadataFacts(item.metadata);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/35" role="presentation" onMouseDown={event => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="manager-exception-detail-title"
        className="ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-red-600">Exception Detail · Read-Only</div>
            <h2 id="manager-exception-detail-title" className="mt-1 text-lg font-black">{item.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close exception detail" className="rounded-xl border border-slate-200 p-2 text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${PRIORITY_CLASSES[item.workspacePriority] || PRIORITY_CLASSES.NORMAL}`}>{item.workspacePriority} workspace priority</span>
            {item.blocking && <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[9px] font-black uppercase text-red-700">Blocking</span>}
            {item.overdue && <span className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-[9px] font-black uppercase text-red-700">Overdue</span>}
          </div>

          <DetailSection title="Why it needs attention">
            <p>{item.reason}</p>
          </DetailSection>

          <DetailSection title="Source authority">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label="Exception Type" value={humanize(item.exceptionType)} />
              <Detail label="Source System" value={humanize(item.sourceSystem)} />
              <Detail label="Source Status" value={humanize(item.sourceStatus || 'Attention')} />
              <Detail label="Source Severity" value={item.sourceSeverity ? humanize(item.sourceSeverity) : 'No source severity'} />
              <Detail label="Owner" value={item.ownerName || 'Unassigned'} />
              <Detail label="Open Age" value={ageLabel(item.ageHours)} />
              <Detail label="Opened" value={formatDate(item.openedAt)} />
              <Detail label="Due" value={formatDate(item.dueAt)} />
            </dl>
          </DetailSection>

          {facts.length > 0 && (
            <DetailSection title="Safe operational facts">
              <dl className="grid gap-3 sm:grid-cols-2">
                {facts.map(([label, value]) => <Detail key={label} label={label} value={value} />)}
              </dl>
            </DetailSection>
          )}

          <DetailSection title="Recommended remediation">
            <p>{item.recommendedAction}</p>
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-[10px] font-semibold leading-5 text-[#000080]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              The Manager Exception Workspace does not resolve this item. The exception will disappear only when its authoritative source is corrected.
            </div>
          </DetailSection>
        </div>

        <div className="border-t border-slate-200 p-5">
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {item.actionLabel} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-6"><h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{title}</h3><div className="mt-2 text-xs leading-5 text-slate-700">{children}</div></section>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><dt className="text-[8px] font-black uppercase tracking-wider text-slate-400">{label}</dt><dd className="mt-1 break-words text-[10px] font-bold text-slate-700">{value}</dd></div>;
}

function safeMetadataFacts(metadata: Record<string, unknown> = {}) {
  const allowed = new Set([
    'stage',
    'blockerCount',
    'validationType',
    'reviewerTeam',
    'quotationNumber',
    'revisionNumber',
    'meetingType',
    'dimension',
    'activityId',
    'stageAgeHours',
    'stageSlaHours',
    'attemptNumber',
    'reviewerName',
    'promiseType',
    'coverageStatus',
    'eventCount',
  ]);

  return Object.entries(metadata)
    .filter(([key, value]) => allowed.has(key) && value !== null && value !== undefined && String(value) !== '')
    .map(([key, value]) => [humanize(key), Array.isArray(value) ? value.join(', ') : String(value)] as [string, string]);
}
