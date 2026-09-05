import React, { useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, FileText, Loader2, Send, ShieldCheck, UploadCloud } from 'lucide-react';
import type { CareerJob } from '../../lib/careerService';
import { applicantService } from '../../lib/applicantService';
import { talentPartnerService } from '../../lib/talentPartnerService';
import { supabase } from '../../lib/supabase';

const input = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100';
const applicationImage = 'https://images.unsplash.com/photo-1739298061758-f950267d6d75?auto=format&fit=crop&w=1600&q=82';

interface FormState {
  fullName: string; email: string; phone: string; country: string; timezone: string; linkedinUrl: string; currentRole: string;
  portfolioUrl: string; yearsExperience: string; figmaExperience: string; responsiveExperience: string; designSystemsExperience: string;
  accessibilityExperience: string; strongestCaseStudy: string; caseStudyContribution: string; developerHandoffExperience: string;
  availableHoursPerWeek: string; preferredWorkWindow: string; earliestStartDate: string; heardAboutSource: string; heardAboutDetail: string;
  motivation: string; hasLaptopInternet: boolean; consentAccurate: boolean; consentPrivacy: boolean;
}

const initial: FormState = {
  fullName:'',email:'',phone:'',country:'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',linkedinUrl:'',currentRole:'',portfolioUrl:'',
  yearsExperience:'',figmaExperience:'',responsiveExperience:'',designSystemsExperience:'',accessibilityExperience:'',strongestCaseStudy:'',caseStudyContribution:'',
  developerHandoffExperience:'',availableHoursPerWeek:'',preferredWorkWindow:'',earliestStartDate:'',heardAboutSource:'ProFox website',heardAboutDetail:'',motivation:'',
  hasLaptopInternet:false,consentAccurate:false,consentPrivacy:false,
};

export default function UIUXDesignerApplicationForm({ job }: { job: CareerJob }) {
  const details = (job.roleDetails || {}) as any;
  const minimumWeeklyHours = Number(details?.applicationForm?.minimumWeeklyHours || 1);
  const sourceOptions: string[] = Array.isArray(details?.applicationForm?.sourceOptions) ? details.applicationForm.sourceOptions : ['LinkedIn','Google Search','Social media','Job board','Referral','ProFox website','Other'];
  const [form,setForm] = useState<FormState>(initial);
  const [cv,setCv] = useState<File | null>(null);
  const [cvProgress,setCvProgress] = useState(0);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [submitted,setSubmitted] = useState<{reference?:string;duplicate?:boolean}|null>(null);

  const hours = Number(form.availableHoursPerWeek || 0);
  const canSubmit = useMemo(() => Boolean(
    form.fullName.trim().length>=2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && /^https?:\/\//i.test(form.portfolioUrl.trim()) && cv &&
    hours>=minimumWeeklyHours && form.figmaExperience.trim().length>5 && form.responsiveExperience.trim().length>5 && form.designSystemsExperience.trim().length>5 &&
    form.strongestCaseStudy.trim().length>10 && form.caseStudyContribution.trim().length>10 && form.developerHandoffExperience.trim().length>5 &&
    form.hasLaptopInternet && form.consentAccurate && form.consentPrivacy
  ),[form,cv,hours,minimumWeeklyHours]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(current => ({...current,[key]:value}));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !cv) return;
    setBusy(true); setError(''); setCvProgress(0);
    try {
      const upload = await applicantService.uploadPublicApplicationFile(form.email,'cv',cv,setCvProgress);
      const params = new URLSearchParams(window.location.search);
      const payload = {
        ...form,
        fullName:form.fullName.trim(), email:form.email.trim().toLowerCase(), phone:form.phone.trim(), country:form.country.trim(), timezone:form.timezone || 'UTC',
        linkedinUrl:form.linkedinUrl.trim(), currentRole:form.currentRole.trim(), portfolioUrl:form.portfolioUrl.trim(), availableHoursPerWeek:hours,
        cvStoragePath:upload.path, source:form.heardAboutSource || 'ProFox Website', consentAccurate:form.consentAccurate, consentPrivacy:form.consentPrivacy,
        utmSource:params.get('utm_source') || '', utmMedium:params.get('utm_medium') || '', utmCampaign:params.get('utm_campaign') || '',
        utmContent:params.get('utm_content') || '', utmTerm:params.get('utm_term') || '', landingPage:window.location.pathname, referrerUrl:document.referrer || '',
      };
      const { data, error: rpcError } = await supabase.rpc('submit_public_uiux_application',{p_job_slug:job.slug,p_application:payload});
      if (rpcError) throw rpcError;
      if (!data?.success) throw new Error(data?.error || 'Application could not be submitted.');
      if (data.reference) await talentPartnerService.claimApplication(data.reference, form.email);
      setSubmitted({reference:data.reference,duplicate:Boolean(data.duplicate)});
    } catch (err:any) {
      setError(err?.message || 'We could not submit your application. Please review the fields and try again.');
    } finally { setBusy(false); }
  };

  if (submitted) return (
    <section id="apply" className="border-y border-emerald-200 bg-emerald-50 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h2 className="mt-4 text-3xl font-black text-slate-900">{submitted.duplicate ? 'Your application is already active' : 'Application received'}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-600">{submitted.duplicate ? 'We found an existing active application for this UI/UX Designer role. Please use the newest ProFox recruitment communication for any next step.' : 'Thank you. Your application is now in the connected ProFox recruitment workflow. Portfolio review is the next controlled step.'}</p>
        {submitted.reference && <div className="mx-auto mt-5 w-fit rounded-xl border border-emerald-200 bg-white px-4 py-2 text-xs font-black text-emerald-800">Reference · {submitted.reference}</div>}
      </div>
    </section>
  );

  return (
    <section id="apply" className="border-t border-slate-200 bg-slate-50 py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-7 lg:grid-cols-[1fr_380px] lg:items-center">
          <div className="max-w-3xl">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#FF0E0E]">Apply for paid project opportunities</div>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-[#071126] sm:text-4xl">One application. Structured evidence. Clear next steps.</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">We review the work you actually contributed to, how you reason through design decisions and how ready you are to deliver inside a controlled client workflow. Portfolio production value alone does not decide the result.</p>
            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-xs leading-6 text-slate-700">
              <strong>Before you apply:</strong> this role starts as paid, project-based contract work. The stated $1,500+–$3,000+ monthly figure is earning potential, not guaranteed income. Strong performers may be considered for a salary discussion after at least six months.
            </div>
          </div>
          <div className="relative min-h-[260px] overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-sm">
            <img src={applicationImage} alt="Male professional in a structured interview setting" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 hover:scale-[1.025]" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/20 to-transparent" />
          </div>
        </div>

        <form onSubmit={submit} className="mt-9 space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
          <Group title="Contact & professional profile" text="These fields become the canonical candidate identity for this application.">
            <Grid>
              <Field label="Full name *"><input className={input} value={form.fullName} onChange={e=>set('fullName',e.target.value)} autoComplete="name" /></Field>
              <Field label="Email *"><input type="email" className={input} value={form.email} onChange={e=>set('email',e.target.value)} autoComplete="email" /></Field>
              <Field label="Phone / WhatsApp"><input className={input} value={form.phone} onChange={e=>set('phone',e.target.value)} /></Field>
              <Field label="Country *"><input className={input} value={form.country} onChange={e=>set('country',e.target.value)} /></Field>
              <Field label="Timezone"><input className={input} value={form.timezone} onChange={e=>set('timezone',e.target.value)} /></Field>
              <Field label="Current role"><input className={input} value={form.currentRole} onChange={e=>set('currentRole',e.target.value)} /></Field>
              <Field label="LinkedIn"><input type="url" className={input} placeholder="https://linkedin.com/in/..." value={form.linkedinUrl} onChange={e=>set('linkedinUrl',e.target.value)} /></Field>
              <Field label="Portfolio / case studies *"><input type="url" className={input} placeholder="https://..." value={form.portfolioUrl} onChange={e=>set('portfolioUrl',e.target.value)} /></Field>
            </Grid>
            <label className="mt-4 block rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
              <div className="flex items-start gap-3"><UploadCloud className="mt-0.5 h-5 w-5 text-[#000080]"/><div><div className="text-sm font-black text-slate-900">CV / resume *</div><div className="mt-1 text-xs text-slate-500">PDF, DOC or DOCX · max 8 MB. Stored in the existing secured recruitment application bucket.</div></div></div>
              <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="mt-4 block w-full text-xs" onChange={e=>setCv(e.target.files?.[0] || null)} />
              {cv && <div className="mt-3 flex items-center gap-2 text-xs font-bold text-[#000080]"><FileText className="h-4 w-4"/>{cv.name}{cvProgress>0 && busy ? ` · ${cvProgress}%` : ''}</div>}
            </label>
          </Group>

          <Group title="Design evidence" text="Short answers help us review your portfolio consistently. Be specific about what you personally did.">
            <Grid>
              <Field label="Years of relevant experience"><input className={input} value={form.yearsExperience} onChange={e=>set('yearsExperience',e.target.value)} placeholder="e.g. 3 years" /></Field>
              <Field label="Weekly availability *"><input type="number" min={minimumWeeklyHours} max={80} className={input} value={form.availableHoursPerWeek} onChange={e=>set('availableHoursPerWeek',e.target.value)} placeholder={`Minimum ${minimumWeeklyHours} hours`} /></Field>
            </Grid>
            <p className="-mt-1 text-[10px] leading-5 text-slate-400">Weekly availability helps us understand your project capacity. It does not represent guaranteed paid hours or guaranteed project volume.</p>
            <Area label="How do you use Figma in production work? *" value={form.figmaExperience} onChange={v=>set('figmaExperience',v)} placeholder="Auto Layout, components, variants, variables, prototypes, handoff..." />
            <Area label="How do you approach responsive design? *" value={form.responsiveExperience} onChange={v=>set('responsiveExperience',v)} />
            <Area label="Tell us about your design-system/component experience. *" value={form.designSystemsExperience} onChange={v=>set('designSystemsExperience',v)} />
            <Area label="How do you account for accessibility while designing?" value={form.accessibilityExperience} onChange={v=>set('accessibilityExperience',v)} />
            <Area label="Which portfolio case study best represents your ability and why? *" value={form.strongestCaseStudy} onChange={v=>set('strongestCaseStudy',v)} />
            <Area label="What exactly was your contribution to that project? *" value={form.caseStudyContribution} onChange={v=>set('caseStudyContribution',v)} />
            <Area label="Describe your experience handing designs to developers. *" value={form.developerHandoffExperience} onChange={v=>set('developerHandoffExperience',v)} />
          </Group>

          <Group title="Availability & fit" text="This information helps us assess delivery readiness, not visual design skill.">
            <Grid>
              <Field label="Preferred work window"><input className={input} value={form.preferredWorkWindow} onChange={e=>set('preferredWorkWindow',e.target.value)} placeholder="e.g. 10:00–18:00 IST" /></Field>
              <Field label="Earliest start date"><input type="date" className={input} value={form.earliestStartDate} onChange={e=>set('earliestStartDate',e.target.value)} /></Field>
              <Field label="How did you hear about ProFox?"><select className={input} value={form.heardAboutSource} onChange={e=>set('heardAboutSource',e.target.value)}>{sourceOptions.map(v=><option key={v}>{v}</option>)}</select></Field>
              <Field label="Source detail"><input className={input} value={form.heardAboutDetail} onChange={e=>set('heardAboutDetail',e.target.value)} /></Field>
            </Grid>
            <Area label="Why do you want to work with the ProFox UI/UX Design team?" value={form.motivation} onChange={v=>set('motivation',v)} />
          </Group>

          <div className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
            <Check checked={form.hasLaptopInternet} onChange={v=>set('hasLaptopInternet',v)}>I have a reliable computer, internet connection and suitable environment for professional remote design work.</Check>
            <Check checked={form.consentAccurate} onChange={v=>set('consentAccurate',v)}>I confirm that the application, portfolio links and description of my contribution are accurate.</Check>
            <Check checked={form.consentPrivacy} onChange={v=>set('consentPrivacy',v)}>I consent to ProFox processing this information for recruitment and related onboarding purposes.</Check>
          </div>

          <div className="flex flex-col justify-between gap-4 border-t border-slate-100 pt-6 sm:flex-row sm:items-center">
            <div className="flex items-start gap-2 text-[11px] leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]"/><span>Your application goes into the same protected recruitment record used for review, assessment, interview, agreement and onboarding.</span></div>
            <button type="submit" disabled={!canSubmit || busy} className="inline-flex min-w-[190px] items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-black text-white transition hover:bg-[#000066] disabled:cursor-not-allowed disabled:opacity-40">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}{busy?'Submitting...':'Submit application'}</button>
          </div>
        </form>
        <p className="mt-4 flex items-center gap-1.5 text-[10px] text-slate-400"><ExternalLink className="h-3 w-3"/>Portfolio links must be accessible to the recruitment reviewer without requesting private client credentials.</p>
      </div>
    </section>
  );
}

function Group({title,text,children}:{title:string;text:string;children:React.ReactNode}){return <section><div className="border-b border-slate-100 pb-3"><h3 className="text-base font-black text-slate-900">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div><div className="mt-4 space-y-4">{children}</div></section>}
function Grid({children}:{children:React.ReactNode}){return <div className="grid gap-4 sm:grid-cols-2">{children}</div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</span>{children}</label>}
function Area({label,value,onChange,placeholder}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string}){return <Field label={label}><textarea rows={3} className={input} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></Field>}
function Check({checked,onChange,children}:{checked:boolean;onChange:(v:boolean)=>void;children:React.ReactNode}){return <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-slate-700"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#000080]"/><span>{children}</span></label>}
