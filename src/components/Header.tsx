import { useState, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, X, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { getPagePath } from '../lib/seoUrls';
import { navItems as defaultNavItems } from '../data';
import { useCMS } from '../lib/CMSProvider';
import { useAuth } from '../lib/AuthContext';
import Logo from './Logo';
import VisualEditable from './admin/VisualEditable';
import { CONTACT_PAGE_PATH } from '../lib/contactCta';
import type { NavItem } from '../types';
import { isInternalNavigationHref, normalizeNavigationMenu } from '../lib/siteNavigation';
import { defaultPortfolioItems } from '../data';
import { getAllBlogPosts } from '../lib/blogService';
import { formatR2ImageUrl } from '../lib/r2Media';

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isDarkBg, setIsDarkBg] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | number | null>(null);
  const { content, isLiveEditing } = useCMS();
  const { isAdminOrEditor } = useAuth();

  const [recentProject, setRecentProject] = useState<any>(null);
  const [recentPost, setRecentPost] = useState<any>(null);

  useEffect(() => {
    // 1. Get recent case study
    const projects = Array.isArray(content.portfolio_items) ? content.portfolio_items : defaultPortfolioItems;
    const publishedProjects = projects.filter((p: any) => p.status === 'published' || !p.status);
    if (publishedProjects.length > 0) {
      setRecentProject(publishedProjects[0]);
    } else if (defaultPortfolioItems.length > 0) {
      setRecentProject(defaultPortfolioItems[0]);
    }

    // 2. Get recent blog post
    getAllBlogPosts().then((posts) => {
      if (posts && posts.length > 0) {
        const publishedPosts = posts.filter((p: any) => p.status === 'published' || !p.status);
        if (publishedPosts.length > 0) {
          setRecentPost(publishedPosts[0]);
        } else {
          setRecentPost(posts[0]);
        }
      }
    }).catch(err => {
      console.warn('Failed to load blog posts for header highlight:', err);
    });
  }, [content.portfolio_items?.length]);

  const headerData = content.header || {};
  const taglineLine1 = headerData.taglineLine1 || 'Where Design & Technology';
  const taglineLine2 = headerData.taglineLine2 || 'Meet Business Impact';
  const buttonText = headerData.buttonText || 'Get in Touch';
  const items = normalizeNavigationMenu(Array.isArray(headerData.navItems) && headerData.navItems.length > 0 ? headerData.navItems : defaultNavItems);

  const MenuLink = ({ item, className, children, onClick }: { key?: string | number; item: NavItem; className: string; children: ReactNode; onClick?: () => void }) => {
    const href = item.href || '/';
    if (isInternalNavigationHref(href) && item.target !== '_blank') {
      return <Link to={href} className={className} onClick={onClick}>{children}</Link>;
    }
    return <a href={href} target={item.target || '_self'} rel={item.target === '_blank' ? 'noopener noreferrer' : undefined} className={className} onClick={onClick}>{children}</a>;
  };

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const detectTheme = () => {
      const headerEl = document.getElementById('main-header');
      if (!headerEl) return;

      const rect = headerEl.getBoundingClientRect();
      const sampleY = rect.top + rect.height / 2;
      const sampleX1 = window.innerWidth * 0.2;
      const sampleX2 = window.innerWidth * 0.5;
      const sampleX3 = window.innerWidth * 0.8;

      const elements = [
        ...document.elementsFromPoint(sampleX1, sampleY),
        ...document.elementsFromPoint(sampleX2, sampleY),
        ...document.elementsFromPoint(sampleX3, sampleY),
      ];

      let foundDark = false;

      for (const el of elements) {
        if (headerEl.contains(el) || el === headerEl) continue;

        let curr: HTMLElement | null = el as HTMLElement;
        let depth = 0;

        while (curr && depth < 6 && curr !== document.body && curr !== document.documentElement) {
          const className = (curr.className && typeof curr.className === 'string') ? curr.className : '';
          
          // Check explicit dark class names
          const isDarkClass = /\b(bg-slate-950|bg-slate-900|bg-slate-800|bg-black|bg-\[\#000080\]|bg-\[\#000066\]|bg-\[\#0b0f19\]|bg-\[\#0B0F19\]|bg-gray-900|bg-gray-950|bg-zinc-900|bg-zinc-950)\b/.test(className);
          
          if (isDarkClass || curr.getAttribute('data-header-theme') === 'dark' || curr.getAttribute('data-theme') === 'dark') {
            foundDark = true;
            break;
          }

          if (curr.getAttribute('data-header-theme') === 'light' || curr.getAttribute('data-theme') === 'light') {
            foundDark = false;
            break;
          }

          // Check computed background color
          const computedBg = window.getComputedStyle(curr).backgroundColor;
          if (computedBg && computedBg !== 'rgba(0, 0, 0, 0)' && computedBg !== 'transparent') {
            const rgbMatch = computedBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (rgbMatch) {
              const r = parseInt(rgbMatch[1], 10);
              const g = parseInt(rgbMatch[2], 10);
              const b = parseInt(rgbMatch[3], 10);
              const brightness = (r * 299 + g * 587 + b * 114) / 1000;
              if (brightness < 140) {
                foundDark = true;
                break;
              } else if (brightness >= 140) {
                foundDark = false;
                break;
              }
            }
          }

          curr = curr.parentElement;
          depth++;
        }

        if (foundDark) break;
      }

      setIsDarkBg(foundDark);
    };

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsScrolled(currentScrollY > 20);
      
      if (currentScrollY > lastScrollY && currentScrollY > 150) {
        setIsVisible(false);
        setOpenMenuId(null);
      } else {
        setIsVisible(true);
      }
      
      lastScrollY = currentScrollY;
      detectTheme();
    };

    detectTheme();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', detectTheme, { passive: true });

    const timeout = setTimeout(detectTheme, 150);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', detectTheme);
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.header-nav-container')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header
      id="main-header"
      className={cn(
        'fixed left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-[1400px] transition-all duration-500',
        isScrolled ? 'top-2' : 'top-6',
        !isVisible && '-translate-y-[150%] opacity-0'
      )}
    >
      <div 
        className={cn(
          "px-6 py-3 flex items-center justify-between rounded-2xl transition-all duration-500 border shadow-2xl",
          isDarkBg 
            ? "bg-slate-950/85 backdrop-blur-xl border-slate-800/90 text-white shadow-slate-950/60" 
            : "bg-white/85 backdrop-blur-xl border-slate-300/80 text-slate-900 shadow-slate-200/50"
        )}
      >
        <div className="flex items-center gap-10">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-4"
          >
            {isAdminOrEditor && isLiveEditing ? (
              <VisualEditable
                section="theme"
                field="logoUrl"
                value={content.theme?.logoUrl || ''}
                label="Header & Footer Logo"
                type="image"
                isLiveEditing={true}
              >
                <div className="flex items-center h-10 w-auto">
                  <Logo light={isDarkBg} className="h-10 w-auto" />
                </div>
              </VisualEditable>
            ) : (
              <Link to="/" className="flex items-center">
                <Logo light={isDarkBg} className="h-10 w-auto" />
              </Link>
            )}
            
            <div className="hidden lg:flex items-center gap-4">
              <div className={cn("h-8 w-[1px] transition-colors duration-300", isDarkBg ? "bg-white/20" : "bg-slate-300")} />
              <div className={cn("flex flex-col leading-snug transition-colors duration-300", isDarkBg ? "text-slate-200" : "text-slate-900/90")}>
                <VisualEditable
                  section="header"
                  field="taglineLine1"
                  value={taglineLine1}
                  label="Tagline Line 1"
                  isLiveEditing={isAdminOrEditor && isLiveEditing}
                >
                  <span className="block min-w-[120px] text-xs font-medium">{taglineLine1}</span>
                </VisualEditable>
                <VisualEditable
                  section="header"
                  field="taglineLine2"
                  value={taglineLine2}
                  label="Tagline Line 2"
                  isLiveEditing={isAdminOrEditor && isLiveEditing}
                >
                  <span className="block min-w-[120px] text-xs font-medium">{taglineLine2}</span>
                </VisualEditable>
              </div>
            </div>
          </motion.div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8 pl-4 header-nav-container">
            {items.map((item: any, idx: number) => {
              const itemId = item.id || item.label || idx;
              const hasSubItems = (item.children && item.children.length > 0) || (item.megaColumns && item.megaColumns.length > 0);
              const isMega = item.isMegaMenu || (item.megaColumns && item.megaColumns.length > 0);
              const isOpen = openMenuId === itemId;
              const displayBadge = item.badge && item.badge.toUpperCase() !== 'MEGA' ? item.badge : null;

              return (
                <div key={itemId} className="relative group py-2">
                  {hasSubItems ? <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenMenuId(prev => (prev === itemId ? null : itemId))}
                    className={cn("flex cursor-pointer items-center gap-1.5 text-[15px] font-medium transition-colors", isDarkBg ? "text-slate-100 hover:text-white" : "text-slate-900/90 hover:text-slate-950")}
                  >
                    <span>{item.label}</span>
                    {displayBadge && (
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-bold border transition-colors",
                        isDarkBg 
                          ? "bg-teal-500/20 text-teal-300 border-teal-400/30" 
                          : "bg-[#000080]/15 text-[#000066] border-[#000080]/30"
                      )}>
                        {displayBadge}
                      </span>
                    )}
                    {hasSubItems && (
                      <ChevronDown className={cn(
                        "w-4 h-4 transition-transform duration-200",
                        isOpen ? (isDarkBg ? "rotate-180 text-teal-400 opacity-100" : "rotate-180 text-[#000080] opacity-100") : "opacity-60 group-hover:rotate-180"
                      )} />
                    )}
                  </button> : <MenuLink item={item} className={cn("flex items-center gap-1.5 text-[15px] font-medium transition-colors", isDarkBg ? "text-slate-100 hover:text-white" : "text-slate-900/90 hover:text-slate-950")} onClick={() => setOpenMenuId(null)}><span>{item.label}</span>{displayBadge && <span className="rounded-full border border-[#000080]/30 bg-[#000080]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#000080]">{displayBadge}</span>}</MenuLink>}

                  {/* Mega Menu Dropdown */}
                  {isMega && hasSubItems && (
                    <div className={cn(
                      "fixed left-1/2 -translate-x-1/2 top-20 grid grid-cols-12 gap-6 backdrop-blur-2xl rounded-3xl p-6 w-[94vw] max-w-5xl shadow-2xl z-50 mt-2 text-left transition-all duration-200 border",
                      "max-h-[calc(100vh-110px)] overflow-y-auto scrollbar-thin",
                      isDarkBg 
                        ? "bg-slate-900/98 border-slate-800 text-white shadow-black/80" 
                        : "bg-white/98 border-slate-200/90 text-slate-900 shadow-[0_20px_50px_rgba(0,0,0,0.12)]",
                      isOpen ? "grid opacity-100 pointer-events-auto" : "hidden group-hover:grid"
                    )}>
                      {/* Mega Columns */}
                      <div className="col-span-8 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        {(item.megaColumns && item.megaColumns.length > 0 ? item.megaColumns : [
                          { title: 'Featured Links', items: item.children.slice(0, Math.ceil(item.children.length / 2)) },
                          { title: 'Explore More', items: item.children.slice(Math.ceil(item.children.length / 2)) }
                        ]).map((col: any, colIdx: number) => (
                          <div key={colIdx} className="space-y-3">
                            <h5 className={cn(
                              "text-[11px] font-bold uppercase tracking-wider pb-1.5 border-b flex items-center justify-between",
                              isDarkBg ? "text-teal-400 border-slate-800" : "text-[#000080] border-slate-200"
                            )}>
                              <span>{col.title || 'Category'}</span>
                              <span className="text-[9px] font-normal text-slate-400">Curated</span>
                            </h5>
                            <div className="space-y-1.5">
                              {col.items && col.items.map((sub: any, sIdx: number) => (
                                <MenuLink
                                  item={sub}
                                  key={sub.id || sIdx}
                                  onClick={() => setOpenMenuId(null)}
                                  className={cn(
                                    "group/link block p-2.5 rounded-xl transition-all duration-200 border border-transparent",
                                    isDarkBg 
                                      ? "hover:bg-slate-800/80 hover:border-slate-700/60" 
                                      : "hover:bg-slate-100/70 hover:border-slate-200/60"
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="space-y-0.5">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={cn(
                                          "text-xs font-bold transition-colors line-clamp-1",
                                          isDarkBg ? "text-slate-100 group-hover/link:text-teal-300" : "text-slate-900 group-hover/link:text-[#000080]"
                                        )}>
                                          {sub.label}
                                        </span>
                                        {sub.badge && (
                                          <span className={cn(
                                            "text-[9px] px-1.5 py-0.5 rounded-full font-bold tracking-wide uppercase shrink-0",
                                            isDarkBg ? "bg-teal-500/20 text-teal-300 border border-teal-400/30" : "bg-[#000080]/10 text-[#000080] border border-[#000080]/20"
                                          )}>
                                            {sub.badge}
                                          </span>
                                        )}
                                      </div>
                                      {sub.description && (
                                        <p className={cn("text-[11px] leading-relaxed line-clamp-1", isDarkBg ? "text-slate-400" : "text-slate-500")}>
                                          {sub.description}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </MenuLink>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Mega Menu Callout Feature Banner - Dynamic Conversion Column */}
                      <div className={cn(
                        "col-span-4 flex flex-col gap-4 border-l pl-5",
                        isDarkBg ? "border-slate-800" : "border-slate-200/80"
                      )}>
                        <div className="space-y-3.5">
                          <span className={cn(
                            "inline-block text-[9px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded",
                            isDarkBg ? "bg-teal-500/10 text-teal-300 border border-teal-500/20" : "bg-slate-100 text-slate-600 border border-slate-200"
                          )}>
                            Featured Highlights
                          </span>

                          {/* Recent Case Study Section */}
                          {recentProject && (
                            <Link 
                              to={`/portfolio`}
                              onClick={() => setOpenMenuId(null)}
                              className={cn(
                                "group/feat block p-2 rounded-xl transition-all duration-200 border border-transparent",
                                isDarkBg ? "hover:bg-slate-800/50" : "hover:bg-slate-50"
                              )}
                            >
                              <div className="text-[10px] font-bold text-[#000080] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#000080]" />
                                Recent Case Study
                              </div>
                              <div className="flex gap-3 items-center">
                                <img 
                                  src={formatR2ImageUrl(recentProject.coverImage)} 
                                  alt={recentProject.title}
                                  referrerPolicy="no-referrer"
                                  className="w-16 h-12 rounded-lg object-cover bg-slate-100 shrink-0 border border-slate-200/80 shadow-sm"
                                />
                                <div className="space-y-0.5 min-w-0">
                                  <h6 className={cn(
                                    "text-xs font-bold leading-snug line-clamp-1 transition-colors",
                                    isDarkBg ? "text-slate-100 group-hover/feat:text-teal-300" : "text-slate-900 group-hover/feat:text-[#000080]"
                                  )}>
                                    {recentProject.title}
                                  </h6>
                                  <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">
                                    {recentProject.category || 'Digital Experience'}
                                  </span>
                                </div>
                              </div>
                            </Link>
                          )}

                          {/* Recent Blog Post Section */}
                          {recentPost && (
                            <Link 
                              to={`/blog/${recentPost.slug}`}
                              onClick={() => setOpenMenuId(null)}
                              className={cn(
                                "group/feat block p-2 rounded-xl transition-all duration-200 border border-transparent",
                                isDarkBg ? "hover:bg-slate-800/50" : "hover:bg-slate-50"
                              )}
                            >
                              <div className="text-[10px] font-bold text-teal-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                                Recent Blog Post
                              </div>
                              <div className="flex gap-3 items-center">
                                <img 
                                  src={formatR2ImageUrl(recentPost.featuredImage || recentPost.coverImage)} 
                                  alt={recentPost.title}
                                  referrerPolicy="no-referrer"
                                  className="w-16 h-12 rounded-lg object-cover bg-slate-100 shrink-0 border border-slate-200/80 shadow-sm"
                                />
                                <div className="space-y-0.5 min-w-0">
                                  <h6 className={cn(
                                    "text-xs font-bold leading-snug line-clamp-1 transition-colors",
                                    isDarkBg ? "text-slate-100 group-hover/feat:text-teal-300" : "text-slate-900 group-hover/feat:text-teal-600"
                                  )}>
                                    {recentPost.title}
                                  </h6>
                                  <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">
                                    {recentPost.category || 'Insights'}
                                  </span>
                                </div>
                              </div>
                            </Link>
                          )}
                        </div>

                        {/* Conversion Action Footer */}
                        <div className={cn(
                          "mt-auto pt-3 border-t",
                          isDarkBg ? "border-slate-800" : "border-slate-200/80"
                        )}>
                          <Link 
                            to="/contact-us"
                            onClick={() => setOpenMenuId(null)}
                            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-[#000066] hover:scale-[1.01]"
                          >
                            <span>Speak with a digital advisor</span>
                            <span>→</span>
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Standard Dropdown Menu */}
                  {!isMega && item.children && item.children.length > 0 && (
                    <div className={cn(
                      "absolute top-full left-0 flex-col backdrop-blur-md border rounded-xl py-2 min-w-[220px] shadow-2xl z-50 mt-1 transition-all duration-200",
                      isDarkBg 
                        ? "bg-slate-900/95 border-slate-800 text-white" 
                        : "bg-white/95 border-slate-200 text-slate-800",
                      isOpen ? "flex opacity-100 pointer-events-auto" : "hidden group-hover:flex"
                    )}>
                      {item.children.map((child: any, cIdx: number) => (
                        <MenuLink
                          item={child}
                          key={child.id || child.label || cIdx}
                          onClick={() => setOpenMenuId(null)}
                          className={cn(
                            "px-4 py-2.5 text-sm transition-colors flex items-center justify-between",
                            isDarkBg ? "text-slate-200 hover:text-teal-300 hover:bg-slate-800/80" : "text-slate-700 hover:text-[#000080] hover:bg-slate-100/80"
                          )}
                        >
                          <div>
                            <span className="block font-medium">{child.label}</span>
                            {child.description && (
                              <span className={cn("block text-xs", isDarkBg ? "text-slate-400" : "text-slate-500")}>
                                {child.description}
                              </span>
                            )}
                          </div>
                          {child.badge && (
                            <span className={cn(
                              "border px-1.5 py-0.5 text-[11px] rounded font-bold",
                              isDarkBg ? "bg-teal-500/20 text-teal-300 border-teal-400/30" : "bg-[#000080]/10 text-[#000080] border-[#000080]/20"
                            )}>
                              {child.badge}
                            </span>
                          )}
                        </MenuLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {content.pages && content.pages.filter((p: any) => p.published).map((page: any) => (
              <Link
                key={page.id}
                to={getPagePath(page)}
                className={cn(
                  "text-[15px] font-medium transition-colors",
                  isDarkBg ? "text-teal-300 hover:text-white" : "text-[#000080] hover:text-slate-900"
                )}
              >
                {page.title}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {isAdminOrEditor && (
            <Link 
              to="/admin" 
              className={cn(
                "inline-flex items-center text-[14px] font-bold px-5 py-2.5 rounded-lg transition-all shadow-sm hover:shadow",
                isDarkBg 
                  ? "bg-teal-500 hover:bg-teal-400 text-slate-950" 
                  : "bg-[#000080] hover:bg-[#000066] text-white"
              )}
            >
              CMS Admin
            </Link>
          )}
          <Link to={CONTACT_PAGE_PATH} className={cn(
            "inline-flex min-h-11 items-center text-sm font-bold px-5 sm:px-7 py-2.5 rounded-lg transition-all shadow-sm hover:shadow",
            isDarkBg 
              ? "bg-white text-slate-950 hover:bg-slate-100" 
              : "bg-slate-900 text-white hover:bg-slate-800"
          )}>
            {buttonText}
          </Link>
          
          <button
            className={cn("lg:hidden ml-2 p-2 transition-colors", isDarkBg ? "text-white" : "text-slate-900")}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              "lg:hidden mt-4 rounded-2xl border overflow-hidden shadow-xl transition-all duration-300",
              isDarkBg ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-100 text-slate-900"
            )}
          >
            <div className="px-6 py-6 flex flex-col gap-6">
              {items.map((item: any) => {
                const mobileChildren = item.children?.length ? item.children : item.megaColumns?.flatMap((column: any) => column.items || []) || [];
                return (
                <div key={item.label} className="flex flex-col gap-4">
                  <MenuLink
                    item={item}
                    className={cn("text-[16px] font-semibold transition-colors", isDarkBg ? "text-white" : "text-slate-900")}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.label}
                  </MenuLink>
                  {mobileChildren.length > 0 && (
                    <div className="pl-4 flex flex-col gap-3">
                      {mobileChildren.map((child: any) => (
                        <MenuLink
                          item={child}
                          key={child.label}
                          className={cn("text-[15px] transition-colors", isDarkBg ? "text-slate-300" : "text-slate-600")}
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          {child.label}
                        </MenuLink>
                      ))}
                    </div>
                  )}
                </div>
              )})}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
