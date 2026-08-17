import type { NavItem } from '../types';

export const CORE_SERVICE_LINKS: NavItem[] = [
  { 
    label: 'Website Design & Development', 
    href: '/services/website-design-and-development',
    description: 'High-performance corporate websites engineered to load instantly and convert visitors into high-value leads.',
    badge: 'Popular'
  },
  { 
    label: 'Web & Mobile Application Development', 
    href: '/services/web-and-mobile-application-development',
    description: 'Scalable, custom SaaS portals and mobile applications built with elite UX for maximum customer retention.',
    badge: 'Enterprise'
  },
  { 
    label: 'Email Marketing & Business Automation', 
    href: '/services/email-marketing-and-business-automation',
    description: 'Smart CRM integrations and automated nurturing workflows designed to drive recurring revenue on autopilot.',
    badge: 'ROI-Driven'
  },
];

export const DEFAULT_MAIN_NAVIGATION: NavItem[] = [
  {
    label: 'Services',
    href: '/services/website-design-and-development',
    children: CORE_SERVICE_LINKS,
  },
  {
    label: 'Case Study',
    href: '/portfolio',
    badge: 'CASE STUDIES',
    children: [
      { 
        label: 'All Projects', 
        href: '/portfolio',
        description: 'Explore our full catalog of delivered metrics, system transformations, and verified customer success.',
        badge: 'All Results'
      },
      { 
        label: 'Web Design', 
        href: '/portfolio/web-design',
        description: 'Bespoke, award-winning corporate interfaces crafted to establish industry authority and brand trust.',
        badge: 'Websites'
      },
      { 
        label: 'App Development', 
        href: '/portfolio/app-development',
        description: 'High-speed custom web portals, mobile platforms, and robust system integrations.',
        badge: 'Software'
      }
    ]
  },
  { label: 'Pricing', href: '/pricing' },
  { label: 'About Us', href: '/about-us' },
  { label: 'Carear', href: '/careers' },
  { label: 'Contact Us', href: '/contact-us' },
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

const HIGH_CONVERTING_FALLBACKS: Record<string, { description: string; badge?: string }> = {
  '/services/website-design-and-development': {
    description: 'High-performance corporate websites engineered to load instantly and convert visitors into high-value leads.',
    badge: 'Popular'
  },
  '/services/web-and-mobile-application-development': {
    description: 'Scalable, custom SaaS portals and mobile applications built with elite UX for maximum customer retention.',
    badge: 'Enterprise'
  },
  '/services/email-marketing-and-business-automation': {
    description: 'Smart CRM integrations and automated nurturing workflows designed to drive recurring revenue on autopilot.',
    badge: 'ROI-Driven'
  },
  '/portfolio': {
    description: 'Explore our full catalog of delivered metrics, system transformations, and verified customer success.',
    badge: 'All Results'
  },
  '/portfolio/web-design': {
    description: 'Bespoke, award-winning corporate interfaces crafted to establish industry authority and brand trust.',
    badge: 'Websites'
  },
  '/portfolio/app-development': {
    description: 'High-speed custom web portals, mobile platforms, and robust system integrations.',
    badge: 'Software'
  }
};

export function normalizeNavigationHref(href?: string, label?: string) {
  const value = String(href || '').trim();
  if (!value || value === '#') return pathFromLabel(label);
  return LEGACY_PATHS[value.toLowerCase()] || value;
}

export function normalizeNavigationMenu(items?: NavItem[]): NavItem[] {
  const source = Array.isArray(items) ? items : DEFAULT_MAIN_NAVIGATION;
  return source
    .filter(item => item && String(item.label || '').trim())
    .map(item => {
      const normalizedHref = normalizeNavigationHref(item.href, item.label);
      const labelLower = String(item.label).toLowerCase();
      
      // Auto-enable mega menu style for key hub categories
      const isMegaMenu = item.isMegaMenu || 
        labelLower === 'services' || 
        labelLower === 'case study' || 
        labelLower === 'case studies' || 
        labelLower === 'portfolio' ||
        (item.children && item.children.length >= 3);

      const fallback = (HIGH_CONVERTING_FALLBACKS[normalizedHref] || {}) as { description?: string; badge?: string };

      return {
        ...item,
        label: String(item.label).trim(),
        href: normalizedHref,
        target: item.target === '_blank' ? '_blank' : '_self',
        isMegaMenu,
        description: item.description || fallback.description || '',
        badge: item.badge || fallback.badge || undefined,
        children: item.children?.length ? normalizeNavigationMenu(item.children) : undefined,
        megaColumns: item.megaColumns?.map(column => ({
          ...column,
          items: normalizeNavigationMenu(column.items),
        })),
      };
    });
}

export function isInternalNavigationHref(href: string) {
  return href.startsWith('/') && !href.startsWith('//');
}
