import React, { useEffect, useState, useRef } from 'react';
import { motion, useScroll, useTransform, AnimatePresence, useMotionValueEvent } from 'motion/react';
import { ArrowUpRight, ChevronDown, Check, Monitor, Database, Cloud, Code, Smartphone, Workflow, Award, Trophy, Shield, Star } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useCMS } from '../lib/CMSProvider';
import { supabase, dbProcedure } from '../lib/supabase';
import { defaultPortfolioItems } from '../data';
import { defaultBlueprintsList } from '../components/admin/TemplateManager';
import { resolveContactCtaUrl } from '../lib/contactCta';
import HeroReviewProof from '../components/HeroReviewProof';

const MotionLink = motion.create ? motion.create(Link) : motion(Link as any);

const renderAwardIcon = (iconName: string) => {
  const norm = (iconName || '').toLowerCase().trim();
  switch (norm) {
    case 'workflow':
      return <Workflow className="w-6 h-6" />;
    case 'monitor':
      return <Monitor className="w-6 h-6" />;
    case 'award':
      return <Award className="w-6 h-6" />;
    case 'trophy':
      return <Trophy className="w-6 h-6" />;
    case 'shield':
      return <Shield className="w-6 h-6" />;
    case 'star':
      return <Star className="w-6 h-6" />;
    case 'database':
      return <Database className="w-6 h-6" />;
    case 'cloud':
      return <Cloud className="w-6 h-6" />;
    case 'code':
      return <Code className="w-6 h-6" />;
    case 'smartphone':
      return <Smartphone className="w-6 h-6" />;
    default:
      return null;
  }
};

const serviceData = {
  hero: {
    title: "Frictionless Systems",
    highlight: "Built to Scale.",
    description: "We replace operational friction with streamlined digital infrastructure. From Headless CMS migrations to custom ERP integrations, we build the tech that powers complex organizations.",
    image: "https://images.unsplash.com/photo-1573164713988-8665fc963095?auto=format&fit=crop&q=80&w=1600",
    ctaText: "Get Started",
    ctaUrl: "#cta"
  },
  subnav: [
    { label: "Technology Solutions", id: "hero" },
    { label: "How We Help", id: "help" },
    { label: "Key Challenges", id: "challenges" },
    { label: "Success Stories", id: "success" },
    { label: "Tech Stack", id: "stack" },
    { label: "Our Process", id: "process" },
    { label: "Resources", id: "resources" }
  ],
  quote: "74% of IT leaders say their project backlog is growing faster than their teams can deliver.",
  quoteHeading: "Companies with high-performing websites outperform their competitors by nearly 80%.",
  quoteAuthor: "- Watermark Consulting",
  quoteDescription: "Your website is where buyers decide if you are worth trusting, now or ever. Every day it underperforms, you are leaving growth on the table.",
  howWeHelp: [
    {
      title: "Custom software and platform development",
      desc: "Build intelligent, scalable systems that power your operations.",
      features: ["Enterprise and workflow applications", "Web, mobile, and cloud platforms"],
      iconColor: "bg-green-400"
    },
    {
      title: "Product development support",
      desc: "Turn innovative ideas into market-ready digital products.",
      features: ["MVP design and launch", "Product scaling and ongoing optimization"],
      iconColor: "bg-green-500"
    },
    {
      title: "System integrations that reduce manual work",
      desc: "Connect your tools and teams into one frictionless workflow.",
      features: ["ERP, CRM, and data integrations", "API and automation development"],
      iconColor: "bg-green-600"
    },
    {
      title: "AI automation built around your existing stack",
      desc: "Enable smarter decisions and eliminate repetitive tasks.",
      features: ["Predictive analytics and intelligent workflows", "AI agents, chatbots, and automation"],
      iconColor: "bg-green-400"
    },
    {
      title: "Engineers on demand",
      desc: "Scale your output with senior developers who integrate directly into your team.",
      features: ["On-demand engineering to clear backlogs and ship", "Embedded experts for legacy migrations and scaling"],
      iconColor: "bg-blue-400"
    },
    {
      title: "Cloud solutions",
      desc: "Enhance flexibility, performance, and data-driven decision making.",
      features: ["Cloud migration and management", "Data and analytics enablement"],
      iconColor: "bg-teal-400"
    }
  ],
  challenges: [
    "Disconnected ERP, CRM, and internal systems that do not share data.",
    "Legacy systems that hold your growth back.",
    "Reports that lack clarity or accuracy.",
    "Siloed tools and manual workflows waste time and money.",
    "Data scattered across systems with no single source of truth.",
    "Backlogs growing faster than teams can deliver.",
    "Projects that look great on paper but never scale in practice.",
    "Vendors and tools overlapping with no clear ownership."
  ],
  caseStudies: [
    {
      client: "DDC",
      title: "Modernizing DDC's DNA Testing Services Portal",
      image: "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&q=80&w=800",
      slug: "ddc"
    },
    {
      client: "Sound.com",
      title: "Building Enterprise-Scale Platform for Music & Sound Licensing",
      image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=800",
      slug: "sound"
    }
  ],
  techStack: [
    { category: "Accounting", icons: ["QuickBooks", "Xero", "FreshBooks"] },
    { category: "Analytics & Data", icons: ["Google Analytics", "Power BI", "Looker Studio"] },
    { category: "Customer Support", icons: ["Zendesk", "Freshdesk", "Intercom"] },
    { category: "Cloud & Storage", icons: ["AWS", "Azure", "Google Cloud"] },
    { category: "AI & Automation", icons: ["OpenAI", "Zapier", "Make"] }
  ],
  ourProcess: [
    {
      step: "01",
      title: "Discovery & Strategy",
      desc: "We analyze your existing workflows, legacy systems, and technical bottlenecks to construct a pragmatic blueprint for modernization.",
      image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200",
      ctaText: "Let's Talk",
      ctaUrl: "/contact-us"
    },
    {
      step: "02",
      title: "System Architecture & Design",
      desc: "Our senior engineers design scalable, secure system architectures that seamlessly bridge your current tools and future integrations.",
      image: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&q=80&w=1200",
      ctaText: "Let's Talk",
      ctaUrl: "/contact-us"
    },
    {
      step: "03",
      title: "Agile Development & Testing",
      desc: "We write clean, high-performance code with daily standups, robust test coverage, and continuous delivery loops to guarantee momentum.",
      image: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&q=80&w=1200",
      ctaText: "Let's Talk",
      ctaUrl: "/contact-us"
    },
    {
      step: "04",
      title: "Deployment & Continuous Growth",
      desc: "We deploy without downtime, provide proactive monitoring, and continuously optimize systems as your user base and operations scale.",
      image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200",
      ctaText: "Let's Talk",
      ctaUrl: "/contact-us"
    }
  ],
  resources: [
    {
      category: "Technology Outlook",
      title: "Your Store's Backend Systems Are Costing You Sales Right...",
      image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=800"
    },
    {
      category: "AI Transformation",
      title: "Generative AI in 2026: From Enterprise Experimentation to...",
      image: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&q=80&w=800"
    },
    {
      category: "Strategy & Planning",
      title: "Gap Analysis in 2026: Template, Examples, and Strategic Tools...",
      image: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&q=80&w=800"
    }
  ],
  faqs: [
    {
      question: "What types of technology solutions do you provide?",
      answer: "We provide comprehensive technology solutions ranging from custom platform development to enterprise system integrations and AI-driven automation."
    },
    {
      question: "Can you integrate disconnected systems?",
      answer: "Yes, we specialize in bridging disconnected ERP, CRM, and internal systems to create a unified data environment."
    },
    {
      question: "What if I just need engineers to support an existing project?",
      answer: "We offer flexible engineering partnerships where our senior developers integrate directly into your team to clear backlogs and accelerate delivery."
    }
  ],
  connectedLoop: {
    eyebrow: "WHAT MAKES US DIFFERENT",
    title: "For the First Time, Your Website, Your Customer Experience, and Your Marketing Automation Are One System.",
    desc1: "Most agencies build you a website and call it a day. But a website is only one piece of the puzzle. To drive real growth, your digital presence needs to be connected to how you talk to your customers and how you keep them coming back.",
    desc2: "We don't just build websites. We build connected revenue systems that align your marketing, your technology, and your customer journey.",
    steps: [
      { badge: "Step 1", title: "Website Experience" },
      { badge: "Step 2", title: "Marketing Automation" },
      { badge: "Step 3", title: "Customer Experience" }
    ],
    footer: "The Connected Growth Loop",
    accentText: "Every decision we make is tied directly to growth. If it doesn't improve growth, it doesn't get made."
  }
};

function BrandLogo({ name, customLogo, size = 'normal' }: { name: string; customLogo?: string; size?: 'small' | 'normal' | 'large' }) {
  const normalized = name.toLowerCase().trim();
  const isLarge = size === 'large';
  const imgClass = isLarge ? "w-9 h-9 object-contain rounded-xl bg-white/10 p-1.5 border border-white/20 shrink-0" : "w-5 h-5 object-contain rounded bg-white/10 p-0.5 border border-white/15 shrink-0";
  const iconSizeClass = isLarge ? "w-7 h-7" : "w-5 h-5";
  const textClass = isLarge ? "text-base sm:text-lg font-bold text-white tracking-tight" : "text-sm font-bold text-white tracking-tight";

  if (customLogo) {
    return (
      <div className="flex items-center gap-2.5 text-white/95 font-medium hover:scale-[1.03] transition-transform">
        <img 
          src={customLogo} 
          alt={name} 
          referrerPolicy="no-referrer"
          className={imgClass} 
        />
        <span className={textClass}>{name}</span>
      </div>
    );
  }

  // Framer Motion / Framer
  if (normalized.includes("framer")) {
    return (
      <div className="flex items-center gap-2.5 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <div className={`${isLarge ? 'w-9 h-9' : 'w-6 h-6'} bg-slate-900 border border-white/20 rounded-xl flex items-center justify-center p-1 shrink-0`}>
          <svg className={`${isLarge ? 'w-5 h-5' : 'w-3.5 h-3.5'} text-sky-400 fill-current`} viewBox="0 0 24 24">
            <path d="M4 0h16v8h-8zM4 8h8l8 8H4zM4 16h8v8z"/>
          </svg>
        </div>
        <span className={textClass}>Framer Motion</span>
      </div>
    );
  }

  // Figma
  if (normalized.includes("figma")) {
    return (
      <div className="flex items-center gap-2.5 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <div className={`${isLarge ? 'w-9 h-9' : 'w-6 h-6'} shrink-0 flex items-center justify-center`}>
          <svg className={isLarge ? "w-7 h-7" : "w-5 h-5"} viewBox="0 0 38 57" fill="none">
            <path d="M19 28.5C19 23.2533 23.2533 19 28.5 19C33.7467 19 38 23.2533 38 28.5C38 33.7467 33.7467 38 28.5 38H19V28.5Z" fill="#1ABCFE"/>
            <path d="M0 47.5C0 42.2533 4.25329 38 9.5 38H19V47.5C19 52.7467 14.7467 57 9.5 57C4.25329 57 0 52.7467 0 47.5Z" fill="#0ACF83"/>
            <path d="M19 0V19H28.5C33.7467 19 38 14.7467 38 9.5C38 4.2533 33.7467 0 28.5 0H19Z" fill="#FF7262"/>
            <path d="M0 9.5C0 14.7467 4.25329 19 9.5 19H19V0H9.5C4.25329 0 0 4.2533 0 9.5Z" fill="#F24E1E"/>
            <path d="M0 28.5C0 33.7467 4.25329 38 9.5 38H19V19H9.5C4.25329 19 0 23.2533 0 28.5Z" fill="#A259FF"/>
          </svg>
        </div>
        <span className={textClass}>Figma</span>
      </div>
    );
  }

  // React
  if (normalized.includes("react")) {
    return (
      <div className="flex items-center gap-2.5 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <svg className={`${iconSizeClass} text-[#61dafb] shrink-0`} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="6">
          <ellipse cx="50" cy="50" rx="42" ry="16"/>
          <ellipse cx="50" cy="50" rx="42" ry="16" transform="rotate(60 50 50)"/>
          <ellipse cx="50" cy="50" rx="42" ry="16" transform="rotate(120 50 50)"/>
          <circle cx="50" cy="50" r="8" fill="#61dafb"/>
        </svg>
        <span className={textClass}>React.js</span>
      </div>
    );
  }

  // Next.js
  if (normalized.includes("next")) {
    return (
      <div className="flex items-center gap-2.5 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <div className={`${isLarge ? 'w-8 h-8 text-sm' : 'w-5 h-5 text-[10px]'} rounded-full bg-white text-black flex items-center justify-center font-black shrink-0`}>
          N
        </div>
        <span className={textClass}>Next.js</span>
      </div>
    );
  }

  // Tailwind CSS
  if (normalized.includes("tailwind")) {
    return (
      <div className="flex items-center gap-2.5 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <svg className={`${iconSizeClass} text-[#38bdf8] shrink-0 fill-current`} viewBox="0 0 24 24">
          <path d="M12.001 4.8c-3.2 0-5.2 1.6-6 4.8 1.2-1.6 2.6-2.2 4.2-1.8.913.228 1.565.89 2.288 1.624C13.666 10.618 15.027 12 18.001 12c3.2 0 5.2-1.6 6-4.8-1.2 1.6-2.6 2.2-4.2 1.8-.913-.228-1.565-.89-2.288-1.624C16.336 6.182 14.975 4.8 12.001 4.8zm-6 7.2c-3.2 0-5.2 1.6-6 4.8 1.2-1.6 2.6-2.2 4.2-1.8.913.228 1.565.89 2.288 1.624C7.666 17.818 9.027 19.2 12.001 19.2c3.2 0 5.2-1.6 6-4.8-1.2 1.6-2.6 2.2-4.2 1.8-.913-.228-1.565-.89-2.288-1.624C10.336 13.382 8.975 12 6.001 12z"/>
        </svg>
        <span className={textClass}>Tailwind CSS</span>
      </div>
    );
  }

  // TypeScript
  if (normalized.includes("typescript") || normalized === "ts") {
    return (
      <div className="flex items-center gap-2.5 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <div className={`${isLarge ? 'w-8 h-8 text-xs' : 'w-5 h-5 text-[9px]'} bg-[#3178c6] rounded-md font-black text-white flex items-center justify-center shrink-0`}>
          TS
        </div>
        <span className={textClass}>TypeScript</span>
      </div>
    );
  }

  // Shopify
  if (normalized.includes("shopify")) {
    return (
      <div className="flex items-center gap-2.5 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <div className={`${isLarge ? 'w-8 h-8' : 'w-5 h-5'} bg-[#95bf47]/20 border border-[#95bf47]/40 rounded-lg flex items-center justify-center shrink-0`}>
          <span className={`${isLarge ? 'text-sm' : 'text-[10px]'} font-black text-[#95bf47]`}>S</span>
        </div>
        <span className={textClass}>Shopify</span>
      </div>
    );
  }

  // WooCommerce / WordPress
  if (normalized.includes("woocommerce") || normalized.includes("wordpress")) {
    return (
      <div className="flex items-center gap-2.5 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <div className={`${isLarge ? 'w-8 h-8' : 'w-5 h-5'} bg-[#21759b]/20 border border-[#21759b]/40 rounded-lg flex items-center justify-center shrink-0`}>
          <span className={`${isLarge ? 'text-sm' : 'text-[10px]'} font-black text-[#21759b]`}>W</span>
        </div>
        <span className={textClass}>{name}</span>
      </div>
    );
  }

  // Stripe
  if (normalized.includes("stripe")) {
    return (
      <div className="flex items-center gap-2.5 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <div className={`${isLarge ? 'w-8 h-8' : 'w-5 h-5'} bg-[#635bff] rounded-lg flex items-center justify-center text-white font-black ${isLarge ? 'text-sm' : 'text-[10px]'} shrink-0`}>
          S
        </div>
        <span className={textClass}>Stripe</span>
      </div>
    );
  }

  // 1. QuickBooks
  if (normalized.includes("quickbooks")) {
    return (
      <div className="flex items-center gap-1.5 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <div className="flex flex-col items-start leading-none">
          <span className="text-[7px] text-slate-400 font-normal tracking-wider mb-0.5">INTUIT</span>
          <div className="flex items-center gap-1">
            <svg className={`${iconSizeClass} text-[#2ca01c] shrink-0 fill-current`} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" className="fill-[#2ca01c]" />
              <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </svg>
            <span className={textClass}>quickbooks</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. Xero
  if (normalized === "xero") {
    return (
      <div className="flex items-center gap-1.5 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <svg className={`${iconSizeClass} text-[#13b5ea] shrink-0 fill-current`} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <text x="12" y="15.5" fill="white" fontSize="10" fontWeight="bold" textAnchor="middle">xero</text>
        </svg>
        <span className={textClass}>xero</span>
      </div>
    );
  }

  // 3. FreshBooks
  if (normalized.includes("freshbooks")) {
    return (
      <div className="flex items-center gap-1.5 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <div className={`${isLarge ? 'w-7 h-7 text-xs' : 'w-5 h-5 text-[10px]'} bg-[#0075e3] rounded flex items-center justify-center font-black text-white`}>F</div>
        <span className={textClass}>FreshBooks</span>
      </div>
    );
  }

  // 4. Google Analytics
  if (normalized.includes("google analytics") || normalized === "analytics") {
    return (
      <div className="flex items-center gap-1.5 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <svg className={`${iconSizeClass} text-[#f9ab00] shrink-0 fill-current`} viewBox="0 0 24 24">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-5h2v5zm4 0h-2V7h2v10zm4 0h-2v-3h2v3z" />
        </svg>
        <span className={textClass}>Google Analytics</span>
      </div>
    );
  }

  // 5. Power BI
  if (normalized.includes("power bi")) {
    return (
      <div className="flex items-center gap-1.5 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <svg className={`${iconSizeClass} text-[#f2c811] shrink-0 fill-current`} viewBox="0 0 24 24">
          <rect x="4" y="12" width="4" height="8" rx="1" />
          <rect x="10" y="8" width="4" height="12" rx="1" />
          <rect x="16" y="4" width="4" height="16" rx="1" />
        </svg>
        <span className={textClass}>Power BI</span>
      </div>
    );
  }

  // 6. Looker Studio
  if (normalized.includes("looker")) {
    return (
      <div className="flex items-center gap-1.5 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <div className="flex gap-0.5">
          <span className="w-2 h-2 rounded-full bg-[#4285f4]" />
          <span className="w-2 h-2 rounded-full bg-[#ea4335]" />
          <span className="w-2 h-2 rounded-full bg-[#fbbc05]" />
        </div>
        <span className={textClass}>Looker Studio</span>
      </div>
    );
  }

  // 7. Zendesk
  if (normalized === "zendesk") {
    return (
      <div className="flex items-center gap-1.5 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <svg className={`${iconSizeClass} text-[#03363d] fill-current bg-[#032f35] rounded p-0.5`} viewBox="0 0 24 24">
          <path d="M12 2L2 22h20L12 2zm0 4l7 14H5l7-14z" fill="#fff" />
        </svg>
        <span className={textClass}>zendesk</span>
      </div>
    );
  }

  // 8. Freshdesk
  if (normalized === "freshdesk") {
    return (
      <div className="flex items-center gap-1.5 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <svg className={`${iconSizeClass} text-emerald-400 shrink-0 fill-current`} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" className="fill-emerald-500" />
          <path d="M12 7v10M7 12h10" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <span className={textClass}>freshdesk</span>
      </div>
    );
  }

  // 9. Intercom
  if (normalized === "intercom") {
    return (
      <div className="flex items-center gap-1 text-white font-black tracking-wide hover:scale-[1.03] transition-transform">
        <svg className={`${iconSizeClass} text-[#0057ff] shrink-0 fill-current`} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 11.5c1 1.5 3 1.5 4 0" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
        <span className={textClass}>INTERCOM</span>
      </div>
    );
  }

  // 10. AWS
  if (normalized === "aws" || normalized.includes("amazon")) {
    return (
      <div className="flex items-center gap-1 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <span className={`${textClass} uppercase font-extrabold`}>aws</span>
        <svg className="w-4 h-2 text-[#ff9900]" viewBox="0 0 24 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M2 2c5 4 15 4 20 0" />
        </svg>
      </div>
    );
  }

  // 11. Azure
  if (normalized === "azure") {
    return (
      <div className="flex items-center gap-1.5 text-white/95 font-semibold tracking-tight hover:scale-[1.03] transition-transform">
        <svg className={`${iconSizeClass} text-[#0089d6] shrink-0 fill-current`} viewBox="0 0 24 24">
          <path d="M12 2L2 22h8l2-4 4 4h8L12 2zm0 6l6 12H6l6-12z" />
        </svg>
        <span className={textClass}>Azure</span>
      </div>
    );
  }

  // 12. Google Cloud
  if (normalized.includes("google cloud") || normalized === "gcp") {
    return (
      <div className="flex items-center gap-1.5 text-white/95 font-semibold tracking-tight hover:scale-[1.03] transition-transform">
        <svg className={`${iconSizeClass} shrink-0 fill-current`} viewBox="0 0 24 24">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" fill="#4285f4" />
        </svg>
        <span className={textClass}>Google Cloud</span>
      </div>
    );
  }

  // 13. OpenAI
  if (normalized === "openai" || normalized.includes("chatgpt")) {
    return (
      <div className="flex items-center gap-1.5 text-white/95 font-semibold tracking-tight hover:scale-[1.03] transition-transform">
        <svg className={`${iconSizeClass} text-emerald-400 shrink-0 fill-none`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8M8 12h8" />
        </svg>
        <span className={textClass}>OpenAI</span>
      </div>
    );
  }

  // 14. Zapier
  if (normalized === "zapier") {
    return (
      <div className="flex items-center gap-1 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <svg className={`${iconSizeClass} text-[#ff4f00] shrink-0 fill-current`} viewBox="0 0 24 24">
          <path d="M12 2l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z" />
        </svg>
        <span className={`${textClass} lowercase`}>zapier</span>
      </div>
    );
  }

  // 15. Make
  if (normalized === "make") {
    return (
      <div className="flex items-center gap-1 text-white/95 font-bold tracking-tight hover:scale-[1.03] transition-transform">
        <div className="flex gap-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#e31c79]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#a31de3]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#1d97e3]" />
        </div>
        <span className={`${textClass} lowercase`}>make</span>
      </div>
    );
  }

  // Fallback beautiful badge
  return (
    <div className={`flex items-center gap-2 text-white/90 font-medium ${isLarge ? 'text-base bg-white/10 px-4 py-2 rounded-2xl border border-white/20' : 'text-xs bg-white/5 border border-white/10 px-2.5 py-1 rounded-full'} hover:bg-white/15 transition-all`}>
      <span className={`${isLarge ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5'} rounded-full bg-indigo-400 shrink-0 animate-pulse`} />
      <span className={textClass}>{name}</span>
    </div>
  );
}

function ScrollDrivenTechStack({ 
  title, 
  desc, 
  techStack, 
  headingFont,
  backgroundImage
}: { 
  title: string; 
  desc: string; 
  techStack: any[]; 
  headingFont?: string; 
  backgroundImage?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const defaultStack = [
    { category: "Website Strategy", icons: ["Framer Motion: Physics-based animations", "Information Architecture", "User Flow Optimization"] },
    { category: "Conversion Copywriting", icons: ["Value Proposition", "High-Converting Hero Copy", "A/B Testing"] },
    { category: "UI Design", icons: ["Figma", "Design Systems", "Tailwind CSS"] },
    { category: "UX Research", icons: ["User Testing", "Hotjar", "Google Analytics"] },
    { category: "Responsive Web Development", icons: ["React.js", "Next.js", "TypeScript", "Tailwind CSS"] },
    { category: "Ecommerce", icons: ["Shopify", "WooCommerce", "Stripe"] },
    { category: "SEO & Structure", icons: ["Google Search Console", "Google Analytics", "Ahrefs"] }
  ];

  const stackItems = (techStack && Array.isArray(techStack) && techStack.length > 0) ? techStack : defaultStack;
  const totalItems = stackItems.length;

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    if (totalItems <= 1) return;
    const step = 1 / totalItems;
    const idx = Math.min(Math.floor(latest / step), totalItems - 1);
    setActiveIndex(Math.max(0, idx));
  });

  const activeStack = stackItems[activeIndex] || stackItems[0];

  return (
    <section id="stack" className="relative w-full text-white bg-slate-950">
      <div id="tech-stack" />

      {/* ========================================================= */}
      {/* 1. DESKTOP VIEW (STICKY SCROLL-DRIVEN - UNCHANGED ON LG)  */}
      {/* ========================================================= */}
      <div 
        ref={containerRef}
        className="hidden lg:block relative w-full text-white bg-slate-950"
        style={{
          minHeight: `${Math.max(totalItems * 65, 250)}vh`,
          backgroundImage: `url("${backgroundImage || 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&q=80&w=2000'}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        }}
      >
        {/* Dark Blur Overlay */}
        <div className="absolute inset-0 bg-slate-950/92 backdrop-blur-md z-0" />

        {/* STICKY CONTAINER */}
        <div className="sticky top-0 min-h-screen w-full flex items-center z-10 py-12">
          <div className="max-w-[1400px] w-full mx-auto px-6 grid grid-cols-12 gap-16 items-center">
            
            {/* LEFT COLUMN: STICKY HEADING & LIST */}
            <div className="col-span-6 flex flex-col justify-center space-y-8">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                  <span>Expertise Under One Roof</span>
                </div>
                <h2 
                  className="text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight" 
                  style={{ fontFamily: headingFont }}
                >
                  {title || "Complete Website Expertise Under One Roof"}
                </h2>
                <p className="text-slate-400 text-base lg:text-lg leading-relaxed max-w-xl">
                  {desc || "Research, copywriting, UI, UX, and development work together. This creates a website experience that helps visitors understand, trust, and choose you."}
                </p>
              </div>

              {/* TECHNOLOGY CATEGORIES ON LEFT */}
              <div className="space-y-3 relative overflow-hidden py-1 pr-1">
                {stackItems.map((stack: any, idx: number) => {
                  const isActive = idx === activeIndex;

                  return (
                    <motion.div
                      key={idx}
                      onClick={() => setActiveIndex(idx)}
                      animate={{
                        scale: isActive ? 1 : 0.98,
                        opacity: isActive ? 1 : 0.4,
                      }}
                      transition={{ duration: 0.3 }}
                      className={`cursor-pointer group relative p-4 lg:p-5 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-4 ${
                        isActive
                          ? 'bg-slate-900/90 border-indigo-500/50 shadow-[0_10px_30px_rgba(99,102,241,0.2)] ring-1 ring-indigo-500/30'
                          : 'bg-slate-900/30 border-white/5 hover:border-white/20 hover:bg-slate-900/50'
                      }`}
                    >
                      {/* Glowing active accent bar on left */}
                      {isActive && (
                        <motion.div 
                          layoutId="activeAccentBar"
                          className="absolute left-0 top-3 bottom-3 w-1.5 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-r-full shadow-[0_0_12px_rgba(99,102,241,0.8)]" 
                        />
                      )}

                      <div className="flex items-center gap-3.5 pl-2">
                        <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg transition-colors ${
                          isActive ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-white/5 text-slate-500'
                        }`}>
                          0{idx + 1}
                        </span>
                        <span className={`text-base lg:text-lg font-bold tracking-tight transition-colors ${
                          isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                        }`}>
                          {stack.category}
                        </span>
                      </div>

                      {/* Active State Badge */}
                      {isActive && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex items-center gap-1.5 text-xs text-indigo-400 font-semibold bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full shrink-0"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                          <span>Active</span>
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT COLUMN: ACTIVE TECHNOLOGY LOGO DISPLAY */}
            <div className="col-span-6 flex items-center justify-center">
              <div className="w-full max-w-lg">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeIndex}
                    initial={{ opacity: 0, scale: 0.92, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: -20 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="relative rounded-3xl border border-white/10 bg-slate-900/85 backdrop-blur-xl p-8 lg:p-10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col justify-between min-h-[380px] lg:min-h-[420px]"
                  >
                    {/* Ambient gradient orb */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-gradient-to-tr from-indigo-600/25 via-purple-600/20 to-sky-500/15 blur-3xl rounded-full pointer-events-none" />

                    {/* Card Top Header */}
                    <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5 relative z-10">
                      <div>
                        <span className="text-xs uppercase tracking-widest text-indigo-400 font-bold block mb-1">
                          Active Technology • 0{activeIndex + 1} / 0{totalItems}
                        </span>
                        <h3 className="text-2xl font-bold text-white tracking-tight">
                          {activeStack.category}
                        </h3>
                      </div>
                      <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                        <Workflow className="w-5 h-5 animate-pulse" />
                      </div>
                    </div>

                    {/* Card Center: Logos & Details */}
                    <div className="flex-1 flex flex-col justify-center items-center py-4 space-y-4 relative z-10">
                      <div className="w-full flex flex-wrap items-center justify-center gap-4">
                        {(activeStack.icons || []).map((iconItem: any, iidx: number) => {
                          const isObj = typeof iconItem === 'object' && iconItem !== null;
                          const rawName = isObj ? (iconItem.name || '') : String(iconItem);
                          const customLogo = isObj ? (iconItem.logo || '') : undefined;

                          const [mainName, subDetail] = rawName.includes(':') 
                            ? rawName.split(':').map(s => s.trim()) 
                            : [rawName, isObj ? iconItem.description : undefined];

                          return (
                            <motion.div
                              key={iidx}
                              initial={{ opacity: 0, scale: 0.85, y: 15 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              transition={{ delay: iidx * 0.08, duration: 0.35 }}
                              className="bg-slate-950/80 border border-white/10 hover:border-indigo-500/40 rounded-2xl p-5 flex flex-col items-start gap-2 shadow-xl hover:bg-slate-900/90 transition-all duration-300 group min-w-[200px] flex-1"
                            >
                              <div className="flex items-center gap-3 w-full">
                                <BrandLogo name={mainName} customLogo={customLogo} size="large" />
                              </div>
                              {subDetail && (
                                <div className="text-xs text-indigo-300 font-medium bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-lg w-full mt-1">
                                  {subDetail}
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Card Bottom Bar */}
                    <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-slate-400 relative z-10">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-slate-300 font-medium">Production Verified</span>
                      </div>
                      <span className="font-mono text-indigo-400 font-bold bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20">
                        {activeStack.icons?.length || 0} Tools
                      </span>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. MOBILE & TABLET VIEW (PROCESS-STYLE TIMELINE; ALL OPEN) */}
      {/* ========================================================= */}
      <div 
        className="block lg:hidden relative w-full text-white bg-slate-950 py-12 sm:py-16 px-4 sm:px-8 overflow-hidden"
        style={{
          backgroundImage: `url("${backgroundImage || 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&q=80&w=2000'}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Dark Blur Overlay */}
        <div className="absolute inset-0 bg-slate-950/94 backdrop-blur-md z-0" />

        <div className="relative z-10 max-w-2xl mx-auto space-y-8">
          {/* Section Header */}
          <div className="space-y-3 text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <span>Expertise Under One Roof</span>
            </div>
            <h2 
              className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight" 
              style={{ fontFamily: headingFont }}
            >
              {title || "Complete Website Expertise Under One Roof"}
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              {desc || "Research, copywriting, UI, UX, and development work together. This creates a website experience that helps visitors understand, trust, and choose you."}
            </p>
          </div>

          {/* Timeline Process Cards (ALL STACKS OPEN) */}
          <div className="relative pl-7 sm:pl-10 space-y-6">
            {/* Vertical Timeline Track Line */}
            <div className="absolute left-[13px] sm:left-[17px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-indigo-500 via-purple-500/50 to-indigo-500/20 rounded-full" />

            {stackItems.map((stack: any, idx: number) => {
              const stepNum = idx + 1 < 10 ? `0${idx + 1}` : `${idx + 1}`;
              const iconsList = stack.icons || [];

              return (
                <div key={idx} className="relative">
                  {/* Step Node indicator on the timeline */}
                  <div className="absolute -left-7 sm:-left-10 top-3.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-900 border-2 border-indigo-500 text-indigo-300 text-xs font-mono font-bold flex items-center justify-center shadow-[0_0_12px_rgba(99,102,241,0.5)] z-10">
                    {stepNum}
                  </div>

                  {/* Card Container */}
                  <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md space-y-4">
                    {/* Card Header */}
                    <div className="flex items-center justify-between border-b border-white/10 pb-3 gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                          Stack {stepNum}
                        </span>
                        <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                          {stack.category}
                        </h3>
                      </div>
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                        <Workflow className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    {/* All Technologies / Tools OPEN & Rendered */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      {iconsList.map((iconItem: any, iidx: number) => {
                        const isObj = typeof iconItem === 'object' && iconItem !== null;
                        const rawName = isObj ? (iconItem.name || '') : String(iconItem);
                        const customLogo = isObj ? (iconItem.logo || '') : undefined;

                        const [mainName, subDetail] = rawName.includes(':') 
                          ? rawName.split(':').map(s => s.trim()) 
                          : [rawName, isObj ? iconItem.description : undefined];

                        return (
                          <div 
                            key={iidx}
                            className="bg-slate-950/80 border border-white/10 hover:border-indigo-500/30 rounded-xl p-3 flex flex-col items-start gap-1.5 shadow-sm transition-colors"
                          >
                            <BrandLogo name={mainName} customLogo={customLogo} size="normal" />
                            {subDetail && (
                              <div className="text-[11px] text-indigo-300 font-medium bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md w-full mt-0.5">
                                {subDetail}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ServiceDetailView({ page }: { page?: any }) {
  const { slug } = useParams<{ slug: string }>();
  const { content } = useCMS();
  const theme = content.theme || {};
  const headingFont = theme.fontFamily || 'Inter';
  const primaryColor = theme.primaryColor || '#000080';

  // If page was not passed directly, try to resolve page from CMS customPages or defaults
  const customPages = content.customPages || [];
  const resolvedPage = page || customPages.find((p: any) => 
    p.slug === slug || 
    p.id === slug || 
    p.template === slug ||
    p.slug === `services/${slug}` ||
    (p.slug && p.slug.replace(/^services\//, '') === slug)
  );

  const rawBlueprints = content.template_blueprints || [];
  let blueprints = [...rawBlueprints];
  for (const defBp of defaultBlueprintsList) {
    if (!blueprints.some((b: any) => b.id === defBp.id)) {
      blueprints.push(defBp);
    }
  }

  // Attempt to resolve template ID based on URL slug if no custom page was found or page template is generic
  let templateId = resolvedPage?.template;
  if (!templateId || templateId === 'service-detail') {
    if (slug === 'website-design-and-development' || slug === 'digital-experience') {
      templateId = 'digital-experience';
    } else if (slug === 'web-and-mobile-application-development' || slug === 'technology' || slug === 'technology-solutions') {
      templateId = 'technology-solutions';
    } else if (slug === 'email-marketing-and-business-automation' || slug === 'ai' || slug === 'ai-automation') {
      templateId = 'ai-automation';
    } else if (slug) {
      // Try to see if slug matches any blueprint ID exactly
      const exactMatch = blueprints.find((b: any) => b.id === slug);
      if (exactMatch) templateId = slug;
    }
  }

  // Find exact blueprint by page template ID strictly
  let blueprint = blueprints.find((b: any) => b.id === templateId);
  
  if (!blueprint) {
    // If no specific template ID, fallback to the core service-detail as a baseline
    blueprint = blueprints.find((b: any) => b.id === 'service-detail') || blueprints[0];
  }  const blueprintData = blueprint?.defaultData || {};
  const pageData = resolvedPage?.serviceDetailData || {};
  const templateOwnsProcess = true;

  const resolveVal = (pageVal: any, bpVal: any, genericDefaultVal: any = '') => {
    if (pageVal === undefined || pageVal === null || pageVal === '') {
      return (bpVal !== undefined && bpVal !== null && bpVal !== '') ? bpVal : genericDefaultVal;
    }
    if (bpVal !== undefined && bpVal !== null && bpVal !== '' && (pageVal === genericDefaultVal || JSON.stringify(pageVal) === JSON.stringify(genericDefaultVal))) {
      return bpVal;
    }
    return pageVal;
  };

  const resolveArr = (pageArr: any, bpArr: any, genericDefaultArr: any = []) => {
    const isPageValid = Array.isArray(pageArr) && pageArr.length > 0;
    const isBpValid = Array.isArray(bpArr) && bpArr.length > 0;
    const isGenericValid = Array.isArray(genericDefaultArr) && genericDefaultArr.length > 0;

    if (!isPageValid) {
      return isBpValid ? bpArr : (isGenericValid ? genericDefaultArr : []);
    }

    if (isBpValid && (JSON.stringify(pageArr) === JSON.stringify(genericDefaultArr))) {
      return bpArr;
    }

    return pageArr;
  };

  const resolvedHeroTitle = (resolvedPage?.heroTitle && resolvedPage.heroTitle !== 'Untitled Page') ? resolvedPage.heroTitle : undefined;

  const data = {
    ...serviceData,
    ...blueprintData,
    ...pageData,
    hero: {
      ...serviceData.hero,
      ...blueprintData.hero,
      ...pageData.hero,
      title: resolveVal(pageData?.hero?.title, resolvedHeroTitle || blueprintData?.hero?.title || resolvedPage?.title, serviceData.hero.title),
      highlight: resolveVal(pageData?.hero?.highlight, resolvedPage?.heroHighlight || blueprintData?.hero?.highlight, serviceData.hero.highlight),
      subheading: resolveVal(pageData?.hero?.subheading, resolvedPage?.heroSubheading || blueprintData?.hero?.subheading, ""),
      subtitle: resolveVal(pageData?.hero?.subtitle, blueprintData?.hero?.subtitle, ""),
      description: resolveVal(pageData?.hero?.description, resolvedPage?.heroSubtitle || blueprintData?.hero?.description, serviceData.hero.description),
      image: resolveVal(pageData?.hero?.image, resolvedPage?.coverImage || blueprintData?.hero?.image, serviceData.hero.image),
      ctaText: resolveVal(pageData?.hero?.ctaText, blueprintData?.hero?.ctaText, serviceData.hero.ctaText),
      ctaUrl: resolveVal(pageData?.hero?.ctaUrl, blueprintData?.hero?.ctaUrl, serviceData.hero.ctaUrl),
    },
    subnav: resolveArr(pageData.subnav, blueprintData.subnav, serviceData.subnav),
    quote: resolveVal(pageData.quote, blueprintData.quote, serviceData.quote),
    quoteHeading: resolveVal(pageData.quoteHeading, blueprintData.quoteHeading, serviceData.quoteHeading),
    quoteAuthor: resolveVal(pageData.quoteAuthor, blueprintData.quoteAuthor, serviceData.quoteAuthor),
    quoteDescription: resolveVal(pageData.quoteDescription, blueprintData.quoteDescription, serviceData.quoteDescription),
    howWeHelpTitle: resolveVal(pageData.howWeHelpTitle, blueprintData.howWeHelpTitle, "How We Help"),
    howWeHelpDesc: resolveVal(pageData.howWeHelpDesc, blueprintData.howWeHelpDesc, "We provide senior engineering capacity to clear your backlog."),
    howWeHelpButtonText: resolveVal(pageData.howWeHelpButtonText, blueprintData.howWeHelpButtonText, "Get Started"),
    howWeHelpButtonUrl: resolveVal(pageData.howWeHelpButtonUrl, blueprintData.howWeHelpButtonUrl, "#cta"),
    howWeHelp: resolveArr(pageData.howWeHelp, blueprintData.howWeHelp, serviceData.howWeHelp),
    challengesTitle: resolveVal(pageData.challengesTitle, blueprintData.challengesTitle, "The Challenges We Make"),
    challengesHighlight: resolveVal(pageData.challengesHighlight, blueprintData.challengesHighlight, "Disappear For You"),
    challenges: resolveArr(pageData.challenges, blueprintData.challenges, serviceData.challenges),
    progressTitle: resolveVal(pageData.progressTitle, blueprintData.progressTitle, "What Progress"),
    progressHighlight: resolveVal(pageData.progressHighlight, blueprintData.progressHighlight, "Looks Like"),
    progressDesc: resolveVal(pageData.progressDesc, blueprintData.progressDesc, "Modernization Wins: Case studies on successfully phasing out legacy systems."),
    progressLinkText: resolveVal(pageData.progressLinkText, blueprintData.progressLinkText, "View All Case Studies"),
    caseStudies: resolveArr(pageData.caseStudies, blueprintData.caseStudies, serviceData.caseStudies),
    awardsTitle: resolveVal(pageData.awardsTitle, blueprintData.awardsTitle, "Awards &\nRecognition"),
    awards: (() => {
      const globalAwards = content.globalAwards || content.growth?.awards || [
        { name: 'CLUTCH 2024', subtext: 'TOP DEVELOPER', type: 'CLUTCH', show: true },
        { name: 'DESIGNRUSH', subtext: '', type: 'TEXT', show: true },
        { name: 'BestDesign', subtext: '', type: 'BORDERED', show: true }
      ];
      return globalAwards
        .filter((a: any) => a.show !== false)
        .map((a: any) => {
          let icon = "Award";
          if (a.type === 'CLUTCH') icon = "Workflow";
          else if (a.type === 'TEXT') icon = "Monitor";
          return {
            text: a.name + (a.subtext ? ` - ${a.subtext}` : ''),
            icon: icon,
            image: a.image || undefined
          };
        });
    })(),
    frictionTitle: resolveVal(pageData.frictionTitle, blueprintData.frictionTitle, "Engineering the Friction Out of Complex Systems"),
    frictionDescription: resolveVal(pageData.frictionDescription, blueprintData.frictionDescription, "True technical value isn't just about adding new tools; it's about the seamless bridge between legacy infrastructure and modern automation."),
    frictionImage: resolveVal(pageData.frictionImage, blueprintData.frictionImage, "https://images.unsplash.com/photo-1556157382-97eda2d62296?auto=format&fit=crop&q=80&w=600"),
    techStackTitle: resolveVal(pageData.techStackTitle, blueprintData.techStackTitle, "Marketing and Technology Under One Roof"),
    techStackDesc: resolveVal(pageData.techStackDesc, blueprintData.techStackDesc, "Platforms, design, and strategy all work together."),
    techStackImage: resolveVal(pageData.techStackImage, blueprintData.techStackImage, "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=1200"),
    techStack: resolveArr(pageData.techStack, blueprintData.techStack, serviceData.techStack),
    processBadge: templateOwnsProcess
      ? resolveVal(pageData.processBadge, blueprintData.processBadge, content.process_header?.badge || "How We Deliver Success")
      : resolveVal(content.process_header?.badge, pageData.processBadge || blueprintData.processBadge, "How We Deliver Success"),
    processTitle: templateOwnsProcess
      ? resolveVal(pageData.processTitle || pageData.engagementTitle, blueprintData.processTitle || blueprintData.engagementTitle, content.process_header?.title || "Our Process")
      : resolveVal(content.process_header?.title, pageData.processTitle || pageData.engagementTitle || blueprintData.processTitle || blueprintData.engagementTitle, "Our Process"),
    ourProcess: resolveArr(pageData.ourProcess || pageData.engagement, blueprintData.ourProcess || blueprintData.engagement, serviceData.ourProcess),
    engagementTitle: templateOwnsProcess
      ? resolveVal(pageData.processTitle || pageData.engagementTitle, blueprintData.processTitle || blueprintData.engagementTitle, content.process_header?.title || "Our Process")
      : resolveVal(content.process_header?.title, pageData.processTitle || pageData.engagementTitle || blueprintData.processTitle || blueprintData.engagementTitle, "Our Process"),
    engagement: resolveArr(pageData.ourProcess || pageData.engagement, blueprintData.ourProcess || blueprintData.engagement, serviceData.ourProcess),
    resourcesTitle: resolveVal(pageData.resourcesTitle, blueprintData.resourcesTitle, "Our Resources"),
    resourcesLinkText: resolveVal(pageData.resourcesLinkText, blueprintData.resourcesLinkText, "View All Resources"),
    resources: resolveArr(pageData.resources, blueprintData.resources, serviceData.resources),
    faqsTitle: resolveVal(pageData.faqsTitle, blueprintData.faqsTitle, "Frequently Asked Questions"),
    faqsDesc: resolveVal(pageData.faqsDesc, blueprintData.faqsDesc, "Clear answers to common questions about implementation, integrations, and how our solution fits your business."),
    faqs: resolveArr(pageData.faqs, blueprintData.faqs, serviceData.faqs),
    ctaTitle: resolveVal(pageData.ctaTitle, blueprintData.ctaTitle, "Let's Build for Impact"),
    ctaDescription: resolveVal(pageData.ctaDescription, blueprintData.ctaDescription, "Create technology that scales, performs, and delivers business results that last."),
    ctaButtonText: resolveVal(pageData.ctaButtonText, blueprintData.ctaButtonText, "Let's Talk"),
    ctaUrl: resolveVal(pageData.ctaUrl, blueprintData.ctaUrl, "/contact-us"),
    connectedLoop: {
      eyebrow: resolveVal(pageData.connectedLoop?.eyebrow, blueprintData.connectedLoop?.eyebrow, serviceData.connectedLoop.eyebrow),
      title: resolveVal(pageData.connectedLoop?.title, blueprintData.connectedLoop?.title, serviceData.connectedLoop.title),
      desc1: resolveVal(pageData.connectedLoop?.desc1, blueprintData.connectedLoop?.desc1, serviceData.connectedLoop.desc1),
      desc2: resolveVal(pageData.connectedLoop?.desc2, blueprintData.connectedLoop?.desc2, serviceData.connectedLoop.desc2),
      steps: resolveArr(pageData.connectedLoop?.steps, blueprintData.connectedLoop?.steps, serviceData.connectedLoop.steps),
      footer: resolveVal(pageData.connectedLoop?.footer, blueprintData.connectedLoop?.footer, serviceData.connectedLoop.footer),
      accentText: resolveVal(pageData.connectedLoop?.accentText, blueprintData.connectedLoop?.accentText, serviceData.connectedLoop.accentText)
    }
  };

  useEffect(() => {
    const businessName = content.siteSettings?.businessName || 'Profox web designer';
    let pageTitle = resolvedPage?.seo?.metaTitle;
    if (slug === 'email-marketing-and-business-automation' || slug === 'ai-automation' || slug === 'ai') {
      pageTitle = `Email Marketing & Business Automation | ${businessName}`;
    } else if (!pageTitle || pageTitle.includes('Untitled Page') || pageTitle.includes('Dotlogics') || pageTitle.toLowerCase().includes('ai agent')) {
      const rawTitle = resolvedPage?.title && resolvedPage.title !== 'Untitled Page' && !resolvedPage.title.toLowerCase().includes('ai agent')
        ? resolvedPage.title
        : (blueprint?.name && !blueprint.name.toLowerCase().includes('ai agent') ? blueprint.name : 'Services');
      pageTitle = `${rawTitle} | ${businessName}`;
    } else if (pageTitle.includes('Dotlogics')) {
      pageTitle = pageTitle.replace(/Dotlogics/g, businessName);
    }
    document.title = pageTitle;
  }, [slug, resolvedPage, blueprint, content.siteSettings?.businessName]);

  const [activeTab, setActiveTab] = useState(data.techStack?.[0]?.category || 'Cloud Infrastructure');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [activeNav, setActiveNav] = useState('hero');
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const processSectionRef = React.useRef<HTMLDivElement>(null);
  const mobileProcessRef = React.useRef<HTMLDivElement>(null);

  const portfolioItems = content.portfolio || [];
  const blogPosts = content.blog || [];
  const [dbPosts, setDbPosts] = useState<any[]>([]);
  const [dbProcessSteps, setDbProcessSteps] = useState<any[]>([]);

  useEffect(() => {
    const fetchBlogPosts = async () => {
      try {
        const { data: postsData, error } = await dbProcedure.getPublishedPosts();

        if (!error && postsData && postsData.length > 0) {
          setDbPosts(postsData.slice(0, 3).map((p: any) => ({
            title: p.title,
            slug: p.slug,
            category: p.category || "Insight",
            image: p.cover_image || p.featured_image || "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=800"
          })));
        }
      } catch (err) {
        console.error('Error fetching published posts via stored procedure:', err);
      }
    };

    fetchBlogPosts();
  }, []);

  const displayPortfolio = data.portfolioFeed?.enabled !== false 
    ? portfolioItems.slice(0, data.portfolioFeed?.limit || 3)
    : [];

  const displayBlog = data.blogFeed?.enabled !== false
    ? blogPosts.slice(0, data.blogFeed?.limit || 3)
    : [];

  // Dynamic resources mapped from real published DB posts or CMS blog posts or fallback template resources
  const dynamicResources = dbPosts.length > 0
    ? dbPosts
    : (blogPosts.length > 0
        ? blogPosts.slice(0, 3).map((b: any) => ({
            category: b.category || "Insight",
            title: b.title,
            image: b.coverImage || b.featuredImage || b.image || "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=800",
            slug: b.slug
          }))
        : (data.resources || []));

  // Dynamic case studies mapped from real published Portfolio items in CMS or defaultPortfolioItems
  const cmsPortfolioItems = Array.isArray(content.portfolio_items)
    ? content.portfolio_items.filter((i: any) => i.status === 'published' || !i.status)
    : [];

  const allPortfolioList = [...cmsPortfolioItems];
  for (const defItem of defaultPortfolioItems) {
    if (!allPortfolioList.some((p: any) => p.id === defItem.id || p.slug === defItem.slug)) {
      allPortfolioList.push(defItem);
    }
  }

  // Determine if the current page is Web Design & Development
  const isWebDesignAndDev = 
    blueprint?.id === 'digital-experience' || 
    resolvedPage?.slug === 'website-design-and-development' ||
    (resolvedPage?.title || '').toLowerCase().includes('web design') ||
    (resolvedPage?.title || '').toLowerCase().includes('website design') ||
    (blueprint?.name || '').toLowerCase().includes('web design') ||
    (blueprint?.name || '').toLowerCase().includes('website design');

  // Filter our portfolio source specifically for the page's service category
  const filteredPortfolioSource = isWebDesignAndDev
    ? allPortfolioList.filter((item: any) => {
        const cat = (item.category || '').toLowerCase();
        return cat.includes('digital experience') || 
               cat.includes('design') || 
               cat.includes('web') || 
               cat.includes('development');
      })
    : allPortfolioList;

  const dynamicCaseStudies = filteredPortfolioSource.map((item: any) => ({
    client: item.client || item.logoText || 'CLIENT PARTNER',
    title: item.title,
    image: item.coverImage || item.image || 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&q=80&w=800',
    slug: item.slug
  }));

  // Resolve raw case studies from page data, blueprint template data, service default data, or dynamic portfolio
  let activePageCaseStudies = pageData.caseStudies;
  if (Array.isArray(activePageCaseStudies) && activePageCaseStudies.length > 0 && activePageCaseStudies[0].client === 'DDC Enterprise') {
    activePageCaseStudies = null;
  }
  
  // Prefer blueprintData (template) over pageData if template was customized
  const hasCustomizedTemplate = Array.isArray(content.template_blueprints) && content.template_blueprints.some((b: any) => b.id === blueprint?.id);
  let activeBlueprintCaseStudies = blueprintData.caseStudies;

  let chosenCaseStudies = (hasCustomizedTemplate && Array.isArray(activeBlueprintCaseStudies) && activeBlueprintCaseStudies.length > 0)
    ? activeBlueprintCaseStudies
    : ((Array.isArray(activePageCaseStudies) && activePageCaseStudies.length > 0)
    ? activePageCaseStudies
    : ((Array.isArray(blueprintData.caseStudies) && blueprintData.caseStudies.length > 0)
        ? blueprintData.caseStudies
        : ((Array.isArray(data.caseStudies) && data.caseStudies.length > 0)
            ? data.caseStudies
            : null)));

  // Filter chosen custom case studies to make sure they actually exist in filteredPortfolioSource (and have not been deleted!)
  let rawCaseStudies = Array.isArray(chosenCaseStudies)
    ? chosenCaseStudies.filter((cs: any) => {
        if (!cs) return false;
        return filteredPortfolioSource.some((p: any) => {
          if (cs.slug && (p.slug === cs.slug || p.id === cs.slug)) return true;
          const pClient = (p.client || p.logoText || '').toLowerCase().trim();
          const csClient = (cs.client || '').toLowerCase().trim();
          if (csClient && pClient.includes(csClient)) return true;
          return false;
        });
      })
    : [];

  // Fallback to active filtered portfolio items if no valid case studies are configured or if they were deleted
  if (rawCaseStudies.length === 0) {
    rawCaseStudies = dynamicCaseStudies.slice(0, 2);
  }

  const displayCaseStudies = rawCaseStudies.map((cs: any, idx: number) => {
    // 1. Match portfolio item by explicit slug or id
    let matched = cs.slug
      ? allPortfolioList.find((p: any) => p.slug === cs.slug || p.id === cs.slug)
      : null;

    // 2. Fallback match by client name or title
    if (!matched && (cs.client || cs.title)) {
      const clientLower = (cs.client || '').toLowerCase().trim();
      const titleLower = (cs.title || '').toLowerCase().trim();
      matched = allPortfolioList.find((p: any) => {
        const pClient = (p.client || p.logoText || '').toLowerCase().trim();
        const pTitle = (p.title || '').toLowerCase().trim();
        return (
          (clientLower && (pClient.includes(clientLower) || clientLower.includes(pClient))) ||
          (titleLower && (pTitle.includes(titleLower) || titleLower.includes(pTitle)))
        );
      });
    }

    // 3. Fallback to indexing into portfolio list if no slug/client/title was specified
    if (!matched && !cs.slug && !cs.client && !cs.title && allPortfolioList.length > 0) {
      matched = allPortfolioList[idx % allPortfolioList.length];
    }

    const resolvedSlug = cs.slug || matched?.slug || matched?.id || '';

    return {
      client: matched?.client || matched?.logoText || cs.client || 'CLIENT PARTNER',
      title: matched?.title || cs.title || 'Case Study Title',
      image: matched?.coverImage || matched?.image || cs.image || 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&q=80&w=800',
      slug: resolvedSlug
    };
  });

  const pageSpecificProcess = data.ourProcess || data.engagement || [];
  const stepsList = templateOwnsProcess && pageSpecificProcess.length > 0
    ? pageSpecificProcess
    : (dbProcessSteps.length > 0
        ? dbProcessSteps
        : (content.process_steps?.items || content.ourProcess || pageSpecificProcess));

  const { scrollYProgress } = useScroll({
    target: processSectionRef,
    offset: ["start start", "end end"]
  });
  
  const { scrollYProgress: mobileScrollYProgress } = useScroll({
    target: mobileProcessRef,
    offset: ["start center", "end center"]
  });

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) return;
    const stepsCount = stepsList.length;
    if (stepsCount === 0) return;
    const rawIndex = Math.floor(latest * stepsCount);
    const index = Math.min(Math.max(0, rawIndex), stepsCount - 1);
    setActiveStepIndex(index);
  });

  const hasPricing = (!data.hidePricing && data.pricing && data.pricing.length > 0);
  const hasFeeds = (displayPortfolio.length > 0 || displayBlog.length > 0);

  const canonicalSubnav = [
    { label: "Overview", id: "hero" },
    { label: "How We Help", id: "help" },
    { label: "Key Challenges", id: "challenges" },
    { label: "Success Stories", id: "success" },
    { label: "Tech Stack", id: "stack" },
    { label: "Our Process", id: "process" },
    ...(hasFeeds ? [{ label: "Dynamic Feeds", id: "feeds" }] : []),
    ...(hasPricing ? [{ label: "Pricing", id: "pricing" }] : []),
    { label: "Resources", id: "resources" },
    { label: "FAQ", id: "faq" }
  ];

  const resolveSectionId = (rawId: string) => {
    const key = (rawId || '').toLowerCase().trim().replace('#', '').replace(/\s+/g, '-');
    const aliasMap: Record<string, string> = {
      'overview': 'hero',
      'hero': 'hero',
      'approach': 'help',
      'value-prop': 'help',
      'how-we-help': 'help',
      'help': 'help',
      'challenges': 'challenges',
      'key-challenges': 'challenges',
      'evidence': 'success',
      'case-studies': 'success',
      'success-stories': 'success',
      'success': 'success',
      'stack': 'stack',
      'tech-stack': 'stack',
      'process': 'process',
      'our-process': 'process',
      'engagement': 'process',
      'feeds': 'feeds',
      'dynamic-feeds': 'feeds',
      'conversion': 'cta',
      'cta': 'cta',
      'contact': 'cta',
      'resources': 'resources',
      'insights': 'resources',
      'faq': 'faq',
      'faqs': 'faq',
      'pricing': 'pricing'
    };
    return aliasMap[key] || key;
  };

  const rawSubnav = pageData.subnav || blueprintData.subnav || serviceData.subnav || canonicalSubnav;
  const normalizedUserSubnav = (Array.isArray(rawSubnav) ? rawSubnav : canonicalSubnav).map((item: any) => {
    const resId = resolveSectionId(item.id);
    let label = item.label;
    if (label === 'Approach' && resId === 'help') label = 'How We Help';
    if (label === 'Evidence' && resId === 'success') label = 'Success Stories';
    return {
      label,
      id: resId
    };
  });

  const finalSubnav: { label: string; id: string }[] = [];
  const addedIds = new Set<string>();

  for (const item of normalizedUserSubnav) {
    if (item.id && !addedIds.has(item.id)) {
      finalSubnav.push(item);
      addedIds.add(item.id);
    }
  }

  const requiredSections = canonicalSubnav;

  for (const req of requiredSections) {
    if (!addedIds.has(req.id)) {
      finalSubnav.push(req);
      addedIds.add(req.id);
    }
  }

  // Handle sticky subnav observing
  useEffect(() => {
    const handleScroll = () => {
      let current = 'hero';
      for (const item of finalSubnav) {
        const el = document.getElementById(item.id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 180) {
            current = item.id;
          }
        }
      }
      setActiveNav(current);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [finalSubnav]);

  const scrollTo = (id: string) => {
    const targetId = resolveSectionId(id);
    let el = document.getElementById(targetId) || document.getElementById(id.replace('#', ''));
    if (el) {
      const yOffset = -90;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({
        top: y,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="bg-white min-h-screen">
      <style dangerouslySetInnerHTML={{__html: `
        .theme-text { color: ${primaryColor} !important; }
        .theme-bg { background-color: ${primaryColor} !important; }
        .theme-bg-soft { background-color: ${primaryColor}15 !important; }
        .theme-border { border-color: ${primaryColor} !important; }
        .hover\\:theme-text:hover { color: ${primaryColor} !important; }
        .group:hover .group-hover\\:theme-text { color: ${primaryColor} !important; }
        .group:hover .group-hover\\:theme-bg { background-color: ${primaryColor} !important; }
      `}} />
      
      {/* 1. Hero */}
      <section id="hero" className="bg-[#24272c] text-white pt-32 pb-20 relative overflow-hidden">
        <div id="overview" />
        <div className="max-w-[1400px] mx-auto px-6 relative z-10 flex flex-col md:flex-row items-center gap-12">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex-1 space-y-6"
          >
            {data.hero.subheading && (
              <span className="inline-block text-[11px] font-bold theme-text bg-theme-text/10 border border-theme-text/20 px-3 py-1 rounded-full uppercase tracking-wider mb-2">
                {data.hero.subheading}
              </span>
            )}
            <h1 className="text-5xl md:text-[64px] font-bold leading-[1.1] tracking-tight" style={{ fontFamily: headingFont }}>
              {data.hero.title} <span className="theme-text">{data.hero.highlight}</span>
            </h1>
            {data.hero.subtitle && (
              <p className="text-xl md:text-2xl font-medium text-white/90 max-w-xl leading-snug">
                {data.hero.subtitle}
              </p>
            )}
            <p className="text-lg md:text-xl text-slate-300 max-w-xl leading-relaxed">
              {data.hero.description}
            </p>
            <div className="flex flex-col items-start gap-4 pt-2 xl:flex-row xl:items-center">
              <button
                onClick={() => {
                  const target = resolveContactCtaUrl(data.hero?.ctaText, data.hero?.ctaUrl, '#cta');
                  if (target.startsWith('/')) window.location.href = target;
                  else scrollTo(target);
                }}
                className="px-8 py-4 text-white font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-[1.02] inline-flex items-center gap-3 group cursor-pointer theme-bg hover:opacity-90"
              >
                <span>{data.hero?.ctaText || "Build Your Growth Website"}</span>
                <ArrowUpRight className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </button>
              <HeroReviewProof dark />
            </div>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex-1"
          >
            <div className="relative rounded-2xl overflow-hidden aspect-[4/3] md:aspect-square max-w-lg ml-auto">
              <img src={data.hero.image} alt="Service Hero" className="w-full h-full object-cover" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* 2. Subnav */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 py-3 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-1 md:space-x-6 text-xs md:text-sm font-semibold text-slate-600 overflow-x-auto no-scrollbar py-1">
            {finalSubnav.map((nav: any) => (
              <button 
                key={nav.id} 
                onClick={() => scrollTo(nav.id)}
                className={cn(
                  "hover:theme-text transition-colors pb-1 border-b-2 whitespace-nowrap px-2 md:px-0 cursor-pointer",
                  activeNav === nav.id ? "theme-text theme-border font-bold" : "border-transparent text-slate-600"
                )}
              >
                {nav.label}
              </button>
            ))}
          </div>
          <button 
            onClick={() => {
              const target = resolveContactCtaUrl(data.hero?.ctaText || "Get Started", data.hero?.ctaUrl, '#cta');
              if (target.startsWith('/') || target.startsWith('http')) {
                window.location.href = target;
              } else {
                scrollTo(target);
              }
            }} 
            className="bg-slate-900 text-white px-4 md:px-5 py-2 md:py-2.5 rounded-lg text-xs md:text-sm font-bold hover:bg-slate-800 transition-colors shrink-0 shadow-sm cursor-pointer"
          >
            {data.hero?.ctaText && data.hero.ctaText.length < 24 ? data.hero.ctaText : "Get Started"}
          </button>
        </div>
      </div>

      {/* 3. Big Quote */}
      <section className="py-32 px-6 max-w-5xl mx-auto text-center border-y border-slate-100 bg-white">
        {(() => {
          const hasCustomQuoteFields = !!(data.quoteHeading || data.quoteAuthor || data.quoteDescription);
          let displayHeading = data.quoteHeading;
          let displayAuthor = data.quoteAuthor;
          let displayDesc = data.quoteDescription;

          if (!hasCustomQuoteFields && data.quote) {
            const parts = data.quote.split(/\n—|\n-/);
            if (parts.length > 1) {
              displayHeading = parts[0].trim();
              const afterAuthor = parts[1].split('\n\n');
              displayAuthor = '— ' + afterAuthor[0].trim().replace(/^[-—\s]+/, '');
              if (afterAuthor.length > 1) {
                displayDesc = afterAuthor.slice(1).join('\n\n').trim();
              }
            } else {
              displayHeading = data.quote;
              displayAuthor = "";
              displayDesc = "";
            }
          }

          if (!displayHeading) {
            displayHeading = "Companies with high-performing websites outperform their competitors by nearly 80%.";
            displayAuthor = "- Watermark Consulting";
            displayDesc = "Your website is where buyers decide if you are worth trusting, now or ever. Every day it underperforms, you are leaving growth on the table.";
          }

          return (
            <div className="space-y-8 max-w-4xl mx-auto">
              <motion.h2 
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8 }}
                className="text-4xl md:text-[56px] font-normal leading-tight text-slate-900 tracking-tight"
                style={{ fontFamily: headingFont }}
              >
                {displayHeading}
              </motion.h2>
              
              {displayAuthor && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="text-sm md:text-base font-bold text-slate-900 tracking-wide uppercase"
                >
                  {displayAuthor}
                </motion.div>
              )}

              {displayDesc && (
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                  className="text-slate-500 text-xs md:text-sm max-w-2xl mx-auto leading-relaxed font-normal"
                >
                  {displayDesc}
                </motion.p>
              )}
            </div>
          );
        })()}
      </section>

      {/* 4. How We Help */}
      <section id="help" className="py-24 bg-slate-50/50 relative">
        <div id="approach" />
        <div id="value-prop" />
        <div id="how-we-help" />
        <div className="max-w-[1400px] mx-auto px-6 flex flex-col lg:flex-row gap-16">
          <div className="lg:w-1/3 lg:sticky lg:top-40 h-fit space-y-6">
            <h2 className="text-4xl font-bold text-slate-900" style={{ fontFamily: headingFont }}>{data.howWeHelpTitle}</h2>
            <p className="text-slate-600 leading-relaxed text-lg">
              {data.howWeHelpDesc}
            </p>
            <button onClick={() => {
              const target = resolveContactCtaUrl(data.howWeHelpButtonText, data.howWeHelpButtonUrl, '#cta');
              if (target.startsWith('/')) window.location.href = target;
              else scrollTo(target);
            }} className="bg-slate-900 text-white px-8 py-3.5 rounded-lg font-bold hover:bg-slate-800 transition-all inline-block mt-4">
              {data.howWeHelpButtonText}
            </button>
          </div>
          
          <div className="lg:w-2/3 grid md:grid-cols-2 gap-6">
            {data.howWeHelp.map((item: any, idx: number) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="bg-white rounded-2xl p-8 border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col h-full group"
              >
                <div className="w-12 h-12 rounded-lg bg-slate-100 mb-6 flex items-center justify-center relative overflow-hidden">
                   <div className={cn("absolute inset-0 opacity-20", (item.iconColor || '').includes('bg-') ? item.iconColor : 'theme-bg')}></div>
                   <div className={cn("w-6 h-6 rounded-sm opacity-80", (item.iconColor || '').includes('bg-') ? item.iconColor : 'theme-bg')}></div>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3 leading-snug">{item.title}</h3>
                <p className="text-slate-600 mb-6 text-sm flex-grow">{item.desc}</p>
                
                <ul className="space-y-3 mb-8">
                  {(item.features || []).map((feat: string, fidx: number) => (
                    <li key={fidx} className="flex items-start text-sm text-slate-700">
                      <ArrowUpRight className="w-4 h-4 text-slate-400 mr-2 shrink-0 mt-0.5" />
                      {feat}
                    </li>
                  ))}
                </ul>
                
                <a href={resolveContactCtaUrl(item.ctaText || "Speak with a Solutions Architect", item.ctaUrl, '#cta')} className="flex items-center justify-between text-sm theme-text font-semibold mt-auto pt-4 border-t border-slate-100 group-hover:theme-text transition-colors">
                  {item.ctaText || "Speak with a Solutions Architect"}
                  <span className="w-8 h-8 rounded theme-bg flex items-center justify-center text-white group-hover:theme-bg transition-colors">
                    <ArrowUpRight className="w-4 h-4" />
                  </span>
                </a>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* What Makes Us Different / Connected Growth Loop Section */}
      <section className="py-28 bg-white border-b border-slate-100 overflow-hidden relative">
        <div className="max-w-[1200px] mx-auto px-6 text-center space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="space-y-4"
          >
            <span className="text-emerald-500 font-bold uppercase tracking-[0.2em] text-xs md:text-sm">
              {data.connectedLoop.eyebrow}
            </span>
            <h2 className="text-3xl md:text-[44px] font-bold text-slate-900 leading-tight tracking-tight max-w-4xl mx-auto" style={{ fontFamily: headingFont }}>
              {data.connectedLoop.title}
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="max-w-3xl mx-auto space-y-6"
          >
            <p className="text-slate-500 text-base md:text-lg leading-relaxed font-normal">
              {data.connectedLoop.desc1}
            </p>
            <p className="text-slate-800 font-bold text-sm md:text-base leading-relaxed">
              {data.connectedLoop.desc2}
            </p>
          </motion.div>

          {/* Visual Step Connection Loop */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="relative flex flex-col md:flex-row items-center justify-between max-w-3xl mx-auto py-12 gap-8 md:gap-4 mt-8"
          >
            {/* Horizontal Line Connector */}
            <div className="hidden md:block absolute top-[52px] left-[15%] right-[15%] h-[2px] bg-slate-200/80 -z-0" />

            {(data.connectedLoop.steps || []).map((step: any, sIdx: number) => (
              <div key={sIdx} className="flex flex-col items-center relative z-10 flex-1">
                <div className="px-5 py-2 bg-emerald-500 text-white rounded-full text-xs font-bold tracking-wider shadow-md hover:scale-105 transition-transform duration-300">
                  {step.badge || `Step ${sIdx + 1}`}
                </div>
                <span className="text-slate-800 font-bold text-sm md:text-base mt-4 block text-center leading-snug">
                  {step.title}
                </span>
              </div>
            ))}
          </motion.div>

          {/* Connected Growth Loop Footer Accent */}
          {data.connectedLoop.footer && (
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.45 }}
              className="text-emerald-500 font-semibold italic text-base md:text-lg mt-6 tracking-wide block"
            >
              {data.connectedLoop.footer}
            </motion.div>
          )}

          {/* Left Vertical Line Accent Block */}
          {data.connectedLoop.accentText && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="border-l-[5px] border-emerald-500 pl-6 text-left max-w-3xl mx-auto mt-16 pt-1 pb-1"
            >
              <p className="text-2xl md:text-[32px] font-extrabold text-slate-900 leading-snug tracking-tight">
                {data.connectedLoop.accentText}
              </p>
            </motion.div>
          )}
        </div>
      </section>

      {/* 5. Challenges */}
      <section id="challenges" className="py-24 md:py-32 bg-[#f4f7fc] overflow-hidden relative">
        <div id="key-challenges" />
        <div className="max-w-[1400px] mx-auto px-6 text-center">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight" 
            style={{ fontFamily: headingFont }}
          >
            {data.challengesTitle}
          </motion.h2>
          
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-4xl font-extrabold tracking-tight mt-2 mb-16 theme-text" 
            style={{ fontFamily: headingFont }}
          >
            {data.challengesHighlight}
          </motion.div>
          
          <div className="flex flex-wrap justify-center gap-y-8 gap-x-6 md:gap-y-12 md:gap-x-10 max-w-6xl mx-auto py-4 relative">
            {data.challenges.map((challenge: string, idx: number) => {
              // Predefined card visual specs to recreate the organic, rotated, offset cloud layout
              const getChallengeStyle = (i: number, pColor: string) => {
                const styles = [
                  {
                    className: "md:-translate-y-4 md:-rotate-[3deg] bg-white border border-slate-100/80 shadow-[0_12px_28px_rgba(148,163,184,0.08)]",
                    style: {}
                  },
                  {
                    className: "md:translate-y-2 md:rotate-[2.5deg] border border-slate-100/50 shadow-[0_12px_28px_rgba(148,163,184,0.08)]",
                    style: { backgroundColor: `${pColor}0c` }
                  },
                  {
                    className: "md:-translate-y-6 md:rotate-[4deg] bg-[#ebecf5] border border-slate-200/50 shadow-[0_12px_28px_rgba(148,163,184,0.08)]",
                    style: {}
                  },
                  {
                    className: "md:-translate-x-4 md:translate-y-3 md:-rotate-[4.5deg] bg-[#dfdfef] border border-slate-200/50 shadow-[0_12px_28px_rgba(148,163,184,0.08)]",
                    style: {}
                  },
                  {
                    className: "md:scale-105 md:rotate-[1.5deg] border font-bold z-10 shadow-[0_15px_35px_rgba(0,0,128,0.1)]",
                    style: { 
                      backgroundColor: `${pColor}20`, 
                      borderColor: `${pColor}44`,
                      color: pColor 
                    }
                  },
                  {
                    className: "md:translate-x-4 md:-translate-y-1 md:-rotate-[2.5deg] border border-slate-100/50 shadow-[0_12px_28px_rgba(148,163,184,0.08)]",
                    style: { backgroundColor: `${pColor}12` }
                  },
                  {
                    className: "md:translate-y-4 md:-translate-x-1 md:-rotate-[3.5deg] bg-white border border-slate-100/80 shadow-[0_12px_28px_rgba(148,163,184,0.08)]",
                    style: {}
                  },
                  {
                    className: "md:translate-y-6 md:translate-x-2 md:rotate-[3deg] bg-white border border-slate-100/80 shadow-[0_12px_28px_rgba(148,163,184,0.08)]",
                    style: {}
                  }
                ];
                return styles[i % styles.length];
              };
              
              const cardSpec = getChallengeStyle(idx, primaryColor);
              
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.9, y: 30 }}
                  whileInView={{ opacity: 1, scale: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.5, delay: idx * 0.05 }}
                  className={cn(
                    "w-full sm:w-[calc(50%-12px)] md:w-[280px] lg:w-[310px] p-6 rounded-[20px] text-center flex items-center justify-center min-h-[110px] md:min-h-[130px] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_40px_rgba(148,163,184,0.16)] hover:scale-105 cursor-default",
                    cardSpec.className
                  )}
                  style={{ ...cardSpec.style, fontFamily: headingFont }}
                >
                  <p 
                    className={cn(
                      "text-sm md:text-[15px] font-semibold leading-snug tracking-tight",
                      idx % 8 === 4 ? "" : "text-slate-800"
                    )}
                    style={idx % 8 === 4 ? { color: primaryColor } : {}}
                  >
                    {challenge}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 6. Progress Looks Like (Case Studies) */}
      <section id="success" className="py-32 bg-[#24272c] text-white relative">
        <div id="evidence" />
        <div id="case-studies" />
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: headingFont }}>
                {data.progressTitle} <span className="theme-text">{data.progressHighlight}</span>
              </h2>
              <p className="text-slate-400 max-w-xl text-lg">
                {data.progressDesc}
              </p>
            </div>
            <Link to="/portfolio" className="text-sm font-semibold flex items-center hover:theme-text transition-colors">
              {data.progressLinkText} <ArrowUpRight className="w-4 h-4 ml-2" />
            </Link>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {displayCaseStudies.map((study: any, idx: number) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: idx * 0.2 }}
              >
                <Link
                  to={study.slug ? `/portfolio/${study.slug}` : '/portfolio'}
                  className="group relative rounded-2xl overflow-hidden aspect-[4/3] md:aspect-[16/10] block"
                >
                  <div className="absolute inset-0 bg-black/40 z-10 group-hover:bg-black/20 transition-colors duration-500"></div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent z-10"></div>
                  <img 
                    src={study.image || study.coverImage} 
                    alt={study.client || study.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 z-20 p-8 md:p-12 flex flex-col justify-between">
                    <h3 className="text-2xl font-bold italic opacity-90">{study.client || study.logoText}</h3>
                    <div className="translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                      <p className="text-xl md:text-2xl font-medium leading-snug">{study.title}</p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Awards */}
      {content.globalAwardsEnabled !== false && content.growth?.awardsEnabled !== false && (
        <section className="py-20 bg-[#1c1e22] border-t border-white/5">
          <div className="max-w-[1400px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-12">
            <h3 className="text-2xl text-white font-semibold whitespace-pre-line max-w-xs">
              {data.awardsTitle}
            </h3>
            <div className="flex flex-wrap items-center justify-center md:justify-end gap-12 md:gap-20 opacity-70">
              {(data.awards || []).map((award: any, idx: number) => (
                <div key={idx} className="text-white font-bold text-xl flex items-center gap-3">
                  {award.image ? (
                    <img 
                      src={award.image} 
                      alt={award.text || "Award Badge"} 
                      className="h-8 w-auto object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    renderAwardIcon(award.icon)
                  )}
                  {award.text && <span>{award.text}</span>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 8. Engineering Friction Quote */}
      <section className="py-32 bg-[#24272c] text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-white/5 to-transparent skew-x-12 translate-x-32"></div>
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-normal leading-tight" style={{ fontFamily: headingFont }}>
              {data.frictionTitle}
            </h2>
          </div>
          
          <div className="flex flex-col md:flex-row items-center gap-12 max-w-5xl mx-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="w-64 h-64 shrink-0 rounded-tl-[64px] rounded-br-[64px] rounded-tr-xl rounded-bl-xl overflow-hidden border-4 border-white/10 relative"
            >
              <img src={data.frictionImage} alt="Engineer" className="w-full h-full object-cover" />
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="text-lg md:text-2xl leading-relaxed text-slate-300 font-light"
            >
              {data.frictionDescription}
            </motion.div>
          </div>
        </div>
      </section>

      {/* 9. Tech Stack */}
      <ScrollDrivenTechStack 
        title={data.techStackTitle}
        desc={data.techStackDesc}
        techStack={data.techStack}
        headingFont={headingFont}
        backgroundImage={data.techStackImage}
      />

      {/* 10. Our Process */}
      <section 
        id="process" 
        className="relative bg-slate-50/50"
      >
        <div id="engagement" />
        <div id="our-process" />

        {/* Desktop Layout (Standard Sticky Scroll) */}
        <div 
          className="hidden lg:block relative max-w-[1400px] mx-auto px-6 py-24"
          ref={processSectionRef}
        >
          <div className="grid grid-cols-12 gap-16 items-start w-full">
            {/* Left Column: Title and Interactive Steps */}
            <div className="col-span-5 sticky top-[100px] flex flex-col space-y-8 pr-4 py-8">
              <div className="space-y-3 shrink-0">
                <span className="text-xs font-extrabold uppercase tracking-widest px-4 py-1.5 rounded-full bg-[#000080]/10 text-[#000080] inline-block">
                  {data.processBadge || "How We Deliver Success"}
                </span>
                <h2 className="text-4xl font-bold text-slate-900 leading-tight" style={{ fontFamily: headingFont }}>
                  {data.processTitle || data.engagementTitle || "Our Process"}
                </h2>
                <p className="text-slate-500 text-sm max-w-md">
                  Scroll naturally to navigate through our methodology, or click any phase to jump directly to its details.
                </p>
              </div>

              <div className="relative pl-12 shrink-0 pb-8">
                {/* Timeline Track Lines */}
                <div className="absolute left-6 top-4 bottom-4 w-[3px] bg-slate-200/50 rounded-full" />
                <motion.div 
                  className="absolute left-6 top-4 bottom-4 w-[3px] bg-[#000080] rounded-full origin-top"
                  style={{ scaleY: scrollYProgress }}
                />

                <div className="space-y-3">
                  {stepsList.map((stepItem: any, idx: number) => {
                    const stepNum = stepItem.step || (idx + 1 < 10 ? `0${idx + 1}` : `${idx + 1}`);
                    const safeActiveStepIndex = Math.min(Math.max(0, activeStepIndex), Math.max(0, stepsList.length - 1));
                    const isActive = idx === safeActiveStepIndex;
                    
                    return (
                      <div
                        key={idx}
                        className={cn(
                          "relative pl-6 py-4 rounded-xl cursor-pointer transition-all duration-300 group select-none border border-transparent",
                          isActive 
                            ? "bg-white shadow-md border-slate-100/80" 
                            : "hover:bg-slate-100/50"
                        )}
                        onClick={() => {
                          const target = document.getElementById(`desktop-step-${idx}`);
                          if (target) {
                            const y = target.getBoundingClientRect().top + window.pageYOffset - 100;
                            window.scrollTo({ top: y, behavior: 'smooth' });
                          }
                        }}
                      >
                        {/* Timeline Node Circular Bubble */}
                        <div className="absolute left-[-35px] top-1/2 -translate-y-1/2 z-10 flex items-center justify-center">
                          <span className={cn(
                            "w-7 h-7 rounded-full text-xs font-black flex items-center justify-center transition-all duration-300 border shadow-sm",
                            isActive 
                              ? "bg-[#000080] text-white border-[#000080] ring-4 ring-[#000080]/15 scale-110" 
                              : "bg-white text-slate-400 border-slate-200 group-hover:border-slate-300 group-hover:text-slate-600"
                          )}>
                            {idx + 1}
                          </span>
                        </div>

                        <div className="space-y-0.5">
                          <span className={cn(
                            "text-[10px] uppercase tracking-wider font-extrabold block transition-colors duration-300",
                            isActive ? "text-[#000080]" : "text-slate-400 group-hover:text-slate-600"
                          )}>
                            Step {stepNum}
                          </span>
                          <h3 className={cn(
                            "text-base font-bold transition-colors duration-300",
                            isActive ? "text-slate-900" : "text-slate-600 group-hover:text-slate-800"
                          )}>
                            {stepItem.title}
                          </h3>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Cards Stack */}
            <div className="col-span-7 flex flex-col items-center justify-start space-y-24 py-8">
              {stepsList.map((stepItem: any, idx: number) => (
                <motion.div
                  key={idx}
                  id={`desktop-step-${idx}`}
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: false, margin: "-10% 0px -10% 0px" }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="bg-white rounded-2xl border border-slate-100 shadow-xl flex flex-col w-full max-w-xl"
                >
                  <div className="p-8 flex flex-col space-y-6">
                    {/* Visual Asset Block */}
                    {stepItem.image ? (
                      <div className="relative h-[250px] shrink-0 w-full rounded-xl overflow-hidden shadow-inner group bg-slate-100">
                        <img 
                          src={stepItem.image} 
                          alt={stepItem.title} 
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg border border-white/10">
                          Step {idx + 1} of {stepsList.length}
                        </div>
                      </div>
                    ) : (
                      <div className="relative h-[250px] shrink-0 w-full rounded-xl overflow-hidden shadow-inner bg-[#000080]/5 flex items-center justify-center group border border-[#000080]/10">
                        <div className="w-20 h-20 rounded-2xl bg-white shadow-xl flex items-center justify-center transform transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
                          <span className="text-3xl text-[#000080] font-black">{idx + 1}</span>
                        </div>
                        <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg border border-white/10">
                          Step {idx + 1} of {stepsList.length}
                        </div>
                      </div>
                    )}
                    
                    {/* Content Block */}
                    <div className="flex-1 flex flex-col">
                      <div className="mb-6 space-y-2">
                        <span className="text-[11px] font-black uppercase tracking-widest text-[#000080]/70 bg-[#000080]/5 px-3 py-1 rounded-full inline-block">
                          Phase {idx + 1}
                        </span>
                        <h3 className="text-2xl font-bold text-slate-900 leading-tight">
                          {stepItem.title}
                        </h3>
                      </div>
                      
                      <p className="text-slate-600 leading-relaxed text-sm">
                        {stepItem.desc || stepItem.description}
                      </p>

                      <div className="mt-8 pt-6 border-t border-slate-100">
                        <button 
                          onClick={() => {
                            const target = resolveContactCtaUrl(stepItem.ctaText || "Let's Talk", stepItem.ctaUrl, '#cta');
                            if (target.startsWith('#')) {
                              scrollTo(target.replace('#', ''));
                            } else {
                              window.location.href = target;
                            }
                          }} 
                          className="bg-[#000080] hover:bg-[#000066] text-white px-6 py-3 rounded-xl text-[13px] font-bold transition-all shadow-md hover:shadow-xl hover:-translate-y-0.5 inline-flex items-center gap-2"
                        >
                          <span>{stepItem.ctaText || "Let's Talk"}</span>
                          <ArrowUpRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile Layout (Responsive List View - Non-pinning) */}
        <div className="lg:hidden max-w-xl mx-auto py-12 px-6" ref={mobileProcessRef}>
          <div className="text-center space-y-2 mb-10">
            <span className="text-[10px] font-extrabold uppercase tracking-widest px-3.5 py-1 rounded-full bg-[#000080]/10 text-[#000080] inline-block">
              {data.processBadge || "How We Deliver Success"}
            </span>
            <h2 className="text-3xl font-bold text-slate-900" style={{ fontFamily: headingFont }}>
              {data.processTitle || data.engagementTitle || "Our Process"}
            </h2>
          </div>

          <div className="relative pl-10 space-y-6">
            {/* Timeline Track Lines */}
            <div className="absolute left-[11px] top-4 bottom-4 w-[2px] bg-slate-200/50 rounded-full" />
            <motion.div 
              className="absolute left-[11px] top-4 bottom-4 w-[2px] bg-[#000080] rounded-full origin-top"
              style={{ scaleY: mobileScrollYProgress }}
            />

            {stepsList.map((stepItem: any, idx: number) => {
              const stepNum = stepItem.step || (idx + 1 < 10 ? `0${idx + 1}` : `${idx + 1}`);

              return (
                <div key={idx} className="relative">
                  {/* Step Node indicator on the timeline */}
                  <div className={cn(
                    "absolute -left-10 top-5 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold z-10",
                    "bg-[#000080] text-white shadow-md shadow-[#000080]/20"
                  )}>
                    {idx + 1}
                  </div>
                  
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Card Header */}
                    <div className="w-full text-left p-5 flex items-center justify-between gap-4 border-b border-slate-50">
                      <div className="flex items-center gap-3">
                        <div>
                          <span className="text-[9px] uppercase tracking-wider font-extrabold text-[#000080]/70 block mb-0.5">
                            Step {stepNum}
                          </span>
                          <h3 className="text-sm font-bold text-slate-900 leading-tight">
                            {stepItem.title}
                          </h3>
                        </div>
                      </div>
                    </div>

                    {/* Card Content */}
                    <div className="px-5 py-5 space-y-4">
                      {stepItem.image && (
                        <div className="relative h-[200px] w-full rounded-lg overflow-hidden bg-slate-100 mb-2">
                          <img 
                            src={stepItem.image} 
                            alt={stepItem.title} 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}
                      
                      <p className="text-slate-600 text-sm leading-relaxed">
                        {stepItem.desc || stepItem.description}
                      </p>

                      <div className="pt-2">
                        <button 
                          onClick={() => {
                            const target = resolveContactCtaUrl(stepItem.ctaText || "Let's Talk", stepItem.ctaUrl, '#cta');
                            if (target.startsWith('#')) {
                              scrollTo(target.replace('#', ''));
                            } else {
                              window.location.href = target;
                            }
                          }} 
                          className="bg-[#000080] hover:bg-[#000066] text-white px-5 py-2.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-sm"
                        >
                          <span>{stepItem.ctaText || "Let's Talk"}</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 11. Dynamic Content Feeds (Portfolio & Blog) */}
      {(displayPortfolio.length > 0 || displayBlog.length > 0) && (
        <section id="feeds" className="py-32 bg-white">
          <div className="max-w-[1400px] mx-auto px-6 space-y-32">
            {displayPortfolio.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-16">
                  <div>
                    <h2 className="text-4xl font-bold text-slate-900 mb-4" style={{ fontFamily: headingFont }}>Success Stories</h2>
                    <p className="text-slate-500 max-w-xl">Deep dives into how we've solved complex engineering challenges for our partners.</p>
                  </div>
                  <Link to="/portfolio" className="text-sm font-bold flex items-center gap-2 theme-text hover:underline transition-all">
                    Explore All Projects <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {displayPortfolio.map((item: any, idx: number) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      className="group cursor-pointer"
                    >
                      <Link to="/portfolio">
                        <div className="relative aspect-[16/10] rounded-3xl overflow-hidden mb-6 bg-slate-100 shadow-sm">
                          <img src={item.coverImage} alt={item.title || 'ProFox project'} loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        </div>
                        <div className="text-[10px] font-bold theme-text uppercase tracking-widest mb-2">{item.category}</div>
                        <h3 className="text-xl font-bold text-slate-900 group-hover:theme-text transition-colors leading-tight">{item.title}</h3>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {displayBlog.length > 0 && (
              <div className="pt-32 border-t border-slate-100">
                <div className="flex items-center justify-between mb-16">
                  <div>
                    <h2 className="text-4xl font-bold text-slate-900 mb-4" style={{ fontFamily: headingFont }}>Latest Insights</h2>
                    <p className="text-slate-500 max-w-xl">Thoughts on engineering, architecture, and the future of digital infrastructure.</p>
                  </div>
                  <Link to="/blog" className="text-sm font-bold flex items-center gap-2 theme-text hover:underline transition-all">
                    Read the Blog <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {displayBlog.map((post: any, idx: number) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      className="flex flex-col h-full group"
                    >
                      <div className="aspect-video rounded-3xl overflow-hidden mb-6 bg-slate-50">
                        <img src={post.coverImage} alt={post.title || 'ProFox insight'} loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                      </div>
                      <div className="flex items-center gap-4 mb-4">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{post.category}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{post.readTime}</span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 group-hover:theme-text transition-colors leading-snug mb-4">{post.title}</h3>
                      <Link to={`/blog/${post.slug}`} className="mt-auto flex items-center gap-2 text-xs font-bold theme-text group-hover:translate-x-1 transition-transform">
                        Read Full Article <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 11.5 Pricing */}
      {!data.hidePricing && data.pricing && data.pricing.length > 0 && (
        <section id="pricing" className="py-32 bg-slate-50">
          <div className="max-w-[1400px] mx-auto px-6">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6" style={{ fontFamily: headingFont }}>Pricing Models</h2>
              <p className="text-slate-500 max-w-2xl mx-auto">Flexible engagement structures designed to fit your project scope and engineering needs.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {data.pricing.map((plan: any, idx: number) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="bg-white rounded-[40px] p-10 border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-500 flex flex-col group"
                >
                  <div className="mb-8">
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{plan.name}</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-black text-slate-900">$</span>
                      <span className="text-6xl font-black text-slate-900 tracking-tighter">{plan.price}</span>
                      <span className="text-slate-400 font-bold ml-2">/ {plan.period}</span>
                    </div>
                  </div>
                  <ul className="space-y-4 mb-12 flex-grow">
                    {plan.features.map((feature: string, fidx: number) => (
                      <li key={fidx} className="flex items-start gap-3 text-sm text-slate-600">
                        <Check className="w-5 h-5 theme-text shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => scrollTo('cta')} className="w-full py-4 rounded-2xl theme-bg text-white font-bold transition-all hover:shadow-lg hover:shadow-blue-900/20 group-hover:scale-[1.02]">
                    Choose {plan.name}
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 11. Our Resources */}
      <section id="resources" className="py-24 bg-white relative">
        <div id="insights" />
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="flex items-center justify-between mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: headingFont }}>
              {data.resourcesTitle || "Our Resources"}
            </h2>
            <Link to="/blog" className="text-sm font-bold flex items-center text-slate-600 hover:theme-text transition-colors">
              {data.resourcesLinkText || "View All Resources"} <ArrowUpRight className="w-4 h-4 ml-2" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {dynamicResources.slice(0, 3).map((res: any, idx: number) => {
              return (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="group cursor-pointer flex"
                >
                  <Link 
                    to={res.slug ? `/blog/${res.slug}` : "/blog"} 
                    className="flex flex-col justify-between w-full p-6 rounded-[24px] bg-white border border-slate-100 shadow-[0_4px_25px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)] hover:border-slate-200/60 transition-all duration-300"
                  >
                    <div>
                      <div className="text-sm font-bold tracking-wider mb-3 theme-text">
                        {res.category || "Insight"}
                      </div>
                      <h3 className="text-xl font-bold leading-snug text-slate-900 group-hover:theme-text transition-colors">
                        {res.title}
                      </h3>
                    </div>
                    
                    <div className="mt-8 relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100">
                      <img 
                        src={res.image} 
                        alt={res.title} 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                      />
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 12. Frequently Asked Questions & CTA */}
      <section id="faq" className="py-24 bg-slate-50/50 relative border-t border-slate-100">
        <div id="faqs" />
        <div className="max-w-[1400px] mx-auto px-6 space-y-24">
          
          {/* FAQ Block */}
          <div className="flex flex-col lg:flex-row gap-16">
            <div className="lg:w-1/3 lg:sticky lg:top-40 h-fit space-y-6">
              <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight leading-tight" style={{ fontFamily: headingFont }}>
                {data.faqsTitle || "Frequently Asked Questions"}
              </h2>
              <p className="text-slate-600 mb-8 leading-relaxed">
                {data.faqsDesc ? (
                  data.faqsDesc.includes("contact us") ? (
                    <>
                      {data.faqsDesc.split("contact us")[0]}
                      <Link to="/contact-us" className="theme-text font-bold underline hover:opacity-80">contact us</Link>
                      {data.faqsDesc.split("contact us")[1]}
                    </>
                  ) : (
                    data.faqsDesc
                  )
                ) : "When companies like yours are evaluating a website redesign, these are the questions that come up most. For any additional questions you have, feel free to contact us."}
              </p>
            </div>
            <div className="lg:w-2/3 space-y-4">
              {(data.faqs || []).map((faq: any, idx: number) => (
                <div 
                  key={idx} 
                  className={cn(
                    "bg-white border rounded-xl overflow-hidden shadow-sm transition-all duration-300",
                    openFaq === idx ? "theme-border" : "border-slate-200"
                  )}
                >
                  <button 
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full text-left px-6 py-5 flex items-center justify-between font-semibold text-slate-900 text-lg hover:theme-text transition-colors"
                  >
                    <span className="pr-4">{typeof faq === 'string' ? faq : faq.question}</span>
                    <ChevronDown className={cn("w-5 h-5 theme-text shrink-0 transition-transform duration-300", openFaq === idx ? "rotate-180" : "")} />
                  </button>
                  {openFaq === idx && (
                    <div className="px-6 pb-6 text-slate-600 leading-relaxed border-t border-slate-50 pt-4 text-base">
                      {typeof faq === 'string' 
                        ? "We tailor our approach to fit your specific needs, leveraging modern frameworks and integrations to ensure scalability and seamless performance across your organization."
                        : faq.answer
                      }
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-200/60" />

          {/* Let's Create Real Digital Impact CTA Block */}
          <div id="cta" className="flex flex-col lg:flex-row items-start justify-between gap-12 py-6">
            <div className="lg:w-1/2">
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-normal text-slate-900 tracking-tight leading-tight" style={{ fontFamily: headingFont }}>
                {data.ctaTitle || "Let’s Create Real Digital Impact"}
              </h2>
            </div>
            <div className="lg:w-1/2 flex flex-col items-start gap-6">
              <p className="text-slate-700 text-lg leading-relaxed max-w-xl">
                {data.ctaDescription || "Let's build a digital experience that drives real, measurable growth, and makes your investment impossible to question."}
              </p>
              <Link to={resolveContactCtaUrl(data.ctaButtonText || "Start the Conversation", data.ctaUrl, '/contact-us')} className="bg-[#1a1c1e] text-white px-8 py-4 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10">
                {data.ctaButtonText || "Start the Conversation"}
              </Link>
            </div>
          </div>

        </div>
      </section>
    </div>
  );
}
