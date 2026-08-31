import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Gauge, Loader2, Users } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { contentDeliveryService } from '../../lib/contentDeliveryService';
import ContentReviewQueue from './ContentReviewQueue';
import ContentDeliverySettings from './ContentDeliverySettings';
import ContentCompensationSettings from './ContentCompensationSettings';
import ContentAssignmentManagement from './ContentAssignmentManagement';

const REVIEW_ROLES = new Set(['admin', 'project_manager', 'editor', 'qa', 'site_manager']);
const COMPENSATION_ROLES = new Set(['admin', 'project_manager', 'site_manager', 'finance', 'accountant']);

export default function ContentDeliveryManagement() {
  const { role } = useAuth();
  const canReview = REVIEW_ROLES.has(String(role || ''));
  const canManageCompensation = COMPENSATION_ROLES.has(String(role || ''));
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(canReview);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canReview) return;
    const load = async () => {
      setLoading(true);
      setError('');
      try { setMetrics(await contentDeliveryService.getMetrics()); }
      catch (e: any) { setError(e?.message || 'Content Delivery metrics are not available yet.'); }
      finally { setLoading(false); }
    };
    void load();
  }, [canReview]);

  if (!canReview && !canManageCompensation) return null;

  return (
    <div className="space-y-5">
      {canReview && <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]"><Gauge className="h-4 w-4" />Delivery control</div><h2 className="mt-1 text-lg font-black text-slate-900">Content Delivery Health</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">See bottlenecks, workload and quality risks without opening every project.</p></div>
          {loading && <Loader2 className="h-5 w-5 animate-spin text-[#000080]" />}
        </div>

        {error && <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

        {metrics && <>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <Metric label="Active" value={metrics.active ?? 0} />
            <Metric label="Blocked" value={metrics.blocked ?? 0} warn={(metrics.blocked ?? 0) > 0} />
            <Metric label="Waiting Review" value={metrics.waitingReview ?? 0} />
            <Metric label="Waiting Client" value={metrics.waitingClient ?? 0} />
            <Metric label="SLA Breaches" value={(metrics.reviewSlaBreached ?? 0) + (metrics.clientSlaBreached ?? 0)} warn={(metrics.reviewSlaBreached ?? 0) + (metrics.clientSlaBreached ?? 0) > 0} />
            <Metric label="Avg. Quality" value={metrics.averageQuality != null ? `${metrics.averageQuality}/100` : '—'} good={Number(metrics.averageQuality || 0) >= 90} />
          </div>

          <div className="mt-5 border-t border-slate-100 pt-5">
            <div className="flex items-center gap-2"><Users className="h-4 w-4 text-[#000080]" /><h3 className="text-sm font-black text-slate-900">Writer WIP Capacity</h3></div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(metrics.writerCapacity || []).length === 0 ? <div className="text-xs text-slate-400">No active Content Writers yet.</div> : (metrics.writerCapacity || []).map((writer: any) => <div key={writer.userId} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div className="text-xs font-black text-slate-900">{writer.name}</div><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${writer.capacityStatus === 'Available' ? 'bg-emerald-100 text-emerald-800' : writer.capacityStatus === 'At Limit' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'}`}>{writer.capacityStatus}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><Small label="Active" value={writer.activeWip} /><Small label="Limit" value={writer.wipLimit} /><Small label="Review" value={writer.waitingReview} /></div></div>)}</div>
          </div>
        </>}
      </section>}

      {canReview && <ContentReviewQueue />}
      {canManageCompensation && <ContentAssignmentManagement />}
      {role === 'admin' && <ContentDeliverySettings />}
      {role === 'admin' && <ContentCompensationSettings />}
    </div>
  );
}

function Metric({ label, value, warn = false, good = false }: { label: string; value: any; warn?: boolean; good?: boolean }) {
  return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className={`mt-1 text-lg font-black ${warn ? 'text-red-600' : good ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</div></div>;
}

function Small({ label, value }: { label: string; value: any }) {
  return <div className="rounded-xl bg-white p-2"><div className="text-[8px] font-black uppercase text-slate-400">{label}</div><div className="mt-0.5 text-xs font-black text-slate-800">{value}</div></div>;
}
