import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, LockKeyhole, Send, Sparkles } from 'lucide-react';
import { leadService } from '../lib/leadService';
import {
  contactLeadFormService,
  DEFAULT_PUBLIC_CONTACT_FORM,
  type LeadFormField,
  type PublicContactFormConfiguration,
} from '../lib/contactLeadFormService';

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
  return `w-full rounded-2xl border bg-slate-50 px-4 py-3.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:bg-white focus:ring-4 ${
    hasError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-100' : 'border-slate-200 focus:border-[#000080] focus:ring-[#000080]/5'
  }`;
}

export default function QualifiedContactForm() {
  const [config, setConfig] = useState<PublicContactFormConfiguration>(DEFAULT_PUBLIC_CONTACT_FORM);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [honeypot, setHoneypot] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
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

  const steps = useMemo(() => config.steps.filter(step =>
    config.fields.some(field => field.enabled && field.stepId === step.id && fieldVisible(field, answers))
  ), [config.steps, config.fields, answers]);
  const safeStepIndex = Math.min(stepIndex, Math.max(steps.length - 1, 0));
  const currentStep = steps[safeStepIndex] || config.steps[0];
  const currentFields = useMemo(() => config.fields
    .filter(field => field.enabled && field.stepId === currentStep?.id && fieldVisible(field, answers))
    .sort((a, b) => a.order - b.order), [config.fields, currentStep?.id, answers]);

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

  const validateFields = (fields: LeadFormField[]) => {
    const nextErrors: Record<string, string> = {};
    for (const field of fields) {
      if (!field.enabled || !fieldVisible(field, answers)) continue;
      const value = (answers[field.id] || '').trim();
      if (field.required && !value) {
        nextErrors[field.id] = `Please complete ${field.label.toLowerCase()}.`;
        continue;
      }
      if (!value) continue;
      if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) nextErrors[field.id] = 'Enter a valid email address.';
      if (field.type === 'url' && !/^https?:\/\/\S+$/i.test(value)) nextErrors[field.id] = 'Use a complete URL beginning with http:// or https://.';
      if (field.minLength && value.length < field.minLength) nextErrors[field.id] = `${field.label} needs a little more detail.`;
      if (field.maxLength && value.length > field.maxLength) nextErrors[field.id] = `${field.label} is too long.`;
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const nextStep = () => {
    if (!validateFields(currentFields)) return;
    setStepIndex(current => Math.min(current + 1, steps.length - 1));
    setSubmitError('');
    window.setTimeout(() => document.getElementById('project-enquiry-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 20);
  };

  const previousStep = () => {
    setFieldErrors({});
    setSubmitError('');
    setStepIndex(current => Math.max(0, current - 1));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateFields(currentFields)) return;
    const allVisibleFields = config.fields.filter(field => field.enabled && fieldVisible(field, answers));
    if (!validateFields(allVisibleFields)) {
      const firstInvalid = steps.findIndex(step => allVisibleFields.some(field => field.stepId === step.id && !(answers[field.id] || '').trim() && field.required));
      if (firstInvalid >= 0) setStepIndex(firstInvalid);
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    const result = await leadService.submitLead({ answers, attribution: collectAttribution(), honeypot });
    if (result.success) {
      setReference(result.reference || '');
      setSuccess(true);
      setAnswers({});
      setFieldErrors({});
      setStepIndex(0);
    } else {
      setSubmitError(result.error || 'We could not send your project enquiry. Please try again.');
    }
    setSubmitting(false);
  };

  if (!config.enabled) {
    return <div className="rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-xl"><h3 className="text-xl font-black text-slate-900">Project enquiries are temporarily paused.</h3><p className="mt-2 text-sm leading-6 text-slate-500">Please use the email or phone details on this page and our team will be happy to help.</p></div>;
  }

  if (success) {
    return (
      <div id="project-enquiry-form" className="rounded-[40px] border border-emerald-200 bg-white p-8 text-center shadow-2xl sm:p-12">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-8 w-8" /></div>
        <div className="mt-5 text-[10px] font-black uppercase tracking-[.2em] text-emerald-700">Enquiry received</div>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{config.experience.successTitle}</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">{config.experience.successMessage}</p>
        {reference && <div className="mx-auto mt-5 w-fit rounded-xl bg-slate-50 px-4 py-2 text-xs font-black text-slate-600">Reference: {reference}</div>}
        <button type="button" onClick={() => setSuccess(false)} className="mt-7 rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-black text-slate-700 hover:bg-slate-50">Send another enquiry</button>
      </div>
    );
  }

  const progress = steps.length ? ((safeStepIndex + 1) / steps.length) * 100 : 100;
  const finalStep = safeStepIndex === steps.length - 1;

  return (
    <div id="project-enquiry-form" className="relative overflow-hidden rounded-[40px] border border-slate-200 bg-white p-6 shadow-2xl sm:p-10 lg:p-12">
      <div className="absolute right-0 top-0 h-40 w-40 translate-x-1/3 -translate-y-1/3 rounded-full bg-[#000080]/5 blur-2xl" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-[#000080]"><Sparkles className="h-4 w-4" />{config.experience.eyebrow}</div>
          <div className="text-[10px] font-bold text-slate-400">{config.experience.estimatedTime}</div>
        </div>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{config.experience.title}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">{config.experience.subtitle}</p>

        <div className="mt-7">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[.14em] text-slate-400"><span>Step {safeStepIndex + 1} of {Math.max(steps.length, 1)}</span><span>{Math.round(progress)}%</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#000080] transition-all duration-300" style={{ width: `${progress}%` }} /></div>
        </div>

        {currentStep && <div className="mt-7 rounded-2xl bg-slate-50 px-4 py-3"><div className="text-sm font-black text-slate-900">{currentStep.title}</div>{currentStep.subtitle && <div className="mt-0.5 text-xs leading-5 text-slate-500">{currentStep.subtitle}</div>}</div>}

        <form onSubmit={submit} className="mt-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {currentFields.map(field => {
              const error = fieldErrors[field.id];
              const value = answers[field.id] || '';
              const full = field.width === 'full' || field.type === 'textarea' || field.type === 'single_select';
              return (
                <div key={field.id} className={full ? 'sm:col-span-2' : ''}>
                  <label className="mb-1.5 block text-xs font-black text-slate-700">{field.label}{field.required && <span className="ml-1 text-rose-500">*</span>}</label>
                  {field.type === 'textarea' ? (
                    <textarea rows={5} value={value} onChange={event => setAnswer(field.id, event.target.value)} placeholder={field.placeholder} maxLength={field.maxLength || 4000} className={`${inputClass(Boolean(error))} resize-y`} />
                  ) : field.type === 'single_select' && field.display === 'cards' ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {field.options.map(option => {
                        const selected = value === option.value;
                        return <button key={option.value} type="button" onClick={() => setAnswer(field.id, option.value)} className={`flex min-h-12 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-xs font-bold transition-all ${selected ? 'border-[#000080] bg-[#000080]/5 text-[#000080] ring-2 ring-[#000080]/10' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}><span>{option.label}</span><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-[#000080] bg-[#000080] text-white' : 'border-slate-300 text-transparent'}`}><Check className="h-3 w-3" /></span></button>;
                      })}
                    </div>
                  ) : field.type === 'single_select' ? (
                    <select value={value} onChange={event => setAnswer(field.id, event.target.value)} className={inputClass(Boolean(error))}><option value="">{field.placeholder || 'Choose an option'}</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                  ) : (
                    <input type={field.type} value={value} onChange={event => setAnswer(field.id, event.target.value)} placeholder={field.placeholder} maxLength={field.maxLength || 500} autoComplete={field.purpose === 'fullName' ? 'name' : field.purpose === 'email' ? 'email' : field.purpose === 'phone' ? 'tel' : field.purpose === 'companyName' ? 'organization' : undefined} className={inputClass(Boolean(error))} />
                  )}
                  {field.helpText && <p className="mt-1.5 text-[11px] leading-5 text-slate-400">{field.helpText}</p>}
                  {error && <p className="mt-1.5 text-[11px] font-bold text-rose-600">{error}</p>}
                </div>
              );
            })}
          </div>

          <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true"><label>Company fax<input tabIndex={-1} autoComplete="off" value={honeypot} onChange={event => setHoneypot(event.target.value)} /></label></div>

          {submitError && <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold leading-5 text-rose-700">{submitError}</div>}

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>{safeStepIndex > 0 && <button type="button" onClick={previousStep} disabled={submitting} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"><ArrowLeft className="h-4 w-4" />{config.experience.previousLabel}</button>}</div>
            {!finalStep ? (
              <button type="button" onClick={nextStep} disabled={loadingConfig} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#000080] px-6 text-xs font-black text-white shadow-lg shadow-blue-950/10 hover:bg-[#000066] disabled:opacity-60">{config.experience.nextLabel}<ArrowRight className="h-4 w-4" /></button>
            ) : (
              <button type="submit" disabled={submitting} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#000080] px-6 text-xs font-black text-white shadow-lg shadow-blue-950/10 hover:bg-[#000066] disabled:opacity-60">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{submitting ? 'Sending securely…' : config.experience.submitLabel}</button>
            )}
          </div>

          <div className="mt-5 flex items-start justify-center gap-2 text-center text-[10px] font-semibold leading-4 text-slate-400"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{config.experience.privacyText}</span></div>
        </form>
      </div>
    </div>
  );
}
