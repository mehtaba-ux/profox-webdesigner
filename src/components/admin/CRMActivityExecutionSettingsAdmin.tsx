import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Save, Settings2, Trash2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import {
  ActivityExecutionConfig,
  ActivityPlanConfig,
  ActivityPlanStep,
  ActivityTypeConfig,
  crmActivityExecutionService,
} from '../../lib/crmActivityExecutionService';
import { NotificationTemplate, salesAutomationService } from '../../lib/salesAutomationService';

const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#000080] focus:ring-4 focus:ring-blue-100';

export default function CRMActivityExecutionSettingsAdmin() {
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();
  const [config, setConfig] = useState<ActivityExecutionConfig | null>(null);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [activityConfig, notificationTemplates] = await Promise.all([
        crmActivityExecutionService.getConfig(),
        salesAutomationService.listTemplates(),
      ]);
      setConfig(activityConfig);
      setTemplates(notificationTemplates);
    } catch (e: any) { setError(e?.message || 'Activity settings could not be loaded.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);
  if (authLoading) return <div className="min-h-screen bg-slate-50" />;
  if (!isAdmin) return <Navigate to="/admin/workspace" replace />;

  const save = async () => {
    if (!config) return;
    setSaving(true); setError(''); setSuccess('');
    try { setConfig(await crmActivityExecutionService.saveConfig(config)); setSuccess('Activity execution settings saved. The existing configuration audit trail recorded the change.'); }
    catch (e: any) { setError(e?.message || 'Activity settings could not be saved.'); }
    finally { setSaving(false); }
  };

  const patchType = (index: number, patch: Partial<ActivityTypeConfig>) => {
    if (!config) return;
    setConfig({ ...config, types: config.types.map((type, i) => i === index ? { ...type, ...patch } : type) });
  };
  const patchPlan = (index: number, patch: Partial<ActivityPlanConfig>) => {
    if (!config) return;
    setConfig({ ...config, plans: config.plans.map((plan, i) => i === index ? { ...plan, ...patch } : plan) });
  };
  const addType = () => {
    if (!config) return;
    setConfig({ ...config, types: [...config.types, { name: 'New Activity Type', category: 'Task', channel: 'CRM', active: false, defaultSubject: 'CRM action', defaultInstructions: '', defaultDueMinutes: 1440, outcomes: ['Completed'], suggestedNextActivity: 'Follow-Up', requiredFields: [], allowedRoles: ['sales', 'admin'], emailTemplate: null, slaHours: 24 }] });
  };
  const addPlan = () => {
    if (!config) return;
    const suffix = Date.now().toString(36);
    setConfig({ ...config, plans: [...config.plans, { key: `new_plan_${suffix}`, name: 'New Activity Plan', active: false, stopConditions: ['customer_reply', 'meeting_booked', 'opportunity_won', 'opportunity_lost', 'manual_stop'], steps: [] }] });
  };

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><div className="flex items-center gap-3"><button onClick={() => navigate('/admin/app/crm?tab=activities')} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button><div><h1 className="text-xl font-black">Activity Execution Settings</h1><p className="text-xs text-slate-500">Activity types, outcomes, SLA, scheduling discipline and reusable follow-up plans.</p></div></div><button disabled={saving || !config} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />Save settings</button></div></header>
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">{error && <Notice tone="red">{error}</Notice>}{success && <Notice tone="green">{success}</Notice>}{loading || !config ? <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div> : <>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-[#000080]" /><h2 className="font-black">Execution discipline & SLA</h2></div><p className="mt-1 text-xs text-slate-500">These values feed the deterministic server queue and calendar-aware scheduling. They do not enable customer messaging.</p><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="No-next-action discipline"><select className={input} value={String(config.discipline.noNextActionEnabled)} onChange={e => setConfig({ ...config, discipline: { ...config.discipline, noNextActionEnabled: e.target.value === 'true' } })}><option value="true">Enabled</option><option value="false">Disabled</option></select></Field><Field label="Reason required after reschedules"><NumberInput value={config.discipline.rescheduleReasonRequiredAfter} onChange={value => setConfig({ ...config, discipline: { ...config.discipline, rescheduleReasonRequiredAfter: value } })} /></Field><Field label="High-value threshold"><NumberInput value={config.priority.highValueThreshold} onChange={value => setConfig({ ...config, priority: { ...config.priority, highValueThreshold: value } })} /></Field><Field label="High-value inactivity hours"><NumberInput value={config.priority.highValueInactivityHours} onChange={value => setConfig({ ...config, priority: { ...config.priority, highValueInactivityHours: value } })} /></Field><Field label="First response target hours"><NumberInput value={config.priority.firstResponseHours} onChange={value => setConfig({ ...config, priority: { ...config.priority, firstResponseHours: value } })} /></Field><Field label="Overdue SLA hours"><NumberInput value={config.priority.overdueSlaHours} onChange={value => setConfig({ ...config, priority: { ...config.priority, overdueSlaHours: value } })} /></Field><Field label="Quotation follow-up hours"><NumberInput value={config.priority.quotationFollowUpHours} onChange={value => setConfig({ ...config, priority: { ...config.priority, quotationFollowUpHours: value } })} /></Field><Field label="Meeting follow-up hours"><NumberInput value={config.priority.meetingFollowUpHours} onChange={value => setConfig({ ...config, priority: { ...config.priority, meetingFollowUpHours: value } })} /></Field></div><div className="mt-4 grid gap-4 sm:grid-cols-3"><Field label="Working day starts"><input type="time" className={input} value={config.workingHours.start} onChange={e => setConfig({ ...config, workingHours: { ...config.workingHours, start: e.target.value } })} /></Field><Field label="Working day ends"><input type="time" className={input} value={config.workingHours.end} onChange={e => setConfig({ ...config, workingHours: { ...config.workingHours, end: e.target.value } })} /></Field><Field label="Valid waiting states"><input className={input} value={config.discipline.validWaitingStates.join(', ')} onChange={e => setConfig({ ...config, discipline: { ...config.discipline, validWaitingStates: split(e.target.value) } })} /></Field></div></section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h2 className="font-black">Activity types & outcomes</h2><p className="mt-1 text-xs text-slate-500">Normal business configuration lives here instead of in application code.</p></div><button onClick={addType} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black"><Plus className="h-4 w-4" />Add type</button></div><div className="mt-5 space-y-4">{config.types.map((type, index) => <div key={`${type.name}-${index}`} className="rounded-2xl border border-slate-200 p-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="Name"><input className={input} value={type.name} onChange={e => patchType(index, { name: e.target.value })} /></Field><Field label="Category"><input className={input} value={type.category} onChange={e => patchType(index, { category: e.target.value })} /></Field><Field label="Channel"><input className={input} value={type.channel} onChange={e => patchType(index, { channel: e.target.value })} /></Field><Field label="Status"><select className={input} value={String(type.active)} onChange={e => patchType(index, { active: e.target.value === 'true' })}><option value="true">Active</option><option value="false">Inactive</option></select></Field><Field label="Default subject"><input className={input} value={type.defaultSubject} onChange={e => patchType(index, { defaultSubject: e.target.value })} /></Field><Field label="Default due minutes"><NumberInput value={type.defaultDueMinutes} onChange={value => patchType(index, { defaultDueMinutes: value })} /></Field><Field label="SLA hours"><NumberInput value={type.slaHours} onChange={value => patchType(index, { slaHours: value })} /></Field><Field label="Suggested next activity"><select className={input} value={type.suggestedNextActivity || ''} onChange={e => patchType(index, { suggestedNextActivity: e.target.value || undefined })}><option value="">None</option>{config.types.map(candidate => <option key={candidate.name} value={candidate.name}>{candidate.name}</option>)}</select></Field><Field label="Outcomes"><input className={input} value={type.outcomes.join(', ')} onChange={e => patchType(index, { outcomes: split(e.target.value) })} /></Field><Field label="Allowed roles"><input className={input} value={type.allowedRoles.join(', ')} onChange={e => patchType(index, { allowedRoles: split(e.target.value) })} /></Field><Field label="Required fields"><input className={input} value={type.requiredFields.join(', ')} onChange={e => patchType(index, { requiredFields: split(e.target.value) })} /></Field><Field label="Optional email template"><select className={input} value={type.emailTemplate || ''} onChange={e => patchType(index, { emailTemplate: e.target.value || null })}><option value="">None — manual activity</option>{templates.map(template => <option key={template.templateKey} value={template.templateKey}>{template.name}</option>)}</select></Field></div><Field label="Default instructions"><textarea rows={2} className={input} value={type.defaultInstructions} onChange={e => patchType(index, { defaultInstructions: e.target.value })} /></Field></div>)}</div></section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h2 className="font-black">Activity plans / sales cadences</h2><p className="mt-1 text-xs text-slate-500">Plans create canonical CRM activities. Customer emails still use the existing notification/automation architecture.</p></div><button onClick={addPlan} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black"><Plus className="h-4 w-4" />Add plan</button></div><div className="mt-5 space-y-5">{config.plans.map((plan, planIndex) => <PlanEditor key={plan.key} plan={plan} types={config.types} onChange={patch => patchPlan(planIndex, patch)} onDelete={() => setConfig({ ...config, plans: config.plans.filter((_, i) => i !== planIndex) })} />)}</div></section>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-800"><strong>Notification reuse:</strong> activity types may reference existing notification templates, but this settings page does not create another sender or outbox. Configure/test email content in <button onClick={() => navigate('/admin/automation-settings')} className="font-black underline">Notifications & Operational Automation</button>.</div>
    </>}</main>
  </div>;
}

function PlanEditor({ plan, types, onChange, onDelete }: { plan: ActivityPlanConfig; types: ActivityTypeConfig[]; onChange: (patch: Partial<ActivityPlanConfig>) => void; onDelete: () => void }) {
  const patchStep = (index: number, patch: Partial<ActivityPlanStep>) => onChange({ steps: plan.steps.map((step, i) => i === index ? { ...step, ...patch } : step) });
  const addStep = () => onChange({ steps: [...plan.steps, { key: `step_${plan.steps.length + 1}`, delayMinutes: plan.steps.length ? 1440 : 0, activityType: types.find(t => t.active)?.name || 'Follow-Up', subject: 'Follow up', channel: 'CRM', manual: true }] });
  return <div className="rounded-2xl border border-slate-200 p-5"><div className="flex items-start justify-between gap-3"><div className="grid flex-1 gap-3 md:grid-cols-3"><Field label="Plan name"><input className={input} value={plan.name} onChange={e => onChange({ name: e.target.value })} /></Field><Field label="Stable key"><input className={input} value={plan.key} onChange={e => onChange({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, '_') })} /></Field><Field label="Status"><select className={input} value={String(plan.active)} onChange={e => onChange({ active: e.target.value === 'true' })}><option value="true">Active</option><option value="false">Inactive</option></select></Field></div><button onClick={onDelete} className="rounded-xl p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div><Field label="Stop conditions"><input className={input} value={plan.stopConditions.join(', ')} onChange={e => onChange({ stopConditions: split(e.target.value) })} /></Field><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[880px] text-left"><thead><tr className="border-b border-slate-100 text-[9px] font-black uppercase tracking-widest text-slate-400"><th className="pb-2">Step key</th><th>Delay minutes</th><th>Activity type</th><th>Subject</th><th>Channel</th><th>Mode</th><th></th></tr></thead><tbody>{plan.steps.map((step, index) => <tr key={`${step.key}-${index}`} className="border-b border-slate-50"><td className="py-2 pr-2"><input className={input} value={step.key} onChange={e => patchStep(index, { key: e.target.value })} /></td><td className="pr-2"><NumberInput value={step.delayMinutes} onChange={value => patchStep(index, { delayMinutes: value })} /></td><td className="pr-2"><select className={input} value={step.activityType} onChange={e => patchStep(index, { activityType: e.target.value })}>{types.filter(t => t.active).map(type => <option key={type.name}>{type.name}</option>)}</select></td><td className="pr-2"><input className={input} value={step.subject} onChange={e => patchStep(index, { subject: e.target.value })} /></td><td className="pr-2"><input className={input} value={step.channel} onChange={e => patchStep(index, { channel: e.target.value })} /></td><td className="pr-2"><select className={input} value={step.manual === false ? 'automated' : 'manual'} onChange={e => patchStep(index, { manual: e.target.value !== 'automated' })}><option value="manual">Manual execution</option><option value="automated">Automation-managed</option></select></td><td><button onClick={() => onChange({ steps: plan.steps.filter((_, i) => i !== index) })} className="rounded-lg p-2 text-red-500"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div><button onClick={addStep} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black"><Plus className="h-4 w-4" />Add step</button><p className="mt-3 text-[10px] leading-4 text-slate-400">Automation-managed is configuration metadata for integration with the existing CRM/notification automation layer; this cadence runtime itself never bypasses that sender.</p></div>;
}

function NumberInput({ value, onChange }: { value: number; onChange: (value: number) => void }) { return <input type="number" min={0} className={input} value={value} onChange={e => onChange(Number(e.target.value))} />; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="mt-3 block"><span className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>{children}</label>; }
function split(value: string) { return value.split(',').map(item => item.trim()).filter(Boolean); }
function Notice({ tone, children }: { tone: 'red' | 'green'; children: React.ReactNode }) { return <div className={`rounded-2xl border p-4 text-sm font-semibold ${tone === 'red' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{children}</div>; }
