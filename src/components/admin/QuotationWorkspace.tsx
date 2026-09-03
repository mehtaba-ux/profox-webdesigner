import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { quotationCpqService } from '../../lib/quotationCpqService';
import QuotationWorkspaceBase from './QuotationWorkspaceBase';

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
 * established quotation, timeline and margin calculation flows are not
 * duplicated. Full profitability is rendered only for Admin. Non-admin users
 * receive a server-redacted summary and, when they are the quotation seller,
 * a compact self-only margin badge.
 */
export default function QuotationWorkspace() {
  const { quotationId } = useParams<{ quotationId: string }>();
  const { isAdmin } = useAuth();
  const [myAllocation, setMyAllocation] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    if (isAdmin || !quotationId || quotationId === 'new') {
      setMyAllocation(null);
      return () => { cancelled = true; };
    }

    void quotationCpqService.getSummary(quotationId).then(({ data, error }) => {
      if (!cancelled && !error) setMyAllocation(data?.myRevenueAllocation || null);
    });

    return () => { cancelled = true; };
  }, [isAdmin, quotationId]);

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
    </div>
  );
}
