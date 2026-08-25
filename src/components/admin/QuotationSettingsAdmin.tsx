import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Save, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { quotationCpqService } from '../../lib/quotationCpqService';

export default function QuotationSettingsAdmin() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [config, setConfig] = useState<any>(null);
  const [templatesJson, setTemplatesJson] = useState('[]');
  const [paymentJson, setPaymentJson] = useState('[]');
  const [relationshipsJson, setRelationshipsJson] = useState('{}');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error: loadError } = await quotationCpqService.getSettings();
      if (loadError) setError(loadError.message); else {
        const next = data || {};
        setConfig(next);
        setTemplatesJson(JSON.stringify(next.templates || [], null, 2));
        setPaymentJson(JSON.stringify(next.customPaymentSchedule || [], null, 2));
        setRelationshipsJson(JSON.stringify(next.optionalProductRelationships || {}, null, 2));
      }
      setLoading(false);
    })();
  }, []);

  if (!isAdmin) return <div className="mx-auto max-w-3xl p-8"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">Admin access is required to manage quotation business rules.</div></div>;
  if (loading || !config) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;

  const update = (key: string, value: any) => setConfig((prev:any) => ({ ...prev, [key]: value }));
  const save = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const templates = JSON.parse(templatesJson);
      const customPaymentSchedule = JSON.parse(paymentJson);
      const optionalProductRelationships = JSON.parse(relationshipsJson);
      if (!Array.isArray(templates)) throw new Error('Templates must be a JSON array.');
      if (!Array.isArray(customPaymentSchedule)) throw new Error('Custom payment schedule must be a JSON array.');
      if (!optionalProductRelationships || Array.isArray(optionalProductRelationships) || typeof optionalProductRelationships !== 'object') throw new Error('Optional-product relationships must be a JSON object.');
      const next = { ...config, templates, customPaymentSchedule, optionalProductRelationships };
      const { data, error: saveError } = await quotationCpqService.saveSettings(next);
      if (saveError) throw saveError;
      setConfig(data || next); setSuccess('Quotation settings saved. New quotations will use the updated Admin policy.');
    } catch (err:any) { setError(err?.message || 'Failed to save quotation settings.'); }
    finally { setSaving(false); }
  };

  return <div className="min-h-screen bg-slate-50 pb-16">
    <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4"><div className="flex items-center gap-3"><button onClick={()=>navigate('/admin/app/sales?tab=quotations')} className="rounded-xl border border-slate-200 p-2"><ArrowLeft className="h-4 w-4"/></button><div><h1 className="text-lg font-black">Quotation / CPQ Settings</h1><p className="text-xs text-slate-500">Central Admin policy used by the existing quotation, Sales Catalog and communication workflow.</p></div></div><button onClick={save} disabled={saving} className="rounded-xl bg-[#000080] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving?<Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>:<Save className="mr-2 inline h-4 w-4"/>}Save Settings</button></div></div>
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-6">
      {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}{success&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{success}</div>}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-5 flex items-center gap-2"><Settings2 className="h-5 w-5 text-[#000080]"/><h2 className="font-black">Commercial Policy</h2></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"><label><span className="mb-1 block text-xs font-bold">Default validity days</span><input type="number" min={1} max={365} value={config.defaultValidityDays??30} onChange={e=>update('defaultValidityDays',Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2"/></label><label><span className="mb-1 block text-xs font-bold">Auto-approval discount %</span><input type="number" min={0} max={100} value={config.autoApprovalDiscountPercent??5} onChange={e=>update('autoApprovalDiscountPercent',Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2"/></label><label><span className="mb-1 block text-xs font-bold">Maximum Sales discount %</span><input type="number" min={0} max={100} value={config.maxSalesDiscountPercent??20} onChange={e=>update('maxSalesDiscountPercent',Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2"/></label><label><span className="mb-1 block text-xs font-bold">Tax / fee rate %</span><input type="number" min={0} max={100} step="0.01" value={config.taxRate??0} onChange={e=>update('taxRate',Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2"/></label><label className="flex items-center gap-2 pt-5"><input type="checkbox" checked={config.allowSalesCustomLines!==false} onChange={e=>update('allowSalesCustomLines',e.target.checked)}/><span className="text-sm font-bold">Allow Sales custom lines</span></label><label><span className="mb-1 block text-xs font-bold">Tax / fee label</span><input value={config.taxLabel||'Tax'} onChange={e=>update('taxLabel',e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2"/></label></div></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-black">Quotation Branding & Defaults</h2><p className="mt-1 text-xs text-slate-500">Logo remains sourced from the existing ProFox Logo/CMS component. These settings control quotation-safe business identity text.</p><div className="mt-5 grid gap-4 md:grid-cols-2">{[['Business name','businessName'],['Registered name','registeredName'],['Website URL','websiteUrl'],['Contact email','contactEmail'],['Brand line','brandLine'],['Default proposal title','defaultProposalTitle']].map(([label,key])=><label key={key}><span className="mb-1 block text-xs font-bold">{label}</span><input value={config[key]||''} onChange={e=>update(key,e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2"/></label>)}<label className="md:col-span-2"><span className="mb-1 block text-xs font-bold">Default cover message</span><textarea rows={3} value={config.defaultCoverMessage||''} onChange={e=>update('defaultCoverMessage',e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2"/></label><label className="md:col-span-2"><span className="mb-1 block text-xs font-bold">Standard terms</span><textarea rows={5} value={config.standardTerms||''} onChange={e=>update('standardTerms',e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2"/></label></div></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-black">Templates</h2><p className="mt-1 text-xs text-slate-500">Templates reference Sales Catalog product codes; they never duplicate product records.</p><textarea rows={16} value={templatesJson} onChange={e=>setTemplatesJson(e.target.value)} spellCheck={false} className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100"/></section>
      <section className="grid gap-6 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-black">Custom Proposal Payment Schedule</h2><p className="mt-1 text-xs text-slate-500">Used only when a custom quotation has no primary catalog package. Must total 100% and begin with Advance or Full Payment.</p><textarea rows={12} value={paymentJson} onChange={e=>setPaymentJson(e.target.value)} spellCheck={false} className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100"/></div><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-black">Optional Product Relationships</h2><p className="mt-1 text-xs text-slate-500">Map primary product codes to recommended add-on product codes without duplicating catalog data.</p><textarea rows={12} value={relationshipsJson} onChange={e=>setRelationshipsJson(e.target.value)} spellCheck={false} className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100"/></div></section>
    </main>
  </div>;
}
