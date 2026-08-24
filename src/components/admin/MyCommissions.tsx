import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Clock,
  DollarSign,
  Flame,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { commissionService, DEFAULT_COMMISSION_SETTINGS } from '../../lib/commissionService';
import {
  CommissionEntry,
  CommissionSettingsConfig,
  CommissionStats,
  CommissionStatus
} from '../../types';
import { useAuth } from '../../lib/AuthContext';

export default function MyCommissions() {
  const { user } = useAuth();
  const salespersonId = user?.id || '';

  const [entries, setEntries] = useState<CommissionEntry[]>([]);
  const [stats, setStats] = useState<CommissionStats | null>(null);
  const [settings, setSettings] = useState<CommissionSettingsConfig>(DEFAULT_COMMISSION_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CommissionStatus | 'All'>('All');

  const loadData = async () => {
    if (!salespersonId) {
      setEntries([]);
      setStats(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const freshSettings = await commissionService.refreshSettings();
      const freshEntries = await commissionService.refreshEntries(salespersonId);
      setSettings(freshSettings);
      setEntries(freshEntries);
      setStats(commissionService.getStats(salespersonId));
    } catch (err: any) {
      setError(err?.message || 'Unable to load your commission ledger.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [salespersonId]);

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return entries.filter(entry => {
      if (statusFilter !== 'All' && entry.status !== statusFilter) return false;
      if (!query) return true;
      return [
        entry.entryNumber,
        entry.clientName,
        entry.packageName,
        entry.paymentReference,
        entry.quotationNumber || ''
      ].some(value => value.toLowerCase().includes(query));
    });
  }, [entries, searchQuery, statusFilter]);

  const target = settings.performanceBonusThreshold || 10;
  const currentSales = stats?.salesCountThisMonth || 0;
  const remainingToThreshold = Math.max(0, target - currentSales);
  const progressPercent = target > 0 ? Math.min(100, Math.round((currentSales / target) * 100)) : 100;

  if (loading && entries.length === 0) {
    return (
      <div className="min-h-[520px] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#000080] mx-auto" />
          <p className="text-sm text-slate-500">Loading your verified commission ledger…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      <div className="rounded-2xl bg-gradient-to-r from-[#000080] via-[#11153d] to-[#00005c] text-white p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-blue-200 mb-2">
              <Award className="w-4 h-4" /> Sales earnings
            </div>
            <h1 className="text-2xl sm:text-3xl font-black">My Commissions</h1>
            <p className="mt-2 max-w-2xl text-sm text-blue-100/80">
              Your ledger is calculated only from verified customer payments. Base rates, self-generated bonuses and monthly performance bonuses are recorded with each commission entry.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-blue-200 font-bold">Payout schedule</div>
              <div className="text-sm font-black mt-1">{settings.payoutScheduleDescription}</div>
            </div>
            <button
              onClick={() => void loadData()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-bold disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Earned" value={stats?.earnedTotal || 0} icon={<DollarSign className="w-5 h-5" />} note="Waiting for approval" />
        <StatCard label="Approved" value={stats?.approvedTotal || 0} icon={<CheckCircle2 className="w-5 h-5" />} note="Approved for payout" />
        <StatCard label="Paid" value={stats?.paidTotal || 0} icon={<ShieldCheck className="w-5 h-5" />} note="Confirmed payouts" />
        <StatCard label="Under Review" value={stats?.pendingReviewTotal || 0} icon={<Clock className="w-5 h-5" />} note="Custom/admin review" />
      </div>

      <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl p-5 sm:p-6 text-white shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400/15 border border-amber-300/20 text-amber-300 text-[10px] uppercase tracking-wider font-bold">
              <Flame className="w-3 h-3" /> Monthly accelerator
            </div>
            <h2 className="text-lg font-black mt-3">
              {currentSales >= target
                ? `Threshold reached — the next eligible sale can receive +${settings.performanceBonusPercent} percentage points`
                : `${currentSales} of ${target} confirmed eligible sales this month`}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
              {currentSales >= target
                ? `The performance bonus begins from sale ${target + 1} onward in the same calendar month. Each qualifying commission entry records whether the bonus was applied.`
                : `${remainingToThreshold} more confirmed eligible sale${remainingToThreshold === 1 ? '' : 's'} to reach the threshold. The +${settings.performanceBonusPercent} percentage-point accelerator begins on sale ${target + 1}.`}
            </p>
          </div>
          <div className="w-full lg:w-80 rounded-xl bg-white/10 border border-white/10 p-4">
            <div className="flex justify-between text-xs font-bold mb-2">
              <span className="text-slate-300">Monthly progress</span>
              <span className="text-amber-300">{progressPercent}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-white/15 overflow-hidden">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="mt-2 text-[10px] text-slate-400 flex justify-between">
              <span>0</span><span>{target} threshold</span><span>{target + 1}+ bonus</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search client, package, entry or payment…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-[#000080]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value as CommissionStatus | 'All')}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold"
          >
            <option value="All">All statuses</option>
            {(['Earned', 'Under Review', 'Approved', 'Paid', 'Reversed', 'Disputed'] as CommissionStatus[]).map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="p-12 text-center">
            <DollarSign className="w-9 h-9 text-slate-300 mx-auto mb-3" />
            <h3 className="font-bold text-slate-800">No commission records found</h3>
            <p className="text-sm text-slate-500 mt-1">A commission entry appears after an eligible customer payment is verified.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Entry / Date</th>
                  <th className="px-4 py-3 text-left">Client / Package</th>
                  <th className="px-4 py-3 text-right">Verified Payment</th>
                  <th className="px-4 py-3 text-center">Rate Breakdown</th>
                  <th className="px-4 py-3 text-right">Commission</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEntries.map(entry => (
                  <tr key={entry.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-4">
                      <div className="font-bold text-slate-900">{entry.entryNumber}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{formatDate(entry.eligibilityDate)}</div>
                      <div className="text-[10px] font-mono text-slate-400 mt-1">{entry.paymentReference}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-800">{entry.clientName}</div>
                      <div className="text-xs text-slate-500">{entry.packageName}</div>
                      <div className="text-[10px] text-slate-400 mt-1">{entry.milestoneLabel}</div>
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-slate-900">{money(entry.verifiedPaymentAmount, entry.currency)}</td>
                    <td className="px-4 py-4 text-center">
                      <div className="font-black text-[#000080]">{entry.effectiveCommissionRate}%</div>
                      <div className="mt-1 flex justify-center flex-wrap gap-1 text-[10px]">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Base {entry.baseCommissionRate}%</span>
                        {entry.selfGeneratedBonusRate > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold"><Sparkles className="inline w-3 h-3" /> +{entry.selfGeneratedBonusRate}% self-gen</span>
                        )}
                        {entry.performanceBonusRate > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-bold">+{entry.performanceBonusRate}% sale #{entry.performanceSaleRank}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="font-black text-[#000080]">{money(entry.commissionAmount, entry.currency)}</div>
                      {entry.payoutReference && <div className="text-[10px] text-purple-600 font-mono mt-1">{entry.payoutReference}</div>}
                    </td>
                    <td className="px-4 py-4 text-center"><StatusBadge status={entry.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs text-slate-600 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-[#000080] shrink-0 mt-0.5" />
        <span>Commission values shown here are read from your own server-authorized ledger records. Sales representatives cannot approve, alter, pay or reverse commission entries.</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, note }: { label: string; value: number; icon: React.ReactNode; note: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
        <span className="p-2 rounded-xl bg-slate-50 text-[#000080]">{icon}</span>
      </div>
      <div className="text-2xl font-black text-slate-900 mt-3">{money(value)}</div>
      <div className="text-xs text-slate-500 mt-1">{note}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: CommissionStatus }) {
  const classes: Record<CommissionStatus, string> = {
    Earned: 'bg-blue-100 text-blue-700',
    'Under Review': 'bg-amber-100 text-amber-700',
    Approved: 'bg-emerald-100 text-emerald-700',
    Paid: 'bg-purple-100 text-purple-700',
    Reversed: 'bg-rose-100 text-rose-700',
    Disputed: 'bg-orange-100 text-orange-700'
  };
  return <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold ${classes[status]}`}>{status}</span>;
}

function money(value: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0));
  } catch {
    return `$${Number(value || 0).toFixed(2)}`;
  }
}

function formatDate(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
