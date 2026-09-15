import { supabase } from './supabase';

export type PublicPriceMode = 'fixed' | 'starting_at' | 'custom';
export type PublicTimelineImpact = 'base' | 'additive' | 'parallel' | 'assessment_required';

export interface PublicCatalogMilestone {
  milestoneNumber: number;
  paymentType: string;
  label: string;
  percentage: number;
}

export interface PublicCatalogTechnology {
  name: string;
  logoUrl?: string | null;
}

export interface PublicCatalogDetails {
  slug?: string | null;
  badge?: string | null;
  summary?: string | null;
  bestFor?: string | null;
  quote?: string | null;
  ctaText?: string | null;
  ctaUrl?: string | null;
  featured: boolean;
  technologies: PublicCatalogTechnology[];
  comparison: Record<string, string>;
}

export interface PublicSalesCatalogItem {
  code: string;
  name: string;
  category: string;
  productType: string;
  priceMode: PublicPriceMode;
  basePrice: number;
  currency: string;
  billingPeriod?: string | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
  scope: string[];
  technology?: string | null;
  standardPaymentTerms?: string | null;
  paymentSchedule: PublicCatalogMilestone[];
  managerApprovalRequired: boolean;
  sortOrder: number;
  publicDetails: PublicCatalogDetails;
  deliveryDurationMin: number | null;
  deliveryDurationMax: number | null;
  deliveryDurationUnit: 'business_days';
  timelineImpact: PublicTimelineImpact;
  deliveryDurationNote?: string | null;
  catalogVersion?: number | null;
  effectiveFrom?: string | null;
  updatedAt?: string;
}

export const PUBLIC_CORE_PRODUCT_CODES = [
  'PF-WEB-LAUNCH',
  'PF-WEB-GROWTH',
  'PF-WEB-SCALE',
  'PF-CUSTOM'
] as const;

export const PUBLIC_CARE_PRODUCT_CODES = [
  'PF-CARE',
  'PF-CARE-GROWTH',
  'PF-CARE-PRIORITY'
] as const;

function normalizePublicDetails(value: any): PublicCatalogDetails {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const technologies = Array.isArray(source.technologies)
    ? source.technologies
      .filter((item: any) => item && typeof item === 'object' && String(item.name || '').trim())
      .map((item: any) => ({ name: String(item.name).trim(), logoUrl: item.logoUrl ? String(item.logoUrl) : null }))
    : [];

  const comparison: Record<string, string> = {};
  if (source.comparison && typeof source.comparison === 'object' && !Array.isArray(source.comparison)) {
    Object.entries(source.comparison).forEach(([key, value]) => {
      if (key.trim() && value !== null && value !== undefined) comparison[key] = String(value);
    });
  }

  return {
    slug: source.slug ? String(source.slug) : null,
    badge: source.badge ? String(source.badge) : null,
    summary: source.summary ? String(source.summary) : null,
    bestFor: source.bestFor ? String(source.bestFor) : null,
    quote: source.quote ? String(source.quote) : null,
    ctaText: source.ctaText ? String(source.ctaText) : null,
    ctaUrl: source.ctaUrl ? String(source.ctaUrl) : null,
    featured: source.featured === true,
    technologies,
    comparison
  };
}

function normalizeItem(row: any): PublicSalesCatalogItem {
  const schedule = Array.isArray(row?.paymentSchedule) ? row.paymentSchedule : [];
  return {
    code: String(row?.code || ''),
    name: String(row?.name || ''),
    category: String(row?.category || ''),
    productType: String(row?.productType || ''),
    priceMode: (row?.priceMode || 'fixed') as PublicPriceMode,
    basePrice: Number(row?.basePrice || 0),
    currency: String(row?.currency || 'USD'),
    billingPeriod: row?.billingPeriod || null,
    shortDescription: row?.shortDescription || null,
    fullDescription: row?.fullDescription || null,
    scope: Array.isArray(row?.scope) ? row.scope.map(String) : [],
    technology: row?.technology || null,
    standardPaymentTerms: row?.standardPaymentTerms || null,
    paymentSchedule: schedule.map((milestone: any, index: number) => ({
      milestoneNumber: Number(milestone?.milestoneNumber || index + 1),
      paymentType: String(milestone?.paymentType || ''),
      label: String(milestone?.label || ''),
      percentage: Number(milestone?.percentage || 0)
    })),
    managerApprovalRequired: row?.managerApprovalRequired === true,
    sortOrder: Number(row?.sortOrder || 0),
    publicDetails: normalizePublicDetails(row?.publicDetails),
    deliveryDurationMin: row?.deliveryDurationMin == null ? null : Number(row.deliveryDurationMin),
    deliveryDurationMax: row?.deliveryDurationMax == null ? null : Number(row.deliveryDurationMax),
    deliveryDurationUnit: 'business_days',
    timelineImpact: (row?.timelineImpact || 'assessment_required') as PublicTimelineImpact,
    deliveryDurationNote: row?.deliveryDurationNote || null,
    catalogVersion: row?.catalogVersion == null ? null : Number(row.catalogVersion),
    effectiveFrom: row?.effectiveFrom || null,
    updatedAt: row?.updatedAt || undefined
  };
}

export async function getPublicSalesCatalog(): Promise<PublicSalesCatalogItem[]> {
  const { data, error } = await supabase.rpc('get_public_sales_catalog');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(normalizeItem);
}

export function catalogByCode(items: PublicSalesCatalogItem[]) {
  return new Map(items.map(item => [item.code, item]));
}

export function publicCatalogByType(items: PublicSalesCatalogItem[], productType: string) {
  return items.filter(item => item.productType === productType)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function formatCatalogPrice(
  item: Pick<PublicSalesCatalogItem, 'priceMode' | 'basePrice' | 'currency'>,
  includeStartingPlus = true
) {
  if (item.priceMode === 'custom') return 'Custom Quote';
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: item.currency || 'USD',
      maximumFractionDigits: Number(item.basePrice || 0) % 1 === 0 ? 0 : 2
    }).format(Number(item.basePrice || 0));
  } catch {
    formatted = `$${Number(item.basePrice || 0).toLocaleString()}`;
  }
  return item.priceMode === 'starting_at' && includeStartingPlus ? `${formatted}+` : formatted;
}

export function formatBillingPeriod(period?: string | null) {
  if (!period) return '';
  if (period === 'month') return '/month';
  if (period === 'year') return '/year';
  return `/${period}`;
}

export function formatPublicDelivery(item: Pick<PublicSalesCatalogItem, 'productType' | 'deliveryDurationMin' | 'deliveryDurationMax' | 'timelineImpact'>) {
  const min = item.deliveryDurationMin;
  const max = item.deliveryDurationMax;
  if (min == null || max == null) {
    if (item.productType === 'care_plan') return 'Ongoing after onboarding';
    return item.timelineImpact === 'assessment_required' ? 'Confirmed in your approved quotation' : 'Confirmed after scope review';
  }
  const range = min === max ? `${min} business days` : `${min}–${max} business days`;
  if (item.productType === 'care_plan') return `${range} onboarding, then ongoing monthly`;
  if (item.timelineImpact === 'additive') return `Typically adds ${range} to the relevant project path`;
  if (item.timelineImpact === 'parallel') return `${range}, usually completed in parallel`;
  if (item.timelineImpact === 'assessment_required') return `Typically ${range}; final schedule is confirmed in the approved quotation`;
  return `Typically ${range} from Project Ready Date`;
}

export const PROJECT_READY_DATE_NOTE = 'Project Ready Date means the required payment, onboarding information, content/assets and technical access needed for the agreed scope have been received.';
