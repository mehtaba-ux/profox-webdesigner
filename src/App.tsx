import { useEffect } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import Hero from './components/Hero';
import Services from './components/Services';
import ServicePackages from './components/ServicePackages';
import CaseStudies from './components/CaseStudies';
import GrowthSection from './components/GrowthSection';
import Insights from './components/Insights';
import CTA from './components/CTA';
import AdminDashboard from './components/admin/AdminDashboard';
import CustomPageView from './pages/CustomPageView';
import BlogList from './pages/BlogList';
import LeaveFeedback from './pages/PublicFeedback';
import BlogPostView from './pages/BlogPostView';
import PortfolioList from './pages/PortfolioList';
import PortfolioDetailView from './pages/PortfolioDetailView';
import ServiceDetailView from './pages/ServiceDetailView';
import PrivacyPolicy from './pages/PrivacyPolicy';
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

  return (
    <>
      <HomePageLoader />
      <HomeScrollProgress />
      <Hero isLiveEditing={activeEditing} />
      <Services isLiveEditing={activeEditing} />
      {isPricingEnabled && <ServicePackages isLiveEditing={activeEditing} />}
      {isCaseStudiesEnabled && <CaseStudies isLiveEditing={activeEditing} />}
      <GrowthSection isLiveEditing={activeEditing} />
      
      {/* Frequently Asked Questions */}
      <FAQSection isLiveEditing={activeEditing} />
      
      {/* Approved Client Feedback Section */}
      <FeedbackSection isLiveEditing={activeEditing} />
      
      {isInsightsEnabled && <Insights isLiveEditing={activeEditing} />}
      {isCTAEnabled && <CTA isLiveEditing={activeEditing} />}
    </>
  );
}

import { ConfirmProvider } from './components/admin/ConfirmContext';

export default function App() {
  return (
    <AuthProvider>
      <CMSProvider>
        <ConfirmProvider>
          <ScrollToTop />
          <Routes>
            <Route element={<MainLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/p/:slug" element={<LegacyPageRedirect />} />
              <Route path="/page/:slug" element={<LegacyPageRedirect />} />
              <Route path="/about" element={<Navigate to="/about-us" replace />} />
              <Route path="/about-us" element={<CustomPageView />} />
              <Route path="/careers" element={<CustomPageView />} />
              <Route path="/jobs" element={<Navigate to="/careers" replace />} />
              <Route path="/carriers" element={<Navigate to="/careers" replace />} />
              <Route path="/carear" element={<Navigate to="/careers" replace />} />
              <Route path="/offers" element={<Navigate to="/careers" replace />} />
              <Route path="/contact" element={<Navigate to="/contact-us" replace />} />
              <Route path="/contact-us" element={<CustomPageView />} />
              <Route path="/blog" element={<BlogList />} />
              <Route path="/blog/:slug" element={<BlogPostView />} />
              <Route path="/services/:slug" element={<ServiceDetailView />} />
              <Route path="/portfolio" element={<PortfolioList />} />
              <Route path="/portfolio/:slug" element={<PortfolioDetailView />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy defaultTab="privacy" />} />
              <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
              <Route path="/terms" element={<Navigate to="/terms-and-conditions" replace />} />
              <Route path="/terms-of-use" element={<Navigate to="/terms-and-conditions" replace />} />
              <Route path="/terms-and-conditions" element={<PrivacyPolicy defaultTab="terms" />} />
              <Route path="/cookie-policy" element={<PrivacyPolicy defaultTab="cookies" />} />
              <Route path="/cookies" element={<Navigate to="/cookie-policy" replace />} />
              <Route path="/leave-feedback" element={<LeaveFeedback />} />
              <Route path="/:slug" element={<CustomPageView />} />
            </Route>
            <Route path="/client-portal" element={<ClientDashboard />} />
            <Route path="/admin/*" element={<AdminDashboard />} />
          </Routes>
        </ConfirmProvider>
      </CMSProvider>
    </AuthProvider>
  );
}
