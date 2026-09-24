import { CustomPage } from '../types';

export const SEO_SITE_ORIGIN = (import.meta.env.VITE_SITE_URL || 'https://www.profoxwebdesigner.com').replace(/\/$/, '');

const SERVICE_TEMPLATES = new Set([
  'service-detail',
  'web-mobile-dev',
  'ai-automation',
  'digital-experience',
  'technology-solutions',
  'website-design-development',
]);

const CORE_PATHS: Record<string, string> = {
  pricing: '/pricing',
  'plans-pricing': '/pricing',
  'about-us': '/about-us',
  about: '/about-us',
  careers: '/careers',
  career: '/careers',
  carear: '/careers',
  jobs: '/careers',
  carriers: '/careers',
  offers: '/careers',
  'contact-us': '/contact-us',
  contact: '/contact-us',
  'privacy-policy': '/privacy-policy',
  privacy: '/privacy-policy',
  'terms-and-conditions': '/terms-and-conditions',
  terms: '/terms-and-conditions',
  'cookie-policy': '/cookie-policy',
  cookies: '/cookie-policy',
  'website-design-and-development': '/services/website-design-and-development',
  'web-and-mobile-application-development': '/services/web-and-mobile-application-development',
  'email-marketing-and-business-automation': '/services/email-marketing-and-business-automation',
};

export function sanitizeSeoSlug(value?: string) {
  return (value || 'page')
    .toLowerCase()
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9/]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'page';
}

type SeoPage = Pick<Partial<CustomPage>, 'id' | 'slug' | 'template'>;

export function isServicePage(page?: SeoPage | null) {
  if (!page) return false;
  const template = String(page.template || '').toLowerCase();
  return SERVICE_TEMPLATES.has(template) || template.includes('service');
}

export function getPagePath(page?: SeoPage | null) {
  if (!page) return '/';
  const slug = sanitizeSeoSlug(page.slug || page.id);
  const id = sanitizeSeoSlug(page.id);
  const corePath = CORE_PATHS[slug] || CORE_PATHS[id];
  if (corePath) return corePath;
  if (slug.startsWith('services/')) return `/${slug}`;
  if (isServicePage(page)) return `/services/${slug.replace(/^services\//, '')}`;
  return `/${slug}`;
}

export function getCanonicalUrl(page: SeoPage, origin = SEO_SITE_ORIGIN) {
  const resolvedOrigin = origin.replace(/\/$/, '');
  return `${resolvedOrigin}${getPagePath(page)}`;
}
