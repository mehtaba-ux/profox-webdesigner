import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calculator, CheckCircle2, CircleHelp, RefreshCw, Save, ShieldCheck, TrendingUp } from 'lucide-react';
import { revenueDistributionService, RevenueDistributionConfig } from '../../lib/revenueDistributionService';
import { commissionService } from '../../lib/commissionService';
import { useAuth } from '../../lib/AuthContext';
import { CommissionRule } from '../../types';

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

function HelpTooltip({ text }: { text: string }) {
  const tooltipId = React.useId();
  return (
    <span className="group relative inline-flex cursor-help align-middle" tabIndex={0} aria-describedby={tooltipId} aria-label={text}>
      <CircleHelp className="h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-[#000080] group-focus:text-[#000080]" aria-hidden="true" />
      <span id={tooltipId} role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-64 -translate-x-1/2 rounded-lg bg-slate-950 px-3 py-2 text-left text-[10px] font-medium normal-case leading-4 tracking-normal text-white shadow-xl group-hover:block group-focus:block">
        {text}
      </span>
    </span>
  );
}

function SettingTitle({ children, tooltip }: { children: React.ReactNode; tooltip: string }) {
  return <span className="inline-flex items-center gap-1.5"><span>{children}</span><HelpTooltip text={tooltip} /></span>;
}

function PolicyToggle({ checked, onChange, title, help }: { checked: boolean; onChange: (checked: boolean) => void; title: string; help: string }) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-2xl border border-slate-200 p-4">
      <input type="checkbox" title={help} aria-label={title} checked={checked} onChange={event => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#000080]" />
      <span>
        <span className="flex items-center gap-1.5 text-xs font-black text-slate-800">{title}<HelpTooltip text={help} /></span>
        <span className="mt-1 block text-[11px] leading-5 text-slate-500">{help}</span>
      </span>
    </label>
  );
}

export default function RevenueDistributionAdmin() {
  const { user, profile } = useAuth();
  const adminEmail = profile?.email || user?.email || 'Administrator';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dashboard, setDashboard] = useState<any>(null);
  const [config, setConfig] = useState<RevenueDistributionConfig | null>(null);
  const [selectedCode, setSelectedCode] = useState('');
  const [profileRoles, setProfileRoles] = useState<any[]>([]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [commissionRules, setCommissionRules] = useState<CommissionRule[]>([]);
  const [sellerRate, setSellerRate] = useState('0');
  const [sellerMinRate, setSellerMinRate] = useState('0');
  const [sellerMaxRate, setSellerMaxRate] = useState('0');
  const [sellerSaving, setSellerSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data, error: loadError }, commissionSettings] = await Promise.all([
        revenueDistributionService.getDashboard(),
        commissionService.refreshSettings(),
      ]);
      if (loadError) {
        setError(loadError.message || 'Revenue distribution could not be loaded.');
      } else {
        setDashboard(data || null);
        setConfig((data?.config || null) as RevenueDistributionConfig | null);
        setCommissionRules(commissionSettings.packageRules || []);
        const firstPriced = (data?.products || []).find((item: any) => Number(item.price || 0) > 0);
        setSelectedCode(current => current || firstPriced?.code || '');
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'Revenue distribution and seller commission settings could not be loaded.');
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const products = Array.isArray(dashboard?.products) ? dashboard.products : [];
  const snapshots = Array.isArray(dashboard?.recentSnapshots) ? dashboard.recentSnapshots : [];
  const productProfiles = Array.isArray(dashboard?.productProfiles) ? dashboard.productProfiles : [];
  const projectActuals = Array.isArray(dashboard?.projectActuals) ? dashboard.projectActuals : [];
  const selected = useMemo(
    () => products.find((item: any) => item.code === selectedCode) || products.find((item: any) => Number(item.price || 0) > 0),
    [products, selectedCode]
  );
  const company = scenarioDistribution(selected, 'companyLead');
  const selfGenerated = scenarioDistribution(selected, 'selfGeneratedLead');
  const selectedProfile = productProfiles.find((item: any) => item.productId === selected?.productId);
  const selectedCommissionRule = commissionRules.find(rule => rule.packageCode.toUpperCase() === String(selected?.code || '').toUpperCase());

  useEffect(() => {
    if (!config || !selected) return;
    const roles = Array.isArray(selectedProfile?.roles) && selectedProfile.roles.length
      ? selectedProfile.roles
      : config.deliveryRoles;
    setProfileRoles(roles.map((role: any) => ({ ...role })));
  }, [config, selected?.productId, selectedProfile?.profileId]);

  useEffect(() => {
    const baseRate = Number(selectedCommissionRule?.baseRatePercent ?? company?.seller?.baseRatePercent ?? 0);
    setSellerRate(String(baseRate));
    setSellerMinRate(String(Number(selectedCommissionRule?.minRatePercent ?? baseRate)));
    setSellerMaxRate(String(Number(selectedCommissionRule?.maxRatePercent ?? baseRate)));
  }, [selected?.code, selectedCommissionRule?.updatedAt, selectedCommissionRule?.baseRatePercent, selectedCommissionRule?.minRatePercent, selectedCommissionRule?.maxRatePercent]);

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

  const profileWeightTotal = profileRoles.reduce((sum, role) => sum + Number(role.weightPercent || 0), 0);
  const saveProfile = async () => {
    if (!selected?.productId || Math.abs(profileWeightTotal - 100) > 0.0001) return;
    setProfileSaving(true); setError(''); setMessage('');
    const { error: profileError } = await revenueDistributionService.saveProductProfile(selected.productId, profileRoles);
    if (profileError) setError(profileError.message || 'Package delivery profile could not be saved.');
    else { setMessage(`${selected.name} now uses its own delivery effort profile for future quotations.`); await load(); }
    setProfileSaving(false);
  };
  const clearProfile = async () => {
    if (!selected?.productId) return;
    setProfileSaving(true); setError(''); setMessage('');
    const { error: profileError } = await revenueDistributionService.clearProductProfile(selected.productId);
    if (profileError) setError(profileError.message || 'Package delivery profile could not be cleared.');
    else { setMessage(`${selected.name} now inherits the global delivery effort allocation.`); await load(); }
    setProfileSaving(false);
  };

  const saveSellerContribution = async () => {
    if (!selected) return;
    const baseRate = Number(sellerRate);
    const requiresApproval = selectedCommissionRule?.requiresAdminApproval ?? selected.priceMode === 'custom';
    const minRate = requiresApproval ? Number(sellerMinRate) : baseRate;
    const maxRate = requiresApproval ? Number(sellerMaxRate) : baseRate;
    if (![baseRate, minRate, maxRate].every(value => Number.isFinite(value) && value >= 0 && value <= 50)) {
      setError('Seller commission percentages must be between 0% and 50%.');
      return;
    }
    if (minRate > maxRate || baseRate < minRate || baseRate > maxRate) {
      setError('The seller base rate must be inside the approved minimum and maximum range.');
      return;
    }
    setSellerSaving(true);
    setError('');
    setMessage('');
    try {
      await commissionService.saveRuleConfirmed({
        ...selectedCommissionRule,
        id: selectedCommissionRule?.id || selected.code,
        packageCode: selected.code,
        packageName: selected.name,
        baseRatePercent: baseRate,
        minRatePercent: minRate,
        maxRatePercent: maxRate,
        requiresAdminApproval: requiresApproval,
        active: true,
        sortOrder: selectedCommissionRule?.sortOrder || commissionRules.length + 1,
        effectiveFrom: selectedCommissionRule?.effectiveFrom || new Date().toISOString().slice(0, 10),
      }, adminEmail);
      setMessage(`${selected.name} seller commission saved at ${baseRate}%${requiresApproval ? ` within the ${minRate}%–${maxRate}% approval range` : ''}. Future verified payments and financial previews now use this package rule.`);
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'The package seller commission could not be saved.');
    } finally {
      setSellerSaving(false);
    }
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
          <p className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-slate-400"><CircleHelp className="h-3.5 w-3.5" /> Hover over or focus a help icon to understand what each setting changes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" title="Open the single Sales Catalog where package prices and commercial details are edited." onClick={() => window.location.assign('/admin/app/sales?tab=sales_catalog')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Open Sales Catalog</button>
          <button type="button" aria-label="Refresh revenue distribution data" onClick={() => void load()} className="rounded-xl border border-slate-200 p-2.5 text-slate-600" title="Reload the latest policy, package prices, profiles and project margin results."><RefreshCw className="h-4 w-4" /></button>
          <button type="button" title="Save this policy as the next version for future quotations and projects. Existing project snapshots will not change." disabled={saving || Math.abs(weightTotal - 100) > 0.0001} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save Policy'}</button>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">{message}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="rounded-2xl border border-slate-200 p-4">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400"><SettingTitle tooltip="The normal contribution percentage ProFox aims to retain after seller, Talent Partner and delivery reserves.">Target contribution margin</SettingTitle></span>
          <div className="mt-2 flex items-center gap-2"><input aria-label="Target contribution margin percent" title="Set the target contribution margin used for future package and quotation planning." type="number" min={1} max={94} step="0.1" value={config.targetMarginPercent} onChange={event => setConfig({ ...config, targetMarginPercent: Number(event.target.value || 0) })} className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-lg font-black" /><span className="font-black">%</span></div>
          <p className="mt-2 text-[11px] leading-4 text-slate-500">Normal company-generated sales are budgeted to preserve this project-level contribution.</p>
        </label>
        <label className="rounded-2xl border border-slate-200 p-4">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400"><SettingTitle tooltip="The hard safety floor. Quotations projected below it require review and must not be treated as normally profitable.">Absolute minimum margin</SettingTitle></span>
          <div className="mt-2 flex items-center gap-2"><input aria-label="Absolute minimum margin percent" title="Set the lowest protected margin permitted before management review is required." type="number" min={1} max={94} step="0.1" value={config.minimumMarginPercent} onChange={event => setConfig({ ...config, minimumMarginPercent: Number(event.target.value || 0) })} className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-lg font-black" /><span className="font-black">%</span></div>
          <p className="mt-2 text-[11px] leading-4 text-slate-500">A quotation below this protected floor becomes a review condition in the existing approval workflow.</p>
        </label>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-2 text-[#000080]"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-black"><SettingTitle tooltip="Each save creates a new auditable policy version. Projects keep the version snapshotted when their paid quotation became a project.">Policy version {config.version}</SettingTitle></span></div>
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
          <div><h3 className="flex items-center gap-1.5 text-sm font-black text-slate-900">Delivery effort allocation <HelpTooltip text="Global role weights must total 100%. They divide the delivery pool for packages that do not have their own profile." /></h3><p className="mt-1 text-[11px] text-slate-500">These weights divide the snapshotted delivery pool. Talent Partner project rewards are reserved on top and never deducted from a worker's protected role budget.</p></div>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${Math.abs(weightTotal - 100) < 0.0001 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{weightTotal.toFixed(2)}% / 100%</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {config.deliveryRoles.map((role, index) => (
            <label key={role.key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <span className="flex min-h-8 items-start gap-1 text-[11px] font-black leading-4 text-slate-700">{role.label}<HelpTooltip text={`Percentage of the global delivery pool reserved for ${role.label}. All global role weights must total 100%.`} /></span>
              <div className="mt-2 flex items-center gap-2"><input aria-label={`${role.label} global delivery weight percent`} title={`Set ${role.label}'s share of the global delivery pool.`} type="number" min={0.01} max={100} step="0.25" value={role.weightPercent} onChange={event => patchRole(index, Number(event.target.value || 0))} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-black" /><span className="text-xs font-black">%</span></div>
              {role.talentPartnerJobSlug && <p className="mt-2 text-[9px] leading-3 text-slate-400">Talent Partner plan: {role.talentPartnerJobSlug}</p>}
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div><h3 className="flex items-center gap-1.5 text-sm font-black text-slate-900">Automatic package distribution preview <HelpTooltip text="Choose a real Sales Catalog package to preview its projected reserves, delivery budget and ProFox margin. This does not create a payment or project." /></h3><p className="mt-1 text-[11px] text-slate-500">Change a package price in Sales Catalog and this preview recalculates automatically. No person-level payout amount is stored here.</p></div>
          <select aria-label="Package distribution preview" title="Select a Sales Catalog package to preview its current revenue distribution." value={selected?.code || ''} onChange={event => setSelectedCode(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">
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

        {selected && <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
          <div className="mb-5 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h4 className="flex items-center gap-1.5 text-xs font-black text-slate-900">Package seller contribution / commission <HelpTooltip text="The base percentage reserved for the salesperson from each verified customer payment for this package. This is the existing canonical commission rule used by payouts and profitability previews." /></h4>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">Edit the seller's base contribution for <b>{selected.name}</b>. It applies only to future verified payments; historical commission entries remain unchanged.</p>
              </div>
              <span className={`w-fit rounded-full px-3 py-1 text-[10px] font-black ${selectedCommissionRule ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{selectedCommissionRule ? 'Active package rule' : 'No rule yet · currently 0%'}</span>
            </div>
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
              <label className="w-full lg:max-w-[220px]">
                <span className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-500">Base seller commission <HelpTooltip text="The percentage of every verified payment that becomes the seller's base commission before any eligible self-generated or performance bonus." /></span>
                <div className="mt-1.5 flex items-center gap-2"><input aria-label={`${selected.name} seller base commission percent`} title="Set this package's base seller commission percentage." type="number" min={0} max={50} step="0.25" value={sellerRate} onChange={event => setSellerRate(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-black" /><span className="text-xs font-black">%</span></div>
              </label>
              {(selectedCommissionRule?.requiresAdminApproval ?? selected.priceMode === 'custom') && <>
                <label className="w-full lg:max-w-[180px]">
                  <span className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-500">Approved minimum <HelpTooltip text="The lowest seller rate Admin may approve for a custom quotation using this package." /></span>
                  <div className="mt-1.5 flex items-center gap-2"><input aria-label={`${selected.name} minimum approved seller commission percent`} title="Set the minimum approved seller rate for this custom package." type="number" min={0} max={50} step="0.25" value={sellerMinRate} onChange={event => setSellerMinRate(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-black" /><span className="text-xs font-black">%</span></div>
                </label>
                <label className="w-full lg:max-w-[180px]">
                  <span className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-500">Approved maximum <HelpTooltip text="The highest seller rate Admin may approve for a custom quotation using this package." /></span>
                  <div className="mt-1.5 flex items-center gap-2"><input aria-label={`${selected.name} maximum approved seller commission percent`} title="Set the maximum approved seller rate for this custom package." type="number" min={0} max={50} step="0.25" value={sellerMaxRate} onChange={event => setSellerMaxRate(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-black" /><span className="text-xs font-black">%</span></div>
                </label>
              </>}
              <button type="button" title="Save this package-specific seller commission to the existing verified-payment commission engine." disabled={sellerSaving} onClick={() => void saveSellerContribution()} className="rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{sellerSaving ? 'Saving…' : 'Save Seller Contribution'}</button>
            </div>
            <div className="mt-3 grid gap-2 text-[10px] sm:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-2.5 text-slate-600"><b>Base reserve:</b> {money(company?.seller?.baseAmount || 0, company?.currency || selected.currency)}</div>
              <div className="rounded-lg bg-slate-50 p-2.5 text-slate-600"><b>Possible performance reserve:</b> {money(company?.seller?.performanceReserveAmount || 0, company?.currency || selected.currency)}</div>
              <div className="rounded-lg bg-slate-50 p-2.5 text-slate-600"><b>Self-generated total:</b> {money(selfGenerated?.seller?.totalReservedAmount || 0, selfGenerated?.currency || selected.currency)}</div>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h4 className="flex items-center gap-1.5 text-xs font-black text-slate-900">Package-specific delivery profile <HelpTooltip text="An optional override for this package only. If no override exists, the package automatically uses the global delivery weights above." /></h4><p className="mt-1 text-[10px] leading-4 text-slate-500">{selectedProfile?.profileId ? 'This package overrides the global effort weights.' : 'This package currently inherits the global effort weights.'} Prices and reward rules remain in their existing systems.</p></div><span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-[#000080]">{profileWeightTotal.toFixed(2)}% / 100%</span></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">{profileRoles.map((role: any, index: number) => <label key={role.key} className="rounded-xl border border-slate-200 bg-white p-3"><span className="flex min-h-8 items-start gap-1 text-[10px] font-black text-slate-700">{role.label}<HelpTooltip text={`Set ${role.label}'s delivery share for this package only. Package weights must total 100%.`} /></span><div className="mt-2 flex items-center gap-2"><input aria-label={`${role.label} package delivery weight percent`} title={`Set ${role.label}'s delivery share for this package.`} type="number" min={0} max={100} step="0.25" value={role.weightPercent} onChange={event => setProfileRoles(current => current.map((item, roleIndex) => roleIndex === index ? { ...item, weightPercent: Number(event.target.value || 0) } : item))} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm font-black"/><span className="text-xs font-black">%</span></div></label>)}</div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">{selectedProfile?.profileId && <button type="button" title="Remove this package override so future quotations use the global delivery profile." disabled={profileSaving} onClick={() => void clearProfile()} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 disabled:opacity-50">Use Global Profile</button>}<button type="button" title="Save these 100% delivery weights as an override for this package's future quotations." disabled={profileSaving || Math.abs(profileWeightTotal - 100) > 0.0001} onClick={() => void saveProfile()} className="rounded-xl bg-[#000080] px-4 py-2 text-xs font-black text-white disabled:opacity-50">{profileSaving ? 'Saving…' : 'Save Package Profile'}</button></div>
        </div>}
      </div>

      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between"><div><h3 className="text-sm font-black">Immutable project economics</h3><p className="mt-1 text-[11px] text-slate-500">Recent paid-sale project snapshots. Package-price changes never rewrite these historical allocations.</p></div><TrendingUp className="h-5 w-5 text-slate-400" /></div>
        {snapshots.length ? (
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-400"><tr><th className="p-3">Project</th><th className="p-3">Quotation</th><th className="p-3 text-right">Revenue</th><th className="p-3 text-right">Delivery pool</th><th className="p-3 text-right">ProFox contribution</th><th className="p-3 text-right">Margin</th><th className="p-3">Policy</th></tr></thead><tbody>{snapshots.map((row: any) => <tr key={row.id} className="border-t border-slate-100"><td className="p-3 font-bold">{row.project_name || row.project_id}</td><td className="p-3 text-slate-500">{row.quotation_number || '—'}</td><td className="p-3 text-right">{money(row.commissionable_revenue, row.currency)}</td><td className="p-3 text-right">{money(row.delivery_pool_amount, row.currency)}</td><td className="p-3 text-right font-bold">{money(row.company_contribution_amount, row.currency)}</td><td className="p-3 text-right font-black">{Number(row.projected_margin_percent || 0).toFixed(2)}%</td><td className="p-3 text-slate-500">v{row.config_version}</td></tr>)}</tbody></table></div>
        ) : <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">No qualifying project snapshots yet. New paid sales will be snapshotted automatically.</div>}
      </div>

      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between"><div><h3 className="text-sm font-black">Projected versus actual margin</h3><p className="mt-1 text-[11px] text-slate-500">Actuals come only from verified customer payments and the existing seller, Talent Partner and worker ledgers. Unpaid allocations are never presented as cash cost.</p></div><TrendingUp className="h-5 w-5 text-slate-400" /></div>
        {projectActuals.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1180px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-400"><tr><th className="p-3">Project</th><th className="p-3 text-right">Projected revenue</th><th className="p-3 text-right">Collected</th><th className="p-3 text-right">Projected people cost</th><th className="p-3 text-right">Actual recognized cost</th><th className="p-3 text-right">Paid cost</th><th className="p-3 text-right">Projected margin</th><th className="p-3 text-right">Actual margin</th></tr></thead><tbody>{projectActuals.map((row: any) => <tr key={row.id} className="border-t border-slate-100"><td className="p-3"><div className="font-bold">{row.project_name||row.project_id}</div><div className="text-[9px] text-slate-400">{row.quotation_number||'—'}</div></td><td className="p-3 text-right">{money(row.projected_revenue,row.currency)}</td><td className="p-3 text-right font-bold">{money(row.collected_revenue,row.currency)}</td><td className="p-3 text-right">{money(row.projected_people_cost,row.currency)}</td><td className="p-3 text-right font-bold">{money(row.actual_recognized_cost,row.currency)}</td><td className="p-3 text-right">{money(row.paid_cost,row.currency)}</td><td className="p-3 text-right font-black">{Number(row.projected_margin_percent||0).toFixed(2)}%</td><td className="p-3 text-right font-black">{row.actual_margin_percent==null?'Awaiting verified revenue':`${Number(row.actual_margin_percent).toFixed(2)}%`}</td></tr>)}</tbody></table></div> : <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">No immutable project snapshots exist yet. The report will populate from real verified sales—no sample financial data is generated.</div>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><p className="text-[11px] leading-5 text-emerald-900"><b>No duplicate commission engines.</b> Seller commissions and Talent Partner rewards still qualify through their existing payment, project and retention workflows. This engine reserves their cost and protects margin around those canonical results.</p></div></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p className="text-[11px] leading-5 text-amber-900"><b>Worker budgets are enforced, not just displayed.</b> Content, UI/UX and Development compensation reuse the existing worker assignment and payout ledger. A role cannot be committed beyond its snapshotted budget; QA and Project Management remain protected project cost pools until those roles use the worker-pay ledger.</p></div></div>
      </div>
    </section>
  );
}
