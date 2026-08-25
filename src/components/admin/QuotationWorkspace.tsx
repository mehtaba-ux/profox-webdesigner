import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown, ChevronUp, Clock3, Copy, FilePlus2, GripVertical, Info, Loader2, Mail, PackagePlus, Plus, Printer, Save, Search, Send, Settings2, Sparkles, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../lib/AuthContext';
import { crmService } from '../../lib/crmService';
import { salesService } from '../../lib/salesService';
import { CpqDraft, CpqLine, quotationCpqService } from '../../lib/quotationCpqService';
import QuotationProposal from '../quotation/QuotationProposal';
import type { CRMOpportunity, SalesProduct } from '../../types';

const blankLine = (type: 'custom' | 'section' | 'note', order: number): CpqLine => ({
  productCodeSnapshot: type === 'section' ? 'SECTION' : type === 'note' ? 'NOTE' : 'CUSTOM',
  productNameSnapshot: type === 'section' ? 'New Section' : type === 'note' ? 'Note' : 'Custom Service',
  descriptionSnapshot: '', quantity: 1, unitPrice: 0, itemType: 'custom', sortOrder: order,
  lineType: type, discountType: 'none', discountValue: 0, optionalForClient: false, configurationSnapshot: {}
});

function daysFromNow(days: number) {
  return format(new Date(Date.now() + days * 86400000), 'yyyy-MM-dd');
}

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0)); }
  catch { return `${currency} ${Number(value || 0).toFixed(2)}`; }
}

function productDuration(product: any) {
  const min = product.deliveryDurationMin == null ? null : Number(product.deliveryDurationMin);
  const max = product.deliveryDurationMax == null ? null : Number(product.deliveryDurationMax);
  if (product.productType === 'care_plan' && product.timelineImpact === 'parallel' && min == null) return 'Ongoing · no delivery extension';
  if (product.timelineImpact === 'assessment_required' || min == null || max == null) return 'Assessment required';
  const range = min === max ? `${min} days` : `${min}–${max} days`;
  return product.timelineImpact === 'additive' ? `Adds ${range}` : product.timelineImpact === 'parallel' ? `${range} parallel` : `Base ${range}`;
}

function lineGross(line: CpqLine) { return Math.max(0, Number(line.quantity || 1) * Number(line.unitPrice || 0)); }
function lineDiscountAmount(line: CpqLine) {
  const gross = lineGross(line);
  if (line.discountType === 'percent') return Math.min(gross, gross * Math.max(0, Number(line.discountValue || 0)) / 100);
  if (line.discountType === 'fixed') return Math.min(gross, Math.max(0, Number(line.discountValue || 0)));
  return 0;
}
function lineNet(line: CpqLine) { return Math.max(0, lineGross(line) - lineDiscountAmount(line)); }

export default function QuotationWorkspace() {
  const { quotationId } = useParams<{ quotationId: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const isNew = !quotationId || quotationId === 'new';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'unsaved' | 'saving'>('saved');
  const [error, setError] = useState('');
  const [products, setProducts] = useState<SalesProduct[]>([]);
  const [opportunities, setOpportunities] = useState<CRMOpportunity[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [summary, setSummary] = useState<any>(null);
  const [draft, setDraft] = useState<CpqDraft>({ customerName: '', currency: 'USD', status: 'Draft', salespersonId: user?.id, validUntil: daysFromNow(30), quoteDiscountType: 'none', quoteDiscountValue: 0, taxRate: 0 });
  const [lines, setLines] = useState<CpqLine[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogType, setCatalogType] = useState('all');
  const [catalogCategory, setCatalogCategory] = useState('all');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendCc, setSendCc] = useState('');
  const [sendSubject, setSendSubject] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [activePanel, setActivePanel] = useState<'scope'|'proposal'|'payment'>('scope');
  const draggedIndex = useRef<number | null>(null);
  const autosaveTimer = useRef<number | null>(null);
  const initialized = useRef(false);

  const currentId = draft.id || (!isNew ? quotationId : undefined);
  const locked = ['Sent','Accepted','Rejected','Expired','Cancelled'].includes(draft.status) || Boolean(draft.supersededById);

  const loadSummary = async (id: string) => {
    const { data, error: summaryError } = await quotationCpqService.getSummary(id);
    if (!summaryError) setSummary(data);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError('');
      try {
        const [productRes, opportunityRows, settingRes] = await Promise.all([
          salesService.getActiveProducts(), crmService.getOpportunities(), quotationCpqService.getSettings()
        ]);
        if (productRes.error) throw productRes.error;
        if (settingRes.error) throw settingRes.error;
        if (cancelled) return;
        setProducts(productRes.data || []);
        setOpportunities((opportunityRows || []).filter((o: CRMOpportunity) => isAdmin || o.salespersonId === user?.id));
        const cfg = settingRes.data || {};
        setSettings(cfg);
        if (isNew) {
          setDraft(prev => ({ ...prev,
            salespersonId: user?.id,
            validUntil: daysFromNow(Number(cfg.defaultValidityDays || 30)),
            proposalTitle: cfg.defaultProposalTitle || 'Digital Project Proposal',
            coverMessage: cfg.defaultCoverMessage || '',
            termsAndConditions: cfg.standardTerms || '',
            taxRate: Number(cfg.taxRate || 0)
          }));
        } else if (quotationId) {
          const workspace = await quotationCpqService.getWorkspace(quotationId);
          if (workspace.error || !workspace.data) throw workspace.error || new Error('Quotation not found.');
          setDraft(workspace.data.quotation);
          setLines(workspace.data.lines);
          await loadSummary(quotationId);
        }
        initialized.current = true;
      } catch (err: any) { if (!cancelled) setError(err?.message || 'Failed to load quotation workspace.'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [quotationId, isNew, isAdmin, user?.id]);

  const markDirty = () => { if (initialized.current && !locked) setSaveState('unsaved'); };
  const updateDraft = (updates: Partial<CpqDraft>) => { setDraft(prev => ({ ...prev, ...updates })); markDirty(); };
  const setLineState = (next: CpqLine[]) => { setLines(next.map((line,index) => ({ ...line, sortOrder: index * 10 }))); markDirty(); };

  const categories = useMemo(() => [...new Set(products.map((p: any) => p.category).filter(Boolean))].sort(), [products]);
  const filteredProducts = useMemo(() => products.filter((product: any) => {
    const query = catalogSearch.trim().toLowerCase();
    return (catalogType === 'all' || product.productType === catalogType)
      && (catalogCategory === 'all' || product.category === catalogCategory)
      && (!query || `${product.name} ${product.code} ${product.shortDescription || ''} ${product.category || ''}`.toLowerCase().includes(query));
  }), [products, catalogSearch, catalogType, catalogCategory]);

  const addProduct = (product: any, optional = false) => {
    const next: CpqLine = {
      salesProductId: product.id,
      productCodeSnapshot: product.code,
      productNameSnapshot: product.name,
      descriptionSnapshot: product.shortDescription || product.fullDescription || '',
      quantity: 1,
      unitPrice: Number(product.basePrice || 0),
      itemType: product.productType,
      sortOrder: lines.length * 10,
      lineType: 'product', discountType: 'none', discountValue: 0,
      optionalForClient: optional,
      configurationSnapshot: {},
      durationMinSnapshot: product.deliveryDurationMin ?? null,
      durationMaxSnapshot: product.deliveryDurationMax ?? null,
      durationUnitSnapshot: product.deliveryDurationUnit || 'business_days',
      timelineImpactSnapshot: product.timelineImpact || 'assessment_required',
      durationNoteSnapshot: product.deliveryDurationNote || '',
      managerApprovalRequired: Boolean(product.managerApprovalRequired),
      priceMode: product.priceMode
    };
    setLineState([...lines, next]);
  };

  const addUtilityLine = (type: 'custom'|'section'|'note') => setLineState([...lines, blankLine(type, lines.length * 10)]);
  const updateLine = (index: number, changes: Partial<CpqLine>) => setLineState(lines.map((line,i) => i === index ? { ...line, ...changes } : line));
  const removeLine = (index: number) => setLineState(lines.filter((_,i) => i !== index));
  const duplicateLine = (index: number) => { const clone = { ...lines[index], id: undefined, productNameSnapshot: `${lines[index].productNameSnapshot}` }; setLineState([...lines.slice(0,index+1), clone, ...lines.slice(index+1)]); };
  const moveLine = (index: number, direction: -1|1) => { const target = index + direction; if (target < 0 || target >= lines.length) return; const next = [...lines]; [next[index],next[target]]=[next[target],next[index]]; setLineState(next); };
  const dropLine = (target: number) => { const from = draggedIndex.current; draggedIndex.current = null; if (from == null || from === target) return; const next=[...lines]; const [moved]=next.splice(from,1); next.splice(target,0,moved); setLineState(next); };

  const localTotals = useMemo(() => {
    const commercial = lines.filter(line => ['product','custom'].includes(line.lineType));
    const committed = commercial.filter(line => !line.optionalForClient);
    const subtotal = committed.reduce((sum,line)=>sum+lineGross(line),0);
    const lineDiscount = committed.reduce((sum,line)=>sum+lineDiscountAmount(line),0);
    const net = committed.reduce((sum,line)=>sum+lineNet(line),0);
    const optionalTotal = commercial.filter(line=>line.optionalForClient).reduce((sum,line)=>sum+lineNet(line),0);
    const quoteDiscount = draft.quoteDiscountType === 'percent' ? net * Math.min(100,Math.max(0,Number(draft.quoteDiscountValue||0))) / 100 : draft.quoteDiscountType === 'fixed' ? Math.min(net,Math.max(0,Number(draft.quoteDiscountValue||0))) : 0;
    const tax = Math.max(0,net-quoteDiscount) * Math.max(0,Number(draft.taxRate||0)) / 100;
    return { subtotal,lineDiscount,quoteDiscount,optionalTotal,tax,total:Math.max(0,net-quoteDiscount)+tax };
  }, [lines,draft.quoteDiscountType,draft.quoteDiscountValue,draft.taxRate]);

  const save = async (options?: { quiet?: boolean; status?: string }) => {
    if (locked) return currentId;
    if (!draft.salespersonId) throw new Error('A salesperson is required.');
    setSaving(true); setSaveState('saving'); setError('');
    try {
      let id = currentId;
      const payload = { ...draft, status: options?.status || draft.status || 'Draft' };
      if (!id) {
        const created = await quotationCpqService.createDraft(payload, lines);
        if (created.error || !created.data?.id) throw created.error || new Error('Quotation could not be created.');
        id = created.data.id;
        const workspace = await quotationCpqService.getWorkspace(id);
        if (workspace.data) { setDraft(workspace.data.quotation); setLines(workspace.data.lines); }
        navigate(`/admin/quotations/${id}`, { replace: true });
      } else {
        const saved = await quotationCpqService.saveDraft(id, payload, lines);
        if (saved.error) throw saved.error;
        const workspace = await quotationCpqService.getWorkspace(id);
        if (workspace.data) { setDraft(workspace.data.quotation); setLines(workspace.data.lines); }
      }
      await loadSummary(id);
      setSaveState('saved');
      return id;
    } catch (err: any) { setSaveState('unsaved'); setError(err?.message || 'Failed to save quotation.'); throw err; }
    finally { setSaving(false); }
  };

  useEffect(() => {
    if (!initialized.current || saveState !== 'unsaved' || !currentId || locked) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => { void save({ quiet: true }); }, 1100);
    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current); };
  }, [saveState, currentId, draft, lines, locked]);

  const onOpportunityChange = (id: string) => {
    const opportunity = opportunities.find(o => o.id === id);
    if (!opportunity) { updateDraft({ opportunityId: null }); return; }
    updateDraft({ opportunityId: opportunity.id, customerName: opportunity.companyName || opportunity.name, contactName: opportunity.contactName || '', email: opportunity.email || '', phone: opportunity.phone || '', country: opportunity.country || '', currency: opportunity.currency || 'USD', salespersonId: opportunity.salespersonId || user?.id });
  };

  const applyTemplate = (key: string) => {
    const template = (settings.templates || []).find((item: any) => item.key === key);
    if (!template) { updateDraft({ quotationTemplateKey: key }); return; }
    updateDraft({ quotationTemplateKey: key, proposalTitle: template.proposalTitle || draft.proposalTitle, coverMessage: template.coverMessage ?? draft.coverMessage, termsAndConditions: template.defaultTerms ?? draft.termsAndConditions });
    const existingCodes = new Set(lines.map(line=>line.productCodeSnapshot));
    const defaultCodes = Array.isArray(template.defaultProductCodes) ? template.defaultProductCodes : [];
    const optionalCodes = Array.isArray(template.optionalProductCodes) ? template.optionalProductCodes : [];
    let next = [...lines];
    [...defaultCodes,...optionalCodes].forEach((code:string) => {
      if (existingCodes.has(code)) return;
      const product:any = products.find((p:any)=>p.code===code);
      if (!product) return;
      next.push({ salesProductId:product.id,productCodeSnapshot:product.code,productNameSnapshot:product.name,descriptionSnapshot:product.shortDescription||'',quantity:1,unitPrice:Number(product.basePrice||0),itemType:product.productType,sortOrder:next.length*10,lineType:'product',discountType:'none',discountValue:0,optionalForClient:optionalCodes.includes(code),configurationSnapshot:{},durationMinSnapshot:product.deliveryDurationMin??null,durationMaxSnapshot:product.deliveryDurationMax??null,durationUnitSnapshot:product.deliveryDurationUnit||'business_days',timelineImpactSnapshot:product.timelineImpact||'assessment_required',durationNoteSnapshot:product.deliveryDurationNote||'',managerApprovalRequired:Boolean(product.managerApprovalRequired),priceMode:product.priceMode });
      existingCodes.add(code);
    });
    if (next.length !== lines.length) setLineState(next);
  };

  const requestApproval = async () => {
    try {
      const id = await save(); if (!id) return;
      const result = await quotationCpqService.requestApproval(id, draft, lines);
      if (result.error) throw result.error;
      const workspace = await quotationCpqService.getWorkspace(id); if (workspace.data) setDraft(workspace.data.quotation);
      await loadSummary(id); setSaveState('saved');
    } catch (err:any) { setError(err?.message || 'Could not request approval.'); }
  };
  const approve = async () => { if (!currentId) return; const result=await quotationCpqService.approve(currentId); if(result.error){setError(result.error.message);return;} const workspace=await quotationCpqService.getWorkspace(currentId); if(workspace.data)setDraft(workspace.data.quotation); await loadSummary(currentId); };
  const duplicate = async () => { if(!currentId)return; const result=await quotationCpqService.duplicate(currentId); if(result.error){setError(result.error.message);return;} navigate(`/admin/quotations/${String(result.data)}`); };
  const revision = async () => { if(!currentId)return; const result=await quotationCpqService.createRevision(currentId); if(result.error){setError(result.error.message);return;} navigate(`/admin/quotations/${String(result.data)}`); };
  const openPreview = async () => { try { const id=await save(); if(!id)return; await loadSummary(id); setPreviewOpen(true); } catch {} };
  const openSend = async () => { try { const id=await save(); if(!id)return; await loadSummary(id); setSendSubject(`Your ProFox proposal is ready: ${draft.quotationNumber || ''}`); setSendMessage('Thank you for the opportunity to prepare this proposal. Please review the scope, investment, timeline and payment plan using the secure link.'); setSendOpen(true); } catch {} };
  const send = async () => { if(!currentId)return; const cc=sendCc.split(',').map(v=>v.trim()).filter(Boolean); const result=await quotationCpqService.send(currentId,draft.email||'',cc,sendSubject,sendMessage); if(result.error){setError(result.error.message);return;} setSummary(result.data); const workspace=await quotationCpqService.getWorkspace(currentId); if(workspace.data)setDraft(workspace.data.quotation); setSendOpen(false); };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;

  const readiness = summary?.readiness;
  const presentation = summary?.presentation;
  const paymentSchedule = presentation?.paymentPlan?.schedule || [];
  const approvalReasons: string[] = summary?.approval?.reasons || [];

  return <div className="min-h-screen bg-slate-50 pb-16">
    <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-7">
        <div className="flex min-w-0 items-center gap-3"><button onClick={()=>navigate('/admin/app/sales?tab=quotations')} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-base font-black">{draft.quotationNumber || 'New Quotation'}</h1>{Number(draft.revisionNumber||1)>1&&<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold">Revision {draft.revisionNumber}</span>}<span className="rounded-full bg-[#000080]/10 px-2 py-0.5 text-[10px] font-extrabold text-[#000080]">{draft.status}</span></div><p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">{saveState==='saving'?<><Loader2 className="h-3 w-3 animate-spin"/>Saving securely…</>:saveState==='unsaved'?<><Info className="h-3 w-3"/>Unsaved changes</>:<><Check className="h-3 w-3 text-emerald-600"/>Saved</>}</p></div></div>
        <div className="flex flex-wrap items-center gap-2">{currentId&&<button onClick={duplicate} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"><Copy className="mr-1.5 inline h-3.5 w-3.5"/>Duplicate</button>}{currentId&&['Sent','Rejected','Expired'].includes(draft.status)&&!draft.supersededById&&<button onClick={revision} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"><FilePlus2 className="mr-1.5 inline h-3.5 w-3.5"/>Create Revision</button>}<button onClick={openPreview} disabled={saving} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"><Printer className="mr-1.5 inline h-3.5 w-3.5"/>Preview</button>{isAdmin&&<button onClick={()=>navigate('/admin/quotation-settings')} className="rounded-xl border border-slate-200 p-2" title="Quotation settings"><Settings2 className="h-4 w-4"/></button>}{!locked&&<button onClick={()=>void save()} disabled={saving} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"><Save className="mr-1.5 inline h-3.5 w-3.5"/>Save Draft</button>}{draft.status==='Draft'&&<button onClick={requestApproval} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-extrabold text-white">Request Approval</button>}{isAdmin&&draft.status==='Ready for Approval'&&<button onClick={approve} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white">Approve</button>}{draft.status==='Approved'&&<button onClick={openSend} className="rounded-xl bg-[#000080] px-4 py-2 text-xs font-extrabold text-white"><Send className="mr-1.5 inline h-3.5 w-3.5"/>Send Quotation</button>}</div>
      </div>
    </div>

    <div className="mx-auto grid max-w-[1800px] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-7">
      <main className="space-y-5">
        {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
        {locked&&<div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800">This quotation is locked to protect customer-visible commercial history. Create a revision for material changes.</div>}
        {draft.supersededById&&<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">This revision is superseded. Open the current revision before sending or accepting changes.</div>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row"><label className="flex-1"><span className="mb-1.5 block text-xs font-bold text-slate-600">CRM Opportunity</span><select disabled={locked} value={draft.opportunityId||''} onChange={e=>onOpportunityChange(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Select opportunity</option>{opportunities.map(o=><option key={o.id} value={o.id}>{o.name} · {o.companyName}</option>)}</select></label><label className="min-w-[230px]"><span className="mb-1.5 block text-xs font-bold text-slate-600">Quotation Template</span><select disabled={locked} value={draft.quotationTemplateKey||''} onChange={e=>applyTemplate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">No template</option>{(settings.templates||[]).map((t:any)=><option key={t.key} value={t.key}>{t.name}</option>)}</select></label></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{[['Customer / Company','customerName'],['Contact','contactName'],['Email','email'],['Phone','phone'],['Country','country']].map(([label,key])=><label key={key}><span className="mb-1 block text-[11px] font-bold text-slate-500">{label}</span><input disabled={locked} value={(draft as any)[key]||''} onChange={e=>updateDraft({[key]:e.target.value} as any)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"/></label>)}<label><span className="mb-1 block text-[11px] font-bold text-slate-500">Currency</span><select disabled={locked} value={draft.currency} onChange={e=>updateDraft({currency:e.target.value})} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">{['USD','EUR','GBP','CAD','AUD','INR'].map(c=><option key={c}>{c}</option>)}</select></label><label><span className="mb-1 block text-[11px] font-bold text-slate-500">Valid Until</span><input disabled={locked} type="date" value={draft.validUntil||''} onChange={e=>updateDraft({validUntil:e.target.value})} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"/></label><label><span className="mb-1 block text-[11px] font-bold text-slate-500">Proposal Title</span><input disabled={locked} value={draft.proposalTitle||''} onChange={e=>updateDraft({proposalTitle:e.target.value})} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"/></label></div>
        </section>

        <div className="flex gap-2 overflow-x-auto">{([['scope','Scope & Pricing'],['proposal','Proposal Content'],['payment','Payment & Delivery']] as const).map(([key,label])=><button key={key} onClick={()=>setActivePanel(key)} className={`rounded-xl px-4 py-2 text-xs font-extrabold ${activePanel===key?'bg-[#000080] text-white':'border border-slate-200 bg-white text-slate-600'}`}>{label}</button>)}</div>

        {activePanel==='scope'&&<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4"><div><h2 className="font-black">Products & Services</h2><p className="text-xs text-slate-500">Catalog facts remain sourced from Sales Catalog. Optional items are excluded from the committed total.</p></div>{!locked&&<div className="flex flex-wrap gap-2"><button onClick={()=>setCatalogOpen(true)} className="rounded-xl bg-[#000080] px-3 py-2 text-xs font-bold text-white"><PackagePlus className="mr-1.5 inline h-3.5 w-3.5"/>Add from Catalog</button><button onClick={()=>addUtilityLine('custom')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"><Plus className="mr-1 inline h-3.5 w-3.5"/>Custom Line</button><button onClick={()=>addUtilityLine('section')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Section</button><button onClick={()=>addUtilityLine('note')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Note</button></div>}</div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="w-10 p-3"></th><th className="p-3">Product / Service</th><th className="w-20 p-3">Qty</th><th className="w-28 p-3">Unit Price</th><th className="w-36 p-3">Discount</th><th className="w-28 p-3 text-right">Amount</th><th className="w-44 p-3">Timeline</th><th className="w-24 p-3">Optional</th><th className="w-32 p-3"></th></tr></thead><tbody>
            {lines.length===0&&<tr><td colSpan={9} className="p-12 text-center text-slate-400"><Sparkles className="mx-auto mb-3 h-7 w-7"/>Add a package or service from the existing Sales Catalog.</td></tr>}
            {lines.map((line,index)=><tr key={line.id||`${line.lineType}-${index}`} draggable={!locked} onDragStart={()=>{draggedIndex.current=index;}} onDragOver={e=>e.preventDefault()} onDrop={()=>dropLine(index)} className={`${line.lineType==='section'?'bg-slate-100':line.lineType==='note'?'bg-amber-50/60':'border-t border-slate-100'} align-top`}><td className="p-3 text-slate-400"><GripVertical className="h-4 w-4"/></td><td className="p-3"><input disabled={locked||line.lineType==='product'} value={line.productNameSnapshot} onChange={e=>updateLine(index,{productNameSnapshot:e.target.value})} className="w-full bg-transparent font-bold outline-none"/>{line.lineType!=='section'&&<textarea disabled={locked} rows={2} value={line.descriptionSnapshot||''} onChange={e=>updateLine(index,{descriptionSnapshot:e.target.value})} className="mt-1 w-full resize-none bg-transparent text-[11px] leading-4 text-slate-500 outline-none"/>}{line.managerApprovalRequired&&<p className="mt-1 text-[10px] font-bold text-amber-700">Manager-controlled catalog item</p>}</td><td className="p-3">{['product','custom'].includes(line.lineType)?<input disabled={locked} type="number" min={1} value={line.quantity} onChange={e=>updateLine(index,{quantity:Math.max(1,Number(e.target.value)||1)})} className="w-full rounded-lg border border-slate-200 px-2 py-1.5"/>:'—'}</td><td className="p-3">{['product','custom'].includes(line.lineType)?<input disabled={locked||Boolean(line.salesProductId&&line.priceMode==='fixed'&&!isAdmin)} type="number" min={0} step="0.01" value={line.unitPrice} onChange={e=>updateLine(index,{unitPrice:Number(e.target.value)||0})} className="w-full rounded-lg border border-slate-200 px-2 py-1.5"/>:'—'}</td><td className="p-3">{['product','custom'].includes(line.lineType)?<div className="flex gap-1"><select disabled={locked} value={line.discountType} onChange={e=>updateLine(index,{discountType:e.target.value as any,discountValue:0})} className="w-20 rounded-lg border border-slate-200 px-1 py-1.5"><option value="none">None</option><option value="percent">%</option><option value="fixed">Fixed</option></select>{line.discountType!=='none'&&<input disabled={locked} type="number" min={0} value={line.discountValue} onChange={e=>updateLine(index,{discountValue:Number(e.target.value)||0})} className="w-16 rounded-lg border border-slate-200 px-2 py-1.5"/>}</div>:'—'}</td><td className="p-3 text-right font-black">{['product','custom'].includes(line.lineType)?money(lineNet(line),draft.currency):'—'}</td><td className="p-3 text-[11px] text-slate-500">{line.lineType==='product'?productDuration({productType:line.itemType,timelineImpact:line.timelineImpactSnapshot,deliveryDurationMin:line.durationMinSnapshot,deliveryDurationMax:line.durationMaxSnapshot}):line.lineType==='custom'?'Requires confirmation':'—'}</td><td className="p-3">{['product','custom'].includes(line.lineType)?<label className="inline-flex items-center gap-1"><input disabled={locked} type="checkbox" checked={line.optionalForClient} onChange={e=>updateLine(index,{optionalForClient:e.target.checked})}/><span className="text-[10px]">Client option</span></label>:'—'}</td><td className="p-3"><div className="flex justify-end gap-1"><button disabled={locked||index===0} onClick={()=>moveLine(index,-1)} className="rounded p-1 hover:bg-slate-100"><ChevronUp className="h-3.5 w-3.5"/></button><button disabled={locked||index===lines.length-1} onClick={()=>moveLine(index,1)} className="rounded p-1 hover:bg-slate-100"><ChevronDown className="h-3.5 w-3.5"/></button><button disabled={locked} onClick={()=>duplicateLine(index)} className="rounded p-1 hover:bg-slate-100"><Copy className="h-3.5 w-3.5"/></button><button disabled={locked} onClick={()=>removeLine(index)} className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5"/></button></div></td></tr>)}
          </tbody></table></div>
          {!locked&&<div className="border-t border-slate-200 p-4"><div className="flex flex-wrap items-center gap-3"><label className="text-xs font-bold text-slate-600">Quotation-level discount</label><select value={draft.quoteDiscountType||'none'} onChange={e=>updateDraft({quoteDiscountType:e.target.value as any,quoteDiscountValue:0})} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"><option value="none">None</option><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select>{draft.quoteDiscountType!=='none'&&<input type="number" min={0} value={draft.quoteDiscountValue||0} onChange={e=>updateDraft({quoteDiscountValue:Number(e.target.value)||0})} className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"/>}<span className="text-[11px] text-slate-500">Server validates configured Sales discount limits and routes approval when required.</span></div></div>}
        </section>}

        {activePanel==='proposal'&&<section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><h2 className="font-black">Customer Proposal Content</h2><p className="text-xs text-slate-500">Only customer-safe proposal content appears publicly. Internal notes never leave the workspace.</p></div>{[['Executive / Project Summary','executiveSummary'],['Scope Summary','scopeSummary'],['Client Responsibilities','clientResponsibilities'],['Delivery Assumptions','deliveryAssumptions'],['Review & Approval Process','reviewProcess'],['Handover / Support','handoverSupport'],['Exclusions','exclusions'],['Terms & Conditions','termsAndConditions']].map(([label,key])=><label key={key} className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span><textarea disabled={locked} rows={key==='executiveSummary'?4:3} value={(draft as any)[key]||''} onChange={e=>updateDraft({[key]:e.target.value} as any)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6"/></label>)}</section>}

        {activePanel==='payment'&&<section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><h2 className="font-black">Payment Plan & Delivery</h2><p className="text-xs text-slate-500">These values are generated from the existing Sales Catalog and server-side resolver. Sales does not calculate milestones manually.</p></div><div className="grid gap-4 md:grid-cols-2"><div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-extrabold uppercase text-[#000080]">Estimated Delivery</p><p className="mt-2 text-lg font-black">{presentation?.durationSnapshotText || 'Save the draft to calculate the authoritative timeline.'}</p></div><div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-extrabold uppercase text-[#000080]">Payment Milestones</p>{paymentSchedule.length?<div className="mt-3 space-y-2">{paymentSchedule.map((m:any)=><div key={m.milestoneNumber} className="flex justify-between gap-3 text-sm"><span>{m.label||m.paymentType} <span className="text-slate-400">({m.percentage}%)</span></span><b>{money(Number(m.amount||0),draft.currency)}</b></div>)}</div>:<p className="mt-2 text-sm text-slate-500">{presentation?.paymentPlan?.error || 'Save the quotation to preview its approved payment schedule.'}</p>}</div></div><label><span className="mb-1.5 block text-xs font-bold text-slate-600">Payment Terms</span><textarea disabled={locked} rows={3} value={draft.paymentTerms||''} onChange={e=>updateDraft({paymentTerms:e.target.value})} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label></section>}
      </main>

      <aside className="lg:sticky lg:top-[86px] lg:self-start"><div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><p className="text-xs font-extrabold uppercase tracking-[0.13em] text-slate-400">Live Quotation Summary</p><div className="mt-3 flex items-end justify-between"><span className="text-sm font-bold">Grand Total</span><span className="text-2xl font-black text-[#000080]">{money(Number(presentation?.total ?? localTotals.total),draft.currency)}</span></div><div className="mt-3 space-y-1.5 text-xs"><div className="flex justify-between text-slate-500"><span>List subtotal</span><span>{money(Number(presentation?.subtotal ?? localTotals.subtotal),draft.currency)}</span></div><div className="flex justify-between text-emerald-700"><span>Discount</span><span>-{money(Number((presentation?.lineDiscountTotal??localTotals.lineDiscount)+(presentation?.quoteDiscountTotal??localTotals.quoteDiscount)),draft.currency)}</span></div>{Number(presentation?.taxTotal ?? localTotals.tax)>0&&<div className="flex justify-between"><span>{presentation?.taxLabel||settings.taxLabel||'Tax'}</span><span>{money(Number(presentation?.taxTotal??localTotals.tax),draft.currency)}</span></div>}<div className="flex justify-between text-slate-500"><span>Optional add-ons</span><span>{money(Number(presentation?.optionalTotal??localTotals.optionalTotal),draft.currency)}</span></div></div></div><div className="border-t border-slate-200 pt-4"><p className="text-[11px] font-extrabold uppercase text-slate-400">Estimated Delivery</p><p className="mt-1 text-sm font-bold">{presentation?.durationSnapshotText || 'Save to calculate'}</p></div><div className="border-t border-slate-200 pt-4"><p className="text-[11px] font-extrabold uppercase text-slate-400">Payment Plan</p>{paymentSchedule.length?<p className="mt-1 text-sm font-bold">{paymentSchedule.length} milestone{paymentSchedule.length===1?'':'s'} · First {money(Number(paymentSchedule[0]?.amount||0),draft.currency)}</p>:<p className="mt-1 text-xs text-slate-500">Not ready yet</p>}</div><div className="border-t border-slate-200 pt-4"><p className="text-[11px] font-extrabold uppercase text-slate-400">Approval</p>{draft.status==='Approved'?<p className="mt-1 flex items-center gap-1 text-sm font-bold text-emerald-700"><Check className="h-4 w-4"/>Ready</p>:approvalReasons.length?<div className="mt-2 space-y-1">{approvalReasons.slice(0,4).map((reason,i)=><p key={i} className="text-[11px] leading-4 text-amber-700">• {reason}</p>)}</div>:<p className="mt-1 text-xs text-slate-500">Save to evaluate approval.</p>}</div><div className="border-t border-slate-200 pt-4"><p className="text-[11px] font-extrabold uppercase text-slate-400">Customer Readiness</p>{readiness?.readyToSend?<p className="mt-1 flex items-center gap-1 text-sm font-bold text-emerald-700"><Check className="h-4 w-4"/>Ready to Send</p>:<div className="mt-2 space-y-1">{(readiness?.missing||['Save the quotation to run readiness checks.']).slice(0,7).map((item:string,i:number)=><p key={i} className="text-[11px] text-slate-500">• {item}</p>)}</div>}</div>{summary?.views&&<div className="border-t border-slate-200 pt-4"><p className="text-[11px] font-extrabold uppercase text-slate-400">Customer Views</p><p className="mt-1 text-sm font-bold">{summary.views.viewCount||0} views</p>{summary.views.firstViewedAt&&<p className="mt-1 text-[10px] text-slate-500">First viewed {new Date(summary.views.firstViewedAt).toLocaleString()}</p>}{summary.views.lastViewedAt&&<p className="text-[10px] text-slate-500">Last viewed {new Date(summary.views.lastViewedAt).toLocaleString()}</p>}</div>}</div></aside>
    </div>

    {catalogOpen&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setCatalogOpen(false);}}><div className="max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-5"><div><h2 className="text-lg font-black">Sales Catalog</h2><p className="text-xs text-slate-500">Select existing catalog data — no duplicated product records.</p></div><button onClick={()=>setCatalogOpen(false)}><X className="h-5 w-5"/></button></div><div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_180px_180px]"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input autoFocus value={catalogSearch} onChange={e=>setCatalogSearch(e.target.value)} placeholder="Search product, package, add-on…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm"/></div><select value={catalogType} onChange={e=>setCatalogType(e.target.value)} className="rounded-xl border border-slate-200 px-3 text-sm"><option value="all">All types</option><option value="package">Packages</option><option value="addon">Add-ons</option><option value="care_plan">Care plans</option><option value="discovery">Discovery</option><option value="custom">Custom catalog</option></select><select value={catalogCategory} onChange={e=>setCatalogCategory(e.target.value)} className="rounded-xl border border-slate-200 px-3 text-sm"><option value="all">All categories</option>{categories.map(category=><option key={category}>{category}</option>)}</select></div><div className="max-h-[58vh] overflow-y-auto p-4"><div className="grid gap-3 md:grid-cols-2">{filteredProducts.map((product:any)=><div key={product.id} className="rounded-2xl border border-slate-200 p-4 hover:border-[#000080]/40"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-wide text-[#000080]">{product.productType.replace('_',' ')} · {product.category}</p><h3 className="mt-1 font-black">{product.name}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{product.shortDescription}</p></div><p className="whitespace-nowrap text-sm font-black">{money(product.basePrice,product.currency||draft.currency)}</p></div><div className="mt-3 flex items-center justify-between gap-3"><p className="flex items-center gap-1 text-[10px] font-semibold text-slate-500"><Clock3 className="h-3 w-3"/>{productDuration(product)}</p><div className="flex gap-2"><button onClick={()=>{addProduct(product,true);}} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold">Add Optional</button><button onClick={()=>{addProduct(product,false);}} className="rounded-lg bg-[#000080] px-2.5 py-1.5 text-[10px] font-bold text-white">Add</button></div></div></div>)}{filteredProducts.length===0&&<div className="col-span-full py-10 text-center text-sm text-slate-400">No catalog items match this search.</div>}</div></div></div></div>}

    {previewOpen&&summary?.presentation&&<div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-4 sm:p-8"><div className="mx-auto mb-4 flex max-w-[1040px] justify-end gap-2 no-print"><button onClick={()=>window.print()} className="rounded-xl bg-white px-4 py-2 text-sm font-bold"><Printer className="mr-2 inline h-4 w-4"/>Print / Save PDF</button><button onClick={()=>setPreviewOpen(false)} className="rounded-xl bg-white p-2"><X className="h-5 w-5"/></button></div><QuotationProposal presentation={summary.presentation}/></div>}

    {sendOpen&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-xl font-black">Send Quotation</h2><p className="mt-1 text-xs text-slate-500">Final readiness is checked server-side before customer delivery.</p></div><button onClick={()=>setSendOpen(false)}><X className="h-5 w-5"/></button></div><div className="mt-5 grid gap-2 sm:grid-cols-2">{[['CRM Opportunity linked',readiness?.opportunityLinked],['Customer email available',readiness?.emailAvailable],['At least one product/service',readiness?.hasProductOrService],['Pricing valid',readiness?.pricingValid],['Timeline confirmed',readiness?.timelineConfirmed],['Payment schedule valid',readiness?.paymentScheduleValid],['Required approval completed',readiness?.approvalCompleted],['Expiration date valid',readiness?.expirationValid]].map(([label,ok]:any)=><div key={label} className={`rounded-xl border p-3 text-xs font-bold ${ok?'border-emerald-200 bg-emerald-50 text-emerald-700':'border-red-200 bg-red-50 text-red-700'}`}>{ok?'✓':'×'} {label}</div>)}</div><div className="mt-5 space-y-3"><label className="block"><span className="mb-1 block text-xs font-bold">Recipient</span><input value={draft.email||''} onChange={e=>updateDraft({email:e.target.value})} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label><label className="block"><span className="mb-1 block text-xs font-bold">CC <span className="font-normal text-slate-400">(comma separated)</span></span><input value={sendCc} onChange={e=>setSendCc(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label><label className="block"><span className="mb-1 block text-xs font-bold">Email Subject</span><input value={sendSubject} onChange={e=>setSendSubject(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label><label className="block"><span className="mb-1 block text-xs font-bold">Personal Message</span><textarea rows={4} value={sendMessage} onChange={e=>setSendMessage(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label></div><div className="mt-5 flex justify-end gap-2"><button onClick={()=>setSendOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Cancel</button><button disabled={!readiness?.readyToSend} onClick={send} className="rounded-xl bg-[#000080] px-5 py-2 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40"><Mail className="mr-2 inline h-4 w-4"/>Review Your Proposal</button></div></div></div>}
  </div>;
}
