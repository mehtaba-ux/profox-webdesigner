import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Clock3,
  Globe2,
  Handshake,
  ShieldCheck,
  Sparkles,
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
  const percent = numberValue(rule.ratePercent);
  return `${percent}%`;
}

function rewardBasisLabel(role: PublicTalentPartnerRole) {
  return role.rewardModel === 'sales'
    ? 'of the qualifying verified sale amount'
    : 'of the Admin-approved worker payable amount';
}

export default function TalentPartnerProgramView() {
  const { content, loading: cmsLoading } = useCMS();
  const [program, setProgram] = useState<PublicTalentPartnerProgram | null>(null);
  const [programLoading, setProgramLoading] = useState(true);
  const [programError, setProgramError] = useState('');

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
    const load = async () => {
      setProgramLoading(true);
      setProgramError('');
      const { data: publicProgram, error } = await supabase.rpc('public_get_talent_partner_program');
      if (!active) return;
      if (error) {
        console.error('Could not load public Talent Partner program configuration', error);
        setProgramError('Live reward information is temporarily unavailable. No unpublished reward values are being shown.');
        setProgram(null);
      } else {
        setProgram(publicProgram as PublicTalentPartnerProgram);
      }
      setProgramLoading(false);
    };
    load();
    return () => { active = false; };
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
  const roles = program?.roles || [];
  const publishedRewardCount = roles.filter((role) => role.rewardPublished).length;
  const primaryCtaText = hero.ctaText || 'Become a Talent Partner';
  const primaryCtaUrl = hero.ctaUrl || '/talent-partner';
  const secondaryCtaText = hero.secondaryCtaText || 'See How It Works';
  const secondaryCtaUrl = hero.secondaryCtaUrl || '#how-it-works';

  return (
    <div className="overflow-x-hidden bg-white text-slate-950">
      <section className="relative isolate overflow-hidden bg-slate-950 pt-16 text-white lg:pt-24">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_15%_15%,rgba(56,189,248,0.16),transparent_34%),radial-gradient(circle_at_85%_20%,rgba(99,102,241,0.22),transparent_36%)]" />
        <div className="mx-auto grid max-w-7xl gap-12 px-6 pb-16 pt-16 lg:grid-cols-[1.04fr_.96fr] lg:items-center lg:px-8 lg:pb-24 lg:pt-20">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-sky-200 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> {hero.subheading || hero.eyebrow || 'ProFox Talent Partner Program'}
            </div>
            <h1 className="mt-7 max-w-4xl text-4xl font-black leading-[1.04] tracking-[-0.045em] sm:text-5xl lg:text-7xl">
              {hero.title || page.heroTitle || page.title}
              {hero.highlight ? <span className="block bg-gradient-to-r from-sky-300 to-indigo-300 bg-clip-text text-transparent">{hero.highlight}</span> : null}
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

            <div className="mt-10 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"><div className="text-2xl font-black">{programLoading ? '—' : program?.attributionWindowDays ?? '—'}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Day attribution</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"><div className="text-2xl font-black">{roles.length || '—'}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Referable roles</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"><div className="text-2xl font-black">{programLoading ? '—' : publishedRewardCount}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Reward plans live</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"><div className="text-2xl font-black">1</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Source of truth</div></div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-to-br from-sky-400/20 via-indigo-500/15 to-transparent blur-2xl" />
            <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-2 shadow-2xl shadow-black/30">
              {hero.image ? (
                <img src={hero.image} alt={hero.imageAlt || 'ProFox Talent Partner Program'} className="aspect-[4/4.35] w-full rounded-[1.55rem] object-cover" />
              ) : (
                <div className="flex aspect-[4/4.35] items-center justify-center rounded-[1.55rem] bg-gradient-to-br from-[#000080] to-slate-900 p-10 text-center">
                  <div><Handshake className="mx-auto h-16 w-16 text-sky-300" /><p className="mt-5 text-lg font-bold">Upload the hero image from the existing Template Manager.</p></div>
                </div>
              )}
            </div>
            <div className="absolute -bottom-5 -left-4 max-w-[260px] rounded-2xl border border-white/10 bg-slate-900/95 p-4 shadow-xl backdrop-blur sm:-left-8">
              <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /><p className="text-xs font-semibold leading-5 text-slate-200">Rewards shown on this page come directly from the live Talent Partner configuration—never from copied marketing values.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-4 px-6 py-7 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
          {[
            [ShieldCheck, 'First valid referral wins', 'Attribution is server-validated and protected.'],
            [Award, 'Performance-based rewards', 'Rewards follow verified sales or completed project work.'],
            [WalletCards, 'Controlled payouts', 'Approved rewards move through verification and payout controls.'],
            [UsersRound, 'No downline structure', 'One direct Talent Partner relationship—no MLM chain.'],
          ].map(([Icon, title, text]: any) => (
            <div key={title} className="flex gap-3 rounded-2xl p-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#000080]/[0.07] text-[#000080]"><Icon className="h-5 w-5" /></span><div><div className="text-sm font-black text-slate-900">{title}</div><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div></div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="bg-slate-50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#000080]">{data.processEyebrow || 'How it works'}</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">{data.processTitle || 'Refer the right person. We handle the hiring. You earn when the result qualifies.'}</h2>
            {data.processDescription ? <p className="mt-5 text-base leading-7 text-slate-600">{data.processDescription}</p> : null}
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {process.map((item, index) => (
              <article key={`${item.title}-${index}`} className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-5xl font-black tracking-[-0.06em] text-slate-100">{item.step || String(index + 1).padStart(2, '0')}</div>
                <h3 className="mt-4 text-lg font-black text-slate-950">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{item.description || item.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#000080]">{data.howWeHelpEyebrow || 'Why partner with ProFox'}</p>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">{data.howWeHelpTitle || 'A referral program built around real outcomes.'}</h2>
              <p className="mt-5 text-base leading-7 text-slate-600">{data.howWeHelpDesc || data.quoteDescription}</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {benefits.map((item, index) => (
                <article key={`${item.title}-${index}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-6 transition hover:-translate-y-0.5 hover:border-[#000080]/25 hover:bg-white hover:shadow-lg">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#000080] text-white"><Check className="h-5 w-5" /></span>
                  <h3 className="mt-5 text-lg font-black text-slate-950">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{item.description || item.desc}</p>
                  {asArray<string>(item.features).length ? <ul className="mt-4 space-y-2">{asArray<string>(item.features).map((feature) => <li key={feature} className="flex gap-2 text-xs font-semibold text-slate-600"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />{feature}</li>)}</ul> : null}
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="rewards" className="border-y border-slate-200 bg-slate-950 py-20 text-white sm:py-28">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">{data.pricingEyebrow || 'Live rewards by role'}</p>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] sm:text-5xl">{data.pricingTitle || 'See only rewards that Admin has actually published.'}</h2>
              <p className="mt-5 text-base leading-7 text-slate-300">{data.pricingDescription || 'Reward values are read from the existing Talent Partner reward plans. Disabled or zero-value drafts are never advertised.'}</p>
            </div>
            {program ? <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-300"><span className="font-black text-white">{program.attributionWindowDays} days</span> attribution · <span className="font-black text-white">{program.payoutHoldDays} days</span> default payout hold</div> : null}
          </div>

          {programError ? <div className="mt-8 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-5 py-4 text-sm text-amber-100">{programError}</div> : null}
          {programLoading ? <div className="mt-10 grid gap-5 md:grid-cols-2"><div className="h-60 animate-pulse rounded-3xl bg-white/5" /><div className="h-60 animate-pulse rounded-3xl bg-white/5" /></div> : null}

          {!programLoading && roles.length > 0 ? (
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {roles.map((role) => (
                <article key={role.careerJobId} className="rounded-3xl border border-white/10 bg-white/[0.055] p-6 sm:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-sky-300"><BriefcaseBusiness className="h-4 w-4" /> Refer this role</div><h3 className="mt-3 text-2xl font-black tracking-tight">{role.jobTitle}</h3></div>
                    <Link to={`/careers/${role.jobSlug}`} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10">View role <ChevronRight className="h-3.5 w-3.5" /></Link>
                  </div>

                  {role.rewardPublished ? (
                    <>
                      <div className="mt-6 grid gap-3 sm:grid-cols-3">
                        {role.eventRewards.map((rule) => (
                          <div key={rule.rank} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{ordinalLabel(rule.rank)} qualifying {role.rewardModel === 'sales' ? 'sale' : 'project'}</div>
                            <div className="mt-2 text-2xl font-black text-white">{rewardRuleLabel(rule, role)}</div>
                            <div className="mt-1 text-[11px] leading-4 text-slate-400">{rule.kind === 'percent' ? rewardBasisLabel(role) : 'fixed reward'}</div>
                          </div>
                        ))}
                      </div>
                      {role.retentionEnabled ? (
                        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                          <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                          <div><div className="text-sm font-black text-emerald-100">Retention reward after {role.retentionMonths || 0} months</div><p className="mt-1 text-xs leading-5 text-emerald-100/70">{role.retentionRewardKind === 'percent' ? `${numberValue(role.retentionRatePercent)}% according to the configured retention rule` : `${formatMoney(role.retentionFixedAmount, role.currency || 'USD')} fixed retention reward`} when the configured retention and salary-transition conditions qualify.</p></div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-5">
                      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" /><div><div className="text-sm font-black text-amber-100">Reward schedule not published yet</div><p className="mt-1 text-xs leading-5 text-amber-100/70">This role exists in the live careers system, but its Talent Partner reward plan is not currently enabled with a publishable positive reward. No placeholder amount is shown.</p></div></div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#000080]">{data.challengesEyebrow || 'Quality over volume'}</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">{data.challengesTitle || 'A strong referral is the right person—not just another application.'}</h2>
            {data.challengesDescription ? <p className="mt-5 text-base leading-7 text-slate-600">{data.challengesDescription}</p> : null}
          </div>
          <div className="space-y-3">
            {standards.map((item, index) => (
              <div key={`${item}-${index}`} className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#000080] text-xs font-black text-white">{index + 1}</span><p className="pt-1 text-sm font-semibold leading-6 text-slate-700">{item}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="text-center"><p className="text-xs font-black uppercase tracking-[0.2em] text-[#000080]">{data.faqEyebrow || 'Questions before you join'}</p><h2 className="mt-4 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">{data.faqsTitle || 'Talent Partner FAQs'}</h2>{data.faqsDesc ? <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600">{data.faqsDesc}</p> : null}</div>
          <div className="mt-10 space-y-3">
            {faqs.map((item, index) => (
              <details key={`${item.question}-${index}`} className="group rounded-2xl border border-slate-200 bg-white p-5 open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-black text-slate-950"><span>{item.question}</span><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-[#000080] transition group-open:rotate-90"><ChevronRight className="h-4 w-4" /></span></summary>
                <p className="mt-4 pr-8 text-sm leading-6 text-slate-600">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-[#000080] px-6 py-12 text-white shadow-2xl shadow-[#000080]/20 sm:px-10 sm:py-16 lg:px-16">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-sky-200"><Globe2 className="h-4 w-4" /> {data.ctaEyebrow || 'Build a stronger ProFox network'}</div>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] sm:text-5xl">{data.ctaTitle || 'Know someone who could do exceptional work here?'}</h2>
              <p className="mt-5 text-base leading-7 text-blue-100">{data.ctaDescription || 'Create your Talent Partner account, use your unique job-specific referral links, and track qualified outcomes from one secure dashboard.'}</p>
            </div>
            {programOpen ? <Link to={data.ctaUrl || '/talent-partner'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-black text-[#000080] shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-100">{data.ctaButtonText || 'Join the Talent Partner Program'} <ArrowRight className="h-4 w-4" /></Link> : <span className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-6 py-3.5 text-sm font-bold text-blue-100">Program currently paused</span>}
          </div>
        </div>
      </section>
    </div>
  );
}
