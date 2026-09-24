import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCMS } from '../lib/CMSProvider';
import { formatR2ImageUrl } from '../lib/r2Media';
import { motion } from 'motion/react';
import { ArrowUpRight, Image as ImageIcon, Search, FolderKanban, CheckCircle2, X, Globe, Layers } from 'lucide-react';
import CTA from '../components/CTA';
import { defaultPortfolioItems, defaultPortfolioCategories } from '../data';
import { PortfolioItem, PortfolioCategory } from '../types';
import HeroReviewProof from '../components/HeroReviewProof';

export default function PortfolioList() {
  const { content } = useCMS();
  
  const heroData = content.hero || {};
  const trustedLogos = heroData.trustedLogos || [];

  const renderLogo = (item: any) => {
    if (item.type === 'image' && item.image) {
      return (
        <div className="flex items-center justify-center grayscale hover:grayscale-0 opacity-60 hover:opacity-100 transition-all duration-300 shrink-0">
          <img src={item.image} alt={item.name} className="h-6 md:h-8 w-auto object-contain max-w-[100px]" />
        </div>
      );
    }

    if (item.type === 'logo' || item.value === 'BROWN') {
      return (
        <div className="flex items-center gap-2 shrink-0 opacity-70 hover:opacity-100 transition-opacity">
          <div className="w-6 h-6 rounded-full border-2 border-slate-900 flex items-center justify-center">
            <div className="w-3 h-3 border border-slate-900 rotate-45"></div>
          </div>
          <span className="text-slate-900 font-serif text-lg tracking-wide uppercase font-bold">{item.name || item.value}</span>
        </div>
      );
    }
    
    let className = "text-slate-900 shrink-0 opacity-70 hover:opacity-100 transition-all font-extrabold text-lg md:text-xl tracking-tighter uppercase ";
    if (item.style === 'black') className += "font-black";
    else if (item.style === 'italic') className += "font-serif italic";
    else if (item.style === 'bold') className += "font-bold";
    else if (item.style === 'serif') className += "font-serif";

    return <div className={className}>{item.value || item.name}</div>;
  };

  const combinedItems = Array.isArray(content.portfolio_items) ? content.portfolio_items : defaultPortfolioItems;

  const cmsPortfolioItems = useMemo(() => {
    return combinedItems.filter((i: PortfolioItem) => i.status === 'published' || !i.status);
  }, [combinedItems]);

  const allProjects = useMemo(() => {
    return cmsPortfolioItems.map((item: PortfolioItem) => ({
      id: item.id || item.slug,
      slug: item.slug,
      title: item.title,
      client: item.client || item.category || 'Client Partner',
      category: item.category || 'Digital Solution',
      coverImage: item.coverImage || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=800',
      logoText: item.client || 'CASE STUDY',
      shortDescription: item.shortDescription || '',
      websiteUrl: item.websiteUrl
    }));
  }, [cmsPortfolioItems]);

  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Extract categories dynamically from backend database & items
  const dbCategories: PortfolioCategory[] = content.portfolio_categories !== undefined ? content.portfolio_categories : defaultPortfolioCategories;
  const dbCategoryNames: string[] = dbCategories.map(c => c.name);
  
  // Combine defined categories with any categories attached to items
  const itemCategoryNames: string[] = Array.from(new Set(allProjects.map((item) => item.category as string)));
  const combinedCategorySet = new Set<string>([...dbCategoryNames, ...itemCategoryNames]);
  const categoryNames: string[] = Array.from(combinedCategorySet);

  // Compute live item counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: allProjects.length };
    categoryNames.forEach(cat => {
      counts[cat] = allProjects.filter(p => p.category === cat).length;
    });
    return counts;
  }, [allProjects, categoryNames]);

  const categories = ['All', ...categoryNames.filter((c: string) => (categoryCounts[c] || 0) > 0)];

  // Filter projects by both active category and search term
  const filteredProjects = useMemo(() => {
    return allProjects.filter(p => {
      const matchesCategory = activeCategory === 'All' || p.category === activeCategory;
      const matchesSearch = !searchQuery.trim() || 
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.shortDescription.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [allProjects, activeCategory, searchQuery]);

  const businessName = content.siteSettings?.businessName || 'Profox web designer';

  React.useEffect(() => {
    document.title = `Case Studies | ${businessName} - Digital Success Stories`;
    window.scrollTo(0, 0);
  }, [businessName]);

  return (
    <div className="bg-white font-sans text-[#212329] selection:bg-[#000080]/10 selection:text-[#000080] overflow-x-hidden min-h-screen">
      {/* Inline styles for logo marquee and clip-path hover transitions */}
      <style>{`
        @keyframes scroll-logos {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-100%); }
        }
        .animate-scroll-logos {
          animation: scroll-logos 28s linear infinite;
        }
        .case-study-card {
          --card-h: 394px;
          height: var(--card-h);
        }
        @media (max-width: 768px) {
          .case-study-card {
            --card-h: 320px;
          }
        }
        .case-study-img-wrap img {
          clip-path: inset(0% 0 22% 0 round 18px 18px 18px 18px);
          transition: clip-path 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s ease;
        }
        .case-study-card:hover .case-study-img-wrap img {
          clip-path: inset(0% 0 0% 0 round 18px 18px 0px 0px);
          transform: scale(1.03);
        }
        @media (max-width: 768px) {
          .case-study-img-wrap img {
            clip-path: inset(0% 0 0% 0 round 18px 18px 0px 0px) !important;
          }
        }
      `}</style>

      {/* Main Hero / Case Studies Header Section */}
      <section className="pt-32 pb-12 md:pt-40 md:pb-16 bg-white border-b border-slate-100">
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="mb-6 overflow-hidden flex flex-col md:flex-row md:items-end justify-between gap-6">
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: "0%", opacity: 1 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-[#000080] text-xs font-bold uppercase tracking-wider mb-4">
                <FolderKanban className="w-3.5 h-3.5 text-[#000080]" />
                Portfolio Showcase
              </div>
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-normal tracking-tight text-[#212329] mb-2 leading-[1.1]">
                Case Studies
              </h1>
            </motion.div>

            {/* Total Posted Case Studies Metrics Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center gap-5 shadow-sm shrink-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#000080] text-white flex items-center justify-center shadow-md">
                  <FolderKanban className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Total Posted</div>
                  <div className="text-sm font-bold text-slate-900">Case Studies</div>
                </div>
              </div>

              <div className="h-8 w-px bg-slate-200" />

              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-md">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider font-bold">Active</div>
                  <div className="text-sm font-bold text-slate-900">Categories</div>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pt-2">
            <div className="lg:col-span-6">
              <p className="text-slate-600 text-lg md:text-xl font-light leading-relaxed max-w-xl">
                Explore our full portfolio of posted case studies detailing real-world client challenges, custom solutions, and delivered business metrics.
              </p>
              <div className="flex flex-col items-start gap-4 pt-6 sm:flex-row sm:items-center">
                <Link to="/contact-us" className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-1">Start a Conversation <ArrowUpRight className="h-4 w-4" /></Link>
                <HeroReviewProof />
              </div>
            </div>

            <div className="lg:col-span-6 overflow-hidden relative">
              {trustedLogos.length > 0 && (
                <div className="relative flex items-center bg-white overflow-hidden rounded-2xl border border-slate-100 py-3 px-2 shadow-sm min-h-[76px]">
                  {/* Gradient Fades on edges */}
                  <div className="absolute top-0 left-0 bottom-0 w-16 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
                  <div className="absolute top-0 right-0 bottom-0 w-16 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />

                  <div className="flex shrink-0 gap-12 animate-scroll-logos items-center pr-12">
                    {trustedLogos.concat(trustedLogos).concat(trustedLogos).map((logo, idx) => (
                      <React.Fragment key={idx}>
                        {renderLogo(logo)}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Category Filter Tabs & Search Controls */}
      <section className="py-6 bg-slate-50/80 border-b border-slate-200 sticky top-16 z-20 backdrop-blur-md">
        <div className="max-w-[1400px] mx-auto px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Category Filter Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none flex-1">
            {categories.map((cat) => {
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-2 rounded-full text-xs md:text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-2 ${
                    isActive
                      ? 'bg-[#212329] text-white shadow-md'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span>{cat}</span>
                </button>
              );
            })}
          </div>

          {/* Quick Search Input */}
          <div className="relative min-w-[260px] md:min-w-[300px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search case studies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2 bg-white border border-slate-200 rounded-full text-xs md:text-sm focus:border-[#000080] outline-none shadow-sm"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Case Studies Archive Grid Header Status */}
      <section className="py-12 md:py-20 bg-white">
        <div className="max-w-[1400px] mx-auto px-6">
          
          {/* Active Filter Counter Status Line */}
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#000080]/10 text-[#000080] font-bold text-xs uppercase tracking-wider">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {filteredProjects.length} Posted Case {filteredProjects.length === 1 ? 'Study' : 'Studies'}
              </span>
              <span className="text-slate-500 text-sm">
                Showing <strong className="text-slate-900 font-bold">{filteredProjects.length}</strong> of <strong className="text-slate-900 font-bold">{allProjects.length}</strong> total posted projects
                {activeCategory !== 'All' && <span> in <strong className="text-[#000080]">{activeCategory}</strong></span>}
                {searchQuery && <span> matching "<strong className="text-slate-900">{searchQuery}</strong>"</span>}
              </span>
            </div>

            {(activeCategory !== 'All' || searchQuery) && (
              <button
                onClick={() => { setActiveCategory('All'); setSearchQuery(''); }}
                className="text-xs font-bold text-[#000080] hover:underline flex items-center gap-1 cursor-pointer"
              >
                Reset Filters ({allProjects.length} Total)
              </button>
            )}
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredProjects.map((item, idx) => (
              <motion.div
                key={item.id || idx}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: (idx % 3) * 0.1 }}
                className="case-study-card relative w-full rounded-2xl bg-white flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-xl transition-shadow group border border-slate-100 cursor-pointer"
              >
                {/* Full Card Link */}
                <Link to={`/portfolio/${item.slug}`} className="absolute inset-0 z-10" aria-label={item.title} />

                {/* Background Image Container with Clip-Path Transition */}
                <div className="case-study-img-wrap absolute inset-0 z-1 bg-slate-900 rounded-2xl overflow-hidden">
                  <img
                    src={formatR2ImageUrl(item.coverImage)}
                    alt={item.title}
                    className="w-full h-full object-cover object-top opacity-90 group-hover:opacity-100"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200';
                    }}
                  />
                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/30 to-black/80 group-hover:from-black/60 group-hover:via-black/40 group-hover:to-black/90 transition-colors z-2 pointer-events-none" />
                </div>

                {/* Card Top: Client Badge, Item Number Badge, & Category Badge */}
                <div className="relative z-10 p-6 flex items-center justify-between">
                  <div className="bg-black/40 backdrop-blur-md border border-white/10 px-3.5 py-1.5 rounded-lg text-white font-bold text-xs tracking-wider uppercase flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    {item.logoText || item.client}
                  </div>
                  
                  <div>
                    <span className="text-white/90 text-[11px] font-semibold uppercase tracking-widest bg-[#000080]/60 backdrop-blur-sm px-2.5 py-1 rounded">
                      {item.category}
                    </span>
                  </div>
                </div>

                {/* Card Bottom Content & Button */}
                <div className="relative z-20 p-6 mt-auto flex flex-col justify-end">
                  <h3 className="text-white font-medium text-lg md:text-xl leading-snug mb-4 line-clamp-2 drop-shadow-sm group-hover:text-white transition-colors">
                    {item.title}
                  </h3>

                  {/* Dual Action Container */}
                  <div className="flex gap-3 z-30 relative">
                    <Link 
                      to={`/portfolio/${item.slug}`}
                      className="flex-1 h-12 bg-white/15 hover:bg-white/30 backdrop-blur-md rounded-xl px-4 flex items-center justify-between text-white text-xs font-semibold transition-all border border-white/20 group-hover:border-white/40"
                    >
                      <span>Read Case Study</span>
                      <span className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-[#212329] shadow-sm">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </span>
                    </Link>

                    {item.websiteUrl && (
                      <a
                        href={item.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 h-12 bg-white hover:bg-slate-100 text-[#000080] rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all shadow-md group/btn"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Globe className="w-3.5 h-3.5 text-[#000080]" />
                        <span>Visit Website</span>
                      </a>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {filteredProjects.length === 0 && (
            <div className="text-center py-20 bg-slate-50 rounded-2xl border border-slate-200">
              <ImageIcon className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <h3 className="text-lg font-bold text-slate-900 mb-1">No case studies found</h3>
              <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
                No posted case studies match your current search "{searchQuery}" or category filter "{activeCategory}".
              </p>
              <button
                onClick={() => { setActiveCategory('All'); setSearchQuery(''); }}
                className="px-5 py-2.5 bg-[#000080] text-white text-xs font-bold rounded-xl shadow-md hover:bg-[#000066] transition-colors"
              >
                View All {allProjects.length} Posted Case Studies
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Primary CTA Component */}
      <CTA />
    </div>
  );
}

