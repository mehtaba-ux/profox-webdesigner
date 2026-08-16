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
  focusKeyword: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  noIndex: boolean;
  schemaType: 'WebPage' | 'Article' | 'Organization' | 'Service';
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

export interface SiteSettings {
  businessName: string;
  website: string;
  contactEmail: string;
  contactPhone: string;
  securityContact: string;
  address: string;
  businessAddress: string;
  googleReviewUrl?: string;
  lastUpdated: string;
  maintenanceMode?: MaintenanceConfig;
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

export interface ProjectMilestone {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'approved';
  dueDate?: string;
  completedAt?: string;
}

export interface ProjectFile {
  id: string;
  name: string;
  url: string;
  type: string;
  uploadedAt: string;
}

export interface ClientProject {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  projectName: string;
  status: 'planning' | 'design' | 'development' | 'testing' | 'launched';
  progress: number; // 0-100
  startDate: string;
  targetEndDate: string;
  milestones: ProjectMilestone[];
  files: ProjectFile[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatConversation {
  id: string;
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
