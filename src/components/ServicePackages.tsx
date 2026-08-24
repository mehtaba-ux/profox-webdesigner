import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, ArrowRight, Check, Loader2 } from 'lucide-react';
import { useCMS } from '../lib/CMSProvider';
import VisualEditable from './admin/VisualEditable';
import { resolveContactCtaUrl } from '../lib/contactCta';
import {
  PublicSalesCatalogItem,
  formatBillingPeriod,
  formatCatalogPrice,
  getPublicSalesCatalog
} from '../lib/publicSalesCatalogService';

export interface ServicePackage {
  id?: string;
  title: string;
  price?: string;
  period?: string;
  description?: string;
  features?: string[];
  popular?: boolean;
  badge?: string;
  ctaText?: string;
  ctaLink?: string;
}

interface ServicePackagesProps {
  isLiveEditing?: boolean;
}

export default function ServicePackages({ isLiveEditing = false }: ServicePackagesProps) {
  const { content } = useCMS();
  const [catalog, setCatalog] = useState<PublicSalesCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);

  // CMS owns only section presentation. Commercial package facts come from Sales Catalog.
  const packagesSectionData = content.servicePackages || {};
  const isEnabled = packagesSectionData.enabled === true;
  const sectionTitle = packagesSectionData.title || 'Our Services Packages';
  const sectionSubtitle = packagesSectionData.subtitle || 'Choose the current ProFox package that best matches the outcome your business needs.';

  useEffect(() => {
    let active = true;
    setCatalogError(false);
    getPublicSalesCatalog()
      .then(items => { if (active) setCatalog(items); })
      .catch(() => { if (active) setCatalogError(true); })
      .finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, []);

  // No fixed package codes or CMS package-card list. Any Active + Public catalog package/custom
  // appears automatically in Sales Catalog sort order.
  const packagesList = useMemo(
    () => catalog
      .filter(item => item.productType === 'package' || item.productType === 'custom')
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [catalog]
  );

  if (!isEnabled && !isLiveEditing) return null;

  const theme = content.theme || {};
  const primaryColor = theme.primaryColor || '#000080';
  const headingFont = theme.fontFamily || 'Inter';

  return (
    <section id="service-packages" className={`relative z-20 border-t border-slate-100 bg-slate-50 py-24 ${!isEnabled ? 'opacity-50 grayscale' : ''}`}>
      <div className="mx-auto max-w-[1400px] px-6">
        <div className="mb-16 max-w-3xl">
          <span className="mb-4 inline-block rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-widest" style={{ color: primaryColor, backgroundColor: `${primaryColor}10` }}>
            Flexible Plans
          </span>
          <h2 className="mb-4 text-4xl font-normal tracking-tight text-slate-900 md:text-5xl" style={{ fontFamily: headingFont }}>
            <VisualEditable section="servicePackages" field="title" value={sectionTitle} label="Packages Section Title" isLiveEditing={isLiveEditing}>
              {sectionTitle}
            </VisualEditable>
          </h2>
          <p className="text-lg font-normal leading-relaxed text-slate-600">
            <VisualEditable section="servicePackages" field="subtitle" value={sectionSubtitle} label="Packages Section Subtitle" isLiveEditing={isLiveEditing}>
              {sectionSubtitle}
            </VisualEditable>
          </p>
        </div>

        {catalogLoading ? (
          <div className="flex min-h-52 items-center justify-center rounded-3xl border border-slate-200 bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-[#000080]" />
          </div>
        ) : catalogError || packagesList.length === 0 ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div><strong>Package pricing is being refreshed.</strong><div className="mt-1 text-amber-800">We hide package cards rather than show an outdated price or inclusion.</div></div>
          </div>
        ) : (
          <div className="grid items-stretch gap-8 md:grid-cols-2 lg:grid-cols-3">
            {packagesList.map((product, idx) => {
              const details = product.publicDetails;
              const isPopular = details.featured === true;
              const description = details.summary || product.shortDescription || product.fullDescription || '';
              const ctaText = details.ctaText || 'View Package';
              const ctaLink = details.ctaUrl || '/contact-us';

              return (
                <motion.div
                  key={product.code}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.08 }}
                  className={`relative flex flex-col rounded-3xl bg-white p-8 text-slate-900 transition-all duration-300 ${isPopular ? 'z-10 border-2 shadow-2xl' : 'border border-slate-100 shadow-sm hover:shadow-md'}`}
                  style={isPopular ? { borderColor: primaryColor } : {}}
                >
                  {details.badge && <div className="absolute right-6 top-6"><span className={`rounded-full px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider ${isPopular ? 'bg-[#000080] text-white' : 'bg-slate-100 text-slate-600'}`} style={!isPopular ? { color: primaryColor, backgroundColor: `${primaryColor}10` } : {}}>{details.badge}</span></div>}

                  <div className="mb-8 pr-16">
                    <h3 className="mb-3 text-2xl font-semibold tracking-tight" style={{ fontFamily: headingFont }}>{product.name}</h3>
                    <p className="text-sm leading-relaxed text-slate-500">{description}</p>
                  </div>

                  <div className="mb-8 border-t border-slate-200 pt-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold tracking-tight">{formatCatalogPrice(product)}</span>
                      {product.billingPeriod && <span className="text-sm text-slate-500">{formatBillingPeriod(product.billingPeriod)}</span>}
                    </div>
                    {details.bestFor && <div className="mt-3 text-xs font-medium text-[#000080]">Best for: {details.bestFor}</div>}
                  </div>

                  <div className="mb-8 flex-1 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">What's Included</h4>
                    <ul className="space-y-3.5">
                      {product.scope.map((feature, featureIndex) => <li key={`${product.code}-${featureIndex}`} className="flex items-start gap-3 text-sm"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${primaryColor}15` }}><Check className="h-3.5 w-3.5" style={{ color: primaryColor }} /></span><span className="text-slate-700">{feature}</span></li>)}
                    </ul>
                  </div>

                  <div className="mt-auto pt-6">
                    <a href={resolveContactCtaUrl(ctaText, ctaLink, '/contact-us')} className="flex w-full items-center justify-center gap-2.5 rounded-xl px-6 py-4 text-center text-sm font-bold text-white transition-all" style={{ backgroundColor: isPopular ? primaryColor : '#0f172a' }}><span>{ctaText}</span><ArrowRight className="h-4 w-4" /></a>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
