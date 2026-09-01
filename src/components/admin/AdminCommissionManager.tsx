import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  DollarSign,
  ExternalLink,
  Layers,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Sliders,
  Sparkles,
  UserRoundCheck,
  WalletCards,
} from 'lucide-react';
import { commissionService } from '../../lib/commissionService';
import {
  CommissionPartnerPayout,
  PAYPAL_SEND_URL,
  partnerPayoutService,
  SalesPartnerPayoutProfile,
} from '../../lib/partnerPayoutService';
import { supabase } from '../../lib/supabase';
import { CommissionEntry, CommissionPayoutBatch, CommissionStats, CommissionStatus } from '../../types';
import { useAuth } from '../../lib/AuthContext';
import RevenueDistributionAdmin from './RevenueDistributionAdmin';

type ViewTab = 'entries' | 'batches' | 'partners' | 'setup';

type PayoutProfileEditor = {
  source: SalesPartnerPayoutProfile;
  paypalEmail: string;
  preferredCurrency: string;
  paypalConfirmed: boolean;
  payoutEnabled: boolean;
  notes: string;
};

export default function AdminCommissionManager() {
  const { user, profile } = useAuth();
  const adminEmail = profile?.email || user?.email || 'Administrator';

  const [entries, setEntries] = useState<CommissionEntry[]>([]);
  const [batches, setBatches] = useState<CommissionPayoutBatch[]>([]);
  const [partnerPayouts, setPartnerPayouts] = useState<CommissionPartnerPayout[]>([]);
  const [payoutProfiles, setPayoutProfiles] = useState<SalesPartnerPayoutProfile[]>([]);
  const [stats, setStats] = useState<CommissionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>('entries');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CommissionStatus | 'All'>('All');
  const [selectedBatchEntryIds, setSelectedBatchEntryIds] = useState<string[]>([]);
  const [batchDate, setBatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [batchTitle, setBatchTitle] = useState('Commission Payout');
  const [profileEditor, setProfileEditor] = useState<PayoutProfileEditor | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      await commissionService.refreshSettings();
      const freshEntries = await commissionService.refreshEntries();
      const [freshBatches, freshProfiles, freshPartnerPayouts] = await Promise.all([
        commissionService.refreshPayoutBatches(),
        partnerPayoutService.listProfiles(),
        partnerPayoutService.listPayouts(),
      ]);
      setEntries(freshEntries);
      setBatches(freshBatches);
      setPayoutProfiles(freshProfiles);
      setPartnerPayouts(freshPartnerPayouts);
      setStats(commissionService.getStats());
      const eligibleIds = freshEntries
        .filter(entry => entry.status === 'Approved' && !entry.payoutBatchId)
        .map(entry => entry.id);
      setSelectedBatchEntryIds(current => current.filter(id => eligibleIds.includes(id)));
    } catch (err: any) {
      setError(err?.message || 'Unable to load the commission payout workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const runAction = async (key: string, work: () => Promise<void>) => {
    setActionKey(key);
    setError(null);
    setMessage(null);
    try {
      await work();
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'The commission action could not be completed.');
    } finally {
      setActionKey(null);
    }
  };

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return entries.filter(entry => {
      if (statusFilter !== 'All' && entry.status !== statusFilter) return false;
      if (!query) return true;
      return [
        entry.entryNumber,
        entry.salespersonName,
        entry.clientName,
        entry.packageName,
        entry.paymentReference,
        entry.quotationNumber || '',
      ].some(value => value.toLowerCase().includes(query));
    });
  }, [entries, searchQuery, statusFilter]);

  const batchEligibleEntries = useMemo(
    () => entries.filter(entry => entry.status === 'Approved' && !entry.payoutBatchId),
    [entries],
  );

  const selectedEntries = useMemo(
    () => batchEligibleEntries.filter(entry => selectedBatchEntryIds.includes(entry.id)),
    [batchEligibleEntries, selectedBatchEntryIds],
  );
  const selectedCurrencies = useMemo(
    () => [...new Set(selectedEntries.map(entry => entry.currency.toUpperCase()))],
    [selectedEntries],
  );
  const mixedCurrencySelection = selectedCurrencies.length > 1;
  const selectedBatchTotal = useMemo(
    () => selectedEntries.reduce((sum, entry) => sum + entry.commissionAmount, 0),
    [selectedEntries],
  );

  const payoutsByBatch = useMemo(() => {
    const result = new Map<string, CommissionPartnerPayout[]>();
    for (const payout of partnerPayouts) {
      const list = result.get(payout.batchId) || [];
      list.push(payout);
      result.set(payout.batchId, list);
    }
    return result;
  }, [partnerPayouts]);

  const approveEntry = (entry: CommissionEntry) =>
    runAction(`approve-${entry.id}`, async () => {
      if (entry.packageCode === 'PF-CUSTOM' && entry.status === 'Under Review') {
        throw new Error('Set the approved 10%–15% custom deal rate before approving this commission.');
      }
      await commissionService.updateStatus(entry.id, 'Approved', adminEmail, 'Approved by Administrator');
      setMessage(`${entry.entryNumber} approved for the next PayPal payout batch.`);
    });

  const setCustomRate = (entry: CommissionEntry) => {
    const raw = window.prompt('Approved custom base commission rate (10 to 15):', String(entry.baseCommissionRate || 10));
    if (raw === null) return;
    const rate = Number(raw);
    if (!Number.isFinite(rate) || rate < 10 || rate > 15) {
      setError('Custom commission rate must be between 10% and 15%.');
      return;
    }
    const notes = window.prompt('Optional approval note:', '') || '';
    void runAction(`rate-${entry.id}`, async () => {
      await commissionService.updateCustomDealRate(entry.id, rate, adminEmail, notes);
      setMessage(`${entry.entryNumber} custom base rate approved at ${rate}%.`);
    });
  };

  const adjustEntry = (entry: CommissionEntry) => {
    if (entry.status === 'Paid' || entry.status === 'Reversed' || entry.payoutBatchId) {
      setError('Paid, reversed, or payout-batched commission cannot be adjusted. Use the protected reversal workflow when applicable.');
      return;
    }
    const raw = window.prompt(`Adjusted commission amount for ${entry.entryNumber}:`, String(entry.commissionAmount));
    if (raw === null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0 || amount > entry.verifiedPaymentAmount) {
      setError(`Adjusted amount must be between 0 and ${money(entry.verifiedPaymentAmount, entry.currency)}.`);
      return;
    }
    if (amount === entry.commissionAmount) {
      setError('Adjusted amount must differ from the current commission amount.');
      return;
    }
    const reason = window.prompt('Adjustment reason (required):', '');
    if (!reason?.trim()) return;
    if (!window.confirm(`Adjust ${entry.entryNumber} from ${money(entry.commissionAmount, entry.currency)} to ${money(amount, entry.currency)}?`)) return;
    void runAction(`adjust-${entry.id}`, async () => {
      const { error: rpcError } = await supabase.rpc('admin_adjust_commission', {
        p_entry_id: entry.id,
        p_new_amount: amount,
        p_reason: reason.trim(),
      });
      if (rpcError) throw rpcError;
      setMessage(`${entry.entryNumber} adjusted and returned to management review.`);
    });
  };

  const reverseEntry = (entry: CommissionEntry) => {
    const reason = window.prompt(
      entry.status === 'Paid'
        ? 'Reason for reversing this already-paid commission. The paid history will remain preserved:'
        : 'Reason for reversing this commission:',
    );
    if (!reason?.trim()) return;
    if (!window.confirm(`Reverse ${entry.entryNumber}? The historical ledger record will remain preserved.`)) return;
    void runAction(`reverse-${entry.id}`, async () => {
      await commissionService.reverseCommission(entry.id, reason.trim(), adminEmail);
      setMessage(`${entry.entryNumber} reversed.`);
    });
  };

  const createBatch = () => {
    if (!selectedBatchEntryIds.length) {
      setError('Select at least one approved commission entry.');
      return;
    }
    if (mixedCurrencySelection) {
      setError('A payout batch can contain only one currency. Create separate batches for each currency.');
      return;
    }
    void runAction('create-batch', async () => {
      const batch = await commissionService.createPayoutBatch(
        batchTitle.trim() || 'Commission Payout',
        batchDate,
        selectedBatchEntryIds,
        adminEmail,
        'Independent sales partner PayPal commission payout.',
      );
      if (!batch) throw new Error('Payout batch was not created.');
      setSelectedBatchEntryIds([]);
      setMessage(`${batch.batchNumber} prepared. Each sales partner now has an independent PayPal payout status.`);
    });
  };

  const refreshBatch = (batch: CommissionPayoutBatch) => {
    void runAction(`refresh-batch-${batch.id}`, async () => {
      await partnerPayoutService.refreshBatch(batch.id);
      setMessage(`${batch.batchNumber} payout eligibility and PayPal details refreshed.`);
    });
  };

  const openPayPal = (payout: CommissionPartnerPayout) => {
    if (payout.status !== 'Ready') {
      setError(payout.holdReason || 'This payout is not ready for PayPal.');
      return;
    }
    window.open(PAYPAL_SEND_URL, '_blank', 'noopener,noreferrer');
  };

  const confirmPayout = (payout: CommissionPartnerPayout) => {
    if (payout.status !== 'Ready') return;
    const tx = window.prompt(
      `After sending ${money(payout.amount, payout.currency)} to ${payout.paypalEmail || 'the partner'} in PayPal, paste the PayPal transaction/reference ID:`,
      '',
    );
    if (!tx?.trim()) return;
    if (!window.confirm(`Confirm ${money(payout.amount, payout.currency)} was sent to ${payout.paypalEmail} via PayPal? This will mark only ${payout.salespersonName}'s ${payout.entryCount} commission entr${payout.entryCount === 1 ? 'y' : 'ies'} as Paid.`)) return;
    void runAction(`confirm-payout-${payout.id}`, async () => {
      await partnerPayoutService.confirmPaid(payout.id, tx.trim(), 'PayPal transfer confirmed from ProFox Admin.');
      setMessage(`${payout.salespersonName}'s PayPal payout was confirmed and the included commissions were marked Paid.`);
    });
  };

  const startEditProfile = (item: SalesPartnerPayoutProfile) => {
    setProfileEditor({
      source: item,
      paypalEmail: item.paypalEmail || '',
      preferredCurrency: item.preferredCurrency || 'USD',
      paypalConfirmed: item.paypalConfirmed,
      payoutEnabled: item.payoutEnabled,
      notes: '',
    });
    setActiveTab('partners');
  };

  const savePayoutProfile = () => {
    if (!profileEditor) return;
    const editor = profileEditor;
    void runAction(`profile-${editor.source.salespersonId}`, async () => {
      await partnerPayoutService.saveProfile({
        salespersonId: editor.source.salespersonId,
        paypalEmail: editor.paypalEmail,
        preferredCurrency: editor.preferredCurrency,
        paypalConfirmed: editor.paypalConfirmed,
        payoutEnabled: editor.payoutEnabled,
        notes: editor.notes,
      });
      setProfileEditor(null);
      setMessage(`${editor.source.fullName}'s PayPal payout profile was saved.`);
    });
  };

  const copyText = (value: string) => {
    if (!value) return;
    void navigator.clipboard?.writeText(value);
    setMessage('Copied to clipboard.');
  };

  if (loading && entries.length === 0 && batches.length === 0 && payoutProfiles.length === 0) {
    return (
      <div className="flex min-h-[520px] items-center justify-center">
        <div className="space-y-3 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#000080]" />
          <p className="text-sm text-slate-500">Loading commission payout workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-20">
      <div className="rounded-2xl bg-gradient-to-r from-[#000080] via-[#11153d] to-[#00005c] p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-200">
              <ShieldCheck className="h-4 w-4" /> Independent partner commission payouts
            </div>
            <h1 className="text-2xl font-black sm:text-3xl">Sales Commission & PayPal Payouts</h1>
            <p className="mt-2 max-w-3xl text-sm text-blue-100/80">
              ProFox remains the control center. Verified customer payments create commission; Admin approves and batches it; PayPal moves the money; the PayPal transaction ID closes only that partner payout.
            </p>
          </div>
          <button onClick={() => void loadData()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {(error || message) && (
        <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{error || message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Earned" value={stats?.earnedTotal || 0} icon={<DollarSign className="h-5 w-5" />} note="Awaiting approval" />
        <StatCard label="Approved" value={stats?.approvedTotal || 0} icon={<CheckCircle2 className="h-5 w-5" />} note="Ready to batch" />
        <StatCard label="Paid" value={stats?.paidTotal || 0} icon={<ShieldCheck className="h-5 w-5" />} note="PayPal reference confirmed" />
        <StatCard label="Under Review" value={stats?.pendingReviewTotal || 0} icon={<Clock className="h-5 w-5" />} note="Requires management action" />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 pb-3">
        <TabButton active={activeTab === 'entries'} onClick={() => setActiveTab('entries')} icon={<DollarSign className="h-4 w-4" />} label={`Commission Entries (${entries.length})`} />
        <TabButton active={activeTab === 'batches'} onClick={() => setActiveTab('batches')} icon={<Layers className="h-4 w-4" />} label={`PayPal Batches (${batches.length})`} />
        <TabButton active={activeTab === 'partners'} onClick={() => setActiveTab('partners')} icon={<WalletCards className="h-4 w-4" />} label={`Partner Payout Profiles (${payoutProfiles.length})`} />
        <TabButton active={activeTab === 'setup'} onClick={() => setActiveTab('setup')} icon={<Settings2 className="h-4 w-4" />} label="Commission & Margin Setup" />
      </div>

      {activeTab === 'setup' && <RevenueDistributionAdmin />}

      {activeTab === 'entries' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="relative max-w-xl flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search entry, salesperson, client, package or payment…" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as CommissionStatus | 'All')} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold">
              <option value="All">All statuses</option>
              {(['Earned', 'Under Review', 'Approved', 'Paid', 'Reversed', 'Disputed'] as CommissionStatus[]).map(status => <option key={status}>{status}</option>)}
            </select>
          </div>
          {filteredEntries.length === 0 ? <EmptyState text="No commission entries match the current filters." /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr><th className="px-4 py-3 text-left">Entry</th><th className="px-4 py-3 text-left">Sales Partner</th><th className="px-4 py-3 text-left">Client / Package</th><th className="px-4 py-3 text-right">Verified Payment</th><th className="px-4 py-3 text-center">Rate</th><th className="px-4 py-3 text-right">Commission</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEntries.map(entry => (
                    <tr key={entry.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-4"><div className="font-bold">{entry.entryNumber}</div><div className="mt-0.5 text-xs text-slate-500">{formatDate(entry.eligibilityDate)}</div></td>
                      <td className="px-4 py-4"><div className="font-semibold">{entry.salespersonName}</div><div className="text-xs text-slate-500">{entry.salespersonEmail || '—'}</div></td>
                      <td className="px-4 py-4"><div className="font-semibold">{entry.clientName}</div><div className="text-xs text-slate-500">{entry.packageName}</div></td>
                      <td className="px-4 py-4 text-right font-bold">{money(entry.verifiedPaymentAmount, entry.currency)}</td>
                      <td className="px-4 py-4 text-center"><div className="font-black text-[#000080]">{entry.effectiveCommissionRate}%</div><div className="mt-1 flex flex-wrap justify-center gap-1 text-[10px] text-slate-500"><span>Base {entry.baseCommissionRate}%</span>{entry.selfGeneratedBonusRate > 0 && <span className="text-emerald-700"><Sparkles className="inline h-3 w-3" /> +{entry.selfGeneratedBonusRate}%</span>}{entry.performanceBonusRate > 0 && <span className="text-purple-700">+{entry.performanceBonusRate}%</span>}</div></td>
                      <td className="px-4 py-4 text-right font-black text-[#000080]">{money(entry.commissionAmount, entry.currency)}</td>
                      <td className="px-4 py-4 text-center"><StatusBadge status={entry.status} /></td>
                      <td className="px-4 py-4"><div className="flex flex-wrap justify-end gap-1.5">
                        {entry.packageCode === 'PF-CUSTOM' && entry.status !== 'Paid' && entry.status !== 'Reversed' && !entry.payoutBatchId && <ActionButton label="Set Rate" icon={<Sliders className="h-3.5 w-3.5" />} busy={actionKey === `rate-${entry.id}`} onClick={() => setCustomRate(entry)} />}
                        {entry.status !== 'Paid' && entry.status !== 'Reversed' && !entry.payoutBatchId && <ActionButton label="Adjust" icon={<Sliders className="h-3.5 w-3.5" />} busy={actionKey === `adjust-${entry.id}`} onClick={() => adjustEntry(entry)} />}
                        {entry.status === 'Earned' && <ActionButton label="Approve" busy={actionKey === `approve-${entry.id}`} onClick={() => void approveEntry(entry)} />}
                        {entry.status === 'Under Review' && entry.packageCode !== 'PF-CUSTOM' && <ActionButton label="Approve" busy={actionKey === `approve-${entry.id}`} onClick={() => void approveEntry(entry)} />}
                        {entry.status === 'Approved' && <span className="rounded-lg bg-blue-50 px-2.5 py-2 text-[11px] font-bold text-blue-700">Pay via batch</span>}
                        {entry.status !== 'Reversed' && <button title="Reverse commission" onClick={() => reverseEntry(entry)} disabled={actionKey === `reverse-${entry.id}`} className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50">{actionKey === `reverse-${entry.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}</button>}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'batches' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div>
                <h2 className="font-black">Create PayPal payout batch</h2>
                <p className="mt-1 max-w-2xl text-xs text-slate-500">Use the existing payout cadence: 15th and last working day. Each batch may contain one currency; each partner receives an independent payout record and PayPal reference.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <input value={batchTitle} onChange={e => setBatchTitle(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Batch title" />
                <input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <button onClick={createBatch} disabled={actionKey === 'create-batch' || selectedBatchEntryIds.length === 0 || mixedCurrencySelection} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{actionKey === 'create-batch' && <Loader2 className="h-4 w-4 animate-spin" />}Create Batch</button>
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">Selected: {selectedBatchEntryIds.length} entries</span><span className="font-black text-[#000080]">{selectedCurrencies.length === 1 ? money(selectedBatchTotal, selectedCurrencies[0]) : `${selectedBatchTotal.toFixed(2)} across ${selectedCurrencies.length || 0} currencies`}</span></div>
              {mixedCurrencySelection && <div className="mt-2 text-xs font-semibold text-amber-700">Create separate payout batches for {selectedCurrencies.join(', ')}.</div>}
            </div>
            {batchEligibleEntries.length === 0 ? <div className="mt-4 text-sm text-slate-500">No approved unbatched commissions are ready.</div> : (
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {batchEligibleEntries.map(entry => (
                  <label key={entry.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
                    <div className="flex items-center gap-3"><input type="checkbox" checked={selectedBatchEntryIds.includes(entry.id)} onChange={e => setSelectedBatchEntryIds(current => e.target.checked ? [...new Set([...current, entry.id])] : current.filter(id => id !== entry.id))} /><div><div className="text-sm font-bold">{entry.salespersonName} · {entry.entryNumber}</div><div className="text-xs text-slate-500">{entry.clientName} · {entry.packageName}</div></div></div>
                    <div className="text-sm font-black">{money(entry.commissionAmount, entry.currency)}</div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {batches.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white"><EmptyState text="No payout batches yet." /></div> : batches.map(batch => {
            const payouts = payoutsByBatch.get(batch.id) || [];
            const paid = payouts.filter(item => item.status === 'Paid').length;
            const ready = payouts.filter(item => item.status === 'Ready').length;
            const held = payouts.filter(item => item.status === 'On Hold').length;
            return (
              <div key={batch.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-5 lg:flex-row lg:items-center">
                  <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{batch.batchNumber}</h3><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-600">{batch.status}</span></div><div className="mt-1 text-xs text-slate-500">{batch.title} · Scheduled {formatDate(batch.scheduledDate)} · {batch.totalEntriesCount} commission entries · {batch.totalSalespeopleCount} partners</div></div>
                  <div className="flex flex-wrap items-center gap-2"><div className="text-sm text-slate-500"><strong className="text-emerald-700">{paid} paid</strong> · {ready} ready · {held} held</div>{batch.status !== 'Completed' && <button onClick={() => refreshBatch(batch)} disabled={actionKey === `refresh-batch-${batch.id}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{actionKey === `refresh-batch-${batch.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Refresh eligibility</button>}</div>
                </div>
                {payouts.length === 0 ? <div className="p-5 text-sm text-slate-500">No per-partner payout records are attached to this batch.</div> : (
                  <div className="divide-y divide-slate-100">
                    {payouts.map(payout => {
                      const statementEntries = entries.filter(entry => entry.payoutBatchId === payout.batchId && entry.salespersonId === payout.salespersonId && entry.currency.toUpperCase() === payout.currency.toUpperCase() && entry.status !== 'Reversed');
                      const relatedProfile = payoutProfiles.find(item => item.salespersonId === payout.salespersonId);
                      return (
                        <div key={payout.id} className="p-5">
                          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_auto] xl:items-center">
                            <div><div className="flex items-center gap-2"><div className="font-black">{payout.salespersonName}</div><PayoutStatusBadge status={payout.status} /></div><div className="mt-1 text-xs text-slate-500">{payout.country || 'Country not set'} · {payout.entryCount} commission entr{payout.entryCount === 1 ? 'y' : 'ies'} · {money(payout.amount, payout.currency)}</div>{payout.holdReason && <div className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-amber-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{payout.holdReason}</div>}</div>
                            <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PayPal recipient</div><div className="mt-1 flex items-center gap-2 text-sm font-bold"><span className="truncate">{payout.paypalEmail || 'Not configured'}</span>{payout.paypalEmail && <button onClick={() => copyText(payout.paypalEmail || '')} title="Copy PayPal email" className="text-slate-400 hover:text-[#000080]"><Copy className="h-3.5 w-3.5" /></button>}</div>{payout.paypalTransactionId && <div className="mt-1 text-xs text-slate-500">Reference: <span className="font-mono">{payout.paypalTransactionId}</span></div>}</div>
                            <div className="flex flex-wrap justify-end gap-2">
                              {payout.status === 'Ready' && <><button onClick={() => openPayPal(payout)} className="inline-flex items-center gap-2 rounded-xl border border-[#003087] bg-white px-3 py-2 text-xs font-black text-[#003087] hover:bg-blue-50">Open PayPal <ExternalLink className="h-3.5 w-3.5" /></button><button onClick={() => confirmPayout(payout)} disabled={actionKey === `confirm-payout-${payout.id}`} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-3 py-2 text-xs font-black text-white disabled:opacity-50">{actionKey === `confirm-payout-${payout.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Confirm Paid</button></>}
                              {payout.status === 'On Hold' && relatedProfile && <button onClick={() => startEditProfile(relatedProfile)} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"><Settings2 className="h-3.5 w-3.5" />Fix payout profile</button>}
                              {payout.status === 'Paid' && <div className="text-right"><div className="text-xs font-bold text-emerald-700">Paid via PayPal</div><div className="text-[10px] text-slate-500">{formatDate(payout.paidAt || '')}</div></div>}
                            </div>
                          </div>
                          <details className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                            <summary className="cursor-pointer text-xs font-bold text-slate-700">Commission payout statement · {statementEntries.length} entries</summary>
                            <div className="mt-3 space-y-2">{statementEntries.map(entry => <div key={entry.id} className="flex flex-col justify-between gap-1 rounded-lg bg-white p-2.5 text-xs sm:flex-row sm:items-center"><div><strong>{entry.entryNumber}</strong> · {entry.clientName} · {entry.packageName}<div className="text-[10px] text-slate-500">Verified {money(entry.verifiedPaymentAmount, entry.currency)} · rate {entry.effectiveCommissionRate}%</div></div><div className="font-black text-[#000080]">{money(entry.commissionAmount, entry.currency)}</div></div>)}</div>
                          </details>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'partners' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Commission payout details only.</strong> This area does not create payroll, GST, TDS, PF/ESI, or tax records. Payout eligibility reuses the existing Activated seller account and verified Independent Sales Partner Agreement.</div></div>
          </div>
          {payoutProfiles.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white"><EmptyState text="No active Sales partner profiles are available." /></div> : (
            <div className="grid gap-4 lg:grid-cols-2">
              {payoutProfiles.map(item => (
                <div key={item.salespersonId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-black">{item.fullName}</h3>{item.payoutEligible ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase text-emerald-700">Payout eligible</span> : <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-700">On hold</span>}</div><div className="mt-1 text-xs text-slate-500">{item.email} · {item.country || 'Country not set'}</div></div><button onClick={() => startEditProfile(item)} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><Settings2 className="h-4 w-4" /></button></div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2"><InfoBox label="Activation" value={item.activationStage || 'Not linked'} ok={item.activationStage === 'Activated' && Boolean(item.finalApproval)} /><InfoBox label="Agreement" value={item.agreementVerified ? `${item.agreementStatus} · ${item.agreementNumber || ''}` : item.agreementStatus || 'Not verified'} ok={item.agreementVerified} /><InfoBox label="Payout method" value="PayPal" ok /><InfoBox label="Payout currency" value={item.preferredCurrency || 'USD'} ok={Boolean(item.preferredCurrency)} /></div>
                  <div className="mt-3 rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Confirmed PayPal email</div><div className="mt-1 flex items-center gap-2 text-sm font-bold"><span>{item.paypalEmail || 'Not configured'}</span>{item.paypalEmail && <button onClick={() => copyText(item.paypalEmail || '')}><Copy className="h-3.5 w-3.5 text-slate-400" /></button>}</div><div className={`mt-1 text-[11px] font-semibold ${item.paypalConfirmed ? 'text-emerald-700' : 'text-amber-700'}`}>{item.paypalConfirmed ? 'Confirmed by Admin' : 'Not confirmed'}</div></div>
                  {item.holdReason && <div className="mt-3 text-xs font-semibold text-amber-700">{item.holdReason}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {profileEditor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={e => { if (e.target === e.currentTarget) setProfileEditor(null); }}>
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-[#000080]">PayPal payout profile</div><h3 className="mt-1 text-xl font-black">{profileEditor.source.fullName}</h3><p className="mt-1 text-xs text-slate-500">Use the PayPal email the independent sales partner has confirmed for business commission payments.</p></div><button onClick={() => setProfileEditor(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold">Close</button></div>
            <div className="mt-5 space-y-4">
              <label className="block"><span className="text-xs font-bold text-slate-600">PayPal email</span><input type="email" value={profileEditor.paypalEmail} onChange={e => setProfileEditor(current => current ? { ...current, paypalEmail: e.target.value, paypalConfirmed: current.source.paypalEmail?.toLowerCase() === e.target.value.trim().toLowerCase() ? current.paypalConfirmed : false } : current)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="partner@example.com" /></label>
              <label className="block"><span className="text-xs font-bold text-slate-600">Payout currency</span><input value={profileEditor.preferredCurrency} maxLength={3} onChange={e => setProfileEditor(current => current ? { ...current, preferredCurrency: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') } : current)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm uppercase" placeholder="USD" /></label>
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={profileEditor.paypalConfirmed} onChange={e => setProfileEditor(current => current ? { ...current, paypalConfirmed: e.target.checked } : current)} className="mt-1" /><div><div className="text-sm font-bold">PayPal details confirmed</div><div className="text-xs text-slate-500">I have confirmed that this PayPal email belongs to/is authorised by this sales partner for commission payouts.</div></div></label>
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={profileEditor.payoutEnabled} onChange={e => setProfileEditor(current => current ? { ...current, payoutEnabled: e.target.checked } : current)} className="mt-1" /><div><div className="text-sm font-bold">Payouts enabled</div><div className="text-xs text-slate-500">Turn this off to place future/unpaid commission payouts on hold without deleting earned commission.</div></div></label>
              <label className="block"><span className="text-xs font-bold text-slate-600">Admin note (optional)</span><textarea value={profileEditor.notes} onChange={e => setProfileEditor(current => current ? { ...current, notes: e.target.value } : current)} className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Confirmation note…" /></label>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setProfileEditor(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold">Cancel</button><button onClick={savePayoutProfile} disabled={actionKey === `profile-${profileEditor.source.salespersonId}`} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{actionKey === `profile-${profileEditor.source.salespersonId}` && <Loader2 className="h-4 w-4 animate-spin" />}Save payout profile</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button onClick={onClick} className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${active ? 'bg-[#000080] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{icon}{label}</button>;
}

function StatCard({ label, value, icon, note }: { label: string; value: number; icon: React.ReactNode; note: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</div><div className="rounded-xl bg-slate-50 p-2 text-[#000080]">{icon}</div></div><div className="mt-3 text-2xl font-black">{money(value)}</div><div className="mt-1 text-xs text-slate-500">{note}</div></div>;
}

function InfoBox({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div><div className={`mt-1 flex items-center gap-1.5 text-xs font-bold ${ok ? 'text-slate-800' : 'text-amber-700'}`}>{ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <AlertCircle className="h-3.5 w-3.5" />}{value || '—'}</div></div>;
}

function ActionButton({ label, onClick, busy, icon }: { label: string; onClick: () => void; busy?: boolean; icon?: React.ReactNode }) {
  return <button onClick={onClick} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}{label}</button>;
}

function StatusBadge({ status }: { status: CommissionStatus }) {
  const cls: Record<CommissionStatus, string> = {
    Earned: 'bg-blue-100 text-blue-700',
    'Under Review': 'bg-amber-100 text-amber-700',
    Approved: 'bg-indigo-100 text-indigo-700',
    Paid: 'bg-emerald-100 text-emerald-700',
    Reversed: 'bg-slate-200 text-slate-600',
    Disputed: 'bg-rose-100 text-rose-700',
  };
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${cls[status]}`}>{status}</span>;
}

function PayoutStatusBadge({ status }: { status: CommissionPartnerPayout['status'] }) {
  const cls: Record<CommissionPartnerPayout['status'], string> = {
    Ready: 'bg-blue-100 text-blue-700',
    'On Hold': 'bg-amber-100 text-amber-700',
    Paid: 'bg-emerald-100 text-emerald-700',
    Cancelled: 'bg-slate-200 text-slate-600',
  };
  return <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${cls[status]}`}>{status}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex min-h-36 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-500"><UserRoundCheck className="h-6 w-6 text-slate-300" />{text}</div>;
}

function formatDate(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function money(value: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(Number(value || 0));
  } catch {
    return `${currency || 'USD'} ${Number(value || 0).toFixed(2)}`;
  }
}
