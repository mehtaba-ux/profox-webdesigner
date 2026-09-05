import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Receipt,
  ShieldCheck,
  Trophy,
  UserRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
    month: 'long',
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
  if (!value) return 'Payment verification date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function MonthlyWonSalesPanel() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonthKey());
  const [data, setData] = useState<SellerMonthlyWonSales | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('All');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await sellerWonSalesService.get(month);
      setData(result);
      setOwnerFilter(current => current === 'All' || result.sales.some(sale => sale.salespersonId === current) ? current : 'All');
    } catch (err: any) {
      setError(err?.message || 'Won sales could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [month]);

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    for (const sale of data?.sales || []) if (sale.salespersonId) map.set(sale.salespersonId, sale.ownerName || 'Seller');
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [data?.sales]);

  const visibleSales = useMemo(
    () => (data?.sales || []).filter(sale => ownerFilter === 'All' || sale.salespersonId === ownerFilter),
    [data?.sales, ownerFilter],
  );

  const totals = useMemo(() => {
    const grouped = new Map<string, { salesCount: number; salesValue: number }>();
    for (const sale of visibleSales) {
      const currency = sale.currency || 'USD';
      const current = grouped.get(currency) || { salesCount: 0, salesValue: 0 };
      current.salesCount += 1;
      current.salesValue += Number(sale.saleValue || 0);
      grouped.set(currency, current);
    }
    return Array.from(grouped.entries()).map(([currency, total]) => ({ currency, ...total }));
  }, [visibleSales]);

  const isCurrentMonth = month >= currentMonthKey();

  return (
    <section id="monthly-won-sales" className="rounded-3xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm"><Trophy className="h-5 w-5" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-black text-slate-900">Won Sales — {monthLabel(month)}</h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-700"><ShieldCheck className="h-3 w-3" />Payment verified only</span>
            </div>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">A sale appears here automatically when its first qualifying Advance or Full Payment is verified. Sellers cannot drag or manually mark a deal into this area.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data?.scope === 'team' && owners.length > 0 && (
            <select value={ownerFilter} onChange={event => setOwnerFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 outline-none focus:border-emerald-500">
              <option value="All">All sellers</option>
              {owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}
          <button type="button" onClick={() => setMonth(value => shiftMonth(value, -1))} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:border-emerald-300"><ChevronLeft className="h-4 w-4" />Previous</button>
          <div className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-700"><CalendarDays className="h-4 w-4 text-emerald-600" />{monthLabel(month)}</div>
          <button type="button" disabled={isCurrentMonth} onClick={() => setMonth(value => shiftMonth(value, 1))} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2"><div className="text-[9px] font-black uppercase tracking-widest text-emerald-700/70">Won sales</div><div className="mt-0.5 text-sm font-black text-emerald-800">{visibleSales.length}</div></div>
        {totals.map(total => <div key={total.currency} className="rounded-xl border border-slate-200 bg-white px-3 py-2"><div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Won value · {total.currency}</div><div className="mt-0.5 text-sm font-black text-slate-900">{money(total.salesValue, total.currency)}</div></div>)}
        {data?.timezone && <div className="ml-auto text-[9px] font-bold text-slate-400">Month boundary: {data.timezone}</div>}
      </div>

      {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">{error}</div>}
      {loading && <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>}

      {!loading && !error && visibleSales.length === 0 && (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <CheckCircle2 className="mx-auto h-7 w-7 text-slate-300" />
          <div className="mt-2 text-sm font-black text-slate-600">No payment-verified wins in {monthLabel(month)}</div>
          <p className="mt-1 text-xs font-semibold text-slate-400">The active pipeline remains unchanged until a qualifying payment is verified.</p>
        </div>
      )}

      {!loading && !error && visibleSales.length > 0 && (
        <div className="mt-5 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {visibleSales.map(sale => <WonSaleCard key={sale.opportunityId} sale={sale} onOpen={() => navigate(sale.actionUrl)} />)}
        </div>
      )}
    </section>
  );
}

function WonSaleCard({ sale, onOpen }: { sale: SellerWonSale; onOpen: () => void }) {
  return (
    <article className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{sale.companyName}</div><div className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">{sale.opportunityName}</div></div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white"><CheckCircle2 className="h-3 w-3" />Won</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-xl border border-white bg-white p-2.5"><div className="font-bold text-slate-400">Sale value</div><div className="mt-1 font-black text-slate-900">{money(sale.saleValue, sale.currency)}</div></div>
        <div className="rounded-xl border border-white bg-white p-2.5"><div className="font-bold text-slate-400">Verified payment</div><div className="mt-1 font-black text-emerald-700">{money(sale.paymentAmount, sale.paymentCurrency)}</div></div>
      </div>

      <div className="mt-3 space-y-2 text-[10px] font-semibold text-slate-500">
        <div className="flex items-center gap-2"><UserRound className="h-3.5 w-3.5 text-slate-400" /><span className="truncate">Seller: <strong className="text-slate-700">{sale.ownerName}</strong></span></div>
        <div className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /><span className="truncate">{sale.paymentType} · {sale.paymentReference || 'Verified payment'}</span></div>
        <div className="flex items-center gap-2"><Receipt className="h-3.5 w-3.5 text-slate-400" /><span className="truncate">{sale.quotationNumber || 'Accepted quotation'}</span></div>
        <div className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 text-slate-400" /><span>Won {wonDate(sale.wonAt)}</span></div>
      </div>

      <button type="button" onClick={onOpen} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-[10px] font-black text-white">Open customer history<ExternalLink className="h-3.5 w-3.5" /></button>
    </article>
  );
}
