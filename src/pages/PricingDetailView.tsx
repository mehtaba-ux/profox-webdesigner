import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, ArrowUpRight, BadgeCheck, Check, ChevronDown, CircleCheckBig, ClipboardCheck, Database, Globe2, Layers3, MessageSquareText, MousePointerClick, Rocket, ShieldCheck, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CustomPage } from '../types';
import { defaultPricingTemplateData } from '../data/pricingTemplate';
import { useCMS } from '../lib/CMSProvider';
import HeroReviewProof from '../components/HeroReviewProof';
import TrustedBrandRow from '../components/TrustedBrandRow';

const asContactLink = (url?: string) => url?.startsWith('/') ? url : '/contact-us';
const isIncluded = (value: string) => /^(included|yes|check)$/i.test(value.trim());

const assuranceCardLayouts = [
  'left-[1%] top-[1%] w-[48%] rotate-[2deg] lg:left-[2%] lg:top-[4%] lg:w-[31%] lg:rotate-[2deg]',
  'right-[1%] top-[5%] w-[48%] -rotate-[2deg] lg:left-[34%] lg:right-auto lg:top-[10%] lg:w-[32%] lg:-rotate-[1deg]',
  'left-[1%] top-[35%] w-[48%] -rotate-[2deg] lg:left-auto lg:right-[1%] lg:top-[1%] lg:w-[31%] lg:-rotate-[3deg]',
  'right-[1%] top-[39%] w-[48%] rotate-[2deg] lg:bottom-[5%] lg:left-0 lg:right-auto lg:top-auto lg:w-[32%] lg:-rotate-[3deg]',
  'bottom-[1%] left-[1%] w-[48%] rotate-[1deg] lg:bottom-[10%] lg:left-[34%] lg:w-[33%] lg:rotate-[1deg]',
  'bottom-[5%] right-[1%] w-[48%] -rotate-[2deg] lg:bottom-[1%] lg:right-[2%] lg:w-[31%] lg:rotate-[1deg]'
];

function AssuranceCards({ points }: { points: string[] }) {
  return <div className="relative min-h-[500px] w-full sm:min-h-[540px] lg:min-h-[350px]">
    <div className="pointer-events-none absolute left-[8%] top-[12%] h-44 w-44 rounded-full bg-[#000080]/[0.06] blur-3xl lg:left-[36%] lg:top-[22%]" />
    <div className="pointer-events-none absolute bottom-[8%] right-[4%] h-40 w-40 rounded-full bg-[#8ba9ff]/20 blur-3xl" />
    {points.map((point, index) => {
      const isFocal = index === 4;
      const surface = isFocal
        ? 'border-[#000080]/10 bg-[#b7c9ff] shadow-[0_24px_55px_rgba(0,0,128,0.16)]'
        : index === 1 || index === 3
          ? 'border-[#000080]/[0.06] bg-[#e3e9f8] shadow-[0_20px_45px_rgba(15,23,42,0.09)]'
          : 'border-white/90 bg-white shadow-[0_22px_50px_rgba(15,23,42,0.10)]';

      return <motion.div
        key={`${point}-${index}`}
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.65, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
        whileHover={{ y: -5, scale: 1.02, rotate: 0, zIndex: 20 }}
        className={`absolute z-10 flex min-h-[138px] items-center justify-center rounded-[20px] border px-4 py-5 text-center text-[15px] font-semibold leading-[1.14] tracking-[-0.025em] text-slate-950 transition-shadow duration-300 sm:min-h-[145px] sm:px-6 sm:text-[17px] lg:min-h-[116px] lg:px-5 lg:text-[16px] xl:px-7 xl:text-[18px] ${surface} ${assuranceCardLayouts[index] || assuranceCardLayouts[index % assuranceCardLayouts.length]}`}
      >
        <span className="max-w-[22ch]">{point}</span>
      </motion.div>;
    })}
  </div>;
}

const pricingProcessIcons = [MousePointerClick, MessageSquareText, ClipboardCheck, BadgeCheck, Rocket];

function PricingProcessSection({ data }: { data: any }) {
  const steps = Array.isArray(data.steps) ? data.steps : [];
  const [activeStep, setActiveStep] = useState(0);
  const [mobileJourneyProgress, setMobileJourneyProgress] = useState(0);
  const mobileJourneyRef = useRef<HTMLDivElement>(null);
  const selectedStep = steps[activeStep] || steps[0];
  const SelectedIcon = pricingProcessIcons[activeStep % pricingProcessIcons.length] || MousePointerClick;
  const progress = steps.length > 1 ? (activeStep / (steps.length - 1)) * 100 : 0;

  useEffect(() => {
    let animationFrame = 0;
    const updateMobileJourney = () => {
      animationFrame = 0;
      const journey = mobileJourneyRef.current;
      if (!journey || window.innerWidth >= 768 || steps.length === 0) return;
      const rect = journey.getBoundingClientRect();
      const scrollDistance = Math.max(journey.offsetHeight - window.innerHeight, 1);
      const nextProgress = Math.min(1, Math.max(0, -rect.top / scrollDistance));
      const nextStep = Math.min(steps.length - 1, Math.floor(nextProgress * steps.length));
      setMobileJourneyProgress(current => Math.abs(current - nextProgress) > 0.002 ? nextProgress : current);
      setActiveStep(current => current === nextStep ? current : nextStep);
    };
    const requestUpdate = () => { if (!animationFrame) animationFrame = window.requestAnimationFrame(updateMobileJourney); };
    updateMobileJourney();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate, { passive: true });
    return () => {
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [steps.length]);

  return <section className="relative overflow-x-clip border-y border-slate-200 bg-[#f4f5fb] py-20 sm:py-28">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_10%,rgba(0,0,128,0.07),transparent_27%),radial-gradient(circle_at_90%_82%,rgba(107,107,255,0.10),transparent_28%)]" />
    <div className="pf-container relative">
      <div className="grid gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:gap-20">
        <div><div className="pf-eyebrow text-[#000080]">{data.eyebrow}</div><h2 className="pf-section-title mt-4 max-w-[17ch]">{data.title}</h2></div>
        <p className="max-w-2xl text-lg leading-8 text-slate-600 lg:pb-1">{data.description}</p>
      </div>

      <div className="mt-12 hidden overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.10)] md:block">
        <div className="relative px-6 pb-7 pt-8 lg:px-9 lg:pb-9 lg:pt-10">
          <div className="absolute left-[10%] right-[10%] top-[63px] h-[2px] bg-slate-200 lg:top-[71px]"><motion.div className="h-full origin-left bg-gradient-to-r from-[#000080] to-[#7777ff]" animate={{ width: `${progress}%` }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} /></div>
          <div className="relative grid grid-cols-5 gap-3 lg:gap-5">
            {steps.map((step: any, index: number) => {
              const Icon = pricingProcessIcons[index % pricingProcessIcons.length] || MousePointerClick;
              const isActive = activeStep === index;
              const isComplete = index < activeStep;
              return <button key={`${step.number}-${step.title}`} type="button" onClick={() => setActiveStep(index)} onMouseEnter={() => setActiveStep(index)} onFocus={() => setActiveStep(index)} aria-pressed={isActive} className="group relative flex min-w-0 flex-col items-center text-center focus-visible:outline-none">
                <motion.span animate={{ scale: isActive ? 1.08 : 1 }} className={`relative z-10 grid h-12 w-12 place-items-center rounded-2xl border shadow-sm transition-all duration-300 lg:h-14 lg:w-14 ${isActive ? 'border-[#000080] bg-[#000080] text-white shadow-[0_12px_30px_rgba(0,0,128,0.24)]' : isComplete ? 'border-[#000080]/20 bg-[#ededff] text-[#000080]' : 'border-slate-200 bg-white text-slate-400 group-hover:border-[#000080]/30 group-hover:text-[#000080] group-hover:shadow-md'}`}>{isComplete ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}</motion.span>
                <span className={`mt-5 text-[10px] font-black uppercase tracking-[0.14em] transition-colors ${isActive || isComplete ? 'text-[#000080]' : 'text-slate-400'}`}>{data.stepLabel} {step.number || String(index + 1).padStart(2, '0')}</span>
                <span className={`mt-2 max-w-[15ch] text-sm font-bold leading-5 tracking-[-0.02em] transition-colors lg:text-base ${isActive ? 'text-slate-950' : 'text-slate-600 group-hover:text-slate-950'}`}>{step.title}</span>
              </button>;
            })}
          </div>
        </div>
        <div className="grid min-h-[300px] border-t border-slate-200 bg-[#0d1020] text-white lg:grid-cols-[0.34fr_0.66fr]">
          <div className="relative overflow-hidden border-b border-white/10 p-7 lg:border-b-0 lg:border-r lg:p-10"><div className="pointer-events-none absolute -bottom-16 -left-12 text-[14rem] font-black leading-none text-white/[0.025]">{selectedStep?.number || activeStep + 1}</div><div className="relative"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#aaaaff]">{data.currentStageLabel}</div><div className="mt-6 flex items-end gap-3"><span className="text-7xl font-semibold leading-none tracking-[-0.07em] text-white">{selectedStep?.number || String(activeStep + 1).padStart(2, '0')}</span><span className="mb-2 text-sm font-bold text-white/35">/ {String(steps.length).padStart(2, '0')}</span></div><div className="mt-7 h-1.5 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-[#aaaaff]" animate={{ width: `${((activeStep + 1) / Math.max(steps.length, 1)) * 100}%` }} transition={{ duration: 0.45 }} /></div></div></div>
          <AnimatePresence mode="wait"><motion.div key={`${selectedStep?.number}-${selectedStep?.title}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} className="flex items-center p-7 lg:p-10 xl:p-12"><div className="max-w-2xl"><span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-white/[0.06] text-[#aaaaff]"><SelectedIcon className="h-5 w-5" /></span><div className="mt-7 text-[11px] font-black uppercase tracking-[0.16em] text-[#aaaaff]">{data.stepLabel} {selectedStep?.number || String(activeStep + 1).padStart(2, '0')}</div><h3 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.045em] sm:text-4xl">{selectedStep?.title}</h3><p className="mt-5 text-base leading-7 text-white/65 sm:text-lg sm:leading-8">{selectedStep?.description}</p><div className="mt-7 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.12em] text-white/40"><span className="h-px w-9 bg-[#aaaaff]" />{data.desktopHint}</div></div></motion.div></AnimatePresence>
        </div>
      </div>

      <div ref={mobileJourneyRef} className="relative mt-10 md:hidden" style={{ height: `${Math.max(steps.length * 72, 360)}svh` }}>
        <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden py-5">
          <div className="relative w-full rounded-[28px] border border-[#000080]/10 bg-[#f0f2fb]/90 px-3 py-5 shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur-sm">
            <div className="mb-4 flex items-center justify-between gap-3 px-2"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]">{data.mobileJourneyLabel}</div><div className="mt-1 text-xs text-slate-500">{data.mobileJourneyHint}</div></div><div className="rounded-full border border-[#000080]/10 bg-white px-3 py-1.5 text-[10px] font-black text-[#000080]">{String(activeStep + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</div></div>
            <div className="relative space-y-2.5"><span className="absolute bottom-8 left-[24px] top-8 w-px bg-[#000080]/15" /><motion.span className="absolute left-[24px] top-8 w-px origin-top bg-gradient-to-b from-[#000080] to-[#7777ff]" animate={{ height: `calc((100% - 4rem) * ${mobileJourneyProgress})` }} transition={{ duration: 0.12, ease: 'linear' }} />
              {steps.map((step: any, index: number) => {
                const Icon = pricingProcessIcons[index % pricingProcessIcons.length] || MousePointerClick;
                const isActive = activeStep === index;
                const isComplete = index < activeStep;
                return <article key={`mobile-${step.number}-${step.title}`} aria-current={isActive ? 'step' : undefined} className="relative pl-[58px]"><motion.span animate={{ scale: isActive ? 1.08 : 1 }} transition={{ duration: 0.25 }} className={`absolute left-0 top-3 z-10 grid h-[50px] w-[50px] place-items-center rounded-2xl border transition-colors duration-300 ${isActive ? 'border-[#000080] bg-[#000080] text-white shadow-[0_10px_28px_rgba(0,0,128,0.28)]' : isComplete ? 'border-[#000080]/20 bg-[#ededff] text-[#000080]' : 'border-slate-200 bg-white text-[#000080]'}`}>{isComplete ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}</motion.span><div className={`overflow-hidden rounded-[20px] border transition-all duration-300 ${isActive ? 'border-[#000080] bg-[#000080] text-white shadow-[0_16px_40px_rgba(0,0,128,0.18)]' : 'border-slate-200 bg-white text-slate-950 shadow-sm'}`}><div className="p-4"><div className={`text-[10px] font-black uppercase tracking-[0.15em] ${isActive ? 'text-[#aaaaff]' : isComplete ? 'text-[#000080]' : 'text-slate-400'}`}>{data.stepLabel} {step.number || String(index + 1).padStart(2, '0')}</div><div className="mt-1.5 flex items-start justify-between gap-3"><h3 className="text-[15px] font-bold leading-5 tracking-[-0.02em]">{step.title}</h3>{isComplete ? <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#000080] text-white"><Check className="h-3.5 w-3.5" /></span> : <ChevronDown className={`h-5 w-5 shrink-0 transition-transform duration-300 ${isActive ? 'rotate-180 text-white' : 'text-slate-400'}`} />}</div></div><div className={`grid transition-[grid-template-rows,opacity] duration-300 ${isActive ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}><div className="min-h-0 overflow-hidden"><p className="border-t border-white/10 px-4 pb-4 pt-3 text-sm leading-6 text-white/72">{step.description}</p></div></div></div></article>;
              })}
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#000080]/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-[#000080] to-[#7777ff]" animate={{ width: `${mobileJourneyProgress * 100}%` }} transition={{ duration: 0.12, ease: 'linear' }} /></div>
          </div>
        </div>
      </div>
    </div>
  </section>;
}

const scopeGroupDefinitions = [
  { icon: Layers3, matches: /page|design|content|copy|graphic|migration|animation/i },
  { icon: Workflow, matches: /commerce|product|booking|payment/i },
  { icon: Database, matches: /membership|login|database|crm|api|backend|integration/i },
  { icon: Globe2, matches: /language|location|seo|accelerated|delivery/i }
];

function groupScopeFactors(factors: string[], contentGroups: any[]) {
  const groups = scopeGroupDefinitions.map((group, index) => ({ ...group, title: contentGroups[index]?.title || defaultPricingTemplateData.scopeAndPayment.scopeGroups[index]?.title || '', description: contentGroups[index]?.description || defaultPricingTemplateData.scopeAndPayment.scopeGroups[index]?.description || '', items: [] as string[] }));
  factors.forEach(factor => {
    const matchingIndex = groups.findIndex(group => group.matches.test(factor));
    const fallbackIndex = groups.reduce((smallest, group, index) => group.items.length < groups[smallest].items.length ? index : smallest, 0);
    groups[matchingIndex >= 0 ? matchingIndex : fallbackIndex].items.push(factor);
  });
  return groups;
}

function ScopeAndPaymentSection({ data }: { data: any }) {
  const scopeGroups = groupScopeFactors(Array.isArray(data.priceFactors) ? data.priceFactors : [], Array.isArray(data.scopeGroups) ? data.scopeGroups : []);
  const paymentPlans = Array.isArray(data.paymentPlans) ? data.paymentPlans : [];
  const [activeScopeGroup, setActiveScopeGroup] = useState(0);
  const [activePaymentPlan, setActivePaymentPlan] = useState(0);
  const selectedScopeGroup = scopeGroups[activeScopeGroup] || scopeGroups[0];
  const selectedPaymentPlan = paymentPlans[activePaymentPlan] || paymentPlans[0];
  const paymentMilestones = Array.isArray(selectedPaymentPlan?.milestones) ? selectedPaymentPlan.milestones : [];

  return <section className="relative overflow-x-clip py-20 sm:py-28">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_12%,rgba(96,96,255,0.10),transparent_28%),radial-gradient(circle_at_8%_70%,rgba(0,0,128,0.06),transparent_30%)]" />
    <div className="pf-container relative">
      <div className="grid gap-8 border-b border-slate-200 pb-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-end lg:gap-20"><div><div className="pf-eyebrow text-[#000080]">{data.eyebrow}</div><h2 className="pf-section-title mt-4 max-w-[16ch]">{data.title}</h2></div><p className="max-w-2xl text-lg leading-8 text-slate-600 lg:pb-1">{data.description}</p></div>
      <div className="mt-10 grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <div className="overflow-visible rounded-[28px] border border-slate-200 bg-white shadow-[0_25px_80px_rgba(15,23,42,0.08)] sm:overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-6 sm:px-8 sm:py-7"><div className="flex items-start justify-between gap-6"><div><div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#000080]">{data.scopeMapLabel}</div><h3 className="mt-2 text-2xl font-bold tracking-[-0.035em] sm:text-3xl">{data.priceFactorsTitle}</h3></div><span className="hidden shrink-0 rounded-full bg-[#f1f2ff] px-3 py-1.5 text-xs font-bold text-[#000080] sm:inline-flex">{data.priceFactors?.length || 0} {data.considerationsLabel}</span></div></div>
          <div className="divide-y divide-slate-200 bg-slate-200 sm:hidden">{scopeGroups.map((group, index) => { const Icon = group.icon; return <div key={`mobile-${group.title}`} className="relative bg-[#f7f8fc]"><div className="sticky top-0 z-30 flex min-h-[92px] w-full items-center gap-3 border-b border-white/10 bg-[#000080]/95 p-4 text-white shadow-[0_10px_28px_rgba(0,0,128,0.18)] backdrop-blur-xl"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block font-bold">{group.title}</span><span className="mt-1 block text-[11px] leading-4 text-white/65">{group.description}</span></span><span className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-white px-2 text-xs font-black text-[#000080]">{group.items.length}</span></div><div className="space-y-2 p-4">{group.items.map(item => <div key={item} className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#ededff] text-[#000080]"><Check className="h-3.5 w-3.5" /></span><span className="text-sm font-semibold leading-5 text-slate-700">{item}</span></div>)}</div></div>; })}</div>
          <div className="hidden gap-px bg-slate-200 sm:grid sm:grid-cols-2">{scopeGroups.map((group, index) => { const Icon = group.icon; const isActive = activeScopeGroup === index; return <button key={group.title} type="button" onClick={() => setActiveScopeGroup(index)} aria-pressed={isActive} className={`group min-h-[150px] p-5 text-left transition-all duration-300 sm:p-6 ${isActive ? 'bg-[#000080] text-white' : 'bg-white text-slate-950 hover:bg-[#f6f7ff]'}`}><div className="flex items-start justify-between gap-4"><span className={`grid h-11 w-11 place-items-center rounded-xl border transition-colors ${isActive ? 'border-white/20 bg-white/10' : 'border-[#000080]/10 bg-[#f2f3ff] text-[#000080]'}`}><Icon className="h-5 w-5" /></span><span className={`text-xs font-black ${isActive ? 'text-white/55' : 'text-slate-400'}`}>0{index + 1}</span></div><div className="mt-5 flex items-end justify-between gap-3"><div><div className="font-bold">{group.title}</div><p className={`mt-1 max-w-[30ch] text-xs leading-5 ${isActive ? 'text-white/65' : 'text-slate-500'}`}>{group.description}</p></div><span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-black ${isActive ? 'bg-white text-[#000080]' : 'bg-slate-100 text-slate-600'}`}>{group.items.length}</span></div></button>; })}</div>
          <div className="hidden min-h-[260px] bg-[#f7f8fc] p-6 sm:block sm:p-8"><AnimatePresence mode="wait"><motion.div key={selectedScopeGroup?.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28 }}><div className="flex items-center justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-[0.14em] text-[#000080]">{data.selectedAreaLabel}</div><h4 className="mt-2 text-xl font-bold">{selectedScopeGroup?.title}</h4></div><ArrowRight className="h-5 w-5 text-[#000080]" /></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{(selectedScopeGroup?.items || []).map((item: string, index: number) => <motion.div key={item} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.035 }} className="group flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#000080]/35 hover:shadow-md"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#ededff] text-[#000080]"><Check className="h-3.5 w-3.5" /></span><span className="text-sm font-semibold leading-5 text-slate-700">{item}</span></motion.div>)}</div></motion.div></AnimatePresence></div>
        </div>

        <div className="overflow-visible rounded-[28px] border border-white/10 bg-[#0d1020] text-white shadow-[0_30px_90px_rgba(10,13,31,0.22)] sm:overflow-hidden">
          <div className="border-b border-white/10 p-6 sm:p-8"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#aaaaff]">{data.paymentJourneyLabel}</div><h3 className="mt-2 text-2xl font-bold tracking-[-0.035em] sm:text-3xl">{data.paymentTitle}</h3><p className="mt-3 max-w-md text-sm leading-6 text-white/55">{data.paymentDescription}</p></div>
          <div className="border-b border-white/10 sm:hidden">{paymentPlans.map((plan: any, index: number) => { const milestones = Array.isArray(plan.milestones) ? plan.milestones : []; return <div key={`mobile-${plan.name}`} className="relative border-b border-white/10 bg-[#0d1020] last:border-b-0"><div className="sticky top-0 z-30 flex min-h-[64px] w-full items-center gap-3 border-b border-white/10 bg-[#111426]/95 px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#aaaaff] text-xs font-black text-[#000080]">0{index + 1}</span><span className="min-w-0 flex-1 text-sm font-bold text-white">{plan.name}</span><span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#aaaaff]">{data.milestonesLabel}</span></div><div className="relative px-4 pb-5 pt-5"><span className="absolute bottom-10 left-[31px] top-9 w-px bg-gradient-to-b from-[#aaaaff] via-[#6868df] to-white/10" />{milestones.map((milestone: string, milestoneIndex: number) => { const percentage = milestone.match(/^(\d+)%/)?.[1]; return <div key={`${milestone}-${milestoneIndex}`} className="relative flex min-h-[70px] items-start gap-3 pb-3 last:min-h-0 last:pb-0"><span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[11px] font-black ${milestoneIndex === 0 ? 'border-[#aaaaff] bg-[#aaaaff] text-[#000080]' : 'border-white/20 bg-[#171a2c] text-white'}`}>{percentage || milestoneIndex + 1}</span><div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.045] px-3.5 py-3"><div className="text-[9px] font-black uppercase tracking-[0.12em] text-white/40">{data.milestoneLabel} {milestoneIndex + 1}</div><div className="mt-1 text-sm font-semibold leading-5 text-white/85">{milestone}</div></div></div>; })}</div></div>; })}</div>
          <div className="hidden grid-cols-2 gap-2 border-b border-white/10 p-4 sm:grid sm:p-5">{paymentPlans.map((plan: any, index: number) => <button key={plan.name} type="button" onClick={() => setActivePaymentPlan(index)} aria-pressed={activePaymentPlan === index} className={`min-h-12 rounded-xl px-3 py-2 text-left text-xs font-bold leading-4 transition-all ${activePaymentPlan === index ? 'bg-white text-[#000080] shadow-lg' : 'border border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white'}`}>{plan.name}</button>)}</div>
          <div className="hidden p-6 sm:block sm:p-8"><AnimatePresence mode="wait"><motion.div key={selectedPaymentPlan?.name} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.3 }}><div className="flex items-center justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-[0.14em] text-[#aaaaff]">{data.selectedPackageLabel}</div><h4 className="mt-2 text-2xl font-bold">{selectedPaymentPlan?.name}</h4></div><span className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-white/[0.06]"><Workflow className="h-5 w-5 text-[#aaaaff]" /></span></div><div className="relative mt-8 space-y-0"><span className="absolute bottom-5 left-[17px] top-5 w-px bg-gradient-to-b from-[#aaaaff] via-[#6868df] to-white/10" />{paymentMilestones.map((milestone: string, index: number) => { const percentage = milestone.match(/^(\d+)%/)?.[1]; return <div key={`${milestone}-${index}`} className="relative flex min-h-[82px] items-start gap-4 pb-5 last:pb-0"><span className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border text-xs font-black ${index === 0 ? 'border-[#aaaaff] bg-[#aaaaff] text-[#000080] shadow-[0_0_0_6px_rgba(170,170,255,0.10)]' : 'border-white/20 bg-[#171a2c] text-white'}`}>{percentage || index + 1}</span><div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3"><div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/40">{data.milestoneLabel} {index + 1}</div><div className="mt-1 text-sm font-semibold leading-5 text-white/85">{milestone}</div></div></div>; })}</div></motion.div></AnimatePresence></div>
        </div>
      </div>
      <div className="mt-6 overflow-hidden rounded-[24px] border border-[#000080]/15 bg-[#f1f2ff]"><div className="grid lg:grid-cols-[0.72fr_1.28fr]"><div className="border-b border-[#000080]/10 p-6 sm:p-8 lg:border-b-0 lg:border-r"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#000080] text-white"><ShieldCheck className="h-5 w-5" /></span><div className="pf-eyebrow text-[#000080]">{data.transparencyTitle}</div></div><p className="mt-5 text-base leading-7 text-slate-600">{data.transparencyDescription}</p></div><div className="p-6 sm:p-8"><h3 className="text-lg font-bold tracking-[-0.025em]">{data.thirdPartyTitle}</h3><div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{(data.thirdPartyCosts || []).map((cost: string, index: number) => <div key={cost} className="flex items-center gap-3 rounded-xl border border-white bg-white/80 px-3.5 py-3 text-xs font-semibold text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#000080]/20 hover:text-[#000080]"><span className="text-[10px] font-black text-[#000080]/45">{String(index + 1).padStart(2, '0')}</span>{cost}</div>)}</div></div></div></div>
    </div>
  </section>;
}

function ActionLink({ href, children, className }: { href?: string; children: ReactNode; className: string }) {
  const resolved = href || '/contact-us';
  if (resolved.startsWith('/')) return <Link to={resolved} className={className}>{children}</Link>;
  return <a href={resolved} className={className}>{children}</a>;
}

function PlanPackagesGrid({ plans, labels }: { plans: any[]; labels: any }) {
  const groups = Array.from({ length: Math.ceil(plans.length / 2) }, (_, groupIndex) => plans.slice(groupIndex * 2, groupIndex * 2 + 2));
  return <div className="mt-12 grid gap-6 xl:grid-cols-2">{groups.map((group, groupIndex) => {
    const highlightedGroup = group.some((plan: any) => plan.featured);
    return <div key={`plan-group-${groupIndex}`} className={`grid gap-px overflow-hidden rounded-3xl border p-px sm:grid-cols-2 ${highlightedGroup ? 'border-[#000080]/15 bg-[#eef2ff] shadow-xl shadow-[#000080]/5' : 'border-slate-200 bg-slate-200'}`}>{group.map((plan: any, index: number) => <motion.article key={plan.id || plan.name} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.12 }} transition={{ delay: index * 0.06 }} className={`relative flex min-w-0 flex-col p-6 sm:p-7 ${plan.featured ? 'bg-[#f3f3ff]' : 'bg-white'}`}><div className="flex min-h-8 items-start justify-between gap-3"><div className="pf-eyebrow text-[#000080]">{plan.badge}</div>{plan.featured && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#000080] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white"><BadgeCheck className="h-3 w-3" />{labels.popular}</span>}</div><h3 className="mt-4 text-2xl font-bold tracking-[-0.035em]">{plan.name}</h3><p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">{plan.pricePrefix}</p><div className="mt-1 text-4xl font-semibold tracking-[-0.05em] text-[#000080]">{plan.price}</div><p className="mt-5 text-sm leading-6 text-slate-600">{plan.summary}</p><div className="mt-5 rounded-xl border border-slate-200 bg-white/75 p-4"><div className="text-[11px] font-black uppercase tracking-wider text-[#000080]">{labels.bestFor}</div><p className="mt-2 text-sm leading-6 text-slate-600">{plan.bestFor}</p></div><ActionLink href={asContactLink(plan.ctaUrl)} className={`mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition-transform hover:-translate-y-1 ${plan.featured ? 'bg-[#000080] text-white' : 'border border-slate-300 bg-white text-slate-950 hover:border-[#000080] hover:text-[#000080]'}`}>{plan.ctaText}<ArrowUpRight className="h-4 w-4" /></ActionLink><div className="mt-6 text-sm font-bold">{labels.included}</div><ul className="mt-4 flex-1 space-y-3">{(plan.features || []).map((feature: string) => <li key={feature} className="flex gap-2.5 text-sm leading-5 text-slate-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]" />{feature}</li>)}</ul><div className="mt-7 border-t border-slate-200 pt-5"><div className="text-[11px] font-black uppercase tracking-wider text-slate-500">{labels.technology}</div><div className="mt-3 flex flex-wrap gap-2">{(plan.technologies || []).map((tech: any) => <div key={tech.name} title={tech.name} className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold">{tech.logoUrl && <img src={tech.logoUrl} alt="" className="h-5 w-5 object-contain" loading="lazy" />}{tech.name}</div>)}</div></div><blockquote className="mt-6 border-l-2 border-[#000080] pl-4 text-sm italic leading-6 text-slate-600">&ldquo;{plan.quote}&rdquo;</blockquote></motion.article>)}</div>;
  })}</div>;
}

export default function PricingDetailView({ page }: { page?: Partial<CustomPage> }) {
  const { content } = useCMS();
  const data = { ...defaultPricingTemplateData, ...(page?.serviceDetailData || {}) } as any;
  const hero = { ...defaultPricingTemplateData.hero, ...(data.hero || {}) };
  const assurance = { ...defaultPricingTemplateData.assurance, ...(data.assurance || {}) };
  const planLabels = { ...defaultPricingTemplateData.planLabels, ...(data.planLabels || {}) };
  const comparison = { ...defaultPricingTemplateData.comparison, ...(data.comparison || {}) };
  const pricingProcess = { ...defaultPricingTemplateData.pricingProcess, ...(data.pricingProcess || {}) };
  const scopeAndPayment = { ...defaultPricingTemplateData.scopeAndPayment, ...(data.scopeAndPayment || {}) };
  const carePlans = { ...defaultPricingTemplateData.carePlans, ...(data.carePlans || {}) };
  const recommendation = { ...defaultPricingTemplateData.recommendation, ...(data.recommendation || {}) };
  const faq = { ...defaultPricingTemplateData.faq, ...(data.faq || {}) };
  const closing = { ...defaultPricingTemplateData.closing, ...(data.closing || {}) };
  const plans = Array.isArray(data.plans) ? data.plans : defaultPricingTemplateData.plans;
  const comparisonPlanCount = Math.max(plans.length, 1);
  const comparisonMinWidth = Math.max(1000, 280 + comparisonPlanCount * 210);
  const comparisonGridTemplateColumns = `minmax(220px, 1.35fr) repeat(${comparisonPlanCount}, minmax(190px, 1fr))`;
  const homepageHero = content.hero || {};
  const trustedLogos = Array.isArray(homepageHero.trustedLogos) ? homepageHero.trustedLogos : [];
  const trustedByTitle = homepageHero.trustedByTitle || hero.trustedFallbackTitle || 'Trusted by:';
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const comparisonHeaderRef = useRef<HTMLDivElement>(null);
  const comparisonHeaderScrollerRef = useRef<HTMLDivElement>(null);
  const comparisonBodyScrollerRef = useRef<HTMLDivElement>(null);
  const [comparisonHeaderHeight, setComparisonHeaderHeight] = useState(0);

  useLayoutEffect(() => {
    const header = comparisonHeaderRef.current;
    if (!header) return;
    const updateHeaderHeight = () => setComparisonHeaderHeight(Math.ceil(header.getBoundingClientRect().height));
    updateHeaderHeight();
    const resizeObserver = new ResizeObserver(updateHeaderHeight);
    resizeObserver.observe(header);
    window.addEventListener('resize', updateHeaderHeight, { passive: true });
    return () => { resizeObserver.disconnect(); window.removeEventListener('resize', updateHeaderHeight); };
  }, [plans.length]);

  return <div className="min-h-screen overflow-x-clip bg-white text-slate-950">
    <section className="relative overflow-hidden pb-16 pt-40 sm:pb-20 sm:pt-44"><div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_20%,rgba(92,92,255,0.14),transparent_34%),radial-gradient(circle_at_18%_80%,rgba(0,0,128,0.08),transparent_35%)]" /><div className="pf-container relative"><motion.div initial={false} className="max-w-6xl animate-in fade-in slide-in-from-bottom-6 duration-700"><div className="pf-eyebrow text-[#000080]">{hero.eyebrow}</div><h1 className="mt-6 max-w-[18ch] text-[clamp(2.2rem,6.7vw,6.25rem)] font-semibold leading-[1.01] tracking-[-0.045em] [overflow-wrap:anywhere] sm:[overflow-wrap:normal] sm:leading-[0.95] sm:tracking-[-0.05em]">&ldquo;{hero.quote}&rdquo;</h1><div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5"><HeroReviewProof /><p className="max-w-sm text-sm leading-6 text-slate-500">{hero.reviewLabel}</p></div><TrustedBrandRow logos={trustedLogos} title={trustedByTitle} className="mt-10 border-t border-slate-200 pt-8" /></motion.div></div></section>
    <section className="border-y border-slate-200 bg-[#f3f5fc] py-16 sm:py-20"><div className="pf-container grid items-center gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:gap-14 xl:gap-20"><div><div className="pf-eyebrow text-[#000080]">{assurance.eyebrow}</div><h2 className="pf-section-title mt-4">{assurance.title}</h2><p className="mt-5 max-w-xl text-base leading-7 text-slate-600">{assurance.description}</p></div><AssuranceCards points={assurance.points || []} /></div></section>
    <section id="website-packages" className="scroll-mt-24 py-20 sm:py-28"><div className="pf-container"><div className="max-w-3xl"><div className="pf-eyebrow text-[#000080]">{data.plansEyebrow}</div><h2 className="pf-section-title mt-4">{data.plansHeading}</h2><p className="mt-5 text-lg leading-8 text-slate-600">{data.plansDescription}</p></div><PlanPackagesGrid plans={plans} labels={planLabels} /></div></section>

    <section className="border-y border-slate-200 bg-white py-20 sm:py-28"><div className="pf-container"><div className="max-w-3xl"><div className="pf-eyebrow text-[#000080]">{comparison.eyebrow}</div><h2 className="pf-section-title mt-4">{comparison.title}</h2><p className="mt-5 text-lg leading-8 text-slate-600">{comparison.description}</p></div><div className="relative mt-10 border-x-0 border-y border-slate-200 bg-white shadow-none"><div className="sticky top-0 z-40 bg-white/95 shadow-[0_14px_18px_-16px_rgba(15,23,42,0.32)] backdrop-blur-xl"><div ref={comparisonHeaderScrollerRef} onScroll={event => { const bodyScroller = comparisonBodyScrollerRef.current; if (bodyScroller && Math.abs(bodyScroller.scrollLeft - event.currentTarget.scrollLeft) > 0.5) bodyScroller.scrollLeft = event.currentTarget.scrollLeft; }} className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:overflow-visible"><div ref={comparisonHeaderRef} className="grid border-b border-slate-200 will-change-transform" style={{ minWidth: comparisonMinWidth, gridTemplateColumns: comparisonGridTemplateColumns }}><div className="p-5 text-sm font-bold text-slate-500">{comparison.tableHeaderLabel}</div>{plans.map((plan: any) => <div key={plan.id || plan.name} className={`border-l border-slate-200 p-4 ${plan.featured ? 'bg-[#f3f3ff]' : ''}`}><div className="font-bold">{plan.name}</div><div className="mt-1 text-sm font-bold text-[#000080]">{plan.price}</div><ActionLink href={asContactLink(plan.ctaUrl)} className="mt-3 inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-[#000080] px-3 text-xs font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-[#090966] hover:shadow-md focus-visible:ring-4 focus-visible:ring-[#000080]/20">{plan.ctaText}</ActionLink></div>)}</div></div></div><div ref={comparisonBodyScrollerRef} onScroll={event => { const headerScroller = comparisonHeaderScrollerRef.current; if (headerScroller && Math.abs(headerScroller.scrollLeft - event.currentTarget.scrollLeft) > 0.5) headerScroller.scrollLeft = event.currentTarget.scrollLeft; }} className="overflow-x-auto overscroll-x-contain lg:overflow-visible"><div style={{ minWidth: comparisonMinWidth }}>{(comparison.categories || []).map((category: any) => <div key={category.name} className="relative"><div className="sticky z-30 border-b border-slate-200 bg-[#f5f6fb]/95 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-[#000080] backdrop-blur-xl will-change-transform" style={{ top: comparisonHeaderHeight }}>{category.name}</div>{(category.rows || []).map((row: any) => <div key={row.label} className="grid border-b border-slate-100 last:border-0" style={{ gridTemplateColumns: comparisonGridTemplateColumns }}><div className="px-5 py-4 text-sm font-semibold">{row.label}</div>{plans.map((plan: any, planIndex: number) => { const value = row.values?.[planIndex] ?? '—'; return <div key={`${plan.id}-${row.label}`} className={`border-l border-slate-100 px-4 py-4 text-sm leading-6 text-slate-600 ${plan.featured ? 'bg-[#fafaff]' : ''}`}>{isIncluded(value) ? <Check className="h-5 w-5 text-[#000080]" /> : value}</div>; })}</div>)}</div>)}</div></div></div><p className="mt-4 text-xs leading-5 text-slate-500">{comparison.note}</p></div></section>

    <PricingProcessSection data={pricingProcess} />
    <ScopeAndPaymentSection data={scopeAndPayment} />

    <section className="border-y border-slate-200 bg-[#f5f6fb] py-20 sm:py-28"><div className="pf-container"><div className="max-w-3xl"><div className="pf-eyebrow text-[#000080]">{carePlans.eyebrow}</div><h2 className="pf-section-title mt-4">{carePlans.title}</h2><p className="mt-5 text-lg leading-8 text-slate-600">{carePlans.description}</p></div><div className="mt-12 grid gap-5 lg:grid-cols-3">{(carePlans.plans || []).map((plan: any) => <article key={plan.id || plan.name} className={`relative flex flex-col rounded-2xl border p-6 sm:p-7 ${plan.featured ? 'border-[#000080] bg-[#f3f3ff] shadow-xl shadow-[#000080]/10' : 'border-slate-200 bg-white'}`}><div className="pf-eyebrow text-[#000080]">{plan.badge}</div><h3 className="mt-4 text-2xl font-bold tracking-[-0.035em]">{plan.name}</h3><div className="mt-5 flex items-end gap-1"><span className="text-4xl font-semibold tracking-[-0.05em] text-[#000080]">{plan.price}</span><span className="pb-1 text-sm text-slate-500">{plan.period}</span></div><p className="mt-5 min-h-16 text-sm leading-6 text-slate-600">{plan.description}</p><ul className="mt-6 flex-1 space-y-3">{(plan.features || []).map((feature: string) => <li key={feature} className="flex gap-2.5 text-sm leading-5 text-slate-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]" />{feature}</li>)}</ul><ActionLink href={asContactLink(plan.ctaUrl)} className={`mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition-transform hover:-translate-y-1 ${plan.featured ? 'bg-[#000080] text-white' : 'border border-slate-300 bg-white hover:border-[#000080] hover:text-[#000080]'}`}>{plan.ctaText}<ArrowUpRight className="h-4 w-4" /></ActionLink></article>)}</div><p className="mt-5 text-xs leading-5 text-slate-500">{carePlans.note}</p></div></section>
    <section className="py-20 sm:py-28"><div className="pf-container"><div className="grid gap-8 rounded-3xl bg-[#101322] px-7 py-10 text-white sm:px-12 sm:py-14 lg:grid-cols-[1fr_0.72fr] lg:items-center"><div><div className="pf-eyebrow text-[#aaaaff]">{recommendation.eyebrow}</div><h2 className="pf-section-title mt-4">{recommendation.title}</h2><p className="mt-5 max-w-3xl text-lg leading-8 text-white/65">{recommendation.description}</p><ActionLink href={asContactLink(recommendation.ctaUrl)} className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-bold text-[#000080] transition-transform hover:-translate-y-1">{recommendation.ctaText}<ArrowUpRight className="h-4 w-4" /></ActionLink></div><div className="rounded-2xl border border-white/10 bg-white/5 p-6"><h3 className="font-bold">{recommendation.promptTitle}</h3><div className="mt-4 space-y-3">{(recommendation.prompts || []).map((prompt: string) => <div key={prompt} className="flex items-center gap-3 text-sm text-white/75"><CircleCheckBig className="h-4 w-4 shrink-0 text-[#aaaaff]" />{prompt}</div>)}</div></div></div></div></section>
    <section className="py-20 sm:py-28"><div className="pf-container grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20"><div><div className="pf-eyebrow text-[#000080]">{faq.eyebrow}</div><h2 className="pf-section-title mt-4">{faq.title}</h2></div><div className="border-t border-slate-200">{(faq.items || []).map((item: any, index: number) => <div key={`${item.question}-${index}`} className="border-b border-slate-200"><button type="button" onClick={() => setOpenFaq(openFaq === index ? null : index)} className="flex w-full items-center justify-between gap-5 py-5 text-left text-base font-bold"><span>{item.question}</span><ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${openFaq === index ? 'rotate-180 text-[#000080]' : 'text-slate-400'}`} /></button><AnimatePresence>{openFaq === index && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><p className="max-w-2xl pb-6 text-base leading-7 text-slate-600">{item.answer}</p></motion.div>}</AnimatePresence></div>)}</div></div></section>
    <section className="pb-24"><div className="pf-container"><div className="overflow-hidden rounded-3xl bg-[#101322] px-7 py-12 text-white sm:px-12 sm:py-16 lg:flex lg:items-end lg:justify-between lg:gap-12"><div className="max-w-3xl"><div className="pf-eyebrow text-[#aaaaff]">{closing.eyebrow}</div><h2 className="pf-section-title mt-4">{closing.title}</h2><p className="mt-5 text-lg leading-8 text-white/65">{closing.description}</p></div><div className="mt-8 flex shrink-0 flex-col gap-3 lg:mt-0"><ActionLink href={asContactLink(closing.ctaUrl)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-bold text-[#000080] transition-transform hover:-translate-y-1">{closing.ctaText}<ArrowUpRight className="h-4 w-4" /></ActionLink>{closing.secondaryCtaText && <ActionLink href={asContactLink(closing.secondaryCtaUrl)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/20 px-6 text-sm font-bold text-white transition-colors hover:bg-white/10">{closing.secondaryCtaText}<ArrowUpRight className="h-4 w-4" /></ActionLink>}</div></div></div></section>
  </div>;
}
