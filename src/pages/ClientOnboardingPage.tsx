import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, ClipboardCheck, Loader2, LockKeyhole, Save, ShieldCheck } from 'lucide-react';
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

function errorMessage(error: any, fallback: string) {
  return error?.message || fallback;
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
  const initialized = useRef(false);
  const responsesRef = useRef<Record<string, string>>({});
  const editVersion = useRef(0);
  const savingRef = useRef(false);
  const queuedAutosave = useRef(false);

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
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [responses, dirty, data?.status]);

  const fields: Field[] = Array.isArray(data?.fields) ? data.fields : [];
  const scopeItems: ScopeItem[] = Array.isArray(data?.scope?.items) ? data.scope.items : [];
  const sections = useMemo(() => {
    const order: string[] = [];
    fields.forEach(field => {
      const section = field.section || 'Project Information';
      if (!order.includes(section)) order.push(section);
    });
    return order;
  }, [fields]);

  const completedRequired = fields.filter(field => field.required && String(responses[field.key] || '').trim()).length;
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
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-5"><div className="max-w-lg rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm"><LockKeyhole className="mx-auto h-10 w-10 text-red-600" /><h1 className="mt-4 text-xl font-black text-slate-900">Onboarding unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-500">{error || 'This onboarding link is invalid or expired.'}</p></div></div>;

  const completed = data.status === 'Completed';

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="bg-[#000080] text-white shadow-lg">
        <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-blue-200"><ClipboardCheck className="h-4 w-4" />ProFox Client Onboarding</div>
              <h1 className="mt-2 text-2xl font-black sm:text-3xl">{data.project?.projectName}</h1>
              <p className="mt-2 text-sm text-blue-100">{data.project?.projectNumber} · {data.project?.packageName || 'ProFox Project'}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-xs"><div className="font-black">{completed ? 'Onboarding Complete' : `${progress}% required information complete`}</div><div className="mt-1 text-blue-200">Registered email: {data.customer?.email}</div></div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-5 py-8 sm:px-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#000080]" /><div><h2 className="text-sm font-black text-slate-900">Secure project onboarding</h2><p className="mt-1 text-xs leading-5 text-slate-500">This form is connected to your verified payment, accepted quotation, client record and project. Your registered email is fixed as the identity for future Client Portal access. Never enter passwords, card numbers or secret API keys in this form.</p></div></div>
        </section>

        <section className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#000080]"><ClipboardCheck className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-black text-slate-900">Your agreed project scope</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">The questions in this onboarding are generated only from the package, committed inclusions and purchased add-ons in your accepted quotation. Optional or unpurchased items are not included.</p>
                </div>
                {data.scope?.quotationNumber && <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[10px] font-black text-[#000080]">{data.scope.quotationNumber}</span>}
              </div>
              {data.scope?.summary && <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">{data.scope.summary}</p>}
              {scopeItems.length > 0 && <div className="mt-4 grid gap-3 md:grid-cols-2">
                {scopeItems.map((item, index) => {
                  const inclusions = Array.isArray(item.inclusions) ? item.inclusions.filter(Boolean) : [];
                  return <div key={item.id || `${item.productCode || item.productName}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-start gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><div className="min-w-0"><div className="text-sm font-black text-slate-900">{item.productName || 'Included project item'}{Number(item.quantity || 1) > 1 ? ` × ${item.quantity}` : ''}</div>{item.description && <p className="mt-1 text-[11px] leading-5 text-slate-500">{item.description}</p>}</div></div>
                    {inclusions.length > 0 && <ul className="mt-3 space-y-1.5 border-t border-slate-200 pt-3 text-[11px] leading-4 text-slate-600">{inclusions.map((inclusion, inclusionIndex) => <li key={`${inclusion}-${inclusionIndex}`} className="flex gap-2"><span className="text-[#000080]">•</span><span>{inclusion}</span></li>)}</ul>}
                  </div>;
                })}
              </div>}
              <p className="mt-4 text-[10px] leading-4 text-slate-400">Please answer for this agreed scope only. If you want something outside the quotation, contact your ProFox representative so it can be handled as a scope change or add-on instead of being mixed into onboarding.</p>
            </div>
          </div>
        </section>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
        {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{notice}</div>}

        {completed ? (
          <section className="rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-sm"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h2 className="mt-4 text-xl font-black text-slate-900">Onboarding is complete</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">Your information is permanently connected to this ProFox project. If your Client Portal is not already active, use the activation invitation sent to your registered email.</p></section>
        ) : (
          <>
            {sections.map(section => (
              <section key={section} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
                <h2 className="text-base font-black text-slate-900">{section}</h2>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  {fields.filter(field => (field.section || 'Project Information') === section).map(field => (
                    <label key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                      <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">{field.label}{field.required && <span className="ml-1 text-red-600">*</span>}</span>
                      {field.type === 'textarea' ? (
                        <textarea rows={4} maxLength={5000} value={responses[field.key] || ''} onChange={event => update(field.key, event.target.value)} placeholder={field.placeholder || ''} className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none transition focus:border-[#000080] focus:bg-white" />
                      ) : field.type === 'select' ? (
                        <select value={responses[field.key] || ''} onChange={event => update(field.key, event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none transition focus:border-[#000080] focus:bg-white"><option value="">Select an option</option>{(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}</select>
                      ) : (
                        <input type={field.type === 'url' ? 'url' : 'text'} maxLength={5000} value={responses[field.key] || ''} onChange={event => update(field.key, event.target.value)} placeholder={field.placeholder || ''} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none transition focus:border-[#000080] focus:bg-white" />
                      )}
                    </label>
                  ))}
                </div>
              </section>
            ))}

            <div className="sticky bottom-4 z-20 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="text-xs text-slate-500">{saving ? 'Saving securely…' : dirty ? 'Unsaved changes will autosave shortly.' : 'Your progress is saved securely.'}</div><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => void save(false)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-700 disabled:opacity-50"><Save className="h-4 w-4" />Save Progress</button><button type="button" disabled={saving || progress < 100} onClick={() => void save(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-2.5 text-xs font-black text-white disabled:opacity-40">Complete Onboarding<ArrowRight className="h-4 w-4" /></button></div></div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
