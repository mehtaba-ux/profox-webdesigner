import { useEffect, useState, type CSSProperties } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import LiveChatWidget from './chat/LiveChatWidget';
import ThemeCustomizerDrawer from './admin/ThemeCustomizerDrawer';
import DevModeAdminBanner from './DevModeAdminBanner';
import DevelopmentModeScreen from './DevelopmentModeScreen';
import { useCMS } from '../lib/CMSProvider';
import { useAuth } from '../lib/AuthContext';
import { Settings, Edit3, Sliders, LogOut, UserCheck } from 'lucide-react';
import { SEO_SITE_ORIGIN } from '../lib/seoUrls';

export default function MainLayout() {
  const { content, isLiveEditing, setIsLiveEditing } = useCMS();
  const { isAdminOrEditor, role, logout } = useAuth();
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);
  const location = useLocation();

  const isDevModeActive = Boolean(content.siteSettings?.maintenanceMode?.enabled);

  useEffect(() => {
    const cleanPath = location.pathname === '/' ? '/' : location.pathname.replace(/\/+$/, '');
    const canonicalUrl = `${SEO_SITE_ORIGIN}${cleanPath}`;
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    let ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (!ogUrl) {
      ogUrl = document.createElement('meta');
      ogUrl.setAttribute('property', 'og:url');
      document.head.appendChild(ogUrl);
    }
    ogUrl.content = canonicalUrl;
  }, [location.pathname]);

  // If Development Mode is active and visitor is not an Admin/Editor, render the custom development screen
  if (isDevModeActive && !isAdminOrEditor) {
    return (
      <DevelopmentModeScreen
        config={content.siteSettings?.maintenanceMode}
        businessName={content.siteSettings?.businessName || 'ProFox Webdesigner'}
      />
    );
  }

  return (
    <div className="site-typography min-h-screen bg-white selection:bg-blue-100 selection:text-blue-900 relative flex flex-col" style={{ '--site-font-family': content.theme?.fontFamily || 'Inter' } as CSSProperties}>
      {/* If Admin is viewing while Dev Mode is Active, show sticky top warning & fast-toggle */}
      {isDevModeActive && isAdminOrEditor && (
        <DevModeAdminBanner />
      )}

      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <LiveChatWidget />
      
      {isAdminOrEditor && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-white/95 backdrop-blur-xl text-slate-900 p-2 rounded-2xl shadow-2xl border border-slate-300/60 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-slate-100/90 rounded-xl text-xs font-bold text-[#000080] border border-slate-300/80">
            <UserCheck className="w-3.5 h-3.5" />
            <span className="capitalize">{role ? role.replace('_', ' ') : 'Admin'}</span>
          </div>
          <button
            onClick={() => setIsLiveEditing?.(!isLiveEditing)}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs transition-all ${
              isLiveEditing
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30 ring-2 ring-amber-300'
                : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
            }`}
            title="Toggle 1-Click Front-End Editing Mode"
          >
            <Edit3 className="w-4 h-4" />
            <span>{isLiveEditing ? 'Editing Active' : '1-Click Edit'}</span>
          </button>
          <button
            onClick={() => setIsCustomizerOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs bg-[#000080] hover:bg-[#000080] text-white transition-all shadow-lg shadow-[#000080]/30"
            title="Customize Theme, Fonts, Colors & Add Sections"
          >
            <Sliders className="w-4 h-4" />
            <span>Customize Theme</span>
          </button>
          <Link 
            to="/admin" 
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 transition-all border border-slate-300"
            title="Open Admin CMS Dashboard"
          >
            <Settings className="w-4 h-4 text-[#000080]" />
            <span className="hidden sm:inline">Admin CMS</span>
          </Link>
          <button
            onClick={() => logout()}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition-colors border border-slate-300"
            title="Log Out from Admin CMS"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      )}
      
      {isAdminOrEditor && (
        <ThemeCustomizerDrawer 
          isOpen={isCustomizerOpen} 
          onClose={() => setIsCustomizerOpen(false)} 
          isLiveEditing={isLiveEditing}
          onToggleLiveEditing={(val) => setIsLiveEditing?.(val)}
        />
      )}
    </div>
  );
}
