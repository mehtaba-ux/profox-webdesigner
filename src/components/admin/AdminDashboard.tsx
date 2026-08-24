import React, { useState, useEffect } from 'react';
import { useCMS } from '../../lib/CMSProvider';
import { ConfirmProvider, useConfirmContext } from './ConfirmContext';
import { ConfirmButton } from './ConfirmButton';
import { supabase } from '../../lib/supabase';
import { 
  Layout, 
  Home, 
  Layers, 
  Briefcase, 
  FileText, 
  MessageSquare, 
  Settings, 
  Save, 
  Check, 
  Loader2,
  Plus, 
  Trash2, 
  ArrowLeft,
  Users,
  Eye,
  Globe,
  Monitor,
  Grid,
  Lock,
  LogOut,
  Mail,
  Key,
  UserPlus,
  LogIn,
  ShieldAlert,
  UserCheck,
  UserX,
  ChevronDown,
  Image as ImageIcon,
  Database,
  DollarSign,
  Sun,
  Moon,
  X,
  EyeOff,
  ExternalLink,
  Info,
  Sparkles,
  HelpCircle,
  Hammer,
  Award,
  ShieldCheck,
  Clock,
  ArrowRight,
  RefreshCw,
  LayoutGrid,
  Calendar,
  Receipt,
  ListChecks,
  BookOpen,
  Sliders
} from 'lucide-react';
import { navItems, services, featuredCaseStudies, recentSuccess, articles, defaultCustomPages, defaultPortfolioItems, defaultPortfolioCategories } from '../../data';
import { CustomPage, PortfolioItem, PortfolioCategory, Service, ROLE_LABELS, STATUS_LABELS } from '../../types';
import PagesManager from './PagesManager';
import PortfolioManager from './PortfolioManager';
import BlogManager from './BlogManager';
import FeedbackManager from './FeedbackManager';
import MediaManager from './MediaManager';
import TemplateManager from './TemplateManager';
import SiteSettingsManager from './SiteSettingsManager';
import CustomMenuManager from './CustomMenuManager';
import ImageUploader from './ImageUploader';
import SalesChatInbox from './SalesChatInbox';
import DevOnboarding from './DevOnboarding';
import TeamManager from './TeamManager';
import ProjectManager from './ProjectManager';
import MyWorkDashboard from './MyWorkDashboard';
import AwardsManager from './AwardsManager';
import UserRoleManager from './UserRoleManager';
import RecruitmentDashboard from './RecruitmentDashboard';
import CRMLeads from './CRMLeads';
import CRMPipeline from './CRMPipeline';
import CRMActivities from './CRMActivities';
import SalesCatalog from './SalesCatalog';
import QuotationsManager from './QuotationsManager';
import PaymentsManager from './PaymentsManager';
import ClientsManager from './ClientsManager';
import OnboardingManagement from './OnboardingManagement';
import ConfigurationCenter from './ConfigurationCenter';
import MyCommissions from './MyCommissions';
import AdminCommissionManager from './AdminCommissionManager';
import MyTraining from '../onboarding/MyTraining';
import TrainingLibrary from '../onboarding/TrainingLibrary';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, UserRole } from '../../lib/AuthContext';
import { getPagePath, isServicePage } from '../../lib/seoUrls';
import Logo from '../Logo';
import WorkspaceAuthScreen from './workspace/WorkspaceAuthScreen';

function SaveButton({ onSave, isSaving, showSaved, label = "Save Changes" }: { onSave: () => void, isSaving: boolean, showSaved: boolean, label?: string }) {
  return (
    <ConfirmButton onConfirm={onSave}
      disabled={isSaving}
      confirmTitle="Save Changes"
      confirmMessage="Are you sure you want to save these changes to the website? This action will update the live content."
      className={`px-6 py-2.5 rounded-lg font-bold text-xs flex items-center gap-2 shadow-lg transition-all min-w-[140px] justify-center ${
        showSaved 
          ? 'bg-green-500 text-white shadow-green-200' 
          : 'bg-[#000080] hover:bg-[#000066] text-white'
      } ${isSaving ? 'opacity-80 cursor-not-allowed' : ''}`}>
      {isSaving ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Processing...
        </>
      ) : showSaved ? (
        <>
          <Check className="w-4 h-4" />
          Saved!
        </>
      ) : (
        <>
          <Save className="w-4 h-4" />
          {label}
        </>
      )}
    </ConfirmButton>
  );
}

export default function AdminDashboard() {
  return <AdminDashboardInner />;
}

function AdminDashboardInner() {
  const { confirm: confirmAction } = useConfirmContext();
  const { content, updateSection, loading } = useCMS();
  const { 
    user, 
    profile, 
    role, 
    status, 
    isAdmin, 
    isActive, 
    isOnboarding,
    isAdminOrEditor, 
    logout, 
    refreshProfile, 
    loading: authChecking 
  } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [activeTab, setActiveTab] = useState<'pages' | 'blog' | 'portfolio' | 'media' | 'homepageSections' | 'header' | 'servicePackages' | 'footer' | 'templates' | 'siteSettings' | 'feedback' | 'leads' | 'crm_leads' | 'pipeline' | 'activities' | 'recruitment' | 'team' | 'projects' | 'myWork' | 'myProfile' | 'inbox' | 'awards' | 'quotations' | 'payments' | 'clients' | 'sales_catalog' | 'my_commissions' | 'admin_commissions' | 'onboarding' | 'training' | 'training_library' | 'configuration'>(
    isOnboarding ? 'training' :
    ((searchParams.get('tab') as any) || 
     (role === 'developer' || role === 'developer_designer' || role === 'uiux_designer' || role === 'content_writer' || role === 'qa' ? 'myWork' : 
      role === 'sales' || role === 'sales_rep' || role === 'sales_team' ? (isOnboarding ? 'training' : 'pipeline') : 'pages'))
  );

  const [tabMetadata, setTabMetadata] = useState<any>(null);

  const isDarkMode = false;

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  React.useEffect(() => {
    if (isOnboarding && activeTab !== 'training') {
      setActiveTab('training');
      setSearchParams({ tab: 'training' });
    }
  }, [isOnboarding, activeTab, setSearchParams]);

  const toggleDarkMode = () => {};

  // Dynamic Theme Classes to build a crystal-clear, highly professional UI/UX
  const bgMain = isDarkMode ? 'bg-[#080915] text-slate-100' : 'bg-[#f3f7fc] text-slate-800';
  const sidebarBg = isDarkMode ? 'bg-[#101226] border-slate-200/80' : 'bg-white border-slate-200';
  const headerBg = isDarkMode ? 'bg-[#101226] border-slate-200/80' : 'bg-white border-slate-200';
  const cardBg = isDarkMode ? 'bg-[#101226] border border-slate-200/80' : 'bg-white border border-slate-200 shadow-sm';
  const subCardBg = isDarkMode ? 'bg-[#080915]' : 'bg-slate-50/50 border border-slate-100';
  const inputBg = isDarkMode ? 'bg-[#080915] border-slate-200 text-slate-900 focus:border-[#FF0E0E]' : 'bg-white border-slate-200 text-slate-900 focus:border-[#000080]';
  const textMuted = isDarkMode ? 'text-slate-500' : 'text-slate-500';
  const textHeading = isDarkMode ? 'text-slate-900' : 'text-slate-900';
  const borderCol = isDarkMode ? 'border-slate-200/80' : 'border-slate-200';

  const handleTabChange = (tab: any, metadata?: any) => {
    if (isOnboarding && tab !== 'training' && tab !== 'training_library') {
      return;
    }
    setActiveTab(tab);
    setTabMetadata(metadata || null);
    setSearchParams({ tab });
  };

  const [savedMsg, setSavedMsg] = useState('');

  // Supabase Auth Form State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [registerSuccessMsg, setRegisterSuccessMsg] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setRegisterSuccessMsg('');
    setAuthLoading(true);
    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          if (error.message.includes('Email not confirmed')) {
            setAuthError('Your email address has not been confirmed yet. Please check your inbox for the verification link.');
            return;
          }
          throw error;
        }
        await refreshProfile();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName
            }
          }
        });
        if (error) throw error;
        setRegisterSuccessMsg('Account registered successfully! Please check your email to confirm your account before signing in.');
      }
    } catch (err: any) {
      console.error(err);
      let message = err.message || 'Authentication failed.';
      
      // Handle rate limiting message specifically
      if (message.includes('security purposes')) {
        const seconds = message.match(/\d+/);
        message = `Too many attempts. For security, please wait ${seconds ? seconds[0] : 'a moment'} before trying again.`;
      }
      
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      setAuthError('Please enter your email address first.');
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });
      if (error) throw error;
      setRegisterSuccessMsg('Verification email has been resent. Please check your inbox.');
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || 'Failed to resend verification email.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setAuthError('');
    setRegisterSuccessMsg('');
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
      });
      if (error) throw error;
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || 'Google sign in failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
  };

  // Local form states
  const heroData = content.hero || {
    headingLine1: 'We Create Digital Solutions',
    headingLine2: 'That Drive Business Impact',
    buttonText: 'Speak With a Digital Advisor',
    trustedByTitle: 'Trusted by:',
    trustedLogos: ['CLEAR', 'BROWN', 'M', 'Unilever']
  };

  const headerData = content.header || {
    dotText: 'Profox',
    logicsText: 'web designer',
    taglineLine1: 'Where Design & Technology',
    taglineLine2: 'Meet Business Impact',
    buttonText: 'Get in Touch',
    navItems: navItems
  };

  const servicesData = content.services || {
    title: 'How We Help',
    list: services
  };

  const servicePackagesData = content.servicePackages || {
    title: 'Our Services Packages',
    subtitle: 'Completely customizable digital solutions tailored to match your specific hotel & corporate requirements.',
    list: [
      {
        id: 'starter',
        title: 'Starter Web Package',
        price: '$1,499',
        period: 'one-time',
        description: 'Get online quickly with a custom, high-converting responsive responsive landing page designed to turn visitors into paying customers.',
        features: [
          '1 Custom High-Converting Landing Page',
          'Mobile-First Responsive Design',
          'Basic SEO Setup & Indexing',
          'Interactive Contact / Booking Form',
          '1 Month Post-Launch Support'
        ],
        deliveryTime: '7 Days',
        popular: false,
        badge: 'Starter',
        ctaText: 'Get Started',
        ctaLink: '#contact'
      },
      {
        id: 'growth',
        title: 'Growth Suite Package',
        price: '$2,999',
        period: 'one-time',
        description: 'A complete multipage digital presence equipped with custom UI/UX design, blog publishing engine, and rich analytics integrations.',
        features: [
          'Up to 5 Custom-Designed Pages',
          'Full Blog & Content Management (CMS)',
          'Speed Optimization & Global CDN',
          'Google Analytics & Pixel Tracking',
          '3 Months Maintenance & Support'
        ],
        deliveryTime: '14-21 Days',
        popular: true,
        badge: 'Most Popular',
        ctaText: 'Choose Growth',
        ctaLink: '#contact'
      },
      {
        id: 'enterprise',
        title: 'Enterprise & Custom Solution',
        price: 'Custom Quote',
        period: 'from $4,999',
        description: 'Bespoke full-stack web applications, custom integrations, advanced databases, and tailored SEO strategy for major commercial growth.',
        features: [
          'Bespoke Custom Web Applications',
          'Advanced Relational / Document Databases',
          'Custom API & Third-Party Integrations',
          'Advanced Technical SEO & Copywriting',
          'Dedicated SLA Support & Core Audits'
        ],
        deliveryTime: 'Tailored Timeline',
        popular: false,
        badge: 'Enterprise',
        ctaText: 'Inquire Now',
        ctaLink: '/contact-us'
      }
    ]
  };

  const caseStudiesData = content.caseStudies || {
    titleLine1: '20+ Years of Helping',
    titleLine2: 'Businesses Transform',
    featured: featuredCaseStudies,
    recentTitle: 'Recent Success',
    recentTitleHighlight: 'Stories',
    recent: recentSuccess
  };

  const insightsData = content.insights || {
    title: 'Expert Insights',
    articlesList: articles
  };

  const ctaData = content.cta || {
    heading: "Let's Create Real Digital Impact",
    paragraph1: 'Build better experiences for your customers and simpler systems for your team.',
    paragraph2: 'Everything works together, so your business runs smoothly with clarity and momentum.',
    buttonText: 'Speak With a Digital Advisor'
  };

  const footerData = content.footer || {
    description: 'ProFox designs websites, develops custom applications, and builds business automation systems that help companies attract customers, simplify operations, and measure growth.',
    copyright: '© 2026 ProFox Webdesigner. All Rights Reserved.',
    logoSize: 58,
    servicesLinks: [{ label: 'Website Design & Development', href: '/services/website-design-and-development' }, { label: 'Web & Mobile Application Development', href: '/services/web-and-mobile-application-development' }, { label: 'Email Marketing & Business Automation', href: '/services/email-marketing-and-business-automation' }],
    companyLinks: [{ label: 'About ProFox', href: '/about-us' }, { label: 'Our Work', href: '/portfolio' }, { label: 'Insights', href: '/blog' }, { label: 'Careers', href: '/careers' }, { label: 'Contact Us', href: '/contact-us' }],
    legalLinks: [{ label: 'Privacy Policy', href: '/privacy-policy' }, { label: 'Terms & Conditions', href: '/terms-and-conditions' }, { label: 'Cookie Policy', href: '/cookie-policy' }],
    socialLinks: { linkedin: '', facebook: '', instagram: '', twitter: '', youtube: '' },
    registrationText: 'ProFox Digital Solution · Udyam: UDYAM-HP-09-0022689',
    ctaText: 'Start a Conversation'
  };

  const growthData = content.growth || {
    enabled: true,
    headline: 'We help you grow your business and make customers happy at the same time. We build experiences your customers love and use technology to make your operations effortless.',
    bgImage: 'https://images.unsplash.com/photo-1600880212340-02d956ea6188?auto=format&fit=crop&q=80&w=2000',
    awardsTitle: 'Awards & Recognition:',
    awards: [
      { name: 'CLUTCH 2024', subtext: 'TOP DEVELOPER', type: 'CLUTCH' },
      { name: 'DESIGNRUSH', subtext: '', type: 'TEXT' },
      { name: 'BestDesign', subtext: '', type: 'BORDERED' }
    ]
  };

  const customPagesList: CustomPage[] = (() => {
    const stored = content.customPages;
    if (!Array.isArray(stored) || stored.length === 0) {
      return defaultCustomPages;
    }
    const merged: CustomPage[] = stored.map((item: any) => {
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
        return {
          ...def,
          ...item,
          seo: { ...def.seo, ...(item.seo || {}) }
        };
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
  
  const portfolioItems: PortfolioItem[] = Array.isArray(content.portfolio_items) ? content.portfolio_items : defaultPortfolioItems;
  
  const portfolioCategories: PortfolioCategory[] = Array.isArray(content.portfolio_categories) ? content.portfolio_categories : defaultPortfolioCategories;

  const myProfile = (content.team_members || []).find((m: any) => m.userId === user?.id);
  const handleSaveTeamMember = async (member: any) => {
    const teamMembers = content.team_members || [];
    const existingIndex = teamMembers.findIndex((m: any) => m.id === member.id || m.userId === member.userId);
    let updatedList;
    if (existingIndex>= 0) {
      updatedList = [...teamMembers];
      updatedList[existingIndex] = member;
    } else {
      updatedList = [...teamMembers, member];
    }
    await updateSection('team_members', updatedList);
  };

  const handleSavePortfolioItem = async (itemToSave: PortfolioItem) => {
    let updatedList;
    const existingIndex = portfolioItems.findIndex(p => p.id === itemToSave.id || p.slug === itemToSave.slug);
    if (existingIndex>= 0) {
      updatedList = [...portfolioItems];
      updatedList[existingIndex] = itemToSave;
    } else {
      updatedList = [...portfolioItems, itemToSave];
    }
    await updateSection('portfolio_items', updatedList);
    showSaveNotification('Case study saved to portfolio database!');
  };

  const handleDeletePortfolioItem = async (itemId: string) => {
    const updatedList = portfolioItems.filter(p => p.id !== itemId && p.slug !== itemId);
    await updateSection('portfolio_items', updatedList);
    showSaveNotification('Case study deleted from portfolio database.');
  };

  const handleBulkDeletePortfolioItems = async (itemIds: string[]) => {
    const updatedList = portfolioItems.filter(p => !itemIds.includes(p.id) && !itemIds.includes(p.slug));
    await updateSection('portfolio_items', updatedList);
    showSaveNotification(`${itemIds.length} case studies deleted from portfolio database.`);
  };

  const handleRestoreDefaultsPortfolioItems = async () => {
    const updatedList = [...portfolioItems];
    let restoredCount = 0;
    for (const defItem of defaultPortfolioItems) {
      if (!updatedList.some(p => p.id === defItem.id || p.slug === defItem.slug)) {
        updatedList.push(defItem);
        restoredCount++;
      }
    }
    if (restoredCount> 0) {
      await updateSection('portfolio_items', updatedList);
      showSaveNotification(`${restoredCount} demo case studies restored to your portfolio.`);
    } else {
      showSaveNotification('No missing demo case studies found. Your portfolio is already up to date.');
    }
  };

  const handleSavePortfolioCategory = async (catToSave: PortfolioCategory) => {
    let updatedList;
    const existingIndex = portfolioCategories.findIndex(c => c.id === catToSave.id);
    if (existingIndex>= 0) {
      updatedList = [...portfolioCategories];
      updatedList[existingIndex] = catToSave;
    } else {
      updatedList = [...portfolioCategories, catToSave];
    }
    await updateSection('portfolio_categories', updatedList);
    showSaveNotification('Portfolio category saved!');
  };

  const handleDeletePortfolioCategory = async (catId: string) => {
    const updatedList = portfolioCategories.filter(c => c.id !== catId);
    await updateSection('portfolio_categories', updatedList);
    showSaveNotification('Portfolio category deleted.');
  };

  
  const handleSaveCustomPage = async (pageToSave: CustomPage) => {
    const existingIndex = customPagesList.findIndex(p => p.id === pageToSave.id);
    let updatedList: CustomPage[];
    if (existingIndex>= 0) {
      updatedList = [...customPagesList];
      updatedList[existingIndex] = pageToSave;
    } else {
      updatedList = [...customPagesList, pageToSave];
    }
    await updateSection('customPages', updatedList);
    showSaveNotification('Page saved & synchronized with Supabase!');
  };

  const handleDeleteCustomPage = async (pageId: string) => {
    const updatedList = customPagesList.filter(p => p.id !== pageId);
    await updateSection('customPages', updatedList);
    showSaveNotification('Page deleted from Supabase.');
  };

  const handleRestoreDefaultsCustomPages = async () => {
    await updateSection('customPages', defaultCustomPages);
    showSaveNotification('All standard pages restored & synchronized!');
  };

  const showSaveNotification = (msg: string) => {
    setSavedMsg(msg);
    setTimeout(() => setSavedMsg(''), 3000);
  };

  if (loading || authChecking) {
    return (
      <div className={`min-h-screen ${bgMain} flex items-center justify-center`}>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-[#000080] border-t-[#FF0E0E] rounded-full animate-spin" />
          <span className="font-semibold text-sm">Authenticating & Loading CMS...</span>
        </div>
      </div>
    );
  }

  // Determine whether current user is developer_designer or sales_team
  const isDevUser = role === 'developer' || role === 'developer_designer';
  const isSalesUser = role === 'sales' || role === 'sales_rep' || role === 'sales_team';

  // If user is not authenticated, show Login / Register screen
  if (!user) {
    return (
      <WorkspaceAuthScreen
        authMode={authMode}
        authLoading={authLoading}
        authError={authError}
        registerSuccessMsg={registerSuccessMsg}
        fullName={fullName}
        email={email}
        password={password}
        onModeChange={mode => {
          setAuthMode(mode);
          setAuthError('');
          setRegisterSuccessMsg('');
        }}
        onFullNameChange={setFullName}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleEmailAuth}
        onGoogle={handleGoogleAuth}
        onResendVerification={handleResendVerification}
      />
    );
  }
  // 1. Pending Approval State Screen
  if (profile?.status === 'pending' || profile?.role === 'pending' || (!profile && status === 'pending')) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white border border-amber-300 rounded-3xl p-8 shadow-xl text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Awaiting Administrator Approval</h1>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full inline-block font-mono font-bold">
              Status: Pending Verification
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left text-xs space-y-2 text-slate-600">
            <div className="flex justify-between border-b border-slate-200 pb-2">
              <span className="font-semibold text-slate-500">Name:</span>
              <span className="font-bold text-slate-900">{profile?.fullName || user.user_metadata?.full_name || 'ProFox Team Member'}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-2">
              <span className="font-semibold text-slate-500">Email:</span>
              <span className="font-bold text-slate-900">{user.email}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-2">
              <span className="font-semibold text-slate-500">Assigned Role:</span>
              <span className="font-bold text-amber-600">Pending Authorization</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-slate-500">Department:</span>
              <span className="font-bold text-slate-700">{profile?.department || 'General'}</span>
            </div>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Your ProFox account has been registered and is awaiting verification from the system administrator. Once approved, your assigned role and workspace permissions will be activated automatically.
          </p>

          <div className="pt-2 space-y-2.5">
            <button 
              onClick={async () => {
                await refreshProfile();
              }}
              className="w-full py-3 bg-[#000080] hover:bg-[#000066] text-white font-bold rounded-xl text-xs transition-all shadow flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Check / Refresh Status
            </button>
            <button 
              onClick={() => navigate('/')}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Return to Website
            </button>
            <button 
              onClick={handleSignOut}
              className="w-full py-2.5 text-slate-400 hover:text-red-600 text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Inactive State Screen
  if (profile?.status === 'inactive' || status === 'inactive') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-3xl p-8 shadow-xl text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-50 text-red-600 border border-red-200">
            <UserX className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Account Deactivated</h1>
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-1 rounded-full inline-block font-mono font-bold">
              Status: Inactive
            </p>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Your ProFox account is currently deactivated. Please contact your system administrator or project manager to reactivate your workspace access.
          </p>

          <div className="pt-2 space-y-2.5">
            <button 
              onClick={() => navigate('/')}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Return to Website
            </button>
            <button 
              onClick={handleSignOut}
              className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl text-xs transition-all border border-red-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Customer / Restricted State Screen
  if (!isAdminOrEditor) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white border border-amber-200 rounded-3xl p-8 shadow-xl text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Access Restricted</h1>
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full inline-block font-mono font-bold">
              Account Role: {ROLE_LABELS[role || 'customer'] || 'Customer'}
            </p>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Customer and non-staff accounts do not have administrative permissions. CMS management, visual customizations, and CRM tools are restricted to authorized ProFox team members.
          </p>

          <div className="pt-2 space-y-2.5">
            <button 
              onClick={() => navigate('/client-portal')}
              className="w-full py-3 bg-[#000080] hover:bg-[#000066] text-white font-bold rounded-xl text-xs transition-all shadow flex items-center justify-center gap-2 cursor-pointer"
            >
              Go to Client Portal <ArrowRight className="w-4 h-4" />
            </button>
            <button 
              onClick={() => navigate('/')}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Return to Website
            </button>
            <button 
              onClick={handleSignOut}
              className="w-full py-2.5 text-slate-400 hover:text-red-600 text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${bgMain} flex flex-col font-sans transition-colors duration-200`}>
      {/* Top Navigation */}
      <header className={`${headerBg} border-b ${borderCol} px-6 py-4 flex items-center justify-between sticky top-0 z-50 transition-colors duration-200`}>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')}
            className={`p-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
              isDarkMode 
                ? 'bg-slate-100 hover:bg-slate-700 text-slate-800 border-slate-300' 
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm'
            }`}>
            <ArrowLeft className="w-3.5 h-3.5" /> View Site
          </button>
          <div className={`flex items-center gap-3 pl-4 border-l ${borderCol}`}>
            <Globe className="w-5 h-5 text-[#000080] dark:text-blue-400 animate-pulse" />
            <span className={`font-black text-base tracking-tight ${textHeading}`}>ProFox CMS Studio</span>
            <span className="text-[10px] bg-[#FF0E0E]/15 text-[#FF0E0E] font-mono px-2 py-0.5 rounded border border-[#FF0E0E]/30 font-bold uppercase tracking-wider">
              WordPress Live Engine
            </span>

            {/* Development Mode Quick Indicator */}
            {content.siteSettings?.maintenanceMode?.enabled ? (
              <button 
                onClick={() => setActiveTab('siteSettings')}
                className="text-[10px] bg-amber-500/10 text-amber-600 font-mono px-2 py-0.5 rounded border border-amber-500/20 font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer hover:bg-amber-500/20 transition-all"
                title="Click to view Settings"
              >
                <Hammer className="w-3 h-3" />
                <span>Dev Mode: ACTIVE</span>
              </button>
            ) : (
              <button 
                onClick={() => setActiveTab('siteSettings')}
                className="text-[10px] bg-emerald-500/10 text-emerald-600 font-mono px-2 py-0.5 rounded border border-emerald-500/20 font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer hover:bg-emerald-500/20 transition-all"
                title="Click to view Settings"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Site: Live</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {savedMsg && (
            <div className="flex items-center gap-2 text-[#000080] bg-[#000080]/10 border border-[#000080]/20 px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-sm animate-in fade-in duration-200">
              <Check className="w-4 h-4 text-[#000080]" /> {savedMsg}
            </div>
          )}

          {/* Theme Mode Toggle Button */}
          <button 
            onClick={toggleDarkMode}
            className={`p-2 rounded-lg border transition-all flex items-center justify-center cursor-pointer ${
              isDarkMode 
                ? 'bg-slate-100 border-slate-300 text-amber-400 hover:text-amber-300' 
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 shadow-sm'
            }`}
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Night Mode"}
          >
            {isDarkMode ? <Sun className="w-4.5 h-4.5"  /> : <Moon className="w-4.5 h-4.5" />}
          </button>

          {/* User Profile Badge & Secure Sign out */}
          <div className={`flex items-center gap-3 pl-3 border-l ${borderCol}`}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 text-[#000080] flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                {(profile?.fullName || user.email || 'U')[0]}
              </div>
              <div className="text-right text-xs hidden md:block">
                <div className={`font-bold max-w-[160px] truncate ${textHeading}`}>
                  {profile?.fullName || user.email?.split('@')[0]}
                </div>
                <div className="flex items-center gap-1.5 justify-end">
                  <span className="text-[10px] font-bold text-[#000080] bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded">
                    {ROLE_LABELS[role || 'admin'] || role}
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    {profile?.department || 'Staff'}
                  </span>
                </div>
              </div>
            </div>

            <button 
              onClick={handleSignOut}
              className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-200 transition-colors cursor-pointer"
              title="Sign Out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Admin Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`w-64 ${sidebarBg} border-r p-4 flex flex-col gap-2 shrink-0 transition-colors duration-200`}>
          {isOnboarding ? (
            <>
              <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-[#000080]" /> Training
              </div>

              <button onClick={() => handleTabChange('training')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'training' 
                    ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}>
                <div className="flex items-center gap-2.5">
                  <BookOpen className="w-4 h-4" /> My Training
                </div>
              </button>

              <button onClick={() => handleTabChange('training_library')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'training_library' 
                    ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}>
                <div className="flex items-center gap-2.5">
                  <BookOpen className="w-4 h-4 text-purple-600" /> Training Library
                </div>
              </button>
            </>
          ) : (
            <>
              <div className="px-3 py-2 text-[10px] font-bold text-[#FF0E0E] uppercase tracking-widest flex items-center justify-between">
                <span>WordPress Engine</span>
                <span className="bg-[#FF0E0E]/10 text-[#FF0E0E] text-[9px] px-2 py-0.5 rounded font-bold border border-[#FF0E0E]/20">New</span>
              </div>

              <button onClick={() => handleTabChange('pages')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'pages' 
                ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
            }`}>
            <div className="flex items-center gap-2.5">
              <FileText className="w-4 h-4" /> Pages & SEO
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
              activeTab === 'pages' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-100 text-[#000080] dark:text-blue-300 border border-slate-200 dark:border-slate-300'
            }`}>
              {customPagesList.length}
            </span>
          </button>

          <button onClick={() => handleTabChange('blog')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'blog' 
                ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
            }`}>
            <div className="flex items-center gap-2.5">
              <Plus className="w-4 h-4" /> Blog & Articles
            </div>
          </button>
          <button onClick={() => handleTabChange('portfolio')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'portfolio' 
                ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
            }`}>
            <div className="flex items-center gap-2.5">
              <Briefcase className="w-4 h-4" /> Portfolio
            </div>
          </button>

          <button onClick={() => handleTabChange('crm_leads')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'crm_leads'
                ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                : `${isDarkMode ? 'text-slate-500 hover:bg-slate-100/50 hover:text-slate-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
            }`}>
            <div className="flex items-center gap-2.5">
              <MessageSquare className="w-4 h-4" /> Form Inquiries
            </div>
          </button>

          <button onClick={() => handleTabChange('feedback')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'feedback' 
                ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
            }`}>
            <div className="flex items-center gap-2.5">
              <MessageSquare className="w-4 h-4" /> Feedback Inbox
            </div>
            {content.feedback_submissions?.filter((f: any) => f.status === 'pending').length> 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shadow-sm shadow-amber-200" />
            )}
          </button>

          <button onClick={() => handleTabChange('media')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'media' 
                ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
            }`}>
            <div className="flex items-center gap-2.5">
              <ImageIcon className="w-4 h-4" /> Media Library
            </div>
          </button>

          {!isDevUser && !isSalesUser && (
            <button onClick={() => handleTabChange('templates')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'templates' 
                  ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                  : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
              }`}>
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4" /> Template Manager
              </div>
            </button>
          )}

          {!isDevUser && !isSalesUser && (
            <button onClick={() => handleTabChange('siteSettings')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'siteSettings' 
                  ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                  : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
              }`}>
              <div className="flex items-center gap-2.5">
                <Globe className="w-4 h-4" /> Site Settings
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                activeTab === 'siteSettings' ? 'bg-white/20 text-white' : 'bg-[#FF0E0E]/10 text-[#FF0E0E] border border-[#FF0E0E]/20'
              }`}>
                ID
              </span>
            </button>
          )}

          {/* DELIVERY SECTION */}
          {(isAdmin || role === 'project_manager' || role === 'site_manager' || role === 'content_writer' || role === 'uiux_designer' || role === 'developer' || role === 'developer_designer' || role === 'qa' || isSalesUser) && (
            <>
              <div className="mt-4 px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Briefcase className="w-3.5 h-3.5 text-[#000080]" /> Delivery
              </div>

              <button onClick={() => handleTabChange('projects')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'projects' 
                    ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                    : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
                }`}>
                <div className="flex items-center gap-2.5">
                  <Briefcase className="w-4 h-4" /> Client Projects
                </div>
              </button>

              {(isAdmin || role === 'project_manager' || role === 'site_manager' || role === 'content_writer' || role === 'uiux_designer' || role === 'developer' || role === 'developer_designer' || role === 'qa') && (
                <button onClick={() => handleTabChange('myWork')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'myWork' 
                      ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                      : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
                  }`}>
                  <div className="flex items-center gap-2.5">
                    <ListChecks className="w-4 h-4" /> My Work
                  </div>
                </button>
              )}
            </>
          )}

          {isAdmin && (
            <>
              <div className="mt-4 px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Users className="w-3 h-3" /> People
              </div>

              <button onClick={() => handleTabChange('recruitment')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'recruitment' 
                    ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                    : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
                }`}>
                <div className="flex items-center gap-2.5">
                  <Briefcase className="w-4 h-4" /> Recruitment
                </div>
              </button>

              <button onClick={() => handleTabChange('onboarding')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'onboarding' 
                    ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                    : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
                }`}>
                <div className="flex items-center gap-2.5">
                  <Award className="w-4 h-4" /> Onboarding Mgt
                </div>
              </button>
            </>
          )}

          {isSalesUser && isOnboarding && (
            <>
              <div className="mt-4 px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Award className="w-3 h-3" /> Training
              </div>

              <button onClick={() => handleTabChange('training')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'training' 
                    ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                    : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
                }`}>
                <div className="flex items-center gap-2.5">
                  <BookOpen className="w-4 h-4" /> My Training
                </div>
              </button>
            </>
          )}

          {(isAdmin || (isSalesUser && status === 'active')) && isActive && (
            <>
              <div className="mt-4 px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <DollarSign className="w-3 h-3" /> Sales
              </div>

              <button onClick={() => handleTabChange('training_library')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'training_library' 
                    ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                    : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
                }`}>
                <div className="flex items-center gap-2.5">
                  <BookOpen className="w-4 h-4 text-purple-600" /> Training Library
                </div>
              </button>

              <button onClick={() => handleTabChange('crm_leads')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'crm_leads' 
                    ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                    : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
                }`}>
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4" /> Leads
                </div>
              </button>

              <button onClick={() => handleTabChange('pipeline')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'pipeline' 
                    ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                    : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
                }`}>
                <div className="flex items-center gap-2.5">
                  <LayoutGrid className="w-4 h-4" /> Pipeline
                </div>
              </button>

              <button onClick={() => handleTabChange('activities')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'activities' 
                    ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                    : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
                }`}>
                <div className="flex items-center gap-2.5">
                  <Calendar className="w-4 h-4" /> My Activities
                </div>
              </button>

              <button onClick={() => handleTabChange('quotations')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'quotations' 
                    ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                    : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
                }`}>
                <div className="flex items-center gap-2.5">
                  <Receipt className="w-4 h-4" /> Quotations
                </div>
              </button>

              <button onClick={() => handleTabChange('payments')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'payments' 
                    ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                    : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
                }`}>
                <div className="flex items-center gap-2.5">
                  <DollarSign className="w-4 h-4" /> Payments
                </div>
              </button>

              <button onClick={() => handleTabChange('clients')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'clients' 
                    ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                    : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
                }`}>
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4" /> Clients
                </div>
              </button>

              <button onClick={() => handleTabChange('sales_catalog')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'sales_catalog' 
                    ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                    : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
                }`}>
                <div className="flex items-center gap-2.5">
                  <ListChecks className="w-4 h-4" /> Sales Catalog
                </div>
              </button>

              <button onClick={() => handleTabChange('my_commissions')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'my_commissions' 
                    ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                    : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
                }`}>
                <div className="flex items-center gap-2.5">
                  <Award className="w-4 h-4 text-emerald-500" /> My Commissions
                </div>
                <span className="text-[9px] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold uppercase">
                  Payouts
                </span>
              </button>
            </>
          )}

          {isAdmin && (
            <>
              
              <button onClick={() => handleTabChange('team')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'team' 
                    ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                    : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
                }`}>
                <div className="flex items-center gap-2.5">
                  <UserCheck className="w-4 h-4" /> Team & Users
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                  activeTab === 'team' ? 'bg-white/20 text-white' : 'bg-[#000080]/10 text-[#000080] border border-[#000080]/20'
                }`}>
                  {(content.team_members || []).length}
                </span>
              </button>

              <button onClick={() => handleTabChange('admin_commissions')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'admin_commissions' 
                    ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                    : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
                }`}>
                <div className="flex items-center gap-2.5">
                  <DollarSign className="w-4 h-4 text-purple-600" /> Commission Mgt
                </div>
                <span className="text-[9px] bg-purple-500/10 text-purple-600 border border-purple-500/20 px-1.5 py-0.5 rounded font-bold uppercase">
                  Admin
                </span>
              </button>

              <button onClick={() => handleTabChange('configuration')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'configuration' 
                    ? 'bg-[#000080] text-white shadow shadow-blue-900/10' 
                    : `${isDarkMode ? 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
                }`}>
                <div className="flex items-center gap-2.5">
                  <Sliders className="w-4 h-4 text-emerald-500" /> Configuration
                </div>
                <span className="text-[9px] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold uppercase">
                  Center
                </span>
              </button>
            </>
          )}

          <div className={`px-3 py-2 mt-3 text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>
            Management
          </div>

          <button onClick={() => setActiveTab('homepageSections')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'homepageSections' 
                ? 'bg-[#000080]/10 text-[#000080] dark:text-blue-300 border border-[#000080]/30 shadow-sm' 
                : `border border-transparent ${isDarkMode ? 'text-slate-500 hover:bg-slate-100/50 hover:text-slate-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`
            }`}>
            <Home className="w-4 h-4" /> Homepage Sections
          </button>

          <button onClick={() => setActiveTab('awards')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'awards' 
                ? 'bg-[#000080]/10 text-[#000080] dark:text-blue-300 border border-[#000080]/30 shadow-sm' 
                : `border border-transparent ${isDarkMode ? 'text-slate-500 hover:bg-slate-100/50 hover:text-slate-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`
            }`}>
            <Award className="w-4 h-4 text-[#000080] dark:text-blue-300" /> Award Section
          </button>

          <button onClick={() => setActiveTab('header')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'header' 
                ? 'bg-[#000080]/10 text-[#000080] dark:text-blue-300 border border-[#000080]/30 shadow-sm' 
                : `border border-transparent ${isDarkMode ? 'text-slate-500 hover:bg-slate-100/50 hover:text-slate-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`
            }`}>
            <Layout className="w-4 h-4" /> Navigation & Header
          </button>

          <button onClick={() => setActiveTab('servicePackages')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'servicePackages' 
                ? 'bg-[#000080]/10 text-[#000080] dark:text-blue-300 border border-[#000080]/30 shadow-sm' 
                : `border border-transparent ${isDarkMode ? 'text-slate-500 hover:bg-slate-100/50 hover:text-slate-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`
            }`}>
            <DollarSign className="w-4 h-4" /> Services Packages
          </button>

          <button onClick={() => setActiveTab('footer')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'footer' 
                ? 'bg-[#000080]/10 text-[#000080] dark:text-blue-300 border border-[#000080]/30 shadow-sm' 
                : `border border-transparent ${isDarkMode ? 'text-slate-500 hover:bg-slate-100/50 hover:text-slate-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`
            }`}>
            <Settings className="w-4 h-4" /> Footer Settings
          </button>
            </>
          )}
        </aside>

        {/* Editor Main */}
        <main className={`flex-1 ${bgMain} p-8 overflow-y-auto transition-colors duration-200`}>
          {/* TAB 0: PAGES MANAGER (WordPress Engine) */}
          {activeTab === 'pages' && (
            <PagesManager 
              pages={customPagesList}
              onSavePage={handleSaveCustomPage}
              onDeletePage={handleDeleteCustomPage}
              onRestoreDefaults={handleRestoreDefaultsCustomPages}
            />
          )}

          {/* TAB BLOG: BLOG MANAGER */}
          {activeTab === 'blog' && (
            <BlogManager />
          )}

          {activeTab === 'portfolio' && (
            <PortfolioManager 
              items={portfolioItems}
              categories={portfolioCategories}
              onSave={handleSavePortfolioItem} 
              onDelete={handleDeletePortfolioItem} 
              onBulkDelete={handleBulkDeletePortfolioItems}
              onRestoreDefaults={handleRestoreDefaultsPortfolioItems}
              onSaveCategory={handleSavePortfolioCategory}
              onDeleteCategory={handleDeletePortfolioCategory}
            />
          )}

          {/* TAB MEDIA: MEDIA LIBRARY */}
          {activeTab === 'media' && (
            <div className="h-full bg-slate-50 rounded-2xl border border-slate-900 shadow-xl overflow-hidden">
              <MediaManager />
            </div>
          )}

          {/* TAB TEMPLATES: TEMPLATE MANAGER */}
          {activeTab === 'templates' && (
            <TemplateManager />
          )}

          {/* Legacy saved tabs now open the canonical CRM lead workspace. */}
          {activeTab === 'leads' && (
            <CRMLeads onNavigate={handleTabChange} />
          )}

          {activeTab === 'feedback' && (
            <FeedbackManager />
          )}

          {/* TAB SITE SETTINGS: SITE SETTINGS MANAGER */}
          {activeTab === 'siteSettings' && (
            <SiteSettingsManager />
          )}

          {activeTab === 'projects' && (
            <ProjectManager />
          )}

          {activeTab === 'myWork' && (
            <MyWorkDashboard />
          )}

          {activeTab === 'team' && (
            <TeamManager portfolioItems={portfolioItems} />
          )}

          {activeTab === 'recruitment' && (
            <RecruitmentDashboard />
          )}

          {activeTab === 'crm_leads' && (
            <CRMLeads onNavigate={handleTabChange} />
          )}

          {activeTab === 'pipeline' && (
            <CRMPipeline onNavigate={handleTabChange} />
          )}

          {activeTab === 'activities' && (
            <CRMActivities onNavigate={handleTabChange} />
          )}

          {activeTab === 'quotations' && (
            <QuotationsManager onNavigate={handleTabChange} />
          )}

          {activeTab === 'payments' && (
            <PaymentsManager initialMetadata={tabMetadata} />
          )}

          {activeTab === 'clients' && (
            <ClientsManager />
          )}

          {activeTab === 'onboarding' && (
            <OnboardingManagement />
          )}

          {activeTab === 'training' && (
            <MyTraining />
          )}

          {activeTab === 'training_library' && (
            <TrainingLibrary />
          )}

          {activeTab === 'sales_catalog' && (
            <SalesCatalog />
          )}

          {activeTab === 'my_commissions' && (
            <MyCommissions />
          )}

          {activeTab === 'admin_commissions' && (
            <AdminCommissionManager />
          )}

          {activeTab === 'configuration' && (
            <ConfigurationCenter />
          )}

          {activeTab === 'myProfile' && role === 'developer_designer' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold">My Profile</h2>
                  <p className="text-slate-500 text-sm">Update your public team member profile.</p>
                </div>
              </div>
              <DevOnboarding 
                portfolioItems={portfolioItems}
                existingProfile={myProfile}
                onSavePortfolio={handleSavePortfolioItem}
                onSaveProfile={handleSaveTeamMember}
              />
            </div>
          )}

          {activeTab === 'inbox' && ['admin', 'sales', 'sales_rep', 'sales_team'].includes(role || '') && (
            <SalesChatInbox />
          )}

          {/* TAB 0.1: HOMEPAGE SECTIONS */}
          {activeTab === 'homepageSections' && (
            <HomepageSectionsManager 
              content={content}
              updateSection={updateSection}
            />
          )}

          {/* TAB 2: HEADER */}
          {activeTab === 'header' && (
            <HeaderEditor 
              initialData={headerData} 
              themeData={content.theme || {}}
              customPages={customPagesList}
              portfolioItems={portfolioItems}
              portfolioCategories={portfolioCategories}
              services={content.services?.list || services}
              onSave={async (data, footerUpdates) => {
                await updateSection('header', data);
                if (footerUpdates) {
                  const currentFooter = content.footer || {};
                  await updateSection('footer', { ...currentFooter, ...footerUpdates });
                }
                showSaveNotification('Navigation & Footer menus updated in real-time!');
              }} 
              onSaveTheme={async (themeUpdates) => {
                await updateSection('theme', themeUpdates);
                showSaveNotification('Logo and theme changes applied in real-time!');
              }}
            />
          )}

          {/* TAB 3.5: SERVICE PACKAGES */}
          {activeTab === 'servicePackages' && (
            <ServicePackagesEditor 
              initialData={servicePackagesData} 
              onSave={async (data) => {
                await updateSection('servicePackages', data);
                showSaveNotification('Service packages section updated in real-time!');
              }} 
            />
          )}

          {/* TAB 7: FOOTER */}
          {activeTab === 'footer' && (
            <FooterEditor 
              initialData={footerData} 
              onSave={async (data) => {
                await updateSection('footer', data);
                showSaveNotification('Footer updated in real-time!');
              }} 
            />
          )}

          {/* TAB 8: AWARD SECTION */}
          {activeTab === 'awards' && (
            <AwardsManager />
          )}
      </main>
      </div>
    </div>
  );
}

/* ================= SUB-EDITORS ================= */

function HeroEditor({ initialData, onSave }: { initialData: any, onSave: (data: any) => Promise<void> }) {
  const [form, setForm] = useState(initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(form);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateLogo = (index: number, field: string, value: string) => {
    const newLogos = [...(form.trustedLogos || [])];
    newLogos[index] = { ...newLogos[index], [field]: value };
    setForm({ ...form, trustedLogos: newLogos });
  };

  const addLogo = () => {
    setForm({
      ...form,
      trustedLogos: [...(form.trustedLogos || []), { name: 'New Brand', image: '', type: 'image' }]
    });
  };

  const removeLogo = (index: number) => {
    setForm({
      ...form,
      trustedLogos: form.trustedLogos.filter((_: any, i: number) => i !== index)
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-slate-200 pb-6">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-xl ${form.enabled !== false ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {form.enabled !== false ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Hero Section Editor</h1>
            <p className="text-sm text-slate-500">Manage headline text, CTAs, and global brand logos used site-wide (Hero & Portfolio)</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setForm({ ...form, enabled: !form.enabled })}
            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
              form.enabled !== false ? 'bg-white text-slate-600 border-slate-200' : 'bg-[#000080] text-white border-transparent'
            }`}>
            {form.enabled !== false ? 'Disable Section' : 'Enable Section'}
          </button>
          <SaveButton 
            onSave={handleSave} 
            isSaving={isSaving} 
            showSaved={showSaved} 
            label="Save Hero"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Main Content</h3>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Eyebrow / Positioning Line</label>
              <input
                type="text"
                value={form.eyebrow || ''}
                onChange={(e) => setForm({ ...form, eyebrow: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#000080]"
                placeholder="Strategy / Experience / Engineering / Automation"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Heading Line 1</label>
              <input
                type="text"
                value={form.headingLine1 || ''}
                onChange={(e) => setForm({ ...form, headingLine1: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#000080]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Heading Line 2</label>
              <input
                type="text"
                value={form.headingLine2 || ''}
                onChange={(e) => setForm({ ...form, headingLine2: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#000080]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">CTA Button Text</label>
                <input
                  type="text"
                  value={form.buttonText || ''}
                  onChange={(e) => setForm({ ...form, buttonText: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#000080]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">CTA Button Link</label>
                <input
                  type="text"
                  value={form.buttonLink || ''}
                  onChange={(e) => setForm({ ...form, buttonLink: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#000080]"
                  placeholder="#contact"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Background Image</label>
              <ImageUploader
                value={form.bgImage || ''}
                onChange={(url) => setForm({ ...form, bgImage: url })}
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Trusted By Slider</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400">ENABLED</span>
                <button 
                  type="button"
                  onClick={() => setForm({ ...form, trustedByEnabled: form.trustedByEnabled === false ? true : false })}
                  className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${form.trustedByEnabled !== false ? 'bg-[#000080]' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${form.trustedByEnabled !== false ? 'right-1' : 'left-1'}`} />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Title</label>
              <input
                type="text"
                value={form.trustedByTitle || ''}
                onChange={(e) => setForm({ ...form, trustedByTitle: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#000080]"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">Brands / Logos</label>
                <button 
                  onClick={addLogo}
                  className="flex items-center gap-1.5 px-3 py-1 bg-[#000080] text-white rounded-lg hover:bg-[#000066] text-[10px] font-bold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> ADD BRAND
                </button>
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {(form.trustedLogos || []).map((logo: any, idx: number) => (
                  <div key={idx} className="group relative bg-slate-50 p-4 rounded-xl border border-slate-100 hover:border-slate-300 transition-all">
                    <button 
                      type="button"
                      onClick={() => removeLogo(idx)}
                      className="absolute top-2 right-2 p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                      title="Remove Brand"
                    >
                      <X className="w-3 h-3" />
                    </button>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-1">
                        <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-tight">Logo Type</label>
                        <select
                          value={logo.type || 'text'}
                          onChange={(e) => updateLogo(idx, 'type', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-[11px] font-bold focus:outline-none focus:border-[#000080]">
                          <option value="text">Typography</option>
                          <option value="image">Brand Image</option>
                          <option value="logo">Logo Box</option>
                        </select>
                      </div>
                      
                      <div className="col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-tight">Brand Name</label>
                        <input
                          type="text"
                          value={logo.name || logo.value || ''}
                          onChange={(e) => updateLogo(idx, 'name', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#000080]"
                          placeholder="e.g. Nike, Apple"
                        />
                      </div>
                    </div>

                    {logo.type === 'image' && (
                      <div className="mt-3">
                        <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-tight">Upload Logo</label>
                        <ImageUploader
                          value={logo.image || ''}
                          onChange={(url) => updateLogo(idx, 'image', url)}
                        />
                      </div>
                    )}

                    {logo.type !== 'image' && (
                      <div className="mt-3 grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-tight">Display Text</label>
                          <input
                            type="text"
                            value={logo.value || ''}
                            onChange={(e) => updateLogo(idx, 'value', e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#000080]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-tight">Font Style</label>
                          <select
                            value={logo.style || 'bold'}
                            onChange={(e) => updateLogo(idx, 'style', e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-[11px] focus:outline-none focus:border-[#000080]">
                            <option value="bold">Bold Sans</option>
                            <option value="black">Heavy Black</option>
                            <option value="italic">Elegant Italic</option>
                            <option value="serif">Classic Serif</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {(!form.trustedLogos || form.trustedLogos.length === 0) && (
                  <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-400">No logos added yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeaderEditor({ 
  initialData, 
  themeData = {}, 
  customPages = [], 
  portfolioItems = [],
  portfolioCategories = [],
  services = [],
  onSave,
  onSaveTheme
}: { 
  initialData: any, 
  themeData?: any, 
  customPages?: CustomPage[], 
  portfolioItems?: PortfolioItem[],
  portfolioCategories?: PortfolioCategory[],
  services?: Service[],
  onSave: (data: any, footerUpdates?: any) => Promise<void>,
  onSaveTheme?: (themeUpdates: any) => Promise<void>
}) {
  const [form, setForm] = useState(initialData);
  const [themeForm, setThemeForm] = useState(themeData);
  const [footerUpdates, setFooterUpdates] = useState<any>(null);

  const handleLogoChange = async (url: string) => {
    const updatedTheme = { ...themeForm, logoUrl: url };
    setThemeForm(updatedTheme);
    if (onSaveTheme) {
      await onSaveTheme(updatedTheme);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Navigation & Header Manager</h1>
          <p className="text-sm text-slate-500">Edit brand identity, active logo image, enterprise taglines, and menus</p>
        </div>
        <button 
          type="button"
          onClick={() => onSave(form, footerUpdates)}
          className="px-4 py-2 bg-[#000080] hover:bg-[#000066] text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer"
        >
          <Save className="w-4 h-4" /> Save Header Changes
        </button>
      </div>

      {/* Brand Identity Card with Upload Capability */}
      <div className="bg-white  border border-slate-200  rounded-2xl p-6 space-y-6 shadow-sm">
        <div className="border-b border-slate-100  pb-3">
          <h3 className="text-base font-bold">Logo & Brand Identity</h3>
          <p className="text-xs text-slate-500 mt-1">Upload a custom transparent PNG/SVG logo to override the default SVG monogram across the whole site</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Logo Upload Channel</label>
            <ImageUploader
              value={themeForm.logoUrl || ''}
              onChange={handleLogoChange}
              label="Custom Brand Logo"
              placeholder="Paste image URL or click/drag to upload logo..."
            />
          </div>

          <div className="bg-slate-50  border border-slate-200  rounded-xl p-5 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Active Logo Preview</h4>
              <p className="text-xs text-slate-500 mb-4">This logo is synchronized and appears in both the header and footer.</p>
            </div>
            <div className="bg-white/80  border border-slate-200  rounded-lg p-6 flex items-center justify-center min-h-[96px] backdrop-blur-sm">
              {themeForm.logoUrl ? (
                <div className="relative group/logo">
                  <img 
                    src={themeForm.logoUrl} 
                    alt="Custom Brand Logo" 
                    className="max-h-12 w-auto object-contain transition-all"
                  />
                  <button 
                    type="button"
                    onClick={() => handleLogoChange('')}
                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all cursor-pointer shadow-sm"
                    title="Remove Logo"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-[11px] font-bold text-[#000080] dark:text-blue-300 uppercase tracking-widest">PROFOX SVG Logo</div>
                  <div className="text-[9px] text-slate-500 mt-1">Default vector design is active</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Taglines & Section Settings */}
      <div className="bg-white  border border-slate-200  rounded-2xl p-6 space-y-5 shadow-sm">
        <div className="border-b border-slate-100  pb-3">
          <h3 className="text-base font-bold">Header Metadata & Taglines</h3>
          <p className="text-xs text-slate-500 mt-1">Configure company taglines displayed adjacent to the logo in the desktop navigation bar</p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tagline Line 1</label>
            <input
              type="text"
              value={form.taglineLine1 || ''}
              onChange={(e) => setForm({ ...form, taglineLine1: e.target.value })}
              className="w-full bg-slate-50  border border-slate-200  rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#000080] text-slate-800 "
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tagline Line 2</label>
            <input
              type="text"
              value={form.taglineLine2 || ''}
              onChange={(e) => setForm({ ...form, taglineLine2: e.target.value })}
              className="w-full bg-slate-50  border border-slate-200  rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#000080] text-slate-800 "
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Primary CTA Button Label</label>
            <input
              type="text"
              value={form.buttonText || ''}
              onChange={(e) => setForm({ ...form, buttonText: e.target.value })}
              className="w-full bg-slate-50  border border-slate-200  rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#000080] text-slate-800 "
            />
          </div>
        </div>
      </div>

      {/* Custom Menu Builder */}
      <CustomMenuManager
        navItems={form.navItems || []}
        customPages={customPages}
        portfolioItems={portfolioItems}
        portfolioCategories={portfolioCategories}
        services={services}
        onChange={(updatedNavItems, locations) => {
          setForm({ ...form, navItems: updatedNavItems });
          if (locations && locations.length> 0) {
            const fUpdates: any = {};
            if (locations.includes('footerCompany')) fUpdates.companyLinks = updatedNavItems;
            if (locations.includes('footerServices')) fUpdates.servicesLinks = updatedNavItems;
            if (locations.includes('footerLegal')) fUpdates.legalLinks = updatedNavItems;
            setFooterUpdates(fUpdates);
          }
        }}
      />
    </div>
  );
}

function ServicesEditor({ initialData, servicePages = [], onSave }: { initialData: any, servicePages?: CustomPage[], onSave: (data: any) => Promise<void> }) {
  const [form, setForm] = useState(initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(form);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateService = (index: number, field: string, value: any) => {
    const newList = [...(form.list || [])];
    newList[index] = { ...newList[index], [field]: value };
    setForm({ ...form, list: newList });
  };

  const addService = () => {
    setForm({
      ...form,
      list: [...(form.list || []), { title: 'New Service', description: 'Explore Now', icon: 'monitor', link: '#' }]
    });
  };

  const removeService = (index: number) => {
    setForm({
      ...form,
      list: form.list.filter((_: any, i: number) => i !== index)
    });
  };

  const iconOptions = [
    { value: 'monitor', label: 'Monitor', icon: Monitor },
    { value: 'grid', label: 'Grid', icon: Grid },
    { value: 'sparkles', label: 'Sparkles', icon: Sparkles },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-slate-200 pb-6">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-xl ${form.enabled !== false ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {form.enabled !== false ? <Layers className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Services Editor</h1>
            <p className="text-sm text-slate-500">Manage "How We Help" section cards and icons</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setForm({ ...form, enabled: !form.enabled })}
            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
              form.enabled !== false ? 'bg-white text-slate-600 border-slate-200' : 'bg-[#000080] text-white border-transparent'
            }`}>
            {form.enabled !== false ? 'Disable Section' : 'Enable Section'}
          </button>
          <SaveButton 
            onSave={handleSave} 
            isSaving={isSaving} 
            showSaved={showSaved} 
            label="Save Services"
          />
        </div>
      </div>

      <div className="space-y-8">
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-inner">
          <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Section Title</label>
          <input
            type="text"
            value={form.title || ''}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full bg-white border border-slate-200 rounded-xl px-5 py-4 text-lg focus:outline-none focus:border-[#000080] font-black text-slate-900"
            placeholder="e.g. How We Help"
          />
          <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mt-5 mb-3">Section Introduction</label>
          <textarea
            value={form.subtitle || ''}
            onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            className="w-full bg-white border border-slate-200 rounded-xl px-5 py-4 text-sm leading-6 focus:outline-none focus:border-[#000080] text-slate-700 resize-none"
            rows={3}
            placeholder="Explain how these services work together for the client."
          />
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#000080]" />
              Service Cards
            </h3>
            <button 
              onClick={addService}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-900 rounded-xl text-xs font-bold hover:bg-slate-50 flex items-center gap-2 shadow-sm transition-all"
>
              <Plus className="w-4 h-4" /> Add Service
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {(form.list || []).map((service: any, idx: number) => (
              <div key={idx} className="bg-white border border-slate-200 rounded-[2rem] p-8 relative group shadow-sm hover:shadow-xl transition-all border-l-4 border-l-[#000080]">
                <button 
                  type="button"
                  onClick={() => removeService(idx)}
                  className="absolute top-6 right-6 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                  title="Delete Service"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <div className="space-y-6">
                  {/* Image and Icon Selection Row */}
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="space-y-3">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Icon</label>
                      <div className="flex flex-wrap gap-2">
                        {iconOptions.map((opt) => (
                          <button key={opt.value}
                            onClick={() => updateService(idx, 'icon', opt.value)}
                            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                              service.icon === opt.value 
                                ? 'bg-[#000080] text-white shadow-lg scale-110' 
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                         >
                            <opt.icon className="w-5 h-5" />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1 space-y-3">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Card Image</label>
                      <ImageUploader 
                        value={service.image || ''}
                        onChange={(url) => updateService(idx, 'image', url)}
                        label="Upload Image"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Card Headline (Main Title)</label>
                      <textarea
                        value={service.title}
                        onChange={(e) => updateService(idx, 'title', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-[#000080] focus:bg-white transition-all resize-none"
                        rows={2}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Sub-headline (Detailed Description)</label>
                      <textarea
                        value={service.subtitle || ''}
                        onChange={(e) => updateService(idx, 'subtitle', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#000080] focus:bg-white transition-all resize-none"
                        placeholder="Add more details about this service..."
                        rows={3}
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Button Text</label>
                      <input
                        type="text"
                        value={service.description}
                        onChange={(e) => updateService(idx, 'description', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#000080] focus:bg-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Related Service Page</label>
                      <input
                        type="text"
                        value={service.link || ''}
                        onChange={(e) => updateService(idx, 'link', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#000080] focus:bg-white"
                        placeholder="/services/service-page"
                        list={`service-page-links-${idx}`}
                      />
                      <datalist id={`service-page-links-${idx}`}>
                        {servicePages.map((page) => <option key={page.id} value={getPagePath(page)}>{page.title}</option>)}
                      </datalist>
                      <p className="text-[10px] leading-4 text-slate-400">Select a published service page. The complete card and its button use this destination.</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ServicePackagesEditor({ initialData, onSave }: { initialData: any, onSave: (data: any) => Promise<void> }) {
  const { confirm: confirmAction } = useConfirmContext();
  const [form, setForm] = useState(initialData);

  const updatePackage = (index: number, field: string, val: any) => {
    const newList = [...(form.list || [])];
    newList[index] = { ...newList[index], [field]: val };
    setForm({ ...form, list: newList });
  };

  const handleAddPackage = () => {
    const newList = [...(form.list || [])];
    const newPkg = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
      title: 'New Service Package',
      price: '$999',
      period: 'one-time',
      description: 'A brief description of this customizable service package.',
      features: ['Feature 1', 'Feature 2', 'Feature 3'],
      deliveryTime: '7 Days',
      popular: false,
      badge: 'New Plan',
      ctaText: 'Get Started',
      ctaLink: '#contact'
    };
    setForm({ ...form, list: [...newList, newPkg] });
  };

  const handleDeletePackage = async (index: number) => {
    if (await confirmAction('Delete Package', 'Are you sure you want to delete this service package?')) {
      const newList = [...(form.list || [])];
      newList.splice(index, 1);
      setForm({ ...form, list: newList });
    }
  };

  const movePackage = (index: number, direction: 'up' | 'down') => {
    const newList = [...(form.list || [])];
    if (direction === 'up' && index> 0) {
      const temp = newList[index];
      newList[index] = newList[index - 1];
      newList[index - 1] = temp;
    } else if (direction === 'down' && index < newList.length - 1) {
      const temp = newList[index];
      newList[index] = newList[index + 1];
      newList[index + 1] = temp;
    }
    setForm({ ...form, list: newList });
  };

  const handleAddFeature = (pkgIndex: number) => {
    const newList = [...(form.list || [])];
    const pkg = { ...newList[pkgIndex] };
    pkg.features = [...(pkg.features || []), 'New Feature Bullet'];
    newList[pkgIndex] = pkg;
    setForm({ ...form, list: newList });
  };

  const handleUpdateFeature = (pkgIndex: number, featIndex: number, val: string) => {
    const newList = [...(form.list || [])];
    const pkg = { ...newList[pkgIndex] };
    const newFeatures = [...(pkg.features || [])];
    newFeatures[featIndex] = val;
    pkg.features = newFeatures;
    newList[pkgIndex] = pkg;
    setForm({ ...form, list: newList });
  };

  const handleDeleteFeature = (pkgIndex: number, featIndex: number) => {
    const newList = [...(form.list || [])];
    const pkg = { ...newList[pkgIndex] };
    const newFeatures = [...(pkg.features || [])];
    newFeatures.splice(featIndex, 1);
    pkg.features = newFeatures;
    newList[pkgIndex] = pkg;
    setForm({ ...form, list: newList });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-xl ${form.enabled === true ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {form.enabled === true ? <Sparkles className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Service Packages Manager</h1>
            <p className="text-sm text-slate-500">Configure customizable website services, pricing tiers, features, and delivery parameters</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setForm({ ...form, enabled: !form.enabled })}
            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
              form.enabled === true ? 'bg-white text-slate-600 border-slate-200' : 'bg-[#000080] text-white border-transparent'
            }`}>
            {form.enabled === true ? 'Disable Section' : 'Enable Section'}
          </button>
          <button 
            onClick={() => onSave(form)}
            className="px-4 py-2 bg-[#000080] hover:bg-[#000066] text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer"
          >
            <Save className="w-4 h-4" /> Save Packages
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <h3 className="text-lg font-semibold text-slate-900">Section Settings</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Section Header Title</label>
            <input
              type="text"
              value={form.title || ''}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-slate-900 focus:outline-none focus:border-[#000080]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Section Subtitle / Description</label>
            <input
              type="text"
              value={form.subtitle || ''}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-slate-900 focus:outline-none focus:border-[#000080]"
            />
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Service Packages ({form.list?.length || 0})</h3>
          <button 
            onClick={handleAddPackage}
            className="px-4 py-2 bg-[#000080] hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md border-none cursor-pointer"
>
            <Plus className="w-4 h-4" /> Add Package
          </button>
        </div>

        <div className="grid gap-6">
          {form.list?.map((pkg: any, idx: number) => (
            <div key={pkg.id || idx} className={`bg-white border rounded-2xl p-6 space-y-6 transition-all ${
              pkg.popular ? 'border-[#000080]/60 ring-2 ring-[#000080]/10' : 'border-slate-200'
            }`}>
              {/* Card Header Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center font-bold text-xs text-[#000080]">
                    {idx + 1}
                  </span>
                  <h4 className="text-base font-bold text-slate-900">{pkg.title || 'Untitled Plan'}</h4>
                  {pkg.popular && (
                    <span className="px-2.5 py-0.5 bg-[#000080]/10 text-[#000080] border border-[#000080]/20 rounded text-[10px] font-bold uppercase tracking-wider">
                      Featured / Popular
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => movePackage(idx, 'up')}
                    disabled={idx === 0}
                    className="p-1.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-30 text-slate-500 hover:text-slate-900 rounded-lg transition-colors border border-slate-200 cursor-pointer"
                    title="Move Up">
                    <ArrowLeft className="w-3.5 h-3.5 rotate-90" />
                  </button>
                  <button onClick={() => movePackage(idx, 'down')}
                    disabled={idx === (form.list?.length - 1)}
                    className="p-1.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-30 text-slate-500 hover:text-slate-900 rounded-lg transition-colors border border-slate-200 cursor-pointer"
                    title="Move Down">
                    <ArrowLeft className="w-3.5 h-3.5 -rotate-90" />
                  </button>
                  <button 
                    type="button"
                    onClick={() => handleDeletePackage(idx)}
                    className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors border border-red-100 cursor-pointer"
                    title="Delete Package"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Grid Fields */}
              <div className="grid md:grid-cols-3 gap-5">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Package Title</label>
                  <input
                    type="text"
                    value={pkg.title || ''}
                    onChange={(e) => updatePackage(idx, 'title', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Price display</label>
                  <input
                    type="text"
                    placeholder="e.g. $1,499, Custom"
                    value={pkg.price || ''}
                    onChange={(e) => updatePackage(idx, 'price', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Billing period / unit</label>
                  <input
                    type="text"
                    placeholder="e.g. one-time, monthly"
                    value={pkg.period || ''}
                    onChange={(e) => updatePackage(idx, 'period', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Badge text (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Most Popular, Custom"
                    value={pkg.badge || ''}
                    onChange={(e) => updatePackage(idx, 'badge', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Delivery timeline</label>
                  <input
                    type="text"
                    placeholder="e.g. 7-14 Days"
                    value={pkg.deliveryTime || ''}
                    onChange={(e) => updatePackage(idx, 'deliveryTime', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
                  />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <input
                    type="checkbox"
                    id={`popular-${idx}`}
                    checked={pkg.popular || false}
                    onChange={(e) => updatePackage(idx, 'popular', e.target.checked)}
                    className="w-4 h-4 text-[#000080] border-slate-200 bg-slate-50 rounded focus:ring-[#000080] focus:ring-offset-slate-900 cursor-pointer"
                  />
                  <label htmlFor={`popular-${idx}`} className="text-sm font-semibold text-slate-700 cursor-pointer">
                    Highlight as Most Popular
                  </label>
                </div>
                <div className="md:col-span-3 space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Short description</label>
                  <textarea
                    rows={2}
                    value={pkg.description || ''}
                    onChange={(e) => updatePackage(idx, 'description', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080] resize-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">CTA Button Label</label>
                  <input
                    type="text"
                    value={pkg.ctaText || 'Get Started'}
                    onChange={(e) => updatePackage(idx, 'ctaText', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
                  />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">CTA Button Link</label>
                  <input
                    type="text"
                    value={pkg.ctaLink || '#contact'}
                    onChange={(e) => updatePackage(idx, 'ctaLink', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
                  />
                </div>
              </div>

              {/* Dynamic Feature List Bullet Editor */}
              <div className="space-y-3 bg-slate-50/40 p-4 rounded-xl border border-slate-200/80">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Included Features Bullets</label>
                  <button 
                    type="button"
                    onClick={() => handleAddFeature(idx)}
                    className="px-2.5 py-1 bg-[#000080] hover:bg-[#000066] text-white rounded text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Bullet
                  </button>
                </div>

                <div className="space-y-2">
                  {pkg.features?.map((feat: string, fIdx: number) => (
                    <div key={fIdx} className="flex items-center gap-2 animate-in fade-in duration-100">
                      <span className="text-xs text-slate-500 font-mono w-5">#{fIdx + 1}</span>
                      <input
                        type="text"
                        value={feat}
                        onChange={(e) => handleUpdateFeature(idx, fIdx, e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#000080]"
                        placeholder="Feature description"
                      />
                      <button type="button"
                        onClick={() => handleDeleteFeature(idx, fIdx)}
                        className="p-1.5 bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-200 rounded-lg transition-colors border border-red-900/20 cursor-pointer"
                        title="Delete Feature">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {(!pkg.features || pkg.features.length === 0) && (
                    <p className="text-xs text-slate-500 italic py-2">No features defined. Click "Add Bullet" to include core items.</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CaseStudiesEditor({ initialData, onSave }: { initialData: any, onSave: (data: any) => Promise<void> }) {
  const [form, setForm] = useState(initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(form);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-slate-200 pb-6">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-xl ${form.enabled !== false ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {form.enabled !== false ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Case Studies Section</h1>
            <p className="text-sm text-slate-500">Manage the success stories and transformation titles</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setForm({ ...form, enabled: !form.enabled })}
            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
              form.enabled !== false ? 'bg-white text-slate-600 border-slate-200' : 'bg-[#000080] text-white border-transparent'
            }`}>
            {form.enabled !== false ? 'Disable Section' : 'Enable Section'}
          </button>
          <SaveButton 
            onSave={handleSave} 
            isSaving={isSaving} 
            showSaved={showSaved} 
            label="Save Case Studies"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Primary Heading (Marquee Style)</h3>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Line 1</label>
            <input
              type="text"
              value={form.titleLine1 || ''}
              onChange={(e) => setForm({ ...form, titleLine1: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Line 2</label>
            <input
              type="text"
              value={form.titleLine2 || ''}
              onChange={(e) => setForm({ ...form, titleLine2: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm"
            />
          </div>
        </div>

        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Secondary Success Title</h3>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Main Title</label>
            <input
              type="text"
              value={form.recentTitle || ''}
              onChange={(e) => setForm({ ...form, recentTitle: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Highlighted Word</label>
            <input
              type="text"
              value={form.recentTitleHighlight || ''}
              onChange={(e) => setForm({ ...form, recentTitleHighlight: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 flex items-start gap-4">
        <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
          <Info className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-900">Portfolio Data is Managed Separately</h4>
          <p className="text-xs text-slate-600 mt-1">The actual case study cards are pulled directly from your Portfolio database. To add, edit, or remove specific projects, use the <strong>Portfolio Manager</strong> tab in the main sidebar.</p>
        </div>
      </div>
    </div>
  );
}

function InsightsEditor({ initialData, onSave }: { initialData: any, onSave: (data: any) => Promise<void> }) {
  const [form, setForm] = useState(initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(form);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-slate-200 pb-6">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-xl ${form.enabled !== false ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {form.enabled !== false ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Insights Editor</h1>
            <p className="text-sm text-slate-500">Manage the home page blog/insights section</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setForm({ ...form, enabled: !form.enabled })}
            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
              form.enabled !== false ? 'bg-white text-slate-600 border-slate-200' : 'bg-[#000080] text-white border-transparent'
            }`}>
            {form.enabled !== false ? 'Disable Section' : 'Enable Section'}
          </button>
          <SaveButton 
            onSave={handleSave} 
            isSaving={isSaving} 
            showSaved={showSaved} 
            label="Save Settings"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-8 shadow-sm">
        <div className="space-y-4">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Section Headline</label>
          <input
            type="text"
            value={form.title || ''}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Expert Insights"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-slate-900 focus:outline-none focus:border-[#000080] font-bold text-lg shadow-inner"
          />
        </div>

        <div className="p-6 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-4">
          <div className="p-2.5 bg-white text-[#000080] rounded-xl shadow-sm border border-blue-100">
            <FileText className="w-5 h-5" />
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-[#000080]">Dynamic Blog Content</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              The Insights section automatically displays your **3 latest published articles**. 
              To manage posts, navigate to the <strong>Blog Management</strong> tab.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FAQEditor({ initialData, onSave }: { initialData: any, onSave: (data: any) => Promise<void> }) {
  const [form, setForm] = useState(initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(form);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
    } catch (error) {
      console.error('Error saving FAQ:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateFAQ = (index: number, field: string, value: string) => {
    const newItems = [...(form.items || [])];
    newItems[index] = { ...newItems[index], [field]: value };
    setForm({ ...form, items: newItems });
  };

  const addFAQ = () => {
    setForm({
      ...form,
      items: [...(form.items || []), { id: Date.now().toString(), title: 'New Question', description: 'Answer text here...' }]
    });
  };

  const removeFAQ = (index: number) => {
    setForm({
      ...form,
      items: (form.items || []).filter((_: any, i: number) => i !== index)
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-slate-200 pb-6">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-xl ${form.enabled !== false ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {form.enabled !== false ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">FAQ Manager</h1>
            <p className="text-sm text-slate-500">Manage frequently asked questions on the homepage</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setForm({ ...form, enabled: !form.enabled })}
            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
              form.enabled !== false ? 'bg-white text-slate-600 border-slate-200' : 'bg-[#000080] text-white border-transparent'
            }`}>
            {form.enabled !== false ? 'Disable Section' : 'Enable Section'}
          </button>
          <SaveButton 
            onSave={handleSave} 
            isSaving={isSaving} 
            showSaved={showSaved} 
            label="Save FAQ"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-8 space-y-6 shadow-sm">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Section Badge</label>
            <input
              type="text"
              value={form.badge || ''}
              onChange={(e) => setForm({ ...form, badge: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#000080]"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Section Title</label>
            <input
              type="text"
              value={form.title || ''}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#000080]"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Section Subtitle</label>
          <textarea
            value={form.subtitle || ''}
            onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#000080]"
            rows={2}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Questions & Answers</h3>
          <button 
            onClick={addFAQ}
            className="px-4 py-2 bg-[#000080] text-white rounded-xl text-xs font-bold hover:bg-[#000066] transition-all flex items-center gap-2 border-none cursor-pointer"
>
            <Plus className="w-4 h-4" /> Add FAQ Item
          </button>
        </div>

        <div className="grid gap-4">
          {(form.items || []).map((item: any, idx: number) => (
            <div key={item.id || idx} className="bg-white border border-slate-200 rounded-2xl p-6 relative group shadow-sm">
              <button 
                type="button"
                onClick={() => removeFAQ(idx)}
                className="absolute top-6 right-6 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                title="Delete FAQ Item"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Question</label>
                  <input
                    type="text"
                    value={item.title || ''}
                    onChange={(e) => updateFAQ(idx, 'title', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-[#000080] focus:bg-white transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Answer</label>
                  <textarea
                    value={item.description || ''}
                    onChange={(e) => updateFAQ(idx, 'description', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#000080] focus:bg-white transition-all resize-none"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CTAEditor({ initialData, onSave }: { initialData: any, onSave: (data: any) => Promise<void> }) {
  const [form, setForm] = useState(initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(form);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-slate-200 pb-6">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-xl ${form.enabled !== false ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {form.enabled !== false ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">CTA Editor</h1>
            <p className="text-sm text-slate-500">Manage the bottom "Call to Action" banner</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setForm({ ...form, enabled: !form.enabled })}
            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
              form.enabled !== false ? 'bg-white text-slate-600 border-slate-200' : 'bg-[#000080] text-white border-transparent'
            }`}>
            {form.enabled !== false ? 'Disable Banner' : 'Enable Banner'}
          </button>
          <SaveButton 
            onSave={handleSave} 
            isSaving={isSaving} 
            showSaved={showSaved} 
            label="Save CTA"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-8 space-y-6 shadow-sm">
        <div className="grid gap-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Heading</label>
            <input
              type="text"
              value={form.heading || ''}
              onChange={(e) => setForm({ ...form, heading: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#000080]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Description Line 1</label>
            <textarea
              value={form.paragraph1 || ''}
              onChange={(e) => setForm({ ...form, paragraph1: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#000080]"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Description Line 2 (Optional)</label>
            <textarea
              value={form.paragraph2 || ''}
              onChange={(e) => setForm({ ...form, paragraph2: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#000080]"
              rows={2}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Button Text</label>
              <input
                type="text"
                value={form.buttonText || ''}
                onChange={(e) => setForm({ ...form, buttonText: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Button Link</label>
              <input
                type="text"
                value={form.buttonLink || ''}
                onChange={(e) => setForm({ ...form, buttonLink: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingScreenEditor({ initialData, onSave }: { initialData: any, onSave: (data: any) => Promise<void> }) {
  const defaults = {
    enabled: true,
    replayEveryVisit: false,
    logo: '/branding/profox-loader-logo.png',
    taglineLine1: 'Where Design & Technology',
    taglineLine2: 'Meet Business Impact',
    backgroundColor: '#f8f8fb',
    textColor: '#111827',
    accentColor: '#000080',
    separatorColor: '#b6bac5',
    duration: 1800,
    logoWidth: 190,
  };
  const [form, setForm] = useState({ ...defaults, ...initialData });
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(form);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const replayPreview = () => {
    sessionStorage.removeItem('profox-home-intro-seen');
    window.location.assign('/');
  };

  const colorControl = (label: string, field: string) => (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{label}</label>
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
        <input type="color" value={form[field] || '#000000'} onChange={(e) => setForm({ ...form, [field]: e.target.value })} className="h-9 w-12 cursor-pointer rounded border-0 bg-transparent" />
        <input type="text" value={form[field] || ''} onChange={(e) => setForm({ ...form, [field]: e.target.value })} className="min-w-0 flex-1 bg-transparent text-xs font-mono uppercase outline-none" />
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className={`rounded-xl p-2 ${form.enabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}><Loader2 className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Loading Screen</h1>
            <p className="text-sm text-slate-500">Control the homepage opening brand animation.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={replayPreview} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Preview Animation</button>
          <SaveButton onSave={handleSave} isSaving={isSaving} showSaved={showSaved} label="Save Loader" />
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <button onClick={() => setForm({ ...form, enabled: !form.enabled })} className={`rounded-2xl border p-5 text-left transition-all ${form.enabled ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
              <span className="block text-xs font-black uppercase tracking-widest text-slate-900">Loader Enabled</span>
              <span className="mt-2 block text-xs text-slate-500">{form.enabled ? 'Displayed on the homepage' : 'Homepage opens immediately'}</span>
            </button>
            <button onClick={() => setForm({ ...form, replayEveryVisit: !form.replayEveryVisit })} className={`rounded-2xl border p-5 text-left transition-all ${form.replayEveryVisit ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
              <span className="block text-xs font-black uppercase tracking-widest text-slate-900">Replay Every Visit</span>
              <span className="mt-2 block text-xs text-slate-500">{form.replayEveryVisit ? 'Plays whenever Home opens' : 'Plays once per browser session'}</span>
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Brand Logo</label>
              <ImageUploader value={form.logo || ''} onChange={(url) => setForm({ ...form, logo: url })} label="Choose Loader Logo" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Tagline Line 1</label>
              <input value={form.taglineLine1 || ''} onChange={(e) => setForm({ ...form, taglineLine1: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#000080]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Tagline Line 2</label>
              <input value={form.taglineLine2 || ''} onChange={(e) => setForm({ ...form, taglineLine2: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#000080]" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {colorControl('Background', 'backgroundColor')}
            {colorControl('Tagline Text', 'textColor')}
            {colorControl('Accent', 'accentColor')}
            {colorControl('Center Separator', 'separatorColor')}
          </div>

          <div className="grid gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Animation Duration</label>
              <input type="range" min="900" max="4000" step="100" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} className="w-full accent-[#000080]" />
              <span className="mt-2 block text-xs font-bold text-slate-700">{(Number(form.duration) / 1000).toFixed(1)} seconds</span>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Logo Width</label>
              <input type="range" min="110" max="320" step="5" value={form.logoWidth} onChange={(e) => setForm({ ...form, logoWidth: Number(e.target.value) })} className="w-full accent-[#000080]" />
              <span className="mt-2 block text-xs font-bold text-slate-700">{form.logoWidth}px</span>
            </div>
          </div>
        </div>

        <div className="xl:sticky xl:top-6 xl:self-start">
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Live Composition Preview</p>
          <div className="relative grid min-h-[440px] place-items-center overflow-hidden rounded-[2rem] border border-slate-200 shadow-inner" style={{ backgroundColor: form.backgroundColor, color: form.textColor }}>
            <div className="absolute h-80 w-80 rounded-full opacity-[0.08] blur-3xl" style={{ backgroundColor: form.accentColor }} />
            <div className="relative flex items-center px-5">
              <div className="pr-5 md:pr-7"><img src={form.logo} alt="Loader preview" className="h-auto object-contain" style={{ width: Math.min(Number(form.logoWidth), 240) }} /></div>
              <span className="h-10 w-px" style={{ backgroundColor: form.separatorColor }} />
              <p className="pl-5 text-sm font-semibold leading-snug md:pl-7 md:text-base"><span className="block">{form.taglineLine1}</span><span className="block">{form.taglineLine2}</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HomepageSectionsManager({ 
  content, 
  updateSection 
}: { 
  content: any, 
  updateSection: (section: string, data: any) => Promise<void> 
}) {
  const [activeSubTab, setActiveSubTab] = useState<'loader' | 'hero' | 'services' | 'caseStudies' | 'insights' | 'growth' | 'cta' | 'faq' | 'feedback'>('hero');

  const heroData = content.hero || {};
  const servicesData = {
    title: content.services?.title || 'How We Help',
    subtitle: content.services?.subtitle || '',
    list: content.services?.list || services,
    enabled: content.services?.enabled !== false
  };
  const caseStudiesData = content.caseStudies || {};
  const insightsData = content.insights || {};
  const growthData = content.growth || {};
  const ctaData = content.cta || {};
  const loadingScreenData = content.loadingScreen || {};

  const subTabs = [
    { id: 'loader', label: 'Loading Screen', icon: Loader2 },
    { id: 'hero', label: 'Hero & Trusted', icon: Home },
    { id: 'services', label: 'How We Help', icon: Layers },
    { id: 'caseStudies', label: 'Case Studies', icon: Briefcase },
    { id: 'insights', label: 'Expert Insights', icon: FileText },
    { id: 'growth', label: 'Awards & Growth', icon: Sparkles },
    { id: 'faq', label: 'FAQ Section', icon: HelpCircle },
    { id: 'feedback', label: 'Testimonials', icon: MessageSquare },
    { id: 'cta', label: 'CTA Banner', icon: MessageSquare },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Homepage Manager</h1>
        <p className="text-slate-500">Configure all sections of your home page in one centralized dashboard.</p>
      </div>

      <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl border border-slate-200 overflow-x-auto no-scrollbar">
        {subTabs.map((tab) => (
          <button key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeSubTab === tab.id
                ? 'bg-white text-[#000080] shadow-md border border-slate-200'
                : 'text-slate-500 hover:text-slate-900'
            }`}
         >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm">
        {activeSubTab === 'loader' && (
          <LoadingScreenEditor
            initialData={loadingScreenData}
            onSave={async (data) => updateSection('loadingScreen', data)}
          />
        )}
        {activeSubTab === 'hero' && (
          <HeroEditor 
            initialData={heroData} 
            onSave={async (data) => {
              await updateSection('hero', data);
            }} 
          />
        )}
        {activeSubTab === 'services' && (
          <ServicesEditor 
            initialData={servicesData} 
            servicePages={(content.customPages || []).filter((page: CustomPage) => page.status === 'published' && isServicePage(page))}
            onSave={async (data) => {
              await updateSection('services', data);
            }} 
          />
        )}
        {activeSubTab === 'caseStudies' && (
          <CaseStudiesEditor 
            initialData={caseStudiesData} 
            onSave={async (data) => {
              await updateSection('caseStudies', data);
            }} 
          />
        )}
        {activeSubTab === 'insights' && (
          <InsightsEditor 
            initialData={insightsData} 
            onSave={async (data) => {
              await updateSection('insights', data);
            }} 
          />
        )}
        {activeSubTab === 'growth' && (
          <GrowthEditor 
            initialData={growthData} 
            onSave={async (data) => {
              await updateSection('growth', data);
            }} 
          />
        )}
        {activeSubTab === 'faq' && (
          <FAQEditor 
            initialData={content.faq_section || {}} 
            onSave={async (data) => {
              await updateSection('faq_section', data);
            }} 
          />
        )}
        {activeSubTab === 'feedback' && (
          <FeedbackManager />
        )}
        {activeSubTab === 'cta' && (
          <CTAEditor 
            initialData={ctaData} 
            onSave={async (data) => {
              await updateSection('cta', data);
            }} 
          />
        )}
      </div>
    </div>
  );
}

function GrowthEditor({ initialData, onSave }: { initialData: any, onSave: (data: any) => Promise<void> }) {
  const [form, setForm] = useState(initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(form);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateAward = (index: number, field: string, value: any) => {
    const newAwards = [...(form.awards || [])];
    newAwards[index] = { ...newAwards[index], [field]: value };
    setForm({ ...form, awards: newAwards });
  };

  const addAward = () => {
    setForm({
      ...form,
      awards: [...(form.awards || []), { name: 'New Award', subtext: 'Subtitle', type: 'TEXT' }]
    });
  };

  const removeAward = (index: number) => {
    setForm({
      ...form,
      awards: form.awards.filter((_: any, i: number) => i !== index)
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-xl ${form.enabled !== false ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {form.enabled !== false ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Awards & Growth Section</h2>
            <p className="text-sm text-slate-500">Manage the recognition logos and impact statement</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setForm({ ...form, enabled: !form.enabled })}
            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
              form.enabled !== false ? 'bg-white text-slate-600 border-slate-200' : 'bg-[#000080] text-white border-transparent'
            }`}>
            {form.enabled !== false ? 'Disable Section' : 'Enable Section'}
          </button>
          <SaveButton 
            onSave={handleSave} 
            isSaving={isSaving} 
            showSaved={showSaved} 
            label="Save Growth"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Headline Statement</label>
            <textarea
              value={form.headline || ''}
              onChange={(e) => setForm({ ...form, headline: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl p-4 text-sm focus:outline-none focus:border-[#000080] font-medium leading-relaxed"
              rows={4}
            />
          </div>

          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Awards List Title</label>
            <input
              type="text"
              value={form.awardsTitle || ''}
              onChange={(e) => setForm({ ...form, awardsTitle: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl p-4 text-sm focus:outline-none focus:border-[#000080] font-bold"
            />
          </div>

          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Background Image</label>
            <ImageUploader
              value={form.bgImage || ''}
              onChange={(url) => setForm({ ...form, bgImage: url })}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Manage Awards</h3>
            <button 
              onClick={addAward}
              className="p-2 bg-[#000080] text-white rounded-lg hover:bg-[#000066] transition-colors"
>
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {form.awards?.map((award: any, idx: number) => (
              <div key={idx} className="p-4 bg-white border border-slate-200 rounded-xl space-y-3 relative group">
                <button 
                  type="button"
                  onClick={() => removeAward(idx)}
                  className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                  title="Remove Award"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">NAME / BRAND</label>
                    <input
                      type="text"
                      value={award.name}
                      onChange={(e) => updateAward(idx, 'name', e.target.value)}
                      className="w-full border border-slate-100 rounded-lg p-2 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">SUBTEXT</label>
                    <input
                      type="text"
                      value={award.subtext}
                      onChange={(e) => updateAward(idx, 'subtext', e.target.value)}
                      className="w-full border border-slate-100 rounded-lg p-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">STYLE TYPE</label>
                    <select
                      value={award.type}
                      onChange={(e) => updateAward(idx, 'type', e.target.value)}
                      className="w-full border border-slate-100 rounded-lg p-2 text-xs font-bold">
                      <option value="CLUTCH">Clutch Badge</option>
                      <option value="TEXT">Large Italic Text</option>
                      <option value="BORDERED">Bordered Tag</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FooterEditor({ initialData, onSave }: { initialData: any, onSave: (data: any) => Promise<void> }) {
  const footerDefaults = {
    description: 'ProFox designs websites, develops custom applications, and builds business automation systems that help companies attract customers, simplify operations, and measure growth.',
    copyright: `© ${new Date().getFullYear()} ProFox Web Designer. All rights reserved.`,
    logoSize: 58,
    servicesHeading: 'Core Services', companyHeading: 'Company', legalHeading: 'Legal', contactHeading: 'Registered Business Contact',
    ctaText: 'Start a Conversation', registrationText: 'ProFox Digital Solution · Udyam: UDYAM-HP-09-0022689',
    servicesLinks: [
      { label: 'Website Design & Development', href: '/services/website-design-and-development' },
      { label: 'Web & Mobile Application Development', href: '/services/web-and-mobile-application-development' },
      { label: 'Email Marketing & Business Automation', href: '/services/email-marketing-and-business-automation' }
    ],
    companyLinks: [
      { label: 'About ProFox', href: '/about-us' }, { label: 'Our Work', href: '/portfolio' }, { label: 'Insights', href: '/blog' },
      { label: 'Careers', href: '/careers' }, { label: 'Contact Us', href: '/contact-us' }
    ],
    legalLinks: [
      { label: 'Privacy Policy', href: '/privacy-policy' }, { label: 'Terms & Conditions', href: '/terms-and-conditions' }, { label: 'Cookie Policy', href: '/cookie-policy' }
    ],
    socialLinks: { linkedin: '', facebook: '', instagram: '', twitter: '', youtube: '' }
  };
  const normalizeInitial = (value: any) => ({
    ...footerDefaults,
    ...(value || {}),
    servicesLinks: Array.isArray(value?.servicesLinks) && value.servicesLinks.every((item: any) => typeof item === 'object') ? value.servicesLinks : footerDefaults.servicesLinks,
    companyLinks: Array.isArray(value?.companyLinks) && value.companyLinks.every((item: any) => typeof item === 'object') ? value.companyLinks : footerDefaults.companyLinks,
    legalLinks: Array.isArray(value?.legalLinks) && value.legalLinks.every((item: any) => typeof item === 'object') ? value.legalLinks : footerDefaults.legalLinks,
    socialLinks: { ...footerDefaults.socialLinks, ...(value?.socialLinks || {}) }
  });
  const [form, setForm] = useState(() => normalizeInitial(initialData));
  useEffect(() => setForm(normalizeInitial(initialData)), [initialData]);
  const inputClass = 'w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-slate-900 focus:outline-none focus:border-[#000080]';
  const updateLinks = (key: 'servicesLinks' | 'companyLinks' | 'legalLinks', index: number, field: 'label' | 'href', value: string) => setForm((current: any) => ({ ...current, [key]: current[key].map((item: any, itemIndex: number) => itemIndex === index ? { ...item, [field]: value } : item) }));
  const renderLinkEditor = (title: string, key: 'servicesLinks' | 'companyLinks' | 'legalLinks') => (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">Only add real internal routes or complete external URLs. Empty and # links are not shown.</p></div><button type="button" onClick={() => setForm((current: any) => ({ ...current, [key]: [...current[key], { label: 'New Link', href: '/' }] }))} className="inline-flex items-center gap-2 rounded-lg bg-[#000080]/10 px-3 py-2 text-xs font-bold text-[#000080]"><Plus className="h-4 w-4" /> Add</button></div>
      <div className="space-y-3">{form[key].map((item: any, index: number) => <div key={index} className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[1fr_1.35fr_auto]"><input value={item.label || ''} onChange={event => updateLinks(key, index, 'label', event.target.value)} placeholder="Link label" className={inputClass} /><input value={item.href || ''} onChange={event => updateLinks(key, index, 'href', event.target.value)} placeholder="/real-page-url" className={`${inputClass} font-mono text-xs`} /><button type="button" onClick={() => setForm((current: any) => ({ ...current, [key]: current[key].filter((_: any, itemIndex: number) => itemIndex !== index) }))} className="grid h-11 w-11 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label="Remove link"><Trash2 className="h-4 w-4" /></button></div>)}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Footer Settings</h1>
          <p className="text-sm text-slate-500">Control footer branding, verified links, social profiles, and conversion content</p>
        </div>
        <button 
          type="button"
          onClick={() => onSave(form)}
          className="px-4 py-2 bg-[#000080] hover:bg-[#000066] text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer"
        >
          <Save className="w-4 h-4" /> Save Footer
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Company Description</label>
          <textarea
            value={form.description || ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-slate-900 focus:outline-none focus:border-[#000080]"
            rows={3}
          />
        </div>

        <div className="grid gap-5 md:grid-cols-2"><div><label className="block text-sm font-medium text-slate-700 mb-2">Copyright Line</label><input value={form.copyright || ''} onChange={e => setForm({ ...form, copyright: e.target.value })} className={inputClass} /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">Registration / Business Identity Line</label><input value={form.registrationText || ''} onChange={e => setForm({ ...form, registrationText: e.target.value })} className={inputClass} /></div></div>
        <div className="grid gap-5 md:grid-cols-2"><div><label className="block text-sm font-medium text-slate-700 mb-2">Contact CTA Label</label><input value={form.ctaText || ''} onChange={e => setForm({ ...form, ctaText: e.target.value })} className={inputClass} /></div><div><label className="flex items-center justify-between text-sm font-medium text-slate-700 mb-2"><span>Footer Logo Size</span><span className="font-mono text-xs text-[#000080]">{form.logoSize}px</span></label><input type="range" min="40" max="96" value={form.logoSize || 58} onChange={e => setForm({ ...form, logoSize: Number(e.target.value) })} className="w-full accent-[#000080]" /></div></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['servicesHeading','Services heading'],['companyHeading','Company heading'],['legalHeading','Legal heading'],['contactHeading','Contact heading']].map(([key,label]) => <div key={key}><label className="block text-xs font-bold text-slate-600 mb-2">{label}</label><input value={form[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value })} className={inputClass} /></div>)}</div>
      </div>

      {renderLinkEditor('Core Service Links', 'servicesLinks')}
      {renderLinkEditor('Company Links', 'companyLinks')}
      {renderLinkEditor('Legal Links', 'legalLinks')}

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-bold text-slate-900">Social Profiles</h2>
        <p className="mt-1 text-xs text-slate-500">Icons appear only when a complete URL beginning with https:// is saved.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">{[['linkedin','LinkedIn'],['facebook','Facebook'],['instagram','Instagram'],['twitter','X / Twitter'],['youtube','YouTube']].map(([key,label]) => <div key={key}><label className="block text-xs font-bold text-slate-600 mb-2">{label}</label><input type="url" value={form.socialLinks?.[key] || ''} onChange={e => setForm({ ...form, socialLinks: { ...form.socialLinks, [key]: e.target.value } })} placeholder={`https://${key}.com/...`} className={inputClass} /></div>)}</div>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900">Business name, registered address, email, phone, and the uploaded logo remain managed from Site Settings and Theme Settings as the single source of truth.</div>
    </div>
  );
}
