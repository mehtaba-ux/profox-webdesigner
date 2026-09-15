import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  Edit2,
  Eye,
  EyeOff,
  Package,
  Plus,
  PlusCircle,
  Search,
  ShieldCheck,
  Trash2,
  X,
  Zap
} from 'lucide-react';
import type { PriceMode, ProductType, SalesProduct } from '../../types';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

type TimelineImpact = 'base' | 'additive' | 'parallel' | 'assessment_required';
type GuidanceListKey =
  | 'askCustomer'
  | 'requiredBeforeQuote'
  | 'doNotPromise'
  | 'recommendWhen'
  | 'whyCustomersBuy'
  | 'doNotRecommendWhen'
  | 'complexityWarnings'
  | 'compatibleProductCodes'
  | 'dependencyProductCodes';

interface CatalogMilestone {
  milestoneNumber: number;
  paymentType: string;
  label: string;
  percentage: number;
}

interface CatalogTechnology {
  name: string;
  logoUrl?: string | null;
}

interface CatalogPublicDetails {
  slug?: string | null;
  badge?: string | null;
  summary?: string | null;
  bestFor?: string | null;
  quote?: string | null;
  ctaText?: string | null;
  ctaUrl?: string | null;
  featured: boolean;
  technologies: CatalogTechnology[];
  comparison: Record<string, string>;
}

interface CatalogClientExpectations {
  clientResponsibilities: string[];
  deliveryAssumptions: string[];
  reviewAndApproval: string[];
  handoverAndSupport: string[];
}

interface CatalogSellerGuidance {
  howToExplain: string;
  askCustomer: string[];
  requiredBeforeQuote: string[];
  doNotPromise: string[];
  recommendWhen: string[];
  whyCustomersBuy: string[];
  doNotRecommendWhen: string[];
  complexityWarnings: string[];
  compatibleProductCodes: string[];
  dependencyProductCodes: string[];
}

interface CatalogProduct extends SalesProduct {
  standardPaymentTerms?: string | null;
  paymentSchedule: CatalogMilestone[];
  publicVisible: boolean;
  publicDetails: CatalogPublicDetails;
  clientExpectations: CatalogClientExpectations;
  sellerGuidance: CatalogSellerGuidance;
  deliveryDurationMin: number | null;
  deliveryDurationMax: number | null;
  deliveryDurationUnit: 'business_days';
  timelineImpact: TimelineImpact;
  deliveryDurationNote: string;
}

const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  package: 'Package',
  addon: 'Add-on',
  care_plan: 'Care Plan',
  discovery: 'Discovery',
  custom: 'Custom'
};

const TIMELINE_IMPACT_LABELS: Record<TimelineImpact, string> = {
  base: 'Base project duration',
  additive: 'Adds to project duration',
  parallel: 'Runs in parallel',
  assessment_required: 'Assessment required'
};

const CATEGORY_SUGGESTIONS = [
  'Web Design', 'Pages & Content', 'Lead Gen', 'Search', 'Branding',
  'E-commerce', 'Integrations', 'Care Plans', 'Discovery'
];

const COMPARISON_LABELS = [
  'Professional design', 'Responsive design', 'Pages', 'Business discovery',
  'Competitor research', 'Custom UI/UX', 'Wireframes', 'Customer journey strategy',
  'Copywriting', 'SEO foundation', 'Search & AI discovery structure',
  'Conversion strategy', 'Analytics', 'Standard integrations', 'Advanced animation',
  'E-commerce', 'User login / dashboard', 'Custom backend', 'Quality assurance',
  'Revision process', 'Post-launch support', 'Typical technology'
];

const emptyPublicDetails = (): CatalogPublicDetails => ({
  slug: null, badge: null, summary: null, bestFor: null, quote: null,
  ctaText: null, ctaUrl: '/contact-us', featured: false, technologies: [], comparison: {}
});

const emptyClientExpectations = (): CatalogClientExpectations => ({
  clientResponsibilities: [], deliveryAssumptions: [], reviewAndApproval: [], handoverAndSupport: []
});

const emptySellerGuidance = (): CatalogSellerGuidance => ({
  howToExplain: '', askCustomer: [], requiredBeforeQuote: [], doNotPromise: [],
  recommendWhen: [], whyCustomersBuy: [], doNotRecommendWhen: [], complexityWarnings: [],
  compatibleProductCodes: [], dependencyProductCodes: []
});

function normalizeTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item || '').trim()).filter(Boolean);
}

function normalizePublicDetails(value: any): CatalogPublicDetails {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const comparison: Record<string, string> = {};
  if (source.comparison && typeof source.comparison === 'object' && !Array.isArray(source.comparison)) {
    Object.entries(source.comparison).forEach(([key, item]) => {
      if (key.trim() && item !== null && item !== undefined) comparison[key] = String(item);
    });
  }
  return {
    slug: source.slug || null,
    badge: source.badge || null,
    summary: source.summary || null,
    bestFor: source.bestFor || null,
    quote: source.quote || null,
    ctaText: source.ctaText || null,
    ctaUrl: source.ctaUrl || '/contact-us',
    featured: source.featured === true,
    technologies: Array.isArray(source.technologies)
      ? source.technologies
        .filter((item: any) => item && typeof item === 'object' && String(item.name || '').trim())
        .map((item: any) => ({ name: String(item.name).trim(), logoUrl: item.logoUrl ? String(item.logoUrl) : null }))
      : [],
    comparison
  };
}

function normalizeClientExpectations(value: any): CatalogClientExpectations {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    clientResponsibilities: normalizeTextList(source.clientResponsibilities),
    deliveryAssumptions: normalizeTextList(source.deliveryAssumptions),
    reviewAndApproval: normalizeTextList(source.reviewAndApproval),
    handoverAndSupport: normalizeTextList(source.handoverAndSupport)
  };
}

function normalizeSellerGuidance(value: any): CatalogSellerGuidance {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    howToExplain: String(source.howToExplain || '').trim(),
    askCustomer: normalizeTextList(source.askCustomer),
    requiredBeforeQuote: normalizeTextList(source.requiredBeforeQuote),
    doNotPromise: normalizeTextList(source.doNotPromise),
    recommendWhen: normalizeTextList(source.recommendWhen),
    whyCustomersBuy: normalizeTextList(source.whyCustomersBuy),
    doNotRecommendWhen: normalizeTextList(source.doNotRecommendWhen),
    complexityWarnings: normalizeTextList(source.complexityWarnings),
    compatibleProductCodes: normalizeTextList(source.compatibleProductCodes),
    dependencyProductCodes: normalizeTextList(source.dependencyProductCodes)
  };
}

function parseLines(value: string): string[] {
  return value.split('\n').map(line => line.trim()).filter(Boolean);
}

function linesText(value: string[]) {
  return (value || []).join('\n');
}

function expectationCount(value: CatalogClientExpectations) {
  return Object.values(value).reduce((total, items) => total + items.length, 0);
}

function guidanceCount(value: CatalogSellerGuidance) {
  return (value.howToExplain ? 1 : 0)
    + value.askCustomer.length + value.requiredBeforeQuote.length + value.doNotPromise.length
    + value.recommendWhen.length + value.whyCustomersBuy.length + value.doNotRecommendWhen.length
    + value.complexityWarnings.length;
}

function defaultTimelineImpact(productType: ProductType, priceMode: PriceMode): TimelineImpact {
  if (priceMode === 'custom' || productType === 'custom') return 'assessment_required';
  if (productType === 'package') return 'base';
  if (productType === 'addon' || productType === 'discovery') return 'additive';
  if (productType === 'care_plan') return 'parallel';
  return 'assessment_required';
}

function mapProduct(row: any): CatalogProduct {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    productType: row.product_type,
    priceMode: row.price_mode,
    basePrice: Number(row.base_price || 0),
    currency: row.currency || 'USD',
    billingPeriod: row.billing_period,
    shortDescription: row.short_description || '',
    fullDescription: row.full_description || '',
    scope: Array.isArray(row.scope) ? row.scope.map(String) : [],
    technology: row.technology || '',
    managerApprovalRequired: row.manager_approval_required === true,
    active: row.active !== false,
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    standardPaymentTerms: row.standard_payment_terms || '',
    paymentSchedule: Array.isArray(row.payment_schedule) ? row.payment_schedule.map((item: any, index: number) => ({
      milestoneNumber: Number(item?.milestoneNumber || index + 1),
      paymentType: String(item?.paymentType || ''),
      label: String(item?.label || ''),
      percentage: Number(item?.percentage || 0)
    })) : [],
    publicVisible: row.public_visible === true,
    publicDetails: normalizePublicDetails(row.public_details),
    clientExpectations: normalizeClientExpectations(row.client_expectations),
    sellerGuidance: normalizeSellerGuidance(row.seller_guidance),
    deliveryDurationMin: row.delivery_duration_min == null ? null : Number(row.delivery_duration_min),
    deliveryDurationMax: row.delivery_duration_max == null ? null : Number(row.delivery_duration_max),
    deliveryDurationUnit: 'business_days',
    timelineImpact: (row.timeline_impact || defaultTimelineImpact(row.product_type, row.price_mode)) as TimelineImpact,
    deliveryDurationNote: row.delivery_duration_note || ''
  };
}

function newProduct(sortOrder: number): CatalogProduct {
  const now = new Date().toISOString();
  return {
    id: '', code: '', name: '', category: 'Web Design', productType: 'package',
    priceMode: 'starting_at', basePrice: 0, currency: 'USD', billingPeriod: null,
    shortDescription: '', fullDescription: '', scope: [], technology: '',
    managerApprovalRequired: false, active: true, sortOrder, createdAt: now, updatedAt: now,
    standardPaymentTerms: '', paymentSchedule: [], publicVisible: false,
    publicDetails: emptyPublicDetails(), clientExpectations: emptyClientExpectations(),
    sellerGuidance: emptySellerGuidance(), deliveryDurationMin: null, deliveryDurationMax: null,
    deliveryDurationUnit: 'business_days', timelineImpact: 'base', deliveryDurationNote: ''
  };
}

function formatPrice(product: CatalogProduct) {
  if (product.priceMode === 'custom') return 'Custom Quote';
  try {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency', currency: product.currency || 'USD',
      maximumFractionDigits: Number(product.basePrice || 0) % 1 === 0 ? 0 : 2
    }).format(product.basePrice || 0);
    return product.priceMode === 'starting_at' ? `${formatted}+` : formatted;
  } catch {
    return `$${Number(product.basePrice || 0).toLocaleString()}`;
  }
}

function formatDuration(product: CatalogProduct) {
  if (product.deliveryDurationMin !== null && product.deliveryDurationMax !== null) {
    const range = product.deliveryDurationMin === product.deliveryDurationMax
      ? `${product.deliveryDurationMin} business days`
      : `${product.deliveryDurationMin}–${product.deliveryDurationMax} business days`;
    if (product.timelineImpact === 'additive') return `Adds ${range}`;
    if (product.timelineImpact === 'parallel') return `${range} · parallel`;
    if (product.timelineImpact === 'assessment_required') return `${range} · quote-specific`;
    return range;
  }
  if (product.timelineImpact === 'assessment_required') return 'Assessment required';
  if (product.productType === 'care_plan' && product.timelineImpact === 'parallel') return 'Ongoing · no project extension';
  return 'Not configured';
}

function parseTechnologies(text: string): CatalogTechnology[] {
  return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const [name, ...rest] = line.split('|');
    return { name: name.trim(), logoUrl: rest.join('|').trim() || null };
  }).filter(item => item.name);
}

function technologyText(items: CatalogTechnology[]) {
  return (items || []).map(item => `${item.name}${item.logoUrl ? ` | ${item.logoUrl}` : ''}`).join('\n');
}

function DetailList({ title, items, tone = 'slate' }: { title: string; items: string[]; tone?: 'slate' | 'red' | 'amber' | 'emerald' | 'blue' }) {
  if (!items.length) return null;
  const tones = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    red: 'border-red-100 bg-red-50 text-red-800',
    amber: 'border-amber-100 bg-amber-50 text-amber-900',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-900',
    blue: 'border-blue-100 bg-blue-50 text-slate-800'
  };
  return <div className={`rounded-xl border p-4 ${tones[tone]}`}>
    <h4 className="text-[10px] font-black uppercase tracking-[0.12em]">{title}</h4>
    <ul className="mt-2 space-y-1.5 text-xs leading-5">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50"/><span>{item}</span></li>)}</ul>
  </div>;
}

export default function SalesCatalog() {
  const { isAdmin } = useAuth();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [selectedType, setSelectedType] = useState<ProductType | 'all'>('all');
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [scopeText, setScopeText] = useState('');
  const [technologiesText, setTechnologiesText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadProducts = async () => {
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase.from('sales_products').select('*')
      .order('sort_order', { ascending: true }).order('name', { ascending: true });
    if (queryError) setError(queryError.message || 'Failed to load Sales Catalog.');
    else setProducts((data || []).map(mapProduct));
    setLoading(false);
  };

  useEffect(() => { void loadProducts(); }, []);

  const categories = useMemo(() => {
    const values = Array.from(new Set([...CATEGORY_SUGGESTIONS, ...products.map(product => product.category).filter(Boolean)]));
    return ['All Categories', ...values.sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const filteredProducts = products.filter(product => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || [product.name, product.code, product.category, product.shortDescription || '']
      .some(value => value.toLowerCase().includes(query));
    return matchesSearch
      && (selectedCategory === 'All Categories' || product.category === selectedCategory)
      && (selectedType === 'all' || product.productType === selectedType);
  });

  const openEditor = (product: CatalogProduct) => {
    if (!isAdmin) return;
    const copy: CatalogProduct = {
      ...product,
      scope: [...(product.scope || [])],
      paymentSchedule: product.paymentSchedule.map(item => ({ ...item })),
      clientExpectations: Object.fromEntries(Object.entries(product.clientExpectations).map(([key, items]) => [key, [...items]])) as unknown as CatalogClientExpectations,
      sellerGuidance: { ...product.sellerGuidance, ...Object.fromEntries(Object.entries(product.sellerGuidance).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])) },
      publicDetails: { ...product.publicDetails, technologies: product.publicDetails.technologies.map(item => ({ ...item })), comparison: { ...product.publicDetails.comparison } }
    };
    setEditingProduct(copy);
    setScopeText((copy.scope || []).join('\n'));
    setTechnologiesText(technologyText(copy.publicDetails.technologies));
    setError('');
    setMessage('');
  };

  const closeEditor = () => {
    setEditingProduct(null);
    setScopeText('');
    setTechnologiesText('');
  };

  const patchPublicDetails = (patch: Partial<CatalogPublicDetails>) => setEditingProduct(current => current ? ({ ...current, publicDetails: { ...current.publicDetails, ...patch } }) : current);
  const patchExpectations = (key: keyof CatalogClientExpectations, value: string) => setEditingProduct(current => current ? ({ ...current, clientExpectations: { ...current.clientExpectations, [key]: parseLines(value) } }) : current);
  const patchGuidanceList = (key: GuidanceListKey, value: string) => setEditingProduct(current => current ? ({ ...current, sellerGuidance: { ...current.sellerGuidance, [key]: parseLines(value) } }) : current);
  const setComparisonValue = (label: string, value: string) => setEditingProduct(current => current ? ({ ...current, publicDetails: { ...current.publicDetails, comparison: { ...current.publicDetails.comparison, [label]: value } } }) : current);

  const addMilestone = () => setEditingProduct(current => current ? ({ ...current, paymentSchedule: [...current.paymentSchedule, { milestoneNumber: current.paymentSchedule.length + 1, paymentType: 'Custom Milestone', label: '', percentage: 0 }] }) : current);
  const updateMilestone = (index: number, patch: Partial<CatalogMilestone>) => setEditingProduct(current => current ? ({ ...current, paymentSchedule: current.paymentSchedule.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }) : current);
  const removeMilestone = (index: number) => setEditingProduct(current => current ? ({ ...current, paymentSchedule: current.paymentSchedule.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, milestoneNumber: itemIndex + 1 })) }) : current);

  const saveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin || !editingProduct) return;
    const scope = parseLines(scopeText);
    const publicDetails: CatalogPublicDetails = {
      ...editingProduct.publicDetails,
      technologies: parseTechnologies(technologiesText),
      comparison: Object.fromEntries(Object.entries(editingProduct.publicDetails.comparison || {})
        .map(([key, value]) => [key.trim(), String(value || '').trim()]).filter(([key, value]) => Boolean(key && value)))
    };
    const isPublicOffer = editingProduct.publicVisible && ['package', 'care_plan'].includes(editingProduct.productType);
    const requiresStandardPaymentSchedule = editingProduct.active
      && ['package', 'discovery'].includes(editingProduct.productType)
      && editingProduct.priceMode !== 'custom';
    const min = editingProduct.deliveryDurationMin;
    const max = editingProduct.deliveryDurationMax;

    if (isPublicOffer && scope.length === 0) return setError('A public package or care plan must have at least one canonical inclusion.');
    if (isPublicOffer && (!publicDetails.badge?.trim() || !publicDetails.summary?.trim() || !publicDetails.ctaText?.trim())) return setError('Public packages and care plans require a badge, public summary and CTA text.');
    if (editingProduct.productType === 'package' && editingProduct.publicVisible && !publicDetails.bestFor?.trim()) return setError('A public website package requires a Best For description.');
    if ((min === null) !== (max === null) || (min !== null && (min < 0 || max === null || max < min))) return setError('Delivery duration requires a valid minimum and maximum business-day range.');
    if (editingProduct.timelineImpact !== 'assessment_required' && editingProduct.productType !== 'care_plan' && (min === null || max === null)) return setError('Configure the delivery duration, or mark this product as Assessment required.');
    if (requiresStandardPaymentSchedule && editingProduct.paymentSchedule.length === 0) return setError('This active standard offer needs an approved payment schedule before Sales can use it.');
    if (editingProduct.paymentSchedule.length > 0) {
      const paymentTotal = editingProduct.paymentSchedule.reduce((sum, milestone) => sum + Number(milestone.percentage || 0), 0);
      const incomplete = editingProduct.paymentSchedule.some(milestone => !milestone.label.trim() || !milestone.paymentType.trim() || Number(milestone.percentage || 0) <= 0);
      const firstType = [...editingProduct.paymentSchedule].sort((a, b) => a.milestoneNumber - b.milestoneNumber)[0]?.paymentType;
      if (incomplete) return setError('Every payment milestone needs a label, payment type, and positive percentage.');
      if (Math.round(paymentTotal * 10000) / 10000 !== 100) return setError('The payment schedule must total exactly 100%.');
      if (!['Advance', 'Full Payment'].includes(firstType || '')) return setError('The first payment milestone must be Advance or Full Payment.');
    }

    setIsSaving(true);
    setError('');
    setMessage('');
    const payload = {
      id: editingProduct.id || null,
      code: editingProduct.code.trim().toUpperCase(),
      name: editingProduct.name.trim(),
      category: editingProduct.category.trim(),
      product_type: editingProduct.productType,
      price_mode: editingProduct.priceMode,
      base_price: editingProduct.priceMode === 'custom' ? 0 : Number(editingProduct.basePrice || 0),
      currency: editingProduct.currency.trim().toUpperCase() || 'USD',
      billing_period: editingProduct.billingPeriod || null,
      short_description: editingProduct.shortDescription?.trim() || null,
      full_description: editingProduct.fullDescription?.trim() || null,
      scope,
      technology: editingProduct.technology?.trim() || null,
      manager_approval_required: editingProduct.managerApprovalRequired,
      active: editingProduct.active,
      sort_order: Number(editingProduct.sortOrder || 0),
      standard_payment_terms: editingProduct.standardPaymentTerms?.trim() || null,
      payment_schedule: editingProduct.paymentSchedule.length ? editingProduct.paymentSchedule : null,
      public_visible: editingProduct.active ? editingProduct.publicVisible : false,
      public_details: publicDetails,
      client_expectations: editingProduct.clientExpectations,
      seller_guidance: editingProduct.sellerGuidance,
      delivery_duration_min: min,
      delivery_duration_max: max,
      delivery_duration_unit: 'business_days',
      timeline_impact: editingProduct.timelineImpact,
      delivery_duration_note: editingProduct.deliveryDurationNote.trim() || null
    };
    const { error: saveError } = await supabase.rpc('admin_upsert_sales_product', { p_product: payload });
    if (saveError) setError(saveError.message || 'Product could not be saved.');
    else {
      closeEditor();
      setMessage(`${payload.name} saved without losing seller guidance, scope, or timing.`);
      await loadProducts();
    }
    setIsSaving(false);
  };

  const deleteProduct = async (product: CatalogProduct) => {
    if (!isAdmin || !window.confirm(`Remove ${product.name}? Products used in quotations will be safely deactivated instead of deleted.`)) return;
    setError('');
    const { data, error: deleteError } = await supabase.rpc('admin_delete_or_deactivate_sales_product', { p_product_id: product.id });
    if (deleteError) setError(deleteError.message || 'Product could not be removed.');
    else {
      setMessage(`${product.name} ${data === 'deactivated' ? 'was deactivated because historical quotations reference it.' : 'was deleted.'}`);
      await loadProducts();
    }
  };

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold text-slate-900">Sales Catalog</h1><span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#000080]">Commercial source of truth</span></div><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Use each product’s expanded view to understand customer outcome, exact inclusions, boundaries, qualification questions, quote requirements and promises Sales must not make.</p>{!isAdmin && <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600"><ShieldCheck className="h-4 w-4"/>Read-only access — only Admin can change catalog data.</div>}</div>
      {isAdmin && <button onClick={() => openEditor(newProduct((products.at(-1)?.sortOrder || 0) + 10))} className="flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-[#000066]"><Plus className="h-4 w-4"/>Add Product</button>}
    </div>

    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
    {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</div>}

    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-4 md:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search name, code, category or description..." className="w-full rounded-xl border border-slate-200 py-2 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-[#000080]/10"/></div><select value={selectedCategory} onChange={event => setSelectedCategory(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700">{categories.map(category => <option key={category}>{category}</option>)}</select><select value={selectedType} onChange={event => setSelectedType(event.target.value as ProductType | 'all')} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700"><option value="all">All Types</option>{Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>

    {loading ? <div className="flex justify-center py-20"><Activity className="h-8 w-8 animate-spin text-[#000080]"/></div> : filteredProducts.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white py-20 text-center"><Package className="mx-auto h-9 w-9 text-slate-300"/><h3 className="mt-4 font-bold">No products found</h3></div> : <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {filteredProducts.map(product => {
        const expanded = expandedProductId === product.id;
        const guidance = product.sellerGuidance;
        return <article key={product.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${product.active ? 'border-slate-200' : 'border-slate-200 opacity-65'}`}>
          <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 gap-3"><div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${product.productType === 'package' ? 'bg-blue-50 text-[#000080]' : product.productType === 'addon' ? 'bg-emerald-50 text-emerald-600' : product.productType === 'care_plan' ? 'bg-purple-50 text-purple-600' : 'bg-slate-50 text-slate-600'}`}>{product.productType === 'package' ? <Zap className="h-6 w-6"/> : product.productType === 'addon' ? <PlusCircle className="h-6 w-6"/> : product.productType === 'care_plan' ? <ShieldCheck className="h-6 w-6"/> : <Package className="h-6 w-6"/>}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{product.name}</h3>{product.publicVisible && <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700"><Eye className="h-3 w-3"/>Public</span>}{!product.active && <span className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-500">Inactive</span>}</div><p className="mt-1 text-[10px] font-bold uppercase tracking-tight text-slate-400">{product.code} · {product.category} · {PRODUCT_TYPE_LABELS[product.productType]}</p></div></div>{isAdmin && <div className="flex gap-1"><button onClick={() => openEditor(product)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Edit product"><Edit2 className="h-4 w-4"/></button><button onClick={() => void deleteProduct(product)} className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Delete or deactivate"><Trash2 className="h-4 w-4"/></button></div>}</div>
          <p className="mt-4 text-xs leading-5 text-slate-600">{product.shortDescription || product.publicDetails.summary || 'No description provided.'}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-3"><Metric label="Current price" value={`${formatPrice(product)}${product.billingPeriod ? `/${product.billingPeriod}` : ''}`}/><Metric label="Typical delivery" value={formatDuration(product)} warn={product.timelineImpact === 'assessment_required'}/><Metric label="Canonical inclusions" value={String(product.scope?.length || 0)}/><Metric label="Seller guidance" value={`${guidanceCount(guidance)} point${guidanceCount(guidance) === 1 ? '' : 's'}`}/><Metric label="Client expectations" value={`${expectationCount(product.clientExpectations)} statement${expectationCount(product.clientExpectations) === 1 ? '' : 's'}`}/><Metric label="Public state" value={product.publicVisible ? 'Visible' : 'Hidden'} icon={product.publicVisible ? <Eye className="h-3.5 w-3.5"/> : <EyeOff className="h-3.5 w-3.5"/>}/></div>
          <button type="button" onClick={() => setExpandedProductId(expanded ? null : product.id)} className="mt-4 flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left text-xs font-black text-slate-700 hover:border-[#000080]/20 hover:bg-[#000080]/[0.02]"><span>{expanded ? 'Hide seller playbook' : 'Open scope & seller playbook'}</span>{expanded ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}</button>
          {expanded && <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
            {product.fullDescription && <div><h4 className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Customer outcome / scope summary</h4><p className="mt-2 text-xs leading-5 text-slate-700">{product.fullDescription}</p></div>}
            {guidance.howToExplain && <div className="rounded-xl border border-[#000080]/10 bg-[#000080]/[0.03] p-4"><h4 className="text-[10px] font-black uppercase tracking-[0.12em] text-[#000080]">How to explain it</h4><p className="mt-2 text-xs font-semibold leading-5 text-slate-700">{guidance.howToExplain}</p></div>}
            <div className="grid gap-3 md:grid-cols-2"><DetailList title="Included / deliverables" items={product.scope || []} tone="blue"/><DetailList title="Why customers buy" items={guidance.whyCustomersBuy} tone="emerald"/><DetailList title="Recommend when" items={guidance.recommendWhen} tone="emerald"/><DetailList title="Do not recommend when" items={guidance.doNotRecommendWhen} tone="amber"/><DetailList title="Ask the customer" items={guidance.askCustomer}/><DetailList title="Required before quote" items={guidance.requiredBeforeQuote} tone="blue"/><DetailList title="Do not promise" items={guidance.doNotPromise} tone="red"/><DetailList title="Complexity warnings" items={guidance.complexityWarnings} tone="amber"/></div>
            {product.deliveryDurationNote && <DetailList title="Timeline dependency" items={[product.deliveryDurationNote]} tone="amber"/>}
            <div className="grid gap-3 md:grid-cols-2"><DetailList title="Client responsibilities" items={product.clientExpectations.clientResponsibilities}/><DetailList title="Delivery assumptions" items={product.clientExpectations.deliveryAssumptions}/><DetailList title="Review & approval" items={product.clientExpectations.reviewAndApproval}/><DetailList title="Handover & support" items={product.clientExpectations.handoverAndSupport}/></div>
            {(guidance.compatibleProductCodes.length > 0 || guidance.dependencyProductCodes.length > 0) && <div className="grid gap-3 md:grid-cols-2"><DetailList title="Compatible products" items={guidance.compatibleProductCodes}/><DetailList title="Dependencies" items={guidance.dependencyProductCodes} tone="amber"/></div>}
          </div>}
        </article>;
      })}
    </div>}

    {editingProduct && isAdmin && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"><div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4"><div><h2 className="font-bold text-slate-900">{editingProduct.id ? 'Edit Catalog Product' : 'Add Catalog Product'}</h2><p className="mt-1 text-[10px] text-slate-500">Admin-only. Seller guidance stays internal and is never exposed by the public catalog RPC.</p></div><button onClick={closeEditor} className="rounded-full p-2 hover:bg-slate-200"><X className="h-5 w-5 text-slate-500"/></button></div><form onSubmit={saveProduct} className="space-y-7 overflow-y-auto p-6">
      <EditorProductPricing product={editingProduct} setProduct={setEditingProduct}/>
      <section className="rounded-2xl border border-amber-100 bg-amber-50/40 p-5"><div className="flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#000080]"><Clock className="h-4 w-4"/></div><div><h3 className="text-xs font-black uppercase tracking-wider text-[#000080]">Delivery timeline</h3><p className="mt-1 text-[10px] leading-4 text-slate-500">Typical delivery starts from Project Ready Date unless the quotation explicitly states otherwise. Quote-specific products can keep a range while using Assessment required.</p></div></div><div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4"><Field label="Timeline Impact"><select value={editingProduct.timelineImpact} onChange={event => setEditingProduct({ ...editingProduct, timelineImpact: event.target.value as TimelineImpact })} className="field-input">{Object.entries(TIMELINE_IMPACT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Minimum Business Days"><input type="number" min="0" value={editingProduct.deliveryDurationMin ?? ''} onChange={event => setEditingProduct({ ...editingProduct, deliveryDurationMin: event.target.value === '' ? null : Number(event.target.value) })} className="field-input"/></Field><Field label="Maximum Business Days"><input type="number" min="0" value={editingProduct.deliveryDurationMax ?? ''} onChange={event => setEditingProduct({ ...editingProduct, deliveryDurationMax: event.target.value === '' ? null : Number(event.target.value) })} className="field-input"/></Field><Field label="Duration Unit"><input disabled value="Business days" className="field-input bg-slate-100"/></Field></div><div className="mt-4"><Field label="Timeline Note"><textarea rows={2} value={editingProduct.deliveryDurationNote} onChange={event => setEditingProduct({ ...editingProduct, deliveryDurationNote: event.target.value })} className="field-input"/></Field></div></section>
      <section className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5"><h3 className="text-xs font-black uppercase tracking-wider text-[#000080]">Canonical inclusions</h3><p className="mt-1 text-[10px] text-slate-500">One approved deliverable/inclusion per line.</p><textarea rows={Math.min(16, Math.max(7, (editingProduct.scope?.length || 0) + 2))} value={scopeText} onChange={event => setScopeText(event.target.value)} className="field-input mt-4 leading-5"/></section>
      <section className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-5"><h3 className="text-xs font-black uppercase tracking-wider text-[#000080]">Seller playbook — internal only</h3><p className="mt-1 text-[10px] leading-4 text-slate-500">Use this to qualify correctly and prevent accidental promises. It is not returned by the public catalog or customer quotation payload.</p><div className="mt-4"><Field label="How to Explain"><textarea rows={3} value={editingProduct.sellerGuidance.howToExplain} onChange={event => setEditingProduct({ ...editingProduct, sellerGuidance: { ...editingProduct.sellerGuidance, howToExplain: event.target.value } })} className="field-input"/></Field></div><div className="mt-4 grid gap-4 md:grid-cols-2"><GuidanceField label="Why Customers Buy" value={editingProduct.sellerGuidance.whyCustomersBuy} onChange={value => patchGuidanceList('whyCustomersBuy', value)}/><GuidanceField label="Recommend When" value={editingProduct.sellerGuidance.recommendWhen} onChange={value => patchGuidanceList('recommendWhen', value)}/><GuidanceField label="Do Not Recommend When" value={editingProduct.sellerGuidance.doNotRecommendWhen} onChange={value => patchGuidanceList('doNotRecommendWhen', value)}/><GuidanceField label="Ask Customer" value={editingProduct.sellerGuidance.askCustomer} onChange={value => patchGuidanceList('askCustomer', value)}/><GuidanceField label="Required Before Quote" value={editingProduct.sellerGuidance.requiredBeforeQuote} onChange={value => patchGuidanceList('requiredBeforeQuote', value)}/><GuidanceField label="Do Not Promise" value={editingProduct.sellerGuidance.doNotPromise} onChange={value => patchGuidanceList('doNotPromise', value)}/><GuidanceField label="Complexity Warnings" value={editingProduct.sellerGuidance.complexityWarnings} onChange={value => patchGuidanceList('complexityWarnings', value)}/><GuidanceField label="Compatible Product Codes" value={editingProduct.sellerGuidance.compatibleProductCodes} onChange={value => patchGuidanceList('compatibleProductCodes', value)}/><GuidanceField label="Dependency Product Codes" value={editingProduct.sellerGuidance.dependencyProductCodes} onChange={value => patchGuidanceList('dependencyProductCodes', value)}/></div></section>
      <section className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5"><h3 className="text-xs font-black uppercase tracking-wider text-[#000080]">Client expectations</h3><div className="mt-4 grid gap-4 md:grid-cols-2"><ExpectationField label="Client Responsibilities" value={editingProduct.clientExpectations.clientResponsibilities} onChange={value => patchExpectations('clientResponsibilities', value)}/><ExpectationField label="Delivery Assumptions" value={editingProduct.clientExpectations.deliveryAssumptions} onChange={value => patchExpectations('deliveryAssumptions', value)}/><ExpectationField label="Review & Approval" value={editingProduct.clientExpectations.reviewAndApproval} onChange={value => patchExpectations('reviewAndApproval', value)}/><ExpectationField label="Handover & Support" value={editingProduct.clientExpectations.handoverAndSupport} onChange={value => patchExpectations('handoverAndSupport', value)}/></div></section>
      <section><div className="flex items-center justify-between"><div><h3 className="text-xs font-black uppercase tracking-wider text-[#000080]">Payment rules</h3><p className="mt-1 text-[10px] text-slate-500">Custom/quote-specific products may intentionally have no catalog-level payment schedule.</p></div><button type="button" onClick={addMilestone} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">+ Milestone</button></div><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Standard Payment Terms"><input value={editingProduct.standardPaymentTerms || ''} onChange={event => setEditingProduct({ ...editingProduct, standardPaymentTerms: event.target.value })} className="field-input"/></Field><Field label="Internal Technology Note"><input value={editingProduct.technology || ''} onChange={event => setEditingProduct({ ...editingProduct, technology: event.target.value })} className="field-input"/></Field></div><div className="mt-4 space-y-3">{editingProduct.paymentSchedule.map((milestone, index) => <div key={index} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[72px_1fr_1fr_110px_auto]"><input disabled value={index + 1} className="field-input bg-slate-100"/><input value={milestone.paymentType} onChange={event => updateMilestone(index, { paymentType: event.target.value })} className="field-input" placeholder="Payment type"/><input value={milestone.label} onChange={event => updateMilestone(index, { label: event.target.value })} className="field-input" placeholder="Milestone label"/><input type="number" min="0" max="100" value={milestone.percentage} onChange={event => updateMilestone(index, { percentage: Number(event.target.value), milestoneNumber: index + 1 })} className="field-input"/><button type="button" onClick={() => removeMilestone(index)} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4"/></button></div>)}</div></section>
      <section className="rounded-2xl border border-violet-100 bg-violet-50/40 p-5"><h3 className="text-xs font-black uppercase tracking-wider text-[#000080]">Public Pricing presentation</h3><div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Field label="Public Slug / ID"><input value={editingProduct.publicDetails.slug || ''} onChange={event => patchPublicDetails({ slug: event.target.value || null })} className="field-input"/></Field><Field label="Badge"><input value={editingProduct.publicDetails.badge || ''} onChange={event => patchPublicDetails({ badge: event.target.value })} className="field-input"/></Field><Field label="CTA Text"><input value={editingProduct.publicDetails.ctaText || ''} onChange={event => patchPublicDetails({ ctaText: event.target.value })} className="field-input"/></Field><Field label="CTA URL"><input value={editingProduct.publicDetails.ctaUrl || ''} onChange={event => patchPublicDetails({ ctaUrl: event.target.value })} className="field-input"/></Field><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700"><input type="checkbox" checked={editingProduct.publicDetails.featured} onChange={event => patchPublicDetails({ featured: event.target.checked })}/>Featured</label><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700"><input type="checkbox" checked={editingProduct.publicVisible} onChange={event => setEditingProduct({ ...editingProduct, publicVisible: event.target.checked })}/>Visible on public Pricing</label></div><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Public Summary"><textarea rows={3} value={editingProduct.publicDetails.summary || ''} onChange={event => patchPublicDetails({ summary: event.target.value })} className="field-input"/></Field><Field label="Best For"><textarea rows={3} value={editingProduct.publicDetails.bestFor || ''} onChange={event => patchPublicDetails({ bestFor: event.target.value })} className="field-input"/></Field><Field label="Customer Need Quote"><textarea rows={3} value={editingProduct.publicDetails.quote || ''} onChange={event => patchPublicDetails({ quote: event.target.value })} className="field-input"/></Field><Field label="Public Technologies"><textarea rows={3} value={technologiesText} onChange={event => setTechnologiesText(event.target.value)} className="field-input" placeholder={'WordPress | https://...\nReact | https://...'}/></Field></div>{editingProduct.productType === 'package' && <div className="mt-6"><h4 className="text-xs font-black text-slate-800">Pricing comparison values</h4><div className="mt-3 grid gap-3 md:grid-cols-2">{COMPARISON_LABELS.map(label => <Field key={label} label={label}><input value={editingProduct.publicDetails.comparison[label] || ''} onChange={event => setComparisonValue(label, event.target.value)} className="field-input"/></Field>)}</div></div>}</section>
      <section className="flex flex-wrap gap-6 rounded-2xl border border-slate-100 bg-slate-50 p-4"><label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={editingProduct.active} onChange={event => setEditingProduct({ ...editingProduct, active: event.target.checked })}/>Active in Catalog</label><label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={editingProduct.managerApprovalRequired} onChange={event => setEditingProduct({ ...editingProduct, managerApprovalRequired: event.target.checked })}/>Manager Approval Required</label></section>
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-5"><button type="button" onClick={closeEditor} className="px-5 py-2 text-xs font-bold text-slate-500">Cancel</button><button type="submit" disabled={isSaving} className="flex items-center gap-2 rounded-xl bg-[#000080] px-7 py-2.5 text-xs font-bold text-white shadow-lg disabled:opacity-50">{isSaving ? <Activity className="h-4 w-4 animate-spin"/> : <Check className="h-4 w-4"/>}{editingProduct.id ? 'Update Product' : 'Create Product'}</button></div>
    </form></div></div>}
    <style>{`.field-input{width:100%;border:1px solid rgb(226 232 240);border-radius:.75rem;padding:.625rem .875rem;font-size:.75rem;outline:none;background:white}.field-input:focus{border-color:#000080;box-shadow:0 0 0 3px rgba(0,0,128,.08)}`}</style>
  </div>;
}

function Metric({ label, value, warn = false, icon }: { label: string; value: string; warn?: boolean; icon?: React.ReactNode }) {
  return <div><div className="text-[9px] font-black uppercase text-slate-400">{label}</div><div className={`mt-1 flex items-center gap-1 font-black ${warn ? 'text-amber-700' : 'text-slate-900'}`}>{icon}{value}</div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 ml-1 block text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>;
}

function GuidanceField({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string) => void }) {
  return <Field label={label}><textarea rows={5} value={linesText(value)} onChange={event => onChange(event.target.value)} className="field-input leading-5" placeholder="One point per line"/></Field>;
}

function ExpectationField({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string) => void }) {
  return <Field label={label}><textarea rows={5} value={linesText(value)} onChange={event => onChange(event.target.value)} className="field-input leading-5" placeholder="One statement per line"/></Field>;
}

function EditorProductPricing({ product, setProduct }: { product: CatalogProduct; setProduct: React.Dispatch<React.SetStateAction<CatalogProduct | null>> }) {
  const patch = (changes: Partial<CatalogProduct>) => setProduct(current => current ? { ...current, ...changes } : current);
  return <section><h3 className="text-xs font-black uppercase tracking-wider text-[#000080]">Product & pricing</h3><div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Field label="Product Name"><input required value={product.name} onChange={event => patch({ name: event.target.value })} className="field-input"/></Field><Field label="Product Code"><input required value={product.code} onChange={event => patch({ code: event.target.value.toUpperCase() })} className="field-input"/></Field><Field label="Category"><><input required list="catalog-categories" value={product.category} onChange={event => patch({ category: event.target.value })} className="field-input"/><datalist id="catalog-categories">{CATEGORY_SUGGESTIONS.map(item => <option key={item} value={item}/>)}</datalist></></Field><Field label="Product Type"><select value={product.productType} onChange={event => { const productType = event.target.value as ProductType; patch({ productType, timelineImpact: defaultTimelineImpact(productType, product.priceMode) }); }} className="field-input">{Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Price Mode"><select value={product.priceMode} onChange={event => { const priceMode = event.target.value as PriceMode; patch({ priceMode, timelineImpact: priceMode === 'custom' ? 'assessment_required' : product.timelineImpact }); }} className="field-input"><option value="fixed">Fixed Price</option><option value="starting_at">Starting Price</option><option value="custom">Custom Quote</option></select></Field><Field label="Base Price"><div className="relative"><DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input type="number" min="0" step="0.01" disabled={product.priceMode === 'custom'} value={product.basePrice} onChange={event => patch({ basePrice: Number(event.target.value) })} className="field-input pl-9 disabled:bg-slate-50"/></div></Field><Field label="Currency"><input value={product.currency} onChange={event => patch({ currency: event.target.value.toUpperCase() })} className="field-input"/></Field><Field label="Billing Period"><select value={product.billingPeriod || ''} onChange={event => patch({ billingPeriod: event.target.value || null })} className="field-input"><option value="">One-time</option><option value="month">Per Month</option><option value="year">Per Year</option></select></Field><Field label="Sort Order"><input type="number" value={product.sortOrder} onChange={event => patch({ sortOrder: Number(event.target.value) })} className="field-input"/></Field></div><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Short Description"><textarea rows={3} value={product.shortDescription || ''} onChange={event => patch({ shortDescription: event.target.value })} className="field-input"/></Field><Field label="Full Description / Outcome"><textarea rows={3} value={product.fullDescription || ''} onChange={event => patch({ fullDescription: event.target.value })} className="field-input"/></Field></div></section>;
}
