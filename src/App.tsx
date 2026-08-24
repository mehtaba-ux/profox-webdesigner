import { useEffect } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import Hero from './components/Hero';
import Services from './components/Services';
import ServicePackages from './components/ServicePackages';
import CaseStudies from './components/CaseStudies';
import GrowthSection from './components/GrowthSection';
import Insights from './components/Insights';
import CTA from './components/CTA';
import MeetingsWorkspace from './components/admin/MeetingsWorkspace';
import MeetingSettingsAdmin from './components/admin/MeetingSettingsAdmin';
import CalendarHub from './components/admin/CalendarHub';
import BookingSetupWorkspace from './components/admin/BookingSetupWorkspace';
import PublicBookingSettingsAdmin from './components/admin/PublicBookingSettingsAdmin';
import TodayCommandCenter from './components/admin/TodayCommandCenter';
import SellerExperienceClosure from './components/admin/SellerExperienceClosure';
import SellerProfile from './components/admin/SellerProfile';
import SalesPerformanceManagement from './components/admin/SalesPerformanceManagement';
import PublicPricingAdmin from './components/admin/PublicPricingAdmin';
import ProductivityRecordFocus from './components/admin/ProductivityRecordFocus';
import ProductivitySettingsAdmin from './components/admin/ProductivitySettingsAdmin';
import DesignDeliverySettingsAdmin from './components/admin/DesignDeliverySettingsAdmin';
import AcademyCertificationReviewQueue from './components/admin/AcademyCertificationReviewQueue';
import ProductivityCommandPalette from './components/admin/ProductivityCommandPalette';
import BusinessIntelligenceDashboard from './components/admin/BusinessIntelligenceDashboard';
import BusinessIntelligenceSettingsAdmin from './components/admin/BusinessIntelligenceSettingsAdmin';
import ManagementAiAdmin from './components/admin/ManagementAiAdmin';
import MeetingPrepView from './components/admin/MeetingPrepView';
import MeetingManageView from './components/admin/MeetingManageView';
import SalesProjectHandoverView from './components/admin/SalesProjectHandoverView';
import NotificationAutomationAdmin from './components/admin/NotificationAutomationAdmin';
import CustomerCommunicationAdmin from './components/admin/CustomerCommunicationAdmin';
import BookingAnalyticsAdmin from './components/admin/BookingAnalyticsAdmin';
import CareerJobsAdmin from './components/admin/CareerJobsAdmin';
import UIUXRecruitmentWorkspace from './components/admin/UIUXRecruitmentWorkspace';
import SalesCareerProgression from './components/admin/SalesCareerProgression';
import SalesAgreementAdmin from './components/admin/SalesAgreementAdmin';
import SalesAcademyAssessmentAdmin from './components/admin/SalesAcademyAssessmentAdmin';
import PaymentProcessAdmin from './components/admin/PaymentProcessAdmin';
import PaymentGatewaySettingsAdmin from './components/admin/PaymentGatewaySettingsAdmin';
import CrmTrainingAdmin from './components/admin/CrmTrainingAdmin';
import CalendarTrainingAdmin from './components/admin/CalendarTrainingAdmin';
import ConfidentialityTrainingAdmin from './components/admin/ConfidentialityTrainingAdmin';
import FinalCertificationAdmin from './components/admin/FinalCertificationAdmin';
import NicheAcademyAdmin from './components/admin/NicheAcademyAdmin';
import NicheCatalogAdmin from './components/admin/NicheCatalogAdmin';
import NicheAssessmentAdmin from './components/admin/NicheAssessmentAdmin';
import LeadResearchAdmin from './components/admin/LeadResearchAdmin';
import LoomOutreachAdmin from './components/admin/LoomOutreachAdmin';
import OutreachMessagingAdmin from './components/admin/OutreachMessagingAdmin';
import MockCallAutomationAdmin from './components/admin/MockCallAutomationAdmin';
import ContentRecruitmentDashboard from './components/admin/ContentRecruitmentDashboard';
import InternalChat from './components/admin/InternalChat';
import MockCallEvaluatorWorkspace from './components/sales/MockCallEvaluatorWorkspace';
import WorkspaceLauncher from './components/admin/workspace/WorkspaceLauncher';
import AdminAppWorkspace from './components/admin/workspace/AdminAppWorkspace';
import AdminEntry from './components/admin/workspace/AdminEntry';
import CustomPageView from './pages/CustomPageView';
import PricingCatalogPage from './pages/PricingCatalogPage';
import CareersListView from './pages/CareersListView';
import CareerJobDetailPage from './pages/CareerJobDetailPage';
import DeveloperApplicationPage from './pages/DeveloperApplicationPage';
import RoleFinalCertificationPage from './pages/RoleFinalCertificationPage';
import DesignAcademyPage from './pages/DesignAcademyPage';
import UIUXAcademyReviewPage from './pages/UIUXAcademyReviewPage';
import BlogList from './pages/BlogList';
import LeaveFeedback from './pages/PublicFeedback';
import BlogPostView from './pages/BlogPostView';
import PortfolioList from './pages/PortfolioList';
import PortfolioDetailView from './pages/PortfolioDetailView';
import ServiceDetailView from './pages/ServiceDetailView';
import PrivacyPolicy from './pages/PrivacyPolicy';
import PublicBookingPage from './pages/PublicBookingPage';
import BookingManagementPage from './pages/BookingManagementPage';
import PublicQuotationReview from './pages/PublicQuotationReview';
import PublicPaymentCheckout from './pages/PublicPaymentCheckout';
import SalesPartnerAgreementSign from './pages/SalesPartnerAgreementSign';
import SalesOnboardingSetup from './pages/SalesOnboardingSetup';
import FeedbackSection from './components/FeedbackSection';
import FAQSection from './components/FAQSection';
import { CMSProvider, useCMS } from './lib/CMSProvider';
import { AuthProvider, useAuth } from './lib/AuthContext';
import MainLayout from './components/MainLayout';
import { getPagePath } from './lib/seoUrls';
import HomePageLoader from './components/HomePageLoader';
import HomeScrollProgress from './components/HomeScrollProgress';
import ClientDashboard from './components/client/ClientDashboard';
import ScrollToTop from './components/ScrollToTop';
import { ConfirmProvider } from './components/admin/ConfirmContext';

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

export default function App() {
  return <AuthProvider><CMSProvider><ConfirmProvider><ScrollToTop/><ProductivityCommandPalette/><Routes>
    <Route element={<MainLayout/>}>
      <Route path="/" element={<HomePage/>}/><Route path="/p/:slug" element={<LegacyPageRedirect/>}/><Route path="/page/:slug" element={<LegacyPageRedirect/>}/>
      <Route path="/about" element={<Navigate to="/about-us" replace/>}/><Route path="/about-us" element={<CustomPageView/>}/><Route path="/pricing" element={<PricingCatalogPage/>}/><Route path="/careers" element={<CareersListView/>}/><Route path="/careers/:slug" element={<CareerJobDetailPage/>}/><Route path="/jobs" element={<Navigate to="/careers" replace/>}/><Route path="/carriers" element={<Navigate to="/careers" replace/>}/><Route path="/carear" element={<Navigate to="/careers" replace/>}/><Route path="/offers" element={<Navigate to="/careers" replace/>}/><Route path="/contact" element={<Navigate to="/contact-us" replace/>}/><Route path="/contact-us" element={<CustomPageView/>}/><Route path="/blog" element={<BlogList/>}/><Route path="/blog/:slug" element={<BlogPostView/>}/><Route path="/services/:slug" element={<ServiceDetailView/>}/><Route path="/portfolio" element={<PortfolioList/>}/><Route path="/portfolio/:slug" element={<PortfolioDetailView/>}/><Route path="/book" element={<Navigate to="/book-a-meeting" replace/>}/><Route path="/book-a-meeting" element={<PublicBookingPage/>}/><Route path="/manage-booking/:token" element={<BookingManagementPage/>}/><Route path="/privacy-policy" element={<PrivacyPolicy defaultTab="privacy"/>}/><Route path="/privacy" element={<Navigate to="/privacy-policy" replace/>}/><Route path="/terms" element={<Navigate to="/terms-and-conditions" replace/>}/><Route path="/terms-of-use" element={<Navigate to="/terms-and-conditions" replace/>}/><Route path="/terms-and-conditions" element={<PrivacyPolicy defaultTab="terms"/>}/><Route path="/cookie-policy" element={<PrivacyPolicy defaultTab="cookies"/>}/><Route path="/cookies" element={<Navigate to="/cookie-policy" replace/>}/><Route path="/leave-feedback" element={<LeaveFeedback/>}/><Route path="/:slug" element={<CustomPageView/>}/>
    </Route>
    <Route path="/quotation/review/:token" element={<PublicQuotationReview/>}/>
    <Route path="/pay/:token" element={<PublicPaymentCheckout/>}/>
    <Route path="/agreement/sign/:token" element={<SalesPartnerAgreementSign/>}/>
    <Route path="/careers/:slug/apply" element={<DeveloperApplicationPage/>}/>
    <Route path="/sales-onboarding/setup" element={<SalesOnboardingSetup/>}/>
    <Route path="/team-onboarding/setup" element={<SalesOnboardingSetup/>}/>
    <Route path="/design-academy" element={<DesignAcademyPage/>}/>
    <Route path="/academy/final-certification" element={<RoleFinalCertificationPage/>}/>
    <Route path="/client-portal" element={<ClientDashboard/>}/>
    <Route path="/sales/mock-call-evaluator" element={<MockCallEvaluatorWorkspace/>}/>
    <Route path="/admin/content-recruitment" element={<ContentRecruitmentDashboard/>}/>
    <Route path="/admin/uiux-recruitment" element={<UIUXRecruitmentWorkspace/>}/>
    <Route path="/admin/uiux-academy-review/:userId" element={<UIUXAcademyReviewPage/>}/>
    <Route path="/admin/academy-certification-reviews" element={<AcademyCertificationReviewQueue/>}/>
    <Route path="/admin/payment-gateway-settings" element={<PaymentGatewaySettingsAdmin/>}/>
    <Route path="/admin/internal-chat" element={<InternalChat/>}/>
    <Route path="/admin/workspace" element={<WorkspaceLauncher/>}/><Route path="/admin/app/:appId" element={<AdminAppWorkspace/>}/><Route path="/admin/today" element={<TodayCommandCenter/>}/><Route path="/admin/seller-command-center" element={<SellerExperienceClosure/>}/><Route path="/admin/seller-profile" element={<SellerProfile/>}/><Route path="/admin/sales-performance" element={<SalesPerformanceManagement/>}/><Route path="/admin/public-pricing" element={<PublicPricingAdmin/>}/><Route path="/admin/focus/:entityType/:entityId" element={<ProductivityRecordFocus/>}/><Route path="/admin/intelligence" element={<BusinessIntelligenceDashboard/>}/><Route path="/admin/intelligence-ai" element={<ManagementAiAdmin/>}/><Route path="/admin/intelligence-settings" element={<BusinessIntelligenceSettingsAdmin/>}/><Route path="/admin/calendar" element={<CalendarHub/>}/><Route path="/admin/meetings" element={<MeetingsWorkspace/>}/><Route path="/admin/meeting-prep/:id" element={<MeetingPrepView/>}/><Route path="/admin/meeting-manage/:id" element={<MeetingManageView/>}/><Route path="/admin/project-handover/:id" element={<SalesProjectHandoverView/>}/><Route path="/admin/booking-setup" element={<BookingSetupWorkspace/>}/><Route path="/admin/booking-settings" element={<PublicBookingSettingsAdmin/>}/><Route path="/admin/booking-analytics" element={<BookingAnalyticsAdmin/>}/><Route path="/admin/meeting-settings" element={<MeetingSettingsAdmin/>}/><Route path="/admin/automation-settings" element={<NotificationAutomationAdmin/>}/><Route path="/admin/customer-communication-settings" element={<CustomerCommunicationAdmin/>}/><Route path="/admin/productivity-settings" element={<ProductivitySettingsAdmin/>}/><Route path="/admin/design-delivery-settings" element={<DesignDeliverySettingsAdmin/>}/><Route path="/admin/hiring-content" element={<CareerJobsAdmin/>}/><Route path="/admin/job-posts" element={<CareerJobsAdmin/>}/><Route path="/admin/sales-career-progression" element={<SalesCareerProgression/>}/><Route path="/admin/agreements" element={<SalesAgreementAdmin/>}/><Route path="/admin/academy-assessment" element={<SalesAcademyAssessmentAdmin/>}/><Route path="/admin/payment-process-controls" element={<PaymentProcessAdmin/>}/><Route path="/admin/crm-training-controls" element={<CrmTrainingAdmin/>}/><Route path="/admin/calendar-training-controls" element={<CalendarTrainingAdmin/>}/><Route path="/admin/confidentiality-training-controls" element={<ConfidentialityTrainingAdmin/>}/><Route path="/admin/final-certification-controls" element={<FinalCertificationAdmin/>}/><Route path="/admin/mock-call-automation" element={<MockCallAutomationAdmin/>}/><Route path="/admin/niche-academy" element={<NicheAcademyAdmin/>}/><Route path="/admin/niche-catalog" element={<NicheCatalogAdmin/>}/><Route path="/admin/niche-assessment" element={<NicheAssessmentAdmin/>}/><Route path="/admin/lead-research" element={<LeadResearchAdmin/>}/><Route path="/admin/loom-outreach" element={<LoomOutreachAdmin/>}/><Route path="/admin/outreach-messaging" element={<OutreachMessagingAdmin/>}/><Route path="/admin" element={<AdminEntry/>}/><Route path="/admin/*" element={<AdminEntry/>}/>
  </Routes></ConfirmProvider></CMSProvider></AuthProvider>;
}
