import React from 'react';
import { useCMS } from '../lib/CMSProvider';
import { formatR2ImageUrl } from '../lib/r2Media';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { DynamicSection } from '../types';
import VisualEditable from './admin/VisualEditable';
import { Quote, Sparkles, CheckCircle2, ChevronDown, MessageSquare, Award, ArrowUpRight, Play, Users, DollarSign, Image as ImageIcon, Zap, Check } from 'lucide-react';

export interface DynamicSectionRendererProps {
  key?: React.Key;
  section: DynamicSection;
  isLiveEditing?: boolean;
}

export default function DynamicSectionRenderer({ section, isLiveEditing }: DynamicSectionRendererProps) {
  const { content } = useCMS();
  const portfolioItems = (content.portfolio_items || []).filter((i: any) => i.status !== 'draft').slice(0, 3);

  if (!section.enabled) return null;

  const paddingClass = section.padding === 'compact' ? 'py-12' : section.padding === 'spacious' ? 'py-32' : 'py-24';

  return (
    <section 
      className={`${paddingClass} relative overflow-hidden transition-colors ${
        section.bgType === 'dark' 
          ? 'bg-white text-slate-900' 
          : section.bgType === 'accent' 
            ? 'bg-gradient-to-br from-[#000080] to-teal-700 text-slate-900' 
            : 'bg-slate-50 text-slate-900 border-y border-slate-200/60'
      }`}
    >
      <div className="max-w-[1400px] mx-auto px-6 relative z-10 space-y-12">
        {/* Section Header */}
        {(section.title || section.subtitle || section.badge) && (
          <div className="max-w-3xl space-y-3">
            {section.badge && (
              <span className="inline-block text-xs font-bold text-[#000080] uppercase tracking-widest bg-[#000080]/10 border border-[#000080]/20 px-3 py-1 rounded-full">
                <VisualEditable section="dynamicSections" field="badge" value={section.badge} label="Badge" isLiveEditing={isLiveEditing}>
                  {section.badge}
                </VisualEditable>
              </span>
            )}

            {section.title && (
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                <VisualEditable section="dynamicSections" field="title" value={section.title} label="Section Title" isLiveEditing={isLiveEditing}>
                  {section.title}
                </VisualEditable>
              </h2>
            )}

            {section.subtitle && (
              <p className="text-lg opacity-80 leading-relaxed font-normal">
                <VisualEditable section="dynamicSections" field="subtitle" value={section.subtitle} label="Section Subtitle" type="textarea" isLiveEditing={isLiveEditing}>
                  {section.subtitle}
                </VisualEditable>
              </p>
            )}
          </div>
        )}

        {/* Testimonials Module */}
        {section.type === 'testimonials' && (
          <div className="grid md:grid-cols-2 gap-8">
            {((content.feedback_submissions || []) as any[])
              .filter(fb => fb.showOnWebsite !== false && fb.status === 'resolved')
              .map((fb, idx) => (
                <motion.div
                  key={fb.id || idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className={`p-8 rounded-3xl border relative space-y-6 ${
                    section.bgType === 'dark' ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200 shadow-xl'
                  }`}
                >
                  <Quote className="w-10 h-10 text-[#000080]/20 absolute top-6 right-6" />
                  <p className="text-lg italic leading-relaxed font-serif text-slate-700">
                    "{fb.comment}"
                  </p>
                  <div className="flex items-center gap-4 pt-4 border-t border-slate-200/50">
                    {fb.image ? (
                      <img src={fb.image} alt={fb.customerName} className="w-12 h-12 rounded-full object-cover border-2 border-[#000080]" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[#000080]/10 flex items-center justify-center font-bold text-[#000080] text-lg uppercase">
                        {fb.customerName?.charAt(0) || 'U'}
                      </div>
                    )}
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">{fb.customerName}</h4>
                      {fb.position && <p className="text-xs text-slate-600">{fb.position}</p>}
                    </div>
                  </div>
                </motion.div>
              ))}
            
            {/* Fallback to static items if no feedbacks exist */}
            {!((content.feedback_submissions || []) as any[]).some(fb => fb.showOnWebsite !== false && fb.status === 'resolved') && section.items && section.items.map((item, idx) => (
              <motion.div
                key={item.id || idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className={`p-8 rounded-3xl border relative space-y-6 ${
                  section.bgType === 'dark' ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200 shadow-xl'
                }`}
              >
                <Quote className="w-10 h-10 text-[#000080]/20 absolute top-6 right-6" />
                <p className="text-lg italic leading-relaxed font-serif text-slate-700">
                  "{item.description}"
                </p>
                <div className="flex items-center gap-4 pt-4 border-t border-slate-200/50">
                  {item.image ? (
                    <img src={item.image} alt={item.title} className="w-12 h-12 rounded-full object-cover border-2 border-[#000080]" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[#000080]/10 flex items-center justify-center font-bold text-[#000080] text-lg uppercase">
                      {item.title?.charAt(0) || 'U'}
                    </div>
                  )}
                  <div>
                    <h4 className="font-bold text-slate-900 text-base">{item.title}</h4>
                    {item.subtitle && <p className="text-xs text-slate-600">{item.subtitle}</p>}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* FAQ Accordion Module */}
        {section.type === 'faq' && section.items && (
          <div className="max-w-4xl space-y-4">
            {section.items.map((item, idx) => (
              <details
                key={item.id || idx}
                className="group bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm cursor-pointer [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex items-center justify-between font-bold text-slate-900 text-lg">
                  <span>{item.title}</span>
                  <ChevronDown className="w-5 h-5 text-slate-600 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-4 text-slate-600 text-base leading-relaxed border-t border-slate-100 pt-4">
                  {item.description}
                </p>
              </details>
            ))}
          </div>
        )}

        {/* Features Module */}
        {section.type === 'features' && section.items && (
          <div className="grid md:grid-cols-3 gap-6">
            {section.items.map((item, idx) => (
              <div key={item.id || idx} className="bg-white p-8 rounded-2xl border border-slate-200/80 space-y-4 shadow-sm">
                <div className="w-12 h-12 bg-slate-50 text-[#000080] rounded-xl flex items-center justify-center">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-900 text-xl">{item.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* Pricing Tables Module */}
        {section.type === 'pricing' && section.items && (
          <div className="grid md:grid-cols-3 gap-8">
            {section.items.map((plan, idx) => (
              <div 
                key={plan.id || idx} 
                className={`p-8 rounded-3xl border transition-all flex flex-col justify-between ${
                  plan.popular 
                    ? 'bg-white text-slate-900 border-[#000080] shadow-2xl ring-2 ring-[#000080]/50 scale-105' 
                    : 'bg-white text-slate-900 border-slate-200 shadow-lg'
                }`}
              >
                <div className="space-y-6">
                  {plan.badge && (
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-[#000080] text-white px-3 py-1 rounded-full">
                      {plan.badge}
                    </span>
                  )}
                  <h3 className="text-2xl font-bold">{plan.title}</h3>
                  <p className="text-sm opacity-80 leading-relaxed">{plan.description}</p>
                  
                  <div className="flex items-baseline gap-1 pt-4 border-t border-slate-200/20">
                    <span className="text-4xl font-extrabold">{plan.price || '$99'}</span>
                    <span className="text-sm opacity-70">/{plan.period || 'month'}</span>
                  </div>

                  <ul className="space-y-3 pt-4 text-sm">
                    {(plan.features || ['Full CMS access', 'Unlimited pages', 'Supabase Database', '24/7 Support']).map((feat, fIdx) => (
                      <li key={fIdx} className="flex items-center gap-2.5">
                        <Check className="w-4 h-4 text-[#000080] shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button className={`mt-8 w-full py-4 rounded-xl font-bold text-sm transition-all ${
                  plan.popular ? 'bg-[#000080] text-white hover:bg-[#000066] shadow-xl' : 'bg-white text-slate-900 hover:bg-slate-100'
                }`}>
                  {plan.linkText || 'Select Plan'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Team Members Module */}
        {section.type === 'team' && section.items && (
          <div className="grid md:grid-cols-4 gap-6">
            {section.items.map((member, idx) => (
              <div key={member.id || idx} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm text-center">
                <img 
                  src={member.image || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600'} 
                  alt={member.title} 
                  className="w-24 h-24 rounded-full mx-auto object-cover border-2 border-[#000080] shadow-md"
                />
                <div>
                  <h4 className="font-bold text-slate-900 text-lg">{member.title}</h4>
                  <p className="text-xs text-[#000080] font-medium uppercase tracking-wider">{member.role || member.subtitle || 'Senior Specialist'}</p>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{member.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* Counter Module */}
        {section.type === 'counter' && section.items && (
          <div className="grid md:grid-cols-4 gap-8">
            {section.items.map((item, idx) => (
              <div key={item.id || idx} className="bg-white/80 backdrop-blur-md p-8 rounded-3xl border border-slate-200 text-center space-y-2 shadow-sm">
                <div className="text-4xl md:text-5xl font-black text-[#000080] tracking-tight">
                  {item.statNumber || item.title || '99%'}
                </div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{item.statLabel || item.subtitle || 'Client Satisfaction'}</p>
              </div>
            ))}
          </div>
        )}

        {/* Gallery Grid Module */}
        
        {section.type === 'portfolio' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {portfolioItems.map((item: any) => (
              <div key={item.id} className="group relative bg-white rounded-3xl overflow-hidden border border-slate-200 hover:border-[#000080]/30 transition-all hover:shadow-2xl flex flex-col">
                <Link to={`/portfolio/${item.slug}`} className="block relative h-48 overflow-hidden bg-slate-100">
                  {item.coverImage ? (
                    <img 
                      src={formatR2ImageUrl(item.coverImage)} 
                      alt={item.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                      <ImageIcon className="w-8 h-8" />
                    </div>
                  )}
                  <div className="absolute top-4 left-4">
                    <span className="bg-white/90 backdrop-blur text-slate-900 text-[10px] font-bold px-2 py-1 rounded-full shadow uppercase tracking-wider">
                      {item.category}
                    </span>
                  </div>
                </Link>
                <div className="p-6 flex flex-col flex-grow">
                  <div className="text-[#000080] font-bold text-[10px] uppercase tracking-wider mb-2">{item.client}</div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-[#000080] transition-colors">
                    <Link to={`/portfolio/${item.slug}`}>{item.title}</Link>
                  </h3>
                  <p className="text-slate-600 text-sm line-clamp-2 mb-4 flex-grow">{item.shortDescription}</p>
                  <Link to={`/portfolio/${item.slug}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900 group-hover:text-[#000080] mt-auto">
                    View Case Study <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
            {portfolioItems.length === 0 && (
              <div className="col-span-3 text-center py-12 text-slate-500 bg-white rounded-3xl border border-slate-200 border-dashed">
                <p>No portfolio items published yet.</p>
              </div>
            )}
            {portfolioItems.length > 0 && (
              <div className="col-span-1 md:col-span-3 text-center mt-4">
                <Link to="/portfolio" className="inline-flex items-center gap-2 px-6 py-3 bg-[#000080] text-white rounded-xl font-bold text-sm shadow-lg hover:bg-[#000066] transition-colors">
                  View All Work
                </Link>
              </div>
            )}
          </div>
        )}

        {section.type === 'gallery' && section.items && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {section.items.map((imgItem, idx) => (
              <div key={imgItem.id || idx} className="group relative rounded-2xl overflow-hidden shadow-lg h-64 bg-slate-100">
                <img 
                  src={imgItem.image || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=800'} 
                  alt={imgItem.title} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-white/60 opacity-0 group-hover:opacity-100 transition-opacity p-6 flex flex-col justify-end text-slate-900">
                  <h4 className="font-bold text-lg">{imgItem.title}</h4>
                  <p className="text-xs opacity-80">{imgItem.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Video Module */}
        {section.type === 'video' && (
          <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-slate-200 bg-slate-50 aspect-video flex items-center justify-center max-w-4xl mx-auto">
            <img 
              src={section.bgImage || 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=1600'} 
              alt="Video Preview" 
              className="absolute inset-0 w-full h-full object-cover opacity-60"
            />
            <div className="relative z-10 text-center space-y-4">
              <button className="w-20 h-20 bg-[#000080] hover:bg-[#000066] text-white rounded-full flex items-center justify-center shadow-2xl transition-transform hover:scale-110 mx-auto">
                <Play className="w-8 h-8 fill-white ml-1" />
              </button>
              <h3 className="text-2xl font-bold text-slate-900 drop-shadow-md">{section.title || 'Watch Product Tour Video'}</h3>
            </div>
          </div>
        )}

      </div>
    </section>
  );
}

