import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Github, Loader2, Send, ShieldCheck, UploadCloud } from 'lucide-react';
import { applicantService } from '../lib/applicantService';
import { careerService, type CareerJob } from '../lib/careerService';
import { developerHiringService } from '../lib/developerHiringService';

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  country: string;
  timezone: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  currentRole: string;
  yearsExperience: string;
  primaryStack: string;
  frontendExperience: string;
  backendExperience: string;
  wordpressExperience: string;
  gitWorkflowExperience: string;
  testingExperience: string;
  accessibilityExperience: string;
  performanceExperience: string;
  securityExperience: string;
  designHandoffExperience: string;
  strongestProject: string;
  projectContribution: string;
  availableHoursPerWeek: string;
  preferredWorkWindow: string;
  earliestStartDate: string;
  skills: string;
  heardAboutSource: string;
  heardAboutDetail: string;
  motivation: string;
  hasLaptopInternet: boolean;
  consentAccurate: boolean;
  consentPrivacy: boolean;
};

const initialState: FormState = {
  fullName: '', email: '', phone: '', country: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  linkedinUrl: '', githubUrl: '', portfolioUrl: '', currentRole: '', yearsExperience: '', primaryStack: '',
  frontendExperience: '', backendExperience: '', wordpressExperience: '', gitWorkflowExperience: '', testingExperience: '',
  accessibilityExperience: '', performanceExperience: '', securityExperience: '', designHandoffExperience: '', strongestProject: '',
  projectContribution: '', availableHoursPerWeek: '20', preferredWorkWindow: '', earliestStartDate: '', skills: '',
  heardAboutSource: 'ProFox website', heardAboutDetail: '', motivation: '', hasLaptopInternet: true,
  consentAccurate: false, consentPrivacy: false
};

const LONG_FIELDS: Array<{ key: keyof FormState; label: string; hint: string; required?: boolean }> = [
  { key: 'frontendExperience', label: 'Frontend experience', hint: 'Frameworks, responsive UI, state management, forms, browser work and examples relevant to your real delivery experience.', required: true },
  { key: 'backendExperience', label: 'Backend / database experience', hint: 'APIs, authentication, databases, server-side logic, integrations or deployment work you have personally delivered.', required: true },
  { key: 'wordpressExperience', label: 'WordPress / CMS experience', hint: 'If relevant, describe custom themes/plugins, Elementor, WooCommerce, CMS integrations or write “Not applicable”.', required: true },
  { key: 'gitWorkflowExperience', label: 'Git & GitHub workflow', hint: 'Describe how you use branches, commits, pull requests, reviews, merge conflict handling and protected production branches.', required: true },
  { key: 'testingExperience', label: 'Testing & developer self-QA', hint: 'Explain the automated/manual checks you use before handing work to QA.', required: true },
  { key: 'accessibilityExperience', label: 'Accessibility', hint: 'Describe implementation experience with semantics, keyboard/focus, forms, contrast support, responsive reflow or WCAG-oriented delivery.', required: true },
  { key: 'performanceExperience', label: 'Web performance', hint: 'Describe how you investigate and improve loading, interaction responsiveness, assets, rendering or Core Web Vitals.', required: true },
  { key: 'securityExperience', label: 'Security & data handling', hint: 'Describe secure coding, authorization, input validation, secret handling, dependencies or client-data practices.', required: true },
  { key: 'designHandoffExperience', label: 'Designer handoff experience', hint: 'How do you work from Figma/design systems, resolve ambiguity and protect visual/interaction fidelity?', required: true },
  { key: 'strongestProject', label: 'Strongest shipped project', hint: 'Describe one production website/app that best represents your engineering quality. Include the public/project link in your GitHub or portfolio where possible.', required: true },
  { key: 'projectContribution', label: 'Your contribution', hint: 'Be specific about what you personally implemented, decisions you owned and the outcome.', required: true },
  { key: 'motivation', label: 'Why ProFox Development?', hint: 'Why does this structured, quality-gated delivery model fit the way you want to work?', required: true }
];

export default function DeveloperApplicationPage() {
  const { slug = 'web-developer' } = useParams<{ slug: string }>();
  const [job, setJob] = useState<CareerJob | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [form, setForm] = useState<FormState>(initialState);
  const [cv, setCv] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ reference?: string; duplicate?: boolean; message?: string } | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingJob(true);
    careerService.getPublicJobBySlug(slug)
      .then(row => {
        if (!active) return;
        const systemRole = String((row?.roleDetails as any)?.systemRole || '');
        setJob(row && systemRole === 'developer' ? row : null);
      })
      .catch(() => { if (active) setJob(null); })
      .finally(() => { if (active) setLoadingJob(false); });
    return () => { active = false; };
  }, [slug]);

  const minWeeklyHours = Number((job?.roleDetails as any)?.applicationForm?.minimumWeeklyHours || 20);
  const sourceOptions: string[] = useMemo(() => {
    const options = (job?.roleDetails as any)?.applicationForm?.sourceOptions;
    return Array.isArray(options) && options.length ? options : ['LinkedIn', 'Google Search', 'Social media', 'Job board', 'Referral', 'ProFox website', 'Other'];
  }, [job]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(current => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!job) return;
    setError('');
    setResult(null);

    const hours = Number(form.availableHoursPerWeek || 0);
    if (!cv) { setError('Please upload your CV or resume.'); return; }
    if (!/^https?:\/\//i.test(form.githubUrl.trim())) { setError('Please provide a complete GitHub/profile URL beginning with http:// or https://.'); return; }
    if (!Number.isFinite(hours) || hours < minWeeklyHours) { setError(`This role currently requires at least ${minWeeklyHours} hours of weekly availability.`); return; }
    if (!form.consentAccurate || !form.consentPrivacy) { setError('Please accept the accuracy confirmation and privacy consent.'); return; }

    setBusy(true);
    try {
      const uploaded = await applicantService.uploadPublicApplicationFile(form.email, 'cv', cv, setUploadProgress);
      const params = new URLSearchParams(window.location.search);
      const response = await developerHiringService.submit(slug, {
        ...form,
        availableHoursPerWeek: hours,
        cvStoragePath: uploaded.path,
        source: form.heardAboutSource || 'ProFox Website',
        landingPage: window.location.href.split('?')[0],
        referrerUrl: document.referrer || '',
        utmSource: params.get('utm_source') || '',
        utmMedium: params.get('utm_medium') || '',
        utmCampaign: params.get('utm_campaign') || '',
        utmContent: params.get('utm_content') || '',
        utmTerm: params.get('utm_term') || ''
      });
      if (!response.success) throw new Error(response.message || 'We could not submit your application.');
      setResult({ reference: response.reference, duplicate: response.duplicate, message: response.message });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setError(err?.message || 'We could not submit your application right now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loadingJob) return <div className="flex min-h-[70vh] items-center justify-center bg-white"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  if (!job) return <main className="min-h-[70vh] bg-white px-6 py-40 text-center"><h1 className="text-3xl font-black text-slate-900">Developer role not found</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">This role may be closed or the application route is no longer active.</p><Link to="/careers" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-black text-white"><ArrowLeft className="h-4 w-4" /> Back to Careers</Link></main>;

  if (result) return (
    <main className="min-h-screen bg-slate-50 px-6 py-32">
      <div className="mx-auto max-w-xl rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h1 className="mt-5 text-3xl font-black text-slate-900">Application received</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{result.duplicate ? (result.message || 'An active application for this role already exists.') : 'Thank you. Your application is now in the controlled ProFox Development recruitment workflow.'}</p>
        {result.reference && <div className="mx-auto mt-6 w-fit rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-[#000080]">Reference: {result.reference}</div>}
        <p className="mt-6 text-xs leading-5 text-slate-500">Keep your reference for future recruitment communication. Production/client-project access is never granted from the application alone.</p>
        <Link to="/careers" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-black text-white"><ArrowLeft className="h-4 w-4" /> Back to Careers</Link>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-[#fbfcff] text-slate-900">
      <section className="border-b border-slate-200 bg-white pt-32 pb-12">
        <div className="mx-auto max-w-4xl px-6">
          <Link to={`/careers/${job.slug}`} className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-[#000080]"><ArrowLeft className="h-4 w-4" /> Back to role</Link>
          <div className="mt-8 flex items-start gap-4">
            <div className="rounded-2xl bg-[#000080] p-3 text-white"><Github className="h-6 w-6" /></div>
            <div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#FF0E0E]">Development Recruitment</div><h1 className="mt-2 text-4xl font-black tracking-tight text-[#071126]">Apply for {job.title}</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">Submit evidence we can review consistently. Use only work you are authorized to share; never upload client secrets, private credentials or confidential source code.</p></div>
          </div>
        </div>
      </section>

      <form onSubmit={submit} className="mx-auto max-w-4xl space-y-8 px-6 py-12">
        {error && <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />{error}</div>}

        <Section title="Contact & professional profile" subtitle="Your identity and public work references stay attached to one candidate record.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Full name" value={form.fullName} onChange={v => set('fullName', v)} required />
            <Input label="Email" type="email" value={form.email} onChange={v => set('email', v)} required />
            <Input label="Phone" value={form.phone} onChange={v => set('phone', v)} />
            <Input label="Country" value={form.country} onChange={v => set('country', v)} required />
            <Input label="Timezone" value={form.timezone} onChange={v => set('timezone', v)} required />
            <Input label="Current role/title" value={form.currentRole} onChange={v => set('currentRole', v)} />
            <Input label="GitHub / public code profile" value={form.githubUrl} onChange={v => set('githubUrl', v)} placeholder="https://github.com/..." required />
            <Input label="Portfolio / shipped-work URL" value={form.portfolioUrl} onChange={v => set('portfolioUrl', v)} placeholder="https://..." />
            <Input label="LinkedIn URL" value={form.linkedinUrl} onChange={v => set('linkedinUrl', v)} placeholder="https://..." />
            <Input label="Years of relevant experience" value={form.yearsExperience} onChange={v => set('yearsExperience', v)} placeholder="e.g. 3 years" required />
            <div className="sm:col-span-2"><Input label="Primary stack / strongest technologies" value={form.primaryStack} onChange={v => set('primaryStack', v)} placeholder="e.g. React, TypeScript, Node.js, PostgreSQL, WordPress/PHP" required /></div>
          </div>
        </Section>

        <Section title="CV / resume" subtitle="PDF, DOC or DOCX up to 8 MB. The file uses the existing protected recruitment upload workflow.">
          <label className="flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 transition hover:border-[#000080]">
            <div className="rounded-xl bg-white p-3 text-[#000080] shadow-sm"><UploadCloud className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1"><div className="text-sm font-black text-slate-800">{cv?.name || 'Choose CV / resume'}</div><div className="mt-1 text-xs text-slate-500">PDF, DOC or DOCX · max 8 MB</div>{busy && uploadProgress > 0 && <div className="mt-2 text-[10px] font-black text-[#000080]">Upload {uploadProgress}%</div>}</div>
            <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={event => setCv(event.target.files?.[0] || null)} />
          </label>
        </Section>

        <Section title="Engineering evidence" subtitle="We care about real delivery judgment, not keyword counts. Keep answers specific and concise.">
          <div className="space-y-5">{LONG_FIELDS.map(field => <TextArea key={String(field.key)} label={field.label} hint={field.hint} value={String(form[field.key] ?? '')} onChange={v => set(field.key, v as never)} required={field.required} />)}</div>
        </Section>

        <Section title="Availability & working setup" subtitle={`The current role requires at least ${minWeeklyHours} hours per week.`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Hours available per week" type="number" min={minWeeklyHours} max={80} value={form.availableHoursPerWeek} onChange={v => set('availableHoursPerWeek', v)} required />
            <Input label="Preferred work window" value={form.preferredWorkWindow} onChange={v => set('preferredWorkWindow', v)} placeholder="e.g. 10:00–18:00 IST" />
            <Input label="Earliest start date" type="date" value={form.earliestStartDate} onChange={v => set('earliestStartDate', v)} />
            <Input label="Additional skills" value={form.skills} onChange={v => set('skills', v)} placeholder="Optional" />
            <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-500">How did you hear about ProFox?</span><select value={form.heardAboutSource} onChange={e => set('heardAboutSource', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#000080]">{sourceOptions.map(option => <option key={option}>{option}</option>)}</select></label>
            <Input label="Source detail" value={form.heardAboutDetail} onChange={v => set('heardAboutDetail', v)} placeholder="Optional" />
          </div>
          <label className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"><input type="checkbox" checked={form.hasLaptopInternet} onChange={e => set('hasLaptopInternet', e.target.checked)} className="mt-1" /><span className="text-sm leading-6 text-slate-600"><strong className="text-slate-900">Work setup confirmed.</strong> I have reliable access to a development-capable computer and internet connection suitable for remote work.</span></label>
        </Section>

        <Section title="Confirm before submitting" subtitle="Recruitment evidence must be accurate and appropriate to share.">
          <div className="space-y-3">
            <Check checked={form.consentAccurate} onChange={v => set('consentAccurate', v)}>I confirm that my application and stated contribution to projects are accurate.</Check>
            <Check checked={form.consentPrivacy} onChange={v => set('consentPrivacy', v)}>I consent to ProFox processing this application for recruitment and understand I must not submit confidential client credentials, secrets or unauthorized private material.</Check>
          </div>
          <div className="mt-5 flex gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-xs leading-6 text-slate-600"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#000080]" /><span>Selection, agreement, Developer Academy, final certification and Management approval are separate controlled gates. Submitting this form does not create production or client-project access.</span></div>
        </Section>

        <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#000080] px-6 py-4 text-sm font-black text-white shadow-lg shadow-blue-900/10 transition hover:bg-[#000066] disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}{busy ? 'Submitting application...' : 'Submit Web Developer Application'}</button>
      </form>
    </main>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><h2 className="text-xl font-black text-[#071126]">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p><div className="mt-6">{children}</div></section>;
}

function Input({ label, value, onChange, type = 'text', placeholder = '', required = false, min, max }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean; min?: number; max?: number }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-500">{label}{required ? ' *' : ''}</span><input type={type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} required={required} min={min} max={max} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-[#000080] focus:bg-white" /></label>;
}

function TextArea({ label, hint, value, onChange, required = false }: { label: string; hint: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className="block"><span className="text-xs font-black text-slate-800">{label}{required ? ' *' : ''}</span><p className="mt-1 text-[11px] leading-5 text-slate-500">{hint}</p><textarea value={value} onChange={event => onChange(event.target.value)} required={required} rows={4} className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 outline-none transition focus:border-[#000080] focus:bg-white" /></label>;
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: React.ReactNode }) {
  return <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-1" /><span className="text-sm leading-6 text-slate-600">{children}</span></label>;
}
