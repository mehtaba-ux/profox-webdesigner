import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import DevModeAdminBanner from './DevModeAdminBanner';
import DevelopmentModeScreen from './DevelopmentModeScreen';
import { useCMS } from '../lib/CMSProvider';
import { useAuth } from '../lib/AuthContext';
import { Settings, Edit3, Sliders, LogOut, UserCheck } from 'lucide-react';
import { SEO_SITE_ORIGIN } from '../lib/seoUrls';

const LiveChatWidget = lazy(() => import('./chat/LiveChatWidget'));
const ThemeCustomizerDrawer = lazy(() => import('./admin/ThemeCustomizerDrawer'));

export default function MainLayout() {
  const { content, isLiveEditing, setIsLiveEditing } = useCMS();
  const { isAdminOrEditor, role, logout } = useAuth();
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);
  const [interactiveToolsReady, setInteractiveToolsReady] = useState(false);
  const location = useLocation();
  const selectedFont = content.theme?.fontFamily || 'Inter';

  const isDevModeActive = Boolean(content.siteSettings?.maintenanceMode?.enabled);

  useEffect(() => {
    const fontFamilies: Record<string, string> = {
      Cinzel: 'Cinzel:wght@400;700;900',
      Inter: 'Inter:wght@300;400;500;600;700;800;900',
      Montserrat: 'Montserrat:wght@300;400;500;600;700;800;900',
      Outfit: 'Outfit:wght@300;400;500;600;700;800;900',
      'Playfair Display': 'Playfair+Display:ital,wght@0,400;0,600;0,700;0,900;1,400;1,700',
      'Plus Jakarta Sans': 'Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400',
      Poppins: 'Poppins:wght@300;400;500;600;700;800;900',
      'Space Grotesk': 'Space+Grotesk:wght@400;500;600;700'
    };
    const family = fontFamilies[selectedFont] || fontFamilies.Inter;
    const id = 'profox-selected-google-font';
    let stylesheet = document.getElementById(id) as HTMLLinkElement | null;
    if (!stylesheet) {
      stylesheet = document.createElement('link');
      stylesheet.id = id;
      stylesheet.rel = 'stylesheet';
      document.head.appendChild(stylesheet);
    }
    stylesheet.href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
  }, [selectedFont]);

  useEffect(() => {
    const ready = () => setInteractiveToolsReady(true);
    const idleWindow = window as typeof window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(ready, { timeout: 1800 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(ready, 1200);
    return () => window.clearTimeout(timer);
  }, []);

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

  useEffect(() => {
    const faviconUrl = content.siteSettings?.faviconUrl || '/favicon.svg';
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    if (faviconUrl.endsWith('.svg') || faviconUrl.includes('image/svg+xml')) {
      link.type = 'image/svg+xml';
    } else if (faviconUrl.endsWith('.png')) {
      link.type = 'image/png';
    } else {
      link.type = 'image/x-icon';
    }
    link.href = faviconUrl;
  }, [content.siteSettings?.faviconUrl]);

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
    <div className="site-typography min-h-screen bg-white selection:bg-blue-100 selection:text-blue-900 relative flex flex-col" style={{ '--site-font-family': selectedFont } as CSSProperties}>
      {/* If Admin is viewing while Dev Mode is Active, show sticky top warning & fast-toggle */}
      {isDevModeActive && isAdminOrEditor && (
        <DevModeAdminBanner />
      )}

      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      {interactiveToolsReady && <Suspense fallback={null}><LiveChatWidget /></Suspense>}
      
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
        <Suspense fallback={null}><ThemeCustomizerDrawer
          isOpen={isCustomizerOpen} 
          onClose={() => setIsCustomizerOpen(false)} 
          isLiveEditing={isLiveEditing}
          onToggleLiveEditing={(val) => setIsLiveEditing?.(val)}
        /></Suspense>
      )}
    </div>
  );
}
