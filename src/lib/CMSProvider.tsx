import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase, dbProcedure } from './supabase';
import { defaultPortfolioItems, defaultPortfolioCategories } from '../data';

const CMS_CACHE_KEY = 'cms_content_cache';
const CMS_CACHE_TIME_KEY = 'cms_content_cache_saved_at';
const PUBLIC_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PUBLIC_RUNTIME_SETTINGS_POLL_MS = 30 * 1000;
const PUBLIC_SHARED_SECTIONS = [
  'theme', 'header', 'footer', 'siteSettings', 'hero', 'services', 'servicePackages',
  'caseStudies', 'growth', 'insights', 'cta', 'faq_section',
  'dynamicSections', 'portfolio_items', 'portfolio_categories', 'loadingScreen',
  'process_header', 'process_steps', 'ourProcess', 'globalAwards', 'globalAwardsEnabled'
];

function publicFeedbackEntries(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => entry && typeof entry === 'object' && entry.status === 'resolved' && entry.showOnWebsite === true)
    .map((entry) => ({
      id: String(entry.id || ''),
      customerName: String(entry.customerName || 'Client'),
      rating: Math.max(1, Math.min(5, Number(entry.rating) || 5)),
      comment: String(entry.comment || ''),
      position: entry.position ? String(entry.position) : undefined,
      link: entry.link ? String(entry.link) : undefined,
      image: entry.image ? String(entry.image) : undefined,
      status: 'resolved',
      showOnWebsite: true,
      createdAt: String(entry.createdAt || ''),
    }));
}

// Sales Catalog is the only current commercial source of truth. CMS may control only
// the homepage package section's presentation, never package/card commercial facts.
function sanitizeCmsSection(section: string, data: any) {
  if (section !== 'servicePackages') return data;
  const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  return {
    enabled: source.enabled === true,
    title: typeof source.title === 'string' && source.title.trim() ? source.title : 'Our Services Packages',
    subtitle: typeof source.subtitle === 'string' && source.subtitle.trim()
      ? source.subtitle
      : 'Choose the current ProFox package that best matches the outcome your business needs.'
  };
}

function filterPortfolioItems(items: any[]) {
  if (!Array.isArray(items) || items.length === 0) return defaultPortfolioItems;

  const defaultById = new Map(defaultPortfolioItems.map((p) => [p.id, p]));
  const defaultBySlug = new Map(defaultPortfolioItems.map((p) => [p.slug, p]));

  // Merge items so that stored user items (including updated images and custom edits) override defaults, while keeping defaults as fallback
  const mergedItems = items.map((item) => {
    const def = defaultById.get(item.id) || defaultBySlug.get(item.slug);
    if (def) {
      return {
        ...def,
        ...item,
        // Keep status if explicitly set in stored item
        status: item.status || def.status || 'published',
      };
    }
    return item;
  });

  // Ensure any default items not yet in items are added
  const existingKeys = new Set(mergedItems.flatMap((i) => [i.id, i.slug].filter(Boolean)));
  const missingDefaults = defaultPortfolioItems.filter((d) => !existingKeys.has(d.id) && !existingKeys.has(d.slug));

  const combined = [...mergedItems, ...missingDefaults];

  const filtered = combined.filter((p) => Boolean(p && (p.id || p.slug || p.title)));

  return filtered.length > 0 ? filtered : defaultPortfolioItems;
}

function publicSectionsForPath(pathname: string) {
  const sections = new Set(PUBLIC_SHARED_SECTIONS);
  if (pathname !== '/') sections.add('customPages');
  if (/^\/(services|about-us|careers|contact-us|privacy|terms|cookie|pricing)(\/|$)/.test(pathname)) sections.add('template_blueprints');
  if (pathname.startsWith('/portfolio')) sections.add('portfolio_items');
  return [...sections];
}

function readCachedContent() {
  try {
    const cached = localStorage.getItem(CMS_CACHE_KEY);
    const parsed = cached ? JSON.parse(cached) : {};
    if (Object.prototype.hasOwnProperty.call(parsed, 'servicePackages')) {
      parsed.servicePackages = sanitizeCmsSection('servicePackages', parsed.servicePackages);
    }
    parsed.feedback_submissions = publicFeedbackEntries(parsed.feedback_submissions);
    parsed.portfolio_items = filterPortfolioItems(parsed.portfolio_items);
    parsed.portfolio_categories = defaultPortfolioCategories;
    return parsed;
  } catch {
    return {
      portfolio_items: defaultPortfolioItems,
      portfolio_categories: defaultPortfolioCategories
    };
  }
}

function cacheContent(value: Record<string, any>) {
  try {
    const safeValue = { ...value };
    if (Object.prototype.hasOwnProperty.call(safeValue, 'servicePackages')) {
      safeValue.servicePackages = sanitizeCmsSection('servicePackages', safeValue.servicePackages);
    }
    safeValue.feedback_submissions = publicFeedbackEntries(safeValue.feedback_submissions);
    localStorage.setItem(CMS_CACHE_KEY, JSON.stringify(safeValue));
    localStorage.setItem(CMS_CACHE_TIME_KEY, String(Date.now()));
  } catch (error) {
    console.error('Error caching CMS content', error);
  }
}

interface CMSContextType {
  content: Record<string, any>;
  loading: boolean;
  updateSection: (section: string, data: any) => Promise<void>;
  isLiveEditing?: boolean;
  setIsLiveEditing?: (active: boolean) => void;
}

const CMSContext = createContext<CMSContextType>({
  content: {},
  loading: true,
  updateSection: async () => {},
  isLiveEditing: false,
  setIsLiveEditing: () => {},
});

export const CMSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const [content, setContent] = useState<Record<string, any>>(readCachedContent);
  const [loading, setLoading] = useState(true);
  const [isLiveEditing, setIsLiveEditing] = useState(false);

  useEffect(() => {
    const isAdminRoute = pathname.startsWith('/admin');
    const requiredSections = publicSectionsForPath(pathname);
    const cachedAt = Number(localStorage.getItem(CMS_CACHE_TIME_KEY) || 0);
    const hasRequiredSections = requiredSections.every((section) => Object.prototype.hasOwnProperty.call(content, section));
    const hasUsablePublicCache = !isAdminRoute && hasRequiredSections && Date.now() - cachedAt < PUBLIC_CACHE_TTL_MS;

    // Initial fetch using stored procedure
    const fetchContent = async () => {
      try {
        const { data, error } = isAdminRoute
          ? await dbProcedure.getAllContent()
          : await dbProcedure.getContentSections(requiredSections);
        if (!error && data) {
          const newContent: Record<string, any> = {};
          data.forEach((item: any) => {
            newContent[item.id] = sanitizeCmsSection(item.id, item.data);
          });

          if (!isAdminRoute) {
            const { data: publicFeedback } = await dbProcedure.getPublicFeedback();
            newContent.feedback_submissions = Array.isArray(publicFeedback) ? publicFeedback : [];
          }

          if (!newContent.portfolio_items) {
            const { data: pData } = await dbProcedure.getPublishedPortfolioItems();
            if (pData && pData.length > 0) {
              newContent.portfolio_items = pData.map((p: any) => ({
                id: p.id,
                slug: p.slug,
                title: p.title,
                client: p.client,
                category: p.category,
                coverImage: p.cover_image,
                shortDescription: p.short_description,
                status: p.status
              }));
            } else {
              newContent.portfolio_items = defaultPortfolioItems;
            }
          }

          newContent.portfolio_items = filterPortfolioItems(newContent.portfolio_items);

          setContent(newContent);
          cacheContent(newContent);
        }
      } catch (err) {
        console.error('Error fetching CMS content via stored procedure', err);
      } finally {
        setLoading(false);
      }
    };

    if (hasUsablePublicCache) setLoading(false);
    else fetchContent();

    // Public visitors use the versioned local cache instead of keeping a Realtime
    // connection open. Admin routes stay live so editing behavior is unchanged.
    if (!isAdminRoute) return;

    const channel = supabase
      .channel('public:content')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setContent((prev) => {
            const next = { ...prev };
            delete next[payload.old.id];
            cacheContent(next);
            return next;
          });
        } else {
          setContent((prev) => {
            const next = {
              ...prev,
              [payload.new.id]: sanitizeCmsSection(payload.new.id, payload.new.data),
            };
            cacheContent(next);
            return next;
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pathname]);

  // The full public CMS remains cached for performance, but operational site settings
  // (including the live-chat kill switch and maintenance mode) must not stay stale for hours.
  // Refresh this single lightweight row immediately, every 30 seconds while visible,
  // and whenever a visitor returns to the tab. Do not renew the six-hour CMS cache timer.
  useEffect(() => {
    if (pathname.startsWith('/admin')) return;

    let disposed = false;
    const syncRuntimeSiteSettings = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const { data, error } = await dbProcedure.getContentSections(['siteSettings']);
        if (error || disposed || !Array.isArray(data)) return;
        const siteSettingsRow = data.find((item: any) => item?.id === 'siteSettings');
        if (!siteSettingsRow) return;
        const nextSettings = siteSettingsRow.data && typeof siteSettingsRow.data === 'object'
          ? siteSettingsRow.data
          : {};

        setContent((prev) => {
          const currentSettings = prev.siteSettings && typeof prev.siteSettings === 'object'
            ? prev.siteSettings
            : {};
          if (JSON.stringify(currentSettings) === JSON.stringify(nextSettings)) return prev;
          return { ...prev, siteSettings: nextSettings };
        });
      } catch (err) {
        console.error('Error refreshing runtime site settings', err);
      }
    };

    void syncRuntimeSiteSettings();
    const interval = window.setInterval(syncRuntimeSiteSettings, PUBLIC_RUNTIME_SETTINGS_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void syncRuntimeSiteSettings();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pathname]);

  const handleUpdate = async (section: string, data: any) => {
    const safeData = sanitizeCmsSection(section, data);
    const { error } = await dbProcedure.upsertContentItem(section, safeData);
    
    if (error) {
      console.error('Error updating content via stored procedure:', error);
      throw error;
    }

    setContent((prev) => {
      const next = { ...prev, [section]: safeData };
      cacheContent(next);
      return next;
    });
  };

  return (
    <CMSContext.Provider value={{ content, loading, updateSection: handleUpdate, isLiveEditing, setIsLiveEditing }}>
      {children}
    </CMSContext.Provider>
  );
};

export const useCMS = () => useContext(CMSContext);