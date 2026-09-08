import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, ClipboardList, Edit3, Loader2, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import {
  CRM_INFORMATION_CERTAINTY,
  CRM_REQUIREMENT_MANUAL_SOURCE,
  CRMInformationCertainty,
  CRMRequirement,
  CRMRequirementDefinition,
  CRMSalesDiscoveryWorkspace,
  crmSalesDiscoveryService,
} from '../../../lib/crmSalesDiscoveryService';
import { calculateRequirementCoverage, createCustomRequirementKey, hasMeaningfulRequirementValue } from '../../../lib/crmRequirementUtils';
import {
  SellerGuidanceEntry,
  getCertaintyGuidance,
  getQuestionClassGuidance,
  getRequirementGuidance,
  getSellerGuidance,
} from '../../../lib/crmSellerGuidance';
import SellerGuidanceHelp from './SellerGuidanceHelp';

export type CRMRequirementsWorkspaceProps = {
  leadId?: string;
  opportunityId?: string;
  refreshKey?: string;
  onChanged?: (message: string) => Promise<void> | void;
};

type RequirementFilter = 'all' | 'missing' | 'confirmed' | 'awaiting' | 'validation' | 'custom';
type RequirementDraft = { title: string; category: string; content: string; certainty: CRMInformationCertainty };
type Category = { key: string; label: string; group: 'core' | 'additional' };

const CATEGORIES: Category[] = [
  { key: 'BUSINESS', label: 'Business', group: 'core' },
  { key: 'PROBLEM', label: 'Problem', group: 'core' },
  { key: 'DESIRED_OUTCOME', label: 'Desired outcome', group: 'core' },
  { key: 'AUDIENCE_CUSTOMER', label: 'Audience / Customer', group: 'core' },
  { key: 'PROJECT_SCOPE', label: 'Project / Scope', group: 'core' },
  { key: 'CONTENT', label: 'Content', group: 'core' },
  { key: 'BRAND', label: 'Brand', group: 'core' },
  { key: 'COMMERCIAL', label: 'Commercial', group: 'core' },
  { key: 'DECISION_BUYING_PROCESS', label: 'Decision / Buying process', group: 'core' },
  { key: 'RISKS_DEPENDENCIES', label: 'Risks / Dependencies', group: 'core' },
  { key: 'INTEGRATIONS', label: 'Integrations', group: 'additional' },
  { key: 'ECOMMERCE', label: 'E-commerce', group: 'additional' },
  { key: 'BOOKING', label: 'Booking', group: 'additional' },
  { key: 'SEO', label: 'SEO', group: 'additional' },
  { key: 'ANALYTICS', label: 'Analytics', group: 'additional' },
  { key: 'TECHNICAL', label: 'Technical', group: 'additional' },
  { key: 'CUSTOM_APPLICATION', label: 'Custom Application', group: 'additional' },
];
const CORE_CATEGORY_KEYS = CATEGORIES.filter(item => item.group === 'core').map(item => item.key);
const FILTERS: Array<{ id: RequirementFilter; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'missing', label: 'Missing / not captured' }, { id: 'confirmed', label: 'Client confirmed' },
  { id: 'awaiting', label: 'Awaiting client' }, { id: 'validation', label: 'Needs validation' }, { id: 'custom', label: 'Custom' },
];
const CERTAINTY: Record<CRMInformationCertainty, { label: string; tone: string }> = {
  CLIENT_CONFIRMED: { label: 'Client confirmed', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  SELLER_OBSERVATION: { label: 'Seller observation', tone: 'border-blue-200 bg-blue-50 text-[#000080]' },
  SELLER_HYPOTHESIS: { label: 'Seller hypothesis', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  AWAITING_CLIENT: { label: 'Awaiting client', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  NEEDS_SPECIALIST_VALIDATION: { label: 'Needs specialist validation', tone: 'border-rose-200 bg-rose-50 text-rose-700' },
  NOT_APPLICABLE: { label: 'Not applicable', tone: 'border-slate-200 bg-slate-100 text-slate-600' },
};

const fmt = (value?: string | null) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not recorded';
const sourceLabel = (source?: string | null) => !source ? 'Source not recorded' : source === CRM_REQUIREMENT_MANUAL_SOURCE ? 'Manual Seller entry' : source.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const emptyCustom = (): RequirementDraft => ({ title: '', category: 'PROJECT_SCOPE', content: '', certainty: 'AWAITING_CLIENT' });
const standardDraft = (definition: CRMRequirementDefinition, requirement?: CRMRequirement): RequirementDraft => ({
  title: definition.title,
  category: definition.category,
  content: requirement?.content || '',
  certainty: requirement?.information_certainty || 'AWAITING_CLIENT',
});
const customDraft = (requirement: CRMRequirement): RequirementDraft => ({ title: requirement.title, category: requirement.category, content: requirement.content || '', certainty: requirement.information_certainty });

export default function CRMRequirementsWorkspace({ leadId, opportunityId, refreshKey, onChanged }: CRMRequirementsWorkspaceProps) {
  const [workspace, setWorkspace] = useState<CRMSalesDiscoveryWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [filter, setFilter] = useState<RequirementFilter>('all');
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set(CORE_CATEGORY_KEYS));
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<RequirementDraft | null>(null);
  const [busyKey, setBusyKey] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [newCustom, setNewCustom] = useState<RequirementDraft>(() => emptyCustom());

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!leadId && !opportunityId) {
      setWorkspace(null); setLoading(false); setError('A connected Lead or Opportunity is required to load Requirements.'); return;
    }
    mode === 'refresh' ? setRefreshing(true) : setLoading(true);
    setError('');
    try { setWorkspace(await crmSalesDiscoveryService.getWorkspace({ leadId, opportunityId })); }
    catch { setError('Requirements could not be loaded. Check your CRM access and try again.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [leadId, opportunityId]);

  useEffect(() => {
    setWorkspace(null); setEditingKey(null); setDraft(null); setCustomOpen(false); setNewCustom(emptyCustom()); setOpenCategories(new Set(CORE_CATEGORY_KEYS));
    void load('initial');
  }, [load, refreshKey]);

  const definitions = useMemo(() => (workspace?.requirementDefinitions || []).filter(item => item.active), [workspace]);
  const activeRequirements = useMemo(() => (workspace?.requirements || []).filter(item => item.record_state === 'ACTIVE'), [workspace]);
  const standardByKey = useMemo(() => new Map(activeRequirements.filter(item => !item.is_custom).map(item => [item.requirement_key, item])), [activeRequirements]);
  const customRequirements = useMemo(() => activeRequirements.filter(item => item.is_custom), [activeRequirements]);
  const coverage = useMemo(() => calculateRequirementCoverage(definitions, activeRequirements), [definitions, activeRequirements]);

  const visibleStandard = useMemo(() => definitions.filter(definition => {
    const requirement = standardByKey.get(definition.requirementKey);
    if (filter === 'custom') return false;
    if (filter === 'missing') return !requirement || (!hasMeaningfulRequirementValue(requirement) && requirement.information_certainty !== 'NOT_APPLICABLE');
    if (filter === 'confirmed') return requirement?.information_certainty === 'CLIENT_CONFIRMED';
    if (filter === 'awaiting') return requirement?.information_certainty === 'AWAITING_CLIENT';
    if (filter === 'validation') return requirement?.information_certainty === 'SELLER_HYPOTHESIS' || requirement?.information_certainty === 'NEEDS_SPECIALIST_VALIDATION';
    return true;
  }), [definitions, standardByKey, filter]);
  const visibleCustom = useMemo(() => customRequirements.filter(requirement => {
    if (filter === 'missing') return false;
    if (filter === 'confirmed') return requirement.information_certainty === 'CLIENT_CONFIRMED';
    if (filter === 'awaiting') return requirement.information_certainty === 'AWAITING_CLIENT';
    if (filter === 'validation') return requirement.information_certainty === 'SELLER_HYPOTHESIS' || requirement.information_certainty === 'NEEDS_SPECIALIST_VALIDATION';
    return true;
  }), [customRequirements, filter]);

  const saveStandard = async (definition: CRMRequirementDefinition) => {
    if (!workspace || !draft) return;
    const existing = standardByKey.get(definition.requirementKey);
    if (!draft.content.trim() && draft.certainty !== 'NOT_APPLICABLE') { setActionError('Add Requirement details or mark it Not applicable.'); return; }
    setBusyKey(definition.requirementKey); setActionError('');
    try {
      await crmSalesDiscoveryService.saveRequirement({
        id: existing?.id, leadId: workspace.leadId, requirementKey: definition.requirementKey, category: definition.category, title: definition.title,
        content: draft.content.trim() || undefined, structuredValue: existing?.structured_value ?? null, isCustom: false, informationCertainty: draft.certainty,
        source: { type: CRM_REQUIREMENT_MANUAL_SOURCE, recordedAt: new Date().toISOString() },
      });
      setEditingKey(null); setDraft(null); await load('refresh'); await onChanged?.(`${definition.title} requirement saved.`);
    } catch { setActionError('This Requirement could not be saved. Your unsaved text is still here; review it and try again.'); }
    finally { setBusyKey(''); }
  };

  const saveCustom = async (requirement: CRMRequirement) => {
    if (!workspace || !draft || !draft.title.trim()) { setActionError('Requirement title is required.'); return; }
    if (!draft.content.trim() && draft.certainty !== 'NOT_APPLICABLE') { setActionError('Add Requirement details or mark it Not applicable.'); return; }
    setBusyKey(requirement.requirement_key); setActionError('');
    try {
      await crmSalesDiscoveryService.saveRequirement({
        id: requirement.id, leadId: workspace.leadId, requirementKey: requirement.requirement_key, category: draft.category, title: draft.title.trim(),
        content: draft.content.trim() || undefined, structuredValue: requirement.structured_value ?? null, isCustom: true, informationCertainty: draft.certainty,
        source: { type: CRM_REQUIREMENT_MANUAL_SOURCE, recordedAt: new Date().toISOString() },
      });
      setEditingKey(null); setDraft(null); await load('refresh'); await onChanged?.('Custom Requirement updated.');
    } catch { setActionError('This custom Requirement could not be saved. Your unsaved text is still here; review it and try again.'); }
    finally { setBusyKey(''); }
  };

  const addCustom = async () => {
    if (!workspace || !newCustom.title.trim()) { setActionError('Requirement title is required.'); return; }
    if (!newCustom.content.trim() && newCustom.certainty !== 'NOT_APPLICABLE') { setActionError('Add Requirement details or mark it Not applicable.'); return; }
    const requirementKey = createCustomRequirementKey(activeRequirements.map(item => item.requirement_key));
    setBusyKey('custom-new'); setActionError('');
    try {
      await crmSalesDiscoveryService.saveRequirement({
        leadId: workspace.leadId, requirementKey, category: newCustom.category, title: newCustom.title.trim(), content: newCustom.content.trim() || undefined,
        structuredValue: null, isCustom: true, informationCertainty: newCustom.certainty, source: { type: CRM_REQUIREMENT_MANUAL_SOURCE, recordedAt: new Date().toISOString() },
      });
      setNewCustom(emptyCustom()); setCustomOpen(false); await load('refresh'); await onChanged?.('Custom Requirement added.');
    } catch { setActionError('The custom Requirement could not be saved. Your unsaved text is still here; review it and try again.'); }
    finally { setBusyKey(''); }
  };

  const archiveCustom = async (requirement: CRMRequirement) => {
    if (!workspace || !requirement.is_custom) return;
    if (!window.confirm(`Archive “${requirement.title}”? The discovery record will stay in history and will not be hard-deleted.`)) return;
    setBusyKey(requirement.requirement_key); setActionError('');
    try { await crmSalesDiscoveryService.archiveRequirement(workspace.leadId, requirement.id); await load('refresh'); await onChanged?.('Custom Requirement archived.'); }
    catch { setActionError('The custom Requirement could not be archived. Try again.'); }
    finally { setBusyKey(''); }
  };

  const toggleCategory = (key: string) => setOpenCategories(previous => { const next = new Set(previous); next.has(key) ? next.delete(key) : next.add(key); return next; });

  if (loading && !workspace) return <div className="flex min-h-64 items-center justify-center" aria-live="polite"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /><span className="sr-only">Loading Requirements</span></div>;
  if (error && !workspace) return <div className="rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm" role="alert"><AlertTriangle className="mx-auto h-7 w-7 text-rose-600" /><h3 className="mt-3 text-sm font-black text-slate-900">Requirements unavailable</h3><p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-500">{error}</p><button type="button" onClick={() => void load('initial')} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080]"><RefreshCw className="h-4 w-4" />Retry</button></div>;

  const confirmed = activeRequirements.filter(item => item.information_certainty === 'CLIENT_CONFIRMED').length;
  const awaiting = activeRequirements.filter(item => item.information_certainty === 'AWAITING_CLIENT').length;
  const validation = activeRequirements.filter(item => item.information_certainty === 'SELLER_HYPOTHESIS' || item.information_certainty === 'NEEDS_SPECIALIST_VALIDATION').length;
  const categoryGroups = (group: Category['group']) => CATEGORIES.filter(category => category.group === group).filter(category => visibleStandard.some(item => item.category === category.key) || visibleCustom.some(item => item.category === category.key));

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-[#000080]"><ClipboardList className="h-4 w-4" />Requirements coverage<SellerGuidanceHelp guidance={getSellerGuidance('section.requirements')} /></div><div className="mt-2 text-lg font-black text-slate-950">{coverage.capturedCore} of {coverage.totalCore} Core items captured</div><p className="mt-1 text-xs leading-5 text-slate-500">Informational discovery coverage only. It does not block conversion, pipeline stages, quotations, payment, or Won.</p></div>
        <button type="button" disabled={refreshing} onClick={() => void load('refresh')} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[11px] font-black text-slate-600 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Captured Core" value={coverage.capturedCore} /><Metric label="Client confirmed" value={confirmed} /><Metric label="Awaiting client" value={awaiting} /><Metric label="Needs validation" value={validation} /></div>
      {coverage.missingCore.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="flex items-center gap-2 text-xs font-black text-amber-900"><AlertTriangle className="h-4 w-4" />{coverage.missingCore.length} Core items still need attention</div><div className="mt-2 flex flex-wrap gap-1.5">{coverage.missingCore.slice(0, 6).map(item => <span key={item.requirementKey} className="rounded-lg border border-amber-200 bg-white/70 px-2 py-1 text-[10px] font-bold text-amber-800">{item.title}</span>)}{coverage.missingCore.length > 6 && <span className="px-2 py-1 text-[10px] font-bold text-amber-700">+{coverage.missingCore.length - 6} more</span>}</div></div>}
    </section>

    {actionError && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700" role="alert">{actionError}</div>}
    <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Requirement filters">{FILTERS.map(item => <button key={item.id} type="button" onClick={() => setFilter(item.id)} aria-pressed={filter === item.id} className={`min-h-10 shrink-0 rounded-xl border px-3 text-[10px] font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080] ${filter === item.id ? 'border-[#000080] bg-[#000080] text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{item.label}</button>)}</div>

    <RequirementGroup title="Core discovery" subtitle="Visible by default. Capture facts without turning requests into promises." categories={categoryGroups('core')} openCategories={openCategories} toggle={toggleCategory} definitions={visibleStandard} standardByKey={standardByKey} customRequirements={visibleCustom} editingKey={editingKey} draft={draft} setDraft={setDraft} busyKey={busyKey} onEditStandard={definition => { setActionError(''); setEditingKey(definition.requirementKey); setDraft(standardDraft(definition, standardByKey.get(definition.requirementKey))); }} onSaveStandard={saveStandard} onEditCustom={requirement => { setActionError(''); setEditingKey(requirement.requirement_key); setDraft(customDraft(requirement)); }} onSaveCustom={saveCustom} onCancel={() => { setEditingKey(null); setDraft(null); setActionError(''); }} onArchive={archiveCustom} />
    <RequirementGroup title="Additional / conditional areas" subtitle="Collapsed by default. Expand only when relevant to this client need." categories={categoryGroups('additional')} openCategories={openCategories} toggle={toggleCategory} definitions={visibleStandard} standardByKey={standardByKey} customRequirements={visibleCustom} editingKey={editingKey} draft={draft} setDraft={setDraft} busyKey={busyKey} onEditStandard={definition => { setActionError(''); setEditingKey(definition.requirementKey); setDraft(standardDraft(definition, standardByKey.get(definition.requirementKey))); }} onSaveStandard={saveStandard} onEditCustom={requirement => { setActionError(''); setEditingKey(requirement.requirement_key); setDraft(customDraft(requirement)); }} onSaveCustom={saveCustom} onCancel={() => { setEditingKey(null); setDraft(null); setActionError(''); }} onArchive={archiveCustom} />

    {visibleStandard.length === 0 && visibleCustom.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-xs text-slate-500">{filter === 'all' ? 'Requirements have not been captured yet.' : 'No Requirements match this filter.'}</div>}

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="flex items-center gap-1 text-sm font-black text-slate-900">Advanced custom Requirements<SellerGuidanceHelp guidance={getSellerGuidance('action.add_custom_requirement')} /></h3><p className="mt-1 text-xs leading-5 text-slate-500">Capture a deal-specific need not represented by the standard SOP catalog. Custom records can be archived; standard items use Not applicable instead.</p></div><button type="button" onClick={() => { setCustomOpen(value => !value); setActionError(''); }} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF0E0E] px-4 text-xs font-black text-white"><Plus className="h-4 w-4" />Add custom requirement</button></div>
      {customOpen && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><Editor draft={newCustom} setDraft={setNewCustom} custom guidance={getSellerGuidance('action.add_custom_requirement')} /><div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { setCustomOpen(false); setNewCustom(emptyCustom()); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600"><X className="h-4 w-4" />Cancel</button><button type="button" disabled={busyKey === 'custom-new'} onClick={() => void addCustom()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-50">{busyKey === 'custom-new' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save custom Requirement</button></div></div>}
    </section>
  </div>;
}

type GroupProps = {
  title: string; subtitle: string; categories: Category[]; openCategories: Set<string>; toggle: (key: string) => void;
  definitions: CRMRequirementDefinition[]; standardByKey: Map<string, CRMRequirement>; customRequirements: CRMRequirement[];
  editingKey: string | null; draft: RequirementDraft | null; setDraft: React.Dispatch<React.SetStateAction<RequirementDraft | null>>; busyKey: string;
  onEditStandard: (definition: CRMRequirementDefinition) => void; onSaveStandard: (definition: CRMRequirementDefinition) => Promise<void>;
  onEditCustom: (requirement: CRMRequirement) => void; onSaveCustom: (requirement: CRMRequirement) => Promise<void>; onCancel: () => void; onArchive: (requirement: CRMRequirement) => Promise<void>;
};
function RequirementGroup(props: GroupProps) {
  if (!props.categories.length) return null;
  return <section><div className="mb-2"><h3 className="text-xs font-black uppercase tracking-[.12em] text-slate-700">{props.title}</h3><p className="mt-1 text-[10px] text-slate-500">{props.subtitle}</p></div><div className="space-y-3">{props.categories.map(category => {
    const open = props.openCategories.has(category.key);
    const defs = props.definitions.filter(item => item.category === category.key);
    const customs = props.customRequirements.filter(item => item.category === category.key);
    return <div key={category.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><button type="button" onClick={() => props.toggle(category.key)} aria-expanded={open} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#000080]"><span className="text-xs font-black text-slate-800">{category.label} <span className="font-semibold text-slate-400">· {defs.length + customs.length}</span></span>{open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}</button>{open && <div className="space-y-3 border-t border-slate-100 p-3 sm:p-4">{defs.map(definition => <StandardRow key={definition.requirementKey} definition={definition} requirement={props.standardByKey.get(definition.requirementKey)} editing={props.editingKey === definition.requirementKey} draft={props.editingKey === definition.requirementKey ? props.draft : null} setDraft={props.setDraft} busy={props.busyKey === definition.requirementKey} onEdit={() => props.onEditStandard(definition)} onCancel={props.onCancel} onSave={() => void props.onSaveStandard(definition)} />)}{customs.map(requirement => <CustomRow key={requirement.id} requirement={requirement} editing={props.editingKey === requirement.requirement_key} draft={props.editingKey === requirement.requirement_key ? props.draft : null} setDraft={props.setDraft} busy={props.busyKey === requirement.requirement_key} onEdit={() => props.onEditCustom(requirement)} onCancel={props.onCancel} onSave={() => void props.onSaveCustom(requirement)} onArchive={() => void props.onArchive(requirement)} />)}</div>}</div>;
  })}</div></section>;
}

function StandardRow({ definition, requirement, editing, draft, setDraft, busy, onEdit, onCancel, onSave }: { definition: CRMRequirementDefinition; requirement?: CRMRequirement; editing: boolean; draft: RequirementDraft | null; setDraft: React.Dispatch<React.SetStateAction<RequirementDraft | null>>; busy: boolean; onEdit: () => void; onCancel: () => void; onSave: () => void }) {
  const guidance = getRequirementGuidance(definition);
  return <Card title={definition.title} badge={definition.requirementClass} guidance={guidance} badgeGuidance={getQuestionClassGuidance(definition.requirementClass)}>{editing && draft ? <><Editor draft={draft} setDraft={value => setDraft(value)} guidance={guidance} /><Actions busy={busy} onCancel={onCancel} onSave={onSave} /></> : <><p className="mt-2 text-[11px] leading-5 text-slate-500">{guidance?.shortHelp || definition.helpText}</p><Display requirement={requirement} /><div className="mt-3 flex justify-end"><button type="button" onClick={onEdit} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-600"><Edit3 className="h-3.5 w-3.5" />Edit</button></div></>}</Card>;
}
function CustomRow({ requirement, editing, draft, setDraft, busy, onEdit, onCancel, onSave, onArchive }: { requirement: CRMRequirement; editing: boolean; draft: RequirementDraft | null; setDraft: React.Dispatch<React.SetStateAction<RequirementDraft | null>>; busy: boolean; onEdit: () => void; onCancel: () => void; onSave: () => void; onArchive: () => void }) {
  const guidance = getSellerGuidance('action.add_custom_requirement');
  return <Card title={requirement.title} badge="CUSTOM" guidance={guidance}>{editing && draft ? <><Editor draft={draft} setDraft={value => setDraft(value)} custom guidance={guidance} /><Actions busy={busy} onCancel={onCancel} onSave={onSave} /></> : <><Display requirement={requirement} /><div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={onEdit} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-600"><Edit3 className="h-3.5 w-3.5" />Edit</button><button type="button" disabled={busy} onClick={onArchive} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-[10px] font-black text-rose-700 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />Archive</button><SellerGuidanceHelp guidance={getSellerGuidance('action.archive_custom_requirement')} /></div></>}</Card>;
}
function Display({ requirement }: { requirement?: CRMRequirement }) {
  if (!requirement) return <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs font-bold text-slate-400">Not captured yet</div>;
  const certainty = CERTAINTY[requirement.information_certainty];
  return <div className="mt-3 space-y-3"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${certainty.tone}`}>{certainty.label}</span><SellerGuidanceHelp guidance={getCertaintyGuidance(requirement.information_certainty)} /><span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-black text-slate-500">{sourceLabel(requirement.source_type)}</span><SellerGuidanceHelp guidance={getSellerGuidance('field.requirement_source')} /></div>{requirement.information_certainty === 'NEEDS_SPECIALIST_VALIDATION' && <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[10px] font-bold leading-4 text-rose-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Specialist validation required. No review workflow has been started.</div>}{requirement.content?.trim() ? <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{requirement.content}</p> : requirement.information_certainty === 'NOT_APPLICABLE' ? <p className="text-xs font-bold text-slate-500">Resolved as not applicable.</p> : hasMeaningfulRequirementValue(requirement) ? <p className="text-xs font-bold text-slate-500">Structured Requirement details are recorded and will be preserved.</p> : <p className="text-xs font-bold text-slate-400">No written detail captured yet.</p>}<div className="text-[9px] font-semibold text-slate-400">Updated {fmt(requirement.updated_at)} · {sourceLabel(requirement.source_type)}{requirement.source_recorded_at ? ` · Source recorded ${fmt(requirement.source_recorded_at)}` : ''}</div></div>;
}
function Editor({ draft, setDraft, custom = false, guidance }: { draft: RequirementDraft; setDraft: (next: RequirementDraft) => void; custom?: boolean; guidance?: SellerGuidanceEntry }) {
  const update = (patch: Partial<RequirementDraft>) => setDraft({ ...draft, ...patch });
  return <div className="mt-3 space-y-3">{custom && <div className="grid gap-3 sm:grid-cols-2"><label className="text-[10px] font-black text-slate-600">Requirement title<input value={draft.title} onChange={event => update({ title: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-[#000080]" /></label><label className="text-[10px] font-black text-slate-600">Category<select value={draft.category} onChange={event => update({ category: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-[#000080]">{CATEGORIES.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>}<div><div className="flex items-center gap-1 text-[10px] font-black text-slate-600"><span>Requirement details</span><SellerGuidanceHelp guidance={guidance} /></div><textarea rows={4} value={draft.content} onChange={event => update({ content: event.target.value })} placeholder="Capture the client need, constraint, request, or current understanding." className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm leading-6 outline-none focus:border-[#000080]" /></div><div><div className="flex items-center gap-1 text-[10px] font-black text-slate-600"><span>Certainty</span><SellerGuidanceHelp guidance={getCertaintyGuidance(draft.certainty)} /></div><select value={draft.certainty} onChange={event => update({ certainty: event.target.value as CRMInformationCertainty })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-[#000080]">{CRM_INFORMATION_CERTAINTY.map(value => <option key={value} value={value}>{CERTAINTY[value].label}</option>)}</select></div><p className="rounded-lg border border-blue-100 bg-blue-50 p-2.5 text-[10px] leading-4 text-slate-600"><strong>Client confirmed</strong> means the client actually confirmed the fact. Seller observation and Seller hypothesis remain separate.</p></div>;
}
function Actions({ busy, onCancel, onSave }: { busy: boolean; onCancel: () => void; onSave: () => void }) { return <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={onCancel} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-600"><X className="h-3.5 w-3.5" />Cancel</button><button type="button" disabled={busy} onClick={onSave} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#000080] px-3 text-[10px] font-black text-white disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Save</button></div>; }
function Card({ title, badge, children, guidance, badgeGuidance }: { title: string; badge: string; children: React.ReactNode; guidance?: SellerGuidanceEntry; badgeGuidance?: SellerGuidanceEntry }) { return <article className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5"><div className="flex flex-wrap items-start justify-between gap-2"><div className="flex min-w-0 items-start gap-1"><h4 className="min-w-0 break-words text-xs font-black text-slate-900">{title}</h4><SellerGuidanceHelp guidance={guidance} /></div><div className="flex items-center gap-1"><span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[8px] font-black tracking-wide text-slate-400">{badge}</span>{badgeGuidance && <SellerGuidanceHelp guidance={badgeGuidance} />}</div></div>{children}</article>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="text-lg font-black text-slate-900">{value}</div><div className="mt-0.5 text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div></div>; }
