export type UserRole =
  | 'admin'
  | 'sales'
  | 'project_manager'
  | 'uiux_designer'
  | 'content_writer'
  | 'developer'
  | 'qa'
  | 'site_manager'
  | 'editor'
  | 'finance'
  | 'accountant'
  | 'customer'
  | 'pending'
  // Legacy role aliases retained for compatibility only
  | 'sales_rep'
  | 'web_developer'
  | 'developer_designer'
  | 'sales_team';

export type UserStatus = 'pending' | 'onboarding' | 'active' | 'inactive';

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'failed';

export type Department =
  | 'Management'
  | 'Sales'
  | 'Project Management'
  | 'UI/UX Design'
  | 'Content'
  | 'Development'
  | 'Quality Assurance'
  | 'Finance'
  | 'General'
  // Legacy department labels retained for existing records
  | 'Marketing'
  | 'Design'
  | 'HR'
  | 'Operations';

export interface UserProfile {
  id: string; // matches auth.users.id
  userId?: string;
  email: string;
  fullName: string;
  phone?: string;
  country?: string;
  timezone?: string;
  role: UserRole;
  department?: Department | string;
  status: UserStatus;
  manager?: string;
  onboardingStatus: OnboardingStatus;
  onboardingProgress: number;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// Shared recruitment stage registry. Individual jobs still enforce their own ordered
// stage policies server-side; this union exists so the shared UI can render every
// supported pipeline without silently dropping role-specific stages.
export type ApplicantStage =
  | 'New Application'
  | 'Video Pending'
  | 'Video Review'
  | 'Code & Portfolio Review'
  | 'Portfolio Review'
  | 'Initial Screening'
  | 'Shortlisted'
  | 'Sales Assessment'
  | 'Technical Assessment'
  | 'Design Assessment'
  | 'Lead Research Test'
  | 'Development Practical'
  | 'Figma Practical'
  | 'CRM Assessment'
  | 'Technical Interview'
  | 'Design Interview'
  | 'Selected'
  | 'Agreement Pending'
  | 'One-Day Training'
  | 'Design Academy'
  | 'Developer Academy'
  | 'Final Approval'
  | 'Ready for System Access'
  | 'Activated';

export type AgreementStatus = 'not_sent' | 'sent' | 'signed' | 'declined';

export interface Applicant {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  country?: string;
  timezone?: string;
  position: string;
  linkedinUrl?: string;
  cvUrl?: string;
  videoUrl?: string;
  avatarUrl?: string;
  salesExperience?: string;
  skills?: string;
  source?: string;
  stage: ApplicantStage;
  rating: number;
  notes?: string;
  refusalReason?: string;
  agreementStatus: AgreementStatus;
  onboardingStatus: OnboardingStatus;
  onboardingProgress: number;
  finalApproval: boolean;
  linkedUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export const APPLICANT_STAGES: ApplicantStage[] = [
  'New Application',
  'Video Pending',
  'Video Review',
  'Code & Portfolio Review',
  'Portfolio Review',
  'Initial Screening',
  'Shortlisted',
  'Sales Assessment',
  'Technical Assessment',
  'Design Assessment',
  'Lead Research Test',
  'Development Practical',
  'Figma Practical',
  'CRM Assessment',
  'Technical Interview',
  'Design Interview',
  'Selected',
  'Agreement Pending',
  'One-Day Training',
  'Design Academy',
  'Developer Academy',
  'Final Approval',
  'Ready for System Access',
  'Activated'
];

export const REFUSAL_REASONS = [
  'Insufficient Sales Experience',
  'English Below Requirement',
  'Poor Introduction Video',
  'Poor Initial Screening',
  'Poor Sales Assessment',
  'Lead Research Test Failed',
  'CRM Assessment Failed',
  'Availability Below Requirement',
  'Equipment/Internet Issue',
  'Commission Model Not Accepted',
  'Agreement Declined',
  'Training Failed',
  'Unresponsive',
  'Incorrect Information',
  'Not Suitable for International Sales',
  'Duplicate Application',
  'Other'
];

export type LeadStatus = 'New' | 'Researching' | 'Contacted' | 'Follow-Up' | 'Interested' | 'Qualified' | 'Not Qualified';

export type OpportunityStage =
  | 'Qualified'
  | 'Meeting Scheduled'
  | 'Requirements Confirmed'
  | 'Quotation Sent'
  | 'Negotiation / Decision Pending'
  | 'Awaiting Advance Payment'
  | 'Won';

export type OpportunityStatus = 'Open' | 'Won' | 'Lost';

export type NegotiationDecisionStatus =
  | 'AWAITING_CLIENT_RESPONSE'
  | 'CLIENT_REVIEWING'
  | 'QUESTIONS_OR_OBJECTIONS'
  | 'REVISION_REQUESTED'
  | 'COMMERCIAL_REVIEW_REQUIRED'
  | 'INTERNAL_CLIENT_APPROVAL'
  | 'DECISION_DATE_CONFIRMED'
  | 'PAUSED_BY_CLIENT';

export type NegotiationObjectionCategory =
  | 'PRICE'
  | 'BUDGET'
  | 'SCOPE'
  | 'TIMELINE'
  | 'TRUST'
  | 'AUTHORITY'
  | 'INTERNAL_APPROVAL'
  | 'PROCUREMENT'
  | 'COMPETITOR'
  | 'PRIORITY'
  | 'NO_RESPONSE'
  | 'OTHER';

export type NegotiationWaitingOn = 'CLIENT' | 'PROFOX' | 'SPECIALIST' | 'PROCUREMENT' | 'THIRD_PARTY';

export type ActivityType =
  | 'Lead Research'
  | 'Cold Call'
  | 'Cold Email'
  | 'LinkedIn / Social Outreach'
  | 'Loom Outreach'
  | 'Follow-Up'
  | 'Discovery Meeting'
  | 'Meeting Follow-Up'
  | 'Quotation Follow-Up'
  | 'Payment Follow-Up'
  | 'Other';

export type ActivityStatus = 'Scheduled' | 'Completed' | 'Cancelled';

export type LeadOriginType = 'manual' | 'website' | 'paid_ads' | 'referral' | 'other';
export type LeadQuality = 'High' | 'Medium' | 'Low';

export interface CRMLeadPerson {
  id: string;
  name: string;
  avatarUrl?: string;
  role: string;
}

export interface CRMLeadEvent {
  id: string;
  eventType: string;
  title: string;
  description: string;
  actorUserId?: string;
  actorName: string;
  actorRole: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface CRMLeadDetail {
  assignee?: CRMLeadPerson;
  createdBy?: CRMLeadPerson;
  assignedBy?: CRMLeadPerson;
  events: CRMLeadEvent[];
  activities: Array<CRMActivity & { assigneeName?: string; assigneeAvatarUrl?: string }>;
  meetings: Array<{
    id: string;
    title: string;
    meetingType: string;
    startAt: string;
    endAt: string;
    timezone: string;
    status: string;
    meetingUrl?: string;
    salespersonId: string;
    createdAt: string;
  }>;
  conversations: ChatConversation[];
}

export interface CRMLead {
  id: string;
  title: string;
  companyName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  country: string;
  industry?: string;
  source: string;
  originType: LeadOriginType;
  leadScore: number;
  leadQuality: LeadQuality;
  scoreReason: string;
  salespersonId?: string;
  assignedBy?: string;
  assignedAt?: string;
  acceptedAt?: string;
  firstResponseDueAt?: string;
  firstResponseAt?: string;
  firstResponseSlaMinutes?: number;
  firstResponseChannel?: string;
  firstResponseEvidenceType?: 'manual_confirmation' | 'crm_chat_message' | 'provider_receipt';
  firstResponseEvidenceId?: string;
  serviceInterest?: string;
  estimatedValue: number;
  currency: string;
  status: LeadStatus;
  loomVideoUrl?: string;
  initialOutreachChannel: string;
  lastContactAt?: string;
  nextFollowUpAt?: string;
  notes?: string;
  selfGenerated: boolean;
  convertedOpportunityId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CRMOpportunity {
  id: string;
  leadId?: string;
  name: string;
  companyName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  country: string;
  industry?: string;
  source: string;
  selfGenerated: boolean;
  salespersonId?: string;
  serviceInterest?: string;
  expectedValue: number;
  currency: string;
  stage: OpportunityStage;
  status: OpportunityStatus;
  probability?: number;
  meetingAt?: string;
  meetingUrl?: string;
  requirementsSummary?: string;
  nextFollowUpAt?: string;
  decisionStatus?: NegotiationDecisionStatus;
  primaryObjectionCategory?: NegotiationObjectionCategory;
  waitingOn?: NegotiationWaitingOn;
  decisionExpectedAt?: string;
  decisionRecordedAt?: string;
  notes?: string;
  lostReason?: string;
  wonAt?: string;
  lostAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CRMActivity {
  id: string;
  leadId?: string;
  opportunityId?: string;
  assignedTo: string;
  activityType: ActivityType;
  subject: string;
  dueAt: string;
  completedAt?: string;
  status: ActivityStatus;
  outcome?: string;
  outcomeRecordedAt?: string;
  startedAt?: string;
  originalDueAt?: string;
  rescheduleCount?: number;
  lastRescheduledAt?: string;
  lastRescheduledBy?: string;
  lastRescheduleReason?: string;
  lastRescheduleKind?: string;
  cancellationReason?: string;
  nextActivityId?: string;
  channel?: string;
  loomVideoUrl?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const LEAD_STATUSES: LeadStatus[] = ['New', 'Researching', 'Contacted', 'Follow-Up', 'Interested', 'Qualified', 'Not Qualified'];

export const OPPORTUNITY_STAGES: OpportunityStage[] = [
  'Qualified',
  'Meeting Scheduled',
  'Requirements Confirmed',
  'Quotation Sent',
  'Negotiation / Decision Pending',
  'Awaiting Advance Payment',
  'Won'
];

export const ACTIVITY_TYPES: ActivityType[] = [
  'Lead Research',
  'Cold Call',
  'Cold Email',
  'LinkedIn / Social Outreach',
  'Loom Outreach',
  'Follow-Up',
  'Discovery Meeting',
  'Meeting Follow-Up',
  'Quotation Follow-Up',
  'Payment Follow-Up',
  'Other'
];

export const OUTREACH_CHANNELS = ['Email', 'LinkedIn', 'Phone', 'Facebook', 'Instagram', 'WhatsApp', 'Other'];

export const INDUSTRIES = [
  'Roofing',
  'HVAC',
  'Plumbing',
  'Home Services',
  'Healthcare / Clinics',
  'Dental',
  'Hotels & Hospitality',
  'Real Estate',
  'Professional Services',
  'E-commerce',
  'Technology',
  'Other'
];

export const LEAD_SOURCES = [
  'Website Contact Form',
  'Website Live Chat',
  'Google Ads',
  'Meta Ads',
  'LinkedIn Ads',
  'Google Maps',
  'LinkedIn',
  'Google Search',
  'Facebook',
  'Instagram',
  'Business Directory',
  'Referral',
  'Website',
  'Cold Call',
  'Cold Email',
  'Other'
];

export const LOST_REASONS = [
  'Price / Budget',
  'Not Interested',
  'No Response',
  'Already Has Provider',
  'Project Postponed',
  'Competitor Selected',
  'Decision Maker Declined',
  'Timing Not Suitable',
  'Not Qualified',
  'Invalid Lead',
  'Duplicate',
  'Other'
];

export const QUOTATION_STATUSES: QuotationStatus[] = ['Draft', 'Ready for Approval', 'Approved', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Cancelled'];

export const PRODUCT_TYPES: ProductType[] = ['package', 'addon', 'care_plan', 'discovery', 'custom'];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  sales: 'Sales Representative',
  sales_team: 'Sales Representative',
  sales_rep: 'Sales Representative',
  project_manager: 'Project Manager',
  uiux_designer: 'UI/UX Designer',
  content_writer: 'Content Writer',
  developer: 'Web Developer',
  web_developer: 'Web Developer',
  developer_designer: 'Web Developer',
  qa: 'Quality Assurance',
  site_manager: 'Site Manager',
  editor: 'Editor',
  finance: 'Finance',
  accountant: 'Accountant',
  customer: 'Customer',
  pending: 'Pending Approval'
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  pending: 'Pending Approval',
  onboarding: 'Onboarding',
  active: 'Active',
  inactive: 'Inactive'
};

export const ONBOARDING_STATUS_LABELS: Record<OnboardingStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  failed: 'Failed'
};

export const DEPARTMENTS: Department[] = [
  'Management',
  'Sales',
  'Project Management',
  'UI/UX Design',
  'Content',
  'Development',
  'Quality Assurance',
  'General'
];

export interface ProcessStep {
  id?: string;
  step?: string;
  title: string;
  desc?: string;
  description?: string;
  image?: string;
  ctaText?: string;
  cta_text?: string;
  ctaUrl?: string;
  cta_url?: string;
  order_index?: number;
  service_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface NavItem {
  id?: string;
  label: string;
  href: string;
  target?: '_self' | '_blank';
  description?: string;
  badge?: string;
  icon?: string;
  isMegaMenu?: boolean;
  megaColumns?: {
    title: string;
    items: NavItem[];
  }[];
  children?: NavItem[];
}

export interface Service {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  icon: string;
  tags: string[];
  link?: string;
  image?: string;
}

export interface Client {
  name: string;
  logo: string;
}

export interface CaseStudy {
  title: string;
  category: string;
  image: string;
  slug?: string;
}

export interface SEOConfig {
  metaTitle: string;
  metaDescription: string;
  focusKeyword?: string;
  keywords?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  noIndex?: boolean;
  schemaType?: 'WebPage' | 'Article' | 'Organization' | 'Service';
  _author?: { name: string; avatar?: string };
  _highlights?: string[];
  _faq?: { question: string; answer: string }[];
}

export interface ThemeConfig {
  logoUrl?: string;
  fontFamily: 'Plus Jakarta Sans' | 'Playfair Display' | 'Inter' | 'Outfit' | 'Montserrat' | 'Poppins' | 'Cinzel' | 'Space Grotesk';
  headingFontFamily: 'Plus Jakarta Sans' | 'Playfair Display' | 'Inter' | 'Outfit' | 'Montserrat' | 'Poppins' | 'Cinzel' | 'Space Grotesk';
  baseFontSize: '14px' | '16px' | '18px';
  primaryColor: string; // Hex color e.g., #000080 or #0284c7
  secondaryColor: string;
  darkBgColor: string;
  lightBgColor: string;
  buttonRadius: 'rounded-none' | 'rounded-md' | 'rounded-xl' | 'rounded-full';
  buttonStyle: 'solid' | 'gradient' | 'outline';
  themePreset: 'ocean' | 'themify-dark' | 'emerald-agency' | 'royal-blue' | 'minimal-light' | 'ultra-agency' | 'ultra-fitness' | 'ultra-restaurant';
  layoutContainerWidth: '1200px' | '1400px' | '1600px' | 'full';
  headerLayout?: 'default' | 'centered' | 'boxed' | 'top-bar' | 'transparent';
  stickyHeader?: boolean;
  showTopBar?: boolean;
  topBarEmail?: string;
  topBarPhone?: string;
  footerLayout?: '4-column' | '3-column' | '2-column' | 'minimal';
  footerCopyright?: string;
}

export interface DynamicSectionItem {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  image?: string;
  icon?: string;
  linkText?: string;
  linkUrl?: string;
  badge?: string;
  price?: string;
  period?: string;
  popular?: boolean;
  features?: string[];
  role?: string;
  statNumber?: string;
  statLabel?: string;
}

export interface DynamicSection {
  id: string;
  type: 'hero' | 'features' | 'case-studies' | 'testimonials' | 'cta' | 'faq' | 'team' | 'text-media' | 'pricing' | 'gallery' | 'counter' | 'video' | 'portfolio';
  title: string;
  subtitle?: string;
  description?: string;
  badge?: string;
  bgType?: 'light' | 'dark' | 'accent' | 'image';
  bgImage?: string;
  buttonText?: string;
  buttonLink?: string;
  enabled: boolean;
  order: number;
  animation?: 'none' | 'fade' | 'slide-up' | 'zoom';
  padding?: 'compact' | 'normal' | 'spacious';
  mediaPosition?: 'left' | 'right';
  videoUrl?: string;
  items?: DynamicSectionItem[];
}

export interface PageBlockItem {
  title?: string;
  description?: string;
  icon?: string;
  image?: string;
  price?: string;
  badge?: string;
  buttonText?: string;
  buttonUrl?: string;
  role?: string;
  statNumber?: string;
  statLabel?: string;
}

export interface PageBlock {
  id: string;
  type: 'text' | 'features' | 'quote' | 'cta' | 'faq' | 'image' | 'gallery' | 'pricing' | 'team' | 'stats' | 'video';
  heading?: string;
  subheading?: string;
  body?: string;
  imageUrl?: string;
  imagePosition?: 'left' | 'right' | 'center' | 'full';
  buttonText?: string;
  buttonUrl?: string;
  bgColor?: 'light' | 'dark' | 'emerald' | 'gradient';
  videoUrl?: string;
  items?: PageBlockItem[];
  images?: string[];
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  featuredImage: string;
  category: string;
  tags: string[];
  status: 'draft' | 'published';
  author: {
    name: string;
    avatar?: string;
  };
  highlights?: string[];
  faq?: {
    question: string;
    answer: string;
  }[];
  seo: SEOConfig;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface MediaAsset {
  id: string;
  url: string;
  name: string;
  type: string;
  size: number;
  path?: string;
  createdAt?: string; // Keep for backward compatibility if any
  created_at?: string; // Supabase style
}

export interface CustomPage {
  id: string;
  title: string;
  slug: string;
  status: 'published' | 'draft';
  template?: string;
  createdAt: string;
  updatedAt: string;
  heroTitle: string;
  heroSubtitle: string;
  heroHighlight?: string;
  heroSubheading?: string;
  heroBadge?: string;
  coverImage?: string;
  bodyContent: string;
  blocks?: PageBlock[];
  seo: SEOConfig;
  serviceDetailData?: any;
}

export interface PortfolioCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface PortfolioItem {
  id: string;
  title: string;
  slug: string;
  client: string;
  clientLogo?: string;
  category: string;
  shortDescription: string;
  coverImage: string;
  gallery: string[];
  content: string; // Markdown or HTML
  results: { label: string; value: string; description?: string }[];
  testimonial?: { quote: string; author: string; role: string; avatar?: string };
  seo: SEOConfig;
  status: 'published' | 'draft' | 'pending';
  authorId?: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;

  // Rich case study fields
  problemTitle?: string;
  problemContent?: string;
  problemBullets?: string[];
  solutionTitle?: string;
  solutionContent?: string;
  solutionBullets?: string[];
  resultsTitle?: string;
  resultsContent?: string;
  resultsBullets?: string[];
  
  // Sidebar meta
  industry?: string;
  companySize?: string;
  websiteUrl?: string;
  painPoint?: string;
  solutionsProvided?: string[];
  aboutCompany?: string;
  tags?: string[];

  // Tech Stack & Technologies Used
  techStack?: string[];
  technologies?: string[];

  // Visual & UI/UX Showcase
  designShowcase?: DesignShowcase;
}

export interface VisualShowcaseItem {
  id?: string;
  title: string;
  caption?: string;
  category?: 'UI Screens' | 'UX & Wireframes' | 'Mobile Views' | 'Design System' | string;
  imageUrl: string;
  images?: string[];
  documents?: { name: string; url: string; type?: string }[];
}

export interface UIUXHighlight {
  title: string;
  description: string;
  category?: 'UI' | 'UX' | 'Design System' | 'Accessibility' | 'Micro-interactions' | string;
  icon?: string;
}

export interface ColorSwatch {
  hex: string;
  name: string;
}

export interface MaintenanceConfig {
  enabled: boolean;
  title?: string;
  message?: string;
  estimatedTime?: string;
  contactEmail?: string;
  badgeText?: string;
  allowAdminBypass?: boolean;
  updatedAt?: string;
}

export interface ContactLead {
  id: string;
  fullName: string;
  email: string;
  subject: string;
  message: string;
  status: 'new' | 'contacted' | 'qualified' | 'lost';
  source: 'contact_form' | 'chat' | 'other';
  createdAt: string;
}

export interface SiteSettings {
  businessName: string;
  website: string;
  contactEmail: string;
  contactPhone: string;
  securityContact: string;
  address: string;
  businessAddress: string;
  googleReviewUrl?: string;
  chatWidgetEnabled?: boolean;
  lastUpdated: string;
  maintenanceMode?: MaintenanceConfig;
  faviconUrl?: string;
}

export interface FeedbackResolution {
  resolvedAt: string;
  resolvedBy: string;
  notes: string;
  solutionConfirmed: boolean;
}

export interface FeedbackEntry {
  image?: string;
  position?: string;
  link?: string;
  showOnWebsite?: boolean;
  id: string;
  customerName: string;
  customerEmail?: string;
  rating: number;
  comment?: string;
  status: 'pending' | 'resolved';
  createdAt: string;
  resolution?: FeedbackResolution;
}

export interface DesignShowcase {
  title?: string;
  subtitle?: string;
  overview?: string;
  figmaUrl?: string;
  prototypeUrl?: string;
  uiUxHighlights?: UIUXHighlight[];
  visuals?: VisualShowcaseItem[];
  colorPalette?: ColorSwatch[];
  typography?: { fontName: string; usage: string };
  projectDocuments?: { name: string; url: string; type?: string }[];
}
export type ProductType = 'package' | 'addon' | 'care_plan' | 'discovery' | 'custom';
export type PriceMode = 'fixed' | 'starting_at' | 'custom';

export interface SalesProduct {
  id: string;
  code: string;
  name: string;
  category: string;
  productType: ProductType;
  priceMode: PriceMode;
  basePrice: number;
  currency: string;
  billingPeriod?: string | null;
  shortDescription?: string;
  fullDescription?: string;
  scope?: string[];
  technology?: string;
  managerApprovalRequired: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type QuotationStatus = 'Draft' | 'Ready for Approval' | 'Approved' | 'Sent' | 'Accepted' | 'Rejected' | 'Expired' | 'Cancelled';

export type PaymentType = 
  | 'Advance' 
  | 'Design Milestone' 
  | 'Staging Milestone' 
  | 'Final Payment' 
  | 'Full Payment' 
  | 'Custom Milestone';

export type PaymentStatus = 
  | 'Draft' 
  | 'Ready' 
  | 'Sent' 
  | 'Pending' 
  | 'Partially Paid' 
  | 'Verification Pending' 
  | 'Verified' 
  | 'Failed' 
  | 'Cancelled' 
  | 'Refunded' 
  | 'Partially Refunded';

export const PAYMENT_TYPES: PaymentType[] = [
  'Advance', 
  'Design Milestone', 
  'Staging Milestone', 
  'Final Payment', 
  'Full Payment', 
  'Custom Milestone'
];

export const PAYMENT_STATUSES: PaymentStatus[] = [
  'Draft', 
  'Ready', 
  'Sent', 
  'Pending', 
  'Partially Paid', 
  'Verification Pending', 
  'Verified', 
  'Failed', 
  'Cancelled', 
  'Refunded', 
  'Partially Refunded'
];

export interface Payment {
  id: string;
  paymentReference: string;
  quotationId: string;
  opportunityId: string;
  clientId?: string;
  salespersonId: string;
  customerName: string;
  customerEmail: string;
  paymentType: PaymentType;
  milestoneNumber?: number;
  milestoneLabel?: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  paymentMethod?: string;
  paymentProvider?: string;
  paymentLink?: string;
  providerPaymentId?: string;
  status: PaymentStatus;
  dueDate?: string;
  paidAt?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalesClient {
  id: string;
  companyName: string;
  primaryContactName: string;
  email: string;
  phone?: string;
  website?: string;
  country?: string;
  industry?: string;
  salespersonId: string;
  sourceOpportunityId?: string;
  firstQuotationId?: string;
  totalSalesValue: number;
  currency: string;
  status: 'Active' | 'Inactive';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Quotation {
  id: string;
  quotationNumber: string;
  opportunityId?: string;
  clientId?: string;
  salespersonId?: string;
  customerName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  country?: string;
  currency: string;
  status: QuotationStatus;
  validUntil?: string;
  paymentTerms?: string;
  scopeSummary?: string;
  exclusions?: string;
  customerNotes?: string;
  internalNotes?: string;
  subtotal: number;
  total: number;
  approvedBy?: string;
  approvedAt?: string;
  sentAt?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuotationItem {
  id: string;
  quotationId: string;
  salesProductId?: string;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  descriptionSnapshot?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  itemType: ProductType | string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMemberProfile {
  id: string;
  userId: string;
  role: string;
  fullName: string;
  title: string;
  bio: string;
  avatar: string;
  createdAt: string;
}

export interface DesignShowcase {
  title?: string;
  subtitle?: string;
  overview?: string;
  figmaUrl?: string;
  prototypeUrl?: string;
  uiUxHighlights?: UIUXHighlight[];
  visuals?: VisualShowcaseItem[];
  colorPalette?: ColorSwatch[];
  typography?: { fontName: string; usage: string };
  projectDocuments?: { name: string; url: string; type?: string }[];
}

export interface SalesRep {
  id: string;
  name: string;
  email: string;
  avatar: string;
  title: string;
  specialties: string[];
  rating: number;
  reviewCount: number;
  isOnline: boolean;
  bio?: string;
  phone?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderType: 'customer' | 'sales_rep' | 'system';
  senderName: string;
  senderId?: string;
  messageText: string;
  isInternalNote?: boolean;
  createdAt: string;
}

export type ProjectStage =
  | 'Sales Handover'
  | 'Client Onboarding'
  | 'Requirements'
  | 'Content'
  | 'UI/UX Design'
  | 'Client Design Approval'
  | 'Development'
  | 'QA'
  | 'Client Review'
  | 'Final Revisions'
  | 'Launch'
  | 'Handover'
  | 'Completed';

export type ProjectStatus = 'Active' | 'Paused' | 'Cancelled' | 'Completed';

export type TaskStatus = 'To Do' | 'In Progress' | 'Review' | 'Changes Required' | 'Done';

export type TaskPriority = 'Low' | 'Normal' | 'High' | 'Urgent';

export interface Project {
  id: string;
  projectNumber: string;
  projectName: string;
  clientId: string;
  sourceOpportunityId: string;
  quotationId: string;
  packageSnapshot?: string;
  projectValue: number;
  currency: string;
  projectManagerId?: string;
  stage: ProjectStage;
  priority: TaskPriority;
  status: ProjectStatus;
  startDate?: string;
  targetDate?: string;
  completedAt?: string;
  requirementsSummary?: string;
  scopeSummary?: string;
  exclusions?: string;
  salesHandoverNotes?: string;
  internalNotes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectTeamMember {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  assignedAt: string;
  // Join fields
  user?: UserProfile;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  department?: string;
  assignedTo?: string;
  createdBy: string;
  priority: TaskPriority;
  status: TaskStatus;
  startDate?: string;
  dueDate?: string;
  completedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  // Join fields
  project?: Project;
  assignee?: UserProfile;
}

export const PROJECT_STAGES: ProjectStage[] = [
  'Sales Handover',
  'Client Onboarding',
  'Requirements',
  'Content',
  'UI/UX Design',
  'Client Design Approval',
  'Development',
  'QA',
  'Client Review',
  'Final Revisions',
  'Launch',
  'Handover',
  'Completed'
];

export const TASK_STATUSES: TaskStatus[] = ['To Do', 'In Progress', 'Review', 'Changes Required', 'Done'];
export const TASK_PRIORITIES: TaskPriority[] = ['Low', 'Normal', 'High', 'Urgent'];

export interface ChatConversation {
  id: string;
  crmLeadId?: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  intent: 'new_package' | 'existing_issue';
  originalSalesId: string;
  currentSalesId: string;
  status: 'open' | 'pending' | 'resolved';
  ratingGiven?: number;
  feedbackComment?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Sales Commission Management Types ---

export type CommissionStatus = 
  | 'Earned' 
  | 'Under Review' 
  | 'Approved' 
  | 'Paid' 
  | 'Reversed' 
  | 'Disputed';

export const COMMISSION_STATUSES: CommissionStatus[] = [
  'Earned',
  'Under Review',
  'Approved',
  'Paid',
  'Reversed',
  'Disputed'
];

export interface CommissionRule {
  id: string;
  packageCode: string;
  packageName: string;
  baseRatePercent: number;
  selfGeneratedRatePercent: number;
  minRatePercent?: number;
  maxRatePercent?: number;
  requiresAdminApproval: boolean;
  active: boolean;
  sortOrder: number;
  effectiveFrom: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CommissionSettingsConfig {
  packageRules: CommissionRule[];
  selfGeneratedBonusPercent: number; // e.g. 5.0 (+5 percentage points)
  performanceBonusThreshold: number; // e.g. 10 (11th sale onward)
  performanceBonusPercent: number; // e.g. 2.0 (+2 percentage points)
  payoutScheduleDescription: string; // e.g. '15th of the month & Last working day of the month'
  customDealMinRate: number; // 10.0
  customDealMaxRate: number; // 15.0
  lastUpdated: string;
}

export interface CommissionEntry {
  id: string;
  entryNumber: string; // e.g. COM-2026-0001
  salespersonId: string;
  salespersonName: string;
  salespersonEmail?: string;
  clientId: string;
  clientName: string;
  opportunityId?: string;
  quotationId?: string;
  quotationNumber?: string;
  paymentId: string;
  paymentReference: string;
  milestoneLabel: string;
  packageCode: string;
  packageName: string;
  verifiedPaymentAmount: number;
  currency: string;
  baseCommissionRate: number; // e.g. 12.0
  isSelfGenerated: boolean;
  selfGeneratedBonusRate: number; // e.g. 5.0
  isPerformanceBonusEligible: boolean;
  performanceSaleRank: number; // e.g. 1st, 11th sale in month
  performanceBonusRate: number; // e.g. 2.0
  effectiveCommissionRate: number; // sum of rates (e.g. 12 + 5 = 17)
  commissionAmount: number; // exact numeric calculation
  eligibilityDate: string; // ISO date of verified payment
  status: CommissionStatus;
  ruleSnapshot: any; // complete snapshot of rule configuration at time of creation
  payoutBatchId?: string;
  payoutReference?: string;
  paidAt?: string;
  paidBy?: string;
  notes?: string;
  adminReviewNotes?: string;
  reversalReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionPayoutBatch {
  id: string;
  batchNumber: string; // e.g. POB-2026-08-15
  title: string;
  scheduledDate: string;
  status: 'Draft' | 'Approved' | 'Processing' | 'Completed' | 'Cancelled';
  totalAmount: number;
  totalEntriesCount: number;
  totalSalespeopleCount: number;
  entryIds: string[];
  processedBy?: string;
  completedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionStats {
  earnedTotal: number;
  approvedTotal: number;
  paidTotal: number;
  pendingReviewTotal: number;
  earnedThisMonth: number;
  paidThisMonth: number;
  salesCountThisMonth: number;
  nextPayoutSchedule: string;
}
