import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import Hero from './components/Hero';
import Services from './components/Services';
import ServicePackages from './components/ServicePackages';
import CaseStudies from './components/CaseStudies';
import GrowthSection from './components/GrowthSection';
import Insights from './components/Insights';
import CTA from './components/CTA';
import FeedbackSection from './components/FeedbackSection';
import FAQSection from './components/FAQSection';
import { CMSProvider, useCMS } from './lib/CMSProvider';
import { AuthProvider, useAuth } from './lib/AuthContext';
import MainLayout from './components/MainLayout';
import { getPagePath } from './lib/seoUrls';
import HomePageLoader from './components/HomePageLoader';
import HomeScrollProgress from './components/HomeScrollProgress';
import ScrollToTop from './components/ScrollToTop';
import TalentPartnerReferralTracker from './components/TalentPartnerReferralTracker';
import { ConfirmProvider } from './components/admin/ConfirmContext';

const MeetingsWorkspace = lazy(() => import('./components/admin/MeetingsWorkspace'));
const MeetingSettingsAdmin = lazy(() => import('./components/admin/MeetingSettingsAdmin'));
const CalendarHub = lazy(() => import('./components/admin/CalendarHub'));
const BookingSetupWorkspace = lazy(() => import('./components/admin/BookingSetupWorkspace'));
const PublicBookingSettingsAdmin = lazy(() => import('./components/admin/PublicBookingSettingsAdmin'));
const TodayCommandCenter = lazy(() => import('./components/admin/TodayCommandCenter'));
const SellerExperienceClosure = lazy(() => import('./components/admin/SellerExperienceClosure'));
const SellerProfile = lazy(() => import('./components/admin/SellerProfile'));
const TeamProfile = lazy(() => import('./components/admin/TeamProfile'));
const SalesPerformanceManagement = lazy(() => import('./components/admin/SalesPerformanceManagement'));
const PublicPricingAdmin = lazy(() => import('./components/admin/PublicPricingAdmin'));
const ProductivityRecordFocus = lazy(() => import('./components/admin/ProductivityRecordFocus'));
const ProductivitySettingsAdmin = lazy(() => import('./components/admin/ProductivitySettingsAdmin'));
const DesignDeliverySettingsAdmin = lazy(() => import('./components/admin/DesignDeliverySettingsAdmin'));
const AcademyCertificationReviewQueue = lazy(() => import('./components/admin/AcademyCertificationReviewQueue'));
const ProductivityCommandPalette = lazy(() => import('./components/admin/ProductivityCommandPalette'));
const BusinessIntelligenceDashboard = lazy(() => import('./components/admin/BusinessIntelligenceDashboard'));
const BusinessIntelligenceSettingsAdmin = lazy(() => import('./components/admin/BusinessIntelligenceSettingsAdmin'));
const ManagementAiAdmin = lazy(() => import('./components/admin/ManagementAiAdmin'));
const MeetingPrepView = lazy(() => import('./components/admin/MeetingPrepView'));
const MeetingManageView = lazy(() => import('./components/admin/MeetingManageView'));
const SalesProjectHandoverView = lazy(() => import('./components/admin/SalesProjectHandoverView'));
const NotificationAutomationAdmin = lazy(() => import('./components/admin/NotificationAutomationAdmin'));
const CRMPipelineSettingsAdmin = lazy(() => import('./components/admin/CRMPipelineSettingsAdmin'));
const CustomerCommunicationAdmin = lazy(() => import('./components/admin/CustomerCommunicationAdmin'));
const BookingAnalyticsAdmin = lazy(() => import('./components/admin/BookingAnalyticsAdmin'));
const CareerJobsAdmin = lazy(() => import('./components/admin/CareerJobsAdmin'));
const TalentPartnerAdmin = lazy(() => import('./components/admin/TalentPartnerAdmin'));
const UIUXRecruitmentWorkspace = lazy(() => import('./components/admin/UIUXRecruitmentWorkspace'));
const SalesCareerProgression = lazy(() => import('./components/admin/SalesCareerProgression'));
const SalesAgreementAdmin = lazy(() => import('./components/admin/SalesAgreementAdmin'));
const SalesAcademyAssessmentAdmin = lazy(() => import('./components/admin/SalesAcademyAssessmentAdmin'));
const PaymentProcessAdmin = lazy(() => import('./components/admin/PaymentProcessAdmin'));
const PaymentGatewaySettingsAdmin = lazy(() => import('./components/admin/PaymentGatewaySettingsAdmin'));
const CrmTrainingAdmin = lazy(() => import('./components/admin/CrmTrainingAdmin'));
const CalendarTrainingAdmin = lazy(() => import('./components/admin/CalendarTrainingAdmin'));
const ConfidentialityTrainingAdmin = lazy(() => import('./components/admin/ConfidentialityTrainingAdmin'));
const FinalCertificationAdmin = lazy(() => import('./components/admin/FinalCertificationAdmin'));
const NicheAcademyAdmin = lazy(() => import('./components/admin/NicheAcademyAdmin'));
const NicheCatalogAdmin = lazy(() => import('./components/admin/NicheCatalogAdmin'));
const NicheAssessmentAdmin = lazy(() => import('./components/admin/NicheAssessmentAdmin'));
const LeadResearchAdmin = lazy(() => import('./components/admin/LeadResearchAdmin'));
const LoomOutreachAdmin = lazy(() => import('./components/admin/LoomOutreachAdmin'));
const OutreachMessagingAdmin = lazy(() => import('./components/admin/OutreachMessagingAdmin'));
const MockCallAutomationAdmin = lazy(() => import('./components/admin/MockCallAutomationAdmin'));
const ContentRecruitmentDashboard = lazy(() => import('./components/admin/ContentRecruitmentDashboard'));
const InternalChat = lazy(() => import('./components/admin/InternalChat'));
const RecruitmentTaskSettingsAdmin = lazy(() => import('./components/admin/RecruitmentTaskSettingsAdmin'));
const MockCallEvaluatorWorkspace = lazy(() => import('./components/sales/MockCallEvaluatorWorkspace'));
const WorkspaceLauncher = lazy(() => import('./components/admin/workspace/WorkspaceLauncher'));
const AdminAppWorkspace = lazy(() => import('./components/admin/workspace/AdminAppWorkspace'));
const AdminEntry = lazy(() => import('./components/admin/workspace/AdminEntry'));
const WorkspaceRouteFrame = lazy(() => import('./components/admin/workspace/WorkspaceRouteFrame'));
const QuotationWorkspace = lazy(() => import('./components/admin/QuotationWorkspace'));
const QuotationSettingsAdmin = lazy(() => import('./components/admin/QuotationSettingsAdmin'));
const QuotationApprovalsWorkspace = lazy(() => import('./components/admin/QuotationApprovalsWorkspace'));
const CustomPageView = lazy(() => import('./pages/CustomPageView'));
const PricingCatalogPage = lazy(() => import('./pages/PricingCatalogPage'));
const CareersListView = lazy(() => import('./pages/CareersListView'));
const CareerJobDetailPage = lazy(() => import('./pages/CareerJobDetailPage'));
const DeveloperApplicationPage = lazy(() => import('./pages/DeveloperApplicationPage'));
const TalentPartnerPortal = lazy(() => import('./pages/TalentPartnerPortal'));
const TalentPartnerReferralRedirect = lazy(() => import('./pages/TalentPartnerReferralRedirect'));
const RoleFinalCertificationPage = lazy(() => import('./pages/RoleFinalCertificationPage'));
const DesignAcademyPage = lazy(() => import('./pages/DesignAcademyPage'));
const UIUXAcademyReviewPage = lazy(() => import('./pages/UIUXAcademyReviewPage'));
const BlogList = lazy(() => import('./pages/BlogList'));
const LeaveFeedback = lazy(() => import('./pages/PublicFeedback'));
const BlogPostView = lazy(() => import('./pages/BlogPostView'));
const PortfolioList = lazy(() => import('./pages/PortfolioList'));
const PortfolioDetailView = lazy(() => import('./pages/PortfolioDetailView'));
const ServiceDetailView = lazy(() => import('./pages/ServiceDetailView'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const PublicBookingPage = lazy(() => import('./pages/PublicBookingPage'));
const BookingManagementPage = lazy(() => import('./pages/BookingManagementPage'));
const PublicQuotationReview = lazy(() => import('./pages/PublicQuotationReview'));
const PublicPaymentCheckout = lazy(() => import('./pages/PublicPaymentCheckout'));
const SalesPartnerAgreementSign = lazy(() => import('./pages/SalesPartnerAgreementSign'));
const SalesOnboardingSetup = lazy(() => import('./pages/SalesOnboardingSetup'));
const RecruitmentTaskPage = lazy(() => import('./pages/RecruitmentTaskPage'));
const ContentPortfolioTaskPage = lazy(() => import('./pages/ContentPortfolioTaskPage'));
const ClientPortalEntry = lazy(() => import('./components/client/ClientPortalEntry'));
const ClientOnboardingPage = lazy(() => import('./pages/ClientOnboardingPage'));

function LegacyPageRedirect() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { content, loading } = useCMS();
  if (loading) return null;
  const page = (content.customPages || []).find((item: any) => item.slug === slug || item.id === slug);
  return page ? <Navigate to={getPagePath(page)} replace /> : <Navigate to={`/${slug}`} replace />;
}

function HomePage() {
  const { content, isLiveEditing } = useCMS();
  const { isAdminOrEditor } = useAuth();
  useEffect(() => {
    const bizName = content.siteSettings?.businessName || 'Profox web designer';
    document.title = `${bizName} - Premium High-End Web Design & Digital Solutions`;
  }, [content.siteSettings?.businessName]);
  const activeEditing = isAdminOrEditor && isLiveEditing;
  const isPricingEnabled = content.servicePackages?.enabled === true;
  const isInsightsEnabled = content.insights?.enabled !== false;
  const isCaseStudiesEnabled = content.caseStudies?.enabled !== false;
  const isCTAEnabled = content.cta?.enabled !== false;
  return <><HomePageLoader/><HomeScrollProgress/><Hero isLiveEditing={activeEditing}/><Services isLiveEditing={activeEditing}/>{isPricingEnabled&&<ServicePackages isLiveEditing={activeEditing}/>} {isCaseStudiesEnabled&&<CaseStudies isLiveEditing={activeEditing}/>}<GrowthSection isLiveEditing={activeEditing}/><FAQSection isLiveEditing={activeEditing}/><FeedbackSection isLiveEditing={activeEditing}/>{isInsightsEnabled&&<Insights isLiveEditing={activeEditing}/>} {isCTAEnabled&&<CTA isLiveEditing={activeEditing}/>}</>;
}

function RouteLoading() {
  return <div className="flex min-h-[45vh] items-center justify-center bg-white"><div className="h-9 w-9 animate-spin rounded-full border-4 border-[#000080] border-t-transparent" aria-label="Loading screen" /></div>;
}

export default function App() {
  return <AuthProvider><CMSProvider><ConfirmProvider><ScrollToTop/><Suspense fallback={<RouteLoading/>}><ProductivityCommandPalette/><TalentPartnerReferralTracker/><Routes>
    <Route element={<MainLayout/>}>
      <Route path="/" element={<HomePage/>}/><Route path="/p/:slug" element={<LegacyPageRedirect/>}/><Route path="/page/:slug" element={<LegacyPageRedirect/>}/>
      <Route path="/about" element={<Navigate to="/about-us" replace/>}/><Route path="/about-us" element={<CustomPageView/>}/><Route path="/pricing" element={<PricingCatalogPage/>}/><Route path="/careers" element={<CareersListView/>}/><Route path="/careers/:slug" element={<CareerJobDetailPage/>}/><Route path="/jobs" element={<Navigate to="/careers" replace/>}/><Route path="/carriers" element={<Navigate to="/careers" replace/>}/><Route path="/carear" element={<Navigate to="/careers" replace/>}/><Route path="/offers" element={<Navigate to="/careers" replace/>}/><Route path="/contact" element={<Navigate to="/contact-us" replace/>}/><Route path="/contact-us" element={<CustomPageView/>}/><Route path="/blog" element={<BlogList/>}/><Route path="/blog/:slug" element={<BlogPostView/>}/><Route path="/services/:slug" element={<ServiceDetailView/>}/><Route path="/portfolio" element={<PortfolioList/>}/><Route path="/portfolio/:slug" element={<PortfolioDetailView/>}/><Route path="/book" element={<Navigate to="/book-a-meeting" replace/>}/><Route path="/book-a-meeting" element={<PublicBookingPage/>}/><Route path="/manage-booking/:token" element={<BookingManagementPage/>}/><Route path="/privacy-policy" element={<PrivacyPolicy defaultTab="privacy"/>}/><Route path="/privacy" element={<Navigate to="/privacy-policy" replace/>}/><Route path="/terms" element={<Navigate to="/terms-and-conditions" replace/>}/><Route path="/terms-of-use" element={<Navigate to="/terms-and-conditions" replace/>}/><Route path="/terms-and-conditions" element={<PrivacyPolicy defaultTab="terms"/>}/><Route path="/cookie-policy" element={<PrivacyPolicy defaultTab="cookies"/>}/><Route path="/cookies" element={<Navigate to="/cookie-policy" replace/>}/><Route path="/leave-feedback" element={<LeaveFeedback/>}/><Route path="/:slug" element={<CustomPageView/>}/>
    </Route>
    <Route path="/r/:partnerCode/:jobSlug" element={<TalentPartnerReferralRedirect/>}/>
    <Route path="/talent-partner" element={<TalentPartnerPortal/>}/>
    <Route path="/talent-partner/login" element={<TalentPartnerPortal/>}/>
    <Route path="/partner" element={<Navigate to="/talent-partner" replace/>}/>
    <Route path="/quotation/review/:token" element={<PublicQuotationReview/>}/>
    <Route path="/pay/:token" element={<PublicPaymentCheckout/>}/>
    <Route path="/client-onboarding/:token" element={<ClientOnboardingPage/>}/>
    <Route path="/agreement/sign/:token" element={<SalesPartnerAgreementSign/>}/>
    <Route path="/recruitment/task/:token" element={<RecruitmentTaskPage/>}/>
    <Route path="/recruitment/content-portfolio/:token" element={<ContentPortfolioTaskPage/>}/>
    <Route path="/careers/:slug/apply" element={<DeveloperApplicationPage/>}/>
    <Route path="/sales-onboarding/setup" element={<SalesOnboardingSetup/>}/>
    <Route path="/team-onboarding/setup" element={<SalesOnboardingSetup/>}/>
    <Route path="/design-academy" element={<DesignAcademyPage/>}/>
    <Route path="/academy/final-certification" element={<RoleFinalCertificationPage/>}/>
    <Route path="/client-portal" element={<ClientPortalEntry/>}/>
    <Route path="/sales/mock-call-evaluator" element={<MockCallEvaluatorWorkspace/>}/>
    <Route element={<WorkspaceRouteFrame/>}>
      <Route path="/admin/quotations/new" element={<QuotationWorkspace/>}/>
      <Route path="/admin/quotations/:quotationId" element={<QuotationWorkspace/>}/>
      <Route path="/admin/quotation-settings" element={<QuotationSettingsAdmin/>}/>
      <Route path="/admin/quotation-approvals" element={<QuotationApprovalsWorkspace/>}/>
      <Route path="/admin/quotation-approvals/:quotationId" element={<QuotationApprovalsWorkspace/>}/>
      <Route path="/admin/content-recruitment" element={<ContentRecruitmentDashboard/>}/>
      <Route path="/admin/uiux-recruitment" element={<UIUXRecruitmentWorkspace/>}/>
      <Route path="/admin/talent-partners" element={<TalentPartnerAdmin/>}/>
      <Route path="/admin/uiux-academy-review/:userId" element={<UIUXAcademyReviewPage/>}/>
      <Route path="/admin/academy-certification-reviews" element={<AcademyCertificationReviewQueue/>}/>
      <Route path="/admin/payment-gateway-settings" element={<PaymentGatewaySettingsAdmin/>}/>
      <Route path="/admin/internal-chat" element={<InternalChat/>}/>
      <Route path="/admin/profile" element={<TeamProfile/>}/>
      <Route path="/admin/today" element={<TodayCommandCenter/>}/>
      <Route path="/admin/seller-command-center" element={<SellerExperienceClosure/>}/>
      <Route path="/admin/seller-profile" element={<SellerProfile/>}/>
      <Route path="/admin/sales-performance" element={<SalesPerformanceManagement/>}/>
      <Route path="/admin/public-pricing" element={<PublicPricingAdmin/>}/>
      <Route path="/admin/focus/:entityType/:entityId" element={<ProductivityRecordFocus/>}/>
      <Route path="/admin/intelligence" element={<BusinessIntelligenceDashboard/>}/>
      <Route path="/admin/intelligence-ai" element={<ManagementAiAdmin/>}/>
      <Route path="/admin/intelligence-settings" element={<BusinessIntelligenceSettingsAdmin/>}/>
      <Route path="/admin/calendar" element={<CalendarHub/>}/>
      <Route path="/admin/meetings" element={<MeetingsWorkspace/>}/>
      <Route path="/admin/meeting-prep/:id" element={<MeetingPrepView/>}/>
      <Route path="/admin/meeting-manage/:id" element={<MeetingManageView/>}/>
      <Route path="/admin/project-handover/:id" element={<SalesProjectHandoverView/>}/>
      <Route path="/admin/booking-setup" element={<BookingSetupWorkspace/>}/>
      <Route path="/admin/booking-settings" element={<PublicBookingSettingsAdmin/>}/>
      <Route path="/admin/booking-analytics" element={<BookingAnalyticsAdmin/>}/>
      <Route path="/admin/meeting-settings" element={<MeetingSettingsAdmin/>}/>
      <Route path="/admin/automation-settings" element={<NotificationAutomationAdmin/>}/>
      <Route path="/admin/crm-pipeline-settings" element={<CRMPipelineSettingsAdmin/>}/>
      <Route path="/admin/customer-communication-settings" element={<CustomerCommunicationAdmin/>}/>
      <Route path="/admin/productivity-settings" element={<ProductivitySettingsAdmin/>}/>
      <Route path="/admin/design-delivery-settings" element={<DesignDeliverySettingsAdmin/>}/>
      <Route path="/admin/hiring-content" element={<CareerJobsAdmin/>}/>
      <Route path="/admin/job-posts" element={<CareerJobsAdmin/>}/>
      <Route path="/admin/sales-career-progression" element={<SalesCareerProgression/>}/>
      <Route path="/admin/agreements" element={<SalesAgreementAdmin/>}/>
      <Route path="/admin/academy-assessment" element={<SalesAcademyAssessmentAdmin/>}/>
      <Route path="/admin/payment-process-controls" element={<PaymentProcessAdmin/>}/>
      <Route path="/admin/crm-training-controls" element={<CrmTrainingAdmin/>}/>
      <Route path="/admin/calendar-training-controls" element={<CalendarTrainingAdmin/>}/>
      <Route path="/admin/confidentiality-training-controls" element={<ConfidentialityTrainingAdmin/>}/>
      <Route path="/admin/final-certification-controls" element={<FinalCertificationAdmin/>}/>
      <Route path="/admin/mock-call-automation" element={<MockCallAutomationAdmin/>}/>
      <Route path="/admin/niche-academy" element={<NicheAcademyAdmin/>}/>
      <Route path="/admin/niche-catalog" element={<NicheCatalogAdmin/>}/>
      <Route path="/admin/niche-assessment" element={<NicheAssessmentAdmin/>}/>
      <Route path="/admin/lead-research" element={<LeadResearchAdmin/>}/>
      <Route path="/admin/outreach-messaging" element={<OutreachMessagingAdmin/>}/>
      <Route path="/admin/loom-outreach" element={<LoomOutreachAdmin/>}/>
      <Route path="/admin/recruitment-task-settings" element={<RecruitmentTaskSettingsAdmin/>}/>
    </Route>
    <Route path="/admin/workspace" element={<WorkspaceLauncher/>}/>
    <Route path="/admin/app/:appId" element={<AdminAppWorkspace/>}/>
    <Route path="/admin" element={<AdminEntry/>}/>
    <Route path="/admin/*" element={<AdminEntry/>}/>
  </Routes></Suspense></ConfirmProvider></CMSProvider></AuthProvider>;
}