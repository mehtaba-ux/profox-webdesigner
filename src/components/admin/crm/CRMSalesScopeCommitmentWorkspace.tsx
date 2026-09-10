import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ClipboardList, Loader2, RefreshCw } from 'lucide-react';
import CRMScopeConditionsPanel from './CRMScopeConditionsPanel';
import CRMPromiseRegisterPanel from './CRMPromiseRegisterPanel';
import { crmSalesScopeCommitmentService, CRMSalesScopeCommitmentWorkspace as WorkspaceData } from '../../../lib/crmSalesScopeCommitmentService';
import '../../../lib/crmSalesScopeCommitmentGuidance';

type Props = { leadId: string; opportunityId?: string | null; refreshKey?: string; onChanged?: (message: string) => Promise<void> | void };

export default function CRMSalesScopeCommitmentWorkspace({ leadId, opportunityId, refreshKey, onChanged }: Props) {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true); setError('');
    try { setWorkspace(await crmSalesScopeCommitmentService.getWorkspace(leadId, opportunityId ?? null)); }
    catch { setError('Scope & Commitments could not be loaded. Check CRM access and try again.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [leadId, opportunityId]);

  useEffect(() => { void load(false); }, [load, refreshKey]);
  const changed = async (message: string) => { await load(true); await onChanged?.(message); };

  if (loading && !workspace) return <div className="flex min-h-32 items-center justify-center rounded-2xl border border-slate-200 bg-white" aria-live="polite"><Loader2 className="h-5 w-5 animate-spin text-[#000080]" /><span className="sr-only">Loading Scope and Commitments</span></div>;
  if (error && !workspace) return <section className="rounded-2xl border border-rose-200 bg-white p-4" role="alert"><div className="flex items-center gap-2 text-xs font-black text-rose-700"><AlertTriangle className="h-4 w-4" />Scope & Commitments unavailable</div><p className="mt-1 text-xs text-slate-500">{error}</p><button type="button" onClick={() => void load(true)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#000080] px-3 text-xs font-black text-white"><RefreshCw className="h-4 w-4" />Retry</button></section>;
  if (!workspace) return null;

  return <section className="space-y-3" aria-label="Scope and Commitments workspace">
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-[#000080]"><ClipboardList className="h-4 w-4" />Scope & Commitments</div><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">Pre-quotation proposal boundaries and material client commitments. This workspace never writes quotation snapshots and never activates the final quotation-send gate.</p></div>
      <button type="button" disabled={refreshing} onClick={() => void load(true)} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-[#000080] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button>
    </div>
    {error && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900" role="status">The latest refresh failed; the last loaded data remains visible.</div>}
    <CRMScopeConditionsPanel workspace={workspace} onChanged={changed} />
    <CRMPromiseRegisterPanel workspace={workspace} onChanged={changed} />
  </section>;
}
