import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bot, Loader2, Plus, Save, Settings2, Trash2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import {
  CRMAutomationConfiguration,
  CRMAutomationRule,
  crmService,
  PipelineConfiguration,
} from '../../lib/crmService';
import { salesAutomationService, NotificationTemplate } from '../../lib/salesAutomationService';

const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#000080] focus:ring-4 focus:ring-blue-100';
const triggers = [
  'lead_created','assignment_changed','score_changed','follow_up_changed','activity_created','activity_completed','activity_cancelled',
  'meeting_scheduled','meeting_rescheduled','meeting_completed','meeting_cancelled','meeting_no_show','meeting_outcome_changed',
  'opportunity_created','opportunity_stage_changed','opportunity_owner_changed','opportunity_value_changed','opportunity_won','opportunity_lost',
  'quotation_created','quotation_approved','quotation_sent','quotation_viewed','quotation_accepted','quotation_rejected',
  'payment_requested','payment_status_changed','payment_verified','chat_message_received','email_reply'
];
const stopConditions = ['customer_reply','meeting_booked','quotation_accepted','payment_verified','opportunity_won','opportunity_lost'];

export default function CRMPipelineSettingsAdmin() {
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();
  const [pipeline, setPipeline] = useState<PipelineConfiguration | null>(null);
  const [automation, setAutomation] = useState<CRMAutomationConfiguration>({ version: 1, rules: [] });
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [p, a, t] = await Promise.all([
        crmService.getPipelineConfiguration(),
        crmService.getAutomationRules(),
        salesAutomationService.listTemplates(),
      ]);
      setPipeline(p); setAutomation(a || { version: 1, rules: [] }); setTemplates(t);
    } catch (e: any) { setError(e?.message || 'CRM settings could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);
  if (authLoading) return <div className="min-h-screen bg-slate-50" />;
  if (!isAdmin) return <Navigate to="/admin/workspace" replace />;

  const savePipeline = async () => {
    if (!pipeline) return;
    setSaving(true); setError(''); setSuccess('');
    try { setPipeline(await crmService.savePipelineConfiguration(pipeline)); setSuccess('Pipeline rules saved and audit history recorded.'); }
    catch (e: any) { setError(e?.message || 'Pipeline settings could not be saved.'); }
    finally { setSaving(false); }
  };
  const saveAutomation = async () => {
    setSaving(true); setError(''); setSuccess('');
    try { setAutomation(await crmService.saveAutomationRules(automation)); setSuccess('CRM automation rules saved and audit history recorded.'); }
    catch (e: any) { setError(e?.message || 'Automation settings could not be saved.'); }
    finally { setSaving(false); }
  };
  const addRule = () => setAutomation(current => ({ ...current, rules: [...current.rules, newRule()] }));
  const updateRule = (id: string, patch: Partial<CRMAutomationRule>) => setAutomation(current => ({ ...current, rules: current.rules.map(rule => rule.id === id ? { ...rule, ...patch } : rule) }));
  const removeRule = (id: string) => setAutomation(current => ({ ...current, rules: current.rules.filter(rule => rule.id !== id) }));

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><div className="flex items-center gap-3"><button onClick={() => navigate('/admin/app/crm?tab=pipeline')} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button><div><h1 className="text-xl font-black">CRM Pipeline & Automation</h1><p className="text-xs text-slate-500">Server-enforced stages, SLA targets and business-readable CRM automation.</p></div></div><button onClick={() => void load()} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black">Refresh</button></div></header>
    <main className="mx-auto max-w-7xl p-4 sm:p-8">
      {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
      {success && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{success}</div>}
      {loading || !pipeline ? <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div> : <>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-[#000080]" /><h2 className="font-black">Pipeline stages</h2></div><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">These rules are read by the same server RPC used by drag-and-drop. Won remains protected by verified payment regardless of UI settings.</p></div><button disabled={saving} onClick={() => void savePipeline()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" /> Save pipeline</button></div>
          <div className="mt-5 overflow-x-auto"><table className="min-w-[1050px] w-full text-left"><thead><tr className="border-b border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-400"><th className="pb-3">Stage</th><th className="pb-3">Order</th><th className="pb-3">Probability</th><th className="pb-3">SLA hours</th><th className="pb-3">Color</th><th className="pb-3">Active</th><th className="pb-3">Backward</th><th className="pb-3">Approval</th><th className="pb-3">Required fields</th></tr></thead><tbody>{pipeline.stages.map((stage, index) => <tr key={stage.name} className="border-b border-slate-100 align-top"><td className="py-3 pr-3"><div className="font-black text-xs text-slate-900">{stage.name}</div><div className="mt-1 text-[9px] text-slate-400">Next: {stage.allowedNext.join(', ') || 'None'}</div></td><td className="py-3 pr-3"><input type="number" value={stage.order} onChange={e => editStage(index, { order: Number(e.target.value) })} className={`${input} w-20`} /></td><td className="py-3 pr-3"><input type="number" min="0" max="100" value={stage.defaultProbability} onChange={e => editStage(index, { defaultProbability: Number(e.target.value) })} className={`${input} w-24`} /></td><td className="py-3 pr-3"><input type="number" min="0" value={stage.slaHours} onChange={e => editStage(index, { slaHours: Number(e.target.value) })} className={`${input} w-24`} /></td><td className="py-3 pr-3"><input type="color" value={stage.color} onChange={e => editStage(index, { color: e.target.value })} className="h-10 w-14 rounded-lg border border-slate-200 bg-white p-1" /></td><td className="py-4 pr-3"><input type="checkbox" checked={stage.active} disabled={stage.name === 'Won'} onChange={e => editStage(index, { active: e.target.checked })} /></td><td className="py-4 pr-3"><input type="checkbox" checked={stage.allowBackward} onChange={e => editStage(index, { allowBackward: e.target.checked })} /></td><td className="py-4 pr-3"><input type="checkbox" checked={stage.approvalRequired} disabled={stage.name === 'Won'} onChange={e => editStage(index, { approvalRequired: e.target.checked })} /></td><td className="py-3"><input value={stage.requiredFields.join(', ')} onChange={e => editStage(index, { requiredFields: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })} className={input} placeholder="requirementsSummary, email" /></td></tr>)}</tbody></table></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3"><Field label="No meaningful activity after hours"><input type="number" min="1" value={pipeline.health.noActivityHours} onChange={e => setPipeline({ ...pipeline, health: { ...pipeline.health, noActivityHours: Number(e.target.value) } })} className={input} /></Field><Field label="High-value threshold"><input type="number" min="0" value={pipeline.health.highValueThreshold} onChange={e => setPipeline({ ...pipeline, health: { ...pipeline.health, highValueThreshold: Number(e.target.value) } })} className={input} /></Field><Field label="High-value inactivity hours"><input type="number" min="1" value={pipeline.health.highValueInactivityHours} onChange={e => setPipeline({ ...pipeline, health: { ...pipeline.health, highValueInactivityHours: Number(e.target.value) } })} className={input} /></Field></div>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><Bot className="h-5 w-5 text-[#000080]" /><h2 className="font-black">CRM automation manager</h2></div><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">WHEN → IF → WAIT → DO → STOP WHEN. Rules start disabled and reuse the existing notification templates, outbox, CRM activities, in-app notifications and permanent timeline.</p></div><div className="flex gap-2"><button onClick={addRule} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black"><Plus className="h-4 w-4" /> Add rule</button><button disabled={saving} onClick={() => void saveAutomation()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" /> Save automation</button></div></div>
          <div className="mt-5 space-y-4">{automation.rules.map(rule => <AutomationRuleEditor key={rule.id} rule={rule} pipeline={pipeline} templates={templates} onChange={patch => updateRule(rule.id, patch)} onDelete={() => removeRule(rule.id)} />)}{automation.rules.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center"><div className="text-sm font-black text-slate-700">No CRM automation rules yet</div><p className="mt-1 text-xs text-slate-400">Nothing will send or create automatically until an Admin adds and enables a rule.</p></div>}</div>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">Email body, subject, approved variables, provider and test-send remain managed in the existing <button onClick={() => navigate('/admin/automation-settings')} className="font-black text-[#000080] underline">Notifications & Operational Automation</button> workspace. CRM rules reference those canonical templates instead of copying them.</div>
        </section>
      </>}
    </main>
  </div>;

  function editStage(index: number, patch: Partial<PipelineConfiguration['stages'][number]>) {
    if (!pipeline) return;
    setPipeline({ ...pipeline, stages: pipeline.stages.map((stage, i) => i === index ? { ...stage, ...patch } : stage) });
  }
}

function AutomationRuleEditor({ rule, pipeline, templates, onChange, onDelete }: { rule: CRMAutomationRule; pipeline: PipelineConfiguration; templates: NotificationTemplate[]; onChange: (patch: Partial<CRMAutomationRule>) => void; onDelete: () => void }) {
  const emailAction = rule.actions.find(action => action.type === 'send_email');
  const activityAction = rule.actions.find(action => action.type === 'create_activity' || action.type === 'schedule_follow_up');
  const actionType = emailAction ? 'send_email' : activityAction?.type || rule.actions[0]?.type || 'in_app_notification';
  const setAction = (type: CRMAutomationRule['actions'][number]['type']) => {
    if (type === 'send_email') onChange({ actions: [{ type, templateKey: templates[0]?.templateKey || '' }] });
    else if (type === 'schedule_follow_up') onChange({ actions: [{ type, activityType: 'Follow-Up', subject: 'CRM follow-up', dueMinutes: 60 }] });
    else if (type === 'create_activity') onChange({ actions: [{ type, activityType: 'Other', subject: 'CRM action required', dueMinutes: 60 }] });
    else onChange({ actions: [{ type, title: 'CRM action required', message: rule.name || 'CRM automation requires attention.' }] });
  };
  const updateFirstAction = (patch: Record<string, unknown>) => onChange({ actions: [{ ...(rule.actions[0] || { type: 'in_app_notification' }), ...patch } as any] });
  const stage = typeof rule.conditions.stage === 'string' ? rule.conditions.stage : '';
  return <div className="rounded-2xl border border-slate-200 p-5"><div className="flex items-center justify-between gap-3"><label className="flex items-center gap-2"><input type="checkbox" checked={rule.enabled} onChange={e => onChange({ enabled: e.target.checked })} /><span className={`text-xs font-black ${rule.enabled ? 'text-emerald-700' : 'text-slate-500'}`}>{rule.enabled ? 'Enabled' : 'Disabled'}</span></label><button onClick={onDelete} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-5"><Field label="Automation name"><input value={rule.name} onChange={e => onChange({ name: e.target.value })} className={input} /></Field><Field label="WHEN"><select value={rule.trigger} onChange={e => onChange({ trigger: e.target.value })} className={input}>{triggers.map(trigger => <option key={trigger}>{trigger}</option>)}</select></Field><Field label="IF stage (optional)"><select value={stage} onChange={e => onChange({ conditions: { ...rule.conditions, stage: e.target.value || undefined } })} className={input}><option value="">Any stage</option>{pipeline.stages.map(item => <option key={item.name}>{item.name}</option>)}</select></Field><Field label="WAIT minutes"><input type="number" min="0" max="43200" value={rule.waitMinutes} onChange={e => onChange({ waitMinutes: Number(e.target.value) })} className={input} /></Field><Field label="DO"><select value={actionType} onChange={e => setAction(e.target.value as any)} className={input}><option value="send_email">Send email</option><option value="schedule_follow_up">Schedule follow-up</option><option value="create_activity">Create activity</option><option value="in_app_notification">In-app notification</option></select></Field></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">{actionType === 'send_email' && <Field label="Existing notification template"><select value={rule.actions[0]?.templateKey || ''} onChange={e => updateFirstAction({ templateKey: e.target.value })} className={input}><option value="">Choose template</option>{templates.map(template => <option key={template.templateKey} value={template.templateKey}>{template.name}</option>)}</select></Field>}{(actionType === 'schedule_follow_up' || actionType === 'create_activity') && <><Field label="Activity subject"><input value={rule.actions[0]?.subject || ''} onChange={e => updateFirstAction({ subject: e.target.value })} className={input} /></Field><Field label="Due in minutes"><input type="number" min="0" value={rule.actions[0]?.dueMinutes || 60} onChange={e => updateFirstAction({ dueMinutes: Number(e.target.value) })} className={input} /></Field></>}{actionType === 'in_app_notification' && <><Field label="Notification title"><input value={rule.actions[0]?.title || ''} onChange={e => updateFirstAction({ title: e.target.value })} className={input} /></Field><Field label="Message"><input value={rule.actions[0]?.message || ''} onChange={e => updateFirstAction({ message: e.target.value })} className={input} /></Field>}</div>
    <div className="mt-4"><div className="mb-2 text-[9px] font-black uppercase tracking-widest text-slate-400">STOP WHEN</div><div className="flex flex-wrap gap-2">{stopConditions.map(stop => <label key={stop} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600"><input type="checkbox" checked={rule.stopWhen.includes(stop)} onChange={e => onChange({ stopWhen: e.target.checked ? [...rule.stopWhen, stop] : rule.stopWhen.filter(item => item !== stop) })} />{stop}</label>)}</div></div>
  </div>;
}

function newRule(): CRMAutomationRule {
  return { id: crypto.randomUUID(), name: 'New CRM automation', enabled: false, trigger: 'opportunity_stage_changed', conditions: {}, waitMinutes: 0, actions: [{ type: 'in_app_notification', title: 'CRM action required', message: 'Review this opportunity.' }], stopWhen: ['opportunity_won','opportunity_lost'], allowReentry: false };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>{children}</label>;
}
