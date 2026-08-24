import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BriefcaseBusiness, MapPin, Search, ShieldCheck, Sparkles, TrendingUp, Users } from 'lucide-react';
import HeroReviewProof from '../components/HeroReviewProof';
import { careerService, type CareerJob } from '../lib/careerService';

const culture = [
  {
    number: '01',
    title: 'Work That Actually Matters',
    text: 'You will work on real business challenges, not throwaway tasks, helping teams grow and operate with more clarity.'
  },
  {
    number: '02',
    title: 'Learn From Experienced People',
    text: 'Work alongside people across strategy, design, development and sales while learning through real client work.'
  },
  {
    number: '03',
    title: 'Trust, Ownership, and Respect',
    text: 'We expect people to own their work, manage their time and communicate clearly. In return, you get trust and responsibility.'
  },
  {
    number: '04',
    title: 'Room to Grow Over Time',
    text: 'As ProFox grows, strong contributors can take on more responsibility and build a larger role over time.'
  }
];

export default function CareersListView() {
  const [jobs, setJobs] = useState<CareerJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    let active = true;
    document.title = 'Careers at ProFox | Current Opportunities';
    const description = 'Explore current opportunities at ProFox and find a role where you can help businesses move from site to system.';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = description;
    void careerService.getPublicJobs()
      .then((rows) => { if (active) setJobs(rows); })
      .catch((err: any) => { if (active) setError(err?.message || 'Current opportunities could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const heroJobs = useMemo(() => {
    return [...jobs]
      .sort((a, b) => {
        if (a.featured !== b.featured) return Number(b.featured) - Number(a.featured);
        const publishedDifference = new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
        if (publishedDifference !== 0) return publishedDifference;
        return a.displayOrder - b.displayOrder;
      })
      .slice(0, 3);
  }, [jobs]);

  useEffect(() => {
    setHeroIndex(0);
    if (heroJobs.length <= 1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroJobs.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [heroJobs]);

  const heroJob = heroJobs[heroIndex] || heroJobs[0] || null;
  const categories = useMemo(() => ['All', ...Array.from(new Set(jobs.map((job) => job.category).filter(Boolean)))], [jobs]);
  const visibleJobs = useMemo(() => {
    const term = query.trim().toLowerCase();
    return jobs
      .filter((job) => category === 'All' || job.category === category)
      .filter((job) => {
        if (!term) return true;
        return [job.title, job.shortSummary, job.department, job.category, job.location, job.engagementType]
          .join(' ')
          .toLowerCase()
          .includes(term);
      });
  }, [jobs, category, query]);

  return (
    <div className="bg-white text-slate-950">
      <section className="border-b border-slate-100 bg-[#fbfcff] pt-28 sm:pt-32">
        <div className="mx-auto max-w-6xl px-5 pb-16 sm:px-6 sm:pb-20 lg:pb-24">
          <Link to="/" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[11px] font-bold text-slate-500 transition hover:border-slate-300 hover:text-[#000080]">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
          </Link>

          <div className="mt-9 max-w-4xl">
            <span className="inline-flex rounded-md border border-[#000080]/15 bg-[#000080]/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-[#000080]">Careers & Offers</span>
            {loading ? (
              <div className="mt-7 h-32 max-w-3xl animate-pulse rounded-3xl bg-slate-100" />
            ) : heroJob ? (
              <>
                <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.02] tracking-[-0.045em] text-[#071126] sm:text-6xl lg:text-[64px]">{heroJob.title}</h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">{heroJob.shortSummary}</p>
                <div className="mt-7 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                  <Link to={`/careers/${heroJob.slug}`} className="inline-flex items-center gap-2 rounded-lg bg-[#000080] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#000066]">
                    View this role <ArrowRight className="h-4 w-4" />
                  </Link>
                  <HeroReviewProof />
                </div>
                {heroJobs.length > 1 && (
                  <div className="mt-6 flex items-center gap-2" aria-label="Featured career opportunities">
                    {heroJobs.map((job, index) => (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => setHeroIndex(index)}
                        aria-label={`Show ${job.title}`}
                        aria-current={index === heroIndex ? 'true' : undefined}
                        className={`h-1.5 rounded-full transition-all ${index === heroIndex ? 'w-7 bg-[#000080]' : 'w-2.5 bg-slate-300 hover:bg-slate-400'}`}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <h1 className="mt-5 text-4xl font-black tracking-[-0.04em] text-[#071126] sm:text-6xl">Build meaningful digital work with ProFox.</h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">There are no published openings right now. Check back as new roles are added.</p>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white py-14 sm:py-16">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="flex flex-col gap-5 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {categories.map((item) => (
                <button
                  key={item}
                  onClick={() => setCategory(item)}
                  className={`rounded-full px-3.5 py-2 text-[11px] font-black transition ${category === item ? 'bg-[#000080] text-white' : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white'}`}
                >
                  {item}
                </button>
              ))}
            </div>
            <label className="relative block w-full lg:w-72">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search position or location..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-xs outline-none transition focus:border-[#000080]/40 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />
            </label>
          </div>

          {error && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

          <div className="divide-y divide-slate-200 border-b border-slate-200">
            {loading ? [0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse bg-slate-50/60" />) : visibleJobs.length ? visibleJobs.map((job) => (
              <article key={job.id} className="group grid gap-5 py-7 transition sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <Link to={`/careers/${job.slug}`} className="text-[17px] font-black tracking-tight text-[#071126] transition group-hover:text-[#000080]">{job.title}</Link>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {job.location}</span>
                    <span className="text-slate-300">•</span>
                    <span>{job.engagementType}</span>
                    <span className="text-slate-300">•</span>
                    <span>{job.category}</span>
                  </div>
                  <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">{job.description || job.shortSummary}</p>
                </div>
                <Link to={`/careers/${job.slug}`} className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-emerald-700">
                  View Role <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </article>
            )) : (
              <div className="py-12 text-center">
                <BriefcaseBusiness className="mx-auto h-8 w-8 text-slate-300" />
                <h2 className="mt-3 text-sm font-black text-slate-800">No roles match this view.</h2>
                <p className="mt-1 text-xs text-slate-500">Try another category or search term.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="bg-[#050b1d] py-20 text-white sm:py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <span className="inline-flex rounded-md bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-emerald-300">Culture & Values</span>
          <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] sm:text-4xl">Why Work at ProFox</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {culture.map((item, index) => {
              const Icon = [Sparkles, Users, ShieldCheck, TrendingUp][index];
              return (
                <div key={item.number} className="rounded-2xl border border-white/10 bg-white/[0.045] p-6">
                  <div className="flex items-center justify-between"><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-black text-emerald-300">{item.number}</span><Icon className="h-4 w-4 text-slate-500" /></div>
                  <h3 className="mt-5 text-sm font-black leading-5">{item.title}</h3>
                  <p className="mt-3 text-xs leading-5 text-slate-400">{item.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#07101f] py-20 text-white sm:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_40%,rgba(0,0,128,0.55),transparent_42%)]" />
        <div className="relative mx-auto max-w-6xl px-5 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-4xl font-black leading-[1.04] tracking-[-0.045em] sm:text-5xl">Let&apos;s Create Real Digital Impact</h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300">Build better experiences for customers and simpler systems for teams. Everything works together, so businesses can move with clarity and momentum.</p>
            <Link to="/contact-us" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-xs font-black text-[#000080] transition hover:bg-slate-100">Speak With a Digital Advisor <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
