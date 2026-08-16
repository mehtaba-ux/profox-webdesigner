import React from 'react';

export interface TechStackOption {
  id: string;
  name: string;
  category: 'Languages & Frameworks' | 'CMS & E-Commerce' | 'Backend & APIs' | 'Database & Cloud' | 'Frontend & Design';
  description?: string;
  badgeColor: string; // Tailwind background/text styling
  iconName: string;
}

export const PREDEFINED_TECH_STACK: TechStackOption[] = [
  // CMS & E-Commerce
  { id: 'wordpress', name: 'WordPress', category: 'CMS & E-Commerce', badgeColor: 'bg-blue-50 text-blue-700 border-blue-200', iconName: 'Globe' },
  { id: 'shopify', name: 'Shopify', category: 'CMS & E-Commerce', badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200', iconName: 'ShoppingBag' },
  { id: 'woocommerce', name: 'WooCommerce', category: 'CMS & E-Commerce', badgeColor: 'bg-purple-50 text-purple-700 border-purple-200', iconName: 'ShoppingCart' },
  { id: 'magento', name: 'Magento', category: 'CMS & E-Commerce', badgeColor: 'bg-amber-50 text-amber-800 border-amber-200', iconName: 'Store' },
  { id: 'webflow', name: 'Webflow', category: 'CMS & E-Commerce', badgeColor: 'bg-sky-50 text-sky-700 border-sky-200', iconName: 'LayoutTemplate' },
  { id: 'headless-cms', name: 'Headless CMS', category: 'CMS & E-Commerce', badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200', iconName: 'Workflow' },
  { id: 'hubspot', name: 'HubSpot Integration', category: 'CMS & E-Commerce', badgeColor: 'bg-orange-50 text-orange-700 border-orange-200', iconName: 'Target' },

  // Languages & Frameworks
  { id: 'javascript', name: 'JavaScript (ES6+)', category: 'Languages & Frameworks', badgeColor: 'bg-yellow-50 text-yellow-800 border-yellow-200', iconName: 'Code2' },
  { id: 'typescript', name: 'TypeScript', category: 'Languages & Frameworks', badgeColor: 'bg-blue-50 text-blue-800 border-blue-300', iconName: 'FileCode2' },
  { id: 'react', name: 'React.js', category: 'Languages & Frameworks', badgeColor: 'bg-sky-50 text-sky-700 border-sky-200', iconName: 'Atom' },
  { id: 'nextjs', name: 'Next.js', category: 'Languages & Frameworks', badgeColor: 'bg-slate-100 text-slate-900 border-slate-300', iconName: 'Cpu' },
  { id: 'vue', name: 'Vue.js', category: 'Languages & Frameworks', badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200', iconName: 'Layout' },
  { id: 'php', name: 'PHP', category: 'Languages & Frameworks', badgeColor: 'bg-indigo-50 text-indigo-800 border-indigo-200', iconName: 'Terminal' },
  { id: 'python', name: 'Python', category: 'Languages & Frameworks', badgeColor: 'bg-blue-50 text-blue-900 border-blue-200', iconName: 'Code' },
  { id: 'html-css', name: 'HTML5 & CSS3', category: 'Languages & Frameworks', badgeColor: 'bg-orange-50 text-orange-800 border-orange-200', iconName: 'FileCode' },
  { id: 'redux', name: 'Redux State Engine', category: 'Languages & Frameworks', badgeColor: 'bg-purple-50 text-purple-800 border-purple-200', iconName: 'RefreshCw' },

  // Backend & APIs
  { id: 'nodejs', name: 'Node.js', category: 'Backend & APIs', badgeColor: 'bg-green-50 text-green-800 border-green-200', iconName: 'Server' },
  { id: 'express', name: 'Express.js', category: 'Backend & APIs', badgeColor: 'bg-slate-100 text-slate-800 border-slate-300', iconName: 'Zap' },
  { id: 'laravel', name: 'Laravel Framework', category: 'Backend & APIs', badgeColor: 'bg-rose-50 text-rose-700 border-rose-200', iconName: 'Boxes' },
  { id: 'graphql', name: 'GraphQL API', category: 'Backend & APIs', badgeColor: 'bg-pink-50 text-pink-700 border-pink-200', iconName: 'Network' },
  { id: 'rest-api', name: 'RESTful Web APIs', category: 'Backend & APIs', badgeColor: 'bg-teal-50 text-teal-800 border-teal-200', iconName: 'Link' },
  { id: 'websockets', name: 'WebSockets & Realtime', category: 'Backend & APIs', badgeColor: 'bg-violet-50 text-violet-800 border-violet-200', iconName: 'Radio' },
  { id: 'stripe', name: 'Stripe Payment Gateway', category: 'Backend & APIs', badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200', iconName: 'CreditCard' },
  { id: 'gemini-ai', name: 'Gemini AI Integration', category: 'Backend & APIs', badgeColor: 'bg-sky-50 text-sky-800 border-sky-300', iconName: 'Sparkles' },

  // Database & Cloud
  { id: 'postgresql', name: 'PostgreSQL', category: 'Database & Cloud', badgeColor: 'bg-blue-50 text-blue-800 border-blue-200', iconName: 'Database' },
  { id: 'mysql', name: 'MySQL Database', category: 'Database & Cloud', badgeColor: 'bg-sky-50 text-sky-900 border-sky-200', iconName: 'Database' },
  { id: 'mongodb', name: 'MongoDB', category: 'Database & Cloud', badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200', iconName: 'HardDrive' },
  { id: 'supabase', name: 'Supabase / PostgreSQL', category: 'Database & Cloud', badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200', iconName: 'Database' },
  { id: 'aws', name: 'AWS Cloud Services', category: 'Database & Cloud', badgeColor: 'bg-orange-50 text-orange-800 border-orange-200', iconName: 'Cloud' },
  { id: 'gcp', name: 'Google Cloud Platform', category: 'Database & Cloud', badgeColor: 'bg-blue-50 text-blue-700 border-blue-200', iconName: 'CloudLightning' },
  { id: 'docker', name: 'Docker Containers', category: 'Database & Cloud', badgeColor: 'bg-cyan-50 text-cyan-800 border-cyan-200', iconName: 'Box' },
  { id: 'elasticsearch', name: 'Elasticsearch / Algolia', category: 'Database & Cloud', badgeColor: 'bg-teal-50 text-teal-800 border-teal-200', iconName: 'Search' },

  // Frontend & Design
  { id: 'tailwind', name: 'Tailwind CSS', category: 'Frontend & Design', badgeColor: 'bg-sky-50 text-sky-700 border-sky-200', iconName: 'Palette' },
  { id: 'figma', name: 'Figma Design System', category: 'Frontend & Design', badgeColor: 'bg-rose-50 text-rose-800 border-rose-200', iconName: 'PenTool' },
  { id: 'adobe-xd', name: 'Adobe XD / Illustrator', category: 'Frontend & Design', badgeColor: 'bg-pink-50 text-pink-800 border-pink-200', iconName: 'Layout' }
];
