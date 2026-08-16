import { CustomPage } from '../types';

export const SEO_SITE_ORIGIN = (import.meta.env.VITE_SITE_URL || 'https://www.profoxwebdesigner.com').replace(/\/$/, '');

const SERVICE_TEMPLATES = new Set([
  'service-detail',
  'web-mobile-dev',
  'ai-automation',
  'website-design-development',
]);

const CORE_PATHS: Record<string, string> = {
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
};

export function sanitizeSeoSlug(value?: string) {
  return (value || 'page')
    .toLowerCase()
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9]+/g, '-')
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
  if (isServicePage(page)) return `/services/${slug}`;
  return `/${slug}`;
}

export function getCanonicalUrl(page: SeoPage, origin = SEO_SITE_ORIGIN) {
  const resolvedOrigin = origin.replace(/\/$/, '');
  return `${resolvedOrigin}${getPagePath(page)}`;
}
