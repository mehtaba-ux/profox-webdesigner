import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BriefcaseBusiness, CheckCircle2, Clock3, Globe2, Loader2 } from 'lucide-react';
import { careerService, type CareerJob, type PublicSalesRoleContext } from '../lib/careerService';
import SalesRepresentativeJobView from './SalesRepresentativeJobView';
import ContentWriterJobView from './ContentWriterJobView';
import UIUXDesignerJobView from './UIUXDesignerJobView';

export default function CareerJobDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [job, setJob] = useState<CareerJob | null>(null);
  const [salesContext, setSalesContext] = useState<PublicSalesRoleContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setSalesContext(null);
    void careerService.getPublicJobBySlug(slug)
      .then(async (row) => {
        if (!active) return;
        setJob(row);
        if (row?.applicationType === 'sales_representative') {
          const context = await careerService.getPublicSalesRoleContext(slug);
          if (active) setSalesContext(context);
        }
      })
      .catch((err: any) => { if (active) setError(err?.message || 'This role could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (!job) return;
    document.title = job.seoTitle || `${job.title} | ProFox Careers`;
    const description = job.seoDescription || job.description || job.shortSummary;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, [job]);

  if (loading) return <div className="flex min-h-[70vh] items-center justify-center bg-white"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  if (!job || error || (job.applicationType === 'sales_representative' && !salesContext)) return (
    <div className="min-h-[70vh] bg-white px-6 py-40 text-center">
      <BriefcaseBusiness className="mx-auto h-10 w-10 text-slate-300" />
      <h1 className="mt-4 text-3xl font-black text-slate-900">Role not found</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">{error || 'This opportunity may have closed or is no longer published.'}</p>
      <Link to="/careers" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-black text-white"><ArrowLeft className="h-4 w-4" /> Back to Careers</Link>
    </div>
  );

  if (salesContext) return <SalesRepresentativeJobView context={salesContext} />;
  if (job.applicationType === 'content_writer') return <ContentWriterJobView job={job} />;
  if ((job.roleDetails as any)?.systemRole === 'uiux_designer') return <UIUXDesignerJobView job={job} />;

  const applyHref = job.applicationUrl || '/contact-us';
  const external = /^https?:\/\//i.test(applyHref);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <section className="border-b border-slate-200 bg-[#fbfcff] pt-32 pb-16 sm:pb-20">
        <div className="mx-auto max-w-6xl px-6">
          <Link to="/careers" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-500 transition hover:text-[#000080]"><ArrowLeft className="h-3.5 w-3.5" /> Back to Careers</Link>
          <div className="mt-9 max-w-4xl">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#FF0E0E]">{job.department} · {job.category}</span>
            <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] text-[#071126] sm:text-6xl">{job.title}</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">{job.shortSummary}</p>
            <a href={applyHref} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-black text-white transition hover:bg-[#000066]">{job.applicationCta} <ArrowRight className="h-4 w-4" /></a>
          </div>
        </div>
      </section>
      <section className="border-b border-slate-200 bg-white py-8"><div className="mx-auto grid max-w-6xl gap-4 px-6 sm:grid-cols-3"><Meta icon={Globe2} label="Location" value={job.location} /><Meta icon={BriefcaseBusiness} label="Engagement" value={job.engagementType} /><Meta icon={Clock3} label="Experience" value={job.experience || 'Role dependent'} /></div></section>
      <section className="py-16 sm:py-20"><div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-[1fr_360px]"><div className="space-y-12"><section><Eyebrow>About the role</Eyebrow><h2 className="mt-3 text-3xl font-black tracking-tight text-[#071126]">What you will be part of</h2><p className="mt-5 whitespace-pre-line text-base leading-8 text-slate-600">{job.description || job.shortSummary}</p></section>{job.responsibilities.length > 0 && <BulletSection eyebrow="What you'll do" title="Your responsibilities" items={job.responsibilities} />}{job.requirements.length > 0 && <BulletSection eyebrow="What you need" title="What we're looking for" items={job.requirements} />}{job.selectionProcess.length > 0 && <section><Eyebrow>Selection process</Eyebrow><h2 className="mt-3 text-3xl font-black tracking-tight text-[#071126]">What happens next</h2><div className="mt-7 grid gap-4 sm:grid-cols-2">{job.selectionProcess.map((step,index)=><div key={`${step.title}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="text-xs font-black text-[#FF0E0E]">{String(index+1).padStart(2,'0')}</div><h3 className="mt-3 font-black text-[#071126]">{step.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{step.text}</p></div>)}</div></section>}</div><aside className="h-fit rounded-3xl border border-slate-200 bg-slate-50 p-6 lg:sticky lg:top-28"><div className="text-xs font-black uppercase tracking-[0.15em] text-[#000080]">Role snapshot</div><dl className="mt-5 space-y-4 text-sm"><Row label="Department" value={job.department} /><Row label="Category" value={job.category} /><Row label="Workplace" value={job.workplaceType} /><Row label="Location" value={job.location} /><Row label="Engagement" value={job.engagementType} /></dl><a href={applyHref} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-black text-white">{job.applicationCta} <ArrowRight className="h-4 w-4" /></a></aside></div></section>
    </div>
  );
}
function Meta({icon:Icon,label,value}:{icon:any;label:string;value:string}){return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><Icon className="h-5 w-5 text-[#000080]"/><div className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 text-sm font-black text-slate-900">{value}</div></div>}
function Eyebrow({children}:{children:string}){return <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#FF0E0E]">{children}</div>}
function BulletSection({eyebrow,title,items}:{eyebrow:string;title:string;items:string[]}){return <section><Eyebrow>{eyebrow}</Eyebrow><h2 className="mt-3 text-3xl font-black tracking-tight text-[#071126]">{title}</h2><div className="mt-6 space-y-3">{items.map((item,index)=><div key={index} className="flex gap-3 text-sm leading-7 text-slate-600"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-600"/><span>{item}</span></div>)}</div></section>}
function Row({label,value}:{label:string;value:string}){return <div className="border-b border-slate-200 pb-3 last:border-0"><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</dt><dd className="mt-1 font-bold text-slate-800">{value}</dd></div>}
