import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Handshake,
  ShieldCheck,
  TrendingUp,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { useCMS } from '../lib/CMSProvider';
import { supabase } from '../lib/supabase';

interface PublicRewardRule {
  rank: number;
  kind: 'percent' | 'fixed';
  ratePercent?: number;
  fixedAmount?: number;
}

interface PublicTalentPartnerRole {
  careerJobId: string;
  jobTitle: string;
  jobSlug: string;
  rewardPublished: boolean;
  rewardModel?: 'sales' | 'project';
  qualifyingEventCount?: number;
  eventRewards: PublicRewardRule[];
  retentionEnabled: boolean;
  retentionMonths?: number;
  retentionRewardKind?: 'percent' | 'fixed';
  retentionRatePercent?: number;
  retentionFixedAmount?: number;
  currency?: string;
}

interface PublicTalentPartnerProgram {
  enabled: boolean;
  attributionWindowDays: number;
  payoutHoldDays: number;
  minimumPayout: number;
  defaultCurrency: string;
  requireAdminApproval: boolean;
  roles: PublicTalentPartnerRole[];
}

type MarketingCard = { title?: string; desc?: string; description?: string; features?: string[] };
type ProcessStep = { step?: string; title?: string; desc?: string; description?: string };
type FaqItem = { question?: string; answer?: string };

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoney(amount: unknown, currency = 'USD') {
  const value = numberValue(amount);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency || 'USD'} ${value.toLocaleString('en-US')}`;
  }
}

function ordinalLabel(rank: number) {
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  if (rank === 3) return '3rd';
  return `${rank}th`;
}

function rewardRuleLabel(rule: PublicRewardRule, role: PublicTalentPartnerRole) {
  if (rule.kind === 'fixed') return formatMoney(rule.fixedAmount, role.currency || 'USD');
  return `${numberValue(rule.ratePercent)}%`;
}

function rewardBasisLabel(role: PublicTalentPartnerRole) {
  return role.rewardModel === 'sales'
    ? 'of the qualifying verified sale amount'
    : 'of the Admin-approved amount payable for that qualifying project';
}

function orderedRewards(role?: PublicTalentPartnerRole | null) {
  if (!role) return [];
  const count = Math.max(0, numberValue(role.qualifyingEventCount));
  return [...asArray<PublicRewardRule>(role.eventRewards)]
    .filter((rule) => numberValue(rule.rank) > 0 && (!count || numberValue(rule.rank) <= count))
    .sort((a, b) => numberValue(a.rank) - numberValue(b.rank));
}

function retentionRewardLabel(role?: PublicTalentPartnerRole | null) {
  if (!role?.retentionEnabled) return '';
  if (role.retentionRewardKind === 'percent') return `${numberValue(role.retentionRatePercent)}%`;
  if (role.retentionRewardKind === 'fixed') return formatMoney(role.retentionFixedAmount, role.currency || 'USD');
  return '';
}

function interpolateCopy(value: unknown, variables: Record<string, string | number>) {
  let output = String(value || '');
  for (const [key, replacement] of Object.entries(variables)) {
    output = output.replaceAll(`{{${key}}}`, String(replacement));
  }
  return output;
}

function rewardSequence(role?: PublicTalentPartnerRole | null, eventName = 'Sale') {
  return orderedRewards(role)
    .map((rule) => `${rewardRuleLabel(rule, role as PublicTalentPartnerRole)} on ${eventName} #${numberValue(rule.rank)}`)
    .join(' · ');
}

function compactRewardSequence(role?: PublicTalentPartnerRole | null) {
  return orderedRewards(role).map((rule) => rewardRuleLabel(rule, role as PublicTalentPartnerRole)).join(' → ');
}

export default function TalentPartnerProgramView() {
  const { content, loading: cmsLoading } = useCMS();
  const [program, setProgram] = useState<PublicTalentPartnerProgram | null>(null);
  const [programLoading, setProgramLoading] = useState(true);
  const [programError, setProgramError] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const page = useMemo(() => {
    const pages = Array.isArray(content.customPages) ? content.customPages : [];
    return pages.find((item: any) => item?.id === 'talent-partner-program' || item?.slug === 'talent-partner-program');
  }, [content.customPages]);

  const data = page?.serviceDetailData && typeof page.serviceDetailData === 'object' ? page.serviceDetailData : {};
  const hero = data.hero && typeof data.hero === 'object' ? data.hero : {};
  const benefits = asArray<MarketingCard>(data.howWeHelp);
  const standards = asArray<string>(data.challenges);
  const process = asArray<ProcessStep>(data.ourProcess || data.engagement?.value);
  const faqs = asArray<FaqItem>(data.faqs);

  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    let loadedOnce = false;

    const loadProgram = async (showInitialLoader = false) => {
      if (requestInFlight) return;
      requestInFlight = true;
      if (showInitialLoader) setProgramLoading(true);

      try {
        const { data: publicProgram, error } = await supabase.rpc('public_get_talent_partner_program');
        if (!active) return;

        if (error) {
          console.error('Could not load public Talent Partner program configuration', error);
          if (!loadedOnce) {
            setProgramError('Live reward information is temporarily unavailable. No unpublished reward values are being shown.');
            setProgram(null);
          }
          return;
        }

        loadedOnce = true;
        setProgram(publicProgram as PublicTalentPartnerProgram);
        setProgramError('');
      } finally {
        requestInFlight = false;
        if (active) setProgramLoading(false);
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadProgram(false);
    };

    void loadProgram(true);
    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener('pageshow', refreshWhenVisible);
    window.addEventListener('online', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    const refreshTimer = window.setInterval(refreshWhenVisible, 30000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener('pageshow', refreshWhenVisible);
      window.removeEventListener('online', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  if (cmsLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center bg-white"><div className="h-10 w-10 animate-spin rounded-full border-4 border-[#000080]/20 border-t-[#000080]" /></div>;
  }

  if (!page || page.status !== 'published') {
    return (
      <section className="bg-white px-6 py-40 text-center">
        <div className="mx-auto max-w-xl">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#000080]">Talent Partner Program</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950">This page is not published.</h1>
          <p className="mt-4 text-slate-600">The program page can be published from the existing Website Pages admin area.</p>
          <Link to="/" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-bold text-white">Back to ProFox <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    );
  }

  const programOpen = program?.enabled === true;
  const roles = (program?.roles || []).filter((role) => role.rewardPublished);
  const salesRole = roles.find((role) => role.rewardModel === 'sales') || null;
  const projectRoles = roles.filter((role) => role.rewardModel === 'project');
  const projectRole = projectRoles[0] || null;
  const salesCount = Math.max(0, numberValue(salesRole?.qualifyingEventCount));
  const projectCount = Math.max(0, numberValue(projectRole?.qualifyingEventCount));
  const retentionLabel = retentionRewardLabel(salesRole);
  const retentionMonths = numberValue(salesRole?.retentionMonths);
  const primaryCtaText = hero.ctaText || 'Become a Talent Partner';
  const primaryCtaUrl = hero.ctaUrl || '/talent-partner';
  const secondaryCtaText = data.howWeHelpButtonText || 'See How You Earn';
  const secondaryCtaUrl = data.howWeHelpButtonUrl || '#how-you-earn';

  const copyVariables: Record<string, string | number> = {
    salesCount,
    projectCount,
    salesRewards: rewardSequence(salesRole, 'Sale'),
    projectRewards: rewardSequence(projectRole, 'Project'),
    retentionReward: retentionLabel,
    retentionMonths,
    attributionDays: numberValue(program?.attributionWindowDays),
    payoutHoldDays: numberValue(program?.payoutHoldDays),
  };

  const salesCompletionCopy = interpolateCopy(
    data.quote || 'After {{salesCount}} qualifying sales, the sales-commission portion of that referral is complete.',
    copyVariables,
  );
  const projectCompletionCopy = interpolateCopy(
    data.quoteAuthor || 'After {{projectCount}} qualifying completed projects, that referral’s project-reward cycle is complete.',
    copyVariables,
  );
  const retentionQualifier = interpolateCopy(
    data.frictionDescription || 'When the applicable retention and salary-transition conditions are met.',
    copyVariables,
  );

  return (
    <div className="overflow-x-hidden bg-white text-slate-950">
      <section className="relative isolate overflow-hidden bg-slate-950 pt-16 text-white lg:pt-24">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_10%_10%,rgba(56,189,248,0.17),transparent_34%),radial-gradient(circle_at_90%_18%,rgba(99,102,241,0.24),transparent_38%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-44 bg-gradient-to-t from-slate-950 to-transparent" />
        <div className="mx-auto grid max-w-7xl gap-12 px-6 pb-16 pt-14 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:px-8 lg:pb-24 lg:pt-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-sky-200 backdrop-blur">
              <Handshake className="h-3.5 w-3.5" /> {hero.subheading || 'PROFOX TALENT PARTNER PROGRAM'}
            </div>
            <h1 className="mt-7 max-w-4xl text-4xl font-black leading-[1.03] tracking-[-0.045em] sm:text-5xl lg:text-7xl">
              {hero.title || page.heroTitle || page.title}
              {hero.highlight ? <span className="mt-1 block bg-gradient-to-r from-sky-300 to-indigo-300 bg-clip-text text-transparent">{hero.highlight}</span> : null}
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
              {hero.description || page.heroSubtitle}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {programOpen ? (
                <Link to={primaryCtaUrl} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-black text-[#000080] shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:bg-slate-100">
                  {primaryCtaText} <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <span className="inline-flex cursor-not-allowed items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-bold text-slate-400">Program currently paused</span>
              )}
              <a href={secondaryCtaUrl} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/10">
                {secondaryCtaText} <ChevronRight className="h-4 w-4" />
              </a>
            </div>

            <div className="mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"><div className="text-2xl font-black">{programLoading ? '—' : program?.attributionWindowDays ?? '—'}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Day referral window</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"><div className="text-2xl font-black">{programLoading ? '—' : roles.length}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Referable roles</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"><div className="text-2xl font-black">{programLoading ? '—' : roles.length}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Reward plans live</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"><div className="text-2xl font-black">{programLoading ? '—' : program?.payoutHoldDays ?? '—'}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Day payout hold</div></div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-to-br from-sky-400/20 via-indigo-500/15 to-transparent blur-2xl" />
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 backdrop-blur sm:p-7">
              <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-sky-300">Live reward summary</p>
                  <h2 className="mt-2 text-xl font-black">Know what you can earn before you refer.</h2>
                </div>
                <TrendingUp className="h-7 w-7 shrink-0 text-sky-300" />
              </div>

              {programError ? <p className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">{programError}</p> : null}
              {programLoading ? <div className="mt-6 h-40 animate-pulse rounded-2xl bg-white/5" /> : (
                <div className="mt-5 space-y-4">
                  {salesRole ? (
                    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-5">
                      <div className="flex items-center gap-2 text-sm font-black"><Award className="h-4 w-4 text-sky-300" /> Sales referral</div>
                      <p className="mt-2 text-xs leading-5 text-slate-400">Earn on the first {salesCount} qualifying verified {salesCount === 1 ? 'sale' : 'sales'} only.</p>
                      <div className="mt-4 text-2xl font-black tracking-tight text-white">{compactRewardSequence(salesRole)}</div>
                    </div>
                  ) : null}

                  {projectRole ? (
                    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-5">
                      <div className="flex items-center gap-2 text-sm font-black"><BriefcaseBusiness className="h-4 w-4 text-emerald-300" /> Content, Design & Development</div>
                      <p className="mt-2 text-xs leading-5 text-slate-400">Earn on the first {projectCount} qualifying completed {projectCount === 1 ? 'project' : 'projects'} for each eligible referral.</p>
                      <div className="mt-4 text-2xl font-black tracking-tight text-white">{compactRewardSequence(projectRole)}</div>
                    </div>
                  ) : null}

                  {salesRole?.retentionEnabled && retentionLabel ? (
                    <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] p-5">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-300">Final retention reward</p>
                      <div className="mt-2 flex items-end gap-2"><span className="text-3xl font-black">+{retentionLabel}</span><span className="pb-1 text-xs text-slate-300">after {retentionMonths} months</span></div>
                      <p className="mt-2 text-xs leading-5 text-slate-400">{retentionQualifier}</p>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-3 px-6 py-7 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
          {benefits.slice(0, 4).map((item, index) => {
            const icons = [ShieldCheck, Award, WalletCards, UsersRound];
            const Icon = icons[index] || Check;
            return (
              <div key={`${item.title}-${index}`} className="flex gap-3 rounded-2xl p-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#000080]/[0.07] text-[#000080]"><Icon className="h-5 w-5" /></span>
                <div><div className="text-sm font-black text-slate-900">{item.title}</div><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.desc || item.description}</p></div>
              </div>
            );
          })}
        </div>
      </section>

      <section id="how-you-earn" className="bg-slate-50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#000080]">Reward cycle clarity</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">{data.quoteHeading || 'How Long Do You Earn From One Referral?'}</h2>
            <p className="mt-5 text-base leading-7 text-slate-600">{data.quoteDescription || 'This is a milestone-based referral reward program, not a lifetime recurring commission program.'}</p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {salesRole ? (
              <article className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
                <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#000080] text-white"><TrendingUp className="h-5 w-5" /></span><div><p className="text-xs font-black uppercase tracking-wider text-[#000080]">Sales Representative Referral</p><h3 className="mt-1 text-xl font-black">Earn from the first {salesCount} qualifying sales.</h3></div></div>
                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  {orderedRewards(salesRole).map((rule) => (
                    <div key={rule.rank} className="rounded-2xl bg-slate-50 p-4 text-center"><div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{ordinalLabel(rule.rank)} sale</div><div className="mt-2 text-2xl font-black text-[#000080]">{rewardRuleLabel(rule, salesRole)}</div></div>
                  ))}
                </div>
                <p className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">{salesCompletionCopy}</p>
                {salesRole.retentionEnabled && retentionLabel ? <p className="mt-4 text-sm leading-6 text-slate-600">You may still qualify for the separate <strong>{retentionLabel} one-time final retention reward</strong> after {retentionMonths} months, {retentionQualifier.toLowerCase()}</p> : null}
              </article>
            ) : null}

            {projectRole ? (
              <article className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
                <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-600 text-white"><BriefcaseBusiness className="h-5 w-5" /></span><div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Content / Design / Development Referral</p><h3 className="mt-1 text-xl font-black">Earn from the first {projectCount} qualifying projects.</h3></div></div>
                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  {orderedRewards(projectRole).map((rule) => (
                    <div key={rule.rank} className="rounded-2xl bg-slate-50 p-4 text-center"><div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{ordinalLabel(rule.rank)} project</div><div className="mt-2 text-2xl font-black text-emerald-700">{rewardRuleLabel(rule, projectRole)}</div></div>
                  ))}
                </div>
                <p className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">{projectCompletionCopy}</p>
                <p className="mt-4 text-xs leading-5 text-slate-500">Individual project-role plans are shown below. If Admin changes a role plan, the live values on this page update from that configuration.</p>
              </article>
            ) : null}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#000080]">{data.processEyebrow || 'HOW IT WORKS'}</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">{data.processTitle || 'From one introduction to a real reward — in four simple steps.'}</h2>
            {data.processDescription ? <p className="mt-5 text-base leading-7 text-slate-600">{interpolateCopy(data.processDescription, copyVariables)}</p> : null}
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {process.map((item, index) => (
              <article key={`${item.title}-${index}`} className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <div className="text-5xl font-black tracking-[-0.06em] text-slate-200">{item.step || String(index + 1).padStart(2, '0')}</div>
                <h3 className="mt-5 text-lg font-black text-slate-950">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{interpolateCopy(item.desc || item.description, copyVariables)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-950 py-20 text-white sm:py-28">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">{data.howWeHelpEyebrow || 'WHY PARTNER WITH PROFOX'}</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] sm:text-5xl">{data.howWeHelpTitle || 'A simple way to turn great introductions into additional income.'}</h2>
            {data.howWeHelpDesc ? <p className="mt-5 text-base leading-7 text-slate-300">{data.howWeHelpDesc}</p> : null}
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {benefits.map((item, index) => {
              const icons = [ShieldCheck, TrendingUp, WalletCards, Handshake];
              const Icon = icons[index] || Check;
              return (
                <article key={`${item.title}-${index}`} className="rounded-3xl border border-white/10 bg-white/[0.05] p-7">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-sky-300"><Icon className="h-5 w-5" /></span>
                  <h3 className="mt-5 text-xl font-black">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{item.desc || item.description}</p>
                  {asArray<string>(item.features).length ? <ul className="mt-5 space-y-2">{asArray<string>(item.features).map((feature) => <li key={feature} className="flex gap-2 text-sm text-slate-200"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> {feature}</li>)}</ul> : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#000080]">{data.pricingEyebrow || 'LIVE REWARDS BY ROLE'}</p>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">{data.pricingTitle || 'Know what you can earn before you refer anyone.'}</h2>
              {data.pricingDescription ? <p className="mt-5 text-base leading-7 text-slate-600">{data.pricingDescription}</p> : null}
            </div>
            {program ? <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-bold text-slate-700"><strong>{program.attributionWindowDays} days</strong> referral tracking · <strong>{program.payoutHoldDays} days</strong> standard payout hold</div> : null}
          </div>

          {programError ? <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-900">{programError}</div> : null}
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {roles.map((role) => {
              const count = Math.max(0, numberValue(role.qualifyingEventCount));
              const eventWord = role.rewardModel === 'sales' ? 'sale' : 'project';
              const completionTemplate = role.rewardModel === 'sales' ? salesCompletionCopy : projectCompletionCopy;
              const roleRetention = retentionRewardLabel(role);
              return (
                <article key={role.careerJobId} className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:p-8">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full bg-[#000080]/[0.06] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#000080]"><Award className="h-3.5 w-3.5" /> Refer this role</div>
                      <h3 className="mt-4 text-2xl font-black tracking-tight text-slate-950">{role.jobTitle}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">Earn from the first {count} qualifying {count === 1 ? eventWord : `${eventWord}s`} for this referral.</p>
                    </div>
                    <Link to={`/careers/${role.jobSlug}`} className="inline-flex shrink-0 items-center gap-1.5 text-sm font-black text-[#000080] hover:underline">View role <ChevronRight className="h-4 w-4" /></Link>
                  </div>

                  <div className="mt-7 grid gap-3 sm:grid-cols-3">
                    {orderedRewards(role).map((rule) => (
                      <div key={rule.rank} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{ordinalLabel(rule.rank)} qualifying {eventWord}</p>
                        <div className="mt-2 text-2xl font-black text-[#000080]">{rewardRuleLabel(rule, role)}</div>
                        <p className="mt-2 text-[11px] leading-5 text-slate-500">{rewardBasisLabel(role)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold leading-6 text-slate-700">{completionTemplate}</div>

                  {role.retentionEnabled && roleRetention ? (
                    <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><div><p className="text-xs font-black uppercase tracking-wider text-emerald-800">Final retention reward after {role.retentionMonths} months</p><div className="mt-1 text-2xl font-black text-emerald-950">{roleRetention} <span className="text-sm font-bold">one-time final reward</span></div><p className="mt-2 text-xs leading-5 text-emerald-900/70">{retentionQualifier}</p></div></div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#000080]">{data.challengesEyebrow || 'QUALITY OVER VOLUME'}</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">{data.challengesTitle || 'You do not need hundreds of referrals. You need the right ones.'}</h2>
            {data.challengesDescription ? <p className="mt-5 text-base leading-7 text-slate-600">{data.challengesDescription}</p> : null}
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {standards.map((item, index) => (
              <div key={`${item}-${index}`} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#000080] text-xs font-black text-white">{index + 1}</span>
                <p className="text-sm font-semibold leading-6 text-slate-700">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#000080]">Questions before you join</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">{data.faqsTitle || 'Talent Partner FAQs'}</h2>
            {data.faqsDesc ? <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600">{data.faqsDesc}</p> : null}
          </div>
          <div className="mt-10 divide-y divide-slate-200 rounded-3xl border border-slate-200 bg-white px-5 sm:px-7">
            {faqs.map((item, index) => {
              const isOpen = openFaq === index;
              return (
                <div key={`${item.question}-${index}`}>
                  <button type="button" onClick={() => setOpenFaq(isOpen ? null : index)} className="flex w-full items-center justify-between gap-5 py-5 text-left">
                    <span className="text-sm font-black text-slate-900 sm:text-base">{item.question}</span>
                    <ChevronDown className={`h-5 w-5 shrink-0 text-[#000080] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen ? <p className="pb-6 pr-8 text-sm leading-7 text-slate-600">{interpolateCopy(item.answer, copyVariables)}</p> : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-[#000080] px-6 py-20 text-white sm:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-200">{data.ctaEyebrow || 'BUILD A STRONGER PROFOX NETWORK'}</p>
          <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] sm:text-5xl">{data.ctaTitle || 'You may already know your next successful referral.'}</h2>
          {data.ctaDescription ? <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-blue-100">{data.ctaDescription}</p> : null}
          {programOpen ? <Link to={data.ctaUrl || '/talent-partner'} className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-black text-[#000080] shadow-xl transition hover:-translate-y-0.5">{data.ctaButtonText || 'Become a Talent Partner'} <ArrowRight className="h-4 w-4" /></Link> : null}
          <p className="mt-5 text-xs font-semibold text-blue-200">Create your account · Complete payout setup · Get approved · Start referring</p>
        </div>
      </section>
    </div>
  );
}
