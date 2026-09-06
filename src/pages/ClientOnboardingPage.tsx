import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Loader2,
  LockKeyhole,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type Field = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'url' | 'select';
  required?: boolean;
  section?: string;
  placeholder?: string;
  options?: string[];
};

type ScopeItem = {
  id?: string;
  productCode?: string;
  productName?: string;
  description?: string;
  quantity?: number;
  itemType?: string;
  sectionKey?: string;
  configuration?: Record<string, unknown>;
  inclusions?: string[];
};

type OnboardingStep = {
  id: string;
  shortTitle: string;
  title: string;
  description: string;
  fields: Field[];
};

const STEP_META = [
  {
    id: 'business',
    shortTitle: 'Business',
    title: 'Business & project goals',
    description: 'Give us the context that guides every delivery decision.'
  },
  {
    id: 'experience',
    shortTitle: 'Experience',
    title: 'Brand, content & conversion',
    description: 'Tell us how the experience should look, sound and convert.'
  },
  {
    id: 'requirements',
    shortTitle: 'Requirements',
    title: 'Features & service requirements',
    description: 'Capture only the functional requirements tied to your purchased scope.'
  },
  {
    id: 'launch',
    shortTitle: 'Launch',
    title: 'Access, communication & handover',
    description: 'Confirm the practical details our team needs to deliver and hand over safely.'
  }
] as const;

const SECTION_STEP_INDEX: Record<string, number> = {
  'Business Details': 0,
  'Project Direction': 0,
  'Strategy & Research': 0,
  'Brand & Design': 1,
  'Pages & Content': 1,
  'Copywriting': 1,
  'Conversion & Leads': 1,
  'Search & Analytics': 1,
  'Custom System': 2,
  'Application Requirements': 2,
  'E-commerce': 2,
  'Integrations & Systems': 2,
  'Automation': 2,
  'Email Marketing': 2,
  'Access & Technical': 3,
  'Care & Support': 3,
  'Communication': 3
};

const CORE_FIELD_ORDER: Record<string, number> = {
  companyName: 0,
  website: 1,
  phone: 2,
  country: 3,
  projectGoals: 4,
  primaryOffer: 5,
  targetAudience: 6,
  competitors: 7,
  decisionMaker: 100,
  communicationPreference: 101,
  timezone: 102,
  generalDeliveryNotes: 103
};

function errorMessage(error: any, fallback: string) {
  return error?.message || fallback;
}

function isFilled(value: unknown) {
  return String(value ?? '').trim().length > 0;
}

function fieldStepIndex(field: Field) {
  const section = field.section || 'Project Information';
  return SECTION_STEP_INDEX[section] ?? 2;
}

function fieldSortValue(field: Field, originalIndex: number) {
  return CORE_FIELD_ORDER[field.key] ?? 1000 + originalIndex;
}

export default function ClientOnboardingPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [data, setData] = useState<any>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const initialized = useRef(false);
  const stepInitialized = useRef(false);
  const responsesRef = useRef<Record<string, string>>({});
  const editVersion = useRef(0);
  const savingRef = useRef(false);
  const queuedAutosave = useRef(false);
  const stepPanelRef = useRef<HTMLElement | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    const { data: opened, error: openError } = await supabase.rpc('public_client_onboarding_open', { p_token: token });
    if (openError || !opened) {
      setError(errorMessage(openError, 'This onboarding link could not be opened.'));
      setLoading(false);
      return;
    }
    setData(opened);
    const existing = { ...(opened.responses || {}) } as Record<string, string>;
    const customer = opened.customer || {};
    if (!existing.companyName && customer.companyName) existing.companyName = customer.companyName;
    if (!existing.website && customer.website) existing.website = customer.website;
    if (!existing.phone && customer.phone) existing.phone = customer.phone;
    if (!existing.country && customer.country) existing.country = customer.country;
    responsesRef.current = existing;
    editVersion.current = 0;
    queuedAutosave.current = false;
    stepInitialized.current = false;
    setCurrentStep(0);
    setResponses(existing);
    setDirty(false);
    initialized.current = true;
    setLoading(false);
  };

  useEffect(() => { void load(); }, [token]);

  useEffect(() => {
    if (!initialized.current || !dirty || data?.status === 'Completed') return;
    const timer = window.setTimeout(() => {
      void save(false, true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [responses, dirty, data?.status]);

  const fields: Field[] = Array.isArray(data?.fields) ? data.fields : [];
  const scopeItems: ScopeItem[] = Array.isArray(data?.scope?.items) ? data.scope.items : [];

  const steps = useMemo<OnboardingStep[]>(() => {
    const buckets = STEP_META.map(meta => ({ ...meta, fields: [] as Array<{ field: Field; originalIndex: number }> }));
    fields.forEach((field, originalIndex) => {
      buckets[fieldStepIndex(field)].fields.push({ field, originalIndex });
    });
    return buckets
      .map(bucket => ({
        id: bucket.id,
        shortTitle: bucket.shortTitle,
        title: bucket.title,
        description: bucket.description,
        fields: bucket.fields
          .sort((a, b) => fieldSortValue(a.field, a.originalIndex) - fieldSortValue(b.field, b.originalIndex))
          .map(item => item.field)
      }))
      .filter(step => step.fields.length > 0);
  }, [fields]);

  const missingForStep = (step: OnboardingStep) => step.fields.filter(field => field.required && !isFilled(responses[field.key]));
  const stepIsComplete = (step: OnboardingStep) => missingForStep(step).length === 0;

  useEffect(() => {
    if (!data || stepInitialized.current || steps.length === 0 || data.status === 'Completed') return;
    const firstIncomplete = steps.findIndex(step => !stepIsComplete(step));
    setCurrentStep(firstIncomplete >= 0 ? firstIncomplete : Math.max(steps.length - 1, 0));
    stepInitialized.current = true;
  }, [data, steps, responses]);

  const safeCurrentStep = Math.min(currentStep, Math.max(steps.length - 1, 0));
  const activeStep = steps[safeCurrentStep] || null;

  const activeSections = useMemo(() => {
    if (!activeStep) return [] as string[];
    const order: string[] = [];
    activeStep.fields.forEach(field => {
      const section = field.section || 'Project Information';
      if (!order.includes(section)) order.push(section);
    });
    return order;
  }, [activeStep]);

  const completedRequired = fields.filter(field => field.required && isFilled(responses[field.key])).length;
  const requiredCount = fields.filter(field => field.required).length;
  const progress = requiredCount ? Math.round((completedRequired / requiredCount) * 100) : 100;

  const save = async (submit: boolean, quiet = false) => {
    if (data?.status === 'Completed') return;
    if (savingRef.current) {
      if (!submit) queuedAutosave.current = true;
      return;
    }

    savingRef.current = true;
    setSaving(true);
    if (!quiet) { setError(''); setNotice(''); }

    const versionAtStart = editVersion.current;
    const payload = { ...responsesRef.current };
    let completedNow = false;

    const { data: result, error: saveError } = await supabase.rpc('public_client_onboarding_save', {
      p_token: token,
      p_responses: payload,
      p_submit: submit
    });

    if (saveError) {
      setError(errorMessage(saveError, submit ? 'Onboarding could not be completed.' : 'Your progress could not be saved.'));
    } else if (submit) {
      completedNow = true;
      setData((current: any) => ({ ...current, status: 'Completed', completedAt: result?.completedAt || new Date().toISOString() }));
      setDirty(false);
      queuedAutosave.current = false;
      setNotice('Onboarding completed successfully. Your Client Portal access is being prepared.');
      if (result?.nextUrl) window.setTimeout(() => window.location.assign(result.nextUrl), 1000);
    } else {
      const newerEdits = editVersion.current !== versionAtStart;
      setDirty(newerEdits);
      if (newerEdits) queuedAutosave.current = true;
      if (!quiet && !newerEdits) setNotice('Progress saved.');
    }

    savingRef.current = false;
    setSaving(false);

    const followUp = queuedAutosave.current;
    queuedAutosave.current = false;
    if (followUp && !completedNow) {
      window.setTimeout(() => void save(false, true), 0);
    }
  };

  const update = (key: string, value: string) => {
    editVersion.current += 1;
    setResponses(current => {
      const next = { ...current, [key]: value };
      responsesRef.current = next;
      return next;
    });
    if (savingRef.current) queuedAutosave.current = true;
    setDirty(true);
    if (error) setError('');
  };

  const focusField = (field?: Field) => {
    if (!field) return;
    window.setTimeout(() => {
      const element = document.getElementById(`onboarding-${field.key}`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      element?.focus();
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const scrollToStep = () => {
    window.setTimeout(() => stepPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  };

  const goToStep = (index: number) => {
    if (index < 0 || index >= steps.length) return;
    const previousStepsComplete = steps.slice(0, index).every(step => stepIsComplete(step));
    if (!previousStepsComplete) return;
    setError('');
    setNotice('');
    setCurrentStep(index);
    scrollToStep();
  };

  const goNext = () => {
    if (!activeStep) return;
    const missing = missingForStep(activeStep);
    if (missing.length > 0) {
      setError(`Please complete ${missing.length} required ${missing.length === 1 ? 'question' : 'questions'} in this step before continuing.`);
      focusField(missing[0]);
      return;
    }
    setError('');
    setNotice('');
    setCurrentStep(step => Math.min(step + 1, steps.length - 1));
    scrollToStep();
  };

  const completeOnboarding = async () => {
    const firstIncompleteStep = steps.findIndex(step => !stepIsComplete(step));
    if (firstIncompleteStep >= 0) {
      setCurrentStep(firstIncompleteStep);
      const missing = missingForStep(steps[firstIncompleteStep]);
      setError('Please complete the remaining required questions before finishing onboarding.');
      scrollToStep();
      focusField(missing[0]);
      return;
    }
    await save(true);
  };

  const renderField = (field: Field) => (
    <label key={field.key} htmlFor={`onboarding-${field.key}`} className={field.type === 'textarea' ? 'min-w-0 sm:col-span-2' : 'min-w-0'}>
      <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-600">
        <span className="min-w-0 break-words">{field.label}</span>
        {field.required ? <span className="text-red-600">*</span> : <span className="text-[9px] font-bold normal-case tracking-normal text-slate-400">Optional</span>}
      </span>
      {field.type === 'textarea' ? (
        <textarea
          id={`onboarding-${field.key}`}
          rows={3}
          maxLength={5000}
          value={responses[field.key] || ''}
          onChange={event => update(field.key, event.target.value)}
          placeholder={field.placeholder || ''}
          className="min-h-[108px] w-full min-w-0 resize-y rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#000080] focus:bg-white focus:ring-4 focus:ring-blue-50"
        />
      ) : field.type === 'select' ? (
        <select
          id={`onboarding-${field.key}`}
          value={responses[field.key] || ''}
          onChange={event => update(field.key, event.target.value)}
          className="w-full min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-[#000080] focus:bg-white focus:ring-4 focus:ring-blue-50"
        >
          <option value="">Select an option</option>
          {(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input
          id={`onboarding-${field.key}`}
          type={field.type === 'url' ? 'url' : 'text'}
          maxLength={5000}
          value={responses[field.key] || ''}
          onChange={event => update(field.key, event.target.value)}
          placeholder={field.placeholder || ''}
          className="w-full min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#000080] focus:bg-white focus:ring-4 focus:ring-blue-50"
        />
      )}
    </label>
  );

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-5"><div className="max-w-lg rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm"><LockKeyhole className="mx-auto h-10 w-10 text-red-600" /><h1 className="mt-4 text-xl font-black text-slate-900">Onboarding unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-500">{error || 'This onboarding link is invalid or expired.'}</p></div></div>;

  const completed = data.status === 'Completed';
  const activeStepRequired = activeStep?.fields.filter(field => field.required).length || 0;
  const activeStepCompleted = activeStep?.fields.filter(field => field.required && isFilled(responses[field.key])).length || 0;
  const packageLabel = scopeItems.length === 1
    ? scopeItems[0].productName || data.project?.packageName || 'Purchased package'
    : `${scopeItems.length} purchased project items`;

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 pb-10 text-slate-900">
      <header className="bg-[#000080] text-white shadow-lg">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-blue-200"><ClipboardCheck className="h-4 w-4" />ProFox Client Onboarding</div>
              <h1 className="mt-2 break-words text-2xl font-black leading-tight sm:text-3xl">{data.project?.projectName}</h1>
              <p className="mt-1.5 break-words text-xs leading-5 text-blue-100 sm:text-sm">{data.project?.projectNumber} · {data.project?.packageName || 'ProFox Project'}</p>
            </div>
            <div className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 sm:w-auto sm:min-w-[210px]">
              <div className="flex items-center justify-between gap-3 text-xs font-black"><span>{completed ? 'Onboarding complete' : `${progress}% complete`}</span>{!completed && <span>{completedRequired}/{requiredCount}</span>}</div>
              {!completed && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-white transition-all" style={{ width: `${progress}%` }} /></div>}
              <div className="mt-2 break-all text-[10px] leading-4 text-blue-200">{data.customer?.email}</div>
            </div>
          </div>
          {!completed && <div className="mt-4 flex items-start gap-2 text-[10px] leading-4 text-blue-100"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Secure autosave is on. Never enter passwords, card numbers or secret API keys here.</span></div>}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5 sm:space-y-5 sm:px-6 sm:py-7">
        <section className="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm">
          <div className="p-4 sm:p-5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#000080]"><ClipboardCheck className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="break-words text-sm font-black text-slate-900 sm:text-base">Your agreed project scope</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">We only ask for information needed to deliver what you purchased.</p>
                  </div>
                  {data.scope?.quotationNumber && <span className="w-fit shrink-0 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[10px] font-black text-[#000080]">{data.scope.quotationNumber}</span>}
                </div>
                <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                  <span className="max-w-full break-words rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700">{packageLabel}</span>
                  {scopeItems.length > 0 && <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Purchased scope verified</span>}
                </div>
              </div>
            </div>

            {(scopeItems.length > 0 || data.scope?.summary) && (
              <details className="group mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-black text-slate-700 marker:content-none">
                  <span>View purchased scope details</span>
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-slate-200 p-3 sm:p-4">
                  {data.scope?.summary && <p className="mb-3 break-words rounded-xl bg-white p-3 text-xs leading-5 text-slate-600">{data.scope.summary}</p>}
                  <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                    {scopeItems.map((item, index) => {
                      const inclusions = Array.isArray(item.inclusions) ? item.inclusions.filter(Boolean) : [];
                      return (
                        <div key={item.id || `${item.productCode || item.productName}-${index}`} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                            <div className="min-w-0">
                              <div className="break-words text-sm font-black leading-5 text-slate-900">{item.productName || 'Included project item'}{Number(item.quantity || 1) > 1 ? ` × ${item.quantity}` : ''}</div>
                              {item.description && <p className="mt-1 break-words text-[11px] leading-5 text-slate-500">{item.description}</p>}
                            </div>
                          </div>
                          {inclusions.length > 0 && <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-[11px] leading-4 text-slate-600">{inclusions.map((inclusion, inclusionIndex) => <li key={`${inclusion}-${inclusionIndex}`} className="flex min-w-0 gap-2"><span className="shrink-0 text-[#000080]">•</span><span className="min-w-0 break-words">{inclusion}</span></li>)}</ul>}
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[10px] leading-4 text-slate-400">Anything outside this agreed scope should be handled as a scope change or add-on with your ProFox representative.</p>
                </div>
              </details>
            )}
          </div>
        </section>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-5 text-red-700">{error}</div>}
        {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-5 text-emerald-800">{notice}</div>}

        {completed ? (
          <section className="rounded-3xl border border-emerald-200 bg-white p-7 text-center shadow-sm sm:p-8"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h2 className="mt-4 text-xl font-black text-slate-900">Onboarding is complete</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">Your information is connected to this ProFox project. If your Client Portal is not already active, use the activation invitation sent to your registered email.</p></section>
        ) : activeStep ? (
          <>
            <section ref={stepPanelRef} className="scroll-mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-white p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#000080]"><ClipboardCheck className="h-3.5 w-3.5" />Step {safeCurrentStep + 1} of {steps.length}</div>
                    <h2 className="mt-1.5 break-words text-xl font-black leading-tight text-slate-900">{activeStep.title}</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{activeStep.description}</p>
                  </div>
                  <div className="shrink-0 rounded-xl bg-slate-50 px-2.5 py-2 text-center"><div className="text-sm font-black text-slate-900">{activeStepCompleted}/{activeStepRequired}</div><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">required</div></div>
                </div>

                <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(steps.length, 1)}, minmax(0, 1fr))` }}>
                  {steps.map((step, index) => {
                    const done = stepIsComplete(step);
                    const allowed = index <= safeCurrentStep || steps.slice(0, index).every(candidate => stepIsComplete(candidate));
                    const active = index === safeCurrentStep;
                    return (
                      <button
                        key={step.id}
                        type="button"
                        disabled={!allowed}
                        onClick={() => goToStep(index)}
                        aria-current={active ? 'step' : undefined}
                        className={`min-w-0 rounded-xl border px-2 py-2 text-center transition ${active ? 'border-[#000080] bg-blue-50' : done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'} disabled:cursor-not-allowed disabled:opacity-45`}
                      >
                        <span className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${active ? 'bg-[#000080] text-white' : done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{done && !active ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                        <span className={`mt-1 hidden truncate text-[9px] font-black sm:block ${active ? 'text-[#000080]' : 'text-slate-500'}`}>{step.shortTitle}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {activeSections.map(section => {
                  const sectionFields = activeStep.fields.filter(field => (field.section || 'Project Information') === section);
                  const requiredFields = sectionFields.filter(field => field.required);
                  const optionalFields = sectionFields.filter(field => !field.required);
                  return (
                    <div key={section} className="p-4 sm:p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <h3 className="text-sm font-black text-slate-900">{section}</h3>
                        {requiredFields.length > 0 && <span className="shrink-0 text-[10px] font-bold text-slate-400">{requiredFields.filter(field => isFilled(responses[field.key])).length}/{requiredFields.length} required</span>}
                      </div>

                      {requiredFields.length > 0 && <div className="grid min-w-0 gap-4 sm:grid-cols-2">{requiredFields.map(renderField)}</div>}

                      {optionalFields.length > 0 && (
                        <details className={`${requiredFields.length > 0 ? 'mt-4' : ''} group rounded-2xl border border-dashed border-slate-200 bg-slate-50/60`}>
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-[11px] font-black text-slate-500 marker:content-none">
                            <span>Optional details ({optionalFields.length})</span>
                            <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="grid min-w-0 gap-4 border-t border-slate-200 p-3.5 sm:grid-cols-2">{optionalFields.map(renderField)}</div>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="sticky bottom-0 z-20 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur sm:mx-0 sm:bottom-4 sm:rounded-2xl sm:border sm:shadow-xl">
              <div className="mb-2 flex items-center justify-between gap-3 text-[10px] text-slate-500">
                <span className="min-w-0 truncate">{saving ? 'Saving securely…' : dirty ? 'Autosaving your changes…' : 'All changes saved.'}</span>
                <button type="button" disabled={saving} onClick={() => void save(false)} className="inline-flex shrink-0 items-center gap-1 font-black text-[#000080] disabled:opacity-50"><Save className="h-3.5 w-3.5" />Save now</button>
              </div>
              <div className="flex gap-2">
                {safeCurrentStep > 0 && <button type="button" onClick={() => goToStep(safeCurrentStep - 1)} className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-3 text-xs font-black text-slate-700"><ArrowLeft className="h-4 w-4" />Back</button>}
                {safeCurrentStep < steps.length - 1 ? (
                  <button type="button" onClick={goNext} className="inline-flex min-w-0 flex-[1.35] items-center justify-center gap-1.5 rounded-xl bg-[#000080] px-4 py-3 text-xs font-black text-white shadow-sm">Continue<ArrowRight className="h-4 w-4" /></button>
                ) : (
                  <button type="button" disabled={saving} onClick={() => void completeOnboarding()} className="inline-flex min-w-0 flex-[1.35] items-center justify-center gap-1.5 rounded-xl bg-[#000080] px-4 py-3 text-xs font-black text-white shadow-sm disabled:opacity-50">Complete Onboarding<ArrowRight className="h-4 w-4" /></button>
                )}
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
