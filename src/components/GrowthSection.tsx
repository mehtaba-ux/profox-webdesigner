import { motion, MotionValue, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { useCMS } from '../lib/CMSProvider';
import VisualEditable from './admin/VisualEditable';

interface GrowthSectionProps {
  isLiveEditing?: boolean;
}

function RevealingWord({ word, index, total, progress }: { key?: string; word: string; index: number; total: number; progress: MotionValue<number> }) {
  const reduceMotion = useReducedMotion();
  const start = 0.12 + (index / Math.max(total, 1)) * 0.68;
  const opacity = useTransform(progress, [start, Math.min(start + 0.1, 0.92)], [0.16, 1]);
  const y = useTransform(progress, [start, Math.min(start + 0.1, 0.92)], [8, 0]);

  return (
    <motion.span
      className="inline-block"
      style={reduceMotion ? { opacity: 1 } : { opacity, y }}
      aria-hidden="true"
    >
      {word}&nbsp;
    </motion.span>
  );
}

function ScrollWordReveal({ text, progress }: { text: string; progress: MotionValue<number> }) {
  const words = text.trim().split(/\s+/);
  return (
    <span className="relative block">
      {words.map((word, index) => (
        <RevealingWord key={`${word}-${index}`} word={word} index={index} total={words.length} progress={progress} />
      ))}
    </span>
  );
}

export default function GrowthSection({ isLiveEditing = false }: GrowthSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });
  const imageY = useTransform(scrollYProgress, [0, 1], ['-8%', '8%']);
  const { content } = useCMS();
  const growthData = content.growth || {};
  const isEnabled = growthData.enabled !== false;

  const headline = growthData.headline || 'We help you grow your business and make customers happy at the same time. We build experiences your customers love and use technology to make your operations effortless.';
  const bgImage = growthData.bgImage || 'https://images.unsplash.com/photo-1600880212340-02d956ea6188?auto=format&fit=crop&q=80&w=2000';
  const awardsTitle = growthData.awardsTitle || 'Awards & Recognition:';
  
  // sole source of truth for awards
  const globalAwards = content.globalAwards || content.growth?.awards || [
    { name: 'CLUTCH 2024', subtext: 'TOP DEVELOPER', type: 'CLUTCH', show: true },
    { name: 'DESIGNRUSH', subtext: '', type: 'TEXT', show: true },
    { name: 'BestDesign', subtext: '', type: 'BORDERED', show: true }
  ];
  const awards = globalAwards.filter((award: any) => award.show !== false);

  if (!isEnabled && !isLiveEditing) return null;

  const renderAward = (award: any, idx: number) => {
    if (award.image) {
      return (
        <div key={idx} className="flex flex-col items-center gap-1.5">
          <img 
            src={award.image} 
            alt={award.name} 
            className="h-10 md:h-12 max-w-[140px] object-contain opacity-90 hover:opacity-100 transition-opacity" 
            referrerPolicy="no-referrer"
          />
          {award.subtext && <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{award.subtext}</span>}
        </div>
      );
    }

    if (award.type === 'CLUTCH') {
      return (
        <div key={idx} className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 border-2 border-[#000066] rounded-full flex items-center justify-center text-[10px] font-bold text-slate-900 text-center p-2 leading-none">
            {award.name}
          </div>
          <span className="text-[10px] font-bold text-slate-900/60 uppercase">{award.subtext}</span>
        </div>
      );
    }
    if (award.type === 'TEXT') {
      return (
        <div key={idx} className="flex flex-col items-center gap-1">
          <div className="text-2xl font-black text-slate-900 italic tracking-tighter uppercase">
            {award.name}
          </div>
          {award.subtext && <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{award.subtext}</span>}
        </div>
      );
    }
    return (
      <div key={idx} className="flex flex-col items-center gap-1">
        <div className="text-xl font-bold text-slate-900 tracking-widest border-y border-slate-300 py-2 uppercase">
          {award.name}
        </div>
        {award.subtext && <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-1">{award.subtext}</span>}
      </div>
    );
  };

  return (
    <section ref={sectionRef} className={`relative py-36 md:py-48 bg-slate-100 overflow-hidden ${!isEnabled ? 'opacity-50 grayscale' : ''}`}>
      <motion.div className="absolute -inset-y-[10%] inset-x-0 z-0" style={{ y: imageY }}>
        <VisualEditable section="growth" field="bgImage" value={bgImage} label="Background Image" type="image" isLiveEditing={isLiveEditing}>
          <img
            src={bgImage}
            alt="People working"
            className="w-full h-full object-cover opacity-60"
          />
        </VisualEditable>
        <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/70 to-white/20" />
      </motion.div>

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="max-w-3xl">
          <h2
            className="text-4xl md:text-6xl font-bold text-slate-950 leading-[1.08] tracking-[-0.045em] mb-20"
          >
            <VisualEditable section="growth" field="headline" value={headline} label="Headline" type="textarea" isLiveEditing={isLiveEditing}>
              {isLiveEditing ? headline : <ScrollWordReveal text={headline} progress={scrollYProgress} />}
            </VisualEditable>
          </h2>

          {content.globalAwardsEnabled !== false && content.growth?.awardsEnabled !== false && (
            <div className="flex flex-col gap-8">
              <p className="text-[12px] font-bold text-slate-900/60 uppercase tracking-widest">
                <VisualEditable section="growth" field="awardsTitle" value={awardsTitle} label="Awards Title" isLiveEditing={isLiveEditing}>
                  {awardsTitle}
                </VisualEditable>
              </p>
              <div className="flex flex-wrap gap-12 items-center opacity-80">
                {awards.map((award: any, idx: number) => renderAward(award, idx))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
