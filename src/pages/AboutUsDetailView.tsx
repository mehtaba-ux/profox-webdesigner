import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, MotionValue, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { 
  ArrowLeft, 
  Sparkles, 
  CheckCircle2, 
  Globe, 
  Award, 
  Monitor, 
  Cpu, 
  Zap, 
  Shield, 
  Users, 
  Check, 
  ChevronRight, 
  Edit3, 
  Quote, 
  Clock, 
  Laptop, 
  Code, 
  Layers, 
  ArrowUpRight,
  Eye,
  Compass,
  Briefcase,
  Lightbulb,
  Building2,
  TrendingUp,
  MapPin,
  Bot,
  ArrowRight,
  Star,
  ExternalLink
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useCMS } from '../lib/CMSProvider';
import { useAuth } from '../lib/AuthContext';
import CTA from '../components/CTA';
import HeroReviewProof from '../components/HeroReviewProof';
import { resolveSiteSettings } from '../lib/siteSettings';

interface TimelineEvent {
  year: string;
  title: string;
  description: string;
  badge?: string;
}

const revealTransition = { duration: 0.8, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

function SectionReveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 48 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.18 }} transition={{ ...revealTransition, delay }} className={className}>
      {children}
    </motion.div>
  );
}

type MissionCardData = { title: string; description: string; icon: React.ReactNode };

function TravelingMissionCard({ card, index, progress }: { key?: string; card: MissionCardData; index: number; progress: MotionValue<number> }) {
  const start = 0.04 + index * 0.205;
  const y = useTransform(progress, [start, start + 0.075, start + 0.19, start + 0.32], ['70vh', '17vh', '-12vh', '-72vh']);
  const opacity = useTransform(progress, [start, start + 0.045, start + 0.235, start + 0.31], [0, 1, 1, 0]);
  const scale = useTransform(progress, [start, start + 0.1, start + 0.24], [0.9, 1, 0.96]);
  const left = [30, 65, 35, 68][index] || 50;

  return (
    <motion.article className="absolute top-1/2 w-[230px] rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-[0_22px_60px_rgba(15,23,42,0.16)] backdrop-blur-xl sm:w-[280px] sm:p-6" style={{ left: `${left}%`, x: '-50%', y, opacity, scale }}>
      <div className="mb-5 grid h-10 w-10 place-items-center rounded-full bg-[#000080]/10 text-[#000080]">{card.icon}</div>
      <h3 className="text-base font-extrabold text-slate-950 sm:text-lg">{card.title}</h3>
      <p className="mt-2 text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">{card.description}</p>
    </motion.article>
  );
}

function MissionScrollChapter({ cards, headline = 'We partner with companies to build digital solutions that make business faster, smarter, and more efficient.', scrollLabel = 'Scroll to follow our approach' }: { cards: MissionCardData[]; headline?: string; scrollLabel?: string }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const headlineScale = useTransform(scrollYProgress, [0, 0.48, 1], [0.96, 1, 0.96]);
  const headlineOpacity = useTransform(scrollYProgress, [0, 0.08, 0.92, 1], [0.25, 1, 1, 0.25]);

  return (
    <section ref={ref} id="overview" className="relative h-[520svh] border-b border-slate-200 bg-white md:h-[720svh]">
      <div className="sticky top-0 flex h-[100svh] items-center justify-center overflow-hidden px-6">
        <motion.h2 className="relative z-0 max-w-4xl text-center text-[30px] font-bold leading-[1.08] tracking-[-0.05em] text-slate-950 sm:text-5xl lg:text-6xl" style={{ scale: headlineScale, opacity: headlineOpacity }}>
          {headline}
        </motion.h2>
        <div className="pointer-events-none absolute inset-0 z-10">
          {cards.map((card, index) => <TravelingMissionCard key={card.title} card={card} index={index} progress={scrollYProgress} />)}
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">{scrollLabel}</div>
      </div>
    </section>
  );
}

function RevealingStoryWord({ word, index, total, progress }: { key?: string; word: string; index: number; total: number; progress: MotionValue<number> }) {
  const start = 0.28 + (index / Math.max(total, 1)) * 0.52;
  const color = useTransform(progress, [start, Math.min(start + 0.07, 0.92)], ['rgba(255,255,255,0.28)', 'rgba(255,255,255,1)']);
  return <motion.span aria-hidden className="inline" style={{ color }}>{word}{index < total - 1 ? ' ' : ''}</motion.span>;
}

function StoryScrollChapter({ image, text, eyebrow = 'Our Story', title = 'Technology should empower, never overwhelm.', scrollLabel = 'Continue scrolling' }: { image: string; text: string; eyebrow?: string; title?: string; scrollLabel?: string }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const clipPath = useTransform(scrollYProgress, [0, 0.2], ['inset(19% 10% 19% 10% round 24px)', 'inset(0% 0% 0% 0% round 0px)']);
  const imageScale = useTransform(scrollYProgress, [0, 0.2, 1], [1.08, 1, 1.08]);
  const overlayOpacity = useTransform(scrollYProgress, [0, 0.2, 0.9], [0.35, 0.64, 0.76]);
  const contentOpacity = useTransform(scrollYProgress, [0.18, 0.28, 0.92, 1], [0, 1, 1, 0]);
  const contentY = useTransform(scrollYProgress, [0.22, 0.88], ['16vh', '-10vh']);
  const words = text.trim().split(/\s+/);

  return (
    <section ref={ref} id="story" className="relative h-[540svh] bg-[#17191f] md:h-[760svh]">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <motion.div className="absolute inset-0 overflow-hidden" style={{ clipPath }}>
          <motion.img src={image} alt="ProFox team story" className="h-full w-full object-cover" style={{ scale: imageScale }} />
          <motion.div className="absolute inset-0 bg-[#111318]" style={{ opacity: overlayOpacity }} />
        </motion.div>
        <motion.div className="relative z-10 mx-auto flex h-full max-w-7xl items-center px-6" style={{ opacity: contentOpacity, y: contentY }}>
          <div className="ml-auto w-full max-w-2xl">
            <p className="mb-6 text-[10px] font-black uppercase tracking-[0.3em] text-white/70">{eyebrow}</p>
            <h2 className="mb-8 text-3xl font-extrabold tracking-[-0.045em] text-white sm:text-5xl">{title}</h2>
            <p className="text-xl font-semibold leading-[1.42] sm:text-3xl" aria-label={text}>
              {words.map((word, index) => <RevealingStoryWord key={`${word}-${index}`} word={word} index={index} total={words.length} progress={scrollYProgress} />)}
            </p>
          </div>
        </motion.div>
        <div className="absolute bottom-7 left-6 z-20 text-[9px] font-black uppercase tracking-[0.28em] text-white/50">{scrollLabel}</div>
      </div>
    </section>
  );
}

function GalleryScrollChapter({ images }: { images: string[] }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const rowOneX = useTransform(scrollYProgress, [0, 1], ['-24%', '-68%']);
  const rowTwoX = useTransform(scrollYProgress, [0, 1], ['-66%', '-20%']);
  const repeated = [...images, ...images];
  const row = (x: MotionValue<string>, reverse = false) => (
    <motion.div className="flex min-w-max gap-3 md:gap-5" style={{ x }}>
      {(reverse ? [...repeated].reverse() : repeated).map((image, index) => <div key={`${image}-${index}`} className="h-[24svh] w-[38vw] shrink-0 overflow-hidden rounded-2xl sm:w-[28vw] lg:h-[31svh] lg:w-[19vw]"><img src={image} alt="ProFox team and workplace" className="h-full w-full object-cover transition-transform duration-700 hover:scale-105" /></div>)}
    </motion.div>
  );
  return <section ref={ref} className="relative h-[125svh] border-b border-slate-200 bg-white md:h-[140svh]"><div className="sticky top-0 flex h-[100svh] flex-col justify-center gap-3 overflow-hidden md:gap-5">{row(rowOneX)}{row(rowTwoX, true)}</div></section>;
}

export default function AboutUsDetailView({ page }: { page?: any }) {
  const navigate = useNavigate();
  const { content } = useCMS();
  const siteSettings = resolveSiteSettings(content.siteSettings);
  const { isAdminOrEditor } = useAuth();
  const [activeSubnav, setActiveSubnav] = useState('overview');
  const [activeYear, setActiveYear] = useState<string>('2018');
  const heroRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroContentY = useTransform(heroProgress, [0, 1], [0, 100]);
  const heroOpacity = useTransform(heroProgress, [0, 0.85], [1, 0]);

  // Load blueprint data if present - Priority 1: Exact template ID match
  const blueprints = content.template_blueprints || [];
  const blueprint = blueprints.find((b: any) => b.id === page?.template);
  
  // Use page-specific data if available, otherwise fallback to the specific blueprint's defaults
  const pageData = page?.aboutData || page?.serviceDetailData || {};
  const defaultData = pageData.hero ? pageData : (blueprint?.defaultData || {});

  // Verified ProFox journey; the editable blueprint takes priority when present.
  const timelineMilestones: TimelineEvent[] = defaultData.timeline?.milestones || [
    {
      year: '2018',
      title: 'ProFox Takes Shape',
      description: 'We began with a focused commitment to helping businesses create clearer, more credible, and more useful web experiences.',
      badge: 'Foundation'
    },
    {
      year: '2020',
      title: 'Beyond the Website',
      description: 'Client needs led us deeper into conversion journeys, responsive development, CMS platforms, ecommerce, analytics, and connected lead-capture systems.',
      badge: 'Growth'
    },
    {
      year: '2022',
      title: 'Custom Products and Workflows',
      description: 'We expanded into custom web and mobile applications, dashboards, portals, APIs, databases, and integrations designed around real operational requirements.',
      badge: 'Development'
    },
    {
      year: '2024',
      title: 'Marketing and Business Automation',
      description: 'Email journeys, CRM automation, lead routing, internal notifications, and data synchronization became part of one connected delivery approach.',
      badge: 'Automation'
    },
    {
      year: '2026',
      title: 'Forty-Plus Solutions Delivered',
      description: 'With more than eight years of experience and over forty websites and applications delivered, ProFox continues as one growth-focused team serving businesses in India and international markets.',
      badge: 'Today'
    }
  ];

  const aboutData = page?.aboutUsData || page?.aboutData || defaultData;
  const sections = aboutData?.pageSections || {};
  const heroData = {
    title: aboutData?.hero?.title || page?.heroTitle || 'Connected Digital Systems.',
    highlight: aboutData?.hero?.highlight || page?.heroHighlight || 'Built for Real Growth.',
    description: aboutData?.hero?.description || page?.heroSubtitle || 'ProFox brings websites, custom applications, and business automation together so your customer experience, operations, and growth strategy move in the same direction.',
    badge: aboutData?.hero?.subheading || aboutData?.hero?.badge || page?.heroSubheading || page?.heroBadge || 'ABOUT US',
    subtitle: aboutData?.hero?.subtitle || ''
  };
  const missionDefaults = [
    { title: 'Deep Understanding', description: 'We take time to understand how your organization works before recommending solutions.' },
    { title: 'Clear Roadmaps', description: 'We create practical roadmaps that move projects forward with clarity and speed.' },
    { title: 'Industry Expertise', description: 'Our team brings subject matter expertise that helps organizations move beyond outdated systems.' },
    { title: 'Clarity Over Chaos', description: 'We simplify complex digital environments and remove unnecessary technical complexity.' },
  ];
  const missionIcons = [Eye, CheckCircle2, Compass, Lightbulb];
  const missionCards: MissionCardData[] = (sections.overview?.cards || missionDefaults).map((card: any, index: number) => {
    const Icon = missionIcons[index % missionIcons.length];
    return { ...card, icon: <Icon className="h-5 w-5" /> };
  });
  const relianceDefaults = [
    { title: 'Clarity Over Chaos', description: 'We turn fragmented workflows into one unified system.', icon: Compass },
    { title: 'Accountable Partner', description: "We're obsessed with outcomes, not just tasks.", icon: Shield },
    { title: 'Industry-Focused Experts', description: 'You always work with a proven industry expert.', icon: Building2 },
    { title: 'Results That Matter', description: 'Every project ties directly to measurable business outcomes.', icon: TrendingUp },
    { title: 'Efficient System', description: 'We make complex integrations simple and reliable.', icon: Cpu },
    { title: 'AI-First Solutions', description: 'Built to evolve with automation, AI, and growth.', icon: Bot },
  ];
  const relianceIcons = [Compass, Shield, Building2, TrendingUp, Cpu, Bot];
  const relianceCards = (sections.whyUs?.cards || relianceDefaults).map((card: any, index: number) => ({ ...card, icon: relianceIcons[index % relianceIcons.length] }));
  const storyImage = sections.story?.image || aboutData?.story?.image || aboutData?.hero?.image || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=82&w=1800';
  const storyText = aboutData?.story?.body || "Founded with the belief that technology should empower rather than overwhelm, ProFox began as a focused team of designers and developers. Today, we help organizations solve complex digital challenges, connect fragmented systems, and deliver measurable progress through thoughtful design, engineering, and automation.";
  const galleryImages = sections.gallery?.images || aboutData?.gallery?.images || [
    'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=82&w=900',
    'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&q=82&w=900',
    'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&q=82&w=900',
    'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&q=82&w=900',
    'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=82&w=900',
  ];

  const currentTimelineItem = timelineMilestones.find(m => m.year === activeYear) || timelineMilestones[0];

  useEffect(() => {
    document.title = page?.seo?.metaTitle || `About Us | ${content.siteSettings?.businessName || 'Profox web designer'}`;
    window.scrollTo(0, 0);
  }, [page]);

  useEffect(() => {
    const ids = ['overview', 'story', 'journey', 'offices', 'why-us', 'culture'];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveSubnav(visible.target.id);
    }, { rootMargin: '-25% 0px -60% 0px', threshold: [0.1, 0.35, 0.6] });
    ids.forEach((id) => { const element = document.getElementById(id); if (element) observer.observe(element); });
    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    setActiveSubnav(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-[#000080] selection:text-white relative overflow-x-clip">
      
      {/* 1. HERO BANNER SECTION (Light Theme with Abstract Dynamic Fluid Graphic) */}
      <section ref={heroRef} className="relative flex min-h-[940px] items-end overflow-hidden bg-[#f4f5fb] pb-20 pt-36 text-slate-950 sm:min-h-[900px] md:min-h-[92svh] md:pb-24 md:pt-44">
        {/* Subtle Fluid Overlay Graphics */}
        <div className="absolute inset-0 opacity-60 pointer-events-none">
          <motion.div className="absolute -top-32 -left-20 h-[34rem] w-[34rem] rounded-full bg-cyan-200/60 blur-3xl" animate={reduceMotion ? undefined : { x: [0, 30, 0], y: [0, 20, 0] }} transition={{ duration: 10, repeat: Infinity }} />
          <motion.div className="absolute right-[-8rem] top-1/4 h-[42rem] w-[42rem] rounded-full bg-violet-300/60 blur-3xl" animate={reduceMotion ? undefined : { scale: [1, 1.08, 1] }} transition={{ duration: 8, repeat: Infinity }} />
          <svg className="w-full h-full object-cover" viewBox="0 0 1440 320" fill="none" preserveAspectRatio="none">
            <path fill="rgba(255, 255, 255, 0.05)" d="M0,192L48,197.3C96,203,192,213,288,192C384,171,480,117,576,112C672,107,768,149,864,176C960,203,1056,213,1152,197.3C1248,181,1344,139,1392,117.3L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
          </svg>
        </div>

        <motion.div className="max-w-7xl mx-auto px-6 relative z-10 w-full space-y-6" style={{ y: heroContentY, opacity: heroOpacity }}>
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-[#000080] transition-colors bg-white/70 border border-slate-200 px-4 py-2 rounded-full backdrop-blur-md"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {sections.hero?.backLabel || 'Back to Home'}
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-6xl space-y-5"
          >
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#000080]/10 border border-[#000080]/20 text-[#000080] text-xs font-bold uppercase tracking-widest">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{heroData.badge}</span>
            </div>

            <h1 className="max-w-6xl text-5xl sm:text-6xl md:text-7xl lg:text-[92px] font-extrabold tracking-[-0.06em] text-slate-950 leading-[0.96] pb-2">
              {heroData.title} <span className="text-[#000080]">{heroData.highlight}</span>
            </h1>

            {heroData.subtitle && (
              <p className="text-xl md:text-2xl text-[#000080] font-bold max-w-3xl leading-snug">
                {heroData.subtitle}
              </p>
            )}

            <p className="text-lg md:text-xl text-slate-600 font-medium max-w-3xl leading-relaxed">
              {heroData.description}
            </p>
            <div className="flex flex-col items-start gap-4 pt-4 sm:flex-row sm:items-center">
              <a href={sections.hero?.buttonUrl || '/contact-us'} className="inline-flex items-center gap-3 rounded-xl bg-[#000080] px-7 py-4 text-sm font-bold text-white shadow-xl transition-transform hover:-translate-y-1">{sections.hero?.buttonText || 'Start a Conversation'} <ArrowUpRight className="h-4 w-4" /></a>
              <HeroReviewProof />
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* 2. STICKY SUB-NAVBAR */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between overflow-x-auto py-3 no-scrollbar gap-4">
          <div className="flex items-center gap-1.5 min-w-max">
            {(sections.navigation || [
              { id: 'overview', label: 'Overview' },
              { id: 'story', label: 'Our Story' },
              { id: 'journey', label: 'Our Journey' },
              { id: 'offices', label: 'Our Offices' },
              { id: 'why-us', label: 'Why Us' },
              { id: 'culture', label: 'Culture & Careers' }
            ]).map((item: any) => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                  activeSubnav === item.id 
                    ? "bg-[#000080] text-white shadow-md" 
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <a 
            href={sections.navigationCta?.url || '/contact-us'}
            className="hidden sm:inline-flex items-center gap-2 bg-[#000080] hover:bg-[#000066] text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow transition-all shrink-0"
          >
            <span>{sections.navigationCta?.text || 'Get in Touch'}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      <MissionScrollChapter cards={missionCards} headline={sections.overview?.headline} scrollLabel={sections.overview?.scrollLabel} />
      <StoryScrollChapter image={storyImage} text={storyText} eyebrow={sections.story?.eyebrow} title={sections.story?.title} scrollLabel={sections.story?.scrollLabel} />

      {/* 5. OUR JOURNEY TIMELINE SECTION (Dark Charcoal Card inside Light Page for High-Contrast Impact) */}
      <section id="journey" className="py-20 md:py-28 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          
          <div className="bg-[#0b0d18] text-white rounded-[2rem] p-8 sm:p-12 md:p-16 shadow-2xl border border-slate-800 space-y-12 relative overflow-hidden">
            <motion.div aria-hidden className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#000080]/50 blur-3xl" animate={reduceMotion ? undefined : { scale: [1, 1.18, 1] }} transition={{ duration: 7, repeat: Infinity }} />
            
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#5c5cff]/20 text-[#aaaaff] text-xs font-bold uppercase tracking-widest">
                <Clock className="w-3.5 h-3.5" />
                <span>{sections.journey?.eyebrow || 'Our Milestones'}</span>
              </div>
              <h2 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight">
                {sections.journey?.title || 'Every Step Along the Way of Our Journey'}
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              
              {/* Timeline Years List */}
              <div className="lg:col-span-4 flex lg:flex-col gap-3 overflow-x-auto pb-4 lg:pb-0 border-b lg:border-b-0 lg:border-r border-slate-800 pr-0 lg:pr-8">
                {timelineMilestones.map((m) => (
                  <button
                    key={m.year}
                    onClick={() => setActiveYear(m.year)}
                    className={cn(
                      "flex items-center justify-between px-5 py-3.5 rounded-xl font-mono text-base font-bold transition-all text-left shrink-0 group",
                      activeYear === m.year 
                        ? "bg-[#000080] text-white shadow-lg border border-blue-400/30" 
                        : "text-slate-400 hover:text-white hover:bg-slate-900"
                    )}
                  >
                    <span>{m.year}</span>
                    <ChevronRight className={cn("w-4 h-4 transition-transform", activeYear === m.year ? "translate-x-1 text-[#aaaaff]" : "opacity-0 group-hover:opacity-100")} />
                  </button>
                ))}
              </div>

              {/* Active Milestone Card */}
              <div className="lg:col-span-8 min-h-[220px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentTimelineItem.year}
                    initial={{ opacity: 0, x: 35, rotateY: 5 }}
                    animate={{ opacity: 1, x: 0, rotateY: 0 }}
                    exit={{ opacity: 0, x: -35, rotateY: -5 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="bg-slate-900/90 border border-slate-800 p-8 rounded-2xl space-y-6 shadow-xl relative"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-3xl font-extrabold font-mono text-[#aaaaff]">
                        {currentTimelineItem.year}
                      </span>
                      {currentTimelineItem.badge && (
                        <span className="bg-[#000080]/60 border border-[#000080] text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                          {currentTimelineItem.badge}
                        </span>
                      )}
                    </div>

                    <h3 className="text-2xl font-bold text-white tracking-tight">
                      {currentTimelineItem.title}
                    </h3>

                    <p className="text-slate-300 text-base leading-relaxed">
                      {currentTimelineItem.description}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

            </div>

          </div>

        </div>
      </section>

      {/* 6. OUR OFFICES / GLOBAL PRESENCE */}
      <section id="offices" className="relative overflow-hidden border-b border-slate-200 bg-white pb-0 pt-24 md:pt-32">
        <div className="relative z-10 mx-auto grid max-w-6xl items-start gap-12 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <SectionReveal className="max-w-md lg:pt-12">
            <div className="mb-5 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-[#000080]">
              <MapPin className="h-4 w-4" />
              {sections.presence?.eyebrow || 'Our Presence'}
            </div>
            <h2 className="text-4xl font-medium leading-[1.02] tracking-[-0.05em] text-slate-950 md:text-5xl">
              {(sections.presence?.title || 'Global Presence, Local Expertise').split(',').map((part: string, index: number, parts: string[]) => <React.Fragment key={`${part}-${index}`}>{part}{index < parts.length - 1 && <>,<br /></>}</React.Fragment>)}
            </h2>
            <p className="mt-6 max-w-sm text-base leading-7 text-slate-600">
              {sections.presence?.description || 'Connected delivery, local understanding, and one accountable team—positioned to support your business wherever it operates.'}
            </p>
          </SectionReveal>

          <div className="grid gap-3 sm:grid-cols-2">
            {(sections.presence?.cards || [
              { eyebrow: 'Primary Office', title: siteSettings.address, detail: siteSettings.businessAddress, icon: MapPin },
              { eyebrow: 'Coverage', title: 'Global Delivery', detail: 'Built around your market and time zone', icon: Globe },
              { eyebrow: 'Collaboration', title: 'One Connected Team', detail: 'Strategy, design, and technology together', icon: Users },
              { eyebrow: 'Availability', title: 'Start Where You Are', detail: 'Remote and flexible engagement', icon: ArrowUpRight },
            ]).map((office: any, index: number) => {
              const presenceIcons = [MapPin, Globe, Users, ArrowUpRight];
              const Icon = presenceIcons[index % presenceIcons.length];
              const isPrimaryOffice = index === 0;
              const officeTitle = isPrimaryOffice ? siteSettings.address : office.title;
              const officeDetail = isPrimaryOffice ? siteSettings.businessAddress : office.detail;
              return (
                <motion.a
                  key={`${officeTitle}-${index}`}
                  href="/contact-us"
                  initial={{ opacity: 0, y: 26 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  whileHover={reduceMotion ? undefined : { y: -5 }}
                  transition={{ ...revealTransition, delay: index * 0.06 }}
                  className="group flex min-h-[160px] flex-col justify-between rounded-[18px] border border-[#000080]/[0.07] bg-[#f3f5ff] p-6 transition-[background-color,border-color,box-shadow] duration-500 hover:border-[#000080] hover:bg-[#000080] hover:shadow-[0_20px_45px_rgba(0,0,128,0.18)]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-[0.22em] text-[#000080]/60 transition-colors group-hover:text-white/60">{office.eyebrow}</span>
                    <Icon className="h-4 w-4 text-[#000080] transition-colors group-hover:text-white" />
                  </div>
                  <div className="mt-8">
                    <h3 className="text-xl font-bold tracking-[-0.025em] text-slate-950 transition-colors group-hover:text-white">{officeTitle}</h3>
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs leading-5 text-slate-600 transition-colors group-hover:text-white/70">{officeDetail}</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-extrabold text-[#000080] transition-colors group-hover:text-white">{sections.presence?.linkText || 'Connect with us'} <ChevronRight className="h-3 w-3" /></span>
                  </div>
                </motion.a>
              );
            })}
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} className="pointer-events-none relative mx-auto mt-4 h-[270px] max-w-6xl overflow-hidden sm:h-[330px] md:mt-0 md:h-[390px]">
          <svg viewBox="0 0 1200 500" fill="none" className="absolute inset-x-0 top-0 h-full w-full" preserveAspectRatio="xMidYMin meet" aria-hidden>
            <defs>
              <linearGradient id="profoxArc" x1="100" y1="430" x2="1040" y2="120" gradientUnits="userSpaceOnUse">
                <stop stopColor="#5c5cff" stopOpacity="0" />
                <stop offset="0.45" stopColor="#5c5cff" stopOpacity="0.7" />
                <stop offset="1" stopColor="#000080" stopOpacity="0.95" />
              </linearGradient>
            </defs>
            <path d="M80 470C255 92 836 38 1128 468" stroke="url(#profoxArc)" strokeWidth="2.5" />
            <path d="M205 470C230 154 800 95 1128 468" stroke="#5c5cff" strokeOpacity="0.38" strokeWidth="1.5" />
            <path d="M345 470C250 210 705 35 1128 468" stroke="#000080" strokeOpacity="0.24" strokeWidth="1.5" />
            <path d="M510 470C340 248 781 122 1128 468" stroke="#5c5cff" strokeOpacity="0.28" strokeWidth="1.5" />
            <path d="M680 470C502 253 789 138 1128 468" stroke="#000080" strokeOpacity="0.2" strokeWidth="1.5" />
            <path d="M80 470C420 195 845 204 1128 468" stroke="#5c5cff" strokeOpacity="0.25" strokeWidth="1.5" />
            <path d="M175 470C530 282 849 273 1128 468" stroke="#000080" strokeOpacity="0.18" strokeWidth="1.5" />
            <circle cx="1128" cy="468" r="5" fill="#000080" />
            <circle cx="594" cy="178" r="4" fill="#5c5cff" />
            <circle cx="826" cy="220" r="4" fill="#000080" />
          </svg>
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent" />
        </motion.div>
      </section>

      {/* 7–9. IMPACT, PROVEN RESULTS & AWARDS */}
      <section className="relative overflow-hidden border-b border-[#343846] bg-[#1d2027] text-white">
        <div aria-hidden className="absolute left-1/2 top-0 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[#000080]/20 blur-[130px]" />

        <div className="relative mx-auto max-w-6xl px-6">
          <div className="border-b border-white/15 py-20 text-center md:py-28">
            <motion.h2 initial={{ opacity: 0, y: 45, scale: 0.92 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} className="text-[clamp(4.5rem,15vw,11rem)] font-black uppercase leading-[0.78] tracking-[-0.075em] text-[#f4f5ff]">
              {sections.impact?.title || 'Impact'}
            </motion.h2>
            <motion.p initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ ...revealTransition, delay: 0.18 }} className="mx-auto mt-10 max-w-lg text-sm font-semibold leading-5 text-white/50 md:text-base md:leading-6">
              {sections.impact?.subtitle || 'Driving innovation, delivering results, and creating change that lasts.'}
            </motion.p>
          </div>

          <div className="grid items-center gap-12 border-b border-white/15 py-16 md:py-24 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20">
            <SectionReveal>
              <div className="mb-5 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.28em] text-[#aaaaff]">
                <TrendingUp className="h-4 w-4" />
                {sections.results?.eyebrow || 'Measurable Performance'}
              </div>
              <h2 className="text-4xl font-semibold leading-[0.98] tracking-[-0.05em] text-white md:text-5xl">
                {sections.results?.title || 'Proven Results'}
              </h2>
              <p className="mt-6 max-w-md text-sm leading-6 text-white/60 md:text-base md:leading-7">
                {sections.results?.description || 'Our impact is built on experience, scale, and accountability. Every engagement is focused on measurable outcomes that support long-term client growth and operational efficiency.'}
              </p>

              <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {(sections.results?.stats || [{ number: '8+', label: 'Years of Experience' }, { number: '40+', label: 'Websites & Apps Delivered' }, { number: '1', label: 'Growth-Focused Team' }]).map((stat: any, index: number) => (
                  <motion.div key={`${stat.label}-${index}`} whileHover={reduceMotion ? undefined : { y: -6, borderColor: 'rgba(115,115,255,0.7)' }} className="min-h-[128px] rounded-xl border border-white/10 bg-white/[0.075] p-5 transition-colors">
                    <div className="text-[9px] font-black uppercase tracking-[0.18em] text-white/45">{stat.label}</div>
                    <div className="mt-5 text-3xl font-black tracking-[-0.04em] text-white">{stat.number}</div>
                  </motion.div>
                ))}
              </div>
              <div className="mt-6 rounded-xl border border-[#7373ff]/25 bg-[#000080]/20 px-5 py-4">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#aaaaff]">{sections.results?.registrationLabel || 'Registered MSME / Udyam Number'}</div>
                <div className="mt-2 break-all font-mono text-sm font-bold tracking-[0.08em] text-white">{sections.results?.registrationNumber || 'UDYAM-HP-09-0022689'}</div>
              </div>
            </SectionReveal>

            <motion.div initial={{ opacity: 0, scale: 0.88 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} className="relative mx-auto aspect-[1.45/1] w-full max-w-2xl overflow-hidden">
              <div aria-hidden className="absolute inset-[6%] rounded-[48%] opacity-50" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.26) 1.3px, transparent 1.5px)', backgroundSize: '8px 8px', maskImage: 'radial-gradient(ellipse at center, black 32%, transparent 72%)', WebkitMaskImage: 'radial-gradient(ellipse at center, black 32%, transparent 72%)' }} />
              <Globe className="absolute inset-0 m-auto h-[82%] w-[82%] text-white/[0.08]" strokeWidth={0.7} />
              <div aria-hidden className="absolute inset-[15%] rounded-full border border-[#7373ff]/15" />
              <div aria-hidden className="absolute inset-[24%_10%] rotate-12 rounded-[50%] border border-[#7373ff]/15" />
              {[
                ['21%', '35%'], ['30%', '66%'], ['39%', '47%'], ['47%', '74%'], ['55%', '39%'], ['61%', '58%'], ['68%', '28%'], ['74%', '69%'], ['82%', '44%']
              ].map(([left, top], index) => (
                <motion.span key={`${left}-${top}`} aria-hidden className="absolute h-2 w-2 rounded-full bg-[#7373ff] shadow-[0_0_18px_rgba(115,115,255,0.95)]" style={{ left, top }} animate={reduceMotion ? undefined : { opacity: [0.35, 1, 0.35], scale: [0.75, 1.25, 0.75] }} transition={{ duration: 2.2 + (index % 3) * 0.5, repeat: Infinity, delay: index * 0.16 }} />
              ))}
              <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(circle at center, rgba(0,0,128,0.2), transparent 65%)' }} />
            </motion.div>
          </div>

          <SectionReveal className="grid items-center gap-8 py-12 md:grid-cols-[220px_1fr] md:py-16">
            <h3 className="max-w-[170px] text-2xl font-semibold leading-[1.02] tracking-[-0.04em] text-white">
              {sections.awards?.title || 'Awards & Recognition'}
            </h3>
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="flex flex-wrap items-center gap-x-10 gap-y-7 border-l-0 border-white/15 md:border-l md:pl-10 lg:gap-x-14">
              {(sections.awards?.items || ['Clutch', 'DESIGNRUSH', 'BestDesign', 'THE MANIFEST']).map((award: string, index: number) => (
                <span key={`${award}-${index}`} className="text-base font-extrabold tracking-[-0.025em] text-white/75 transition-colors hover:text-[#aaaaff] md:text-lg">{award}</span>
              ))}
            </motion.div>
          </SectionReveal>
        </div>
      </section>

      {/* 10. WHY COMPANIES RELY ON PROFOX */}
      <section id="why-us" className="relative overflow-hidden border-b border-slate-200 bg-white py-24 md:py-32">
        <div aria-hidden className="absolute -left-40 top-24 h-80 w-80 rounded-full bg-[#5c5cff]/[0.06] blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-14 px-6 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
          <SectionReveal className="self-start lg:sticky lg:top-28">
            <div className="mb-6 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-[#000080]">
              <span className="h-px w-9 bg-[#000080]" />
              {sections.whyUs?.eyebrow || 'Why ProFox'}
            </div>
            <h2 className="max-w-sm text-4xl font-bold leading-[1.04] tracking-[-0.045em] text-slate-950 md:text-5xl">
              {sections.whyUs?.title || 'Why Companies Rely on ProFox'}
            </h2>
            <p className="mt-7 max-w-sm text-base leading-7 text-slate-600">
              {sections.whyUs?.description || 'Clients choose us because every project we deliver ties directly to outcomes that improve operational efficiency and revenue growth.'}
            </p>
            <div className="mt-10 hidden items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400 lg:flex">
              <span className="grid h-8 w-8 place-items-center rounded-full border border-[#000080]/15 text-[#000080]">06</span>
              {sections.whyUs?.footerLabel || 'Reasons teams stay with us'}
            </div>
          </SectionReveal>

          <div className="grid gap-4 sm:grid-cols-2">
            {relianceCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <motion.article
                  key={card.title}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.22 }}
                  whileHover={reduceMotion ? undefined : { y: -7 }}
                  transition={{ ...revealTransition, delay: (index % 2) * 0.08 }}
                  className="group relative flex min-h-[270px] flex-col justify-between overflow-hidden rounded-[22px] border border-[#000080]/[0.08] bg-[#f3f5ff] p-7 shadow-[0_1px_0_rgba(0,0,128,0.03)] transition-[background-color,border-color,box-shadow,color] duration-500 hover:border-[#000080] hover:bg-[#000080] hover:shadow-[0_24px_60px_rgba(0,0,128,0.20)] md:min-h-[290px] md:p-8"
                >
                  <div aria-hidden className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[#7373ff]/0 blur-2xl transition-colors duration-500 group-hover:bg-[#7373ff]/30" />
                  <div className="relative flex items-start justify-between">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-[#000080] shadow-[0_8px_24px_rgba(0,0,128,0.08)] transition-colors duration-500 group-hover:bg-white/15 group-hover:text-white">
                      <Icon className="h-6 w-6" strokeWidth={2} />
                    </div>
                    <span className="font-mono text-[10px] font-bold tracking-[0.18em] text-[#000080]/35 transition-colors duration-500 group-hover:text-white/45">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="relative mt-12">
                    <h3 className="text-xl font-bold leading-tight tracking-[-0.025em] text-slate-950 transition-colors duration-500 group-hover:text-white md:text-[22px]">
                      {card.title}
                    </h3>
                    <p className="mt-3 max-w-[25ch] text-sm leading-6 text-slate-600 transition-colors duration-500 group-hover:text-white/75">
                      {card.description}
                    </p>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      {/* 11. CLIENT LOGOS BAR */}
      <section className="py-16 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 text-center space-y-8">
          <p className="text-sm text-slate-600 max-w-2xl mx-auto leading-relaxed">
            {sections.clientStrip?.description || 'Companies around the world rely on ProFox to help them untangle complex digital challenges and build solutions that actually work.'}
          </p>
          <div className="relative overflow-hidden py-3" style={{ maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)' }}>
            <div className="flex min-w-max items-center gap-14 pr-14 font-extrabold text-xl text-slate-400 grayscale opacity-70 animate-scroll-logos">
              {[...(sections.clientStrip?.logos || ['Unilever', "McDonald's", 'Brown', 'CLEAR', 'DDC']), ...(sections.clientStrip?.logos || ['Unilever', "McDonald's", 'Brown', 'CLEAR', 'DDC'])].map((name: string, index: number) => <span key={`${name}-${index}`}>{name}</span>)}
            </div>
          </div>
        </div>
      </section>

      <GalleryScrollChapter images={galleryImages} />

      {/* 13. CULTURE, CAREERS & FORWARD CTA */}
      <section id="culture" className="relative overflow-hidden border-b border-slate-200 bg-white py-20 md:py-28">
        <div aria-hidden className="absolute -left-52 top-12 h-[34rem] w-[34rem] rounded-full bg-[#f0f2ff] md:-left-44" />
        <div aria-hidden className="absolute -left-48 top-24 h-72 w-72 rounded-full bg-[#5c5cff]/[0.07] blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-6">
          <div className="grid items-center gap-14 lg:grid-cols-[1.08fr_0.92fr] lg:gap-20">
            <SectionReveal className="space-y-5">
              <div className="group relative ml-auto h-[250px] max-w-xl overflow-hidden rounded-[22px] shadow-[0_24px_65px_rgba(15,23,42,0.13)] sm:h-[280px] lg:h-[245px]">
                <img src={sections.culture?.imageOne || galleryImages[1] || galleryImages[0]} alt="ProFox team collaborating" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#000080]/15 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 top-4 flex w-[58%] max-w-[250px] flex-col justify-between rounded-2xl border border-white/60 bg-white/95 p-5 shadow-xl backdrop-blur-md sm:p-6">
                  <Quote className="h-6 w-6 fill-[#5c5cff] text-[#5c5cff]" />
                  <p className="text-sm font-semibold leading-5 text-slate-950 sm:text-base sm:leading-6">{sections.culture?.quoteOne || 'Ultimately, we were founded on—and are driven by—our trust in talent.'}</p>
                </div>
              </div>

              <div className="group relative mr-auto h-[250px] max-w-xl overflow-hidden rounded-[22px] shadow-[0_24px_65px_rgba(15,23,42,0.13)] sm:h-[280px] lg:h-[245px]">
                <img src={sections.culture?.imageTwo || galleryImages[3] || galleryImages[2] || galleryImages[0]} alt="ProFox specialist shaping a digital solution" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-l from-[#000080]/15 via-transparent to-transparent" />
                <div className="absolute bottom-4 right-4 top-4 flex w-[58%] max-w-[250px] flex-col justify-between rounded-2xl border border-white/60 bg-white/95 p-5 shadow-xl backdrop-blur-md sm:p-6">
                  <Quote className="h-6 w-6 fill-[#000080] text-[#000080]" />
                  <p className="text-sm font-semibold leading-5 text-slate-950 sm:text-base sm:leading-6">{sections.culture?.quoteTwo || 'Our people bring the expertise, creativity, and insight that make every project stronger.'}</p>
                </div>
              </div>
            </SectionReveal>

            <SectionReveal delay={0.12} className="self-center">
              <div className="mb-5 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-[#000080]">
                <span className="h-px w-9 bg-[#000080]" />
                {sections.culture?.eyebrow || 'Life at ProFox'}
              </div>
              <h2 className="text-5xl font-bold leading-[0.95] tracking-[-0.055em] text-slate-950 sm:text-6xl">
                {(sections.culture?.title || 'Culture & Careers').split('&').map((part: string, index: number, parts: string[]) => <React.Fragment key={`${part}-${index}`}>{part.trim()}{index < parts.length - 1 && <>&amp;<br /></>}</React.Fragment>)}
              </h2>
              <div className="mt-8 space-y-5 text-[15px] leading-6 text-slate-600">
                {(sections.culture?.paragraphs || ['At ProFox, strong teams grow through curiosity, trust, and a shared commitment to learning. We listen first, ask thoughtful questions, and approach every challenge with care and openness.', 'Our culture encourages autonomy and thoughtful problem-solving. Great work happens when people are trusted to think independently, push boundaries, and continuously improve how things are done.', 'We learn from one another and work closely with our clients to solve complex digital challenges. Clear communication, shared ownership, and practical thinking guide how we work every day.', 'Innovation at ProFox comes from collaboration, curiosity, and a focus on building solutions that are simple, effective, and frictionless.']).map((paragraph: string, index: number) => <p key={`${paragraph}-${index}`}>{paragraph}</p>)}
                <p className="font-bold text-slate-950">{sections.culture?.closing || 'This is what motivates us every day.'}</p>
              </div>
            </SectionReveal>
          </div>

          <SectionReveal className="mt-20 border-t border-slate-300 pt-12 md:mt-24 md:pt-14">
            <div className="grid items-center gap-8 md:grid-cols-[1.1fr_0.9fr] md:gap-16">
              <h2 className="max-w-xl text-4xl font-medium leading-[1.05] tracking-[-0.045em] text-slate-950 md:text-5xl">
                {(sections.cta?.heading || 'Always Moving Businesses Forward').split('Businesses').map((part: string, index: number, parts: string[]) => <React.Fragment key={`${part}-${index}`}>{part}{index < parts.length - 1 && <>Businesses<br /></>}</React.Fragment>)}
              </h2>
              <div>
                <p className="max-w-sm text-base leading-6 text-slate-700">{sections.cta?.subtitle || 'Share your goals with us, and we’ll show how we’ve helped others reach theirs.'}</p>
                <a href={sections.cta?.buttonUrl || '/contact-us'} className="mt-6 inline-flex items-center gap-3 rounded-xl bg-[#000080] px-6 py-3.5 text-sm font-extrabold text-white shadow-[0_14px_32px_rgba(0,0,128,0.22)] transition-all hover:-translate-y-1 hover:bg-[#000066]">
                  {sections.cta?.buttonText || 'Let’s Talk'}
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </SectionReveal>
        </div>
      </section>

      {/* Global CTA Footer */}
      <CTA />

      {/* Floating Admin CMS Shortcut */}
      {isAdminOrEditor && (
        <button
          onClick={() => navigate('/admin')}
          className="fixed bottom-6 right-6 z-50 bg-[#000080] hover:bg-[#000066] text-white px-4 py-3 rounded-full shadow-2xl border border-white/20 flex items-center gap-2 text-xs font-bold transition-all group hover:scale-105"
          title="Edit page in CMS Dashboard"
        >
          <Edit3 className="w-4 h-4" />
          <span>Edit About Us Blueprint</span>
        </button>
      )}

    </div>
  );
}
