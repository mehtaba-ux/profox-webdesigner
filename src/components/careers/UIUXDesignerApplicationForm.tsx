import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, FileText, Loader2, LockKeyhole, Send, ShieldCheck, UploadCloud } from 'lucide-react';
import type { CareerApplicationFormConfig, CareerJob } from '../../lib/careerService';
import { applicantService } from '../../lib/applicantService';
import { talentPartnerService } from '../../lib/talentPartnerService';
import { supabase } from '../../lib/supabase';
import {
  getUIUXApplicationConfig,
  isUIUXFieldRequired,
  isUIUXFieldVisible,
  UIUX_FIELD_MAP,
  type UIUXFieldDefinition,
} from '../../lib/uiuxApplicationFormConfig';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-[#071126] outline-none transition placeholder:text-slate-400 focus:border-[#000080] focus:ring-4 focus:ring-blue-100';
const textareaClass = `${inputClass} min-h-[118px] resize-y leading-6`;

type FormState = Record<string, string | string[] | boolean>;
type ErrorState = Record<string, string>;

const initialState = (): FormState => ({
  fullName:'', email:'', phone:'', country:'', timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', linkedinUrl:'', currentRole:'',
  yearsExperience:'', designWorkTypes:[], strongestCapability:'',
  portfolioUrl:'', strongestCaseStudy:'', caseStudyContribution:'', caseStudyOutcome:'', portfolioSharingConsent:false,
  figmaConfidence:'', figmaCapabilities:[], figmaExperience:'', designSystemsExperience:'', uxProcess:'', responsiveExperience:'', interfaceStates:[], accessibilityConsiderations:[], accessibilityExperience:'', businessConversionThinking:'',
  handoffFrequency:'', handoffContents:[], developerHandoffExperience:'', clientFeedbackScenario:'', availableHoursPerWeek:'', preferredWorkWindow:'', earliestStartDate:'', canMaintainAvailability:false, comfortableWithMeetings:false, hasLaptopInternet:false, structuredReviewAcknowledgement:false, assessmentAcknowledgement:false, designAcademyAcknowledgement:false, projectBasedAcknowledgement:false,
  motivation:'', heardAboutSource:'ProFox website', heardAboutDetail:'', consentAccurate:false, consentPrivacy:false,
});

export default function UIUXDesignerApplicationForm({ job }: { job: CareerJob }) {
  const config = useMemo(() => getUIUXApplicationConfig((job.roleDetails || {}).applicationForm), [job.roleDetails]);
  const steps = useMemo(() => (config.steps || []).filter((step) => (step.fields || []).some((id) => isUIUXFieldVisible(id, config))), [config]);
  const sourceOptions = config.sourceOptions || [];
  const minimumWeeklyHours = Number(config.minimumWeeklyHours || 1);
  const [form, setForm] = useState<FormState>(() => ({ ...initialState(), heardAboutSource: sourceOptions.includes('ProFox website') ? 'ProFox website' : (sourceOptions[0] || '') }));
  const [currentStep, setCurrentStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [errors, setErrors] = useState<ErrorState>({});
  const [cv, setCv] = useState<File | null>(null);
  const [cvProgress, setCvProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState<{reference?:string;duplicate?:boolean}|null>(null);

  const step = steps[currentStep];
  const progress = steps.length ? Math.round(((currentStep + 1) / steps.length) * 100) : 100;
  const timezoneOptions = useMemo(() => {
    const supported = (Intl as any).supportedValuesOf?.('timeZone');
    if (Array.isArray(supported) && supported.length) return supported as string[];
    return [String(form.timezone || 'UTC')];
  }, []);

  const setValue = (id: string, value: string | string[] | boolean) => {
    setForm((current) => ({ ...current, [id]: value }));
    setErrors((current) => { const next = { ...current }; delete next[id]; return next; });
  };

  const fieldConfig = (id: string) => config.fieldConfig?.[id] || {};
  const labelFor = (id: string) => fieldConfig(id).label || UIUX_FIELD_MAP[id]?.label || id;

  const isDetailNeeded = (source = String(form.heardAboutSource || '')) => ['Referral','Job board','Social media','Other'].includes(source);

  const validateField = (id: string): string => {
    if (!isUIUXFieldVisible(id, config)) return '';
    if (id === 'heardAboutDetail' && !isDetailNeeded()) return '';
    const required = isUIUXFieldRequired(id, config);
    const value = id === 'cv' ? cv : form[id];
    const empty = id === 'cv' ? !cv : Array.isArray(value) ? value.length === 0 : typeof value === 'boolean' ? !value : !String(value ?? '').trim();
    if (required && empty) return `${labelFor(id)} is required.`;
    if (empty) return '';
    if (id === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) return 'Enter a valid email address.';
    if (['portfolioUrl','linkedinUrl'].includes(id) && !/^https?:\/\//i.test(String(value))) return 'Enter a full URL beginning with http:// or https://.';
    if (id === 'availableHoursPerWeek') {
      const hours = Number(value);
      if (!Number.isFinite(hours) || hours < minimumWeeklyHours || hours > 80) return `Enter between ${minimumWeeklyHours} and 80 hours per week.`;
    }
    if (id === 'earliestStartDate' && String(value) < new Date().toISOString().slice(0,10)) return 'Earliest start date cannot be in the past.';
    if (id === 'heardAboutSource' && sourceOptions.length && !sourceOptions.includes(String(value))) return 'Select one of the available sources.';
    return '';
  };

  const validateStep = (index: number) => {
    const target = steps[index];
    const nextErrors: ErrorState = {};
    (target?.fields || []).forEach((id) => {
      const message = validateField(id);
      if (message) nextErrors[id] = message;
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const allValid = () => steps.every((_, index) => {
    const target = steps[index];
    return (target?.fields || []).every((id) => !validateField(id));
  });

  const next = () => {
    if (!validateStep(currentStep)) return;
    const nextIndex = Math.min(currentStep + 1, steps.length - 1);
    setCurrentStep(nextIndex);
    setFurthestStep((current) => Math.max(current, nextIndex));
    window.setTimeout(() => document.getElementById('application-wizard')?.scrollIntoView({ behavior:'smooth', block:'start' }), 0);
  };

  const goToStep = (index: number) => {
    if (index > furthestStep && index > currentStep) return;
    setErrors({});
    setCurrentStep(index);
    window.setTimeout(() => document.getElementById('application-wizard')?.scrollIntoView({ behavior:'smooth', block:'start' }), 0);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateStep(currentStep) || !allValid() || !cv) {
      if (!allValid()) setSubmitError('Please complete all required fields before submitting.');
      return;
    }
    setBusy(true); setSubmitError(''); setCvProgress(0);
    try {
      const email = String(form.email || '').trim().toLowerCase();
      const upload = await applicantService.uploadPublicApplicationFile(email,'cv',cv,setCvProgress);
      const params = new URLSearchParams(window.location.search);
      const answers = Object.fromEntries(Object.entries(form).filter(([key]) => !['fullName','email','phone','country','timezone','linkedinUrl','currentRole','portfolioUrl','availableHoursPerWeek','preferredWorkWindow','earliestStartDate','heardAboutSource','heardAboutDetail','motivation','hasLaptopInternet','consentAccurate','consentPrivacy'].includes(key)));
      const payload = {
        ...form,
        fullName:String(form.fullName || '').trim(), email, phone:String(form.phone || '').trim(), country:String(form.country || '').trim(), timezone:String(form.timezone || 'UTC'),
        linkedinUrl:String(form.linkedinUrl || '').trim(), currentRole:String(form.currentRole || '').trim(), portfolioUrl:String(form.portfolioUrl || '').trim(),
        availableHoursPerWeek:Number(form.availableHoursPerWeek || 0), preferredWorkWindow:String(form.preferredWorkWindow || '').trim(), earliestStartDate:String(form.earliestStartDate || ''),
        heardAboutSource:String(form.heardAboutSource || ''), heardAboutDetail:String(form.heardAboutDetail || ''), motivation:String(form.motivation || '').trim(),
        cvStoragePath:upload.path, source:String(form.heardAboutSource || 'ProFox Website'), answers,
        utmSource:params.get('utm_source') || '', utmMedium:params.get('utm_medium') || '', utmCampaign:params.get('utm_campaign') || '',
        utmContent:params.get('utm_content') || '', utmTerm:params.get('utm_term') || '', landingPage:window.location.pathname, referrerUrl:document.referrer || '',
      };
      const { data, error: rpcError } = await supabase.rpc('submit_public_uiux_application',{p_job_slug:job.slug,p_application:payload});
      if (rpcError) throw rpcError;
      if (!data?.success) throw new Error(data?.error || 'Application could not be submitted.');
      if (data.reference) await talentPartnerService.claimApplication(data.reference, email);
      setSubmitted({reference:data.reference,duplicate:Boolean(data.duplicate)});
    } catch (err:any) {
      setSubmitError(err?.message || 'We could not submit your application. Please review the fields and try again.');
    } finally { setBusy(false); }
  };

  if (submitted) return (
    <section id="apply" className="border-y border-blue-100 bg-[#f7f8fc] py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#000080] text-white"><CheckCircle2 className="h-6 w-6" /></div>
        <h2 className="mt-5 text-3xl font-semibold tracking-[-0.035em] text-[#071126]">{submitted.duplicate ? 'Your application is already active' : 'Application received'}</h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-600">{submitted.duplicate ? 'We found an existing active application for this UI/UX Designer role. Please use the newest ProFox recruitment communication for any next step.' : 'Thank you. Your application is now in the protected ProFox recruitment workflow. Portfolio review is the next controlled step.'}</p>
        {submitted.reference && <div className="mx-auto mt-5 w-fit rounded-lg border border-blue-100 bg-white px-4 py-2 text-xs font-semibold text-[#000080]">Reference · {submitted.reference}</div>}
      </div>
    </section>
  );

  return (
    <section id="apply" className="scroll-mt-24 border-t border-slate-200 bg-[#f7f8fc] py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[340px_1fr] lg:items-start">
          <aside className="lg:sticky lg:top-24">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#FF0E0E]">{config.intro?.eyebrow}</div>
            <h2 className="mt-4 text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-[#071126] sm:text-4xl">{config.intro?.title}</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">{config.intro?.description}</p>
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-6 text-slate-600">
              <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]"/><span>{config.intro?.notice}</span></div>
            </div>
            <div className="mt-5 flex items-center gap-2 text-[11px] text-slate-500"><LockKeyhole className="h-3.5 w-3.5 text-[#000080]" /> Your application is handled inside the protected recruitment workflow.</div>
          </aside>

          <div id="application-wizard" className="scroll-mt-24 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_60px_rgba(7,17,38,0.08)]">
            <div className="border-b border-slate-200 px-5 py-5 sm:px-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Step {currentStep + 1} of {steps.length}</div>
                  <div className="mt-1 text-lg font-semibold text-[#071126]">{step?.title}</div>
                </div>
                <div className="text-xs font-semibold text-[#000080]">{progress}%</div>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#000080] transition-all duration-300" style={{width:`${progress}%`}} /></div>
              <div className="mt-5 hidden grid-cols-6 gap-2 lg:grid">
                {steps.map((item,index) => {
                  const accessible = index <= furthestStep || index < currentStep;
                  return <button key={item.id} type="button" disabled={!accessible} onClick={()=>goToStep(index)} className={`rounded-xl px-2 py-2 text-left text-[10px] font-semibold transition ${index===currentStep?'bg-[#000080] text-white':index<currentStep?'bg-blue-50 text-[#000080]':'bg-slate-50 text-slate-400'} disabled:cursor-default`}><span className="mr-1">{String(index+1).padStart(2,'0')}</span>{item.title}</button>;
                })}
              </div>
            </div>

            <form onSubmit={submit}>
              <div className="px-5 py-7 sm:px-7 sm:py-8">
                <p className="mb-7 max-w-2xl text-sm leading-6 text-slate-500">{step?.description}</p>
                {submitError && <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{submitError}</div>}

                {step?.id === 'review' && <ReviewSummary steps={steps} config={config} form={form} labelFor={labelFor} onEdit={goToStep} />}

                <div className="grid gap-5 sm:grid-cols-2">
                  {(step?.fields || []).filter((id)=>isUIUXFieldVisible(id,config)).map((id) => (
                    <FieldRenderer key={id} id={id} definition={UIUX_FIELD_MAP[id]} config={config} value={form[id]} error={errors[id]} cv={cv} cvProgress={cvProgress} busy={busy} timezoneOptions={timezoneOptions} minimumWeeklyHours={minimumWeeklyHours} sourceOptions={sourceOptions} detailNeeded={isDetailNeeded()} onChange={setValue} onCvChange={setCv} />
                  ))}
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-[#fbfcff] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                <button type="button" disabled={currentStep===0 || busy} onClick={()=>goToStep(Math.max(0,currentStep-1))} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-[#071126] disabled:cursor-not-allowed disabled:opacity-40"><ArrowLeft className="h-4 w-4"/> Back</button>
                {currentStep < steps.length - 1 ? (
                  <button type="button" onClick={next} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#000066]">Continue <ArrowRight className="h-4 w-4"/></button>
                ) : (
                  <button type="submit" disabled={busy} className="inline-flex min-w-[190px] items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#000066] disabled:cursor-not-allowed disabled:opacity-60">{busy?<><Loader2 className="h-4 w-4 animate-spin"/>Submitting...</>:<>Submit application <Send className="h-4 w-4"/></>}</button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

function FieldRenderer({ id, definition, config, value, error, cv, cvProgress, busy, timezoneOptions, minimumWeeklyHours, sourceOptions, detailNeeded, onChange, onCvChange }:{
  id:string; definition:UIUXFieldDefinition; config:CareerApplicationFormConfig; value:string|string[]|boolean; error?:string; cv:File|null; cvProgress:number; busy:boolean; timezoneOptions:string[]; minimumWeeklyHours:number; sourceOptions:string[]; detailNeeded:boolean; onChange:(id:string,value:string|string[]|boolean)=>void; onCvChange:(file:File|null)=>void;
}) {
  if (!definition) return null;
  if (id==='heardAboutDetail' && !detailNeeded) return null;
  const field = config.fieldConfig?.[id] || {};
  const label = field.label || definition.label;
  const help = field.help || definition.help;
  const placeholder = field.placeholder || definition.placeholder;
  const required = isUIUXFieldRequired(id, config);
  const options = id==='heardAboutSource' ? sourceOptions : (field.options?.length ? field.options : definition.options || []);
  const fullWidth = ['textarea','multiselect','checkbox','file'].includes(definition.kind);
  const classes = `${fullWidth ? 'sm:col-span-2' : ''}`;
  const controlClass = `${inputClass} ${error ? 'border-red-300 focus:border-red-500 focus:ring-red-100' : ''}`;

  if (definition.kind === 'checkbox') return (
    <div className={classes}>
      <button type="button" role="checkbox" aria-checked={Boolean(value)} onClick={()=>onChange(id,!Boolean(value))} className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${value?'border-blue-200 bg-blue-50/60':'border-slate-200 bg-white hover:border-slate-300'} ${error?'border-red-300':''}`}>
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${value?'border-[#000080] bg-[#000080] text-white':'border-slate-300 bg-white'}`}>{value&&<Check className="h-3.5 w-3.5"/>}</span>
        <span className="text-xs leading-6 text-slate-700">{label}{required && <span className="ml-1 text-[#FF0E0E]">*</span>}</span>
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );

  if (definition.kind === 'multiselect') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <FieldShell classes={classes} label={label} required={required} help={help} error={error}>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const active = selected.includes(option);
            return <button key={option} type="button" aria-pressed={active} onClick={()=>onChange(id, active ? selected.filter((item)=>item!==option) : [...selected,option])} className={`rounded-full border px-3 py-2 text-xs font-medium transition ${active?'border-[#000080] bg-[#000080] text-white':'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-[#000080]'}`}>{active&&<Check className="mr-1 inline h-3 w-3"/>}{option}</button>;
          })}
        </div>
      </FieldShell>
    );
  }

  if (definition.kind === 'file') return (
    <FieldShell classes={classes} label={label} required={required} help={help} error={error}>
      <label className={`block cursor-pointer rounded-2xl border border-dashed p-5 transition hover:border-blue-300 hover:bg-blue-50/30 ${error?'border-red-300':'border-slate-300'}`}>
        <div className="flex items-start gap-3"><UploadCloud className="mt-0.5 h-5 w-5 text-[#000080]"/><div><div className="text-sm font-semibold text-[#071126]">Choose CV / résumé</div><div className="mt-1 text-xs text-slate-500">PDF, DOC or DOCX · max 8 MB. Uploaded to protected recruitment storage.</div></div></div>
        <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="mt-4 block w-full text-xs text-slate-600" onChange={(e)=>onCvChange(e.target.files?.[0] || null)} />
        {cv && <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#000080]"><FileText className="h-4 w-4"/>{cv.name}{cvProgress>0&&busy?` · ${cvProgress}%`:''}</div>}
      </label>
    </FieldShell>
  );

  if (id === 'timezone') return (
    <FieldShell classes={classes} label={label} required={required} help={help} error={error}>
      <select className={controlClass} value={String(value || '')} onChange={(e)=>onChange(id,e.target.value)}>{timezoneOptions.map((option)=><option key={option} value={option}>{option}</option>)}</select>
    </FieldShell>
  );

  if (definition.kind === 'select') return (
    <FieldShell classes={classes} label={label} required={required} help={help} error={error}>
      <select className={controlClass} value={String(value || '')} onChange={(e)=>onChange(id,e.target.value)}><option value="">Select an option</option>{options.map((option)=><option key={option} value={option}>{option}</option>)}</select>
    </FieldShell>
  );

  if (definition.kind === 'textarea') return (
    <FieldShell classes={classes} label={label} required={required} help={help} error={error}>
      <textarea rows={4} maxLength={id==='clientFeedbackScenario'?600:undefined} className={`${textareaClass} ${error?'border-red-300 focus:border-red-500 focus:ring-red-100':''}`} value={String(value || '')} placeholder={placeholder} onChange={(e)=>onChange(id,e.target.value)} />
      {id==='clientFeedbackScenario' && <div className="mt-1 text-right text-[10px] text-slate-400">{String(value||'').length}/600</div>}
    </FieldShell>
  );

  const type = definition.kind === 'email' ? 'email' : definition.kind === 'url' ? 'url' : definition.kind === 'number' ? 'number' : definition.kind === 'date' ? 'date' : 'text';
  return (
    <FieldShell classes={classes} label={label} required={required} help={help} error={error}>
      <input type={type} min={id==='availableHoursPerWeek'?minimumWeeklyHours:undefined} max={id==='availableHoursPerWeek'?80:undefined} className={controlClass} value={String(value || '')} placeholder={placeholder} onChange={(e)=>onChange(id,e.target.value)} />
    </FieldShell>
  );
}

function FieldShell({ classes='', label, required, help, error, children }:{classes?:string;label:string;required:boolean;help?:string;error?:string;children:React.ReactNode}) {
  return <label className={`block ${classes}`}><div className="mb-2 text-xs font-semibold text-[#071126]">{label}{required&&<span className="ml-1 text-[#FF0E0E]">*</span>}</div>{help&&<div className="mb-2 text-[11px] leading-5 text-slate-500">{help}</div>}{children}{error&&<ErrorText>{error}</ErrorText>}</label>;
}

function ErrorText({children}:{children:React.ReactNode}) { return <div className="mt-1.5 text-[11px] font-medium text-red-600">{children}</div>; }

function ReviewSummary({ steps, config, form, labelFor, onEdit }:{steps:any[];config:CareerApplicationFormConfig;form:FormState;labelFor:(id:string)=>string;onEdit:(index:number)=>void}) {
  const reviewIndex = steps.findIndex((step)=>step.id==='review');
  return (
    <div className="mb-8 space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#000080]"><CheckCircle2 className="h-4 w-4"/>Review what you entered</div>
      <div className="grid gap-3 sm:grid-cols-2">
        {steps.slice(0,Math.max(0,reviewIndex)).map((step,index)=>{
          const items = (step.fields || []).filter((id:string)=>isUIUXFieldVisible(id,config)).slice(0,3).map((id:string)=>{
            const value = form[id];
            const display = Array.isArray(value) ? value.join(', ') : typeof value==='boolean' ? (value?'Confirmed':'Not confirmed') : String(value || '—');
            return <div key={id} className="truncate text-[11px] text-slate-500"><span className="font-semibold text-slate-700">{labelFor(id)}:</span> {display}</div>;
          });
          return <div key={step.id} className="rounded-2xl border border-slate-200 bg-[#fbfcff] p-4"><div className="flex items-center justify-between gap-3"><div className="text-xs font-semibold text-[#071126]">{step.title}</div><button type="button" onClick={()=>onEdit(index)} className="text-[11px] font-semibold text-[#000080] hover:underline">Edit</button></div><div className="mt-3 space-y-1.5">{items}</div></div>;
        })}
      </div>
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-[11px] leading-5 text-slate-600">Review the sections above, then complete the final details below. You can go back without losing the information already entered.</div>
    </div>
  );
}
