import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useCMS } from '../lib/CMSProvider';
import VisualEditable from './admin/VisualEditable';
import { ChevronDown, HelpCircle } from 'lucide-react';

interface FAQSectionProps {
  isLiveEditing?: boolean;
}

export default function FAQSection({ isLiveEditing = false }: FAQSectionProps) {
  const { content } = useCMS();
  const faqData = content.faq_section || {};
  const isEnabled = faqData.enabled !== false;
  
  const [activeId, setActiveId] = useState<string | null>(null);
  
  const badge = faqData.badge || 'FAQ & SUPPORT';
  const title = faqData.title || 'Frequently Asked Questions';
  const subtitle = faqData.subtitle || 'Everything you need to know about our technology consulting & AI implementation process.';
  const items = Array.isArray(faqData.items) && faqData.items.length > 0 ? faqData.items : [];

  if (!isEnabled && !isLiveEditing) return null;

  return (
    <section className={`py-24 bg-[#F8FAFC] border-y border-slate-200/60 relative overflow-hidden ${!isEnabled ? 'opacity-50 grayscale' : ''}`}>
      <div className="max-w-[1400px] mx-auto px-6 relative z-10">
        <div className="flex flex-col lg:flex-row gap-16">
          {/* Left Column: Info & Search */}
          <div className="lg:w-1/3 space-y-8">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 text-[10px] font-black text-[#000080] uppercase tracking-[0.2em] bg-[#000080]/5 border border-[#000080]/10 px-3 py-1.5 rounded-full">
                <HelpCircle className="w-3 h-3" />
                <VisualEditable section="faq_section" field="badge" value={badge} label="Badge" isLiveEditing={isLiveEditing}>
                  {badge}
                </VisualEditable>
              </span>

              <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 leading-[1.1]">
                <VisualEditable section="faq_section" field="title" value={title} label="Title" isLiveEditing={isLiveEditing}>
                  {title}
                </VisualEditable>
              </h2>

              <p className="text-lg text-slate-500 leading-relaxed font-medium">
                <VisualEditable section="faq_section" field="subtitle" value={subtitle} label="Subtitle" type="textarea" isLiveEditing={isLiveEditing}>
                  {subtitle}
                </VisualEditable>
              </p>
            </div>

            <div className="p-6 bg-[#000080] rounded-3xl text-white space-y-4 shadow-xl shadow-[#000080]/10">
              <h4 className="font-bold text-lg">Still have questions?</h4>
              <p className="text-white/70 text-sm leading-relaxed">
                We're here to help you navigate your digital transformation journey.
              </p>
              <button className="w-full py-3 bg-white text-[#000080] rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-colors border-none cursor-pointer">
                Contact Support
              </button>
            </div>
          </div>

          {/* Right Column: Accordion */}
          <div className="lg:w-2/3">
            <div className="space-y-4">
              {items.map((item: any, idx: number) => {
                const isOpen = activeId === item.id;
                return (
                  <motion.div
                    key={item.id || idx}
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.05 }}
                    className={`group bg-white rounded-3xl border transition-all duration-300 ${
                      isOpen 
                        ? 'border-[#000080] shadow-xl shadow-[#000080]/5' 
                        : 'border-slate-200 hover:border-[#000080]/30 hover:shadow-md'
                    }`}
                  >
                    <button
                      onClick={() => setActiveId(isOpen ? null : item.id)}
                      className="w-full text-left px-8 py-7 flex items-center justify-between bg-transparent border-none cursor-pointer"
                    >
                      <span className={`text-lg font-bold transition-colors ${isOpen ? 'text-[#000080]' : 'text-slate-900'}`}>
                        {item.title}
                      </span>
                      <div className={`p-2 rounded-full transition-all ${isOpen ? 'bg-[#000080] text-white rotate-180' : 'bg-slate-50 text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-600'}`}>
                        <ChevronDown className="w-5 h-5" />
                      </div>
                    </button>
                    
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: 'easeInOut' }}
                          className="overflow-hidden"
                        >
                          <div className="px-8 pb-8 text-slate-500 text-base leading-relaxed font-medium">
                            <div className="pt-6 border-t border-slate-50">
                              {item.description}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
