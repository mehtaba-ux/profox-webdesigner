import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  ArrowRight,
  Award,
  BookOpen,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clipboard,
  Copy,
  CreditCard,
  DollarSign,
  ExternalLink,
  FileCheck2,
  FileText,
  LayoutDashboard,
  Link2,
  MessageSquare,
  Package,
  Search,
  ShieldCheck,
  Target,
  Users
} from 'lucide-react';
import { trainingService, TrainingModule, TrainingLesson } from '../../lib/trainingService';
import { salesService } from '../../lib/salesService';
import { supabase } from '../../lib/supabase';
import { useCMS } from '../../lib/CMSProvider';
import { SalesProduct } from '../../types';
import NichePlaybooksView from './NichePlaybooksView';
import OutreachTemplatesView from './OutreachTemplatesView';

type ResourceTab = 'overview' | 'catalog' | 'modules' | 'niches' | 'templates' | 'policies' | 'handover' | 'proof';
type PaymentStep = { milestoneNumber?: number; paymentType?: string; label?: string; percentage?: number };
type HandoverReference = { module: TrainingModule; lesson: TrainingLesson };

const RESOURCE_TABS: ResourceTab[] = ['overview','catalog','modules','niches','templates','policies','handover','proof'];
const HANDOVER_MODULE_SLUGS = new Set(['welcome','agreement-rules','closing','quotation-process','payment-process','crm-training','calendar-setup']);

function productPrice(product: SalesProduct) {
  if (product.priceMode === 'custom') return 'Custom Quote';
  let formatted = `$${Number(product.basePrice || 0).toLocaleString()}`;
  try {
    formatted = new Intl.NumberFormat('en-US', {
      style: 'currency', currency: product.currency || 'USD',
      maximumFractionDigits: Number(product.basePrice || 0) % 1 === 0 ? 0 : 2
    }).format(Number(product.basePrice || 0));
  } catch {}
  return product.priceMode === 'starting_at' ? `${formatted}+` : formatted;
}

export default function TrainingLibrary() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { content } = useCMS();
  const requestedResource = searchParams.get('resource') as ResourceTab | null;
  const [activeTab, setActiveTab] = useState<ResourceTab>(requestedResource && RESOURCE_TABS.includes(requestedResource) ? requestedResource : 'overview');
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [products, setProducts] = useState<SalesProduct[]>([]);
  const [paymentSchedules, setPaymentSchedules] = useState<Record<string, PaymentStep[]>>({});
  const [selectedModule, setSelectedModule] = useState<TrainingModule | null>(null);
  const [lessons, setLessons] = useState<TrainingLesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<TrainingLesson | null>(null);
  const [handoverReferences, setHandoverReferences] = useState<HandoverReference[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [proofSearch, setProofSearch] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (requestedResource && RESOURCE_TABS.includes(requestedResource)) setActiveTab(requestedResource);
  }, [requestedResource]);

  useEffect(() => { void loadLibraryData(); }, []);

  const loadLibraryData = async () => {
    setLoading(true);
    setError('');
    try {
      const [moduleResult, productResult, scheduleResult] = await Promise.all([
        trainingService.getModules(),
        salesService.getActiveProducts(),
        supabase.from('sales_products').select('code,payment_schedule').eq('active', true)
      ]);
      if (productResult.error) throw productResult.error;
      if (scheduleResult.error) throw scheduleResult.error;

      const loadedModules = moduleResult.data || [];
      setModules(loadedModules);
      setProducts(productResult.data || []);
      const scheduleMap: Record<string, PaymentStep[]> = {};
      for (const row of scheduleResult.data || []) scheduleMap[String(row.code)] = Array.isArray(row.payment_schedule) ? row.payment_schedule : [];
      setPaymentSchedules(scheduleMap);

      if (loadedModules.length > 0) {
        setSelectedModule(loadedModules[0]);
        void loadModuleLessons(loadedModules[0].id);
      }

      const handoverModules = loadedModules.filter(module => HANDOVER_MODULE_SLUGS.has(module.slug));
      const lessonResults = await Promise.all(handoverModules.map(async module => ({ module, result: await trainingService.getLessons(module.id) })));
      const refs: HandoverReference[] = [];
      for (const { module, result } of lessonResults) {
        for (const lesson of result.data || []) {
          if (/handover|handoff/i.test(`${lesson.title} ${lesson.content || ''}`)) refs.push({ module, lesson });
        }
      }
      setHandoverReferences(refs);
    } catch (err: any) {
      setError(err?.message || 'Unable to load Sales Resources.');
    } finally {
      setLoading(false);
    }
  };

  const loadModuleLessons = async (moduleId: string) => {
    const { data } = await trainingService.getLessons(moduleId);
    setLessons(data || []);
    setSelectedLesson(data?.[0] || null);
  };

  const handleSelectModule = (mod: TrainingModule) => {
    setSelectedModule(mod);
    setActiveTab('modules');
    void loadModuleLessons(mod.id);
  };

  const openModuleByKeywords = (keywords: string[]) => {
    const lowered = keywords.map(value => value.toLowerCase());
    const match = modules.find(module => lowered.some(keyword => `${module.title} ${module.description || ''} ${module.slug}`.toLowerCase().includes(keyword)));
    if (match) handleSelectModule(match); else setActiveTab('modules');
  };

  const filteredModules = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return modules;
    return modules.filter(module => `${module.title} ${module.description || ''} ${module.slug}`.toLowerCase().includes(q));
  }, [modules, searchTerm]);

  const portfolioItems = useMemo(() => {
    const rows = Array.isArray(content.portfolio_items) ? content.portfolio_items : [];
    const q = proofSearch.trim().toLowerCase();
    return rows.filter((item: any) => item?.status === 'published' && (!q || `${item.title || ''} ${item.client || ''} ${item.category || ''} ${item.industry || ''} ${(item.tags || []).join(' ')}`.toLowerCase().includes(q)));
  }, [content.portfolio_items, proofSearch]);

  const nicheModule = modules.find(module => module.slug === 'niche-training' || module.slug === 'niche-specific-training');

  const copyProofLink = async (item: any) => {
    const slug = item.slug || item.id;
    if (!slug) return;
    const url = `${window.location.origin}/portfolio/${slug}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(String(item.id || slug));
    window.setTimeout(() => setCopiedId(''), 1800);
  };

  if (loading) return <div className="mx-auto max-w-7xl p-8 text-sm font-medium text-slate-500">Loading Sales Resources...</div>;

  return <div className="mx-auto max-w-7xl space-y-8 p-4 md:p-8">
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-5 border-b border-slate-100 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#000080]">Active Seller Knowledge</div><h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">ProFox Sales Resource Center</h1><p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">The Academy teaches and certifies. This Resource Center reuses the live Sales Catalog, approved Academy reference and public Portfolio so sellers execute from the same sources of truth.</p></div>
        <button onClick={() => navigate('/admin/today')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white">Back to Dashboard <ArrowRight className="h-4 w-4" /></button>
      </div>
      {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        <TabButton active={activeTab==='overview'} onClick={()=>setActiveTab('overview')} icon={LayoutDashboard} label="Overview" />
        <TabButton active={activeTab==='catalog'} onClick={()=>setActiveTab('catalog')} icon={Package} label="Products & Pricing" />
        <TabButton active={activeTab==='handover'} onClick={()=>setActiveTab('handover')} icon={Clipboard} label="Handover" />
        <TabButton active={activeTab==='proof'} onClick={()=>setActiveTab('proof')} icon={Award} label="Case Studies & Proof" />
        <TabButton active={activeTab==='modules'} onClick={()=>setActiveTab('modules')} icon={BookOpen} label="Academy Reference" />
        <TabButton active={activeTab==='niches'} onClick={()=>setActiveTab('niches')} icon={Briefcase} label="Niche Playbooks" />
        <TabButton active={activeTab==='templates'} onClick={()=>setActiveTab('templates')} icon={MessageSquare} label="Outreach" />
        <TabButton active={activeTab==='policies'} onClick={()=>setActiveTab('policies')} icon={ShieldCheck} label="Policies" />
      </div>
    </div>

    {activeTab==='overview' && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <ResourceCard icon={Package} title="Products, Pricing & Scope" description="Live packages, add-ons, Care plans, scope and payment milestones from the canonical Sales Catalog." action="Open products" onClick={()=>setActiveTab('catalog')} />
      <ResourceCard icon={Clipboard} title="Won-Sale Handover" description="Approved handover guidance surfaced from the current Academy/CRM training content—never copied into a second knowledge base." action="Open handover" onClick={()=>setActiveTab('handover')} />
      <ResourceCard icon={Award} title="Case Studies & Approved Proof" description="Search and share current published ProFox Portfolio examples, testimonials and verified result statements." action="Open proof library" onClick={()=>setActiveTab('proof')} />
      <ResourceCard icon={Users} title="Prospecting & Qualification" description="Research, qualification, ICP thinking and business diagnosis from approved Academy content." action="Open lead research" onClick={()=>openModuleByKeywords(['lead research'])} />
      <ResourceCard icon={Briefcase} title="Niche Playbooks" description="Use the same published Niche Academy knowledge while researching and speaking with prospects." action="Open niche playbooks" onClick={()=>setActiveTab('niches')} />
      <ResourceCard icon={MessageSquare} title="Outreach & Follow-Up" description="Approved email, LinkedIn, Loom and follow-up playbooks from the existing content system." action="Open outreach" onClick={()=>setActiveTab('templates')} />
      <ResourceCard icon={CalendarDays} title="Meetings & Discovery" description="Discovery structure, probing questions, meeting preparation and booking standards from the Academy." action="Open meeting reference" onClick={()=>openModuleByKeywords(['discovery','meeting booking'])} />
      <ResourceCard icon={Target} title="Objections & Closing" description="Buyer-centered objection handling, decision readiness and ethical closing guidance." action="Open closing reference" onClick={()=>openModuleByKeywords(['objection','closing'])} />
      <ResourceCard icon={ShieldCheck} title="Policies & Commercial Rules" description="Agreement rules, confidentiality, quotation, payments, commission and career policies." action="Open policies" onClick={()=>setActiveTab('policies')} />
    </div>}

    {activeTab==='catalog' && <div className="space-y-5">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-900">Prices, scope and milestone schedules below are read directly from the active <strong>Sales Catalog</strong>. Historical quotations keep immutable snapshots.</div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{products.map(product => {
        const schedule = paymentSchedules[product.code] || [];
        return <article key={product.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{product.productType.replace('_',' ')} · {product.code}</div><h2 className="mt-1 text-lg font-black text-slate-900">{product.name}</h2></div>{product.managerApprovalRequired && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-black uppercase text-amber-700">Approval required</span>}</div><div className="mt-4 text-2xl font-black text-[#000080]">{productPrice(product)}{product.billingPeriod ? <span className="ml-1 text-xs font-bold text-slate-400">/{product.billingPeriod}</span> : null}</div>{product.shortDescription && <p className="mt-2 text-xs leading-5 text-slate-500">{product.shortDescription}</p>}{schedule.length>0 && <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">Standard payment schedule</div><div className="space-y-2">{schedule.map((step,index)=><div key={`${product.code}-${step.milestoneNumber || index}`} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs"><span className="font-bold text-slate-700">{step.label || step.paymentType || `Milestone ${index+1}`}</span><span className="font-black text-[#000080]">{Number(step.percentage || 0)}%</span></div>)}</div></div>}<ul className="mt-4 space-y-2">{(product.scope||[]).slice(0,6).map(item=><li key={item} className="flex gap-2 text-xs leading-5 text-slate-600"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#000080]" />{item}</li>)}</ul></article>;
      })}</div>
      <div className="flex flex-wrap gap-2"><button onClick={()=>navigate('/admin/app/sales?tab=sales_catalog')} className="rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white">Open full Sales Catalog</button><button onClick={()=>window.open('/pricing','_blank','noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black">Public Pricing <ExternalLink className="h-3.5 w-3.5" /></button></div>
    </div>}

    {activeTab==='handover' && <div className="space-y-5">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-900"><strong>Single source of truth:</strong> this section does not store a separate handover SOP. It surfaces the current approved Academy lessons that already define sales-to-delivery handoff, required CRM context, payment/Won protection, meeting notes and next-step ownership.</div>
      {handoverReferences.length===0 ? <Empty text="No active Academy handover references are currently published." /> : <div className="space-y-4">{handoverReferences.map(({module,lesson})=><article key={lesson.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="text-[10px] font-black uppercase tracking-wider text-[#000080]">{module.title}</div><h2 className="mt-1 text-lg font-black text-slate-900">{lesson.title}</h2><div className="prose prose-slate mt-4 max-w-none text-xs leading-relaxed"><ReactMarkdown>{lesson.content}</ReactMarkdown></div></article>)}</div>}
    </div>}

    {activeTab==='proof' && <div className="space-y-5">
      <div className="relative rounded-2xl border border-slate-200 bg-white shadow-sm"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={proofSearch} onChange={e=>setProofSearch(e.target.value)} placeholder="Search proof by project, client, industry, category or tag..." className="w-full rounded-2xl py-3 pl-10 pr-4 text-xs outline-none focus:ring-2 focus:ring-blue-100" /></div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">Use only published Portfolio content and verified result statements. Do not invent ROI, performance claims, testimonials or customer outcomes.</div>
      {portfolioItems.length===0 ? <Empty text="No published portfolio proof matches this search." /> : <div className="grid gap-4 lg:grid-cols-2">{portfolioItems.map((item:any)=>{
        const slug=item.slug||item.id; const id=String(item.id||slug);
        return <article key={id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{item.industry||item.category||'Case Study'}</div><h2 className="mt-1 text-lg font-black text-slate-900">{item.title}</h2><div className="mt-1 text-xs font-bold text-[#000080]">{item.client||'ProFox Project'}</div></div><Award className="h-5 w-5 text-[#000080]" /></div>{item.shortDescription && <p className="mt-3 text-xs leading-5 text-slate-500">{item.shortDescription}</p>}{Array.isArray(item.results)&&item.results.length>0 && <div className="mt-4 grid grid-cols-2 gap-2">{item.results.slice(0,4).map((result:any,index:number)=><div key={`${id}-result-${index}`} className="rounded-xl bg-slate-50 p-3"><div className="text-base font-black text-[#000080]">{result.value}</div><div className="mt-1 text-[10px] font-bold text-slate-500">{result.label}</div></div>)}</div>}{item.testimonial?.quote && <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs italic leading-5 text-slate-600">“{item.testimonial.quote}”<div className="mt-2 not-italic font-black text-slate-800">{item.testimonial.author}</div></div>}<div className="mt-5 flex flex-wrap gap-2"><button onClick={()=>window.open(`/portfolio/${slug}`,'_blank','noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-3 py-2 text-[10px] font-black text-white">Open case study <ExternalLink className="h-3.5 w-3.5" /></button><button onClick={()=>void copyProofLink(item)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-700">{copiedId===id ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}{copiedId===id?'Copied':'Copy share link'}</button></div></article>;
      })}</div>}
    </div>}

    {activeTab==='niches' && (nicheModule ? <NichePlaybooksView moduleId={nicheModule.id} /> : <Empty text="Niche Academy is not currently available." />)}
    {activeTab==='templates' && <OutreachTemplatesView />}

    {activeTab==='modules' && <div className="space-y-5"><div className="relative rounded-2xl border border-slate-200 bg-white shadow-sm"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Search Academy reference by title, topic, or keyword..." className="w-full rounded-2xl py-3 pl-10 pr-4 text-xs outline-none focus:ring-2 focus:ring-blue-100" /></div><div className="grid grid-cols-1 gap-8 lg:grid-cols-4"><div className="max-h-[700px] space-y-2 overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4 pr-1 shadow-sm">{filteredModules.map((module,index)=><button key={module.id} onClick={()=>handleSelectModule(module)} className={`flex w-full items-center gap-2 rounded-2xl border p-3 text-left text-xs font-bold ${selectedModule?.id===module.id?'border-[#000080] bg-[#000080] text-white':'border-slate-200 bg-slate-50 text-slate-700'}`}><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/20 text-[10px]">{index+1}</span><span className="truncate">{module.title}</span></button>)}</div><div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-3 md:p-8">{selectedModule ? <><div className="border-b border-slate-100 pb-4"><div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">Approved Academy Reference · {selectedModule.slug}</div><h2 className="text-2xl font-bold">{selectedModule.title}</h2><p className="mt-1 text-xs text-slate-500">{selectedModule.description}</p></div>{lessons.length>1 && <div className="flex gap-2 overflow-x-auto pb-2">{lessons.map(lesson=><button key={lesson.id} onClick={()=>setSelectedLesson(lesson)} className={`rounded-xl border px-3.5 py-1.5 text-xs font-bold ${selectedLesson?.id===lesson.id?'border-[#000080] bg-[#000080]/10 text-[#000080]':'border-slate-200 bg-slate-50 text-slate-600'}`}>{lesson.title}</button>)}</div>}{selectedLesson ? <div className="prose prose-slate max-w-none rounded-2xl border border-slate-200/80 bg-slate-50 p-6 text-xs leading-relaxed"><ReactMarkdown>{selectedLesson.content}</ReactMarkdown></div> : <Empty text="No lesson text is attached." />}</> : <Empty text="Select a module to open its approved reference content." />}</div></div></div>}

    {activeTab==='policies' && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <PolicyCard icon={FileCheck2} title="Agreement & Sales Authority" description="Approved authority boundaries, commercial rules and partner operating standard." action="Open rules" onClick={()=>openModuleByKeywords(['agreement','sales rules'])} />
      <PolicyCard icon={FileText} title="Quotation Process" description="Catalog-driven quotation rules, approval routing and manager-review boundaries." action="Open quotation training" onClick={()=>openModuleByKeywords(['quotation'])} />
      <PolicyCard icon={CreditCard} title="Payment & Verification" description="Approved payment process, milestone schedules and protected Won transition." action="Open payment training" onClick={()=>openModuleByKeywords(['payment process','payment'])} />
      <PolicyCard icon={Users} title="CRM Operating Standard" description="Ownership, next activity, meeting outcome and handoff rules from the canonical CRM training." action="Open CRM reference" onClick={()=>openModuleByKeywords(['crm training','crm'])} />
      <PolicyCard icon={ShieldCheck} title="Confidentiality & Data Protection" description="Customer-data handling, confidentiality and secure sales-working expectations." action="Open confidentiality" onClick={()=>openModuleByKeywords(['confidentiality','data protection'])} />
      <PolicyCard icon={DollarSign} title="Commission Policy & Payout History" description="Live commission ledger, current payout policy and payment history." action="Open My Commission" onClick={()=>navigate('/admin/app/commissions?tab=my_commissions')} />
      <PolicyCard icon={Award} title="Career Progression" description="Verified-sales progress and Management Review eligibility from the current policy." action="Open progression" onClick={()=>navigate('/admin/sales-career-progression')} />
      <PolicyCard icon={Briefcase} title="Case Studies & Approved Proof" description="Search and share current published Portfolio proof without inventing claims." action="Open proof library" onClick={()=>setActiveTab('proof')} />
      <PolicyCard icon={Package} title="Public Package Presentation" description="See exactly what prospects see on live Pricing powered by the canonical Sales Catalog." action="Open Public Pricing" onClick={()=>window.open('/pricing','_blank','noopener,noreferrer')} />
    </div>}
  </div>;
}

function TabButton({active,onClick,icon:Icon,label}:{active:boolean;onClick:()=>void;icon:React.ElementType;label:string}){return <button onClick={onClick} className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold ${active?'border-[#000080] bg-[#000080] text-white':'border-slate-200 bg-slate-50 text-slate-600'}`}><Icon className="h-4 w-4" />{label}</button>}
function ResourceCard({icon:Icon,title,description,action,onClick}:{icon:React.ElementType;title:string;description:string;action:string;onClick:()=>void}){return <button onClick={onClick} className="group rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm hover:border-[#000080]/25 hover:shadow-md"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#000080]"><Icon className="h-5 w-5" /></div><h2 className="mt-5 text-base font-black">{title}</h2><p className="mt-2 text-xs leading-5 text-slate-500">{description}</p><div className="mt-5 inline-flex items-center gap-2 text-xs font-black text-[#000080]">{action}<ArrowRight className="h-3.5 w-3.5" /></div></button>}
function PolicyCard({icon:Icon,title,description,action,onClick}:{icon:React.ElementType;title:string;description:string;action:string;onClick:()=>void}){return <button onClick={onClick} className="rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm hover:border-[#000080]/25"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#000080]"><Icon className="h-5 w-5" /></div><div><h2 className="text-sm font-black">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div></div><div className="mt-5 inline-flex items-center gap-2 text-xs font-black text-[#000080]">{action}<ArrowRight className="h-3.5 w-3.5" /></div></button>}
function Empty({text}:{text:string}){return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs font-semibold text-slate-500">{text}</div>}
