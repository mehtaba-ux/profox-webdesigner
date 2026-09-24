import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Lock, Save, Settings2, ShieldCheck } from 'lucide-react';
import { ContentDeliveryConfig, contentDeliveryService } from '../../lib/contentDeliveryService';

function getError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as any).message || 'Unable to save settings.');
  return 'Unable to save settings.';
}

export default function ContentDeliverySettings() {
  const [config, setConfig] = useState<ContentDeliveryConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try { setConfig(await contentDeliveryService.getSystemConfig()); }
      catch (e) { setError(getError(e)); }
      finally { setLoading(false); }
    };
    void load();
  }, []);

  const totalWeight = useMemo(() => config?.qualityDimensions.reduce((sum, item) => sum + Number(item.weight || 0), 0) || 0, [config]);

  const save = async () => {
    if (!config) return;
    setError('');
    setSuccess('');
    if (totalWeight !== 100) {
      setError(`Quality dimension weights must total 100. Current total: ${totalWeight}.`);
      return;
    }
    if (config.qualityRevisionFloor < 0 || config.qualityPassScore > 100 || config.qualityRevisionFloor >= config.qualityPassScore) {
      setError('Quality thresholds are invalid. Revision floor must be below the pass score.');
      return;
    }
    if (config.wipLimit < 1 || config.reviewSlaHours < 1 || config.clientReviewSlaHours < 1) {
      setError('WIP and SLA values must be at least 1.');
      return;
    }
    setSaving(true);
    try {
      setConfig(await contentDeliveryService.saveSystemConfig(config));
      setSuccess('Content Delivery operating settings saved.');
    } catch (e) {
      setError(getError(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center rounded-3xl border border-slate-200 bg-white p-10"><Loader2 className="h-6 w-6 animate-spin text-[#000080]" /></div>;
  if (!config) return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800">Content Delivery settings will become available when the PF-SOP-07 migration is deployed.</div>;

  const updatePackage = (code: string, key: string, value: unknown) => {
    setConfig(current => current ? ({ ...current, packageProfiles: { ...current.packageProfiles, [code]: { ...(current.packageProfiles[code] || {}), [key]: value } } }) : current);
  };

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]"><Settings2 className="h-4 w-4" />Dynamic delivery policy</div><h2 className="mt-1 text-lg font-black text-slate-900">Content Delivery Settings</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Configure operational depth and thresholds without changing code. Prices and purchased scope remain owned by Sales Catalog and quotations.</p></div>
        <button type="button" onClick={() => void save()} disabled={saving} className="flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Settings</button>
      </div>

      {error && <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {success && <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{success}</div>}

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <NumberField label="Writer WIP Limit" value={config.wipLimit} min={1} max={10} onChange={value => setConfig({ ...config, wipLimit: value })} hint="Maximum active Drafting / Self-QA items per writer." />
        <NumberField label="Internal Review SLA" value={config.reviewSlaHours} min={1} max={168} suffix="hours" onChange={value => setConfig({ ...config, reviewSlaHours: value })} />
        <NumberField label="Client Review SLA" value={config.clientReviewSlaHours} min={1} max={336} suffix="hours" onChange={value => setConfig({ ...config, clientReviewSlaHours: value })} />
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-[#000080]"><ShieldCheck className="h-4 w-4" />SOP</div><div className="mt-2 text-lg font-black text-slate-900">{config.sopCode}</div><div className="mt-1 text-[10px] leading-4 text-slate-500">Protected content-delivery standard.</div></div>
      </div>

      <div className="mt-7">
        <div className="flex items-end justify-between gap-3"><div><h3 className="text-sm font-black text-slate-900">Quality Score Policy</h3><p className="mt-1 text-xs text-slate-500">The backend enforces these thresholds. C0/C1 defects always block approval.</p></div><div className={`rounded-full px-2.5 py-1 text-[10px] font-black ${totalWeight === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>Weight total {totalWeight}/100</div></div>
        <div className="mt-4 grid gap-4 md:grid-cols-2"><NumberField label="Revision Required From" value={config.qualityRevisionFloor} min={0} max={99} suffix="points" onChange={value => setConfig({ ...config, qualityRevisionFloor: value })} /><NumberField label="Pass Score" value={config.qualityPassScore} min={1} max={100} suffix="points" onChange={value => setConfig({ ...config, qualityPassScore: value })} /></div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-5">{config.qualityDimensions.map((dimension, index) => <label key={dimension.key} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><span className="block min-h-[32px] text-[10px] font-bold leading-4 text-slate-600">{dimension.label}</span><div className="mt-2 flex items-center gap-1"><input type="number" min={0} max={100} value={dimension.weight} onChange={event => { const next = [...config.qualityDimensions]; next[index] = { ...dimension, weight: Number(event.target.value) || 0 }; setConfig({ ...config, qualityDimensions: next }); }} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-black outline-none focus:border-[#000080]" /><span className="text-[10px] font-bold text-slate-400">pts</span></div></label>)}</div>
      </div>

      <div className="mt-7">
        <h3 className="text-sm font-black text-slate-900">Package Delivery Depth</h3><p className="mt-1 text-xs text-slate-500">These rules control process depth only. Package names, prices and commercial scope are read dynamically from the canonical Sales Catalog / quotation.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">{Object.entries(config.packageProfiles).map(([code, profile]) => {
          const p: any = profile || {};
          return <div key={code} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-[10px] font-black uppercase tracking-wider text-[#000080]">{code}</div><div className="mt-1 text-sm font-black text-slate-900">{p.label || code}</div></div><div className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-600"><Lock className="h-3 w-3" />2i protected</div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-[10px] font-bold uppercase text-slate-500">Research depth</span><select value={p.researchDepth || 'standard'} onChange={event => updatePackage(code, 'researchDepth', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold outline-none"><option value="standard">Standard</option><option value="detailed">Detailed</option><option value="deep">Deep</option><option value="project_specific">Project Specific</option></select></label><label><span className="mb-1 block text-[10px] font-bold uppercase text-slate-500">Included revisions</span><input type="number" min={0} placeholder="Custom" value={p.includedRevisionRounds ?? ''} onChange={event => updatePackage(code, 'includedRevisionRounds', event.target.value === '' ? null : Number(event.target.value))} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold outline-none" /></label></div><div className="mt-3 flex flex-wrap gap-4"><Toggle label="SEO / Conversion Review" checked={p.requiresSeoReview !== false} onChange={value => updatePackage(code, 'requiresSeoReview', value)} /><ProtectedToggle label="Independent 2i" /><ProtectedToggle label="In-Context QA" /></div></div>;
        })}</div>
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-4"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><div className="text-xs font-black text-amber-900">Protected quality invariants</div><p className="mt-1 text-[11px] leading-5 text-amber-800">Admin can tune operational thresholds, but writers still cannot self-approve independent review, C0/C1 defects still block approval, and commercial pricing remains outside this configuration.</p></div></div>
    </section>
  );
}

function NumberField({ label, value, min, max, suffix, hint, onChange }: { label: string; value: number; min: number; max: number; suffix?: string; hint?: string; onChange: (value: number) => void }) {
  return <label className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><span className="block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span><div className="mt-2 flex items-center gap-2"><input type="number" min={min} max={max} value={value} onChange={event => onChange(Number(event.target.value) || min)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-black outline-none focus:border-[#000080]" />{suffix && <span className="text-[10px] font-bold text-slate-400">{suffix}</span>}</div>{hint && <span className="mt-2 block text-[10px] leading-4 text-slate-400">{hint}</span>}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex cursor-pointer items-center gap-2 text-[10px] font-bold text-slate-600"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="rounded" />{label}</label>;
}

function ProtectedToggle({ label }: { label: string }) {
  return <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{label}</div>;
}
