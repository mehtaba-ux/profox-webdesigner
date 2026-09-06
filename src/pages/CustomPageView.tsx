import React, { useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCMS } from '../lib/CMSProvider';
import { useAuth } from '../lib/AuthContext';
import { defaultCustomPages } from '../data';
import { CustomPage } from '../types';
import CTA from '../components/CTA';
import ServiceDetailView from './ServiceDetailView';
import AboutUsDetailView from './AboutUsDetailView';
import CareersDetailView from './CareersDetailView';
import ContactUsDetailView from './ContactUsDetailView';
import PrivacyPolicy from './PrivacyPolicy';
import PricingDetailView from './PricingDetailView';
import { defaultBlueprintsList } from '../components/admin/TemplateManager';
import { motion } from 'motion/react';
import { getCanonicalUrl, getPagePath } from '../lib/seoUrls';
import { resolveContactCtaUrl } from '../lib/contactCta';
import HeroReviewProof from '../components/HeroReviewProof';
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Award,
  User,
  FileText,
  Bot,
  Cpu,
  Edit3,
  ArrowUpRight,
  Quote,
} from 'lucide-react';

const iconMap: Record<string, any> = {
  award: Award,
  badgecheck: BadgeCheck,
  user: User,
  file: FileText,
  bot: Bot,
  cpu: Cpu,
  check: CheckCircle2
};

export default function CustomPageView() {
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { content, loading } = useCMS();
  const { isAdminOrEditor } = useAuth();

  // Find page from Supabase CMS content or defaults
  const customPages: CustomPage[] = (() => {
    const stored = content.customPages;
    if (!Array.isArray(stored) || stored.length === 0) {
      return defaultCustomPages;
    }
    const merged = stored.map((item: any) => {
      if (item.id === 'ai-agents' || item.id === 'email-marketing-and-business-automation' || (item.slug && item.slug.includes('email-marketing-and-business-automation'))) {
        const def = defaultCustomPages.find(d => d.id === 'email-marketing-and-business-automation')!;
        const cleanSeo = {
          ...(def.seo || {}),
          ...(item.seo || {}),
          metaTitle: (item.seo?.metaTitle && !item.seo.metaTitle.toLowerCase().includes('ai agent')) 
            ? item.seo.metaTitle 
            : 'Email Marketing & Business Automation | ProFox Web Designer',
          ogTitle: (item.seo?.ogTitle && !item.seo.ogTitle.toLowerCase().includes('ai agent'))
            ? item.seo.ogTitle
            : 'Email Marketing & Business Automation | ProFox Web Designer'
        };
        const cleanTitle = (item.title && !item.title.toLowerCase().includes('ai agent'))
          ? item.title
          : 'Email Marketing & Business Automation';
        return {
          ...def,
          ...item,
          id: 'email-marketing-and-business-automation',
          title: cleanTitle,
          slug: 'services/email-marketing-and-business-automation',
          template: 'ai-automation',
          seo: cleanSeo
        };
      }
      const def = defaultCustomPages.find(d => d.id === item.id || d.slug === item.slug);
      if (def) {
        return { ...def, ...item, seo: { ...def.seo, ...(item.seo || {}) } };
      }
      return item;
    });
    for (const def of defaultCustomPages) {
      if (!merged.some(p => p.id === def.id || p.slug === def.slug)) {
        merged.push(def);
      }
    }
    return merged;
  })();
  const routePath = window.location.pathname.replace(/\/+$/, '') || '/';
  const page = customPages.find(p => {
    const path = getPagePath(p);
    const cleanRouteSlug = routeSlug ? routeSlug.replace(/^services\//, '') : '';
    const cleanPageSlug = p.slug ? p.slug.replace(/^services\//, '') : '';
    return path === routePath || 
           p.slug === routeSlug || 
           p.id === routeSlug ||
           cleanPageSlug === cleanRouteSlug ||
           p.id === cleanRouteSlug;
  });
  const slug = page?.slug || routeSlug;

  // SEO Meta Tag Inserter
  useEffect(() => {
    if (!page) return;

    // Document Title
    const bizName = content.siteSettings?.businessName || 'Profox web designer';
    let pageTitle = page.seo?.metaTitle;
    if (!pageTitle || pageTitle.includes('Untitled Page') || pageTitle.includes('Dotlogics')) {
      const displayTitle = (page.title && page.title !== 'Untitled Page') ? page.title : (page.heroTitle || 'Custom Page');
      pageTitle = `${displayTitle} | ${bizName}`;
    } else if (pageTitle.includes('Dotlogics')) {
      pageTitle = pageTitle.replace(/Dotlogics/g, bizName);
    }
    document.title = pageTitle;

    // Meta Description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', page.seo?.metaDescription || page.heroSubtitle || '');

    // Meta Keywords
    if (page.seo?.focusKeyword) {
      let metaKw = document.querySelector('meta[name="keywords"]');
      if (!metaKw) {
        metaKw = document.createElement('meta');
        metaKw.setAttribute('name', 'keywords');
        document.head.appendChild(metaKw);
      }
      metaKw.setAttribute('content', page.seo.focusKeyword);
    }

    // Robots / Indexing Meta Tag
    let metaRobots = document.querySelector('meta[name="robots"]');
    if (!metaRobots) {
      metaRobots = document.createElement('meta');
      metaRobots.setAttribute('name', 'robots');
      document.head.appendChild(metaRobots);
    }
    metaRobots.setAttribute('content', page.seo?.noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');

    // Canonical Link
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    const canonicalUrl = getCanonicalUrl(page);
    canonical.setAttribute('href', canonicalUrl);

    // OpenGraph & Twitter Meta Tags
    const ogTags = [
      { property: 'og:title', content: page.seo?.ogTitle || page.seo?.metaTitle || page.title },
      { property: 'og:description', content: page.seo?.ogDescription || page.seo?.metaDescription || page.heroSubtitle },
      { property: 'og:image', content: page.seo?.ogImage || page.coverImage || '' },
      { property: 'og:url', content: canonicalUrl },
      { property: 'og:type', content: 'website' },
      { property: 'twitter:card', content: 'summary_large_image' },
      { property: 'twitter:title', content: 'twitter:title' in (page.seo || {}) ? page.seo?.ogTitle || page.seo?.metaTitle || page.title : page.seo?.ogTitle || page.seo?.metaTitle || page.title },
      { property: 'twitter:description', content: page.seo?.ogDescription || page.seo?.metaDescription || page.heroSubtitle },
      { property: 'twitter:image', content: page.seo?.ogImage || page.coverImage || '' }
    ];

    ogTags.forEach(tag => {
      if (!tag.content) return;
      const selector = tag.property.startsWith('twitter:') 
        ? `meta[name="${tag.property}"]` 
        : `meta[property="${tag.property}"]`;
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        if (tag.property.startsWith('twitter:')) {
          el.setAttribute('name', tag.property);
        } else {
          el.setAttribute('property', tag.property);
        }
        document.head.appendChild(el);
      }
      el.setAttribute('content', tag.content);
    });

    // Schema.org JSON-LD Injection
    let schemaScript = document.querySelector('#seo-schema-jsonld');
    if (!schemaScript) {
      schemaScript = document.createElement('script');
      schemaScript.setAttribute('id', 'seo-schema-jsonld');
      schemaScript.setAttribute('type', 'application/ld+json');
      document.head.appendChild(schemaScript);
    }
    schemaScript.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": page.seo?.schemaType || "WebPage",
      "name": page.seo?.metaTitle || page.title,
      "description": page.seo?.metaDescription || page.heroSubtitle,
      "url": canonicalUrl,
      "publisher": {
        "@type": "Organization",
        "name": content.siteSettings?.businessName || "Profox web designer"
      },
      "datePublished": page.createdAt,
      "dateModified": page.updatedAt
    });

    return () => {
      document.title = `${content.siteSettings?.businessName || 'Profox web designer'} - Premium High-End Web Design & Digital Solutions`;
    };
  }, [page, content.siteSettings?.businessName]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-slate-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#000080]/20 border-t-[#000080] rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!page) {
    if (slug === 'careers' || slug === 'jobs' || slug === 'carriers' || slug === 'offers') {
      return <CareersDetailView />;
    }

    return (
      <div className="min-h-screen bg-white text-slate-900 flex flex-col justify-between">
        <div className="max-w-xl mx-auto px-6 py-40 text-center space-y-6">
          <div className="w-16 h-16 bg-slate-100 border border-slate-300 text-[#000080] rounded-2xl flex items-center justify-center mx-auto shadow-xl">
            <FileText className="w-8 h-8" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">404 - Page Not Found</h1>
          <p className="text-slate-600">
            The page <code className="text-[#000080] bg-slate-100 px-2 py-0.5 rounded">{window.location.pathname}</code> does not exist or has been deleted in the CMS.
          </p>
          <div className="pt-4">
            <Link to="/" className="inline-flex items-center gap-2 bg-[#000080] hover:bg-[#000066] text-white font-bold px-6 py-3 rounded-xl text-sm transition-all shadow-lg">
              <ArrowLeft className="w-4 h-4" /> Return to Homepage
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Handle Dynamic Blueprints
  const rawBlueprints = content.template_blueprints || [];
  let blueprints = [...rawBlueprints];
  for (const defBp of defaultBlueprintsList) {
    if (!blueprints.some((b: any) => b.id === defBp.id)) {
      blueprints.push(defBp);
    }
  }
  const selectedBlueprint = blueprints.find((b: any) => b.id === page.template) || blueprints.find((b: any) => b.type === page.template);

  if (page.template === 'service-detail' || (selectedBlueprint && selectedBlueprint.type === 'service-detail')) {
    return <ServiceDetailView page={page} />;
  }

  if (page.template === 'plans-pricing' || page.template === 'pricing' || slug === 'pricing' || (selectedBlueprint && selectedBlueprint.type === 'pricing')) {
    return <PricingDetailView page={page} />;
  }

  if (page.template === 'about-us' || page.id === 'about-us' || slug === 'about' || (selectedBlueprint && selectedBlueprint.type === 'about-us')) {
    return <AboutUsDetailView page={page} />;
  }

  if (page.template === 'careers' || page.id === 'careers' || slug === 'careers' || slug === 'jobs' || slug === 'carriers' || slug === 'offers' || (selectedBlueprint && selectedBlueprint.type === 'careers')) {
    return <CareersDetailView page={page} />;
  }

  if (page.template === 'contact-us' || slug === 'contact' || slug === 'contact-us' || (selectedBlueprint && selectedBlueprint.type === 'contact-us')) {
    return <ContactUsDetailView page={page} />;
  }

  if (page.template === 'privacy-policy' || page.template === 'legal-policy' || (selectedBlueprint && (selectedBlueprint.type === 'legal-policy' || selectedBlueprint.id === 'privacy-policy'))) {
    return <PrivacyPolicy page={page} />;
  }

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-slate-100 selection:text-[#000080] overflow-x-hidden relative">
      
      {/* Hero Header */}
      <section className="relative pt-40 pb-24 bg-slate-50 text-slate-900 overflow-hidden">
        {page.coverImage && (
          <div className="absolute inset-0 z-0 opacity-20">
            <img src={page.coverImage} alt={page.title} className="w-full h-full object-cover filter blur-sm scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />
          </div>
        )}

        <div className="max-w-5xl mx-auto px-6 relative z-10">
          <Link to="/" className="inline-flex items-center gap-2 text-xs font-semibold text-[#000080] hover:text-[#000066] transition-colors mb-8 bg-white/5 border border-slate-200 px-3.5 py-1.5 rounded-full backdrop-blur-md">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            {page.heroSubheading && (
              <span className="inline-block text-[11px] font-bold text-[#000080] bg-[#000080]/10 border border-[#000080]/20 px-3 py-1 rounded-full uppercase tracking-wider mb-2">
                {page.heroSubheading}
              </span>
            )}
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 leading-tight">
              {page.heroTitle || page.title} {page.heroHighlight && <span className="text-[#000080]">{page.heroHighlight}</span>}
            </h1>
            <p className="text-lg md:text-xl text-slate-700 max-w-3xl leading-relaxed font-normal">
              {page.heroSubtitle}
            </p>

            <div className="flex flex-col items-start gap-4 pt-2 sm:flex-row sm:items-center">
              <Link to="/contact-us" className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-1">Start a Conversation <ArrowUpRight className="h-4 w-4" /></Link>
              <HeroReviewProof />
            </div>

            <div className="flex items-center gap-4 pt-4 text-xs text-slate-600 border-t border-slate-200">
              <span>Published: {page.createdAt}</span>
              <span>•</span>
              <span>Updated: {page.updatedAt}</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Main Body Content */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6 space-y-16">
          {page.coverImage && (
            <div className="rounded-3xl overflow-hidden shadow-2xl border border-slate-100 max-h-[480px]">
              <img src={page.coverImage} alt={page.title} className="w-full h-full object-cover" />
            </div>
          )}

          <div className="prose prose-lg max-w-none text-slate-700 leading-relaxed space-y-6">
            <p className="text-xl font-normal text-slate-900 leading-relaxed border-l-4 border-[#000080] pl-6 py-1">
              {page.bodyContent}
            </p>
          </div>

          {/* Render Custom Page Blocks */}
          {page.blocks && page.blocks.length > 0 && (
            <div className="space-y-16 pt-8 border-t border-slate-100">
              {page.blocks.map((block) => {
                // 1. FEATURES GRID
                if (block.type === 'features') {
                  return (
                    <div key={block.id} className="bg-slate-50 p-8 sm:p-12 rounded-3xl border border-slate-200/60 space-y-8">
                      <div>
                        {block.heading && <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">{block.heading}</h2>}
                        {block.subheading && <p className="text-slate-600 mt-2 text-base">{block.subheading}</p>}
                      </div>

                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {block.items?.map((item, i) => {
                          const IconComp = iconMap[item.icon || 'badgecheck'] || BadgeCheck;
                          return (
                            <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-3 hover:shadow-md transition-shadow">
                              <div className="w-10 h-10 bg-slate-50 text-[#000080] rounded-xl flex items-center justify-center">
                                <IconComp className="w-5 h-5" />
                              </div>
                              <h3 className="font-bold text-slate-900 text-base">{item.title}</h3>
                              <p className="text-sm text-slate-600 leading-relaxed">{item.description}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                // 2. TEXT & MEDIA
                if (block.type === 'text') {
                  return (
                    <div key={block.id} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                      <div className="space-y-4">
                        {block.heading && <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">{block.heading}</h2>}
                        {block.subheading && <p className="text-[#000080] font-semibold text-sm">{block.subheading}</p>}
                        {block.body && <p className="text-slate-600 leading-relaxed text-sm sm:text-base">{block.body}</p>}
                      </div>
                      {block.imageUrl && (
                        <div className="rounded-2xl overflow-hidden shadow-lg border border-slate-200">
                          <img src={block.imageUrl} alt={block.heading || 'Media'} className="w-full h-auto object-cover" />
                        </div>
                      )}
                    </div>
                  );
                }

                // 3. IMAGE BANNER
                if (block.type === 'image') {
                  return (
                    <div key={block.id} className="space-y-4">
                      {block.heading && <h2 className="text-2xl font-bold text-slate-900">{block.heading}</h2>}
                      {block.subheading && <p className="text-slate-600 text-sm">{block.subheading}</p>}
                      {block.imageUrl && (
                        <div className="rounded-3xl overflow-hidden shadow-xl border border-slate-200">
                          <img src={block.imageUrl} alt={block.heading || 'Banner'} className="w-full max-h-[500px] object-cover" />
                        </div>
                      )}
                    </div>
                  );
                }

                // 4. PHOTO GALLERY
                if (block.type === 'gallery') {
                  return (
                    <div key={block.id} className="space-y-6 bg-slate-50 p-8 sm:p-12 rounded-3xl border border-slate-200/60">
                      <div>
                        {block.heading && <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">{block.heading}</h2>}
                        {block.subheading && <p className="text-slate-600 mt-1 text-sm">{block.subheading}</p>}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {block.images?.map((imgUrl, i) => (
                          <div key={i} className="rounded-2xl overflow-hidden shadow-md border border-slate-200 group relative aspect-video">
                            <img src={imgUrl} alt={`Gallery ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                // 5. TESTIMONIAL QUOTE
                if (block.type === 'quote') {
                  return (
                    <div key={block.id} className="bg-white text-slate-900 p-8 sm:p-12 rounded-3xl relative overflow-hidden shadow-2xl flex flex-col md:flex-row items-center gap-8">
                      <Quote className="w-20 h-20 text-[#000080]/10 absolute right-6 top-6" />
                      {block.imageUrl && (
                        <img src={block.imageUrl} alt={block.heading || 'Author'} className="w-20 h-20 rounded-full object-cover border-2 border-[#000066] shrink-0" />
                      )}
                      <div className="relative z-10 space-y-3 text-center md:text-left">
                        <blockquote className="text-xl sm:text-2xl font-serif italic text-[#000066] leading-relaxed">
                          "{block.body || block.subheading}"
                        </blockquote>
                        {block.heading && <p className="text-sm font-bold text-slate-900 uppercase tracking-wider">{block.heading}</p>}
                        {block.subheading && <p className="text-xs text-slate-600">{block.subheading}</p>}
                      </div>
                    </div>
                  );
                }

                // 6. CALL TO ACTION
                if (block.type === 'cta') {
                  const bgStyle = block.bgColor === 'dark' 
                    ? 'bg-white text-slate-900' 
                    : block.bgColor === 'light' 
                    ? 'bg-slate-100 text-slate-900 border border-slate-200' 
                    : 'bg-gradient-to-br from-[#000080] to-teal-700 text-slate-900';

                  return (
                    <div key={block.id} className={`${bgStyle} p-10 sm:p-12 rounded-3xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-6`}>
                      <div className="space-y-2 text-center sm:text-left">
                        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{block.heading}</h2>
                        <p className="opacity-90 text-sm max-w-lg">{block.subheading || block.body}</p>
                      </div>
                      <a href={resolveContactCtaUrl(block.buttonText || 'Get Started', block.buttonUrl, `mailto:${content.siteSettings?.contactEmail || 'contact@profox-webdesigner.com'}`)} className="bg-white text-slate-900 px-8 py-3.5 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors shadow-lg shrink-0">
                        {block.buttonText || 'Get Started'}
                      </a>
                    </div>
                  );
                }

                // 7. FAQ ACCORDION
                if (block.type === 'faq') {
                  return (
                    <div key={block.id} className="bg-slate-50 p-8 sm:p-12 rounded-3xl border border-slate-200/60 space-y-8">
                      <div>
                        {block.heading && <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">{block.heading}</h2>}
                        {block.subheading && <p className="text-slate-600 mt-1 text-sm">{block.subheading}</p>}
                      </div>
                      <div className="space-y-4">
                        {block.items?.map((item, i) => (
                          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
                            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                              <span className="text-[#000080]">Q:</span> {item.title}
                            </h3>
                            <p className="text-sm text-slate-600 leading-relaxed pl-5 border-l-2 border-[#000080]">{item.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                // 8. PRICING PLANS
                if (block.type === 'pricing') {
                  return (
                    <div key={block.id} className="space-y-8 bg-white text-slate-900 p-8 sm:p-12 rounded-3xl shadow-2xl">
                      <div className="text-center max-w-2xl mx-auto space-y-2">
                        {block.heading && <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900">{block.heading}</h2>}
                        {block.subheading && <p className="text-slate-600 text-sm">{block.subheading}</p>}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {block.items?.map((item, i) => (
                          <div key={i} className="bg-slate-100 p-8 rounded-2xl border border-slate-300 relative flex flex-col justify-between space-y-6">
                            {item.badge && (
                              <span className="absolute -top-3 right-6 bg-[#000080] text-white font-bold text-[10px] uppercase px-3 py-1 rounded-full shadow">
                                {item.badge}
                              </span>
                            )}
                            <div className="space-y-4">
                              <h3 className="text-xl font-bold text-slate-900">{item.title}</h3>
                              <div className="text-3xl font-extrabold text-[#000080] font-mono">{item.price}</div>
                              <p className="text-xs text-slate-700 leading-relaxed">{item.description}</p>
                            </div>
                            <a href={resolveContactCtaUrl(item.buttonText || 'Choose Plan', item.buttonUrl)} className="block text-center bg-[#000080] hover:bg-[#000066] text-white font-bold px-6 py-3 rounded-xl text-xs transition-colors">
                              {item.buttonText || 'Choose Plan'}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                // 9. TEAM MEMBERS
                if (block.type === 'team') {
                  return (
                    <div key={block.id} className="space-y-8 bg-slate-50 p-8 sm:p-12 rounded-3xl border border-slate-200/60">
                      <div>
                        {block.heading && <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">{block.heading}</h2>}
                        {block.subheading && <p className="text-slate-600 mt-1 text-sm">{block.subheading}</p>}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {block.items?.map((item, i) => (
                          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center space-y-3">
                            {item.image && (
                              <img src={item.image} alt={item.title} className="w-24 h-24 rounded-full mx-auto object-cover border-2 border-[#000080]" />
                            )}
                            <div>
                              <h3 className="font-bold text-slate-900 text-base">{item.title}</h3>
                              <p className="text-xs font-semibold text-[#000080]">{item.role}</p>
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                // 10. KEY STATS
                if (block.type === 'stats') {
                  return (
                    <div key={block.id} className="bg-[#000080] text-white p-8 sm:p-12 rounded-3xl shadow-xl space-y-8">
                      <div>
                        {block.heading && <h2 className="text-2xl sm:text-3xl font-bold">{block.heading}</h2>}
                        {block.subheading && <p className="text-slate-100 text-sm mt-1">{block.subheading}</p>}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                        {block.items?.map((item, i) => (
                          <div key={i} className="bg-emerald-700/50 p-6 rounded-2xl backdrop-blur-sm border border-[#000066]/30">
                            <div className="text-3xl sm:text-4xl font-extrabold font-mono text-slate-900 mb-1">{item.statNumber}</div>
                            <div className="text-xs text-slate-100 font-medium">{item.statLabel}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                // 11. VIDEO EMBED
                if (block.type === 'video') {
                  return (
                    <div key={block.id} className="space-y-6 bg-white text-slate-900 p-8 sm:p-12 rounded-3xl shadow-2xl">
                      <div>
                        {block.heading && <h2 className="text-2xl sm:text-3xl font-bold">{block.heading}</h2>}
                        {block.subheading && <p className="text-slate-600 text-sm mt-1">{block.subheading}</p>}
                      </div>
                      {block.videoUrl && (
                        <div className="aspect-video rounded-2xl overflow-hidden shadow-2xl border border-slate-200">
                          <iframe
                            src={block.videoUrl}
                            title={block.heading || 'Video'}
                            className="w-full h-full border-0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      )}
                    </div>
                  );
                }

                return null;
              })}
            </div>
          )}
        </div>
      </section>

      <CTA />
      
      {/* Floating Admin Quick Edit Shortcut - ONLY FOR ADMIN/SITE MANAGER/EDITOR */}
      {isAdminOrEditor && (
        <button
          onClick={() => navigate('/admin')}
          className="fixed bottom-6 right-6 z-50 bg-white hover:bg-[#000066] text-slate-900 px-4 py-3 rounded-full shadow-2xl border border-slate-300 flex items-center gap-2 text-xs font-bold transition-all group hover:scale-105"
          title="Edit page in CMS Dashboard"
        >
          <Edit3 className="w-4 h-4 text-[#000080] group-hover:text-slate-900" />
          <span>Edit This Page in CMS</span>
        </button>
      )}
    </div>
  );
}
