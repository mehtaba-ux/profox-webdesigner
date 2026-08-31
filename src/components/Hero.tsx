import React, { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useCMS } from '../lib/CMSProvider';
import VisualEditable from './admin/VisualEditable';
import { resolveContactCtaUrl } from '../lib/contactCta';
import Logo from './Logo';
import HeroReviewProof from './HeroReviewProof';

interface HeroProps {
  isLiveEditing?: boolean;
}

export default function Hero({ isLiveEditing = false }: HeroProps) {
  const { content } = useCMS();
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] });
  const imageScale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);
  const imageY = useTransform(scrollYProgress, [0, 1], ['0%', '12%']);
  const contentY = useTransform(scrollYProgress, [0, 1], ['0%', '26%']);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.78], [1, 0]);

  const revealed = true;

  const heroData = content.hero || {};
  const isEnabled = heroData.enabled !== false;
  const headingLine1 = heroData.headingLine1 || 'High-End Custom Webdesign';
  const headingLine2 = heroData.headingLine2 || 'For Scalable Digital Impact';
  const eyebrow = heroData.eyebrow || 'Strategy / Experience / Engineering / Automation';
  const buttonText = heroData.buttonText || 'Speak With a Digital Advisor';
  const buttonLink = heroData.buttonLink || '/contact-us';
  const trustedByTitle = heroData.trustedByTitle || 'Trusted by:';
  const trustedByEnabled = heroData.trustedByEnabled !== false;
  const bgImage = heroData.bgImage || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=70&w=1600&auto=format&fit=crop';
  
  const trustedLogos = heroData.trustedLogos || [];

  if (!isEnabled && !isLiveEditing) return null;

  const theme = content.theme || {};
  const headingFont = theme.fontFamily || 'Inter';
  const buttonRadius = theme.buttonRadius || 'rounded-lg';

  const renderLogo = (item: any) => {
    if (item.type === 'image' && item.image) {
      return (
        <div className="flex items-center justify-center grayscale hover:grayscale-0 opacity-60 hover:opacity-100 transition-all duration-300 shrink-0">
          <img
            src={item.image}
            alt={item.name || item.value || 'Trusted client'}
            width={160}
            height={40}
            loading="lazy"
            decoding="async"
            className="h-7 w-28 object-contain sm:h-8 sm:w-32 md:h-10 md:w-40"
          />
        </div>
      );
    }

    if (item.type === 'logo' || item.value === 'BROWN') {
      return (
        <div className="flex items-center gap-2 drop-shadow-md shrink-0 opacity-70 hover:opacity-100 transition-opacity">
          <div className="w-7 h-7 md:w-8 md:h-8 rounded-full border-2 border-slate-900 flex items-center justify-center">
            <div className="w-4 h-4 border border-slate-900 rotate-45"></div>
          </div>
          <span className="text-slate-900 font-serif text-base md:text-xl tracking-wide">{item.name || item.value}</span>
        </div>
      );
    }
    
    let className = "text-slate-900 drop-shadow-md shrink-0 opacity-70 hover:opacity-100 transition-all ";
    if (item.style === 'black') className += "text-2xl md:text-3xl font-black";
    else if (item.style === 'italic') className += "text-3xl md:text-4xl font-serif italic";
    else if (item.style === 'bold') className += "text-base md:text-xl font-bold tracking-tight";
    else className += "text-xl md:text-2xl font-bold";

    return <div className={className}>{item.value || item.name}</div>;
  };

  return (
    <section ref={sectionRef} className={`relative h-[100svh] min-h-[680px] lg:min-h-[760px] w-full flex items-center overflow-hidden bg-[#eef2ff] ${!isEnabled ? 'opacity-50 grayscale' : ''}`}>
      {/* Background Image */}
      <motion.div
        className="absolute inset-0 z-0"
        initial={false}
        animate={{ opacity: revealed ? 1 : 0, clipPath: revealed ? 'inset(0% 0% 0% 0%)' : 'inset(0% 0% 100% 0%)' }}
        transition={{ duration: reduceMotion ? 0 : 1.15, ease: [0.76, 0, 0.24, 1] }}
        style={{ scale: imageScale, y: imageY }}
      >
        <VisualEditable section="hero" field="bgImage" value={bgImage} label="Background Image" type="image" isLiveEditing={isLiveEditing}>
          <img 
            src={bgImage} 
            alt="Abstract background"
            fetchPriority="high"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </VisualEditable>
        <div className="absolute inset-0 bg-gradient-to-r from-[#f7f8ff]/95 via-[#f7f8ff]/62 to-[#000080]/15" />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-white to-transparent z-10" />
      </motion.div>

      <motion.div className="max-w-[1400px] mx-auto px-6 relative z-20 w-full h-full flex flex-col justify-start pt-[32svh] sm:pt-[30svh] md:pt-[29svh] lg:justify-end lg:pt-0 lg:pb-28" style={{ y: contentY, opacity: contentOpacity }}>
        <div className="max-w-4xl">
          <motion.p initial={false} animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 18 }} transition={{ delay: revealed && !reduceMotion ? 0.25 : 0, duration: 0.65 }} className="mb-4 md:mb-5 text-[10px] md:text-[11px] font-extrabold uppercase tracking-[0.28em] md:tracking-[0.32em] text-[#000080]">
            <VisualEditable section="hero" field="eyebrow" value={eyebrow} label="Hero Eyebrow" isLiveEditing={isLiveEditing}>
              {eyebrow}
            </VisualEditable>
          </motion.p>
          <div className="text-[40px] sm:text-[50px] md:text-[58px] lg:text-[86px] font-bold text-slate-950 leading-[1.02] mb-5 md:mb-7 lg:mb-9 tracking-[-0.055em] pb-[0.12em]" style={{ fontFamily: headingFont }}>
            <motion.h1
              initial={false}
              animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 85, rotate: revealed ? 0 : 1.5 }}
              transition={{ duration: reduceMotion ? 0 : 0.9, delay: revealed && !reduceMotion ? 0.15 : 0, ease: [0.22, 1, 0.36, 1] }}
              className="pb-[0.05em]"
            >
              <VisualEditable section="hero" field="headingLine1" value={headingLine1} label="Heading Line 1" isLiveEditing={isLiveEditing}>
                {headingLine1}
              </VisualEditable>
            </motion.h1>
            <motion.h1
              initial={false}
              animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 85, rotate: revealed ? 0 : 1.5 }}
              transition={{ duration: reduceMotion ? 0 : 0.9, delay: revealed && !reduceMotion ? 0.27 : 0, ease: [0.22, 1, 0.36, 1] }}
              className="text-[#000080] pb-[0.08em]"
            >
              <VisualEditable section="hero" field="headingLine2" value={headingLine2} label="Heading Line 2" isLiveEditing={isLiveEditing}>
                {headingLine2}
              </VisualEditable>
            </motion.h1>
          </div>
          
          <motion.div
            initial={false}
            animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 26 }}
            transition={{ duration: reduceMotion ? 0 : 0.7, delay: revealed && !reduceMotion ? 0.48 : 0, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-start gap-4 lg:flex-row lg:items-center lg:gap-6"
          >
            <VisualEditable section="hero" field="buttonText" value={buttonText} label="Button Label" isLiveEditing={isLiveEditing}>
              <a href={resolveContactCtaUrl(buttonText, buttonLink)} className={`group relative inline-flex min-h-16 items-center gap-7 overflow-hidden border border-[#000080] bg-[#000080] text-white pl-8 pr-2 py-2 ${buttonRadius} font-bold text-[14px] shadow-[0_16px_40px_rgba(0,0,128,0.2)] transition-all duration-300 hover:-translate-y-1 hover:bg-[#090966] hover:shadow-[0_20px_50px_rgba(0,0,128,0.3)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#000080]/25`}>
                <span className="absolute inset-y-0 -left-20 w-14 skew-x-[-20deg] bg-white/15 blur-sm transition-transform duration-700 group-hover:translate-x-[360px]" />
                <span className="relative">{buttonText}</span>
                <span className="relative grid h-12 w-12 place-items-center rounded-[10px] bg-white text-lg text-[#000080] shadow-sm transition-transform duration-300 group-hover:rotate-45">&#8599;</span>
              </a>
            </VisualEditable>

            <HeroReviewProof />
          </motion.div>
        </div>

        {/* Trusted By: flows beneath the CTA on mobile and anchors right on desktop. */}
        {trustedByEnabled && (
          <motion.div 
            initial={false}
            animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 18 }}
            transition={{ duration: 0.6, delay: revealed && !reduceMotion ? 0.62 : 0 }}
            className="relative z-30 mt-6 flex w-full max-w-[560px] flex-col lg:absolute lg:bottom-24 lg:left-auto lg:right-12 lg:mt-0 lg:w-[500px]"
          >
            <p className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.16em] text-slate-900/90 lg:pl-4 lg:text-[13px] lg:normal-case lg:tracking-normal drop-shadow-md">
              <VisualEditable section="hero" field="trustedByTitle" value={trustedByTitle} label="Trusted By Title" isLiveEditing={isLiveEditing}>
                {trustedByTitle}
              </VisualEditable>
            </p>
            {trustedLogos.length > 0 && (
              <div className="relative flex w-full items-center overflow-hidden py-1" style={{ maskImage: 'linear-gradient(to right, transparent 0%, #000 6%, #000 94%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 6%, #000 94%, transparent 100%)' }}>
                <div className="flex min-w-max flex-shrink-0 items-center justify-around gap-8 px-4 md:w-full md:gap-10 animate-scroll-logos">
                  {trustedLogos.map((item: any, idx: number) => (
                    <React.Fragment key={idx}>{renderLogo(item)}</React.Fragment>
                  ))}
                </div>
                <div className="flex min-w-max flex-shrink-0 items-center justify-around gap-8 px-4 md:w-full md:gap-10 animate-scroll-logos">
                  {trustedLogos.map((item: any, idx: number) => (
                    <React.Fragment key={`clone-${idx}`}>{renderLogo(item)}</React.Fragment>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
        <motion.div initial={false} animate={{ opacity: revealed ? 1 : 0 }} transition={{ delay: revealed && !reduceMotion ? 0.85 : 0 }} className="absolute bottom-6 left-6 hidden items-center gap-3 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-700 md:flex">
          <span className="relative h-9 w-px overflow-hidden bg-slate-400"><motion.span className="absolute inset-x-0 top-0 h-1/2 bg-[#000080]" animate={{ y: ['-100%', '200%'] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }} /></span>
          Scroll to explore
        </motion.div>
      </motion.div>
    </section>
  );
}
