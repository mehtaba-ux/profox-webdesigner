import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CirclePlus,
  GripVertical,
  Loader2,
  Route,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRoundCog,
  UsersRound,
} from 'lucide-react';
import {
  contactLeadFormService,
  type AdminContactLeadConfiguration,
  type LeadAssignmentConfiguration,
  type LeadFormField,
  type LeadFormOption,
  type PublicContactFormConfiguration,
} from '../../lib/contactLeadFormService';

const FIELD_TYPES: Array<{ value: LeadFormField['type']; label: string }> = [
  { value: 'text', label: 'Short text' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'Website URL' },
  { value: 'tel', label: 'Phone' },
  { value: 'textarea', label: 'Long text' },
  { value: 'single_select', label: 'Single choice' },
];

function messageFrom(error: unknown, fallback: string) {
  return error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message || fallback) : fallback;
}

function toggleValue(values: string[], id: string) {
  return values.includes(id) ? values.filter(item => item !== id) : [...values, id];
}

function FieldInput({ label, value, onChange, placeholder = '', type = 'text' }: { label: string; value: string | number; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[.12em] text-slate-400">{label}</span><input type={type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-[#000080] focus:ring-4 focus:ring-[#000080]/5" /></label>;
}

function Toggle({ checked, onChange, label, detail, disabled = false }: { checked: boolean; onChange: (next: boolean) => void; label: string; detail?: string; disabled?: boolean }) {
  return <label className={`flex items-start justify-between gap-4 rounded-xl border p-3 ${disabled ? 'bg-slate-50 opacity-60' : 'bg-white'}`}><span><span className="block text-xs font-black text-slate-800">{label}</span>{detail && <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{detail}</span>}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} className="mt-0.5 h-5 w-5 accent-[#000080]" /></label>;
}

export default function ContactLeadFormAdmin() {
  const [snapshot, setSnapshot] = useState<AdminContactLeadConfiguration | null>(null);
  const [form, setForm] = useState<PublicContactFormConfiguration | null>(null);
  const [assignment, setAssignment] = useState<LeadAssignmentConfiguration | null>(null);
  const [expandedField, setExpandedField] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const next = await contactLeadFormService.getAdminConfiguration();
      setSnapshot(next);
      setForm(structuredClone(next.form));
      setAssignment(structuredClone(next.assignment));
    } catch (err) { setError(messageFrom(err, 'Contact lead configuration could not be loaded.')); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const orderedFields = useMemo(() => form ? [...form.fields].sort((a, b) => {
    const stepA = form.steps.findIndex(step => step.id === a.stepId);
    const stepB = form.steps.findIndex(step => step.id === b.stepId);
    return stepA === stepB ? a.order - b.order : stepA - stepB;
  }) : [], [form]);

  const patchExperience = (key: keyof PublicContactFormConfiguration['experience'], value: string) => {
    setForm(current => current ? { ...current, experience: { ...current.experience, [key]: value } } : current);
  };

  const patchField = (id: string, patch: Partial<LeadFormField>) => {
    setForm(current => current ? { ...current, fields: current.fields.map(field => field.id === id ? { ...field, ...patch } : field) } : current);
  };

  const patchOption = (fieldId: string, optionIndex: number, patch: Partial<LeadFormOption>) => {
    setForm(current => current ? { ...current, fields: current.fields.map(field => field.id !== fieldId ? field : {
      ...field, options: field.options.map((option, index) => index === optionIndex ? { ...option, ...patch } : option),
    }) } : current);
  };

  const moveField = (field: LeadFormField, direction: -1 | 1) => {
    if (!form) return;
    const peers = form.fields.filter(item => item.stepId === field.stepId).sort((a, b) => a.order - b.order);
    const index = peers.findIndex(item => item.id === field.id);
    const target = peers[index + direction];
    if (!target) return;
    patchField(field.id, { order: target.order });
    patchField(target.id, { order: field.order });
  };

  const addField = () => {
    if (!form || form.fields.length >= 30) return;
    const id = `custom_${Date.now().toString(36)}`;
    const stepId = form.steps[form.steps.length - 1]?.id || 'about';
    const next: LeadFormField = { id, purpose: '', type: 'text', label: 'New field', placeholder: '', helpText: '', required: false, enabled: true, locked: false, stepId, order: 999, width: 'full', options: [] };
    setForm({ ...form, fields: [...form.fields, next] });
    setExpandedField(id);
  };

  const deleteField = (field: LeadFormField) => {
    if (!form || field.locked || !window.confirm(`Remove “${field.label}” from the contact form? Existing CRM answers remain preserved.`)) return;
    setForm({ ...form, fields: form.fields.filter(item => item.id !== field.id) });
    if (expandedField === field.id) setExpandedField('');
  };

  const addStep = () => {
    if (!form || form.steps.length >= 4) return;
    const id = `step_${Date.now().toString(36)}`;
    setForm({ ...form, steps: [...form.steps, { id, title: 'New step', subtitle: 'Add a short explanation for this step.' }] });
  };

  const deleteStep = (stepId: string) => {
    if (!form || form.steps.length <= 1) return;
    const step = form.steps.find(item => item.id === stepId);
    if (!window.confirm(`Remove the “${step?.title || 'step'}” step? Its fields will move to the first step.`)) return;
    const fallback = form.steps.find(item => item.id !== stepId)!.id;
    setForm({ ...form, steps: form.steps.filter(item => item.id !== stepId), fields: form.fields.map(field => field.stepId === stepId ? { ...field, stepId: fallback } : field) });
  };

  const save = async () => {
    if (!form || !assignment) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const normalized: PublicContactFormConfiguration = {
        ...form,
        fields: form.fields.map(field => ({ ...field, label: field.label.trim(), placeholder: field.placeholder?.trim() || '', helpText: field.helpText?.trim() || '', options: field.options.filter(option => option.value.trim()).map(option => ({ ...option, value: option.value.trim(), label: (option.label || option.value).trim() })) })),
      };
      const next = await contactLeadFormService.saveAdminConfiguration(normalized, assignment);
      setSnapshot(next); setForm(structuredClone(next.form)); setAssignment(structuredClone(next.assignment));
      setMessage('Contact form, qualification scoring and lead assignment policy were saved. New submissions will use this configuration.');
    } catch (err) { setError(messageFrom(err, 'Contact lead configuration could not be saved.')); }
    finally { setSaving(false); }
  };

  if (loading || !form || !assignment || !snapshot) return <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-slate-200 bg-white"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /></div>;

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50 via-white to-emerald-50 px-5 py-6 sm:px-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-[#000080]"><Sparkles className="h-4 w-4" />Lead acquisition</div><h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">Contact form & lead routing customizer</h2><p className="mt-2 text-xs leading-5 text-slate-600">Control the public qualification experience without editing code, then decide whether new website leads stay in the management pool or are distributed equally to eligible Sales Representatives.</p></div>
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 text-xs font-black text-white shadow-lg shadow-blue-950/10 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save form & routing</button>
        </div>
      </div>

      <div className="space-y-7 p-5 sm:p-7">
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold leading-5 text-rose-700">{error}</div>}
        {message && <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold leading-5 text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{message}</div>}

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5">
            <div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-[#000080]" /><div><h3 className="text-sm font-black text-slate-900">Visitor experience</h3><p className="text-[10px] text-slate-500">Keep the copy short, reassuring and action-oriented.</p></div></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Toggle checked={form.enabled} onChange={enabled => setForm({ ...form, enabled })} label="Accept project enquiries" detail="Disable only when you intentionally want to pause the form." /></div>
              <FieldInput label="Eyebrow" value={form.experience.eyebrow} onChange={value => patchExperience('eyebrow', value)} />
              <FieldInput label="Estimated time" value={form.experience.estimatedTime} onChange={value => patchExperience('estimatedTime', value)} />
              <div className="sm:col-span-2"><FieldInput label="Main form heading" value={form.experience.title} onChange={value => patchExperience('title', value)} /></div>
              <div className="sm:col-span-2"><FieldInput label="Intro copy" value={form.experience.subtitle} onChange={value => patchExperience('subtitle', value)} /></div>
              <FieldInput label="Continue button" value={form.experience.nextLabel} onChange={value => patchExperience('nextLabel', value)} />
              <FieldInput label="Back button" value={form.experience.previousLabel} onChange={value => patchExperience('previousLabel', value)} />
              <div className="sm:col-span-2"><FieldInput label="Final submit button" value={form.experience.submitLabel} onChange={value => patchExperience('submitLabel', value)} /></div>
              <div className="sm:col-span-2"><FieldInput label="Privacy / reassurance" value={form.experience.privacyText} onChange={value => patchExperience('privacyText', value)} /></div>
              <div className="sm:col-span-2"><FieldInput label="Success heading" value={form.experience.successTitle} onChange={value => patchExperience('successTitle', value)} /></div>
              <div className="sm:col-span-2"><FieldInput label="Success message" value={form.experience.successMessage} onChange={value => patchExperience('successMessage', value)} /></div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5">
            <div className="flex items-center gap-2"><Route className="h-5 w-5 text-[#000080]" /><div><h3 className="text-sm font-black text-slate-900">Lead ownership policy</h3><p className="text-[10px] text-slate-500">Manual is the safest default. Round-robin distributes each new website lead atomically and evenly.</p></div></div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(['manual', 'round_robin'] as const).map(mode => <button key={mode} type="button" onClick={() => setAssignment({ ...assignment, mode })} className={`rounded-2xl border p-4 text-left transition-all ${assignment.mode === mode ? 'border-[#000080] bg-[#000080]/5 ring-2 ring-[#000080]/10' : 'border-slate-200 bg-white hover:border-slate-300'}`}><div className="text-xs font-black text-slate-900">{mode === 'manual' ? 'Management pool' : 'Equal auto-distribution'}</div><div className="mt-1 text-[10px] leading-4 text-slate-500">{mode === 'manual' ? 'New website leads stay Unassigned until a manager assigns them.' : 'New website leads rotate fairly through eligible active sellers.'}</div></button>)}
            </div>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-5 text-amber-800"><strong>Important:</strong> changing this policy affects new website enquiries. Existing CRM ownership is never silently rewritten.</div>

            <div className="mt-5"><div className="flex items-center gap-2 text-xs font-black text-slate-800"><UserRoundCog className="h-4 w-4" />Who can assign leads?</div><p className="mt-1 text-[10px] leading-4 text-slate-500">Admins always can. Add only trusted managers/responsible staff who should see the team lead pool and assign ownership.</p><div className="mt-3 max-h-44 space-y-2 overflow-auto pr-1">{snapshot.staff.filter(person => person.role !== 'admin').map(person => <label key={person.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><span className="min-w-0"><span className="block truncate text-xs font-bold text-slate-800">{person.name}</span><span className="block truncate text-[10px] text-slate-400">{person.role}{person.department ? ` · ${person.department}` : ''}</span></span><input type="checkbox" checked={assignment.managerUserIds.includes(person.id)} onChange={() => setAssignment({ ...assignment, managerUserIds: toggleValue(assignment.managerUserIds, person.id) })} className="h-4 w-4 accent-[#000080]" /></label>)}</div></div>

            <div className="mt-5"><div className="flex items-center gap-2 text-xs font-black text-slate-800"><UsersRound className="h-4 w-4" />Round-robin seller pool</div><p className="mt-1 text-[10px] leading-4 text-slate-500">Leave every seller unchecked to use all active, onboarded and available Sales Representatives. Check names only when you want to limit the rotation.</p><div className="mt-3 max-h-44 space-y-2 overflow-auto pr-1">{snapshot.salespeople.map(person => <label key={person.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><span className="min-w-0"><span className="block truncate text-xs font-bold text-slate-800">{person.name}</span><span className="block truncate text-[10px] text-slate-400">{person.email}</span></span><input type="checkbox" checked={assignment.eligibleSalespersonIds.includes(person.id)} onChange={() => setAssignment({ ...assignment, eligibleSalespersonIds: toggleValue(assignment.eligibleSalespersonIds, person.id) })} className="h-4 w-4 accent-[#000080]" /></label>)}</div></div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><GripVertical className="h-5 w-5 text-[#000080]" /><h3 className="text-sm font-black text-slate-900">Steps</h3></div><p className="mt-1 text-[10px] leading-4 text-slate-500">Two focused steps are recommended for conversion. You can use up to four if the qualification experience genuinely needs it.</p></div><button type="button" onClick={addStep} disabled={form.steps.length >= 4} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-700 disabled:opacity-40"><CirclePlus className="h-4 w-4" />Add step</button></div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">{form.steps.map((step, index) => <div key={step.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-[.14em] text-[#000080]">Step {index + 1}</span>{form.steps.length > 1 && <button type="button" onClick={() => deleteStep(step.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}</div><div className="space-y-3"><FieldInput label="Step title" value={step.title} onChange={value => setForm({ ...form, steps: form.steps.map(item => item.id === step.id ? { ...item, title: value } : item) })} /><FieldInput label="Short explanation" value={step.subtitle || ''} onChange={value => setForm({ ...form, steps: form.steps.map(item => item.id === step.id ? { ...item, subtitle: value } : item) })} /></div></div>)}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-[#000080]" /><h3 className="text-sm font-black text-slate-900">Qualification fields</h3></div><p className="mt-1 text-[10px] leading-4 text-slate-500">Edit labels, choices, scoring, order, required state and conditional visibility. Keep only questions Sales will actually use.</p></div><button type="button" onClick={addField} disabled={form.fields.length >= 30} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-[#000080] px-3 text-[10px] font-black text-white disabled:opacity-40"><CirclePlus className="h-4 w-4" />Add custom field</button></div>

          <div className="mt-4 space-y-3">{orderedFields.map(field => {
            const expanded = expandedField === field.id;
            const step = form.steps.find(item => item.id === field.stepId);
            return <div key={field.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex items-center gap-3 px-4 py-3"><GripVertical className="h-4 w-4 shrink-0 text-slate-300" /><button type="button" onClick={() => setExpandedField(expanded ? '' : field.id)} className="min-w-0 flex-1 text-left"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-xs font-black text-slate-900">{field.label}</span>{field.required && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-black text-rose-600">Required</span>}{!field.enabled && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">Hidden</span>}{field.locked && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black text-[#000080]">Core</span>}</div><div className="mt-0.5 text-[10px] text-slate-400">{step?.title || field.stepId} · {FIELD_TYPES.find(item => item.value === field.type)?.label || field.type}</div></button><div className="flex items-center gap-1"><button type="button" onClick={() => moveField(field, -1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><ArrowUp className="h-4 w-4" /></button><button type="button" onClick={() => moveField(field, 1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><ArrowDown className="h-4 w-4" /></button>{!field.locked && <button type="button" onClick={() => deleteField(field)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}<button type="button" onClick={() => setExpandedField(expanded ? '' : field.id)} className="rounded-lg p-1.5 text-slate-500">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></div></div>

              {expanded && <div className="border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5"><div className="grid gap-4 lg:grid-cols-3"><FieldInput label="Field label" value={field.label} onChange={value => patchField(field.id, { label: value })} /><FieldInput label="Placeholder" value={field.placeholder || ''} onChange={value => patchField(field.id, { placeholder: value })} /><FieldInput label="Help text" value={field.helpText || ''} onChange={value => patchField(field.id, { helpText: value })} />
                <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[.12em] text-slate-400">Field type</span><select value={field.type} disabled={field.locked} onChange={event => patchField(field.id, { type: event.target.value as LeadFormField['type'], options: event.target.value === 'single_select' ? field.options : [] })} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold outline-none disabled:opacity-60">{FIELD_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[.12em] text-slate-400">Step</span><select value={field.stepId} onChange={event => patchField(field.id, { stepId: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold outline-none">{form.steps.map((item, index) => <option key={item.id} value={item.id}>Step {index + 1}: {item.title}</option>)}</select></label>
                <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[.12em] text-slate-400">Width</span><select value={field.width} onChange={event => patchField(field.id, { width: event.target.value === 'half' ? 'half' : 'full' })} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold outline-none"><option value="full">Full width</option><option value="half">Half width</option></select></label>
              </div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Toggle checked={field.enabled} disabled={Boolean(field.locked)} onChange={enabled => patchField(field.id, { enabled })} label="Show this field" detail={field.locked ? 'Core identity fields cannot be hidden.' : 'Hidden fields are not shown or required.'} /><Toggle checked={field.required} disabled={Boolean(field.locked)} onChange={required => patchField(field.id, { required })} label="Required" detail={field.locked ? 'Name and email must remain required.' : 'Use required only when Sales truly needs the answer.'} /></div>

              {field.type === 'single_select' && <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><div><div className="text-xs font-black text-slate-800">Choice options & score</div><div className="mt-0.5 text-[10px] text-slate-500">Scores are calculated server-side; visitors never choose or submit their own score.</div></div><button type="button" onClick={() => patchField(field.id, { options: [...field.options, { value: `Option ${field.options.length + 1}`, label: `Option ${field.options.length + 1}`, score: 0 }] })} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black text-slate-700">Add option</button></div><div className="mt-3 space-y-2">{field.options.map((option, optionIndex) => <div key={`${field.id}-${optionIndex}`} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_80px_100px_auto]"><FieldInput label="Value" value={option.value} onChange={value => patchOption(field.id, optionIndex, { value })} /><FieldInput label="Label" value={option.label} onChange={value => patchOption(field.id, optionIndex, { label: value })} /><FieldInput label="Score" type="number" value={option.score ?? 0} onChange={value => patchOption(field.id, optionIndex, { score: Number(value) })} />{field.purpose === 'budgetRange' ? <FieldInput label="Est. $ value" type="number" value={option.estimatedValue ?? 0} onChange={value => patchOption(field.id, optionIndex, { estimatedValue: Number(value) })} /> : <div />}<button type="button" onClick={() => patchField(field.id, { options: field.options.filter((_, index) => index !== optionIndex) })} className="self-end rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>)}</div><div className="mt-3"><Toggle checked={field.display === 'cards'} onChange={cards => patchField(field.id, { display: cards ? 'cards' : 'default' })} label="Use tap-friendly option cards" detail="Recommended for short qualification choices; dropdown remains better for very long lists." /></div></div>}

              {!field.locked && <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-4"><div className="text-xs font-black text-slate-800">Conditional visibility</div><p className="mt-1 text-[10px] leading-4 text-slate-500">Keep the form simple by showing this field only after a relevant earlier answer.</p><div className="mt-3 grid gap-3 lg:grid-cols-3"><label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[.12em] text-slate-400">Depends on</span><select value={field.condition?.fieldId || ''} onChange={event => patchField(field.id, { condition: event.target.value ? { fieldId: event.target.value, operator: field.condition?.operator || 'equals', value: field.condition?.value || '' } : undefined })} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold outline-none"><option value="">Always show</option>{form.fields.filter(item => item.id !== field.id && item.enabled).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>{field.condition && <><label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[.12em] text-slate-400">Rule</span><select value={field.condition.operator} onChange={event => patchField(field.id, { condition: { ...field.condition!, operator: event.target.value as any } })} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold outline-none"><option value="equals">Equals</option><option value="not_equals">Does not equal</option><option value="contains">Contains</option></select></label><FieldInput label="Value" value={field.condition.value} onChange={value => patchField(field.id, { condition: { ...field.condition!, value } })} /></>}</div></div>}
              </div>}
            </div>;
          })}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#000080]" /><h3 className="text-sm font-black text-slate-900">Qualification thresholds</h3></div><p className="mt-1 text-[10px] leading-4 text-slate-500">The CRM score is recalculated on the server from configured answer scores. It prioritizes leads; it never deletes or rejects them.</p><div className="mt-4 grid gap-3 sm:grid-cols-4"><FieldInput label="High quality ≥" type="number" value={form.scoring.highThreshold} onChange={value => setForm({ ...form, scoring: { ...form.scoring, highThreshold: Number(value) } })} /><FieldInput label="Medium quality ≥" type="number" value={form.scoring.mediumThreshold} onChange={value => setForm({ ...form, scoring: { ...form.scoring, mediumThreshold: Number(value) } })} /><FieldInput label="Business email bonus" type="number" value={form.scoring.businessEmailBonus} onChange={value => setForm({ ...form, scoring: { ...form.scoring, businessEmailBonus: Number(value) } })} /><FieldInput label="Detailed brief bonus" type="number" value={form.scoring.projectDetailBonus} onChange={value => setForm({ ...form, scoring: { ...form.scoring, projectDetailBonus: Number(value) } })} /></div></div>

        <div className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-[10px] leading-5 text-blue-900 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Conversion guardrail:</strong> avoid adding questions simply because they are available. Keep only fields needed to qualify or route the opportunity; deeper discovery belongs in the sales call/onboarding flow.</span></div><button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 text-[10px] font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save changes</button></div>
      </div>
    </section>
  );
}
