import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCMS } from '../lib/CMSProvider';
import { formatR2ImageUrl } from '../lib/r2Media';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Share2,
  Check,
  Palette,
  Layout,
  Monitor,
  Images,
  Maximize2,
  ExternalLink,
  Type,
  X,
  Cpu,
  Code2,
  Globe,
  ShoppingBag,
  ShoppingCart,
  Store,
  LayoutTemplate,
  Workflow,
  Target,
  FileCode2,
  Atom,
  Terminal,
  Code,
  FileCode,
  RefreshCw,
  Server,
  Zap,
  Boxes,
  Network,
  Link as LinkIcon,
  Radio,
  CreditCard,
  Database,
  HardDrive,
  Flame,
  Cloud,
  CloudLightning,
  Box,
  Search,
  PenTool,
  Layers,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Info,
  FolderPlus,
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react';
import CTA from '../components/CTA';
import { defaultPortfolioItems } from '../data';
import { PREDEFINED_TECH_STACK } from '../data/techStackOptions';

interface ParsedPainPoint {
  mainGoal: string;
  workflows: string[];
  risks: string[];
}

function parsePainPoint(text: string): ParsedPainPoint {
  if (!text) return { mainGoal: '', workflows: [], risks: [] };

  const cleanText = text.trim();

  // Extract workflow items from phrases like "including x, y, z", "spanning x, y, z", "covering x, y, z", "such as x, y, z"
  let workflows: string[] = [];
  const workflowMatch = cleanText.match(/(?:including|includes|spanning|covering|addressing|such as)\s+([^.]+)/i);
  if (workflowMatch && workflowMatch[1]) {
    const rawMatch = workflowMatch[1];
    workflows = rawMatch
      .split(/,|;| and /)
      .map(s => s.trim())
      .filter(s => s.length > 2 && !s.toLowerCase().startsWith('without') && !s.toLowerCase().startsWith('making it') && !s.toLowerCase().startsWith('to '));
  }

  // Split into sentences
  const sentences = cleanText
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  let mainGoal = sentences[0] || cleanText;
  let riskSentences: string[] = [];

  for (let i = 1; i < sentences.length; i++) {
    const s = sentences[i];
    if (
      s.toLowerCase().startsWith('without') ||
      s.toLowerCase().includes('can face') ||
      s.toLowerCase().includes('face ') ||
      s.toLowerCase().includes('inconsistenc') ||
      s.toLowerCase().includes('fragmented') ||
      s.toLowerCase().includes('conflict') ||
      s.toLowerCase().includes('risk') ||
      s.toLowerCase().includes('not sufficient') ||
      s.toLowerCase().includes('uncertain') ||
      s.toLowerCase().includes('difficult') ||
      s.toLowerCase().includes('reduce')
    ) {
      riskSentences.push(s);
    } else {
      mainGoal += ' ' + s;
    }
  }

  if (riskSentences.length === 0) {
    const withoutIdx = cleanText.indexOf('Without ');
    if (withoutIdx > 15) {
      mainGoal = cleanText.substring(0, withoutIdx).trim();
      riskSentences.push(cleanText.substring(withoutIdx).trim());
    }
  }

  let risks: string[] = [];
  riskSentences.forEach(rs => {
    const faceMatch = rs.match(/(?:can face|face|face |leading to|causing|result in)\s+([^.]+)/i);
    if (faceMatch && faceMatch[1] && faceMatch[1].includes(',')) {
      const riskItems = faceMatch[1]
        .split(/,| and /)
        .map(r => r.trim())
        .filter(r => r.length > 3);

      if (riskItems.length > 1) {
        riskItems.forEach(ri => {
          const cap = ri.charAt(0).toUpperCase() + ri.slice(1);
          risks.push(cap);
        });
        return;
      }
    }
    risks.push(rs);
  });

  return {
    mainGoal,
    workflows,
    risks,
  };
}

function StructuredPainPoint({ text }: { text: string }) {
  if (!text) return null;

  const parsed = parsePainPoint(text);

  return (
    <div className="pt-8 border-t border-slate-100 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/80 shadow-xs shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Core Operational Challenge</div>
          <h3 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Key Pain Points & System Gaps</h3>
        </div>
      </div>

      {/* Main Core Requirement */}
      <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-5 md:p-6 space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
          <Target className="w-4 h-4 text-[#000080]" />
          Primary Operational Requirement
        </div>
        <p className="text-base text-slate-800 leading-relaxed font-medium">
          {parsed.mainGoal}
        </p>
      </div>

      {/* Affected Workflows Badges */}
      {parsed.workflows.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Workflow className="w-4 h-4 text-[#000080]" />
            Interconnected Operational Workflows ({parsed.workflows.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {parsed.workflows.map((wf, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 shadow-xs hover:border-[#000080]/30 transition-colors capitalize"
              >
                <span className="w-2 h-2 rounded-full bg-[#000080]" />
                {wf}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Risks Without Centralized Controls */}
      {parsed.risks.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="text-xs font-bold uppercase tracking-wider text-rose-600 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            Operational Risks Without System Controls
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {parsed.risks.map((risk, idx) => (
              <div
                key={idx}
                className="p-4 bg-rose-50/60 border border-rose-100 rounded-2xl flex items-start gap-3 shadow-xs"
              >
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span className="text-xs md:text-sm text-slate-800 font-semibold leading-relaxed">
                  {risk}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarPainPoint({ text }: { text: string }) {
  if (!text) return null;

  const parsed = parsePainPoint(text);

  return (
    <div className="space-y-3.5 pt-1">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          Pain Point
        </div>
        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
          Core Gap
        </span>
      </div>

      <p className="text-xs text-slate-800 leading-relaxed font-medium">
        {parsed.mainGoal}
      </p>

      {parsed.workflows.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Affected Workflows:</div>
          <div className="flex flex-wrap gap-1">
            {parsed.workflows.map((wf, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-semibold text-slate-700 shadow-xs capitalize"
              >
                {wf}
              </span>
            ))}
          </div>
        </div>
      )}

      {parsed.risks.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Operational Risks:</div>
          <ul className="space-y-1.5">
            {parsed.risks.map((risk, idx) => (
              <li key={idx} className="flex items-start gap-1.5 text-xs text-slate-700">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                <span className="leading-snug font-medium">{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function VisualCard({ vis, onOpenLightbox }: { vis: any; onOpenLightbox: (vis: any, activeImgUrl: string) => void; key?: any }) {
  const allImages = [vis.imageUrl, ...(vis.images || [])].filter(Boolean);
  const [activeIdx, setActiveIdx] = useState(0);

  const nextImg = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIdx((prev) => (prev + 1) % allImages.length);
  };

  const prevImg = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIdx((prev) => (prev - 1 + allImages.length) % allImages.length);
  };

  return (
    <div 
      className="group relative bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-[#000080]/60 transition-all duration-300 flex flex-col justify-between shadow-md hover:shadow-2xl"
    >
      <div>
        {/* Browser/Window Frame Top Bar */}
        <div className="bg-slate-100/90 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          </div>
          <span className="text-[10px] font-mono text-slate-500 truncate max-w-[180px]">
            {vis.title}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-[#000080] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
            {vis.category || 'UI SCREEN'}
          </span>
        </div>

        {/* Screen Image Container */}
        <div 
          onClick={() => onOpenLightbox(vis, allImages[activeIdx])}
          className="relative aspect-[16/10] overflow-hidden bg-slate-100 cursor-pointer border-b border-slate-100"
        >
          <img
            src={formatR2ImageUrl(allImages[activeIdx])}
            alt={`${vis.title} - Image ${activeIdx + 1}`}
            className="w-full h-full object-cover object-top group-hover:scale-[1.03] transition-transform duration-700 ease-in-out"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200';
            }}
          />

          {/* Navigation Arrows for multi-image */}
          {allImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={prevImg}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-[#000080] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10 shadow-lg border border-slate-200 hover:scale-110 active:scale-95"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={nextImg}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-[#000080] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10 shadow-lg border border-slate-200 hover:scale-110 active:scale-95"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              {/* Counter Badge */}
              <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] font-bold text-[#000080] z-10 shadow-md border border-slate-200/50">
                {activeIdx + 1} / {allImages.length}
              </div>
            </>
          )}

          <div className="absolute inset-0 bg-slate-900/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
            <div className="px-5 py-2.5 bg-white/95 text-[#000080] text-[11px] font-bold rounded-2xl border border-slate-200 flex items-center gap-2.5 shadow-2xl transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 backdrop-blur-sm">
              <Maximize2 className="w-4 h-4" /> EXPLORE HIGH-FIDELITY VIEW
            </div>
          </div>
        </div>

        {/* Thumbnails below if multiple images */}
        {allImages.length > 1 && (
          <div className="p-4 bg-slate-50/50 flex items-center gap-2.5 overflow-x-auto no-scrollbar border-b border-slate-100">
            {allImages.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveIdx(i)}
                className={`w-14 h-9 rounded-lg border-2 overflow-hidden shrink-0 transition-all duration-300 ${
                  activeIdx === i ? 'border-[#000080] shadow-md scale-105' : 'border-transparent opacity-60 hover:opacity-100 grayscale hover:grayscale-0'
                }`}
              >
                <img 
                  src={formatR2ImageUrl(img)} 
                  alt="" 
                  className="w-full h-full object-cover object-top" 
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200';
                  }}
                />
              </button>
            ))}
          </div>
        )}

        {/* Screen Info Caption */}
        <div className="p-4 bg-white space-y-2">
          <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#000080] transition-colors">
            {vis.title}
          </h4>
          {vis.caption && (
            <p className="text-xs text-slate-500 leading-relaxed">
              {vis.caption}
            </p>
          )}
        </div>
      </div>

      {/* Associated Documents / Downloads Section */}
      {vis.documents && vis.documents.length > 0 && (
        <div className="p-4 bg-slate-50/50 border-t border-slate-100 space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Attached Files & Reference Docs ({vis.documents.length})
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {vis.documents.map((doc: any, docIdx: number) => (
              <a
                key={docIdx}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 hover:border-[#000080] hover:bg-blue-50/30 transition-all text-xs group/doc cursor-pointer"
              >
                <div className="flex items-center gap-1.5 truncate pr-2">
                  <FileText className="w-3.5 h-3.5 text-slate-400 group-hover/doc:text-[#000080] shrink-0" />
                  <span className="font-bold text-slate-800 truncate">{doc.name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[9px] bg-slate-100 text-slate-500 font-extrabold px-1.5 py-0.5 rounded uppercase">
                    {doc.type || 'file'}
                  </span>
                  <Download className="w-3.5 h-3.5 text-slate-400 group-hover/doc:text-[#000080] transition-colors" />
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PortfolioDetailView() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { content, loading } = useCMS();
  const [copied, setCopied] = React.useState(false);
  const [selectedVisualFilter, setSelectedVisualFilter] = useState<string>('All');
  const [selectedTechCategory, setSelectedTechCategory] = useState<string>('All');
  const [lightboxImage, setLightboxImage] = useState<any | null>(null);
  const [lightboxActiveUrl, setLightboxActiveUrl] = useState<string | null>(null);
  
  const cmsItems = Array.isArray(content.portfolio_items) ? content.portfolio_items : [];
  const combinedItems = [...cmsItems];

  // Merge default items into combined list if not already present
  for (const defItem of defaultPortfolioItems) {
    if (!combinedItems.some((p: any) => p.id === defItem.id || p.slug === defItem.slug)) {
      combinedItems.push(defItem);
    }
  }

  // Find item by slug or fallback
  let item = combinedItems.find((p: any) => p.slug === slug || p.id === slug);
  if (!item && slug === 'tes') {
    item = combinedItems.find((p: any) => p.slug === 'tes' || p.id === 'tes') || defaultPortfolioItems[0];
  }

  const allVisuals = item?.designShowcase?.visuals || [];
  const filteredVisuals = allVisuals.filter((vis: any) => {
    if (selectedVisualFilter === 'All') return true;
    return vis.category === selectedVisualFilter;
  });

  // Resolve project tech stack items
  const itemTechNames: string[] = item?.techStack || item?.technologies || item?.tags || [
    'WordPress', 'JavaScript (ES6+)', 'TypeScript', 'React.js', 'PHP', 'Tailwind CSS', 'PostgreSQL', 'Figma Design System'
  ];

  const resolvedTechItems = itemTechNames.map(name => {
    const matched = PREDEFINED_TECH_STACK.find(t => t.name.toLowerCase() === name.toLowerCase() || t.id === name.toLowerCase());
    if (matched) return matched;
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      category: 'Languages & Frameworks' as const,
      badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
      iconName: 'Code2'
    };
  });

  const filteredTechItems = resolvedTechItems.filter(tech => {
    if (selectedTechCategory === 'All') return true;
    return tech.category === selectedTechCategory;
  });

  const renderTechIcon = (iconName: string) => {
    const props = { className: "w-4 h-4" };
    switch (iconName) {
      case 'Globe': return <Globe {...props} />;
      case 'ShoppingBag': return <ShoppingBag {...props} />;
      case 'ShoppingCart': return <ShoppingCart {...props} />;
      case 'Store': return <Store {...props} />;
      case 'LayoutTemplate': return <LayoutTemplate {...props} />;
      case 'Workflow': return <Workflow {...props} />;
      case 'Target': return <Target {...props} />;
      case 'Code2': return <Code2 {...props} />;
      case 'FileCode2': return <FileCode2 {...props} />;
      case 'Atom': return <Atom {...props} />;
      case 'Cpu': return <Cpu {...props} />;
      case 'Layout': return <Layout {...props} />;
      case 'Terminal': return <Terminal {...props} />;
      case 'Code': return <Code {...props} />;
      case 'FileCode': return <FileCode {...props} />;
      case 'RefreshCw': return <RefreshCw {...props} />;
      case 'Server': return <Server {...props} />;
      case 'Zap': return <Zap {...props} />;
      case 'Boxes': return <Boxes {...props} />;
      case 'Network': return <Network {...props} />;
      case 'Link': return <LinkIcon {...props} />;
      case 'Radio': return <Radio {...props} />;
      case 'CreditCard': return <CreditCard {...props} />;
      case 'Images': return <Images {...props} />;
      case 'Database': return <Database {...props} />;
      case 'HardDrive': return <HardDrive {...props} />;
      case 'Flame': return <Flame {...props} />;
      case 'Cloud': return <Cloud {...props} />;
      case 'CloudLightning': return <CloudLightning {...props} />;
      case 'Box': return <Box {...props} />;
      case 'Search': return <Search {...props} />;
      case 'Palette': return <Palette {...props} />;
      case 'PenTool': return <PenTool {...props} />;
      default: return <Cpu {...props} />;
    }
  };

  const businessName = content.siteSettings?.businessName || 'Profox web designer';

  useEffect(() => {
    window.scrollTo(0, 0);
    if (item) {
      document.title = `${item.seo?.metaTitle || item.title} | ${businessName} Portfolio`;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content', item.seo?.metaDescription || item.shortDescription || '');
      }
    }
  }, [slug, item, businessName]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center font-sans text-white">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-xs uppercase tracking-widest text-slate-400 font-bold">Loading Case Study...</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center font-sans">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">Case Study Not Found</h1>
        <p className="text-slate-600 mb-8">The portfolio case study you're looking for could not be found.</p>
        <button onClick={() => navigate('/portfolio')} className="bg-[#000080] text-white px-8 py-3 rounded-xl font-bold cursor-pointer">
          Back to Case Studies
        </button>
      </div>
    );
  }

  // Related projects filtering
  const relatedProjects = combinedItems.filter((p: any) => p.id !== item?.id && p.slug !== item?.slug).slice(0, 3);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white font-sans text-slate-900 selection:bg-slate-100 selection:text-[#000080] overflow-x-hidden">
      
      {/* 100VH FULL SCREEN HERO SECTION */}
      <section className="relative w-full h-screen min-h-[100vh] flex flex-col justify-between p-6 md:p-12 lg:p-16 overflow-hidden bg-slate-950 text-white">
        {/* Fullscreen Background Cover Image */}
        <div className="absolute inset-0 z-0">
          <img 
            src={formatR2ImageUrl(item.coverImage) || 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&q=80&w=1600'} 
            alt={item.title} 
            className="w-full h-full object-cover filter brightness-90"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&q=80&w=1600';
            }}
          />
          {/* Subtle Dark Overlay Gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/65 to-slate-950/40" />
        </div>

        {/* Top Header Navigation Overlay */}
        <div className="relative z-10 pt-20 flex items-center justify-between">
          <Link 
            to="/portfolio" 
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/90 hover:text-white bg-black/40 hover:bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> All Case Studies
          </Link>
          
          <button 
            onClick={handleCopyLink}
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/90 hover:text-white bg-black/40 hover:bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 transition-all cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Share'}
          </button>
        </div>

        {/* Hero Title & Highlights Bar */}
        <div className="relative z-10 space-y-8 max-w-6xl pb-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-4"
          >
            {/* Client Name / Brand */}
            {item.client && (
              <div className="flex items-center gap-2.5 text-white/90 font-bold uppercase tracking-widest text-xs md:text-sm">
                <div className="p-1.5 bg-white/10 rounded-md border border-white/20">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <span>{item.client}</span>
              </div>
            )}

            {/* Main Headline */}
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.12] max-w-5xl">
              {item.title}
            </h1>

            {item.websiteUrl && (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                className="pt-4"
              >
                <a 
                  href={item.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 px-8 py-4 bg-white/10 hover:bg-white text-white hover:text-[#000080] font-bold rounded-2xl border border-white/20 hover:border-white transition-all backdrop-blur-md group"
                >
                  <Globe className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                  Visit Live Website
                  <ArrowUpRight className="w-5 h-5 opacity-50 group-hover:opacity-100 transition-opacity" />
                </a>
              </motion.div>
            )}
          </motion.div>

          {/* Outcome Highlight Columns at the bottom of 100vh Hero */}
          {item.results && item.results.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 border-t border-white/20">
              {item.results.slice(0, 3).map((res: any, idx: number) => (
                <div key={idx} className="space-y-1">
                  <div className="text-base md:text-lg font-bold text-white tracking-wide">{res.label}</div>
                  <div className="text-xs md:text-sm text-white/80 leading-relaxed font-normal">
                    {res.description || res.value || ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* MAIN CASE STUDY BODY CONTENT */}
      <section className="py-20 lg:py-28 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
          
          {/* Left Main Article Column (8 cols) */}
          <div className="lg:col-span-8 space-y-16">
            
            {/* SECTION 1: THE PROBLEM */}
            {(item.problemTitle || item.problemContent || (item.problemBullets && item.problemBullets.length > 0)) && (
              <div className="space-y-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  The problem
                </div>
                {item.problemTitle && (
                  <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight leading-snug">
                    {item.problemTitle}
                  </h2>
                )}
                {item.problemContent && (
                  <p className="text-base md:text-lg text-slate-700 leading-relaxed pt-2">
                    {item.problemContent}
                  </p>
                )}

                {item.problemBullets && item.problemBullets.length > 0 && (
                  <div className="pt-4 space-y-3">
                    <ul className="space-y-2.5 pl-5 list-disc text-slate-700 text-sm md:text-base leading-relaxed">
                      {item.problemBullets.map((bullet: string, i: number) => (
                        <li key={i} className="pl-1">{bullet}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Structured Pain Point & System Gaps Breakdown */}
                {item.painPoint && (
                  <StructuredPainPoint text={item.painPoint} />
                )}
              </div>
            )}

            {/* Standalone Pain Point if no problemTitle / problemContent */}
            {!item.problemTitle && !item.problemContent && (!item.problemBullets || item.problemBullets.length === 0) && item.painPoint && (
              <StructuredPainPoint text={item.painPoint} />
            )}

            {/* SECTION 2: THE SOLUTION */}
            {(item.solutionTitle || item.solutionContent || (item.solutionBullets && item.solutionBullets.length > 0)) && (
              <div className="space-y-4 pt-6 border-t border-slate-100">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  The solution
                </div>
                {item.solutionTitle && (
                  <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight leading-snug">
                    {item.solutionTitle}
                  </h2>
                )}
                {item.solutionContent && (
                  <p className="text-base md:text-lg text-slate-700 leading-relaxed pt-2">
                    {item.solutionContent}
                  </p>
                )}

                {item.solutionBullets && item.solutionBullets.length > 0 && (
                  <div className="pt-4 space-y-4">
                    <ul className="space-y-3 text-slate-700 text-sm md:text-base leading-relaxed">
                      {item.solutionBullets.map((bullet: string, i: number) => {
                        const colonIndex = bullet.indexOf(':');
                        if (colonIndex !== -1) {
                          const title = bullet.substring(0, colonIndex);
                          const desc = bullet.substring(colonIndex + 1);
                          return (
                            <li key={i} className="flex items-start gap-3">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-900 mt-2.5 flex-shrink-0" />
                              <div>
                                <strong className="font-bold text-slate-900">{title}:</strong>{desc}
                              </div>
                            </li>
                          );
                        }
                        return (
                          <li key={i} className="flex items-start gap-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-900 mt-2.5 flex-shrink-0" />
                            <div>{bullet}</div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* SECTION 3: THE RESULTS */}
            {(item.resultsTitle || item.resultsContent || (item.resultsBullets && item.resultsBullets.length > 0)) && (
              <div className="space-y-4 pt-6 border-t border-slate-100">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  The results
                </div>
                {item.resultsTitle && (
                  <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight leading-snug">
                    {item.resultsTitle}
                  </h2>
                )}
                {item.resultsContent && (
                  <p className="text-base md:text-lg text-slate-700 leading-relaxed pt-2">
                    {item.resultsContent}
                  </p>
                )}

                {item.resultsBullets && item.resultsBullets.length > 0 && (
                  <div className="pt-4 space-y-3">
                    <ul className="space-y-2.5 pl-5 list-disc text-slate-700 text-sm md:text-base leading-relaxed">
                      {item.resultsBullets.map((bullet: string, i: number) => (
                        <li key={i} className="pl-1">{bullet}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* ADDITIONAL RICH CONTENT */}
            {item.content && 
             !item.content.includes('Files Modified') && 
             !item.content.includes('Success" grid') && 
             !item.content.includes('Rich Detail Views') && (
              <div 
                className="pt-8 border-t border-slate-100 prose prose-slate prose-lg max-w-none prose-headings:font-bold prose-headings:text-slate-900 prose-a:text-[#000080]" 
                dangerouslySetInnerHTML={{ __html: item.content }} 
              />
            )}

          </div>

          {/* Right Sidebar Metadata Column (4 cols) */}
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-28 space-y-8 text-xs md:text-sm text-slate-700 bg-slate-50/70 p-6 md:p-8 rounded-2xl border border-slate-200/80">
              
              {/* Company Name */}
              {item.client && (
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Company name</div>
                  <div className="font-bold text-slate-900 text-base">{item.client}</div>
                </div>
              )}

              {/* Industry */}
              {item.industry && (
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Industry</div>
                  <div className="text-slate-800 leading-relaxed">{item.industry}</div>
                </div>
              )}

              {/* Company Size */}
              {item.companySize && (
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Company size</div>
                  <div className="text-slate-800 leading-relaxed">{item.companySize}</div>
                </div>
              )}

              {/* Structured Pain Point in Sidebar */}
              {item.painPoint && (
                <SidebarPainPoint text={item.painPoint} />
              )}

              {/* Business Solution */}
              {item.solutionsProvided && item.solutionsProvided.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">{businessName} solution</div>
                  <ul className="space-y-1.5 text-slate-800">
                    {item.solutionsProvided.map((sol: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-900 mt-2 flex-shrink-0" />
                        <span>{sol}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* About the Company */}
              {item.aboutCompany && (
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">About the company</div>
                  <div className="text-slate-700 text-xs leading-relaxed">{item.aboutCompany}</div>
                </div>
              )}

              {/* Website Link Button */}
              {item.websiteUrl && (
                <div className="pt-4">
                  <a 
                    href={item.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-[#000080] hover:bg-[#000066] text-white font-bold rounded-2xl shadow-lg shadow-blue-900/20 transition-all hover:scale-[1.02] active:scale-95 group"
                  >
                    <Globe className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                    Visit Live Website
                    <ArrowUpRight className="w-4 h-4 opacity-70" />
                  </a>
                  <p className="text-[10px] text-slate-400 text-center mt-2 font-medium tracking-wide">
                    External Link • Opens in new tab
                  </p>
                </div>
              )}

            </div>
          </div>

        </div>
      </section>

      {/* SECTION: UNIFIED VISUAL DESIGN & TECHNICAL ARCHITECTURE */}
      <section className="py-20 md:py-28 bg-slate-50/70 text-slate-900 border-t border-slate-200 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            
            {/* LEFT COLUMN: VISUAL UI/UX SHOWCASE (8 COLS) */}
            <div className="lg:col-span-8 space-y-10">
              
              {/* Visual Showcase Filter & Grid */}
              {item.designShowcase?.visuals && item.designShowcase.visuals.length > 0 && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-5">
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="p-2 bg-blue-50 border border-blue-100 rounded-xl">
                        <Monitor className="w-5 h-5 text-[#000080]" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-slate-900 whitespace-nowrap tracking-tight">
                          Visual and UX Showcase
                        </h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Interface & Experience Design</p>
                      </div>
                    </div>

                    {/* Category Filter Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                      {['All', 'UI Screens', 'UX & Wireframes', 'Mobile Views', 'Design System'].map(cat => (
                        <button
                          key={cat}
                          onClick={() => setSelectedVisualFilter(cat)}
                          className={`px-3 py-1.5 text-[11px] font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                            selectedVisualFilter === cat
                              ? 'bg-[#000080] text-white shadow-md border border-blue-800'
                              : 'bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 shadow-sm'
                          }`}
                        >
                          {cat === 'UX & Wireframes' ? 'UX' : cat === 'UI Screens' ? 'UI' : cat === 'Mobile Views' ? 'Mobile' : cat === 'Design System' ? 'System' : cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Visual Showcase Screen Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {filteredVisuals.map((vis: any, idx: number) => {
                      const isAlone = filteredVisuals.length === 1 && (!item.designShowcase?.projectDocuments || item.designShowcase.projectDocuments.length === 0);
                      return (
                        <div key={idx} className={isAlone ? "md:col-span-2" : ""}>
                          <VisualCard 
                            vis={vis} 
                            onOpenLightbox={(item, activeUrl) => {
                              setLightboxImage(item);
                              setLightboxActiveUrl(activeUrl);
                            }}
                          />
                        </div>
                      );
                    })}

                    {/* Project Documents Section - Dynamic from Backend */}
                    {item.designShowcase?.projectDocuments && item.designShowcase.projectDocuments.length > 0 && (
                      <div className={`bg-white border border-slate-200 rounded-[2.5rem] p-8 md:p-10 flex flex-col justify-center space-y-8 shadow-sm border-dashed relative overflow-hidden group min-h-[480px] ${filteredVisuals.length === 0 ? "md:col-span-2" : ""}`}>
                        <div className="absolute -top-12 -right-12 p-8 opacity-5 group-hover:opacity-10 transition-all duration-700 group-hover:rotate-12 group-hover:scale-110">
                          <FileText className="w-64 h-64 text-[#000080]" />
                        </div>
                        
                        <div className="space-y-6 relative z-10">
                          <div className="flex items-center gap-4">
                            <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-[1.25rem] text-[#000080] shadow-sm">
                              <FolderPlus className="w-8 h-8" />
                            </div>
                            <div>
                              <h4 className="text-2xl font-extrabold text-slate-900 tracking-tight">Project Assets</h4>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Documentation Repository</p>
                            </div>
                          </div>
                          <p className="text-sm md:text-base text-slate-500 leading-relaxed font-medium max-w-md">
                            Access the full technical specifications, UX research reports, and high-fidelity design artifacts for this project.
                          </p>
                          
                          <div className="grid grid-cols-1 gap-3.5 pt-4">
                            {item.designShowcase.projectDocuments.map((doc: any, dIdx: number) => (
                              <a 
                                key={dIdx}
                                href={doc.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200/60 rounded-[1.5rem] hover:border-[#000080]/40 hover:bg-white transition-all group/doc shadow-sm hover:shadow-xl"
                              >
                                <div className="flex items-center gap-4 min-w-0">
                                  <div className="p-3 bg-white text-[#000080] rounded-xl shadow-sm border border-slate-100 group-hover/doc:bg-[#000080] group-hover/doc:text-white transition-all duration-300">
                                    <FileText className="w-5 h-5" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-[15px] font-bold text-slate-900 truncate group-hover/doc:text-[#000080] transition-colors">{doc.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-[#000080] rounded-md font-bold uppercase tracking-wider border border-blue-100/50">{doc.type || 'File'}</span>
                                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Project Asset</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="p-2 rounded-full bg-white border border-slate-100 group-hover/doc:border-[#000080]/20 group-hover/doc:bg-blue-50 transition-all">
                                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover/doc:text-[#000080] group-hover/doc:translate-x-1 transition-all" />
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>

                        <div className="pt-8 border-t border-slate-100 relative z-10 mt-auto">
                           <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
                             <div className="w-8 h-[1px] bg-slate-200" />
                             End-to-End Transparency
                             <div className="w-8 h-[1px] bg-slate-200" />
                           </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* UI & UX Highlights Summary */}
              {item.designShowcase?.uiUxHighlights && item.designShowcase.uiUxHighlights.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-200">
                  {item.designShowcase.uiUxHighlights.map((hl: any, idx: number) => (
                    <div key={idx} className="p-5 bg-white border border-slate-200/80 rounded-2xl hover:border-[#000080]/50 transition-all space-y-2 group">
                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#000080] transition-colors flex items-center gap-2">
                        <Check className="w-4 h-4 text-[#000080]" />
                        {hl.title}
                      </h4>
                      <p className="text-slate-600 text-xs leading-relaxed">
                        {hl.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: TECH STACK & ASSETS (4 COLS) */}
            <div className="lg:col-span-4 space-y-8">
              
              {/* Tech Stack Block */}
              <div className="bg-white border border-slate-200 rounded-[2rem] p-6 space-y-6 shadow-xl sticky top-28 border-b-[4px] border-b-[#000080]/20">
                <div className="space-y-3 pb-5 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 border border-blue-100 rounded-xl">
                      <Cpu className="w-5 h-5 text-[#000080]" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                      Tech Stack and Tools
                    </h3>
                  </div>
                  <p className="text-slate-500 text-[10px] leading-relaxed font-bold uppercase tracking-widest">
                    Engineering Architecture
                  </p>
                </div>

                <div className="space-y-5">
                  {/* Category Filter for Tech - One Row Horizontal Scroll */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2">
                    {['All', 'Frontend', 'Backend', 'Data'].map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedTechCategory(cat === 'Frontend' ? 'Frontend & Design' : cat === 'Backend' ? 'Backend & APIs' : cat === 'Data' ? 'Database & Cloud' : 'All')}
                        className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                          (cat === 'All' && selectedTechCategory === 'All') || 
                          (cat === 'Frontend' && selectedTechCategory === 'Frontend & Design') ||
                          (cat === 'Backend' && selectedTechCategory === 'Backend & APIs') ||
                          (cat === 'Data' && selectedTechCategory === 'Database & Cloud')
                            ? 'bg-[#000080] text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {filteredTechItems.map((tech, idx) => (
                      <div 
                        key={idx}
                        className="flex items-center gap-3 p-2 bg-slate-50/50 border border-slate-100 rounded-xl hover:border-[#000080]/20 hover:bg-white hover:shadow-sm transition-all group cursor-pointer"
                      >
                        <div className="p-1.5 rounded-lg bg-white border border-slate-200 text-[#000080] shadow-sm group-hover:bg-[#000080] group-hover:text-white transition-colors shrink-0">
                          {renderTechIcon(tech.iconName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-[10px] font-extrabold text-slate-900 truncate group-hover:text-[#000080] transition-colors">
                            {tech.name}
                          </h4>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Typography & Palette (Condensed) */}
                {(item.designShowcase?.colorPalette || item.designShowcase?.typography) && (
                  <div className="pt-6 border-t border-slate-100 space-y-6">
                    {item.designShowcase.typography && (
                      <div className="space-y-2">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Primary Typeface</span>
                        <div className="text-lg font-bold text-slate-900 leading-tight">
                          {item.designShowcase.typography.fontName}
                        </div>
                        <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                          {item.designShowcase.typography.usage}
                        </p>
                      </div>
                    )}
                    
                    {item.designShowcase.colorPalette && item.designShowcase.colorPalette.length > 0 && (
                      <div className="space-y-3">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Brand Colors</span>
                        <div className="flex flex-wrap gap-2">
                          {item.designShowcase.colorPalette.map((color: any, idx: number) => (
                            <div key={idx} className="group/color relative">
                              <div 
                                className="w-7 h-7 rounded-lg shadow-sm border border-black/5 cursor-help hover:scale-110 transition-transform" 
                                style={{ backgroundColor: color.hex }}
                                title={`${color.name}: ${color.hex}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* Lightbox Modal for High-Resolution Visual Screens */}
      {lightboxImage && (
        <div 
          onClick={() => { setLightboxImage(null); setLightboxActiveUrl(null); }}
          className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 md:p-8"
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="max-w-5xl w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative"
          >
            <div className="p-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm md:text-base font-bold text-white">{lightboxImage.title}</h3>
                <span className="text-[10px] text-sky-400 font-bold uppercase">{lightboxImage.category}</span>
              </div>
              <button
                onClick={() => { setLightboxImage(null); setLightboxActiveUrl(null); }}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Image Stage */}
            <div className="relative p-2 h-[50vh] md:h-[60vh] flex items-center justify-center bg-slate-950 group">
              <img
                src={lightboxActiveUrl || lightboxImage.imageUrl}
                alt={lightboxImage.title}
                className="max-w-full max-h-full object-contain rounded-lg select-none"
              />

              {/* Lightbox Gallery Controls */}
              {(() => {
                const allImages = [lightboxImage.imageUrl, ...(lightboxImage.images || [])].filter(Boolean);
                if (allImages.length <= 1) return null;
                const currentIdx = allImages.indexOf(lightboxActiveUrl || lightboxImage.imageUrl);
                return (
                  <>
                    <button
                      onClick={() => {
                        const prevIdx = (currentIdx - 1 + allImages.length) % allImages.length;
                        setLightboxActiveUrl(allImages[prevIdx]);
                      }}
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-lg z-10"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => {
                        const nextIdx = (currentIdx + 1) % allImages.length;
                        setLightboxActiveUrl(allImages[nextIdx]);
                      }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-lg z-10"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>

                    {/* Badge */}
                    <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur px-2.5 py-1 rounded text-xs font-bold text-white z-10">
                      {currentIdx + 1} / {allImages.length}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Thumbnails list inside lightbox for fast navigation */}
            {(() => {
              const allImages = [lightboxImage.imageUrl, ...(lightboxImage.images || [])].filter(Boolean);
              if (allImages.length <= 1) return null;
              return (
                <div className="p-3 bg-slate-900 border-t border-slate-800/60 flex items-center justify-center gap-2 overflow-x-auto">
                  {allImages.map((img: string, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => setLightboxActiveUrl(img)}
                      className={`w-14 h-10 rounded border overflow-hidden shrink-0 transition-all cursor-pointer ${
                        (lightboxActiveUrl || lightboxImage.imageUrl) === img
                          ? 'border-sky-500 ring-2 ring-sky-500/20 scale-105'
                          : 'border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* Caption & Associated Documents in Lightbox */}
            <div className="p-4 md:p-6 bg-slate-900 border-t border-slate-800 text-xs md:text-sm text-slate-300 space-y-3">
              {lightboxImage.caption && (
                <p className="leading-relaxed">{lightboxImage.caption}</p>
              )}
              {lightboxImage.documents && lightboxImage.documents.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-800/80">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Available Document Downloads ({lightboxImage.documents.length})
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {lightboxImage.documents.map((doc: any, docIdx: number) => (
                      <a
                        key={docIdx}
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-white hover:text-sky-400 transition-all cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        <span>{doc.name}</span>
                        <span className="text-[9px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded uppercase font-extrabold">{doc.type || 'file'}</span>
                        <Download className="w-3.5 h-3.5 ml-1 text-slate-400" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RELATED CASE STUDIES BOTTOM SECTION */}
      {relatedProjects.length > 0 && (
        <section className="py-20 bg-slate-50/70 border-t border-slate-200">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
              <div>
                <span className="text-xs font-bold text-[#000080] uppercase tracking-widest block mb-2">Explore Next</span>
                <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">Related Case Studies</h2>
              </div>
              <Link 
                to="/portfolio" 
                className="inline-flex items-center gap-2 text-xs md:text-sm font-bold text-slate-900 hover:text-[#000080] bg-white border border-slate-200/80 px-4 py-2.5 rounded-xl shadow-sm hover:shadow transition-all cursor-pointer group w-fit"
              >
                See All Case Studies <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </Link>
            </div>

            {/* Featured Primary Related Case Study Banner */}
            {relatedProjects[0] && (
              <div className="mb-10 bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 shadow-sm hover:shadow-md transition-all group">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                  <div className="lg:col-span-7 aspect-[16/10] rounded-2xl overflow-hidden bg-slate-100 relative">
                    <img 
                      src={relatedProjects[0].coverImage} 
                      alt={relatedProjects[0].title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                    />
                    {relatedProjects[0].client && (
                      <div className="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg text-white text-[11px] font-bold tracking-wider uppercase flex items-center gap-1.5 border border-white/10">
                        <Building2 className="w-3.5 h-3.5" />
                        {relatedProjects[0].client}
                      </div>
                    )}
                    {relatedProjects[0].category && (
                      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-lg text-slate-900 text-[10px] font-extrabold tracking-wider uppercase border border-slate-200">
                        {relatedProjects[0].category}
                      </div>
                    )}
                  </div>
                  <div className="lg:col-span-5 space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-[#000080] text-xs font-bold uppercase tracking-wider">
                      Featured Related Project
                    </div>
                    <h3 className="text-2xl md:text-3xl font-bold text-slate-900 group-hover:text-[#000080] transition-colors leading-tight">
                      {relatedProjects[0].title}
                    </h3>
                    {relatedProjects[0].shortDescription && (
                      <p className="text-slate-600 text-sm leading-relaxed line-clamp-3">
                        {relatedProjects[0].shortDescription}
                      </p>
                    )}
                    <div className="pt-3">
                      <Link 
                        to={`/portfolio/${relatedProjects[0].slug}`}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-[#000080] text-white text-xs font-bold rounded-xl hover:bg-[#000066] transition-colors shadow-sm cursor-pointer"
                      >
                        Read Case Study <ArrowUpRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Additional Related Case Studies */}
            {relatedProjects.length > 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {relatedProjects.slice(1).map((rel: any) => (
                  <Link 
                    key={rel.id} 
                    to={`/portfolio/${rel.slug}`} 
                    className="group bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all block space-y-4 cursor-pointer"
                  >
                    <div className="aspect-[16/10] rounded-xl overflow-hidden bg-slate-100 relative">
                      <img 
                        src={rel.coverImage} 
                        alt={rel.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      />
                      {rel.client && (
                        <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-white text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 border border-white/10">
                          <Building2 className="w-3 h-3" />
                          {rel.client}
                        </div>
                      )}
                      {rel.category && (
                        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-lg text-slate-900 text-[10px] font-extrabold tracking-wider uppercase border border-slate-200">
                          {rel.category}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg md:text-xl font-bold text-slate-900 group-hover:text-[#000080] transition-colors leading-snug">
                        {rel.title}
                      </h3>
                      {rel.shortDescription && (
                        <p className="text-slate-600 text-xs md:text-sm leading-relaxed line-clamp-2">
                          {rel.shortDescription}
                        </p>
                      )}
                    </div>
                    <div className="pt-2 flex items-center gap-1.5 text-xs font-bold text-[#000080]">
                      View Case Study <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <CTA />
    </div>
  );
}
