import React, { useEffect, useMemo, useState } from 'react';
import { Check, Clock3, History, Loader2, Mail, Plus, Sparkles, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { quotationCpqService } from '../../lib/quotationCpqService';
import { salesService } from '../../lib/salesService';
import { supabase } from '../../lib/supabase';

function quoteIdFromPath(pathname: string) {
  const match = pathname.match(/^\/admin\/quotations\/([^/]+)$/);
  if (!match || match[1] === 'new') return null;
  return match[1];
}

function money(value: unknown, currency = 'USD') {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0)); }
  catch { return `${currency} ${Number(value || 0).toFixed(2)}`; }
}

export default function QuotationWorkspaceEnhancements() {
  const location = useLocation();
  const { isAdmin } = useAuth();
  const quotationId = quoteIdFromPath(location.pathname);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workspace, setWorkspace] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [settings, setSettings] = useState<any>({});
  const [products, setProducts] = useState<any[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [minDays, setMinDays] = useState('');
  const [maxDays, setMaxDays] = useState('');
  const [overrideNote, setOverrideNote] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [quotationMeta, setQuotationMeta] = useState<any>(null);
  const [resendOpen, setResendOpen] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendRecipient, setResendRecipient] = useState('');
  const [resendCc, setResendCc] = useState('');
  const [resendSubject, setResendSubject] = useState('');
  const [resendMessage, setResendMessage] = useState('');
  const [resendError, setResendError] = useState('');
  const [resendNotice, setResendNotice] = useState('');

  useEffect(() => {
    setOpen(false);
    setWorkspace(null);
    setSummary(null);
    setMessage('');
    setError('');
    setQuotationMeta(null);
    setResendOpen(false);
    setResendError('');
    setResendNotice('');

    if (!quotationId) return;
    let cancelled = false;
    void supabase
      .from('quotations')
      .select('id,quotation_number,email,send_cc,send_subject,send_message,status,superseded_by_id,resend_count,last_resent_at')
      .eq('id', quotationId)
      .single()
      .then(({ data }) => { if (!cancelled && data) setQuotationMeta(data); });
    return () => { cancelled = true; };
  }, [quotationId]);

  const load = async () => {
    if (!quotationId) return;
    setLoading(true); setError('');
    try {
      const [workspaceResult, summaryResult, settingsResult, productResult, recentResult] = await Promise.all([
        quotationCpqService.getWorkspace(quotationId),
        quotationCpqService.getSummary(quotationId),
        quotationCpqService.getSettings(),
        salesService.getActiveProducts(),
        quotationCpqService.getRecentProductIds(6)
      ]);
      if (workspaceResult.error || !workspaceResult.data) throw workspaceResult.error || new Error('Quotation could not be loaded.');
      if (summaryResult.error) throw summaryResult.error;
      if (settingsResult.error) throw settingsResult.error;
      if (productResult.error) throw productResult.error;
      setWorkspace(workspaceResult.data);
      setSummary(summaryResult.data);
      setSettings(settingsResult.data || {});
      setProducts(productResult.data || []);
      setRecentIds(recentResult.data || []);
      const presentation = summaryResult.data?.presentation || {};
      setMinDays(presentation.estimatedDurationMin == null ? '' : String(presentation.estimatedDurationMin));
      setMaxDays(presentation.estimatedDurationMax == null ? '' : String(presentation.estimatedDurationMax));
    } catch (err: any) {
      setError(err?.message || 'Could not load quotation assist data.');
    } finally { setLoading(false); }
  };

  useEffect(() => { if (open && quotationId) void load(); }, [open, quotationId]);

  const suggestedProducts = useMemo(() => {
    const relationships = settings?.optionalProductRelationships as Record<string, unknown> | undefined;
    if (!relationships || typeof relationships !== 'object' || Array.isArray(relationships) || !workspace) return [];
    const selectedCodes = new Set<string>(
      (workspace.lines || [])
        .filter((line: any) => line.lineType === 'product')
        .map((line: any) => String(line.productCodeSnapshot || ''))
        .filter((code: string) => Boolean(code))
    );
    const suggestedCodes = new Set<string>();
    selectedCodes.forEach((code: string) => {
      const related = relationships[code];
      if (Array.isArray(related)) related.forEach((value: unknown) => { if (typeof value === 'string') suggestedCodes.add(value); });
    });
    return products.filter((product: any) => suggestedCodes.has(product.code) && !selectedCodes.has(product.code));
  }, [settings, workspace, products]);

  const recentProducts = useMemo(() => recentIds.map(id => products.find((p: any) => p.id === id)).filter(Boolean), [recentIds, products]);
  const draftEditable = workspace?.quotation?.status === 'Draft' && !workspace?.quotation?.supersededById;
  const canResend = quotationMeta?.status === 'Sent' && !quotationMeta?.superseded_by_id;

  const addSuggested = async (productId: string) => {
    if (!quotationId || !draftEditable) return;
    setSaving(true); setError(''); setMessage('');
    const { error: addError } = await supabase.rpc('add_quotation_catalog_item', { p_quotation_id: quotationId, p_sales_product_id: productId, p_optional: true });
    if (addError) setError(addError.message);
    else {
      setMessage('Suggested add-on added as Optional for Client using live Sales Catalog data.');
      await load();
      window.setTimeout(() => window.location.reload(), 350);
    }
    setSaving(false);
  };

  const saveOverride = async (clear = false) => {
    if (!quotationId || !isAdmin) return;
    const min = clear ? null : Number(minDays);
    const max = clear ? null : Number(maxDays);
    if (!clear && (!Number.isInteger(min) || !Number.isInteger(max) || min <= 0 || max < min)) {
      setError('Enter a valid minimum and maximum business-day range.'); return;
    }
    setSaving(true); setError(''); setMessage('');
    const result = await quotationCpqService.setDurationOverride(quotationId, min, max, clear ? null : overrideNote.trim() || null, clear);
    if (result.error) setError(result.error.message);
    else {
      setMessage(clear ? 'Admin timeline override cleared; catalog timeline restored.' : 'Admin timeline override saved.');
      await load();
      window.setTimeout(() => window.location.reload(), 350);
    }
    setSaving(false);
  };

  const openResend = async () => {
    if (!quotationId) return;
    setResendOpen(true);
    setResendLoading(true);
    setResendError('');
    setResendNotice('');
    const { data, error: loadError } = await supabase
      .from('quotations')
      .select('id,quotation_number,email,send_cc,send_subject,send_message,status,superseded_by_id,resend_count,last_resent_at')
      .eq('id', quotationId)
      .single();
    setResendLoading(false);
    if (loadError || !data) {
      setResendError(loadError?.message || 'Could not load resend details.');
      return;
    }
    setQuotationMeta(data);
    if (data.status !== 'Sent' || data.superseded_by_id) {
      setResendError(data.superseded_by_id
        ? 'This quotation has been superseded. Open the current revision instead.'
        : 'Only a quotation that has already been sent can be resent.');
      return;
    }
    setResendRecipient(data.email || '');
    setResendCc(Array.isArray(data.send_cc) ? data.send_cc.join(', ') : '');
    setResendSubject(data.send_subject || `Your ProFox proposal is ready: ${data.quotation_number || ''}`);
    setResendMessage('As requested, I am resending your ProFox proposal. Please use the secure link to review the same approved quotation.');
  };

  const resendQuotation = async () => {
    if (!quotationId || !resendRecipient.trim()) return;
    setResendLoading(true);
    setResendError('');
    const cc = resendCc.split(',').map(value => value.trim()).filter(Boolean);
    const { data, error: resendRpcError } = await supabase.rpc('resend_quotation_professional', {
      p_quotation_id: quotationId,
      p_recipient: resendRecipient.trim(),
      p_cc: cc,
      p_subject: resendSubject.trim() || null,
      p_message: resendMessage.trim() || null
    });
    setResendLoading(false);
    if (resendRpcError) {
      setResendError(resendRpcError.message);
      return;
    }
    const result = data as any;
    setQuotationMeta((current: any) => ({
      ...(current || {}),
      status: 'Sent',
      resend_count: Number(result?.resendCount || (current?.resend_count || 0) + 1),
      last_resent_at: result?.lastResentAt || new Date().toISOString()
    }));
    setResendOpen(false);
    setResendNotice(`Quotation resent successfully${result?.resendCount ? ` · Resend ${result.resendCount}` : ''}.`);
    window.setTimeout(() => setResendNotice(''), 6000);
  };

  if (!quotationId) return null;

  return <>
    {canResend && <button onClick={() => void openResend()} className="fixed bottom-20 right-6 z-40 inline-flex items-center gap-2 rounded-2xl border border-[#000080]/20 bg-white px-4 py-3 text-xs font-black text-[#000080] shadow-xl shadow-slate-900/15 hover:bg-slate-50 max-sm:right-4" title="Resend this same sent quotation to the client">
      <Mail className="h-4 w-4"/>Resend Quotation
    </button>}
    {resendNotice && <div className="fixed bottom-36 right-6 z-50 max-w-sm rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800 shadow-xl max-sm:left-4 max-sm:right-4"><Check className="mr-1.5 inline h-4 w-4"/>{resendNotice}</div>}
    <button onClick={() => setOpen(true)} className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-2xl bg-[#000080] px-4 py-3 text-xs font-black text-white shadow-xl shadow-slate-900/20 hover:bg-[#000067] max-sm:right-4" title="Quotation productivity tools">
      <Sparkles className="h-4 w-4"/>CPQ Assist
    </button>

    {resendOpen && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={event => { if (event.target === event.currentTarget && !resendLoading) setResendOpen(false); }}>
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#FF0E0E]">Customer Delivery</p><h2 className="mt-1 text-xl font-black text-slate-950">Resend Quotation</h2><p className="mt-1 text-xs leading-5 text-slate-500">Send the same locked quotation again without creating a new quotation or revision.</p></div>
          <button disabled={resendLoading} onClick={() => setResendOpen(false)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><X className="h-5 w-5"/></button>
        </div>

        <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900">
          <p className="font-black">Same approved proposal, same secure review flow.</p>
          <p className="mt-1">Resending does not change pricing, approval, payment schedule, sent status, or customer view history. The original secure proposal link is reused whenever available.</p>
          {quotationMeta && <p className="mt-2 text-[11px] font-semibold text-blue-700">Previously resent {Number(quotationMeta.resend_count || 0)} time{Number(quotationMeta.resend_count || 0) === 1 ? '' : 's'}{quotationMeta.last_resent_at ? ` · Last ${new Date(quotationMeta.last_resent_at).toLocaleString()}` : ''}</p>}
        </div>

        {resendLoading && !resendRecipient ? <div className="flex min-h-[220px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]"/></div> : <div className="mt-5 space-y-4">
          {resendError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{resendError}</div>}
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-700">Recipient</span><input type="email" value={resendRecipient} onChange={event => setResendRecipient(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#000080]" placeholder="client@example.com"/></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-700">CC <span className="font-normal text-slate-400">(comma separated)</span></span><input value={resendCc} onChange={event => setResendCc(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#000080]" placeholder="manager@example.com, accounts@example.com"/></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-700">Email Subject</span><input value={resendSubject} onChange={event => setResendSubject(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#000080]"/></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-700">Personal Message</span><textarea rows={4} value={resendMessage} onChange={event => setResendMessage(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#000080]"/></label>
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end"><button disabled={resendLoading} onClick={() => setResendOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-40">Cancel</button><button disabled={resendLoading || !resendRecipient.trim()} onClick={() => void resendQuotation()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{resendLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Mail className="h-4 w-4"/>}Resend Quotation</button></div>
        </div>}
      </div>
    </div>}

    {open && <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/45" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#FF0E0E]">ProFox CPQ</p><h2 className="mt-1 text-xl font-black">Quotation Assist</h2><p className="mt-1 text-xs leading-5 text-slate-500">Catalog recommendations, recent products and protected Admin timeline controls. Commercial facts stay server-authoritative.</p></div><button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5"/></button></div>
        {loading ? <div className="flex min-h-[280px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]"/></div> : <div className="mt-6 space-y-6">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
          {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700"><Check className="mr-1 inline h-3.5 w-3.5"/>{message}</div>}

          <section className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#000080]"/><h3 className="text-sm font-black">Suggested Add-ons</h3></div>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">Suggestions come from Admin-configured product relationships and reference the existing Sales Catalog.</p>
            <div className="mt-3 space-y-2">{suggestedProducts.length ? suggestedProducts.map((product: any) => <div key={product.id} className="rounded-xl bg-slate-50 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-slate-900">{product.name}</p><p className="mt-0.5 text-[10px] text-slate-500">{product.code} · {product.productType?.replace('_',' ')}</p></div><p className="text-xs font-black text-[#000080]">{money(product.basePrice, product.currency || workspace?.quotation?.currency || 'USD')}</p></div>{draftEditable && <button disabled={saving} onClick={() => void addSuggested(product.id)} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-[#000080]/20 bg-white px-2.5 py-1.5 text-[10px] font-black text-[#000080] disabled:opacity-50"><Plus className="h-3 w-3"/>Add as Optional</button>}</div>) : <p className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500">No additional relationship-based suggestions are configured for the current saved products.</p>}</div>
          </section>

          <section className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-2"><History className="h-4 w-4 text-[#000080]"/><h3 className="text-sm font-black">Recent Products</h3></div>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">Recent catalog items from quotation history visible to your account.</p>
            <div className="mt-3 space-y-2">{recentProducts.length ? recentProducts.map((product: any) => <div key={product.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div><p className="text-xs font-bold">{product.name}</p><p className="text-[10px] text-slate-400">{product.code}</p></div><span className="text-[10px] font-bold text-slate-500">{product.productType?.replace('_',' ')}</span></div>) : <p className="text-[11px] text-slate-500">Recent products will appear after quotation history is available.</p>}</div>
          </section>

          {isAdmin && <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-amber-700"/><h3 className="text-sm font-black text-amber-950">Admin Timeline Override</h3></div>
            <p className="mt-1 text-[11px] leading-4 text-amber-800">Preserves the existing protected override workflow. Use only after confirming a delivery estimate that differs from the catalog calculation.</p>
            <div className="mt-3 grid grid-cols-2 gap-2"><label><span className="mb-1 block text-[10px] font-bold text-amber-900">Min business days</span><input type="number" min={1} value={minDays} onChange={e => setMinDays(e.target.value)} className="w-full rounded-lg border border-amber-200 bg-white px-2 py-2 text-xs"/></label><label><span className="mb-1 block text-[10px] font-bold text-amber-900">Max business days</span><input type="number" min={1} value={maxDays} onChange={e => setMaxDays(e.target.value)} className="w-full rounded-lg border border-amber-200 bg-white px-2 py-2 text-xs"/></label></div>
            <label className="mt-2 block"><span className="mb-1 block text-[10px] font-bold text-amber-900">Reason / delivery note</span><textarea rows={3} value={overrideNote} onChange={e => setOverrideNote(e.target.value)} className="w-full rounded-lg border border-amber-200 bg-white px-2 py-2 text-xs" placeholder="Why this timeline is appropriate…"/></label>
            <div className="mt-3 flex gap-2"><button disabled={saving} onClick={() => void saveOverride(false)} className="rounded-lg bg-amber-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-50">Save Override</button><button disabled={saving} onClick={() => void saveOverride(true)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-[10px] font-black text-amber-800 disabled:opacity-50">Restore Catalog Timeline</button></div>
            {summary?.presentation?.durationSnapshotText && <p className="mt-3 text-[10px] font-semibold text-amber-900">Current: {summary.presentation.durationSnapshotText}</p>}
          </section>}
        </div>}
      </aside>
    </div>}
  </>;
}
