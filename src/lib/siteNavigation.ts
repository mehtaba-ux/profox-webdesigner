import type { NavItem } from '../types';

export const CORE_SERVICE_LINKS: NavItem[] = [
  { label: 'Website Design & Development', href: '/services/website-design-and-development' },
  { label: 'Web & Mobile Application Development', href: '/services/web-and-mobile-application-development' },
  { label: 'Email Marketing & Business Automation', href: '/services/email-marketing-and-business-automation' },
];

export const DEFAULT_MAIN_NAVIGATION: NavItem[] = [
  {
    label: 'Services',
    href: '/services/website-design-and-development',
    children: CORE_SERVICE_LINKS,
  },
  { label: 'Portfolio', href: '/portfolio' },
  { label: 'About', href: '/about-us' },
  { label: 'Careers', href: '/careers' },
  { label: 'Insights', href: '/blog' },
];

const LEGACY_PATHS: Record<string, string> = {
  '#services': '/services/website-design-and-development',
  '#case-studies': '/portfolio',
  '#portfolio': '/portfolio',
  '#insights': '/blog',
  '#resources': '/blog',
  '#contact': '/contact-us',
  '#cta': '/contact-us',
  '/services/digital-experience': '/services/website-design-and-development',
  '/services/technology-solutions': '/services/web-and-mobile-application-development',
  '/services/ai-automation': '/services/email-marketing-and-business-automation',
  '/about': '/about-us',
  '/contact': '/contact-us',
};

function pathFromLabel(label = '') {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (normalized === 'home' || normalized === 'overview') return '/';
  if (normalized.includes('service')) return '/services/website-design-and-development';
  if (normalized.includes('portfolio') || normalized.includes('case stud')) return '/portfolio';
  if (normalized.includes('about')) return '/about-us';
  if (normalized.includes('career') || normalized.includes('job')) return '/careers';
  if (normalized.includes('insight') || normalized.includes('resource') || normalized.includes('blog')) return '/blog';
  if (normalized.includes('contact') || normalized.includes('talk')) return '/contact-us';
  return '/';
}

export function normalizeNavigationHref(href?: string, label?: string) {
  const value = String(href || '').trim();
  if (!value || value === '#') return pathFromLabel(label);
  return LEGACY_PATHS[value.toLowerCase()] || value;
}

export function normalizeNavigationMenu(items?: NavItem[]): NavItem[] {
  const source = Array.isArray(items) ? items : DEFAULT_MAIN_NAVIGATION;
  return source
    .filter(item => item && String(item.label || '').trim())
    .map(item => ({
      ...item,
      label: String(item.label).trim(),
      href: normalizeNavigationHref(item.href, item.label),
      target: item.target === '_blank' ? '_blank' : '_self',
      children: item.children?.length ? normalizeNavigationMenu(item.children) : undefined,
      megaColumns: item.megaColumns?.map(column => ({
        ...column,
        items: normalizeNavigationMenu(column.items),
      })),
    }));
}

export function isInternalNavigationHref(href: string) {
  return href.startsWith('/') && !href.startsWith('//');
}
