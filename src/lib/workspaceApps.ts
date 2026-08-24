import { UserRole, UserStatus } from '../types';

export type WorkspaceAppId =
  | 'website'
  | 'crm'
  | 'sales'
  | 'sales_academy'
  | 'calendar'
  | 'clients'
  | 'projects'
  | 'content_academy'
  | 'design_academy'
  | 'developer_academy'
  | 'recruitment'
  | 'academy'
  | 'academy_governance'
  | 'commissions'
  | 'intelligence'
  | 'team'
  | 'internal_chat'
  | 'settings';

export type WorkspaceIconName = 'globe'|'users'|'receipt'|'calendar'|'building'|'briefcase'|'userPlus'|'book'|'award'|'chart'|'userCog'|'message'|'settings';
export type WorkspaceGroupId = 'leadership'|'growth'|'delivery'|'people'|'brand'|'operations';

export interface WorkspaceGroupDefinition {
  id: WorkspaceGroupId;
  label: string;
  description: string;
}

export interface WorkspaceNavItem {
  id: string;
  label: string;
  tab?: string;
  path?: string;
  section?: string;
  roles?: UserRole[];
  statuses?: UserStatus[];
}

export interface WorkspaceAppDefinition {
  id: WorkspaceAppId;
  label: string;
  shortLabel: string;
  description: string;
  group: WorkspaceGroupId;
  icon: WorkspaceIconName;
  iconClass: string;
  iconBackgroundClass: string;
  roles: UserRole[];
  statuses?: UserStatus[];
  defaultTab?: string;
  launchPath?: string;
  items: WorkspaceNavItem[];
}

export const WORKSPACE_GROUPS: WorkspaceGroupDefinition[] = [
  { id: 'leadership', label: 'Leadership', description: 'Founder oversight, business health and management exceptions.' },
  { id: 'growth', label: 'Sales & Client Growth', description: 'Sales team CRM, commercial operations, meetings, client growth and the Sales & Funnel Academy.' },
  { id: 'delivery', label: 'Client Delivery', description: 'Project management plus Content, Design, Development and QA execution with team-specific academies.' },
  { id: 'people', label: 'People & Talent', description: 'Hiring, onboarding, cross-team academy governance and team administration.' },
  { id: 'brand', label: 'Brand & Website', description: 'Public website content, publishing, portfolio, media and presentation.' },
  { id: 'operations', label: 'Company Operations', description: 'Controlled internal communication, company configuration, automation, gateways and operating rules.' }
];

const websiteRoles: UserRole[] = ['admin','site_manager','editor','developer','web_developer','developer_designer','uiux_designer','content_writer','qa'];
const salesRoles: UserRole[] = ['admin','sales','sales_rep','sales_team'];
const sellerLearningRoles: UserRole[] = ['sales','sales_rep','sales_team'];
const contentAcademyRoles: UserRole[] = ['content_writer'];
const designAcademyRoles: UserRole[] = ['uiux_designer'];
const developerAcademyRoles: UserRole[] = ['developer','web_developer','developer_designer'];
const deliveryRoles: UserRole[] = ['admin','project_manager','site_manager','content_writer','uiux_designer','developer','web_developer','developer_designer','qa','sales','sales_rep','sales_team'];
const internalChatRoles: UserRole[] = ['admin','sales','sales_rep','sales_team','project_manager','site_manager','content_writer','uiux_designer','developer','web_developer','developer_designer','qa','editor'];

const academyAppIds = new Set<WorkspaceAppId>([
  'sales_academy',
  'content_academy',
  'design_academy',
  'developer_academy',
  'academy'
]);

export const WORKSPACE_APPS: WorkspaceAppDefinition[] = [
  {
    id: 'intelligence',
    label: 'Founder Control',
    shortLabel: 'Founder',
    description: 'Business health, sales forecast, delivery risk, cash exposure and management exceptions.',
    group: 'leadership',
    icon: 'chart',
    iconClass: 'text-[#000080]',
    iconBackgroundClass: 'bg-blue-50 border-blue-200',
    roles: ['admin'],
    launchPath: '/admin/intelligence',
    items: [
      { id: 'overview', label: 'Founder Control', path: '/admin/intelligence', section: 'Executive Control' },
      { id: 'ai-intelligence', label: 'AI Management Brief', path: '/admin/intelligence-ai', section: 'Executive Control' },
      { id: 'rules', label: 'KPI & Risk Rules', path: '/admin/intelligence-settings', section: 'Governance' }
    ]
  },
  {
    id: 'crm',
    label: 'CRM',
    shortLabel: 'CRM',
    description: 'Daily priorities, leads, opportunities, activities and connected sales follow-up.',
    group: 'growth',
    icon: 'users',
    iconClass: 'text-violet-700',
    iconBackgroundClass: 'bg-violet-50 border-violet-200',
    roles: salesRoles,
    defaultTab: 'pipeline',
    items: [
      { id: 'today', label: 'Today — CRM Priorities', path: '/admin/today', section: 'Daily Focus', roles: salesRoles },
      { id: 'leads', label: 'Leads', tab: 'crm_leads', section: 'Pipeline' },
      { id: 'pipeline', label: 'Opportunities / Pipeline', tab: 'pipeline', section: 'Pipeline' },
      { id: 'activities', label: 'Activities & Follow-Up', tab: 'activities', section: 'Pipeline' },
      { id: 'sales-inbox', label: 'Sales Inbox', tab: 'inbox', section: 'Communication', roles: salesRoles }
    ]
  },
  {
    id: 'sales',
    label: 'Sales & Commercial',
    shortLabel: 'Sales',
    description: 'Seller performance, catalog, quotations, payments and commercial controls.',
    group: 'growth',
    icon: 'receipt',
    iconClass: 'text-amber-700',
    iconBackgroundClass: 'bg-amber-50 border-amber-200',
    roles: salesRoles,
    defaultTab: 'quotations',
    items: [
      { id: 'seller-dashboard', label: 'Seller Dashboard', path: '/admin/today', section: 'Seller Workspace', roles: salesRoles },
      { id: 'notifications', label: 'Notifications', path: '/admin/today#seller-notifications', section: 'Seller Workspace', roles: salesRoles },
      { id: 'performance-coaching', label: 'Performance & Coaching', path: '/admin/sales-performance', section: 'Seller Workspace', roles: salesRoles },
      { id: 'seller-profile', label: 'My Profile & Security', path: '/admin/seller-profile', section: 'Seller Workspace', roles: salesRoles },
      { id: 'catalog', label: 'Sales Catalog', tab: 'sales_catalog', section: 'Commercial Operations' },
      { id: 'quotations', label: 'Quotations', tab: 'quotations', section: 'Commercial Operations' },
      { id: 'payments', label: 'Payments', tab: 'payments', section: 'Commercial Operations' },
      { id: 'payment-process-controls', label: 'Payment Process Controls', path: '/admin/payment-process-controls', section: 'Commercial Operations', roles: ['admin'] },
      { id: 'sales-academy', label: 'Sales & Funnel Academy', path: '/admin/app/sales_academy?tab=training', section: 'Knowledge & Enablement', roles: sellerLearningRoles },
      { id: 'sales-resources', label: 'Sales Resources', path: '/admin/app/sales_academy?tab=training_library', section: 'Knowledge & Enablement', roles: salesRoles }
    ]
  },
  {
    id: 'sales_academy',
    label: 'Sales & Funnel Academy',
    shortLabel: 'Sales Academy',
    description: 'Sales-only learning for lead research, outreach, discovery, objections, closing, quotations, payments and certification.',
    group: 'growth',
    icon: 'book',
    iconClass: 'text-emerald-700',
    iconBackgroundClass: 'bg-emerald-50 border-emerald-200',
    roles: salesRoles,
    statuses: ['active','onboarding'],
    defaultTab: 'training',
    items: [
      { id: 'sales-training', label: 'My Sales Training', tab: 'training', section: 'Sales Team Learning', roles: sellerLearningRoles, statuses: ['active','onboarding'] },
      { id: 'seller-resources', label: 'Sales Resources', tab: 'training_library', section: 'Sales Team Learning', roles: salesRoles, statuses: ['active'] },
      { id: 'academy-assessment', label: 'Assessment & Learning Controls', path: '/admin/academy-assessment', section: 'Sales Academy Management', roles: ['admin'] },
      { id: 'final-certification', label: 'Final Certification Control', path: '/admin/final-certification-controls', section: 'Sales Academy Management', roles: ['admin'] },
      { id: 'mock-call-automation', label: 'Mock Call Automation', path: '/admin/mock-call-automation', section: 'Sales Skills', roles: ['admin'] },
      { id: 'lead-research', label: 'Lead Research Academy', path: '/admin/lead-research', section: 'Prospecting & Funnel', roles: ['admin'] },
      { id: 'loom-outreach', label: 'Loom Outreach Certification', path: '/admin/loom-outreach', section: 'Prospecting & Funnel', roles: ['admin'] },
      { id: 'outreach-messaging', label: 'Outreach Messaging Academy', path: '/admin/outreach-messaging', section: 'Prospecting & Funnel', roles: ['admin'] },
      { id: 'niche-academy', label: 'Niche Academy Controls', path: '/admin/niche-academy', section: 'Market Specialization', roles: ['admin'] },
      { id: 'niche-catalog', label: 'Niche Catalog & Builder', path: '/admin/niche-catalog', section: 'Market Specialization', roles: ['admin'] },
      { id: 'niche-assessment', label: 'Niche Assessment Builder', path: '/admin/niche-assessment', section: 'Market Specialization', roles: ['admin'] }
    ]
  },
  {
    id: 'calendar',
    label: 'Calendar & Meetings',
    shortLabel: 'Calendar',
    description: 'Sales meetings, public booking, seller availability and time off.',
    group: 'growth',
    icon: 'calendar',
    iconClass: 'text-rose-700',
    iconBackgroundClass: 'bg-rose-50 border-rose-200',
    roles: salesRoles,
    launchPath: '/admin/calendar',
    items: []
  },
  {
    id: 'clients',
    label: 'Clients',
    shortLabel: 'Clients',
    description: 'Verified clients, portal access, history, projects and payments.',
    group: 'growth',
    icon: 'building',
    iconClass: 'text-emerald-700',
    iconBackgroundClass: 'bg-emerald-50 border-emerald-200',
    roles: salesRoles,
    defaultTab: 'clients',
    items: [
      { id: 'clients', label: 'Client Portfolio', tab: 'clients', section: 'Client Relationships' }
    ]
  },
  {
    id: 'commissions',
    label: 'Commissions & Progression',
    shortLabel: 'Commissions',
    description: 'Commission earnings, payouts, payment history and sales career progression.',
    group: 'growth',
    icon: 'award',
    iconClass: 'text-teal-700',
    iconBackgroundClass: 'bg-teal-50 border-teal-200',
    roles: salesRoles,
    defaultTab: 'my_commissions',
    items: [
      { id: 'my-commissions', label: 'My Commission', tab: 'my_commissions', section: 'Earnings' },
      { id: 'upcoming-payouts', label: 'Upcoming Payouts', path: '/admin/today#seller-payouts', section: 'Earnings' },
      { id: 'payment-history', label: 'Payment History', tab: 'my_commissions', section: 'Earnings' },
      { id: 'career-progression', label: 'Career Progression', path: '/admin/sales-career-progression', section: 'Growth' },
      { id: 'admin-commissions', label: 'Commission Management', tab: 'admin_commissions', section: 'Administration', roles: ['admin'] }
    ]
  },
  {
    id: 'projects',
    label: 'Projects & Delivery',
    shortLabel: 'Delivery',
    description: 'Project management plus role-specific Content, Design, Development and QA execution.',
    group: 'delivery',
    icon: 'briefcase',
    iconClass: 'text-blue-700',
    iconBackgroundClass: 'bg-blue-50 border-blue-200',
    roles: deliveryRoles,
    defaultTab: 'projects',
    items: [
      { id: 'projects', label: 'Client Projects', tab: 'projects', section: 'Delivery Management' },
      { id: 'my-work', label: 'My Department Work', tab: 'myWork', section: 'Department Workspace', roles: ['admin','project_manager','site_manager','content_writer','uiux_designer','developer','web_developer','developer_designer','qa'] },
      { id: 'my-profile', label: 'My Delivery Profile', tab: 'myProfile', section: 'Department Workspace', roles: ['developer_designer'] }
    ]
  },
  {
    id: 'content_academy',
    label: 'Content Writing Academy',
    shortLabel: 'Content Academy',
    description: 'Content-team learning and PF-SOP-07 training, kept separate from Sales, Design and Development.',
    group: 'delivery',
    icon: 'book',
    iconClass: 'text-violet-700',
    iconBackgroundClass: 'bg-violet-50 border-violet-200',
    roles: contentAcademyRoles,
    statuses: ['active','onboarding'],
    defaultTab: 'training',
    items: [
      { id: 'content-training', label: 'My Content Academy', tab: 'training', section: 'Content Writing', roles: contentAcademyRoles, statuses: ['active','onboarding'] }
    ]
  },
  {
    id: 'design_academy',
    label: 'Design & UX Academy',
    shortLabel: 'Design Academy',
    description: 'UI/UX learning and certification for the Design team only.',
    group: 'delivery',
    icon: 'book',
    iconClass: 'text-fuchsia-700',
    iconBackgroundClass: 'bg-fuchsia-50 border-fuchsia-200',
    roles: designAcademyRoles,
    statuses: ['active','onboarding'],
    defaultTab: 'training',
    items: [
      { id: 'design-training', label: 'My Design Academy', tab: 'training', section: 'Design & UX', roles: designAcademyRoles, statuses: ['active','onboarding'] },
      { id: 'design-final-certification', label: 'My Final Certification', path: '/academy/final-certification', section: 'Design & UX', roles: designAcademyRoles, statuses: ['active','onboarding'] }
    ]
  },
  {
    id: 'developer_academy',
    label: 'Development Academy',
    shortLabel: 'Developer Academy',
    description: 'Engineering learning and certification for the Development team only.',
    group: 'delivery',
    icon: 'book',
    iconClass: 'text-cyan-700',
    iconBackgroundClass: 'bg-cyan-50 border-cyan-200',
    roles: developerAcademyRoles,
    statuses: ['active','onboarding'],
    defaultTab: 'training',
    items: [
      { id: 'developer-training', label: 'My Developer Academy', tab: 'training', section: 'Development & Engineering', roles: developerAcademyRoles, statuses: ['active','onboarding'] },
      { id: 'developer-final-certification', label: 'My Final Certification', path: '/academy/final-certification', section: 'Development & Engineering', roles: developerAcademyRoles, statuses: ['active','onboarding'] }
    ]
  },
  {
    id: 'recruitment',
    label: 'Recruitment & Onboarding',
    shortLabel: 'Recruitment',
    description: 'Role-specific hiring pipelines, agreements and controlled staff onboarding.',
    group: 'people',
    icon: 'userPlus',
    iconClass: 'text-fuchsia-700',
    iconBackgroundClass: 'bg-fuchsia-50 border-fuchsia-200',
    roles: ['admin','editor','site_manager'],
    defaultTab: 'recruitment',
    items: [
      { id: 'sales-recruitment', label: 'Sales Hiring Pipeline', tab: 'recruitment', section: 'Hiring Pipelines', roles: ['admin'] },
      { id: 'content-recruitment', label: 'Content Writer Hiring', path: '/admin/content-recruitment', section: 'Hiring Pipelines', roles: ['admin','editor','site_manager'] },
      { id: 'uiux-hiring', label: 'UI/UX Designer Hiring', path: '/admin/uiux-recruitment', section: 'Hiring Pipelines', roles: ['admin'] },
      { id: 'job-posts', label: 'Job Posts & Open Roles', path: '/admin/job-posts', section: 'Hiring Pipelines', roles: ['admin'] },
      { id: 'agreements', label: 'Candidate Agreements', path: '/admin/agreements', section: 'Selection & Onboarding', roles: ['admin'] },
      { id: 'onboarding', label: 'Onboarding Management', tab: 'onboarding', section: 'Selection & Onboarding', roles: ['admin'] }
    ]
  },
  {
    id: 'academy',
    label: 'Onboarding Academy',
    shortLabel: 'Academy',
    description: 'Temporary Academy entry for pending users before a departmental learning role is assigned.',
    group: 'people',
    icon: 'book',
    iconClass: 'text-indigo-700',
    iconBackgroundClass: 'bg-indigo-50 border-indigo-200',
    roles: ['pending'],
    statuses: ['onboarding'],
    defaultTab: 'training',
    items: [
      { id: 'training', label: 'My Training', tab: 'training', section: 'Onboarding', roles: ['pending'], statuses: ['onboarding'] }
    ]
  },
  {
    id: 'academy_governance',
    label: 'Academy Governance',
    shortLabel: 'Academy Admin',
    description: 'Cross-team certification reviews and management quality gates without mixing team learning areas.',
    group: 'people',
    icon: 'book',
    iconClass: 'text-indigo-700',
    iconBackgroundClass: 'bg-indigo-50 border-indigo-200',
    roles: ['admin'],
    items: [
      { id: 'academy-certification-reviews', label: 'Design & Developer Certification Reviews', path: '/admin/academy-certification-reviews', section: 'Independent Certification', roles: ['admin'] }
    ]
  },
  {
    id: 'team',
    label: 'Team & Departments',
    shortLabel: 'Team',
    description: 'Internal users organized by Sales, Delivery, Content, Design, Development, QA and Management.',
    group: 'people',
    icon: 'userCog',
    iconClass: 'text-slate-700',
    iconBackgroundClass: 'bg-slate-100 border-slate-300',
    roles: ['admin'],
    defaultTab: 'team',
    items: [
      { id: 'team', label: 'Team & Departments', tab: 'team', section: 'Organization' }
    ]
  },
  {
    id: 'website',
    label: 'Website & Brand',
    shortLabel: 'Website',
    description: 'Public website content, portfolio, media, SEO and brand presentation.',
    group: 'brand',
    icon: 'globe',
    iconClass: 'text-cyan-700',
    iconBackgroundClass: 'bg-cyan-50 border-cyan-200',
    roles: websiteRoles,
    defaultTab: 'pages',
    items: [
      { id: 'pages', label: 'Pages & SEO', tab: 'pages', section: 'Content & Publishing' },
      { id: 'blog', label: 'Blog & Articles', tab: 'blog', section: 'Content & Publishing' },
      { id: 'portfolio', label: 'Portfolio', tab: 'portfolio', section: 'Content & Publishing' },
      { id: 'form-inquiries', label: 'Form Inquiries', tab: 'leads', section: 'Content & Publishing' },
      { id: 'feedback', label: 'Feedback Inbox', tab: 'feedback', section: 'Content & Publishing', roles: ['admin','site_manager','editor'] },
      { id: 'media', label: 'Media Library', tab: 'media', section: 'Content & Publishing' },
      { id: 'homepage', label: 'Homepage Sections', tab: 'homepageSections', section: 'Website Experience' },
      { id: 'awards', label: 'Awards', tab: 'awards', section: 'Website Experience' },
      { id: 'templates', label: 'Templates', tab: 'templates', section: 'Website Experience', roles: ['admin','site_manager','editor'] },
      { id: 'header', label: 'Navigation & Header', tab: 'header', section: 'Website Experience', roles: ['admin','site_manager','editor'] },
      { id: 'footer', label: 'Footer', tab: 'footer', section: 'Website Experience', roles: ['admin','site_manager','editor'] },
      { id: 'public-pricing', label: 'Public Pricing Presentation', path: '/admin/public-pricing', section: 'Commercial Presentation', roles: ['admin'] },
      { id: 'site-settings', label: 'Website Settings', tab: 'siteSettings', section: 'Website Administration', roles: ['admin','site_manager','editor'] }
    ]
  },
  {
    id: 'internal_chat',
    label: 'Internal Chat',
    shortLabel: 'Chat',
    description: 'Controlled staff messaging with department isolation and Management as the communication bridge.',
    group: 'operations',
    icon: 'message',
    iconClass: 'text-[#000080]',
    iconBackgroundClass: 'bg-blue-50 border-blue-200',
    roles: internalChatRoles,
    launchPath: '/admin/internal-chat',
    items: []
  },
  {
    id: 'settings',
    label: 'Company Settings',
    shortLabel: 'Settings',
    description: 'Company configuration, delivery standards, automation and secure system settings.',
    group: 'operations',
    icon: 'settings',
    iconClass: 'text-[#000080]',
    iconBackgroundClass: 'bg-blue-50 border-blue-200',
    roles: ['admin'],
    defaultTab: 'configuration',
    items: [
      { id: 'configuration', label: 'Configuration Center', tab: 'configuration', section: 'Core Configuration' },
      { id: 'payment-gateway-settings', label: 'Payment Gateway Setup', path: '/admin/payment-gateway-settings', section: 'Finance & Payments', roles: ['admin'] },
      { id: 'design-delivery-settings', label: 'Design Delivery Standards', path: '/admin/design-delivery-settings', section: 'Delivery Standards' },
      { id: 'meeting-settings', label: 'Meeting Settings', path: '/admin/meeting-settings', section: 'Communication & Scheduling' },
      { id: 'public-booking-settings', label: 'Public Booking Settings', path: '/admin/booking-settings', section: 'Communication & Scheduling' },
      { id: 'notifications-automation', label: 'Notifications & Automation', path: '/admin/automation-settings', section: 'Communication & Automation' },
      { id: 'customer-communication', label: 'Customer Communication Policy', path: '/admin/customer-communication-settings', section: 'Communication & Automation' },
      { id: 'productivity-settings', label: 'Productivity & AI', path: '/admin/productivity-settings', section: 'Productivity & Intelligence' },
      { id: 'intelligence-rules', label: 'Business Intelligence Rules', path: '/admin/intelligence-settings', section: 'Productivity & Intelligence' }
    ]
  }
];

export function canAccessWorkspaceApp(app: WorkspaceAppDefinition, role: UserRole | null, status: UserStatus | null) {
  if (!role || !status) return false;
  const allowedStatuses = app.statuses || ['active'];
  return allowedStatuses.includes(status) && app.roles.includes(role);
}

export function canAccessWorkspaceItem(item: WorkspaceNavItem, role: UserRole | null, status: UserStatus | null) {
  if (!role || !status) return false;
  if (item.roles && !item.roles.includes(role)) return false;
  if (item.statuses && !item.statuses.includes(status)) return false;
  return true;
}

export function getVisibleWorkspaceApps(role: UserRole | null, status: UserStatus | null) {
  if (status === 'onboarding') {
    return WORKSPACE_APPS.filter(app => academyAppIds.has(app.id) && canAccessWorkspaceApp(app, role, status));
  }
  return WORKSPACE_APPS.filter(app => canAccessWorkspaceApp(app, role, status));
}

export function getWorkspaceApp(appId: string | undefined) {
  return WORKSPACE_APPS.find(app => app.id === appId);
}

export function getWorkspaceAppForTab(tab: string | null | undefined, role: UserRole | null, status: UserStatus | null) {
  if (!tab) return undefined;
  return getVisibleWorkspaceApps(role, status).find(app => app.items.some(item => item.tab === tab && canAccessWorkspaceItem(item, role, status)));
}

export function getWorkspaceAppLaunchPath(app: WorkspaceAppDefinition, role: UserRole | null, status: UserStatus | null) {
  if (app.launchPath) return app.launchPath;
  const accessible = app.items.filter(item => canAccessWorkspaceItem(item, role, status));
  const firstTab = accessible.find(item => item.tab);
  const tab = app.defaultTab && accessible.some(item => item.tab === app.defaultTab) ? app.defaultTab : firstTab?.tab;
  if (tab) return `/admin/app/${app.id}?tab=${encodeURIComponent(tab)}`;
  const firstPath = accessible.find(item => item.path)?.path;
  return firstPath || `/admin/app/${app.id}`;
}
