import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Globe } from 'lucide-react';
import { featuredCaseStudies as defaultFeatured, recentSuccess as defaultRecent, defaultPortfolioItems } from '../data';
import { useCMS } from '../lib/CMSProvider';
import { formatR2ImageUrl } from '../lib/r2Media';
import VisualEditable from './admin/VisualEditable';

interface CaseStudiesProps {
  isLiveEditing?: boolean;
}

export default function CaseStudies({ isLiveEditing = false }: CaseStudiesProps) {
  const { content } = useCMS();
  const caseData = content.caseStudies || {};
  const isEnabled = caseData.enabled !== false;

  const titleLine1 = caseData.titleLine1 || '20+ Years of Helping';
  const titleLine2 = caseData.titleLine2 || 'Businesses Transform';
  
  if (!isEnabled && !isLiveEditing) return null;
  
  const combinedItems = Array.isArray(content.portfolio_items) ? content.portfolio_items : defaultPortfolioItems;

  const portfolioItems = combinedItems.filter((i: any) => i.status === 'published' || !i.status);

  const featured = portfolioItems.slice(0, 2).map((item: any) => ({
    title: item.title,
    client: item.client || item.category,
    image: item.coverImage,
    slug: item.slug,
    websiteUrl: item.websiteUrl
  }));

  const recent = portfolioItems.slice(2, 6).map((item: any) => ({
    title: item.title,
    category: item.client || item.category,
    image: item.coverImage,
    slug: item.slug,
    websiteUrl: item.websiteUrl
  }));


  
  const recentTitle = caseData.recentTitle || 'Recent Success';
  const recentTitleHighlight = caseData.recentTitleHighlight || 'Stories';
  const theme = content.theme || {};

  const primaryColor = theme.primaryColor || '#000080';
  const headingFont = theme.fontFamily || 'Inter';

  return (
    <section className={`py-28 md:py-36 bg-[#11131a] text-white overflow-hidden ${!isEnabled ? 'opacity-50 grayscale' : ''}`}>
      <div className="max-w-[1400px] mx-auto px-6">
        {/* Featured Section */}
        <div className="mb-24">
          <div className="flex items-end justify-between mb-12 border-b border-slate-200 pb-8">
            <div style={{ fontFamily: headingFont }}>
              <motion.h2 initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-4xl md:text-6xl font-normal tracking-[-0.05em] mb-2 text-white/90">
                <VisualEditable section="caseStudies" field="titleLine1" value={titleLine1} label="Title Line 1" isLiveEditing={isLiveEditing}>
                  {titleLine1}
                </VisualEditable>
              </motion.h2>
              <motion.h2 initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="text-4xl md:text-6xl font-bold tracking-[-0.05em] leading-none text-[#7373ff]">
                <VisualEditable section="caseStudies" field="titleLine2" value={titleLine2} label="Title Line 2" isLiveEditing={isLiveEditing}>
                  {titleLine2}
                </VisualEditable>
              </motion.h2>
            </div>
            <Link to="/portfolio" className="flex items-center gap-2 text-sm font-medium hover:opacity-80 transition-opacity mb-2" style={{ color: primaryColor }}>
              View All Case Studies <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {featured.map((study: any, idx: number) => (
              <motion.div
                key={study.title || idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                whileHover={{ y: -8 }}
                className="group relative rounded-[22px] overflow-hidden aspect-[16/10] bg-slate-100"
              >
                <img
                  src={formatR2ImageUrl(study.image)}
                  alt={study.title}
                  className="w-full h-full object-cover opacity-80 transition-transform duration-700 group-hover:scale-105 group-hover:opacity-100"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#212329]/90 via-[#212329]/40 to-transparent pointer-events-none" />
                <div className="absolute inset-x-0 bottom-0 p-8 flex flex-col gap-4">
                  <div className="flex gap-6 items-end">
                    <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center shrink-0 shadow-lg border border-white/20">
                       <span className="text-[#000080] font-black text-2xl tracking-tighter shrink-0">{study.client?.charAt(0) || 'C'}</span>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 flex-1 border border-white/10 group-hover:border-white/30 transition-colors">
                      {study.slug ? (
                          <Link to={`/portfolio/${study.slug}`}>
                            <h3 className="text-lg font-bold text-white group-hover:text-blue-200 transition-colors leading-snug hover:underline">
                              {study.title}
                            </h3>
                          </Link>
                        ) : (
                          <h3 className="text-lg font-bold text-white group-hover:text-blue-200 transition-colors leading-snug">
                            {study.title}
                          </h3>
                        )}
                    </div>
                  </div>
                  {study.websiteUrl && (
                    <div className="flex gap-3 z-30 relative">
                      <Link 
                        to={`/portfolio/${study.slug}`}
                        className="flex-1 h-11 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl px-4 flex items-center justify-between text-white text-xs font-semibold transition-all border border-white/10"
                      >
                        <span>Read Case Study</span>
                        <ArrowUpRight className="w-4 h-4" />
                      </Link>
                      <a
                        href={study.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 h-11 bg-white hover:bg-slate-100 text-[#000080] rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all shadow-md group/btn"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Globe className="w-3.5 h-3.5 text-[#000080]" />
                        <span>Visit Website</span>
                      </a>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Recent Success Section */}
        <div>
          <div className="flex items-end justify-between mb-12 border-b border-white/10 pb-8">
            <h2 className="text-[48px] font-normal tracking-tight text-white/90" style={{ fontFamily: headingFont }}>
              <VisualEditable section="caseStudies" field="recentTitle" value={recentTitle} label="Recent Title" isLiveEditing={isLiveEditing}>
                {recentTitle}
              </VisualEditable>{' '}
              <span style={{ color: primaryColor }} className="font-bold">
                <VisualEditable section="caseStudies" field="recentTitleHighlight" value={recentTitleHighlight} label="Title Highlight" isLiveEditing={isLiveEditing}>
                  {recentTitleHighlight}
                </VisualEditable>
              </span>
            </h2>
            <Link to="/portfolio" className="flex items-center gap-2 text-sm font-medium hover:opacity-80 transition-opacity mb-2" style={{ color: primaryColor }}>
              View All Case Studies <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {recent.map((study: any, idx: number) => (
              <motion.div
                key={study.title || idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="group bg-[#2a2c33] hover:bg-[#000080] rounded-2xl overflow-hidden cursor-pointer transition-all duration-500 border border-white/5 hover:border-white/20 shadow-xl"
              >
                <div className="p-4 flex items-center justify-between border-b border-white/10 group-hover:bg-black/10">
                    <span className="text-white font-bold text-sm tracking-tighter">{study.category}</span>
                </div>
                <div className="relative aspect-video overflow-hidden">
                  <img
                    src={formatR2ImageUrl(study.image)}
                    alt={study.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200';
                    }}
                  />
                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
                </div>
                <div className="p-6 flex-1 flex flex-col justify-between gap-4">
                  <div>
                    <span className="text-[12px] text-white/50 mb-2 block font-bold uppercase tracking-widest">Read Case Study</span>
                    <div className="flex items-start justify-between gap-4">
                      {study.slug ? (
                        <Link to={`/portfolio/${study.slug}`}>
                          <h3 className="text-[15px] font-bold text-white leading-relaxed transition-colors hover:underline">
                            {study.title}
                          </h3>
                        </Link>
                      ) : (
                        <h3 className="text-[15px] font-bold text-white leading-relaxed">
                          {study.title}
                        </h3>
                      )}
                      {study.slug ? (
                        <Link to={`/portfolio/${study.slug}`} className="shrink-0 w-8 h-8 bg-white/10 text-white rounded-lg flex items-center justify-center group-hover:bg-white group-hover:text-[#000080] transition-all duration-300">
                          <ArrowUpRight className="w-4 h-4" />
                        </Link>
                      ) : (
                        <button className="shrink-0 w-8 h-8 bg-white/10 text-white rounded-lg flex items-center justify-center group-hover:bg-white group-hover:text-[#000080] transition-all duration-300">
                          <ArrowUpRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {study.websiteUrl && (
                    <div className="pt-2 border-t border-white/10 group-hover:border-white/20 z-30 relative">
                      <a 
                        href={study.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center gap-1.5 py-2 bg-white/10 hover:bg-white text-white hover:text-[#000080] text-xs font-bold rounded-xl transition-all border border-white/10 hover:border-white"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Globe className="w-3.5 h-3.5" />
                        Visit Website
                      </a>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
