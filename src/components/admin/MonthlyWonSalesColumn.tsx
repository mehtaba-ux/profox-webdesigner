import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Receipt,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PipelineStageConfig } from '../../lib/crmService';
import {
  SellerMonthlyWonSales,
  SellerWonSale,
  sellerWonSalesService,
} from '../../lib/sellerWonSalesService';

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function shiftMonth(monthKey: string, amount: number) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + amount, 1, 12, 0, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1, 12, 0, 0, 0).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: Number(value || 0) % 1 === 0 ? 0 : 2,
    }).format(Number(value || 0));
  } catch {
    return `${currency || 'USD'} ${Number(value || 0).toLocaleString()}`;
  }
}

function wonDate(value: string) {
  if (!value) return 'Verification date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MonthlyWonSalesColumn({ stage, ownerFilter }: { stage: PipelineStageConfig; ownerFilter: string }) {
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonthKey());
  const [data, setData] = useState<SellerMonthlyWonSales | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      setData(await sellerWonSalesService.get(month));
    } catch (err: any) {
      setError(err?.message || 'Won sales could not be loaded.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [month]);

  const sales = useMemo(
    () => (data?.sales || []).filter(sale => ownerFilter === 'All' || sale.salespersonId === ownerFilter),
    [data?.sales, ownerFilter],
  );

  const totals = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const sale of sales) grouped.set(sale.currency || 'USD', (grouped.get(sale.currency || 'USD') || 0) + Number(sale.saleValue || 0));
    return Array.from(grouped.entries());
  }, [sales]);

  const isCurrentMonth = month >= currentMonthKey();

  return (
    <div className="w-[330px] min-w-[330px]">
      <div className="mb-2 px-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} /><h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-700">{stage.name}</h3></div>
            <div className="mt-1 flex items-center gap-1 text-[9px] font-black text-emerald-600"><ShieldCheck className="h-3 w-3" />Payment verified only</div>
          </div>
          <div className="text-right"><div className="text-xs font-black text-slate-900">{sales.length} won</div><div className="text-[9px] font-semibold text-slate-400">{monthLabel(month)}</div></div>
        </div>

        <div className="mt-2 flex items-center gap-1">
          <button type="button" onClick={() => setMonth(value => shiftMonth(value, -1))} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-emerald-300" aria-label="Previous month"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <div className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[9px] font-black text-slate-600"><CalendarDays className="h-3 w-3 text-emerald-600" />{monthLabel(month)}</div>
          <button type="button" disabled={isCurrentMonth} onClick={() => setMonth(value => shiftMonth(value, 1))} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-35" aria-label="Next month"><ChevronRight className="h-3.5 w-3.5" /></button>
          <button type="button" disabled={loading} onClick={() => void load()} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-emerald-300 disabled:opacity-35" aria-label="Refresh won sales"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>

        {totals.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{totals.map(([currency, value]) => <span key={currency} className="rounded-lg bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700">{money(value, currency)}</span>)}</div>}
      </div>

      <div className="flex min-h-[560px] flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/30 p-2">
        {loading && <div className="flex min-h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[10px] font-bold text-red-700">{error}</div>}
        {!loading && !error && sales.map(sale => <WonSaleCard key={sale.opportunityId} sale={sale} onOpen={() => navigate(sale.actionUrl)} />)}
        {!loading && !error && sales.length === 0 && <div className="flex min-h-32 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-emerald-200 bg-white/60 px-4 text-center"><CheckCircle2 className="h-6 w-6 text-emerald-300" /><div className="mt-2 text-[10px] font-black text-slate-500">No payment-verified wins in {monthLabel(month)}</div><div className="mt-1 text-[9px] font-semibold leading-4 text-slate-400">Wins appear automatically after the first verified Advance or Full Payment.</div></div>}
        {data?.timezone && <div className="mt-auto px-1 pb-1 text-center text-[8px] font-semibold text-slate-400">Monthly boundary: {data.timezone}</div>}
      </div>
    </div>
  );
}

function WonSaleCard({ sale, onOpen }: { sale: SellerWonSale; onOpen: () => void }) {
  return (
    <article className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate text-sm font-black text-slate-900">{sale.companyName}</h4><p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">{sale.opportunityName}</p></div><span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-white"><CheckCircle2 className="h-3 w-3" />Won</span></div>
      <div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs font-black text-emerald-700">{money(sale.saleValue, sale.currency)}</span><span className="text-[9px] font-black text-slate-400">{wonDate(sale.wonAt)}</span></div>
      <div className="mt-3 space-y-1.5 text-[9px] font-semibold text-slate-500">
        <div className="flex items-center gap-1.5"><UserRound className="h-3 w-3 shrink-0" /><span className="truncate">{sale.ownerName}</span></div>
        <div className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 shrink-0 text-emerald-600" /><span className="truncate">{sale.paymentType} verified · {money(sale.paymentAmount, sale.paymentCurrency)}</span></div>
        <div className="flex items-center gap-1.5"><Receipt className="h-3 w-3 shrink-0" /><span className="truncate">{sale.quotationNumber || sale.paymentReference || 'Payment-backed sale'}</span></div>
      </div>
      <button type="button" onClick={onOpen} className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[9px] font-black text-emerald-800 hover:bg-emerald-100">Open customer history<ExternalLink className="h-3 w-3" /></button>
    </article>
  );
}
