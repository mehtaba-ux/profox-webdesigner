import React, { useEffect, useState } from 'react';
import { ArrowLeft, Bot, Loader2, Plus, Save, Settings2, Trash2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import {
  CRMAutomationConfiguration,
  CRMAutomationRule,
  crmService,
  PipelineConfiguration,
  PipelineStageConfig,
} from '../../lib/crmService';
import { NotificationTemplate, salesAutomationService } from '../../lib/salesAutomationService';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#000080] focus:ring-4 focus:ring-blue-100';

const triggerOptions = [
  'lead_created', 'assignment_changed', 'score_changed', 'follow_up_changed',
  'activity_created', 'activity_completed', 'activity_cancelled',
  'meeting_scheduled', 'meeting_rescheduled', 'meeting_completed', 'meeting_cancelled', 'meeting_no_show', 'meeting_outcome_changed',
  'opportunity_created', 'opportunity_stage_changed', 'opportunity_owner_changed', 'opportunity_value_changed', 'opportunity_won', 'opportunity_lost',
  'quotation_created', 'quotation_approved', 'quotation_sent', 'quotation_viewed', 'quotation_accepted', 'quotation_rejected',
  'payment_requested', 'payment_status_changed', 'payment_verified', 'chat_message_received', 'email_reply',
];
const stopOptions = ['customer_reply', 'meeting_booked', 'quotation_accepted', 'payment_verified', 'opportunity_won', 'opportunity_lost'];
const qualityOptions = ['', 'High', 'Medium', 'Low'];

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
    setLoading(true);
    setError('');
    try {
      const [pipelineConfig, automationConfig, notificationTemplates] = await Promise.all([
        crmService.getPipelineConfiguration(),
        crmService.getAutomationRules(),
        salesAutomationService.listTemplates(),
      ]);
      setPipeline(pipelineConfig);
      setAutomation(automationConfig || { version: 1, rules: [] });
      setTemplates(notificationTemplates);
    } catch (e: any) {
      setError(e?.message || 'CRM settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);

  if (authLoading) return <div className="min-h-screen bg-slate-50" />;
  if (!isAdmin) return <Navigate to="/admin/workspace" replace />;

  const editStage = (index: number, patch: Partial<PipelineStageConfig>) => {
    if (!pipeline) return;
    setPipeline({ ...pipeline, stages: pipeline.stages.map((stage, i) => i === index ? { ...stage, ...patch } : stage) });
  };

  const savePipeline = async () => {
    if (!pipeline) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      setPipeline(await crmService.savePipelineConfiguration(pipeline));
      setSuccess('Pipeline rules saved. The existing configuration audit trail recorded the change.');
    } catch (e: any) {
      setError(e?.message || 'Pipeline settings could not be saved.');
    } finally { setSaving(false); }
  };

  const saveAutomation = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      setAutomation(await crmService.saveAutomationRules(automation));
      setSuccess('CRM automation rules saved. The existing configuration audit trail recorded the change.');
    } catch (e: any) {
      setError(e?.message || 'Automation settings could not be saved.');
    } finally { setSaving(false); }
  };

  const addRule = () => setAutomation(current => ({ ...current, rules: [...current.rules, createRule()] }));
  const updateRule = (id: string, patch: Partial<CRMAutomationRule>) => setAutomation(current => ({ ...current, rules: current.rules.map(rule => rule.id === id ? { ...rule, ...patch } : rule) }));
  const removeRule = (id: string) => setAutomation(current => ({ ...current, rules: current.rules.filter(rule => rule.id !== id) }));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/admin/app/crm?tab=pipeline')} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button>
            <div><h1 className="text-xl font-black">CRM Pipeline & Automation</h1><p className="text-xs text-slate-500">Server-enforced stages, SLA targets and business-readable CRM automation.</p></div>
          </div>
          <button onClick={() => void load()} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black">Refresh</button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 sm:p-8">
        {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
        {success && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{success}</div>}

        {loading || !pipeline ? (
          <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>
        ) : (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-[#000080]" /><h2 className="font-black">Pipeline stages</h2></div>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">These values drive the same server RPC used by drag-and-drop. Allowed transitions, backward movement, skipping, required fields and approval are enforced on the server.</p>
                </div>
                <button disabled={saving} onClick={() => void savePipeline()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" /> Save pipeline</button>
              </div>

              <div className="mt-5 space-y-4">
                {pipeline.stages.map((stage, index) => (
                  <StageEditor key={stage.name} stage={stage} allStages={pipeline.stages} onChange={patch => editStage(index, patch)} />
                ))}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <Field label="No meaningful activity after hours"><input type="number" min={1} value={pipeline.health.noActivityHours} onChange={e => setPipeline({ ...pipeline, health: { ...pipeline.health, noActivityHours: Number(e.target.value) } })} className={inputClass} /></Field>
                <Field label="High-value threshold"><input type="number" min={0} value={pipeline.health.highValueThreshold} onChange={e => setPipeline({ ...pipeline, health: { ...pipeline.health, highValueThreshold: Number(e.target.value) } })} className={inputClass} /></Field>
                <Field label="High-value inactivity hours"><input type="number" min={1} value={pipeline.health.highValueInactivityHours} onChange={e => setPipeline({ ...pipeline, health: { ...pipeline.health, highValueInactivityHours: Number(e.target.value) } })} className={inputClass} /></Field>
              </div>
            </section>

            <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-[#000080]" /><h2 className="font-black">CRM automation manager</h2></div>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">WHEN → IF → WAIT → DO → STOP WHEN. Rules start disabled and reuse notification templates, outbox, CRM activities, in-app notifications and the permanent timeline.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={addRule} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black"><Plus className="h-4 w-4" /> Add rule</button>
                  <button disabled={saving} onClick={() => void saveAutomation()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" /> Save automation</button>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {automation.rules.map(rule => <AutomationRuleEditor key={rule.id} rule={rule} pipeline={pipeline} templates={templates} onChange={patch => updateRule(rule.id, patch)} onDelete={() => removeRule(rule.id)} />)}
                {automation.rules.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center"><div className="text-sm font-black text-slate-700">No CRM automation rules yet</div><p className="mt-1 text-xs text-slate-400">Nothing sends or creates automatically until an Admin adds and enables a rule.</p></div>}
              </div>

              <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
                Email subject, body, variables, sender configuration and test-send stay in the existing <button onClick={() => navigate('/admin/automation-settings')} className="font-black text-[#000080] underline">Notifications & Operational Automation</button> workspace. CRM rules reference those canonical templates instead of copying them.
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function StageEditor({ stage, allStages, onChange }: { stage: PipelineStageConfig; allStages: PipelineStageConfig[]; onChange: (patch: Partial<PipelineStageConfig>) => void }) {
  const toggleTransition = (field: 'allowedNext' | 'allowedPrevious', name: string, checked: boolean) => {
    const current = stage[field];
    onChange({ [field]: checked ? Array.from(new Set([...current, name])) : current.filter(item => item !== name) });
  };
  const alternatives = allStages.filter(item => item.name !== stage.name);
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0"><div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: stage.color }} /><h3 className="text-sm font-black">{stage.name}</h3></div><p className="mt-1 text-[10px] font-semibold text-slate-400">Classification: {stage.classification}</p></div>
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-4xl lg:grid-cols-5">
          <Field label="Display order"><input type="number" value={stage.order} onChange={e => onChange({ order: Number(e.target.value) })} className={inputClass} /></Field>
          <Field label="Probability %"><input type="number" min={0} max={100} value={stage.defaultProbability} onChange={e => onChange({ defaultProbability: Number(e.target.value) })} className={inputClass} /></Field>
          <Field label="SLA hours"><input type="number" min={0} value={stage.slaHours} onChange={e => onChange({ slaHours: Number(e.target.value) })} className={inputClass} /></Field>
          <Field label="Color"><input type="color" value={stage.color} onChange={e => onChange({ color: e.target.value })} className="h-[42px] w-full rounded-xl border border-slate-200 bg-white p-1" /></Field>
          <Field label="Required fields"><input value={stage.requiredFields.join(', ')} onChange={e => onChange({ requiredFields: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })} className={inputClass} placeholder="email, requirementsSummary" /></Field>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Toggle label="Active" checked={stage.active} disabled={stage.name === 'Won'} onChange={checked => onChange({ active: checked })} />
        <Toggle label="Allow stage skipping" checked={stage.allowSkip} disabled={stage.name === 'Won'} onChange={checked => onChange({ allowSkip: checked })} />
        <Toggle label="Allow moving backward" checked={stage.allowBackward} onChange={checked => onChange({ allowBackward: checked })} />
        <Toggle label="Manager/Admin approval required" checked={stage.approvalRequired} disabled={stage.name === 'Won'} onChange={checked => onChange({ approvalRequired: checked })} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <TransitionList title="Allowed next stages" stages={alternatives} selected={stage.allowedNext} onToggle={(name, checked) => toggleTransition('allowedNext', name, checked)} />
        <TransitionList title="Allowed previous stages" stages={alternatives} selected={stage.allowedPrevious} onToggle={(name, checked) => toggleTransition('allowedPrevious', name, checked)} />
      </div>
    </div>
  );
}

function TransitionList({ title, stages, selected, onToggle }: { title: string; stages: PipelineStageConfig[]; selected: string[]; onToggle: (name: string, checked: boolean) => void }) {
  return <div><div className="mb-2 text-[9px] font-black uppercase tracking-widest text-slate-400">{title}</div><div className="flex flex-wrap gap-2">{stages.map(candidate => <label key={candidate.name} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600"><input type="checkbox" checked={selected.includes(candidate.name)} onChange={e => onToggle(candidate.name, e.target.checked)} />{candidate.name}</label>)}</div></div>;
}

function AutomationRuleEditor({ rule, pipeline, templates, onChange, onDelete }: { rule: CRMAutomationRule; pipeline: PipelineConfiguration; templates: NotificationTemplate[]; onChange: (patch: Partial<CRMAutomationRule>) => void; onDelete: () => void }) {
  const action = rule.actions[0] || { type: 'in_app_notification' as const };
  const condition = (name: string) => typeof rule.conditions[name] === 'string' ? String(rule.conditions[name]) : '';
  const numberCondition = (name: string) => typeof rule.conditions[name] === 'number' ? Number(rule.conditions[name]) : '';
  const patchConditions = (patch: Record<string, unknown>) => onChange({ conditions: { ...rule.conditions, ...patch } });

  const replaceAction = (type: CRMAutomationRule['actions'][number]['type']) => {
    if (type === 'send_email') onChange({ actions: [{ type, templateKey: templates[0]?.templateKey || '' }] });
    else if (type === 'schedule_follow_up') onChange({ actions: [{ type, activityType: 'Follow-Up', subject: 'CRM follow-up', dueMinutes: 60 }] });
    else if (type === 'create_activity') onChange({ actions: [{ type, activityType: 'Other', subject: 'CRM action required', dueMinutes: 60 }] });
    else onChange({ actions: [{ type, title: 'CRM action required', message: rule.name || 'Review this opportunity.' }] });
  };
  const patchAction = (patch: Record<string, unknown>) => onChange({ actions: [{ ...action, ...patch } as CRMAutomationRule['actions'][number]] });
  const toggleStop = (stop: string, checked: boolean) => onChange({ stopWhen: checked ? Array.from(new Set([...rule.stopWhen, stop])) : rule.stopWhen.filter(item => item !== stop) });

  return (
    <div className="rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2"><input type="checkbox" checked={rule.enabled} onChange={e => onChange({ enabled: e.target.checked })} /><span className={`text-xs font-black ${rule.enabled ? 'text-emerald-700' : 'text-slate-500'}`}>{rule.enabled ? 'Enabled' : 'Disabled'}</span></label>
        <button onClick={onDelete} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Field label="Automation name"><input value={rule.name} onChange={e => onChange({ name: e.target.value })} className={inputClass} /></Field>
        <Field label="WHEN"><select value={rule.trigger} onChange={e => onChange({ trigger: e.target.value })} className={inputClass}>{triggerOptions.map(trigger => <option key={trigger}>{trigger}</option>)}</select></Field>
        <Field label="IF stage"><select value={condition('stage')} onChange={e => patchConditions({ stage: e.target.value || undefined })} className={inputClass}><option value="">Any stage</option>{pipeline.stages.map(stage => <option key={stage.name}>{stage.name}</option>)}</select></Field>
        <Field label="WAIT minutes"><input type="number" min={0} max={43200} value={rule.waitMinutes} onChange={e => onChange({ waitMinutes: Number(e.target.value) })} className={inputClass} /></Field>
        <Field label="DO"><select value={action.type} onChange={e => replaceAction(e.target.value as CRMAutomationRule['actions'][number]['type'])} className={inputClass}><option value="send_email">Send email</option><option value="schedule_follow_up">Schedule follow-up</option><option value="create_activity">Create activity</option><option value="in_app_notification">In-app notification</option></select></Field>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="IF lead source"><input value={condition('leadSource')} onChange={e => patchConditions({ leadSource: e.target.value || undefined })} className={inputClass} placeholder="Optional" /></Field>
        <Field label="IF lead quality"><select value={condition('leadQuality')} onChange={e => patchConditions({ leadQuality: e.target.value || undefined })} className={inputClass}>{qualityOptions.map(option => <option key={option} value={option}>{option || 'Any quality'}</option>)}</select></Field>
        <Field label="IF service"><input value={condition('serviceInterest')} onChange={e => patchConditions({ serviceInterest: e.target.value || undefined })} className={inputClass} placeholder="Optional" /></Field>
        <Field label="IF country"><input value={condition('country')} onChange={e => patchConditions({ country: e.target.value || undefined })} className={inputClass} placeholder="Optional" /></Field>
        <Field label="IF minimum value"><input type="number" min={0} value={numberCondition('minDealValue')} onChange={e => patchConditions({ minDealValue: e.target.value === '' ? undefined : Number(e.target.value) })} className={inputClass} placeholder="Optional" /></Field>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {action.type === 'send_email' && <Field label="Existing notification template"><select value={action.templateKey || ''} onChange={e => patchAction({ templateKey: e.target.value })} className={inputClass}><option value="">Choose template</option>{templates.map(template => <option key={template.templateKey} value={template.templateKey}>{template.name}</option>)}</select></Field>}
        {(action.type === 'schedule_follow_up' || action.type === 'create_activity') && <><Field label="Activity subject"><input value={action.subject || ''} onChange={e => patchAction({ subject: e.target.value })} className={inputClass} /></Field><Field label="Due in minutes"><input type="number" min={0} value={action.dueMinutes || 60} onChange={e => patchAction({ dueMinutes: Number(e.target.value) })} className={inputClass} /></Field></>}
        {action.type === 'in_app_notification' && <><Field label="Notification title"><input value={action.title || ''} onChange={e => patchAction({ title: e.target.value })} className={inputClass} /></Field><Field label="Message"><input value={action.message || ''} onChange={e => patchAction({ message: e.target.value })} className={inputClass} /></Field></>}
      </div>

      <div className="mt-4"><div className="mb-2 text-[9px] font-black uppercase tracking-widest text-slate-400">STOP WHEN</div><div className="flex flex-wrap gap-2">{stopOptions.map(stop => <label key={stop} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600"><input type="checkbox" checked={rule.stopWhen.includes(stop)} onChange={e => toggleStop(stop, e.target.checked)} />{stop}</label>)}</div></div>
    </div>
  );
}

function createRule(): CRMAutomationRule {
  return { id: crypto.randomUUID(), name: 'New CRM automation', enabled: false, trigger: 'opportunity_stage_changed', conditions: {}, waitMinutes: 0, actions: [{ type: 'in_app_notification', title: 'CRM action required', message: 'Review this opportunity.' }], stopWhen: ['opportunity_won', 'opportunity_lost'], allowReentry: false };
}

function Toggle({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <label className={`flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 ${disabled ? 'opacity-50' : ''}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />{label}</label>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>{children}</label>;
}
