import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calculator, CheckCircle2, Loader2, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { revenueDistributionService } from '../../lib/revenueDistributionService';

function money(value: unknown, currency = 'USD') {
  const amount = Number(value || 0);
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

function sourceLabel(source: string) {
  if (source === 'quotation_override') return 'Quotation-specific override';
  if (source === 'package_profile') return 'Package profile';
  return 'Global default profile';
}

export default function QuotationProfitabilityPanel({ quotationId, distribution, locked, onRefresh }: { quotationId?: string; distribution: any; locked: boolean; onRefresh: () => Promise<void> | void }) {
  const roles = useMemo(() => Array.isArray(distribution?.delivery?.roles) ? distribution.delivery.roles : [], [distribution]);
  const [draftRoles, setDraftRoles] = useState<any[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setDraftRoles(roles.map((role: any) => ({ key: role.key, label: role.label, weightPercent: Number(role.weightPercent || 0), talentPartnerJobSlug: role.talentPartnerJobSlug || null })));
    setReason(distribution?.overrideReason || '');
  }, [distribution?.quotationId, distribution?.distributionProfileSource, distribution?.overrideReason, JSON.stringify(roles.map((role: any) => [role.key, role.weightPercent]))]);

  if (!distribution?.success) return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-800">Save a positive one-time quotation price to calculate protected project economics.</section>;

  const currency = distribution.currency || 'USD';
  const margin = Number(distribution.company?.marginPercent || 0);
  const minimum = Number(distribution.minimumMarginPercent || 0);
  const target = Number(distribution.targetMarginPercent || 0);
  const totalWeight = draftRoles.reduce((sum, role) => sum + Number(role.weightPercent || 0), 0);
  const recommendation = distribution.minimumPriceRecommendation || {};
  const healthy = !distribution.requiresApproval && margin + 0.001 >= target;
  const acceptable = !distribution.requiresApproval && margin + 0.001 >= minimum;

  const saveOverride = async () => {
    if (!quotationId) { setError('Save the quotation before setting project-specific delivery weights.'); return; }
    setBusy('save'); setError(''); setMessage('');
    const { error: saveError } = await revenueDistributionService.setQuotationOverride(quotationId, draftRoles, reason);
    if (saveError) setError(saveError.message || 'Quotation delivery weights could not be saved.');
    else { setMessage('Project-specific weights saved. Management approval is now mandatory before sending.'); await onRefresh(); }
    setBusy('');
  };
  const clearOverride = async () => {
    if (!quotationId) return;
    setBusy('clear'); setError(''); setMessage('');
    const { error: clearError } = await revenueDistributionService.setQuotationOverride(quotationId, null);
    if (clearError) setError(clearError.message || 'Quotation override could not be cleared.');
    else { setMessage('Quotation now inherits its package or global delivery profile.'); await onRefresh(); }
    setBusy('');
  };

  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><Calculator className="h-5 w-5 text-[#000080]"/><h2 className="font-black">Profitability & Revenue Distribution</h2></div><p className="mt-1 text-xs leading-5 text-slate-500">Internal planning only. All figures come from the central server engine and never appear in the customer proposal.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black text-[#000080]">{sourceLabel(distribution.distributionProfileSource)}</span></div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
    {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{message}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Commissionable net revenue" value={money(distribution.commissionableRevenue,currency)}/>
      <Metric label="Seller reserve" value={money(distribution.seller?.totalReservedAmount,currency)}/>
      <Metric label="Talent Partner reserve" value={money(Number(distribution.salesTalentPartner?.reserveAmount||0)+Number(distribution.delivery?.talentPartnerReserveAmount||0),currency)}/>
      <Metric label="Delivery pool" value={money(distribution.delivery?.poolAmount,currency)}/>
      <Metric label="ProFox contribution" value={money(distribution.company?.contributionAmount,currency)}/>
      <Metric label="Target margin" value={`${target.toFixed(2)}%`}/>
      <Metric label="Minimum margin" value={`${minimum.toFixed(2)}%`}/>
      <div className={`rounded-xl border p-3 ${healthy?'border-emerald-200 bg-emerald-50 text-emerald-800':acceptable?'border-amber-200 bg-amber-50 text-amber-800':'border-red-200 bg-red-50 text-red-800'}`}><p className="text-[9px] font-black uppercase">Expected ProFox margin</p><p className="mt-1 text-lg font-black">{margin.toFixed(2)}%</p><p className="text-[9px] font-bold">{healthy?'Healthy':acceptable?'Acceptable':'Approval required'}</p></div>
    </div>

    {distribution.requiresApproval && recommendation.available && <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0"/><div><p className="text-xs font-black">Margin below or outside protected policy</p><p className="mt-1 text-xs leading-5">Required minimum one-time selling price: <b>{money(recommendation.minimumSellingPrice,currency)}</b>{Number(recommendation.additionalRevenueRequired||0)>0?` — increase by at least ${money(recommendation.additionalRevenueRequired,currency)}.`:''} The quotation remains in the established Management approval route until corrected or explicitly approved.</p></div></div>}

    <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-400"><tr><th className="p-3">Delivery role</th><th className="p-3 text-right">Weight</th><th className="p-3 text-right">Protected budget</th><th className="p-3 text-right">TP reserve on top</th></tr></thead><tbody>{roles.map((role:any)=><tr key={role.key} className="border-t border-slate-100"><td className="p-3 font-bold">{role.label}</td><td className="p-3 text-right">{Number(role.weightPercent||0).toFixed(2)}%</td><td className="p-3 text-right font-black">{money(role.budgetAmount,currency)}</td><td className="p-3 text-right text-slate-500">{money(role.talentPartnerReserveAmount,currency)}</td></tr>)}</tbody></table></div>

    <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
      <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-[#000080]"/><div><h3 className="text-xs font-black">Custom quotation effort weights</h3><p className="mt-1 text-[10px] leading-4 text-slate-500">Use only when this project genuinely differs from its package profile. Changing weights never changes worker pay already snapshotted for an existing project.</p></div></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">{draftRoles.map((role,index)=><label key={role.key} className="rounded-xl border border-slate-200 bg-white p-3"><span className="block min-h-8 text-[10px] font-black text-slate-700">{role.label}</span><div className="mt-2 flex items-center gap-2"><input disabled={locked} type="number" min={0} max={100} step="0.25" value={role.weightPercent} onChange={event=>setDraftRoles(current=>current.map((item,i)=>i===index?{...item,weightPercent:Number(event.target.value||0)}:item))} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm font-black disabled:bg-slate-100"/><span className="text-xs font-black">%</span></div></label>)}</div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex-1"><span className="mb-1 block text-[10px] font-black uppercase text-slate-500">Business reason</span><textarea disabled={locked} rows={2} value={reason} onChange={event=>setReason(event.target.value)} placeholder="Explain why this project's effort differs from the package profile…" className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs disabled:bg-slate-100"/></label><div className="flex flex-wrap gap-2 sm:pb-0.5">{distribution.distributionProfileSource==='quotation_override'&&<button disabled={locked||busy!==''} onClick={()=>void clearOverride()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black disabled:opacity-50">{busy==='clear'?<Loader2 className="h-4 w-4 animate-spin"/>:<RotateCcw className="h-4 w-4"/>}Use inherited profile</button>}<button disabled={locked||busy!==''||!quotationId||reason.trim().length<10||Math.abs(totalWeight-100)>0.0001} onClick={()=>void saveOverride()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{busy==='save'?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}Save override</button></div></div>
      <div className={`mt-3 flex items-center gap-2 text-[10px] font-black ${Math.abs(totalWeight-100)<0.0001?'text-emerald-700':'text-red-700'}`}>{Math.abs(totalWeight-100)<0.0001?<CheckCircle2 className="h-4 w-4"/>:<AlertTriangle className="h-4 w-4"/>}Weight total: {totalWeight.toFixed(2)}% / 100%</div>
    </div>
  </section>;
}

function Metric({label,value}:{label:string;value:string}) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-black uppercase text-slate-400">{label}</p><p className="mt-1 text-lg font-black text-slate-900">{value}</p></div>; }
