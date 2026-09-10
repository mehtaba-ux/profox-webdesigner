import React, { useEffect, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { quotationCpqService } from '../../lib/quotationCpqService';
import QuotationWorkspaceBase from './QuotationWorkspaceBase';
import QuotationSalesReconciliationPanel from './QuotationSalesReconciliationPanel';

function money(value: unknown, currency = 'USD') {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Access-scope wrapper for the quotation workspace.
 *
 * The original workspace remains unchanged in QuotationWorkspaceBase so the
 * established quotation, timeline, approval, send and margin calculation flows
 * are not duplicated. Part 10A Sales Reconciliation is mounted additively on
 * this same quotation route and does not alter the existing final send gate.
 */
export default function QuotationWorkspace() {
  const { quotationId } = useParams<{ quotationId: string }>();
  const { isAdmin } = useAuth();
  const [myAllocation, setMyAllocation] = useState<any>(null);
  const [reconciliationOpen, setReconciliationOpen] = useState(false);
  const savedQuotationId = quotationId && quotationId !== 'new' ? quotationId : null;

  useEffect(() => {
    setReconciliationOpen(false);
  }, [quotationId]);

  useEffect(() => {
    let cancelled = false;
    if (isAdmin || !savedQuotationId) {
      setMyAllocation(null);
      return () => { cancelled = true; };
    }

    void quotationCpqService.getSummary(savedQuotationId).then(({ data, error }) => {
      if (!cancelled && !error) setMyAllocation(data?.myRevenueAllocation || null);
    });

    return () => { cancelled = true; };
  }, [isAdmin, savedQuotationId]);

  return (
    <div data-profitability-scope={isAdmin ? 'admin' : 'restricted'}>
      {!isAdmin && (
        <style>{`
          [data-profitability-scope="restricted"] main > .flex.gap-2.overflow-x-auto > button:nth-child(4) {
            display: none !important;
          }
        `}</style>
      )}

      {!isAdmin && myAllocation?.available && (
        <aside
          aria-label="Your margin"
          className="fixed bottom-5 right-5 z-[70] w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-emerald-200 bg-white p-4 shadow-xl"
        >
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Your Margin</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <p className="text-xl font-black text-emerald-700">{money(myAllocation.amount, myAllocation.currency || 'USD')}</p>
            <p className="text-sm font-black text-slate-700">{Number(myAllocation.ratePercent || 0).toFixed(2)}%</p>
          </div>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">Only your own seller allocation is visible to you.</p>
        </aside>
      )}

      <QuotationWorkspaceBase />

      {savedQuotationId && !reconciliationOpen && (
        <button
          type="button"
          onClick={() => setReconciliationOpen(true)}
          className="fixed bottom-6 left-6 z-[72] inline-flex min-h-11 items-center gap-2 rounded-2xl border border-[#000080]/20 bg-white px-4 py-3 text-xs font-black text-[#000080] shadow-xl shadow-slate-900/15 hover:bg-slate-50 max-sm:left-4"
          title="Review Scope Conditions and client Promises against this quotation"
        >
          <ShieldCheck className="h-4 w-4" />Sales Reconciliation
        </button>
      )}

      {savedQuotationId && reconciliationOpen && (
        <div
          className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-[1px] sm:p-6"
          onMouseDown={event => { if (event.target === event.currentTarget) setReconciliationOpen(false); }}
        >
          <div className="mx-auto w-full max-w-6xl rounded-[1.75rem] bg-slate-50 p-4 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#000080]">Quotation workspace</p>
                <p className="mt-1 text-xs text-slate-500">Part 10A reconciliation stays on this exact quotation revision.</p>
              </div>
              <button type="button" onClick={() => setReconciliationOpen(false)} aria-label="Close Sales reconciliation" className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">
                <X className="h-4 w-4" />
              </button>
            </div>
            <QuotationSalesReconciliationPanel quotationId={savedQuotationId} onClose={() => setReconciliationOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
