import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { CRMScopeCommitmentWorkspace, crmSalesScopeCommitmentService } from '../../../lib/crmSalesScopeCommitmentService';
import { getScopeCommitmentGuidance } from '../../../lib/crmSalesScopeCommitmentGuidance';
import SellerGuidanceHelp from './SellerGuidanceHelp';
import CRMScopeConditionsPanel from './CRMScopeConditionsPanel';
import CRMPromiseRegisterPanel from './CRMPromiseRegisterPanel';

type Props = {
  leadId: string;
  opportunityId?: string | null;
  refreshKey?: string;
  onChanged?: (message: string) => Promise<void> | void;
};

export default function CRMScopeCommitmentsWorkspace({ leadId, opportunityId, refreshKey, onChanged }: Props) {
  const [workspace, setWorkspace] = useState<CRMScopeCommitmentWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try { setWorkspace(await crmSalesScopeCommitmentService.getWorkspace({ leadId, opportunityId })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Scope & Commitments could not be loaded.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [leadId, opportunityId]);

  useEffect(() => { setWorkspace(null); void load(false); }, [load, refreshKey]);

  const changed = async (message: string) => {
    await load(true);
    await onChanged?.(message);
  };

  if (loading && !workspace) return <div className="flex min-h-40 items-center justify-center rounded-2xl border border-slate-200 bg-white" aria-live="polite"><Loader2 className="h-5 w-5 animate-spin text-[#000080]" /><span className="sr-only">Loading Scope and Commitments</span></div>;
  if (error && !workspace) return <section className="rounded-2xl border border-rose-200 bg-white p-5" role="alert"><div className="flex items-center gap-2 text-xs font-black text-rose-700"><AlertTriangle className="h-4 w-4" />Scope & Commitments unavailable</div><p className="mt-2 text-xs leading-5 text-slate-600">{error}</p><button type="button" onClick={() => void load(true)} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#000080] px-3 text-xs font-black text-white"><RefreshCw className="h-4 w-4" />Retry</button></section>;
  if (!workspace) return null;

  return <section className="space-y-3" data-crm-scope-commitments>
    <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-[#000080]"><ShieldCheck className="h-4 w-4" />Scope & Commitments<SellerGuidanceHelp guidance={getScopeCommitmentGuidance('future_quote')} /></div><p className="mt-1.5 max-w-3xl text-xs leading-5 text-slate-600">Part 9 pre-quotation integrity. Reconcile material scope boundaries and preserve what ProFox actually promised before proposal preparation. This does not write quotations or activate the final quotation-send gate.</p></div><button type="button" disabled={refreshing} onClick={() => void load(true)} className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-[11px] font-black text-[#000080] disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button></div>
      {error && <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs font-bold text-rose-700">{error}</div>}
    </div>
    <CRMScopeConditionsPanel leadId={workspace.leadId} opportunityId={workspace.opportunityId || opportunityId} conditions={workspace.conditions || []} sourceRequirements={workspace.sourceRequirements || []} validations={workspace.validations || []} meetings={workspace.meetings || []} assessment={workspace.assessment} onChanged={changed} />
    <CRMPromiseRegisterPanel leadId={workspace.leadId} opportunityId={workspace.opportunityId || opportunityId} promises={workspace.promises || []} requirements={workspace.sourceRequirements || []} validations={workspace.validations || []} meetings={workspace.meetings || []} assessment={workspace.assessment} onChanged={changed} />
  </section>;
}
