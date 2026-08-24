import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import PricingDetailView from './PricingDetailView';
import { defaultPricingTemplateData } from '../data/pricingTemplate';
import { useCMS } from '../lib/CMSProvider';
import type { CustomPage } from '../types';
import {
  PublicSalesCatalogItem,
  formatBillingPeriod,
  formatCatalogPrice,
  getPublicSalesCatalog,
  publicCatalogByType
} from '../lib/publicSalesCatalogService';

const pricingPageFallback: Partial<CustomPage> = {
  id: 'plans-pricing',
  title: 'Website Design & Development Pricing',
  slug: 'pricing',
  template: 'plans-pricing',
  status: 'published',
  heroTitle: defaultPricingTemplateData.hero.quote,
  heroSubtitle: defaultPricingTemplateData.hero.reviewLabel,
  bodyContent: 'Compare current ProFox website packages, inclusions, technology, payment structure, and custom digital experience options.',
  serviceDetailData: defaultPricingTemplateData,
  seo: {
    metaTitle: 'Website Design & Development Pricing | ProFox Web Designer',
    metaDescription: 'Compare current ProFox website design and development packages, inclusions, technology, payment structure, and custom digital experience options.',
    focusKeyword: 'website design and development pricing',
    canonicalUrl: 'https://www.profoxwebdesigner.com/pricing',
    ogTitle: 'Website Design & Development Pricing | ProFox Web Designer',
    ogDescription: 'Clear ProFox website packages built around strategy, design, technology, integrations, and measurable business growth.',
    noIndex: false,
    schemaType: 'Service'
  }
};

function milestoneText(item: PublicSalesCatalogItem) {
  if (item.paymentSchedule.length === 0) {
    return item.priceMode === 'custom'
      ? ['Milestones follow the approved scope and delivery phases']
      : [];
  }
  return item.paymentSchedule.map(
    milestone => milestone.label || `${milestone.percentage}% ${milestone.paymentType}`.trim()
  );
}

function safeSlug(item: PublicSalesCatalogItem) {
  return item.publicDetails.slug
    || item.code.toLowerCase().replace(/^pf-/, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function packageCard(item: PublicSalesCatalogItem) {
  const details = item.publicDetails;
  return {
    id: safeSlug(item),
    productCode: item.code,
    name: item.name,
    price: formatCatalogPrice(item),
    pricePrefix: item.priceMode === 'custom'
      ? 'Scoped for your system'
      : item.priceMode === 'starting_at'
        ? 'Starting at'
        : 'Fixed price',
    badge: details.badge || 'Website package',
    summary: details.summary || item.fullDescription || item.shortDescription || '',
    bestFor: details.bestFor || item.shortDescription || 'Businesses whose requirements match this approved scope.',
    features: item.scope,
    technologies: details.technologies,
    quote: details.quote || `We need the ${item.name} scope for our project.`,
    ctaText: details.ctaText || `Choose ${item.name}`,
    ctaUrl: details.ctaUrl || '/contact-us',
    featured: details.featured,
    standardPaymentTerms: item.standardPaymentTerms,
    paymentSchedule: item.paymentSchedule,
    managerApprovalRequired: item.managerApprovalRequired
  };
}

function carePlanCard(item: PublicSalesCatalogItem) {
  const details = item.publicDetails;
  return {
    id: safeSlug(item),
    productCode: item.code,
    name: item.name,
    price: formatCatalogPrice(item, false),
    period: formatBillingPeriod(item.billingPeriod),
    badge: details.badge || 'Website care',
    description: details.summary || item.fullDescription || item.shortDescription || '',
    features: item.scope,
    ctaText: details.ctaText || `Choose ${item.name}`,
    ctaUrl: details.ctaUrl || '/contact-us',
    featured: details.featured
  };
}

function comparisonValue(label: string, item: PublicSalesCatalogItem) {
  if (label.trim().toLowerCase() === 'starting price') return formatCatalogPrice(item);
  return item.publicDetails.comparison[label] || '—';
}

function publicPackageOffers(catalog: PublicSalesCatalogItem[]) {
  return catalog
    .filter(item => item.productType === 'package' || item.productType === 'custom')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

function buildCommercialData(page: Partial<CustomPage> | undefined, catalog: PublicSalesCatalogItem[]) {
  const source = { ...defaultPricingTemplateData, ...(page?.serviceDetailData || {}) } as any;
  const packageItems = publicPackageOffers(catalog);
  const careItems = publicCatalogByType(catalog, 'care_plan');
  const plans = packageItems.map(packageCard);

  // Categories/row labels are presentation copy owned by the Pricing template.
  // Every value inside the package columns is owned by the canonical Sales Catalog.
  const comparison = { ...defaultPricingTemplateData.comparison, ...(source.comparison || {}) } as any;
  const comparisonCategories = (comparison.categories || []).map((category: any) => ({
    ...category,
    rows: (category.rows || []).map((row: any) => ({
      ...row,
      values: packageItems.map(item => comparisonValue(String(row.label || ''), item))
    }))
  }));

  const scopeAndPayment = {
    ...defaultPricingTemplateData.scopeAndPayment,
    ...(source.scopeAndPayment || {})
  } as any;
  const paymentPlans = packageItems.map(item => ({
    name: item.name,
    milestones: milestoneText(item)
  }));

  const carePlans = {
    ...defaultPricingTemplateData.carePlans,
    ...(source.carePlans || {}),
    plans: careItems.map(carePlanCard)
  };

  const pricedPackages = packageItems
    .filter(item => item.priceMode !== 'custom')
    .sort((a, b) => a.basePrice - b.basePrice);
  const heroHighlight = pricedPackages[0]
    ? `Starting at ${formatCatalogPrice(pricedPackages[0], false)}.`
    : source.hero?.highlight;

  return {
    ...source,
    hero: { ...defaultPricingTemplateData.hero, ...(source.hero || {}), highlight: heroHighlight },
    plansEyebrow: `${plans.length} clear starting point${plans.length === 1 ? '' : 's'}`,
    plans,
    comparison: { ...comparison, categories: comparisonCategories },
    scopeAndPayment: { ...scopeAndPayment, paymentPlans },
    carePlans
  };
}

function ensureMeta(name: string, value: string) {
  let node = document.querySelector(`meta[name="${name}"]`);
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute('name', name);
    document.head.appendChild(node);
  }
  node.setAttribute('content', value);
}

export default function PricingCatalogPage() {
  const { content, loading: cmsLoading } = useCMS();
  const [catalog, setCatalog] = useState<PublicSalesCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');

  const page = useMemo(() => {
    const stored = Array.isArray(content.customPages) ? content.customPages : [];
    return stored.find(
      (item: any) => item.slug === 'pricing' || item.id === 'plans-pricing' || item.template === 'plans-pricing'
    ) || pricingPageFallback;
  }, [content.customPages]);

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    setCatalogError('');
    getPublicSalesCatalog()
      .then(items => { if (active) setCatalog(items); })
      .catch(error => { if (active) setCatalogError(error?.message || 'Pricing is temporarily unavailable.'); })
      .finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!page) return;
    const businessName = content.siteSettings?.businessName || 'ProFox Web Designer';
    document.title = page.seo?.metaTitle || `${page.title || 'Pricing'} | ${businessName}`;
    ensureMeta(
      'description',
      page.seo?.metaDescription || page.heroSubtitle || 'Website design and development pricing from ProFox Web Designer.'
    );
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', 'https://www.profoxwebdesigner.com/pricing');
  }, [page, content.siteSettings?.businessName]);

  if (cmsLoading || catalogLoading) {
    return <div className="flex min-h-[70vh] items-center justify-center bg-white"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  }

  const publicPackages = publicPackageOffers(catalog);
  if (catalogError || publicPackages.length === 0) {
    return <div className="min-h-[70vh] bg-white px-6 py-40 text-slate-950"><div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center sm:p-12"><div className="text-xs font-black uppercase tracking-[0.16em] text-[#000080]">Pricing update in progress</div><h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">We are refreshing the latest package information.</h1><p className="mt-4 text-base leading-7 text-slate-600">To avoid showing an outdated price, inclusion or payment schedule, the pricing cards are temporarily hidden. You can still contact ProFox for the current approved scope and investment.</p><Link to="/contact-us" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-bold text-white">Contact ProFox <ArrowRight className="h-4 w-4" /></Link></div></div>;
  }

  const commercialData = buildCommercialData(page, catalog);
  return <PricingDetailView page={{ ...(page || {}), serviceDetailData: commercialData }} />;
}
