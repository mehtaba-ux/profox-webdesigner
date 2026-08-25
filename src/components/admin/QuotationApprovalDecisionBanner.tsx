import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { quotationCpqService } from '../../lib/quotationCpqService';

function quotationId(pathname: string) {
  const match = pathname.match(/^\/admin\/quotations\/([^/]+)$/);
  return match && match[1] !== 'new' ? match[1] : null;
}

export default function QuotationApprovalDecisionBanner() {
  const location = useLocation();
  const id = quotationId(location.pathname);
  const [approval, setApproval] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    if (!id) { setApproval(null); return; }
    quotationCpqService.getSummary(id).then(result => {
      if (!cancelled && !result.error) setApproval(result.data?.approval || null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  if (!id || !approval?.decision || approval.decision === 'pending') return null;
  if (approval.decision === 'approved') return <div className="fixed bottom-6 left-1/2 z-30 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-xl lg:left-[calc(50%+109px)]"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><div><div className="text-xs font-black text-emerald-900">Quotation approved{approval.reviewerName ? ` by ${approval.reviewerName}` : ''}</div><p className="mt-1 text-[11px] leading-5 text-emerald-800">You can continue with the existing Send Quotation workflow.{approval.decisionNote ? ` Note: ${approval.decisionNote}` : ''}</p></div></div></div>;

  const changes = approval.decision === 'changes_requested';
  return <div className={`fixed bottom-6 left-1/2 z-30 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-2xl border p-4 shadow-xl lg:left-[calc(50%+109px)] ${changes ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}><div className="flex gap-3">{changes ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}<div><div className={`text-xs font-black ${changes ? 'text-amber-900' : 'text-red-900'}`}>{changes ? 'Management requested quotation changes' : 'Quotation was not approved'}{approval.reviewerName ? ` · ${approval.reviewerName}` : ''}</div><p className={`mt-1 text-[11px] leading-5 ${changes ? 'text-amber-800' : 'text-red-800'}`}>{approval.decisionNote || 'Review the quotation and approval rules before submitting it again.'}</p></div></div></div>;
}
