import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  Globe2,
  Laptop2,
  Send,
  ShieldCheck,
  Target,
  Video,
  X
} from 'lucide-react';
import { applicantService } from '../lib/applicantService';

interface CareersDetailViewProps {
  page?: any;
}

const ROLE_TITLE = 'Independent Commission-Based Sales Representative';

const fallback = {
  hero: {
    badge: 'REMOTE · COMMISSION-BASED · INTERNATIONAL SALES',
    title: 'Independent Sales Representative',
    line: 'Help businesses move from site to system.',
    description:
      'Represent ProFox with businesses in the US, UK, Canada and Australia. Find qualified prospects, start useful conversations, run discovery calls and close website, application and automation projects.'
  },
  role: {
    location: 'Remote · Worldwide',
    type: 'Independent contractor · Commission-only',
    experience: '6+ months sales experience',
    summary:
      'This role is for salespeople who can work independently, communicate clearly in English and stay consistent from prospect research through follow-up and close.'
  },
  compensation: [
    { label: 'Website Package', price: '$599', rate: '10%', example: '$59.90' },
    { label: 'Business Package', price: '$2,379', rate: '12%', example: '$285.48' },
    { label: 'Premium Package', price: '$5,799+', rate: '15%', example: '$869.85+' },
    { label: 'Custom Web Application', price: 'Approved quotation', rate: '10–15%', example: 'Set per quotation' }
  ],
  responsibilities: [
    'Research and qualify businesses that fit ProFox services.',
    'Use thoughtful email, LinkedIn, phone and personalized outreach to start conversations.',
    'Book and conduct discovery meetings by Zoom or Google Meet.',
    'Understand the client’s goals, current website or workflow, decision process and next step.',
    'Present the right ProFox Web, ProFox Apps or ProFox Flow service without overselling.',
    'Keep leads, follow-ups, meetings and quotations accurate in the ProFox CRM.',
    'Close responsibly and hand verified sales into the delivery system.'
  ],
  requirements: [
    'At least 6 months of sales, business development or client-facing experience.',
    'Clear spoken and written English for international client conversations.',
    'Confidence conducting professional video meetings and asking discovery questions.',
    'A reliable laptop, internet connection and a suitable place for client calls.',
    'Comfort with a commission-only independent contractor model.',
    'Ability to research prospects, follow up consistently and work without daily supervision.'
  ],
  process: [
    { title: 'Apply', text: 'Tell us about your experience and send a 60–120 second introduction video.' },
    { title: 'Review & assessment', text: 'We review communication, sales judgment, lead research and CRM readiness.' },
    { title: 'Agreement', text: 'Selected candidates review and sign the ProFox Independent Sales Partner Agreement.' },
    { title: 'Sales Academy', text: 'Complete the required 20-module training, practical reviews and final certification.' },
    { title: 'Final approval', text: 'ProFox reviews training evidence and activation readiness.' },
    { title: 'Start selling', text: 'Approved representatives receive active sales access and begin managing their own pipeline.' }
  ]
};

export default function CareersDetailView({ page }: CareersDetailViewProps) {
  const data = page?.careersData || {};
  const hero = { ...fallback.hero, ...(data.hero || {}) };
  const role = { ...fallback.role, ...(data.role || {}) };
  const compensation = Array.isArray(data.compensation) && data.compensation.length ? data.compensation : fallback.compensation;
  const responsibilities = Array.isArray(data.responsibilities) && data.responsibilities.length ? data.responsibilities : fallback.responsibilities;
  const requirements = Array.isArray(data.requirements) && data.requirements.length ? data.requirements : fallback.requirements;
  const process = Array.isArray(data.process) && data.process.length ? data.process : fallback.process;

  const [applyOpen, setApplyOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [timezone, setTimezone] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [currentRole, setCurrentRole] = useState('');
  const [salesExperience, setSalesExperience] = useState('');
  const [digitalSalesExperience, setDigitalSalesExperience] = useState('');
  const [internationalSalesExperience, setInternationalSalesExperience] = useState('');
  const [englishRating, setEnglishRating] = useState('Fluent / Native');
  const [availability, setAvailability] = useState('Full-time');
  const [hasLaptopInternet, setHasLaptopInternet] = useState(true);
  const [comfortableCommission, setComfortableCommission] = useState(true);
  const [comfortableSourcing, setComfortableSourcing] = useState(true);
  const [cvUrl, setCvUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [referralSource, setReferralSource] = useState('ProFox Website');
  const [message, setMessage] = useState('');
  const [consentAccurate, setConsentAccurate] = useState(false);
  const [consentCommission, setConsentCommission] = useState(false);
  const [consentReview, setConsentReview] = useState(false);
  const [consentPrivacy, setConsentPrivacy] = useState(false);

  useEffect(() => {
    document.title = page?.seo?.metaTitle || 'Independent Sales Representative | ProFox Careers';
    window.scrollTo(0, 0);
  }, [page?.seo?.metaTitle]);

  const commissionExamples = useMemo(
    () => compensation.map((item: any) => ({ ...item, key: `${item.label}-${item.rate}` })),
    [compensation]
  );

  const closeApply = () => {
    setApplyOpen(false);
    setSubmitted(false);
    setError('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!fullName.trim() || !email.trim() || !salesExperience.trim() || !country.trim()) {
      setError('Please complete your name, email, country and sales experience.');
      return;
    }
    if (!/^https?:\/\//i.test(videoUrl.trim())) {
      setError('Please add a valid public or shareable link to your 60–120 second introduction video.');
      return;
    }
    if (!consentAccurate || !consentCommission || !consentReview || !consentPrivacy) {
      setError('Please review and accept the required confirmations before applying.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await applicantService.submitPublicApplication({
        fullName,
        email,
        phone,
        country,
        timezone,
        linkedinUrl,
        currentRole,
        salesExperience,
        digitalSalesExperience,
        internationalSalesExperience,
        englishRating,
        availability,
        hasLaptopInternet,
        comfortableCommission,
        comfortableSourcing,
        cvUrl,
        videoUrl,
        referralSource,
        message
      });
      if (result.success) {
        setSubmitted(true);
      } else if (result.duplicate) {
        setError(result.message || 'An active application with this email is already under review.');
      } else {
        setError(result.error || 'Your application could not be submitted. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Your application could not be submitted. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <section className="border-b border-slate-200 bg-white pt-32 pb-16 sm:pt-36 sm:pb-20">
        <div className="mx-auto max-w-6xl px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 transition hover:text-[#000080]">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
          <div className="mt-10 max-w-4xl">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#FF0E0E]">{hero.badge}</div>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-[#000080] sm:text-6xl">{hero.title}</h1>
            <p className="mt-5 text-xl font-bold leading-snug text-slate-900 sm:text-2xl">{hero.line}</p>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">{hero.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => setApplyOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#FF0E0E] px-5 py-3 text-sm font-black text-white transition hover:brightness-95">
                Apply for the role <ArrowRight className="h-4 w-4" />
              </button>
              <a href="#role" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-[#000080] transition hover:border-[#000080]">
                See role details
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="role" className="border-b border-slate-200 bg-slate-50 py-10">
        <div className="mx-auto grid max-w-6xl gap-4 px-6 sm:grid-cols-3">
          <Info icon={Globe2} label="Location" value={role.location} />
          <Info icon={BriefcaseBusiness} label="Engagement" value={role.type} />
          <Info icon={Clock3} label="Experience" value={role.experience} />
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-3xl">
            <Eyebrow>THE OPPORTUNITY</Eyebrow>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-[#000080] sm:text-4xl">Sell connected digital work. Keep the relationship clear.</h2>
            <p className="mt-5 text-base leading-7 text-slate-600">{role.summary}</p>
          </div>

          <div className="mt-12 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-start gap-3">
              <CircleDollarSign className="mt-1 h-6 w-6 shrink-0 text-[#FF0E0E]" />
              <div>
                <h3 className="text-xl font-black text-[#000080]">Clear commission. No hidden formula.</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">This is a commission-only independent contractor opportunity. Commission is earned on verified customer payments according to the approved package or quotation.</p>
              </div>
            </div>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {commissionExamples.map((item: any) => (
                <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">{item.label}</div>
                  <div className="mt-2 text-2xl font-black text-[#000080]">{item.price}</div>
                  <div className="mt-3 text-sm font-black text-slate-900">{item.rate} commission</div>
                  <div className="mt-1 text-xs text-slate-500">{item.example}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border-l-4 border-[#FF0E0E] bg-red-50/60 p-5">
              <div className="text-sm font-black text-slate-900">Self-sourced + closed deal: +5 percentage points</div>
              <p className="mt-1 text-xs leading-5 text-slate-600">When you both generate and close the lead yourself, five percentage points are added to the approved base commission rate for that deal.</p>
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-500">Eligible commissions are paid on the 15th and the last working day of each month after the relevant customer payment has been verified.</p>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-2">
          <ListBlock eyebrow="WHAT YOU'LL DO" title="Own the sales journey." items={responsibilities} icon={Target} />
          <ListBlock eyebrow="WHAT YOU NEED" title="The essentials, not a wish list." items={requirements} icon={ShieldCheck} />
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-3xl">
            <Eyebrow>HOW SELECTION WORKS</Eyebrow>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-[#000080] sm:text-4xl">Simple outside. Thorough inside.</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">You see a clear path. Behind it, ProFox uses structured checks so system access is granted only after agreement, training and final approval.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {process.map((step: any, index: number) => (
              <div key={`${step.title}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-black text-[#FF0E0E]">0{index + 1}</div>
                <h3 className="mt-3 text-base font-black text-[#000080]">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#000080] py-16 text-white sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 lg:grid-cols-[1fr_360px] lg:items-center">
          <div>
            <Eyebrow light>INTRODUCTION VIDEO</Eyebrow>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Give us 60–120 seconds.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-blue-100">Record a short English introduction and share a public or viewable link. Cover your background, sales experience, client communication, English fluency and why this ProFox opportunity fits you.</p>
          </div>
          <div className="rounded-3xl border border-white/20 bg-white/10 p-6">
            <Video className="h-7 w-7 text-white" />
            <div className="mt-4 text-sm font-black">A polished production is not required.</div>
            <p className="mt-2 text-xs leading-5 text-blue-100">We are reviewing clarity, communication and fit—not your editing skills.</p>
          </div>
        </div>
      </section>

      <section className="py-16 text-center sm:py-20">
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-sm font-black text-[#FF0E0E]">From site to system.</div>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-[#000080] sm:text-4xl">Ready to represent ProFox?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-600">If the role, commission model and expectations are clear and fit how you work, send your application. We will review the information you provide and contact shortlisted candidates.</p>
          <button onClick={() => setApplyOpen(true)} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#FF0E0E] px-6 py-3.5 text-sm font-black text-white transition hover:brightness-95">
            Apply for the role <Send className="h-4 w-4" />
          </button>
        </div>
      </section>

      {applyOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#FF0E0E]">APPLICATION</div>
                <h2 className="mt-1 text-xl font-black text-[#000080]">{ROLE_TITLE}</h2>
              </div>
              <button onClick={closeApply} className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50" aria-label="Close application">
                <X className="h-4 w-4" />
              </button>
            </div>

            {submitted ? (
              <div className="p-8 text-center sm:p-12">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h3 className="mt-5 text-2xl font-black text-[#000080]">Application received.</h3>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">Thank you for applying to ProFox. Your candidate details and introduction video are now in review. Shortlisted candidates will be contacted using the email or phone number submitted in the application.</p>
                <p className="mx-auto mt-3 max-w-xl text-xs leading-5 text-slate-500">Submitting an application does not create a ProFox account or grant CRM access.</p>
                <button onClick={closeApply} className="mt-7 rounded-xl bg-[#000080] px-5 py-3 text-sm font-black text-white">Done</button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-7 p-6 sm:p-8">
                {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

                <FormSection title="About you" description="The information we need to review your application.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Full name *"><input required value={fullName} onChange={e => setFullName(e.target.value)} className={inputClass} /></Field>
                    <Field label="Email address *"><input required type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} /></Field>
                    <Field label="Phone / WhatsApp"><input value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} /></Field>
                    <Field label="Country *"><input required value={country} onChange={e => setCountry(e.target.value)} className={inputClass} /></Field>
                    <Field label="Timezone"><input value={timezone} onChange={e => setTimezone(e.target.value)} className={inputClass} placeholder="e.g. Asia/Kolkata" /></Field>
                    <Field label="LinkedIn profile"><input type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} className={inputClass} placeholder="https://linkedin.com/in/..." /></Field>
                    <Field label="Current role"><input value={currentRole} onChange={e => setCurrentRole(e.target.value)} className={inputClass} /></Field>
                    <Field label="Availability"><select value={availability} onChange={e => setAvailability(e.target.value)} className={inputClass}><option>Full-time</option><option>Part-time</option><option>Flexible</option></select></Field>
                  </div>
                </FormSection>

                <FormSection title="Sales experience" description="Keep it practical. We care about what you have actually done.">
                  <Field label="Sales / business development experience *"><textarea required rows={3} value={salesExperience} onChange={e => setSalesExperience(e.target.value)} className={inputClass} placeholder="What have you sold, who were the customers, and what part of the sales process did you own?" /></Field>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="Digital / SaaS sales experience"><input value={digitalSalesExperience} onChange={e => setDigitalSalesExperience(e.target.value)} className={inputClass} /></Field>
                    <Field label="International sales experience"><input value={internationalSalesExperience} onChange={e => setInternationalSalesExperience(e.target.value)} className={inputClass} /></Field>
                    <Field label="English level"><select value={englishRating} onChange={e => setEnglishRating(e.target.value)} className={inputClass}><option>Fluent / Native</option><option>Professional working proficiency</option><option>Conversational</option></select></Field>
                    <Field label="CV / résumé link"><input type="url" value={cvUrl} onChange={e => setCvUrl(e.target.value)} className={inputClass} placeholder="Optional shareable link" /></Field>
                  </div>
                </FormSection>

                <FormSection title="60–120 second introduction video *" description="A shareable Loom, Google Drive, YouTube unlisted or similar link is fine.">
                  <Field label="Video link *"><input required type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} className={inputClass} placeholder="https://..." /></Field>
                  <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                    Cover: <strong>your introduction · sales experience · English communication · client dealing · why ProFox</strong>.
                  </div>
                </FormSection>

                <FormSection title="Readiness" description="These answers help us avoid wasting your time or ours.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Toggle checked={hasLaptopInternet} setChecked={setHasLaptopInternet} label="I have a reliable laptop and internet connection." />
                    <Toggle checked={comfortableCommission} setChecked={setComfortableCommission} label="I am comfortable with a commission-only contractor role." />
                    <Toggle checked={comfortableSourcing} setChecked={setComfortableSourcing} label="I can research and source qualified prospects." />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="How did you find ProFox?"><input value={referralSource} onChange={e => setReferralSource(e.target.value)} className={inputClass} /></Field>
                    <Field label="Anything else we should know?"><input value={message} onChange={e => setMessage(e.target.value)} className={inputClass} /></Field>
                  </div>
                </FormSection>

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-xs leading-5 text-slate-700">
                  <Check checked={consentAccurate} setChecked={setConsentAccurate} label="The information in this application is accurate to the best of my knowledge." />
                  <Check checked={consentCommission} setChecked={setConsentCommission} label="I understand this is a commission-only independent contractor opportunity with no fixed salary." />
                  <Check checked={consentReview} setChecked={setConsentReview} label="I agree that ProFox may review my application and introduction video for recruitment." />
                  <Check checked={consentPrivacy} setChecked={setConsentPrivacy} label={<span>I agree to the handling of my submitted information for recruitment and have reviewed the <Link className="font-black text-[#000080] underline" to="/privacy-policy" target="_blank">Privacy Policy</Link>.</span>} />
                </div>

                <button disabled={submitting} type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF0E0E] px-6 py-3.5 text-sm font-black text-white transition hover:brightness-95 disabled:opacity-50">
                  {submitting ? 'Submitting…' : 'Submit application'} <Send className="h-4 w-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100';

function Eyebrow({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return <div className={`text-[11px] font-black uppercase tracking-[0.2em] ${light ? 'text-red-300' : 'text-[#FF0E0E]'}`}>{children}</div>;
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5"><Icon className="mt-0.5 h-5 w-5 text-[#000080]" /><div><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-sm font-black text-slate-800">{value}</div></div></div>;
}

function ListBlock({ eyebrow, title, items, icon: Icon }: { eyebrow: string; title: string; items: string[]; icon: any }) {
  return <div><Eyebrow>{eyebrow}</Eyebrow><div className="mt-3 flex items-center gap-3"><Icon className="h-6 w-6 text-[#000080]" /><h2 className="text-2xl font-black text-[#000080] sm:text-3xl">{title}</h2></div><div className="mt-6 space-y-3">{items.map((item, index) => <div key={`${item}-${index}`} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#FF0E0E]" /><p className="text-sm leading-6 text-slate-600">{item}</p></div>)}</div></div>;
}

function FormSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section><h3 className="text-base font-black text-[#000080]">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p><div className="mt-4">{children}</div></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-black text-slate-600"><span>{label}</span><div className="mt-2">{children}</div></label>;
}

function Toggle({ checked, setChecked, label }: { checked: boolean; setChecked: (value: boolean) => void; label: string }) {
  return <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="mt-1" /><span className="text-xs font-semibold leading-5 text-slate-700">{label}</span></label>;
}

function Check({ checked, setChecked, label }: { checked: boolean; setChecked: (value: boolean) => void; label: React.ReactNode }) {
  return <label className="flex cursor-pointer items-start gap-3"><input required type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="mt-1" /><span>{label}</span></label>;
}
