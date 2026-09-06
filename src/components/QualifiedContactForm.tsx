import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, LockKeyhole, Send, BadgeCheck } from 'lucide-react';
import { leadService } from '../lib/leadService';
import { useCMS } from '../lib/CMSProvider';
import {
  contactLeadFormService,
  DEFAULT_PUBLIC_CONTACT_FORM,
  type LeadFormField,
  type PublicContactFormConfiguration,
} from '../lib/contactLeadFormService';

type PresentationStep = {
  id: string;
  title: string;
  subtitle?: string;
  fieldIds: string[];
};

function fieldVisible(field: LeadFormField, answers: Record<string, string>) {
  const condition = field.condition;
  if (!condition?.fieldId) return true;
  const actual = answers[condition.fieldId] || '';
  if (condition.operator === 'not_equals') return actual !== condition.value;
  if (condition.operator === 'contains') return actual.includes(condition.value);
  return actual === condition.value;
}

function collectAttribution(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const value = (key: string) => params.get(key) || '';
  return {
    utmSource: value('utm_source'),
    utmMedium: value('utm_medium'),
    utmCampaign: value('utm_campaign'),
    utmContent: value('utm_content'),
    utmTerm: value('utm_term'),
    gclid: value('gclid'),
    fbclid: value('fbclid'),
    landingPage: window.location.href,
    referrer: document.referrer || '',
  };
}

function inputClass(hasError: boolean) {
  return `w-full rounded-xl border bg-slate-50/80 px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all placeholder:font-normal placeholder:text-slate-400 focus:bg-white focus:ring-4 ${
    hasError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-100' : 'border-slate-200 focus:border-[#000080] focus:ring-[#000080]/5'
  }`;
}

export default function QualifiedContactForm() {
  const { content } = useCMS();
  const buttonRadius = content.theme?.buttonRadius || 'rounded-lg';
  const [config, setConfig] = useState<PublicContactFormConfiguration>(DEFAULT_PUBLIC_CONTACT_FORM);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [honeypot, setHoneypot] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [success, setSuccess] = useState(false);
  const [reference, setReference] = useState('');

  useEffect(() => {
    let active = true;
    contactLeadFormService.getPublicConfiguration()
      .then(next => { if (active) setConfig(next); })
      .catch(error => console.error('Contact form configuration could not be loaded; using safe defaults.', error))
      .finally(() => { if (active) setLoadingConfig(false); });
    return () => { active = false; };
  }, []);

  const visibleFields = useMemo(() => {
    const stepOrder = new Map(config.steps.map((step, index) => [step.id, index]));
    return config.fields
      .filter(field => field.enabled && fieldVisible(field, answers))
      .sort((a, b) => {
        const aStep = stepOrder.get(a.stepId) ?? 999;
        const bStep = stepOrder.get(b.stepId) ?? 999;
        return aStep === bStep ? a.order - b.order : aStep - bStep;
      });
  }, [config.steps, config.fields, answers]);

  const configuredSteps = useMemo<PresentationStep[]>(() => config.steps
    .map(step => ({
      id: step.id,
      title: step.title,
      subtitle: step.subtitle,
      fieldIds: visibleFields.filter(field => field.stepId === step.id).map(field => field.id),
    }))
    .filter(step => step.fieldIds.length > 0), [config.steps, visibleFields]);

  const steps = useMemo<PresentationStep[]>(() => {
    if (configuredSteps.length !== 2) return configuredSteps;

    const firstConfiguredStepId = configuredSteps[0]?.id;
    const secondConfiguredStepId = configuredSteps[1]?.id;
    const groups: PresentationStep[] = [
      {
        id: 'presentation-about',
        title: configuredSteps[0]?.title || 'About you & your project',
        subtitle: configuredSteps[0]?.subtitle || 'Start with the essentials so we know who we are helping.',
        fieldIds: [],
      },
      {
        id: 'presentation-fit',
        title: configuredSteps[1]?.title || 'Goals, budget & timing',
        subtitle: configuredSteps[1]?.subtitle || 'This helps us recommend the right scope and next step.',
        fieldIds: [],
      },
      {
        id: 'presentation-details',
        title: 'Project details & next step',
        subtitle: 'A final few details help us prepare the right follow-up for you.',
        fieldIds: [],
      },
    ];

    const stageOnePurposes = new Set(['fullName', 'email', 'companyName', 'website', 'serviceInterest']);
    const stageTwoPurposes = new Set(['businessGoal', 'budgetRange', 'timeline']);
    const stageThreePurposes = new Set(['decisionRole', 'projectDetails', 'phone']);
    const assigned = new Set<string>();

    for (const field of visibleFields) {
      if (field.purpose && stageOnePurposes.has(field.purpose)) {
        groups[0].fieldIds.push(field.id);
        assigned.add(field.id);
      } else if (field.purpose && stageTwoPurposes.has(field.purpose)) {
        groups[1].fieldIds.push(field.id);
        assigned.add(field.id);
      } else if (field.purpose && stageThreePurposes.has(field.purpose)) {
        groups[2].fieldIds.push(field.id);
        assigned.add(field.id);
      }
    }

    for (const field of visibleFields) {
      if (assigned.has(field.id)) continue;
      if (field.stepId === firstConfiguredStepId) groups[0].fieldIds.push(field.id);
      else if (field.stepId === secondConfiguredStepId) groups[2].fieldIds.push(field.id);
      else {
        const target = groups.reduce((best, group) => group.fieldIds.length < best.fieldIds.length ? group : best, groups[0]);
        target.fieldIds.push(field.id);
      }
    }

    return groups.filter(step => step.fieldIds.length > 0);
  }, [configuredSteps, visibleFields]);

  const safeStepIndex = Math.min(stepIndex, Math.max(steps.length - 1, 0));
  const currentStep = steps[safeStepIndex] || steps[0];
  const currentFieldIds = useMemo(() => new Set(currentStep?.fieldIds || []), [currentStep]);
  const currentFields = useMemo(() => visibleFields.filter(field => currentFieldIds.has(field.id)), [visibleFields, currentFieldIds]);

  useEffect(() => {
    if (stepIndex !== safeStepIndex) setStepIndex(safeStepIndex);
  }, [stepIndex, safeStepIndex]);

  const setAnswer = (fieldId: string, value: string) => {
    setAnswers(current => ({ ...current, [fieldId]: value }));
    setFieldErrors(current => {
      if (!current[fieldId]) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
    setSubmitError('');
  };

  const getFieldError = (field: LeadFormField) => {
    if (!field.enabled || !fieldVisible(field, answers)) return '';
    const value = (answers[field.id] || '').trim();
    if (field.required && !value) return `Please complete ${field.label.toLowerCase()}.`;
    if (!value) return '';
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address.';
    if (field.type === 'url' && !/^https?:\/\/\S+$/i.test(value)) return 'Use a complete URL beginning with http:// or https://.';
    if (field.minLength && value.length < field.minLength) return `${field.label} needs a little more detail.`;
    if (field.maxLength && value.length > field.maxLength) return `${field.label} is too long.`;
    return '';
  };

  const validateFields = (fields: LeadFormField[]) => {
    const nextErrors: Record<string, string> = {};
    for (const field of fields) {
      const error = getFieldError(field);
      if (error) nextErrors[field.id] = error;
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const keepFormInViewOnSmallScreens = () => {
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 1023px)').matches) return;
    window.setTimeout(() => document.getElementById('project-enquiry-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 20);
  };

  const nextStep = () => {
    if (!validateFields(currentFields)) return;
    setStepIndex(current => Math.min(current + 1, steps.length - 1));
    setSubmitError('');
    keepFormInViewOnSmallScreens();
  };

  const previousStep = () => {
    setFieldErrors({});
    setSubmitError('');
    setStepIndex(current => Math.max(0, current - 1));
    keepFormInViewOnSmallScreens();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!privacyAccepted) {
      setSubmitError('Please accept the Privacy Policy and Terms before submitting your enquiry.');
      return;
    }
    if (!validateFields(currentFields)) return;
    const allVisibleFields = config.fields.filter(field => field.enabled && fieldVisible(field, answers));
    if (!validateFields(allVisibleFields)) {
      const invalidFieldIds = new Set(allVisibleFields.filter(field => Boolean(getFieldError(field))).map(field => field.id));
      const firstInvalid = steps.findIndex(step => step.fieldIds.some(fieldId => invalidFieldIds.has(fieldId)));
      if (firstInvalid >= 0) {
        setStepIndex(firstInvalid);
        keepFormInViewOnSmallScreens();
      }
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    const result = await leadService.submitLead({ answers, attribution: collectAttribution(), honeypot, privacyAccepted });
    if (result.success) {
      setReference(result.reference || '');
      setSuccess(true);
      setAnswers({});
      setFieldErrors({});
      setStepIndex(0);
      setPrivacyAccepted(false);
    } else {
      setSubmitError(result.error || 'We could not send your project enquiry. Please try again.');
    }
    setSubmitting(false);
  };

  if (!config.enabled) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-[0_16px_45px_rgba(15,23,42,0.06)]"><h3 className="pf-card-title text-slate-950">Project enquiries are temporarily paused.</h3><p className="mt-2 text-sm leading-6 text-slate-500">Please use the email or phone details on this page and our team will be happy to help.</p></div>;
  }

  if (success) {
    return (
      <div id="project-enquiry-form" className="rounded-3xl border border-emerald-200 bg-white p-7 text-center shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-7 w-7" /></div>
        <div className="pf-eyebrow mt-4 text-emerald-700">Enquiry received</div>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{config.experience.successTitle}</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">{config.experience.successMessage}</p>
        {reference && <div className="mx-auto mt-5 w-fit rounded-xl bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">Reference: {reference}</div>}
        <button type="button" onClick={() => setSuccess(false)} className={`mt-6 border border-slate-200 bg-white px-5 py-3 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 ${buttonRadius}`}>Send another enquiry</button>
      </div>
    );
  }

  const progress = steps.length ? ((safeStepIndex + 1) / steps.length) * 100 : 100;
  const finalStep = safeStepIndex === steps.length - 1;

  return (
    <div id="project-enquiry-form" className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-7 lg:p-8">
      <div className="absolute right-0 top-0 h-36 w-36 translate-x-1/3 -translate-y-1/3 rounded-full bg-[var(--brand-primary)]/[0.05] blur-2xl" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="pf-eyebrow inline-flex items-center gap-2 text-[var(--brand-primary)]"><BadgeCheck className="h-4 w-4" />{config.experience.eyebrow}</div>
          <div className="text-xs font-semibold text-slate-400">{config.experience.estimatedTime}</div>
        </div>
        <h2 className="mt-2.5 text-2xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-3xl">{config.experience.title}</h2>
        <p className="mt-1.5 max-w-xl text-xs leading-5 text-slate-500 sm:text-sm">{config.experience.subtitle}</p>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-bold tracking-[.06em] text-slate-400"><span>Step {safeStepIndex + 1} of {Math.max(steps.length, 1)}</span><span>{Math.round(progress)}%</span></div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[var(--brand-primary)] transition-all duration-300" style={{ width: `${progress}%` }} /></div>
        </div>

        {currentStep && (
          <div className="mt-4 rounded-2xl border border-slate-100 bg-[var(--brand-surface)]/70 px-4 py-2.5">
            <div className="pf-card-title text-slate-950">{currentStep.title}</div>
            {currentStep.subtitle && <div className="mt-0.5 text-xs leading-4 text-slate-500">{currentStep.subtitle}</div>}
          </div>
        )}

        <motion.div
          key={currentStep?.id || safeStepIndex}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          <form onSubmit={submit} className="mt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {currentFields.map(field => {
                const error = fieldErrors[field.id];
                const value = answers[field.id] || '';
                const full = field.width === 'full' || field.type === 'textarea' || field.type === 'single_select';
                const choiceGridClass = field.options.length >= 5
                  ? 'grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
                  : 'grid gap-1.5 sm:grid-cols-2';
                return (
                  <div key={field.id} className={full ? 'sm:col-span-2' : ''}>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">{field.label}{field.required && <span className="ml-1 text-rose-500">*</span>}</label>
                    {field.type === 'textarea' ? (
                      <textarea rows={3} value={value} onChange={event => setAnswer(field.id, event.target.value)} placeholder={field.placeholder} maxLength={field.maxLength || 4000} className={`${inputClass(Boolean(error))} resize-y lg:resize-none`} />
                    ) : field.type === 'single_select' && field.display === 'cards' ? (
                      <div className={choiceGridClass}>
                        {field.options.map(option => {
                          const selected = value === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setAnswer(field.id, option.value)}
                              className={`flex min-h-10 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-[11px] font-semibold leading-4 transition-all ${selected ? 'border-[#000080] bg-[#000080]/5 text-[#000080] ring-2 ring-[#000080]/10' : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm'}`}
                            >
                              <span>{option.label}</span>
                              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-[#000080] bg-[#000080] text-white' : 'border-slate-300 text-transparent'}`}><Check className="h-2.5 w-2.5" /></span>
                            </button>
                          );
                        })}
                      </div>
                    ) : field.type === 'single_select' ? (
                      <select value={value} onChange={event => setAnswer(field.id, event.target.value)} className={inputClass(Boolean(error))}><option value="">{field.placeholder || 'Choose an option'}</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                    ) : (
                      <input type={field.type} value={value} onChange={event => setAnswer(field.id, event.target.value)} placeholder={field.placeholder} maxLength={field.maxLength || 500} autoComplete={field.purpose === 'fullName' ? 'name' : field.purpose === 'email' ? 'email' : field.purpose === 'phone' ? 'tel' : field.purpose === 'companyName' ? 'organization' : undefined} className={inputClass(Boolean(error))} />
                    )}
                    {field.helpText && <p className="mt-1 text-[10px] leading-4 text-slate-400">{field.helpText}</p>}
                    {error && <p className="mt-1 text-[10px] font-semibold leading-4 text-rose-600">{error}</p>}
                  </div>
                );
              })}
            </div>

            <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true"><label>Company fax<input tabIndex={-1} autoComplete="off" value={honeypot} onChange={event => setHoneypot(event.target.value)} /></label></div>

            {submitError && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold leading-5 text-rose-700">{submitError}</div>}

            {finalStep && <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[11px] font-medium leading-5 text-slate-600"><input type="checkbox" checked={privacyAccepted} onChange={event => { setPrivacyAccepted(event.target.checked); setSubmitError(''); }} className="mt-1 h-4 w-4 shrink-0 accent-[#000080]" /><span>I agree to the <a href="/privacy-policy" target="_blank" rel="noreferrer" className="font-bold text-[#000080] underline">Privacy Policy</a> and <a href="/terms-and-conditions" target="_blank" rel="noreferrer" className="font-bold text-[#000080] underline">Terms</a> so ProFox can process and respond to this enquiry.</span></label>}

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>{safeStepIndex > 0 && <button type="button" onClick={previousStep} disabled={submitting} className={`inline-flex min-h-10 items-center gap-2 border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 ${buttonRadius}`}><ArrowLeft className="h-4 w-4" />{config.experience.previousLabel}</button>}</div>
              {!finalStep ? (
                <button type="button" onClick={nextStep} disabled={loadingConfig} className={`inline-flex min-h-10 items-center justify-center gap-2 bg-[var(--brand-primary)] px-5 text-xs font-bold text-white shadow-[0_12px_30px_rgba(0,0,128,0.16)] transition-all hover:-translate-y-0.5 hover:bg-[var(--brand-primary-hover)] hover:shadow-[0_16px_36px_rgba(0,0,128,0.2)] disabled:opacity-60 ${buttonRadius}`}>{config.experience.nextLabel}<ArrowRight className="h-4 w-4" /></button>
              ) : (
                <button type="submit" disabled={submitting || !privacyAccepted} className={`inline-flex min-h-10 items-center justify-center gap-2 bg-[var(--brand-primary)] px-5 text-xs font-bold text-white shadow-[0_12px_30px_rgba(0,0,128,0.16)] transition-all hover:-translate-y-0.5 hover:bg-[var(--brand-primary-hover)] hover:shadow-[0_16px_36px_rgba(0,0,128,0.2)] disabled:cursor-not-allowed disabled:opacity-60 ${buttonRadius}`}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{submitting ? 'Sending securely…' : config.experience.submitLabel}</button>
              )}
            </div>

            <div className="mt-3 flex items-start justify-center gap-2 text-center text-[10px] font-medium leading-4 text-slate-400"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{config.experience.privacyText}</span></div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
