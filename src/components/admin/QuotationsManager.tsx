import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Clock, Copy, Edit2, Info, Loader2, Mail, Package, Plus, Printer, Receipt, Search, Trash2, User, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { CRMOpportunity, QUOTATION_STATUSES, Quotation, QuotationItem, QuotationStatus, SalesProduct } from '../../types';
import { salesService } from '../../lib/salesService';
import { crmService } from '../../lib/crmService';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

type TimelineImpact = 'base' | 'additive' | 'parallel' | 'assessment_required';
type TimelineResult = { min: number | null; max: number | null; requiresAssessment: boolean; text: string };

function productDuration(product: SalesProduct) {
  const value = product as any;
  return {
    min: value.deliveryDurationMin == null ? null : Number(value.deliveryDurationMin),
    max: value.deliveryDurationMax == null ? null : Number(value.deliveryDurationMax),
    impact: (value.timelineImpact || 'assessment_required') as TimelineImpact,
    note: String(value.deliveryDurationNote || '')
  };
}

function itemDuration(item: Partial<QuotationItem>) {
  const value = item as any;
  return {
    min: value.durationMinSnapshot ?? value._durationMin ?? null,
    max: value.durationMaxSnapshot ?? value._durationMax ?? null,
    impact: (value.timelineImpactSnapshot || value._timelineImpact || 'assessment_required') as TimelineImpact,
    note: String(value.durationNoteSnapshot || value._durationNote || '')
  };
}

function rangeText(min: number | null, max: number | null) {
  if (min == null || max == null) return 'Timeline confirmation required';
  return min === max ? `${min} business days` : `${min}–${max} business days`;
}

function itemTimelineText(item: Partial<QuotationItem>) {
  const duration = itemDuration(item);
  if (duration.impact === 'assessment_required') return 'Timeline assessment required';
  if (item.itemType === 'care_plan' && duration.impact === 'parallel' && duration.min == null) return 'Ongoing · no project delivery extension';
  if (duration.min == null || duration.max == null) return 'Timeline not configured';
  const range = rangeText(duration.min, duration.max);
  if (duration.impact === 'additive') return `Adds ${range}${(item.quantity || 1) > 1 ? ` × ${item.quantity}` : ''}`;
  if (duration.impact === 'parallel') return `${range} · runs in parallel`;
  return `Base ${range}`;
}

function calculateTimeline(items: Partial<QuotationItem>[]): TimelineResult {
  if (!items.length) return { min: null, max: null, requiresAssessment: true, text: 'Add catalog items to calculate the project timeline.' };
  let baseMin = 0; let baseMax = 0; let addMin = 0; let addMax = 0; let parallelMin = 0; let parallelMax = 0; let timed = 0;
  for (const item of items) {
    const duration = itemDuration(item);
    const carePlanNoExtension = item.itemType === 'care_plan' && duration.impact === 'parallel' && duration.min == null && duration.max == null;
    if (duration.impact === 'assessment_required') return { min: null, max: null, requiresAssessment: true, text: 'Timeline confirmation required before customer delivery.' };
    if (!carePlanNoExtension && (duration.min == null || duration.max == null)) return { min: null, max: null, requiresAssessment: true, text: 'Timeline confirmation required before customer delivery.' };
    if (carePlanNoExtension) continue;
    timed += 1;
    if (duration.impact === 'base') {
      baseMin = Math.max(baseMin, Number(duration.min)); baseMax = Math.max(baseMax, Number(duration.max));
    } else if (duration.impact === 'additive') {
      const quantity = Math.max(1, Number(item.quantity || 1));
      addMin += Number(duration.min) * quantity; addMax += Number(duration.max) * quantity;
    } else if (duration.impact === 'parallel') {
      parallelMin = Math.max(parallelMin, Number(duration.min)); parallelMax = Math.max(parallelMax, Number(duration.max));
    }
  }
  if (!timed) return { min: null, max: null, requiresAssessment: false, text: 'Ongoing care plan; it does not extend a project delivery timeline.' };
  const min = Math.max(baseMin + addMin, parallelMin);
  const max = Math.max(baseMax + addMax, parallelMax);
  return { min, max, requiresAssessment: false, text: `Estimated delivery: ${rangeText(min, max)} from confirmed project kickoff and receipt of required project materials.` };
}

export default function QuotationsManager({ onNavigate }: { onNavigate?: (tab: string, metadata?: any) => void }) {
  const { user, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [products, setProducts] = useState<SalesProduct[]>([]);
  const [opportunities, setOpportunities] = useState<CRMOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeStatusTab, setActiveStatusTab] = useState<QuotationStatus | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Partial<Quotation> | null>(null);
  const [quotationItems, setQuotationItems] = useState<Partial<QuotationItem>[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState<(Quotation & { quotation_items?: QuotationItem[] }) | null>(null);
  const [overrideMin, setOverrideMin] = useState<number | null>(null);
  const [overrideMax, setOverrideMax] = useState<number | null>(null);
  const [overrideNote, setOverrideNote] = useState('');

  const fetchInitialData = async () => {
    setLoading(true); setError('');
    try {
      const [qRes, pRes, oRes] = await Promise.all([salesService.getQuotations(), salesService.getActiveProducts(), crmService.getOpportunities()]);
      if (qRes.error) throw qRes.error;
      if (pRes.error) throw pRes.error;
      setQuotations(qRes.data || []);
      setProducts(pRes.data || []);
      setOpportunities(oRes.filter(item => isAdmin || item.salespersonId === user?.id));
    } catch (err: any) {
      setError(err?.message || 'Failed to load quotations.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void fetchInitialData(); }, []);

  const handleCreateQuotation = () => {
    setEditingQuotation({ customerName: '', currency: 'USD', status: 'Draft', salespersonId: user?.id, validUntil: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'), subtotal: 0, total: 0 });
    setQuotationItems([]); setOverrideMin(null); setOverrideMax(null); setOverrideNote(''); setIsModalOpen(true);
  };

  useEffect(() => {
    if (searchParams.get('action') !== 'new') return;
    handleCreateQuotation();
    const next = new URLSearchParams(searchParams); next.delete('action'); setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleEditQuotation = async (q: Quotation) => {
    try {
      const { data, error: loadError } = await salesService.getQuotationById(q.id);
      if (loadError) throw loadError;
      if (!data) throw new Error('Quotation not found.');
      const value = data as any;
      setEditingQuotation(data);
      setQuotationItems(value.quotation_items || []);
      setOverrideMin(value.durationOverrideMin ?? null);
      setOverrideMax(value.durationOverrideMax ?? null);
      setOverrideNote(value.durationOverrideNote || '');
      setIsModalOpen(true);
    } catch (err: any) { setError(err?.message || 'Failed to load quotation details.'); }
  };

  const handleDuplicate = async (id: string) => {
    const { error: duplicateError } = await salesService.duplicateQuotation(id);
    if (duplicateError) setError(duplicateError.message || 'Failed to duplicate quotation.'); else await fetchInitialData();
  };

  const addItem = (product: SalesProduct) => {
    const duration = productDuration(product);
    const item: any = {
      salesProductId: product.id, productCodeSnapshot: product.code, productNameSnapshot: product.name, descriptionSnapshot: product.shortDescription,
      quantity: 1, unitPrice: product.basePrice, lineTotal: product.basePrice, itemType: product.productType, sortOrder: quotationItems.length * 10,
      _priceMode: product.priceMode, _managerApprovalRequired: product.managerApprovalRequired,
      _durationMin: duration.min, _durationMax: duration.max, _timelineImpact: duration.impact, _durationNote: duration.note
    };
    const next = [...quotationItems, item]; setQuotationItems(next); calculateTotals(next);
  };

  const updateItem = (index: number, updates: Partial<QuotationItem>) => {
    const next = [...quotationItems]; next[index] = { ...next[index], ...updates };
    if (updates.unitPrice !== undefined || updates.quantity !== undefined) next[index].lineTotal = (next[index].unitPrice || 0) * (next[index].quantity || 1);
    setQuotationItems(next); calculateTotals(next);
  };

  const removeItem = (index: number) => {
    const next = quotationItems.filter((_, i) => i !== index); setQuotationItems(next); calculateTotals(next);
  };

  const calculateTotals = (items: Partial<QuotationItem>[]) => {
    const subtotal = items.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
    setEditingQuotation(prev => prev ? { ...prev, subtotal, total: subtotal } : null);
  };

  const liveTimeline = useMemo(() => calculateTimeline(quotationItems), [quotationItems]);
  const confirmedTimeline: TimelineResult = overrideMin != null && overrideMax != null
    ? { min: overrideMin, max: overrideMax, requiresAssessment: false, text: `Estimated delivery: ${rangeText(overrideMin, overrideMax)} from confirmed project kickoff and receipt of required project materials.${overrideNote.trim() ? ` ${overrideNote.trim()}` : ''}` }
    : liveTimeline;

  const applyAdminOverride = async (quotationId: string) => {
    if (!isAdmin) return;
    const hasAny = overrideMin != null || overrideMax != null || Boolean(overrideNote.trim());
    if (hasAny) {
      if (overrideMin == null || overrideMax == null || overrideMin <= 0 || overrideMax < overrideMin) throw new Error('Provide a valid Admin-confirmed minimum and maximum business-day estimate.');
      const { error: overrideError } = await supabase.rpc('admin_set_quotation_duration_override', { p_quotation_id: quotationId, p_min: overrideMin, p_max: overrideMax, p_note: overrideNote.trim() || null, p_clear: false });
      if (overrideError) throw overrideError;
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuotation || quotationItems.length === 0) { setError('Add at least one catalog item before saving.'); return; }
    if ((overrideMin == null) !== (overrideMax == null) || (overrideMin != null && (overrideMin <= 0 || overrideMax == null || overrideMax < overrideMin))) { setError('Admin-confirmed delivery duration must contain a valid minimum and maximum business-day range.'); return; }
    const requestedStatus = editingQuotation.status || 'Draft';
    if (requestedStatus === 'Sent' && confirmedTimeline.requiresAssessment) { setError('Confirm the estimated project delivery timeline before sending this quotation.'); return; }

    setIsSaving(true); setError('');
    try {
      // A new/delivered transition is saved in two protected steps so item snapshots exist before the server validates Sent.
      const needsDeferredSend = isAdmin && requestedStatus === 'Sent';
      const safeQuote = needsDeferredSend ? { ...editingQuotation, status: editingQuotation.id ? ('Approved' as QuotationStatus) : ('Draft' as QuotationStatus) } : editingQuotation;
      const result = editingQuotation.id
        ? await salesService.updateQuotation(editingQuotation.id, safeQuote, quotationItems)
        : await salesService.createQuotation(safeQuote, quotationItems);
      if (result.error) throw result.error;
      const quotationId = result.data?.id;
      if (!quotationId) throw new Error('Quotation was saved but its identifier was not returned.');

      await applyAdminOverride(quotationId);

      if (needsDeferredSend) {
        const sendResult = await salesService.updateQuotation(quotationId, { status: 'Sent' });
        if (sendResult.error) throw sendResult.error;
      }

      await fetchInitialData(); setIsModalOpen(false); setEditingQuotation(null);
    } catch (err: any) { setError(err?.message || 'Failed to save quotation.'); }
    finally { setIsSaving(false); }
  };

  const filteredQuotations = useMemo(() => quotations.filter(q =>
    (activeStatusTab === 'All' || q.status === activeStatusTab)
    && (q.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || q.quotationNumber.toLowerCase().includes(searchQuery.toLowerCase()))
    && (isAdmin || q.salespersonId === user?.id)
  ), [quotations, activeStatusTab, searchQuery, isAdmin, user?.id]);

  const statusClass = (status: QuotationStatus) => status === 'Draft' ? 'bg-slate-100 text-slate-600 border-slate-200' : status === 'Ready for Approval' ? 'bg-amber-50 text-amber-700 border-amber-200' : status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : status === 'Sent' ? 'bg-blue-50 text-blue-700 border-blue-200' : status === 'Accepted' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : status === 'Rejected' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-100 text-slate-500 border-slate-200';

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><h1 className="text-2xl font-bold text-slate-900">Quotation Management</h1><p className="mt-1 text-sm text-slate-500">Create and track catalog-driven quotations with protected pricing, payment and delivery timeline snapshots.</p></div><button onClick={handleCreateQuotation} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" />New Quotation</button></div>
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div className="flex gap-1 overflow-x-auto pb-1">{['All', ...QUOTATION_STATUSES].map(status => <button key={status} onClick={() => setActiveStatusTab(status as any)} className={`whitespace-nowrap rounded-xl border px-4 py-2 text-xs font-bold ${activeStatusTab === status ? 'border-[#000080] bg-[#000080] text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{status}</button>)}</div><div className="relative min-w-[240px]"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search quotes..." className="w-full rounded-xl border border-slate-200 py-2 pl-10 pr-4 text-sm" /></div></div>

    {loading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div> : filteredQuotations.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white py-20 text-center"><Receipt className="mx-auto h-8 w-8 text-slate-300" /><h3 className="mt-4 text-lg font-bold">No quotations found</h3></div> : <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[1000px] text-left"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-500"><tr><th className="px-6 py-4">Number</th><th className="px-6 py-4">Customer</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Timeline</th><th className="px-6 py-4">Total</th><th className="px-6 py-4">Valid Until</th><th className="px-6 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredQuotations.map(q => { const timeline = q as any; return <tr key={q.id} className="hover:bg-slate-50"><td className="px-6 py-4"><div className="text-sm font-bold text-[#000080]">{q.quotationNumber}</div><div className="text-[10px] text-slate-400">{format(new Date(q.createdAt), 'MMM d, yyyy')}</div></td><td className="px-6 py-4"><div className="text-sm font-bold">{q.customerName}</div><div className="text-[10px] text-slate-500">{q.email || ''}</div></td><td className="px-6 py-4"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(q.status)}`}>{q.status}</span></td><td className="px-6 py-4"><div className={`text-xs font-bold ${timeline.durationRequiresAssessment ? 'text-amber-700' : 'text-slate-700'}`}>{timeline.durationRequiresAssessment ? 'Confirmation required' : timeline.estimatedDurationMin == null ? 'No project extension' : rangeText(timeline.estimatedDurationMin, timeline.estimatedDurationMax)}</div></td><td className="px-6 py-4"><div className="text-sm font-bold">{money(q.total, q.currency)}</div></td><td className="px-6 py-4"><div className="inline-flex items-center gap-1.5 text-xs text-slate-600"><Clock className="h-3.5 w-3.5" />{q.validUntil ? format(new Date(q.validUntil), 'MMM d, yyyy') : 'No expiry'}</div></td><td className="px-6 py-4"><div className="flex justify-end gap-2"><button onClick={() => void handleDuplicate(q.id)} title="Duplicate" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><Copy className="h-4 w-4" /></button><button onClick={() => void handleEditQuotation(q)} title="Edit" className="rounded-xl p-2 text-[#000080] hover:bg-blue-50"><Edit2 className="h-4 w-4" /></button><button onClick={async () => { const { data } = await salesService.getQuotationById(q.id); if (data) setShowPreview(data as any); }} title="Preview" className="rounded-xl bg-slate-100 p-2 text-slate-700"><Printer className="h-4 w-4" /></button>{q.status === 'Accepted' && onNavigate && <button onClick={() => onNavigate('payments', { quotationId: q.id })} title="Create Payment Request" className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><Receipt className="h-4 w-4" /></button>}</div></td></tr>; })}</tbody></table></div>}

    {isModalOpen && editingQuotation && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-8 py-5"><div><h2 className="text-lg font-bold">{editingQuotation.id ? `Edit ${editingQuotation.quotationNumber}` : 'Create New Quotation'}</h2><p className="text-xs text-slate-500">Catalog pricing and timing are snapshotted server-side before customer delivery.</p></div><button onClick={() => setIsModalOpen(false)} className="rounded-full p-2 hover:bg-slate-200"><X className="h-5 w-5" /></button></div><div className="flex-1 overflow-y-auto"><form id="quotationForm" onSubmit={handleSave} className="space-y-8 p-8">
      <div className="grid gap-6 md:grid-cols-3"><div className="space-y-4"><h3 className="flex items-center gap-2 border-b border-blue-100 pb-2 text-xs font-black uppercase tracking-widest text-[#000080]"><User className="h-4 w-4" />Customer Info</h3><Field label="Customer / Company"><input required value={editingQuotation.customerName || ''} onChange={e => setEditingQuotation({ ...editingQuotation, customerName: e.target.value })} /></Field><Field label="Email"><input type="email" value={editingQuotation.email || ''} onChange={e => setEditingQuotation({ ...editingQuotation, email: e.target.value })} /></Field><Field label="Opportunity Link"><select value={editingQuotation.opportunityId || ''} disabled={editingQuotation.status !== 'Draft' && !isAdmin} onChange={e => { const opp = opportunities.find(o => o.id === e.target.value); setEditingQuotation({ ...editingQuotation, opportunityId: e.target.value || undefined, customerName: opp ? (opp.companyName || opp.name) : editingQuotation.customerName, email: opp?.email || editingQuotation.email, phone: opp?.phone || editingQuotation.phone, country: opp?.country || editingQuotation.country }); }}><option value="">No CRM link</option>{opportunities.map(opp => <option key={opp.id} value={opp.id}>{opp.companyName || opp.name} ({opp.stage})</option>)}</select></Field></div>
      <div className="space-y-4 md:col-span-2"><div className="flex items-center justify-between border-b border-slate-100 pb-2"><h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#000080]"><Package className="h-4 w-4" />Quotation Items</h3><div className="group relative"><button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#000080]"><Plus className="h-3.5 w-3.5" />Add from Catalog<ChevronDown className="h-3 w-3" /></button><div className="absolute right-0 top-full z-20 mt-1 hidden max-h-96 w-96 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl group-hover:block">{products.map(product => <button key={product.id} type="button" onClick={() => addItem(product)} className="w-full rounded-xl p-3 text-left hover:bg-slate-50"><div className="text-xs font-bold">{product.name}</div><div className="mt-1 text-[10px] text-slate-500">{money(product.basePrice, product.currency)} · {product.code}</div><div className={`mt-1 text-[10px] font-bold ${productDuration(product).impact === 'assessment_required' ? 'text-amber-700' : 'text-[#000080]'}`}>{productDurationText(product)}</div></button>)}</div></div></div>
      {quotationItems.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-xs font-bold uppercase tracking-wider text-slate-400">Select items from the live Sales Catalog</div> : <div className="space-y-3">{quotationItems.map((item, index) => <div key={item.id || index} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start gap-3"><div className="flex-1"><input value={item.productNameSnapshot || ''} onChange={e => updateItem(index, { productNameSnapshot: e.target.value })} className="w-full border-0 p-0 text-sm font-bold outline-none" /><textarea value={item.descriptionSnapshot || ''} onChange={e => updateItem(index, { descriptionSnapshot: e.target.value })} className="mt-2 h-12 w-full resize-none border-0 p-0 text-xs text-slate-500 outline-none" /><div className="mt-2 inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold text-[#000080]"><Clock className="h-3 w-3" />{itemTimelineText(item)}</div><div className="mt-3 flex flex-wrap items-center gap-4"><label className="text-[10px] font-bold uppercase text-slate-400">Qty <input type="number" min="1" value={item.quantity || 1} onChange={e => updateItem(index, { quantity: Number(e.target.value) || 1 })} className="ml-1 w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs" /></label><label className="text-[10px] font-bold uppercase text-slate-400">Price <input type="number" value={item.unitPrice || 0} disabled={!isAdmin && (item as any)._priceMode === 'fixed'} onChange={e => updateItem(index, { unitPrice: Number(e.target.value) || 0 })} className="ml-1 w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50" /></label><div className="ml-auto text-sm font-black">{money(item.lineTotal || 0, editingQuotation.currency || 'USD')}</div></div></div><button type="button" onClick={() => removeItem(index)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button></div></div>)}</div>}</div></div>

      <section className={`rounded-3xl border p-5 ${confirmedTimeline.requiresAssessment ? 'border-amber-200 bg-amber-50' : 'border-blue-100 bg-blue-50/40'}`}><div className="flex items-start gap-3"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white ${confirmedTimeline.requiresAssessment ? 'text-amber-700' : 'text-[#000080]'}`}>{confirmedTimeline.requiresAssessment ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}</div><div className="flex-1"><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Estimated Project Timeline</div><div className="mt-1 text-sm font-black text-slate-900">{confirmedTimeline.text}</div><p className="mt-1 text-[10px] leading-4 text-slate-500">Calculated from the base package, additive add-ons, parallel work and quantities. The server recalculates and snapshots the same rules.</p></div></div>
        {isAdmin && <div className="mt-4 border-t border-amber-100 pt-4"><div className="text-[10px] font-black uppercase tracking-wider text-[#000080]">Admin timeline confirmation / custom scope override</div><div className="mt-3 grid gap-3 md:grid-cols-[160px_160px_1fr]"><Field label="Minimum Days"><input type="number" min="1" value={overrideMin ?? ''} onChange={e => setOverrideMin(e.target.value === '' ? null : Number(e.target.value))} placeholder="e.g. 25" /></Field><Field label="Maximum Days"><input type="number" min="1" value={overrideMax ?? ''} onChange={e => setOverrideMax(e.target.value === '' ? null : Number(e.target.value))} placeholder="e.g. 33" /></Field><Field label="Confirmation Note"><input value={overrideNote} onChange={e => setOverrideNote(e.target.value)} placeholder="Optional dependency or scope note" /></Field></div><p className="mt-2 text-[10px] text-slate-500">Use this only after assessing custom or exceptional scope. It overrides the catalog calculation for this quotation and is protected after customer delivery.</p></div>}
      </section>

      <div className="grid gap-6 border-t border-slate-100 pt-6 md:grid-cols-2"><div className="space-y-4"><Field label="Scope Summary"><textarea rows={4} value={editingQuotation.scopeSummary || ''} onChange={e => setEditingQuotation({ ...editingQuotation, scopeSummary: e.target.value })} /></Field><Field label="Internal Notes"><textarea rows={3} value={editingQuotation.internalNotes || ''} onChange={e => setEditingQuotation({ ...editingQuotation, internalNotes: e.target.value })} /></Field></div><div className="space-y-5 rounded-3xl border border-blue-100 bg-blue-50/40 p-6"><div className="flex justify-between text-sm font-bold text-slate-500"><span>Subtotal</span><span>{money(editingQuotation.subtotal || 0, editingQuotation.currency || 'USD')}</span></div><div className="flex justify-between border-t border-blue-100 pt-4 text-2xl font-black"><span>Total</span><span>{money(editingQuotation.total || 0, editingQuotation.currency || 'USD')}</span></div><div className="grid grid-cols-2 gap-3"><Field label="Valid Until"><input type="date" value={editingQuotation.validUntil || ''} onChange={e => setEditingQuotation({ ...editingQuotation, validUntil: e.target.value })} /></Field><Field label="Status"><select value={editingQuotation.status || 'Draft'} onChange={e => { const status = e.target.value as QuotationStatus; if (status === 'Approved' && !isAdmin) { setError('Only Administrators can approve quotations.'); return; } if (status === 'Sent' && editingQuotation.status !== 'Approved' && !isAdmin) { setError('Quotation must be Approved before it can be marked Sent.'); return; } setEditingQuotation({ ...editingQuotation, status }); }}>{QUOTATION_STATUSES.map(status => <option key={status}>{status}</option>)}</select></Field></div></div></div>
    </form></div><div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-8 py-5"><div className="flex items-center gap-2 text-xs text-slate-500"><Info className="h-4 w-4" />Pricing, expectations and delivery timing are validated server-side.</div><div className="flex gap-2"><button onClick={() => setIsModalOpen(false)} className="rounded-xl px-5 py-2.5 text-xs font-bold text-slate-500">Cancel</button><button type="submit" form="quotationForm" disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-6 py-2.5 text-xs font-bold text-white disabled:opacity-50">{isSaving && <Loader2 className="h-4 w-4 animate-spin" />}{editingQuotation.id ? 'Update Quote' : 'Create Quote'}</button></div></div></div></div>}

    {showPreview && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"><div className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-4"><div className="font-mono text-xs font-bold text-[#000080]">{showPreview.quotationNumber}</div><div className="flex gap-2"><button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2 text-xs font-bold text-white"><Printer className="h-4 w-4" />Print PDF</button><button onClick={() => setShowPreview(null)} className="rounded-full p-2 hover:bg-slate-200"><X className="h-5 w-5" /></button></div></div><div id="quotation-print-area" className="flex-1 overflow-y-auto p-8 sm:p-12"><div className="mx-auto max-w-3xl space-y-8"><div className="flex justify-between"><div><div className="text-2xl font-black text-[#000080]">ProFox Digital</div><div className="mt-2 text-xs text-slate-500">www.profoxwebdesigner.com</div></div><div className="text-right"><h1 className="text-3xl font-black uppercase">Quotation</h1><div className="mt-1 font-mono text-[#000080]">{showPreview.quotationNumber}</div></div></div><div className="grid gap-6 border-t border-slate-100 pt-6 sm:grid-cols-2"><div><div className="text-[10px] font-black uppercase text-[#000080]">Quote For</div><div className="mt-2 text-lg font-black">{showPreview.customerName}</div>{showPreview.email && <div className="mt-1 flex items-center gap-2 text-sm text-slate-600"><Mail className="h-3.5 w-3.5" />{showPreview.email}</div>}</div><div className="sm:text-right"><div className="text-xs font-bold text-slate-500">Valid Until: {showPreview.validUntil ? format(new Date(showPreview.validUntil), 'MMMM d, yyyy') : 'N/A'}</div></div></div><div className="overflow-hidden rounded-2xl border border-slate-200"><table className="w-full text-sm"><thead className="bg-slate-900 text-left text-[10px] uppercase text-white"><tr><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-center">Qty</th><th className="px-4 py-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-slate-100">{showPreview.quotation_items?.map((item, index) => <tr key={item.id || index}><td className="px-4 py-4"><div className="font-bold">{item.productNameSnapshot}</div><div className="mt-1 text-xs text-slate-500">{item.descriptionSnapshot}</div><div className="mt-1 text-[10px] font-bold text-[#000080]">{itemTimelineText(item)}</div></td><td className="px-4 py-4 text-center">{item.quantity}</td><td className="px-4 py-4 text-right font-black">{money(item.lineTotal, showPreview.currency)}</td></tr>)}</tbody></table></div><div className="ml-auto max-w-sm rounded-2xl bg-slate-900 p-5 text-white"><div className="flex justify-between text-lg font-black"><span>Total</span><span>{money(showPreview.total, showPreview.currency)}</span></div></div>{(showPreview as any).durationSnapshotText && <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6"><div className="text-[10px] font-black uppercase text-[#000080]">Estimated Project Timeline</div><p className="mt-3 text-sm font-bold leading-6 text-slate-700">{(showPreview as any).durationSnapshotText}</p></div>}{showPreview.scopeSummary && <div className="rounded-2xl bg-slate-50 p-6"><div className="text-[10px] font-black uppercase text-[#000080]">Scope Summary</div><p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{showPreview.scopeSummary}</p></div>}</div></div></div></div>}
  </div>;
}

function productDurationText(product: SalesProduct) {
  const duration = productDuration(product);
  if (duration.impact === 'assessment_required') return 'Timeline assessment required';
  if (product.productType === 'care_plan' && duration.impact === 'parallel' && duration.min == null) return 'Ongoing · no project delivery extension';
  if (duration.min == null || duration.max == null) return 'Timeline not configured';
  const range = rangeText(duration.min, duration.max);
  if (duration.impact === 'additive') return `Adds ${range}`;
  if (duration.impact === 'parallel') return `${range} · parallel`;
  return `Base ${range}`;
}

function Field({ label, children }: { label: string; children: React.ReactElement<any> }) {
  return <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}{React.cloneElement<any>(children, { className: `mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#000080] ${(children.props as any).className || ''}` })}</label>;
}

function money(value: number, currency = 'USD') {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0)); }
  catch { return `$${Number(value || 0).toFixed(2)}`; }
}
