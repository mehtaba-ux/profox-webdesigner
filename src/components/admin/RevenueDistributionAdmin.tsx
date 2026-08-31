import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calculator, CheckCircle2, RefreshCw, Save, ShieldCheck, TrendingUp } from 'lucide-react';
import { revenueDistributionService, RevenueDistributionConfig } from '../../lib/revenueDistributionService';

function money(value: unknown, currency = 'USD') {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function marginClass(value: number, target: number, minimum: number) {
  if (value + 0.001 >= target) return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (value + 0.001 >= minimum) return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-red-200 bg-red-50 text-red-800';
}

function scenarioDistribution(row: any, scenario: 'companyLead' | 'selfGeneratedLead') {
  return row?.[scenario] || null;
}

function PolicyToggle({ checked, onChange, title, help }: { checked: boolean; onChange: (checked: boolean) => void; title: string; help: string }) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-2xl border border-slate-200 p-4">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#000080]" />
      <span>
        <span className="block text-xs font-black text-slate-800">{title}</span>
        <span className="mt-1 block text-[11px] leading-5 text-slate-500">{help}</span>
      </span>
    </label>
  );
}

export default function RevenueDistributionAdmin() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dashboard, setDashboard] = useState<any>(null);
  const [config, setConfig] = useState<RevenueDistributionConfig | null>(null);
  const [selectedCode, setSelectedCode] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const { data, error: loadError } = await revenueDistributionService.getDashboard();
    if (loadError) {
      setError(loadError.message || 'Revenue distribution could not be loaded.');
    } else {
      setDashboard(data || null);
      setConfig((data?.config || null) as RevenueDistributionConfig | null);
      const firstPriced = (data?.products || []).find((item: any) => Number(item.price || 0) > 0);
      setSelectedCode(current => current || firstPriced?.code || '');
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const products = Array.isArray(dashboard?.products) ? dashboard.products : [];
  const snapshots = Array.isArray(dashboard?.recentSnapshots) ? dashboard.recentSnapshots : [];
  const selected = useMemo(
    () => products.find((item: any) => item.code === selectedCode) || products.find((item: any) => Number(item.price || 0) > 0),
    [products, selectedCode]
  );
  const company = scenarioDistribution(selected, 'companyLead');
  const selfGenerated = scenarioDistribution(selected, 'selfGeneratedLead');

  const patchRole = (index: number, weightPercent: number) => {
    setConfig(current => current ? {
      ...current,
      deliveryRoles: current.deliveryRoles.map((role, roleIndex) => roleIndex === index ? { ...role, weightPercent } : role),
    } : current);
  };

  const weightTotal = config?.deliveryRoles.reduce((sum, role) => sum + Number(role.weightPercent || 0), 0) || 0;

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setError('');
    setMessage('');
    const { error: saveError } = await revenueDistributionService.saveConfig(config);
    if (saveError) {
      setError(saveError.message || 'Revenue distribution settings could not be saved.');
    } else {
      setMessage('Revenue distribution policy saved. New package and quotation economics now use this version; historical project snapshots remain unchanged.');
      await load();
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">Loading revenue distribution…</div>;
  }
  if (!config) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">{error || 'Revenue distribution configuration is unavailable.'}</div>;
  }

  return (
    <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-[#000080]" />
            <h2 className="text-lg font-black text-slate-950">Revenue Distribution & Margin</h2>
          </div>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
            One central engine protects ProFox contribution margin and scales project role budgets automatically from the current Sales Catalog price. Seller commissions, Talent Partner qualification and worker payouts continue through their existing canonical systems.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => window.location.assign('/admin/app/sales?tab=sales_catalog')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Open Sales Catalog</button>
          <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-200 p-2.5 text-slate-600" title="Refresh"><RefreshCw className="h-4 w-4" /></button>
          <button type="button" disabled={saving || Math.abs(weightTotal - 100) > 0.0001} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save Policy'}</button>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">{message}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="rounded-2xl border border-slate-200 p-4">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Target contribution margin</span>
          <div className="mt-2 flex items-center gap-2"><input type="number" min={1} max={94} step="0.1" value={config.targetMarginPercent} onChange={event => setConfig({ ...config, targetMarginPercent: Number(event.target.value || 0) })} className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-lg font-black" /><span className="font-black">%</span></div>
          <p className="mt-2 text-[11px] leading-4 text-slate-500">Normal company-generated sales are budgeted to preserve this project-level contribution.</p>
        </label>
        <label className="rounded-2xl border border-slate-200 p-4">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Absolute minimum margin</span>
          <div className="mt-2 flex items-center gap-2"><input type="number" min={1} max={94} step="0.1" value={config.minimumMarginPercent} onChange={event => setConfig({ ...config, minimumMarginPercent: Number(event.target.value || 0) })} className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-lg font-black" /><span className="font-black">%</span></div>
          <p className="mt-2 text-[11px] leading-4 text-slate-500">A quotation below this protected floor becomes a review condition in the existing approval workflow.</p>
        </label>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-2 text-[#000080]"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-black">Policy version {config.version}</span></div>
          <p className="mt-2 text-[11px] leading-5 text-slate-600">New sales use the latest policy. When a paid quotation becomes a project, the economics are snapshotted so later price or rate changes never rewrite that project's financial plan.</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <PolicyToggle
          checked={config.reservePerformanceBonus}
          onChange={checked => setConfig({ ...config, reservePerformanceBonus: checked })}
          title="Reserve possible seller performance bonus"
          help="When enabled, package economics conservatively reserve the existing Sales performance-bonus percentage before calculating the delivery pool."
        />
        <PolicyToggle
          checked={config.selfGeneratedBonusUsesMarginBuffer}
          onChange={checked => setConfig({ ...config, selfGeneratedBonusUsesMarginBuffer: checked })}
          title="Use margin buffer for self-generated seller bonus"
          help={config.selfGeneratedBonusUsesMarginBuffer
            ? `Enabled: the seller's existing self-generated bonus can use the ${config.targetMarginPercent}% → ${config.minimumMarginPercent}% company margin buffer without shrinking worker budgets.`
            : `Disabled: the self-generated seller bonus is funded before the delivery pool so the ${config.targetMarginPercent}% target margin remains protected.`}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h3 className="text-sm font-black text-slate-900">Delivery effort allocation</h3><p className="mt-1 text-[11px] text-slate-500">These weights divide the snapshotted delivery pool. Talent Partner project rewards are reserved on top and never deducted from a worker's protected role budget.</p></div>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${Math.abs(weightTotal - 100) < 0.0001 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{weightTotal.toFixed(2)}% / 100%</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {config.deliveryRoles.map((role, index) => (
            <label key={role.key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <span className="block min-h-8 text-[11px] font-black leading-4 text-slate-700">{role.label}</span>
              <div className="mt-2 flex items-center gap-2"><input type="number" min={0.01} max={100} step="0.25" value={role.weightPercent} onChange={event => patchRole(index, Number(event.target.value || 0))} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-black" /><span className="text-xs font-black">%</span></div>
              {role.talentPartnerJobSlug && <p className="mt-2 text-[9px] leading-3 text-slate-400">Talent Partner plan: {role.talentPartnerJobSlug}</p>}
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div><h3 className="text-sm font-black text-slate-900">Automatic package distribution preview</h3><p className="mt-1 text-[11px] text-slate-500">Change a package price in Sales Catalog and this preview recalculates automatically. No person-level payout amount is stored here.</p></div>
          <select value={selected?.code || ''} onChange={event => setSelectedCode(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">
            {products.map((product: any) => <option key={product.code} value={product.code}>{product.name} · {Number(product.price || 0) > 0 ? money(product.price, product.currency) : 'Custom price'}</option>)}
          </select>
        </div>

        {selected && Number(selected.price || 0) > 0 && company?.success && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-black uppercase text-slate-400">Net service revenue</p><p className="mt-1 text-lg font-black">{money(company.commissionableRevenue, company.currency)}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-black uppercase text-slate-400">Seller reserve</p><p className="mt-1 text-lg font-black">{money(company.seller?.totalReservedAmount, company.currency)}</p><p className="text-[9px] text-slate-400">Base{config.reservePerformanceBonus ? ' + possible performance' : ''}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-black uppercase text-slate-400">Sales TP reserve</p><p className="mt-1 text-lg font-black">{money(company.salesTalentPartner?.reserveAmount, company.currency)}</p><p className="text-[9px] leading-4 text-slate-400">Sale event {money(company.salesTalentPartner?.eventReserveAmount, company.currency)}{Number(company.salesTalentPartner?.retentionReservePerQualifyingSale || 0) > 0 ? ` + ${money(company.salesTalentPartner?.retentionReservePerQualifyingSale, company.currency)} retention provision` : ''}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-black uppercase text-slate-400">Delivery pool</p><p className="mt-1 text-lg font-black">{money(company.delivery?.poolAmount, company.currency)}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-black uppercase text-slate-400">Delivery TP reserve</p><p className="mt-1 text-lg font-black">{money(company.delivery?.talentPartnerReserveAmount, company.currency)}</p></div>
              <div className={`rounded-xl border p-3 ${marginClass(Number(company.company?.marginPercent || 0), config.targetMarginPercent, config.minimumMarginPercent)}`}><p className="text-[9px] font-black uppercase">ProFox contribution</p><p className="mt-1 text-lg font-black">{money(company.company?.contributionAmount, company.currency)}</p><p className="text-[10px] font-black">{Number(company.company?.marginPercent || 0).toFixed(2)}%</p></div>
            </div>

            {company.salesTalentPartner?.retentionEnabled && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[10px] leading-5 text-slate-600">
                The current Sales Talent Partner plan includes a one-time {money(company.salesTalentPartner?.retentionTotalReserve, company.currency)} retention reward after {company.salesTalentPartner?.retentionMonths || 'the configured'} months. The planner funds that liability progressively across the configured qualifying sales instead of charging the full retention reward to every sale.
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase text-slate-400"><tr><th className="p-3">Delivery role</th><th className="p-3 text-right">Weight</th><th className="p-3 text-right">Protected role budget</th><th className="p-3 text-right">TP reserve on top</th></tr></thead>
                <tbody>{(company.delivery?.roles || []).map((role: any) => <tr key={role.key} className="border-t border-slate-100"><td className="p-3 font-bold">{role.label}</td><td className="p-3 text-right">{Number(role.weightPercent).toFixed(2)}%</td><td className="p-3 text-right font-black">{money(role.budgetAmount, company.currency)}</td><td className="p-3 text-right text-slate-500">{money(role.talentPartnerReserveAmount, company.currency)}</td></tr>)}</tbody>
              </table>
            </div>

            {selfGenerated?.success && (
              <div className={`flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${marginClass(Number(selfGenerated.company?.marginPercent || 0), config.targetMarginPercent, config.minimumMarginPercent)}`}>
                <div><p className="text-xs font-black">Self-generated seller scenario</p><p className="mt-1 text-[10px] leading-4">{config.selfGeneratedBonusUsesMarginBuffer ? `The existing seller self-generated bonus is added without shrinking delivery budgets and uses the ${config.targetMarginPercent}% → ${config.minimumMarginPercent}% company margin buffer.` : `The existing seller self-generated bonus is reserved before the delivery pool, so the ${config.targetMarginPercent}% company target remains protected.`}</p></div>
                <div className="text-right"><p className="text-xl font-black">{Number(selfGenerated.company?.marginPercent || 0).toFixed(2)}%</p><p className="text-[10px]">Projected contribution margin</p></div>
              </div>
            )}
          </div>
        )}

        {selected && Number(selected.price || 0) <= 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800">This is a custom-price catalog product. Its distribution is calculated from the actual quotation price when Sales builds the quotation.</div>}
      </div>

      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between"><div><h3 className="text-sm font-black">Immutable project economics</h3><p className="mt-1 text-[11px] text-slate-500">Recent paid-sale project snapshots. Package-price changes never rewrite these historical allocations.</p></div><TrendingUp className="h-5 w-5 text-slate-400" /></div>
        {snapshots.length ? (
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-400"><tr><th className="p-3">Project</th><th className="p-3">Quotation</th><th className="p-3 text-right">Revenue</th><th className="p-3 text-right">Delivery pool</th><th className="p-3 text-right">ProFox contribution</th><th className="p-3 text-right">Margin</th><th className="p-3">Policy</th></tr></thead><tbody>{snapshots.map((row: any) => <tr key={row.id} className="border-t border-slate-100"><td className="p-3 font-bold">{row.project_name || row.project_id}</td><td className="p-3 text-slate-500">{row.quotation_number || '—'}</td><td className="p-3 text-right">{money(row.commissionable_revenue, row.currency)}</td><td className="p-3 text-right">{money(row.delivery_pool_amount, row.currency)}</td><td className="p-3 text-right font-bold">{money(row.company_contribution_amount, row.currency)}</td><td className="p-3 text-right font-black">{Number(row.projected_margin_percent || 0).toFixed(2)}%</td><td className="p-3 text-slate-500">v{row.config_version}</td></tr>)}</tbody></table></div>
        ) : <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">No qualifying project snapshots yet. New paid sales will be snapshotted automatically.</div>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><p className="text-[11px] leading-5 text-emerald-900"><b>No duplicate commission engines.</b> Seller commissions and Talent Partner rewards still qualify through their existing payment, project and retention workflows. This engine reserves their cost and protects margin around those canonical results.</p></div></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p className="text-[11px] leading-5 text-amber-900"><b>Worker budgets are enforced, not just displayed.</b> Content, UI/UX and Development compensation reuse the existing worker assignment and payout ledger. A role cannot be committed beyond its snapshotted budget; QA and Project Management remain protected project cost pools until those roles use the worker-pay ledger.</p></div></div>
      </div>
    </section>
  );
}
