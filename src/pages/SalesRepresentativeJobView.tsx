import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, BriefcaseBusiness, CheckCircle2, Clock3, FileText, Globe2,
  Laptop2, Loader2, Send, ShieldCheck, Target, TrendingUp, Users, Video, UploadCloud, ChevronLeft, ChevronRight
} from 'lucide-react';
import { applicantService } from '../lib/applicantService';
import type { PublicSalesRoleContext } from '../lib/careerService';

const roleNav = [
  ['Overview', '#role-details'],
  ['What you will sell', '#what-you-sell'],
  ['Role & requirements', '#your-role'],
  ['Performance', '#performance'],
  ['Earnings', '#earnings'],
  ['Career progression', '#career-progression'],
  ['Apply', '#apply'],
] as const;

const workingWindowOptions = [
  'Morning — 08:00-12:00 (your local time)',
  'Afternoon — 12:00-17:00 (your local time)',
  'Evening — 17:00-21:00 (your local time)',
  'Night — 21:00-01:00 (your local time)',
  'North America Eastern — 09:00-17:00 ET (US / Canada)',
  'North America Pacific — 09:00-17:00 PT (US / Canada)',
  'UK business hours — 09:00-17:00 GMT / BST',
  'Europe business hours — 09:00-17:00 CET / CEST',
  'Australia East — 09:00-17:00 AEST / AEDT',
  'Australia West — 09:00-17:00 AWST',
  'Flexible — I can adjust to the target market',
];

const earningPotential = {
  perSale: '$100-$600+',
  monthly: '$3,000+',
  perSaleText: 'The amount varies by the service sold and the applicable approved commission terms.',
  monthlyText: "Potential monthly earnings depend on the seller's performance, consistency, sales volume and verified paid sales. This is not a guaranteed monthly amount.",
  disclaimer: 'Estimated earning potential only. Actual earnings depend on performance, package mix, sales volume and verified customer payments and are not guaranteed.',
};

function emptyApplicationForm(initialTimezone: string) {
  return {
    fullName:'',email:'',phone:'',country:'',countryCode:'',timezone:initialTimezone,currentRole:'',linkedinUrl:'',
    salesExperienceMonths:'',b2bExperienceMonths:'',salesExperience:'',digitalSalesExperience:'',internationalSalesExperience:'',previousSalesResults:'',
    targetMarkets:[] as string[],prospectingChannels:[] as string[],crmExperience:'',englishRating:'',availableDays:[] as string[],availableHoursPerWeek:'',
    preferredWorkWindow:'',earliestStartDate:'',sampleOutreachMessage:'',professionalReference:'',heardAboutSource:'',heardAboutDetail:'',message:'',
    cvUrl:'',videoUrl:'',cvStoragePath:'',videoStoragePath:'',hasLaptopInternet:false,comfortableCommission:false,comfortableSourcing:false,
    comfortableEnglishCalls:false,videoCommitment:false,consentAccurate:false,consentPrivacy:false,
  };
}

type ApplicationFormState = ReturnType<typeof emptyApplicationForm>;
type ApplicationDraft = { form?: Partial<ApplicationFormState>; step?: number; cvName?: string };

function readApplicationDraft(key: string): ApplicationDraft | null {
  try {
    if (typeof window === 'undefined') return null;
    const value = window.localStorage.getItem(key);
    if (!value) return null;
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as ApplicationDraft : null;
  } catch {
    return null;
  }
}

export default function SalesRepresentativeJobView({ context }: { context: PublicSalesRoleContext }) {
  const { job, products, additionalServices, careerProgression } = context;
  const details = job.roleDetails || {};

  return <div className="min-h-screen bg-white text-slate-950">
    <section className="border-b border-slate-100 bg-[#fbfcff] pt-28 sm:pt-32">
      <div className="pf-container pb-16 sm:pb-20 lg:pb-24">
        <Link to="/careers" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[11px] font-bold text-slate-500 transition hover:border-slate-300 hover:text-[#000080]">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Careers
        </Link>

        <div className="mt-9 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:items-end lg:gap-12">
          <div className="max-w-4xl">
            <span className="inline-flex rounded-md border border-[#000080]/15 bg-[#000080]/5 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#000080]">Remote · Commission-Based · International Sales</span>
            <h1 className="pf-display mt-5 max-w-4xl text-[#071126]">{job.title}</h1>
            {details.subtitle && <p className="mt-4 text-sm font-bold uppercase tracking-[0.08em] text-[#000080] sm:text-base">{details.subtitle}</p>}
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">{job.shortSummary}</p>
            <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row">
              <a href="#apply" className="inline-flex items-center gap-2 rounded-lg bg-[#000080] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#000066]">Apply for this role <ArrowRight className="h-4 w-4" /></a>
              <a href="#role-details" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-[#000080] transition hover:border-[#000080]/25 hover:bg-[#000080]/[0.025]">Read the complete role</a>
            </div>
          </div>

          <aside aria-label="Estimated earning potential" className="relative overflow-hidden rounded-3xl border border-[#000080]/10 bg-white p-5 shadow-[0_22px_60px_rgba(15,23,42,0.08)] sm:p-6">
            <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#000080]/[0.055] blur-2xl" />
            <div className="relative">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="pf-eyebrow text-[#000080]">Earning potential</div>
                  <p className="mt-1.5 text-xs font-semibold text-slate-500">Commission-based opportunity</p>
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#000080]/5 text-[#000080]"><TrendingUp className="h-5 w-5" /></span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-[#fbfcff] p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Per sale</div>
                  <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#071126] sm:text-[28px]">{earningPotential.perSale}</div>
                </div>
                <div className="rounded-2xl border border-[#000080]/10 bg-[#000080]/5 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#000080]/65">Monthly potential</div>
                  <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#000080] sm:text-[28px]">{earningPotential.monthly}</div>
                </div>
              </div>
              <p className="mt-4 text-[11px] leading-5 text-slate-500">{earningPotential.disclaimer}</p>
              <a href="#earnings" className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#000080] transition hover:gap-2.5">See earning details <ArrowRight className="h-3.5 w-3.5" /></a>
            </div>
          </aside>
        </div>

        <div className="mt-8 grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:grid-cols-3 lg:mt-10">
          <Meta icon={Globe2} label="Location" value={job.location} />
          <Meta icon={BriefcaseBusiness} label="Engagement" value={job.engagementType} />
          <Meta icon={Clock3} label="Experience" value={job.experience} />
        </div>
      </div>
    </section>

    <nav className="border-b border-slate-200 bg-white" aria-label="Role sections">
      <div className="pf-container overflow-x-auto">
        <div className="flex min-w-max items-center gap-6 py-4">
          {roleNav.map(([label, href]) => <a key={href} href={href} className="text-xs font-bold text-slate-500 transition hover:text-[#000080]">{label}</a>)}
        </div>
      </div>
    </nav>

    <section id="role-details" className="scroll-mt-28 bg-white py-20 sm:py-24">
      <div className="pf-container grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start lg:gap-20">
        <SectionIntro eyebrow="About ProFox" title="Professional digital work, sold with clarity." text={job.description} />
        <div className="rounded-2xl border border-slate-200 bg-[#fbfcff] p-6 sm:p-8">
          <div className="pf-eyebrow text-[#000080]">Focus markets</div>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">This is an international sales role focused on qualified businesses in the markets below.</p>
          {details.focusMarkets?.length ? <div className="mt-5 flex flex-wrap gap-2">{details.focusMarkets.map(item => <Pill key={item}>{item}</Pill>)}</div> : null}
        </div>
      </div>
    </section>

    <section id="what-you-sell" className="scroll-mt-28 border-y border-slate-200 bg-[#f4f5fb] py-20 sm:py-24">
      <div className="pf-container">
        <div className="grid gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:gap-16">
          <SectionIntro eyebrow="What you will sell" title="Current ProFox offers from the Sales Catalog." text="Package names, prices and commercial descriptions below are live from the same catalog used for quotations. They are not maintained separately on this Careers page." />
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {products.map(product => <article key={product.code} className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="pf-eyebrow text-[#000080]">{product.category}</div>
                <h3 className="pf-card-title mt-2 text-[#071126]">{product.name}</h3>
              </div>
              <div className="shrink-0 text-right text-lg font-bold tracking-tight text-[#000080]">{price(product.basePrice, product.currency, product.priceMode)}</div>
            </div>
            {product.shortDescription && <p className="mt-4 text-[15px] leading-7 text-slate-600">{product.shortDescription}</p>}
            {product.scope?.length ? <div className="mt-5 flex flex-wrap gap-2">{product.scope.slice(0, 4).map(item => <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600">{item}</span>)}</div> : null}
          </article>)}
        </div>
        {details.additionalServiceSummary?.length ? <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"><h3 className="pf-card-title text-[#071126]">Additional services may include</h3><div className="mt-5 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">{details.additionalServiceSummary.map(item => <CheckLine key={item}>{item}</CheckLine>)}</div>{additionalServices.length > 0 && <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">Approved add-ons and pricing are controlled in the ProFox Sales Catalog and may change over time.</p>}</div> : null}
      </div>
    </section>

    <section id="your-role" className="scroll-mt-28 bg-white py-20 sm:py-24">
      <div className="pf-container">
        <SectionIntro eyebrow="Your role" title="Own the sales journey from research to handover." text={details.roleOverview || ''} />
        {details.prospectingChannels?.length ? <div className="mt-7"><Subheading>Legitimate prospecting channels</Subheading><div className="mt-3 flex flex-wrap gap-2">{details.prospectingChannels.map(item => <Pill key={item}>{item}</Pill>)}</div></div> : null}
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <ListBlock eyebrow="Your responsibilities" title="What you will do" items={job.responsibilities} icon={Target} />
          <ListBlock eyebrow="What you need" title="Role requirements" items={job.requirements} icon={ShieldCheck} />
        </div>
      </div>
    </section>

    <section className="border-y border-slate-200 bg-[#fbfcff] py-20 sm:py-24">
      <div className="pf-container grid gap-6 lg:grid-cols-2">
        <ListBlock eyebrow="CRM discipline" title="If it is active, it belongs in ProFox CRM." items={details.crmDiscipline || []} icon={FileText} />
        <ListBlock eyebrow="Ideal candidate" title="How strong representatives work" items={details.idealCandidate || []} icon={Users} />
      </div>
    </section>

    <section className="bg-white py-20 sm:py-24">
      <div className="pf-container grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20">
        <SectionIntro eyebrow="Experience" title="Sales ability first. Digital knowledge can be learned." text={details.experienceNote || ''} />
        <div className="lg:pt-2">
          <Subheading>Preferred experience</Subheading>
          {details.preferredExperience?.length ? <div className="mt-4 flex flex-wrap gap-2">{details.preferredExperience.map(item => <Pill key={item}>{item}</Pill>)}</div> : null}
        </div>
      </div>
    </section>

    <section className="border-y border-slate-200 bg-[#f4f5fb] py-20 sm:py-24">
      <div className="pf-container">
        <SectionIntro eyebrow="Target customers" title="Look for businesses with a real problem to solve." text="Prioritize qualified businesses where a stronger website, application or connected digital system can create measurable business value." />
        <div className="mt-10 grid gap-6 lg:grid-cols-2"><TagCard title="Initial customer focus" items={details.targetCustomers || []} /><TagCard title="Digital problem signals" items={details.digitalProblemSignals || []} /></div>
      </div>
    </section>

    <section className="bg-white py-20 sm:py-24">
      <div className="pf-container">
        <SectionIntro eyebrow="Working arrangement" title="Remote, structured and self-managed." text={`${details.workingArrangement?.workingDays || 'Monday to Friday'} · Approximately ${details.workingArrangement?.expectedHoursPerWeek || 35} hours per week`} />
        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{(details.equipmentRequirements || []).map(item => <div key={item} className="rounded-2xl border border-slate-200 bg-[#fbfcff] p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#000080]/5 text-[#000080]"><Laptop2 className="h-5 w-5" /></span><div className="mt-4 text-sm font-semibold leading-6 text-slate-800">{item}</div></div>)}</div>
      </div>
    </section>

    <section id="performance" className="scroll-mt-28 border-y border-white/5 bg-[#050b1d] py-20 text-white sm:py-24">
      <div className="pf-container">
        <SectionIntro dark eyebrow="Performance expectations" title="Consistency creates the pipeline." text="These are the current operating expectations for an active representative. They are role targets, not a promise of earnings." />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{performanceCards(details.performanceExpectations).map(item => <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.045] p-6"><div className="pf-eyebrow text-[#aaaaff]">{item.label}</div><div className="mt-3 text-lg font-semibold leading-7 text-white sm:text-xl">{item.value}</div></div>)}</div>
      </div>
    </section>

    <section id="earnings" className="scroll-mt-28 bg-white py-20 sm:py-24">
      <div className="pf-container">
        <SectionIntro eyebrow="Estimated earnings" title="Your earnings grow with the sales you close." text="These figures are estimates, not guaranteed income. Actual earnings depend on the seller, package mix, verified customer payments, sales volume and individual performance." />
        <div className="mt-10 grid gap-5 md:grid-cols-2"><PolicyCard title="Estimated earning per sale" value={earningPotential.perSale} text={earningPotential.perSaleText} /><PolicyCard title="Estimated monthly earning" value={earningPotential.monthly} text={earningPotential.monthlyText} /></div>
      </div>
    </section>

    {careerProgression.enabled && <section id="career-progression" className="scroll-mt-28 border-y border-slate-200 bg-[#f4f5fb] py-20 sm:py-24">
      <div className="pf-container">
        <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start lg:gap-20">
          <div>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#000080] text-white shadow-[0_14px_35px_rgba(0,0,128,0.18)]"><TrendingUp className="h-5 w-5" /></span>
            <div className="pf-eyebrow mt-6 text-[#000080]">Career progression</div>
            <h2 className="pf-section-title mt-3 text-[#071126]">{careerProgression.title || 'Path to a monthly salary discussion'}</h2>
            <p className="mt-5 text-base leading-7 text-slate-600">After at least 6 months with ProFox, a representative may become eligible for an invitation to discuss a monthly salary if, during the most recent 3 months, they achieve any one of the verified paid-sales routes.</p>
          </div>
          <div>
            <div className="grid gap-4 sm:grid-cols-2">{[
              '7 ProFox Launch + 4 ProFox Growth + 3 ProFox Scale',
              '10 ProFox Launch + 4 ProFox Scale',
              '6 ProFox Growth + 3 ProFox Scale',
              '3 ProFox Scale',
            ].map((route, index) => <div key={route} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_14px_35px_rgba(15,23,42,0.04)]"><div className="pf-eyebrow text-[#000080]">Qualification route {index + 1}</div><div className="mt-3 text-lg font-semibold leading-7 tracking-[-0.02em] text-[#071126]">{route}</div><div className="mt-3 text-xs leading-5 text-slate-500">Verified paid sales during the most recent 3 months.</div></div>)}</div>
            <div className="mt-5 rounded-2xl border border-[#000080]/10 bg-[#000080]/5 p-6 text-[15px] leading-7 text-slate-700"><strong className="font-bold text-[#071126]">How qualification works:</strong> completing any one route after at least 6 months with ProFox creates eligibility for management review and an invitation to discuss a possible monthly salary arrangement. A salary is not automatic, guaranteed or pre-set. Any salary offer and amount will be discussed at that time based on performance, responsibilities, business needs and management approval.</div>
          </div>
        </div>
      </div>
    </section>}

    <section id="selection" className="scroll-mt-28 bg-white py-20 sm:py-24">
      <div className="pf-container">
        <SectionIntro eyebrow="Selection process" title="Clear outside. Controlled inside." text="System access is granted only after the required selection, agreement, training and final approval steps are completed." />
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{job.selectionProcess.map((step, index) => <article key={`${step.title}-${index}`} className="rounded-2xl border border-slate-200 bg-[#fbfcff] p-6"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#000080] text-xs font-bold text-white">{String(index + 1).padStart(2, '0')}</span><span className="h-px flex-1 bg-slate-200" /></div><h3 className="pf-card-title mt-5 text-[#071126]">{step.title}</h3><p className="mt-3 text-[15px] leading-7 text-slate-600">{step.text}</p></article>)}</div>
      </div>
    </section>

    <section className="border-y border-slate-200 bg-[#f4f5fb] py-20 sm:py-24">
      <div className="pf-container">
        <SectionIntro eyebrow="Application requirements" title="Prepare everything before you apply." text="A complete application helps us review your fit more quickly and consistently." />
        <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(details.applicationRequirements || []).map(item => <div key={item} className="rounded-xl border border-slate-200 bg-white px-4 py-3"><CheckLine>{item}</CheckLine></div>)}</div>
      </div>
    </section>

    {job.requiresIntroVideo && <section className="bg-[#050b1d] py-20 text-white sm:py-24">
      <div className="pf-container grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div><div className="pf-eyebrow text-[#aaaaff]">Mandatory self-introduction video</div><h2 className="pf-section-title mt-3 text-white">{details.video?.minimumSeconds || 60}-{details.video?.recommendedMaximumSeconds || 120} seconds in English.</h2><p className="mt-5 text-base leading-7 text-slate-300">{details.video?.evaluation}</p><span className="mt-7 grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-[#aaaaff]"><Video className="h-5 w-5" /></span></div>
        <div className="grid gap-5 md:grid-cols-2"><DarkList title="Explain" items={details.video?.questions || []} /><DarkList title="Video standards" items={details.video?.standards || []} /></div>
      </div>
    </section>}

    <ApplicationSection context={context} />
  </div>;
}

function ApplicationSection({ context }: { context: PublicSalesRoleContext }) {
  const details=context.job.roleDetails||{};
  const formConfig=details.applicationForm||{};
  const minExperience=Number(formConfig.minimumSalesExperienceMonths||6);
  const minHours=Number(formConfig.minimumWeeklyHours||35);
  const sourceOptions:string[]=Array.isArray(formConfig.sourceOptions)?formConfig.sourceOptions.map(String):['LinkedIn','Google Search','Social media','Job board','Referral','ProFox website','Other'];
  const marketOptions:string[]=Array.from(new Set<string>([...(Array.isArray(details.focusMarkets)?details.focusMarkets.map(String):[]),'Other international markets','No international sales experience yet']));
  const channelOptions:string[]=Array.from(new Set<string>(Array.isArray(details.prospectingChannels)?details.prospectingChannels.map(String):['Cold calling','Cold email','LinkedIn / social outreach','Loom / video outreach','Referral / networking','Inbound sales','Appointment setting','Closing video meetings']));
  const initialTimezone=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch{return'UTC'}})();
  const draftKey=`profox:sales-application-draft:${context.job.slug}`;
  const [restoredDraft]=useState<ApplicationDraft|null>(()=>readApplicationDraft(draftKey));
  const [step,setStep]=useState(()=>Math.max(0,Math.min(4,Number(restoredDraft?.step||0))));
  const [submitted,setSubmitted]=useState(false);const[reference,setReference]=useState('');const[submitting,setSubmitting]=useState(false);const[error,setError]=useState('');const[fieldErrors,setFieldErrors]=useState<Record<string,string>>({});
  const [uploading,setUploading]=useState<'cv'|''>('');const[uploadProgress,setUploadProgress]=useState(0);const[cvName,setCvName]=useState(()=>String(restoredDraft?.cvName||''));
  const [form,setForm]=useState<ApplicationFormState>(()=>({...emptyApplicationForm(initialTimezone),...(restoredDraft?.form||{}),videoStoragePath:''}));

  useEffect(()=>{
    if(submitted)return;
    try{window.localStorage.setItem(draftKey,JSON.stringify({form:{...form,videoStoragePath:''},step,cvName}));}catch{/* Browser storage can be unavailable; the form still remains usable. */}
  },[form,step,cvName,draftKey,submitted]);

  const patch=(key:keyof ApplicationFormState,value:any)=>{setForm(current=>({...current,[key]:value}));setFieldErrors(current=>{const n={...current};delete n[String(key)];return n})};
  const toggle=(key:'targetMarkets'|'prospectingChannels'|'availableDays',value:string)=>patch(key,form[key].includes(value)?form[key].filter(v=>v!==value):[...form[key],value]);
  const fail=(key:string,message:string)=>{setFieldErrors({[key]:message});setError(message);return false};
  const validateStep=(value:number)=>{setError('');setFieldErrors({});
    if(value===0){if(Number(form.salesExperienceMonths||0)<minExperience)return fail('salesExperienceMonths',`This role currently requires at least ${minExperience} months of sales experience.`);if(Number(form.availableHoursPerWeek||0)<minHours)return fail('availableHoursPerWeek',`This role currently requires at least ${minHours} available hours per week.`);if(!form.hasLaptopInternet||!form.comfortableCommission||!form.comfortableSourcing||!form.comfortableEnglishCalls||!form.videoCommitment)return fail('eligibility','Please confirm every current role requirement before continuing.');}
    if(value===1){if(form.fullName.trim().length<2)return fail('fullName','Enter your full name.');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))return fail('email','Enter a valid email address.');if(!/^\+[1-9][0-9\s()-]{7,20}$/.test(form.phone.trim()))return fail('phone','Use an international phone number including country code.');if(!form.countryCode)return fail('country','Select your country.');if(!form.timezone)return fail('timezone','Select your time zone.');if(!/^https?:\/\/([^/]+\.)?linkedin\.com\//i.test(form.linkedinUrl.trim()))return fail('linkedinUrl','Enter a valid LinkedIn profile URL.');}
    if(value===2){if(!form.englishRating)return fail('englishRating','Select your English level.');if(form.salesExperience.trim().length<20)return fail('salesExperience','Describe your sales experience in enough detail for review.');if(form.previousSalesResults.trim().length<20)return fail('previousSalesResults','Describe one measurable sales result.');if(!form.targetMarkets.length)return fail('targetMarkets','Select the markets that best describe your experience.');if(!form.prospectingChannels.length)return fail('prospectingChannels','Select at least one prospecting channel you have used.');}
    if(value===3){if(!form.availableDays.length)return fail('availableDays','Select at least one available working day.');if(Number(form.availableHoursPerWeek||0)<minHours)return fail('availableHoursPerWeek',`At least ${minHours} hours per week are currently required.`);if(!form.earliestStartDate)return fail('earliestStartDate','Select your earliest available start date.');if(form.sampleOutreachMessage.trim().length<20)return fail('sampleOutreachMessage','Write a short sample message to a qualified prospect.');if(!form.heardAboutSource)return fail('heardAboutSource','Tell us how you heard about ProFox.');}
    if(value===4){if(!form.cvStoragePath&&!/^https?:\/\//i.test(form.cvUrl.trim()))return fail('cv','Upload your CV/resume or provide a shareable link.');if(!/^https?:\/\//i.test(form.videoUrl.trim()))return fail('video','Enter a valid shareable introduction-video link.');if(!form.consentAccurate||!form.consentPrivacy)return fail('consent','Review and accept the required confirmations.');}
    return true;
  };
  const next=()=>{if(validateStep(step))setStep(current=>Math.min(4,current+1))};
  const back=()=>{setError('');setFieldErrors({});setStep(current=>Math.max(0,current-1))};
  const uploadFile=async(file?:File)=>{if(!file)return;setError('');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())){setError('Enter a valid email in Personal Details before uploading your CV.');return;}setUploading('cv');setUploadProgress(0);try{const result=await applicantService.uploadPublicApplicationFile(form.email,'cv',file,setUploadProgress);patch('cvStoragePath',result.path);setCvName(file.name);}catch(err:any){setError(err?.message||'The CV could not be uploaded. You can also use a shareable link.');}finally{setUploading('');}};
  const submit=async(e:React.FormEvent)=>{e.preventDefault();if(step<4){next();return;}if(!validateStep(4))return;setSubmitting(true);setError('');try{const result=await applicantService.submitSalesApplicationV3({...form,videoStoragePath:'',salesExperienceMonths:Number(form.salesExperienceMonths),b2bExperienceMonths:form.b2bExperienceMonths?Number(form.b2bExperienceMonths):null,availableHoursPerWeek:Number(form.availableHoursPerWeek)});if(result.success){try{window.localStorage.removeItem(draftKey);}catch{}setReference(result.reference||'');setSubmitted(true);}else{if(result.field)setFieldErrors({[result.field]:result.error||result.message||'Please review this field.'});setError(result.message||result.error||'Your application could not be submitted.');}}catch(err:any){setError(err?.message||'Your application could not be submitted.');}finally{setSubmitting(false);}};
  const countries=countryOptions();const timezones=timezoneOptions();
  const steps=['Eligibility','Personal details','Sales evidence','Availability','Proof & submit'];
  const progress=Math.round(((step+1)/steps.length)*100);
  return <section id="apply" className="scroll-mt-28 border-t border-slate-200 bg-[#f4f5fb] py-20 sm:py-24"><div className="pf-container"><div className="mx-auto max-w-5xl"><SectionIntro eyebrow="Apply" title="Apply for this role" text="Complete the five guided steps below. Required fields are marked with an asterisk, and your draft is saved automatically in this browser until you successfully submit it." />
    {submitted?<div className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 p-7 text-center sm:p-10"><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white text-emerald-600 shadow-sm"><CheckCircle2 className="h-8 w-8"/></span><h3 className="mt-5 text-2xl font-semibold tracking-[-0.025em] text-slate-900">Application received successfully.</h3>{reference&&<div className="mx-auto mt-4 w-fit rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-800">Reference: {reference}</div>}<p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-slate-600">Our team will review your application within one week (up to 7 days). We will send your application update and any next steps to the email address you provided. Please check your inbox and your spam or junk folder during this review period.</p><p className="mx-auto mt-3 max-w-xl text-xs leading-5 text-slate-500">Keep your application reference for any future application-related communication.</p></div>:<>
      <div className="mt-8 grid gap-3 rounded-2xl border border-[#000080]/10 bg-[#000080]/5 p-5 text-sm leading-6 text-slate-600 sm:grid-cols-3 sm:p-6"><div><strong className="block text-[#071126]">5 guided steps</strong><span>Complete one clear section at a time.</span></div><div><strong className="block text-[#071126]">Draft saves automatically</strong><span>Your answers stay on this device if you refresh or return later.</span></div><div><strong className="block text-[#071126]">Nothing sends early</strong><span>Your information is submitted only when you click Submit application.</span></div></div>
      <form onSubmit={submit} className="mt-6 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-200 bg-[#fbfcff] px-5 py-5 sm:px-8 sm:py-6">
        <div className="flex items-center justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[0.1em] text-[#000080]">Step {step+1} of {steps.length}</div><div className="mt-1 text-sm font-semibold text-slate-800">{steps[step]}</div></div><div className="text-right"><div className="text-sm font-bold text-[#000080]">{progress}%</div><div className="text-[11px] text-slate-400">complete</div></div></div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#000080] transition-all duration-300" style={{width:`${progress}%`}}/></div>
        <div className="mt-5 grid grid-cols-5 gap-2">{steps.map((label,index)=>{const complete=index<step;const active=index===step;return <button type="button" key={label} disabled={index>step} onClick={()=>index<step&&setStep(index)} className={`group min-w-0 text-center ${index>step?'cursor-default':''}`} aria-current={active?'step':undefined}><span className={`mx-auto grid h-8 w-8 place-items-center rounded-full border text-xs font-bold transition ${active?'border-[#000080] bg-[#000080] text-white':complete?'border-[#000080]/20 bg-[#000080]/5 text-[#000080]':'border-slate-200 bg-white text-slate-400'}`}>{complete?<CheckCircle2 className="h-4 w-4"/>:index+1}</span><span className={`mt-2 hidden truncate text-[10px] font-semibold sm:block ${active?'text-[#000080]':complete?'text-slate-600':'text-slate-400'}`}>{label}</span></button>})}</div>
      </div>
      <div className="space-y-7 p-5 sm:p-8">{error&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">{error}</div>}
        {step===0&&<><StepTitle title="Confirm the role fits before you apply" text="Review the minimum requirements first. This prevents you from spending time on a full application if the role does not fit your current availability or experience."/><div className="grid gap-5 sm:grid-cols-2"><Field label="Total sales experience in months *" error={fieldErrors.salesExperienceMonths} hint={`Minimum currently required: ${minExperience} months`} help="Enter your total professional sales, business-development or client-facing sales experience in months."><input type="number" min={0} max={600} className={inputClass} value={form.salesExperienceMonths} onChange={e=>patch('salesExperienceMonths',e.target.value)}/></Field><Field label="Hours available per week *" error={fieldErrors.availableHoursPerWeek} hint={`Minimum currently required: ${minHours} hours`} help="Enter the number of hours you can reliably commit to this role in a normal week."><input type="number" min={1} max={80} className={inputClass} value={form.availableHoursPerWeek} onChange={e=>patch('availableHoursPerWeek',e.target.value)}/></Field></div><div className="space-y-3 rounded-2xl border border-slate-200 bg-[#fbfcff] p-5 sm:p-6"><div className="mb-1 text-sm font-semibold text-[#071126]">Confirm each requirement</div><Confirm checked={form.comfortableCommission} onChange={v=>patch('comfortableCommission',v)}>I understand this role starts as an independent commission-based opportunity.</Confirm><Confirm checked={form.comfortableSourcing} onChange={v=>patch('comfortableSourcing',v)}>I can initially research and generate my own qualified leads.</Confirm><Confirm checked={form.comfortableEnglishCalls} onChange={v=>patch('comfortableEnglishCalls',v)}>I can conduct professional sales conversations and video meetings in English.</Confirm><Confirm checked={form.hasLaptopInternet} onChange={v=>patch('hasLaptopInternet',v)}>I have a computer, reliable internet, webcam and a suitable call environment.</Confirm><Confirm checked={form.videoCommitment} onChange={v=>patch('videoCommitment',v)}>I can provide a shareable link to the required 60-120 second English introduction video.</Confirm>{fieldErrors.eligibility&&<p className="text-xs font-bold text-red-600">{fieldErrors.eligibility}</p>}</div></>}
        {step===1&&<><StepTitle title="Personal and contact details" text="Use current details that ProFox can rely on throughout screening. Application updates will be sent to the email address you enter here."/><div className="grid gap-5 sm:grid-cols-2"><Field label="Full name *" error={fieldErrors.fullName} help="Enter your full professional name as you want it shown on your candidate record."><input className={inputClass} autoComplete="name" value={form.fullName} onChange={e=>patch('fullName',e.target.value)}/></Field><Field label="Email *" error={fieldErrors.email} help="Use an email address you check regularly. ProFox will use it for your application update and next steps."><input type="email" className={inputClass} autoComplete="email" value={form.email} onChange={e=>patch('email',e.target.value)}/></Field><Field label="WhatsApp / contact number *" error={fieldErrors.phone} hint="Include country code, for example +14155552671" help="Enter an international-format phone or WhatsApp number where you can be contacted if needed."><input type="tel" className={inputClass} autoComplete="tel" value={form.phone} onChange={e=>patch('phone',e.target.value)}/></Field><Field label="Country *" error={fieldErrors.country} help="Select the country where you currently live and will normally work from."><select className={inputClass} value={form.countryCode} onChange={e=>{const item=countries.find(x=>x.code===e.target.value);patch('countryCode',e.target.value);patch('country',item?.name||'')}}><option value="">Select country</option>{countries.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}</select></Field><Field label="Time zone *" error={fieldErrors.timezone} help="Choose your working time zone so meetings and availability can be interpreted correctly."><select className={inputClass} value={form.timezone} onChange={e=>patch('timezone',e.target.value)}>{timezones.map(item=><option key={item} value={item}>{item}</option>)}</select></Field><Field label="Current role (optional)" help="If you are currently employed or freelancing, enter your present job title or professional role."><input className={inputClass} value={form.currentRole} onChange={e=>patch('currentRole',e.target.value)} placeholder="Example: Business Development Executive"/></Field></div><Field label="LinkedIn profile URL *" error={fieldErrors.linkedinUrl} help="Provide the full URL to your current LinkedIn profile so we can review your professional background."><input className={inputClass} value={form.linkedinUrl} onChange={e=>patch('linkedinUrl',e.target.value)} placeholder="https://linkedin.com/in/..."/></Field></>}
        {step===2&&<><StepTitle title="Show us how you sell" text="Give specific evidence. Clear examples, numbers and your personal contribution are more useful than general sales claims."/><div className="grid gap-5 sm:grid-cols-2"><Field label="English level *" error={fieldErrors.englishRating} help="Choose the level that best reflects your ability to hold professional sales calls and written conversations in English."><select className={inputClass} value={form.englishRating} onChange={e=>patch('englishRating',e.target.value)}><option value="">Select level</option><option>Fluent / Native</option><option>Professional working proficiency</option><option>Conversational</option></select></Field><Field label="B2B sales experience in months (optional)" help="Enter only the months where you directly sold to businesses or business decision-makers."><input type="number" min={0} max={600} className={inputClass} value={form.b2bExperienceMonths} onChange={e=>patch('b2bExperienceMonths',e.target.value)}/></Field></div><Field label="Sales experience *" error={fieldErrors.salesExperience} help="Explain what you sold, who you sold to, and which parts of the sales process you personally handled."><textarea rows={4} className={inputClass} value={form.salesExperience} onChange={e=>patch('salesExperience',e.target.value)} placeholder="What have you sold, to whom, and what parts of the sales cycle did you own?"/></Field><div className="grid gap-5 sm:grid-cols-2"><Field label="Digital / SaaS / website sales experience (optional)" help="Describe any experience selling websites, software, SaaS, digital marketing or other technology services."><textarea rows={3} className={inputClass} value={form.digitalSalesExperience} onChange={e=>patch('digitalSalesExperience',e.target.value)} placeholder="Products, services, deal types and your role"/></Field><Field label="International sales experience (optional)" help="Mention markets, countries and customer types you have sold to outside your home market."><textarea rows={3} className={inputClass} value={form.internationalSalesExperience} onChange={e=>patch('internationalSalesExperience',e.target.value)} placeholder="Countries, markets and customer types"/></Field></div><Field label="One measurable sales result *" error={fieldErrors.previousSalesResults} hint="Tell us what you sold, approximate deal value/result, and your contribution." help="Give one concrete result with a number where possible: revenue, deal value, appointments, conversion rate or another measurable outcome."><textarea rows={4} className={inputClass} value={form.previousSalesResults} onChange={e=>patch('previousSalesResults',e.target.value)}/></Field><ChoiceGroup title="Markets you have sold to *" options={marketOptions} selected={form.targetMarkets} onToggle={v=>toggle('targetMarkets',v)} error={fieldErrors.targetMarkets} help="Select every market that accurately reflects your previous selling experience."/><ChoiceGroup title="Prospecting / sales channels you have used *" options={channelOptions} selected={form.prospectingChannels} onToggle={v=>toggle('prospectingChannels',v)} error={fieldErrors.prospectingChannels} help="Select the channels you have actually used to find, contact, qualify, meet or close prospects."/><Field label="CRM experience (optional)" help="Tell us which CRM systems you have used and what you recorded or managed inside them."><textarea rows={3} className={inputClass} value={form.crmExperience} onChange={e=>patch('crmExperience',e.target.value)} placeholder="Which CRM systems have you used and how did you use them?"/></Field></>}
        {step===3&&<><StepTitle title="Availability and practical evidence" text="Tell us when you can consistently work and show how you would approach a real prospect. Times below make the preferred working window clear across international markets."/><ChoiceGroup title="Days you can normally work *" options={['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']} selected={form.availableDays} onToggle={v=>toggle('availableDays',v)} error={fieldErrors.availableDays} help="Select every day you can normally commit to sales activity, follow-ups and scheduled meetings."/><div className="grid gap-5 sm:grid-cols-2"><Field label="Hours available per week *" error={fieldErrors.availableHoursPerWeek} help="Enter the total number of hours you can reliably commit each week."><input type="number" min={1} max={80} className={inputClass} value={form.availableHoursPerWeek} onChange={e=>patch('availableHoursPerWeek',e.target.value)}/></Field><Field label="Earliest start date *" error={fieldErrors.earliestStartDate} help="Choose the earliest date on which you could realistically begin after completing the selection and onboarding process."><input type="date" min={new Date().toISOString().slice(0,10)} className={inputClass} value={form.earliestStartDate} onChange={e=>patch('earliestStartDate',e.target.value)}/></Field></div><Field label="Preferred working window" hint="Local-time options use the time zone you selected in Personal details." help="Choose the time block you can cover most consistently. Market-specific options use the named business time zone."><select className={inputClass} value={form.preferredWorkWindow} onChange={e=>patch('preferredWorkWindow',e.target.value)}><option value="">Select your preferred working window</option>{workingWindowOptions.map(item=><option key={item} value={item}>{item}</option>)}</select></Field><Field label="Sample cold outreach message *" error={fieldErrors.sampleOutreachMessage} hint="Write a short message you would send to a qualified business prospect." help="Write the actual first message you would send. Keep it relevant, personalized and focused on starting a useful conversation."><textarea rows={5} className={inputClass} value={form.sampleOutreachMessage} onChange={e=>patch('sampleOutreachMessage',e.target.value)} placeholder="Write your sample message here..."/></Field><div className="grid gap-5 sm:grid-cols-2"><Field label="How did you hear about ProFox? *" error={fieldErrors.heardAboutSource} help="Select the source where you first found this ProFox opportunity."><select className={inputClass} value={form.heardAboutSource} onChange={e=>patch('heardAboutSource',e.target.value)}><option value="">Select source</option>{sourceOptions.map(item=><option key={item}>{item}</option>)}</select></Field><Field label="Source details (optional)" help="Add the job board name, referrer, social account, page or other detail that helps identify the source."><input className={inputClass} value={form.heardAboutDetail} onChange={e=>patch('heardAboutDetail',e.target.value)} placeholder="Job board name, referrer, page, etc."/></Field></div></>}
        {step===4&&<><StepTitle title="Proof, introduction video and consent" text="Upload your CV or provide a CV link. For the introduction video, we only require a shareable viewing link—no video file upload is needed."/><div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]"><div><UploadCard kind="cv" title="CV / Resume *" accept=".pdf,.doc,.docx" maxLabel="PDF, DOC or DOCX · max 8 MB" uploadedName={cvName} uploading={uploading==='cv'} progress={uploading==='cv'?uploadProgress:0} onFile={file=>void uploadFile(file)} help="Upload your current CV/resume. If you prefer not to upload it, use the shareable CV link field below instead."/><Field label="Or CV / resume shareable link" error={fieldErrors.cv||fieldErrors.cvUrl} help="Use this instead of uploading a CV. Make sure reviewers can open the link without requesting access."><input className={inputClass} value={form.cvUrl} onChange={e=>patch('cvUrl',e.target.value)} placeholder="https://..."/></Field></div><div className="rounded-2xl border border-[#000080]/10 bg-[#000080]/5 p-5 sm:p-6"><div className="pf-eyebrow text-[#000080]">Introduction video</div><h4 className="mt-2 text-lg font-semibold text-[#071126]">Shareable link only</h4><p className="mt-2 text-sm leading-6 text-slate-600">Use Zoom, Loom, Google Drive, OneDrive, Dropbox, YouTube Unlisted or another accessible video link. Make sure our reviewers can open it without requesting access.</p><div className="mt-5"><Field label="Introduction video shareable link *" error={fieldErrors.video||fieldErrors.videoUrl} help="Paste the full shareable URL to your 60-120 second English introduction video. If the service uses link permissions, enable viewing for anyone with the link."><input type="url" className={inputClass} value={form.videoUrl} onChange={e=>patch('videoUrl',e.target.value)} placeholder="https://zoom.us/... or another shareable video URL"/></Field></div></div></div><Field label="Professional reference (optional)" help="If available, provide the name, relationship and appropriate contact details of someone who can speak about your professional work."><textarea rows={3} className={inputClass} value={form.professionalReference} onChange={e=>patch('professionalReference',e.target.value)} placeholder="Name, relationship and contact details where appropriate."/></Field><Field label="Why ProFox / additional context (optional)" help="Use this space for anything important that is not already covered, including why this opportunity fits your goals."><textarea rows={4} className={inputClass} value={form.message} onChange={e=>patch('message',e.target.value)} placeholder="Add any useful context for the review team..."/></Field><div className="space-y-3 rounded-2xl border border-slate-200 bg-[#fbfcff] p-5 sm:p-6"><div className="text-sm font-semibold text-[#071126]">Final confirmations</div><Confirm checked={form.consentAccurate} onChange={v=>patch('consentAccurate',v)}>I confirm the information and links in this application are accurate.</Confirm><Confirm checked={form.consentPrivacy} onChange={v=>patch('consentPrivacy',v)}>I consent to ProFox using this information and submitted files to evaluate and manage my application. <Link to="/privacy-policy" className="font-bold text-[#000080] underline underline-offset-2">Privacy Policy</Link></Confirm>{fieldErrors.consent&&<p className="text-xs font-bold text-red-600">{fieldErrors.consent}</p>}</div></>}
      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-[#fbfcff] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">{step>0?<button type="button" onClick={back} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:border-slate-300 sm:w-auto"><ChevronLeft className="h-4 w-4"/> Back</button>:<span/>}{step<4?<button type="button" onClick={next} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#000080] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#000066] sm:w-auto">Continue <ChevronRight className="h-4 w-4"/></button>:<button disabled={submitting||Boolean(uploading)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#000080] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#000066] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{submitting?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>} {submitting?'Submitting application...':'Submit application'}</button>}</div>
    </form></>}
  </div></div></section>;
}

const inputClass='w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#000080]/50 focus:ring-4 focus:ring-[#000080]/5 sm:text-sm';
function Meta({icon:Icon,label,value}:{icon:any;label:string;value:string}){return <div className="flex min-h-[118px] items-start gap-4 border-b border-slate-200 p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:p-6"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#000080]/5 text-[#000080]"><Icon className="h-5 w-5"/></span><div><div className="pf-eyebrow text-slate-400">{label}</div><div className="mt-2 text-sm font-semibold leading-6 text-slate-900">{value}</div></div></div>}
function SectionIntro({eyebrow,title,text,dark=false}:{eyebrow:string;title:string;text:string;dark?:boolean}){return <div className="max-w-3xl"><div className={`pf-eyebrow ${dark?'text-[#aaaaff]':'text-[#000080]'}`}>{eyebrow}</div><h2 className={`pf-section-title mt-3 ${dark?'text-white':'text-[#071126]'}`}>{title}</h2>{text&&<p className={`mt-5 text-base leading-7 sm:leading-8 ${dark?'text-slate-300':'text-slate-600'}`}>{text}</p>}</div>}
function StepTitle({title,text}:{title:string;text:string}){return <div className="border-b border-slate-100 pb-5"><h3 className="text-2xl font-semibold tracking-[-0.025em] text-[#071126]">{title}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{text}</p></div>}
function Subheading({children}:{children:any}){return <h3 className="text-sm font-bold text-[#071126]">{children}</h3>}
function Pill({children}:{children:any}){return <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">{children}</span>}
function CheckLine({children}:{children:any}){return <div className="flex gap-3 text-[15px] leading-7 text-slate-600"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600"/><span>{children}</span></div>}
function ListBlock({eyebrow,title,items,icon:Icon}:{eyebrow:string;title:string;items:string[];icon:any}){return <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"><div className="flex items-center gap-2 pf-eyebrow text-[#000080]"><Icon className="h-4 w-4"/>{eyebrow}</div><h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#071126]">{title}</h2><div className="mt-6 space-y-3">{items.map(item=><CheckLine key={item}>{item}</CheckLine>)}</div></div>}
function TagCard({title,items}:{title:string;items:string[]}){return <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"><h3 className="pf-card-title text-[#071126]">{title}</h3><div className="mt-5 flex flex-wrap gap-2">{items.map(item=><Pill key={item}>{item}</Pill>)}</div></div>}
function PolicyCard({title,value,text}:{title:string;value:string;text:string}){return <div className="rounded-2xl border border-[#000080]/10 bg-[#fbfcff] p-6 sm:p-8"><div className="pf-eyebrow text-[#000080]">{title}</div><div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#071126] sm:text-4xl">{value}</div><p className="mt-4 max-w-xl text-sm leading-6 text-slate-600">{text}</p></div>}
function DarkList({title,items}:{title:string;items:string[]}){return <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-6"><h3 className="pf-card-title text-white">{title}</h3><div className="mt-4 space-y-3">{items.map(item=><div key={item} className="flex gap-3 text-sm leading-6 text-slate-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#aaaaff]"/><span>{item}</span></div>)}</div></div>}
function HelpTip({text}:{text:string}){return <span className="group relative inline-flex shrink-0" tabIndex={0} aria-label={text}><span className="grid h-4.5 w-4.5 place-items-center rounded-full border border-slate-300 bg-white text-[10px] font-bold leading-none text-slate-500 transition group-hover:border-[#000080]/30 group-hover:text-[#000080] group-focus:border-[#000080]/30 group-focus:text-[#000080]">?</span><span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-64 -translate-x-1/2 rounded-lg bg-[#071126] px-3 py-2 text-left text-xs font-normal leading-5 text-white shadow-xl group-hover:block group-focus:block">{text}</span></span>}
function Field({label,children,error,hint,help}:{label:string;children:any;error?:string;hint?:string;help?:string}){return <label className="block text-sm font-semibold text-slate-700"><span className="inline-flex items-center gap-2">{label}{help&&<HelpTip text={help}/>}</span><div className="mt-2">{children}</div>{hint&&<div className="mt-1.5 text-xs font-normal leading-5 text-slate-400">{hint}</div>}{error&&<div className="mt-1.5 text-xs font-semibold text-red-600">{error}</div>}</label>}
function Confirm({checked,onChange,children}:{checked:boolean;onChange:(v:boolean)=>void;children:any}){return <label className="flex items-start gap-3 rounded-lg px-1 py-1 text-sm leading-6 text-slate-600"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#000080]"/><span>{children}</span></label>}
function ChoiceGroup({title,options,selected,onToggle,error,help}:{title:string;options:string[];selected:string[];onToggle:(v:string)=>void;error?:string;help?:string}){return <div><div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">{title}{help&&<HelpTip text={help}/>}</div><div className="mt-3 flex flex-wrap gap-2">{options.map(item=><button type="button" key={item} onClick={()=>onToggle(item)} className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${selected.includes(item)?'border-[#000080] bg-[#000080]/5 text-[#000080]':'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>{selected.includes(item)&&<CheckCircle2 className="mr-1.5 inline h-3.5 w-3.5"/>}{item}</button>)}</div>{error&&<div className="mt-2 text-xs font-semibold text-red-600">{error}</div>}</div>}
function UploadCard({kind,title,accept,maxLabel,uploadedName,uploading,progress,onFile,help}:{kind:string;title:string;accept:string;maxLabel:string;uploadedName:string;uploading:boolean;progress:number;onFile:(file?:File)=>void;help?:string}){return <label className={`mb-5 block cursor-pointer rounded-2xl border border-dashed p-5 transition ${uploadedName?'border-emerald-300 bg-emerald-50':'border-slate-300 bg-[#fbfcff] hover:border-[#000080]/40'}`}><input type="file" accept={accept} className="hidden" disabled={uploading} onChange={e=>onFile(e.target.files?.[0])}/><div className="flex items-start gap-3"><div className={`rounded-xl p-2 ${uploadedName?'bg-emerald-100 text-emerald-700':'bg-white text-[#000080] shadow-sm'}`}><UploadCloud className="h-5 w-5"/></div><div className="min-w-0"><div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">{title}{help&&<HelpTip text={help}/>}</div><div className="mt-1 text-xs text-slate-400">{uploadedName||maxLabel}</div>{uploading&&<div className="mt-3"><div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-[#000080] transition-all" style={{width:`${progress}%`}}/></div><div className="mt-1 text-[10px] font-bold text-slate-400">Uploading {kind}...</div></div>}{uploadedName&&!uploading&&<div className="mt-2 text-[10px] font-bold text-emerald-700">Secure upload complete. Choose another file to replace it before submission.</div>}</div></div></label>}
function price(value:number,currency='USD',mode='fixed'){if(mode==='custom')return 'Custom quotation';const formatted=new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:0}).format(Number(value||0));return mode==='starting_at'?`${formatted}+`:formatted}
function performanceCards(value:any){return [{label:'Qualified research',value:value?.qualifiedProspectsPerDay?`${value.qualifiedProspectsPerDay} prospects / day`:'Complete qualified research daily'},{label:'Outreach',value:value?.qualifiedOutreachPerDay?`${value.qualifiedOutreachPerDay} attempts / day`:'Complete planned outreach'},{label:'Calls',value:value?.callsPerDay||'Based on pipeline'},{label:'Follow-ups',value:value?.followUps||'Complete every scheduled follow-up'},{label:'Meetings',value:value?.meetings||'Attend confirmed meetings'},{label:'Monthly sales target',value:value?.minimumMonthlyPaidSales?`${value.minimumMonthlyPaidSales} confirmed paid sales`:'Set by management'}]}
function timezoneOptions(){try{const fn=(Intl as any).supportedValuesOf;const values=typeof fn==='function'?fn.call(Intl,'timeZone'):[];return values.length?values:['UTC','Asia/Kolkata','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Europe/London','America/Toronto','Australia/Sydney'];}catch{return['UTC','Asia/Kolkata','America/New_York','Europe/London','America/Toronto','Australia/Sydney']}}
function countryOptions(){const codes='AF AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW'.split(' ');const DisplayNames=(Intl as any).DisplayNames;const names=typeof DisplayNames==='function'?new DisplayNames(['en'],{type:'region'}):null;return codes.map(code=>({code,name:names?.of(code)||code})).sort((a,b)=>a.name.localeCompare(b.name))}