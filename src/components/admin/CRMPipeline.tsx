import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock3,
  DollarSign,
  ExternalLink,
  Filter,
  Loader2,
  MessageSquarePlus,
  Receipt,
  Settings2,
  ShieldCheck,
  Target,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  crmService,
  PipelineOpportunity,
  PipelineStageConfig,
} from '../../lib/crmService';
import {
  CRMLeadDetail,
  OpportunityStage,
  NegotiationDecisionStatus,
  NegotiationObjectionCategory,
  NegotiationWaitingOn,
} from '../../types';
import { useAuth } from '../../lib/AuthContext';
import MonthlyWonSalesColumn from './MonthlyWonSalesColumn';
import SellerGuidanceHelp from './crm/SellerGuidanceHelp';
import { getSellerGuidance } from '../../lib/crmSellerGuidance';

const VIEW_OPTIONS = [
  'All Open',
  'My Pipeline',
  'Needs Attention',
  'Stalled Deals',
  'No Next Activity',
  'Follow-up Overdue',
  'High Value',
  'Quote Pending',
] as const;
type PipelineView = typeof VIEW_OPTIONS[number];

type TimelineFilter = 'All' | 'Stage Changes' | 'Emails' | 'Activities' | 'Meetings' | 'Quotations' | 'Payments' | 'Notes' | 'Automation' | 'System';

const timelineFilters: TimelineFilter[] = ['All', 'Stage Changes', 'Emails', 'Activities', 'Meetings', 'Quotations', 'Payments', 'Notes', 'Automation', 'System'];

const DECISION_OPTIONS: NegotiationDecisionStatus[] = [
  'AWAITING_CLIENT_RESPONSE',
  'CLIENT_REVIEWING',
  'QUESTIONS_OR_OBJECTIONS',
  'REVISION_REQUESTED',
  'COMMERCIAL_REVIEW_REQUIRED',
  'INTERNAL_CLIENT_APPROVAL',
  'DECISION_DATE_CONFIRMED',
  'PAUSED_BY_CLIENT',
];

const OBJECTION_OPTIONS: NegotiationObjectionCategory[] = [
  'PRICE','BUDGET','SCOPE','TIMELINE','TRUST','AUTHORITY',
  'INTERNAL_APPROVAL','PROCUREMENT','COMPETITOR','PRIORITY','NO_RESPONSE','OTHER',
];

const WAITING_OPTIONS: NegotiationWaitingOn[] = ['CLIENT','PROFOX','SPECIALIST','PROCUREMENT','THIRD_PARTY'];

function enumLabel(value?: string) {
  if (!value) return 'Not recorded';
  return value.toLowerCase().split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function toLocalInput(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function hoursLabel(hours: number) {
  if (!Number.isFinite(hours)) return '—';
  if (hours < 24) return `${Math.max(0, Math.round(hours))}h`;
  const days = hours / 24;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)}d`;
}

function healthClass(status: PipelineOpportunity['health']['status']) {
  if (status === 'At Risk') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'Needs Attention') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function timelineMatches(eventType: string, filter: TimelineFilter) {
  const type = eventType.toLowerCase();
  if (filter === 'All') return true;
  if (filter === 'Stage Changes') return type.includes('stage');
  if (filter === 'Emails') return type.includes('email') || type.includes('notification');
  if (filter === 'Activities') return type.includes('activity') || type.includes('follow_up');
  if (filter === 'Meetings') return type.includes('meeting');
  if (filter === 'Quotations') return type.includes('quotation');
  if (filter === 'Payments') return type.includes('payment');
  if (filter === 'Notes') return type.includes('note');
  if (filter === 'Automation') return type.includes('automation');
  return !['stage', 'email', 'notification', 'activity', 'follow_up', 'meeting', 'quotation', 'payment', 'note', 'automation'].some(token => type.includes(token));
}

export default function CRMPipeline({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [opportunities, setOpportunities] = useState<PipelineOpportunity[]>([]);
  const [stages, setStages] = useState<PipelineStageConfig[]>([]);
  const [scope, setScope] = useState<'team' | 'individual'>('individual');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PipelineOpportunity | null>(null);
  const [activeDrag, setActiveDrag] = useState<PipelineOpportunity | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<PipelineView>('All Open');
  const [healthFilter, setHealthFilter] = useState('All');
  const [ownerFilter, setOwnerFilter] = useState('All');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const data = await crmService.getPipelineCommandCenter();
      setOpportunities(data.opportunities || []);
      setStages((data.config?.stages || []).filter(stage => stage.active).sort((a, b) => a.order - b.order));
      setScope(data.scope);
      if (selected) setSelected((data.opportunities || []).find(item => item.id === selected.id) || null);
    } catch (e: any) {
      setError(e?.message || 'Pipeline could not be loaded.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const owners = useMemo(() => Array.from(new Map(opportunities.filter(o => o.salespersonId).map(o => [o.salespersonId!, o.ownerName])).entries()), [opportunities]);
  const highValueThreshold = useMemo(() => {
    const values = opportunities.map(o => o.expectedValue).filter(Number.isFinite).sort((a, b) => b - a);
    return values.length ? Math.max(5000, values[Math.min(Math.floor(values.length / 4), values.length - 1)] || 5000) : 5000;
  }, [opportunities]);

  const filtered = useMemo(() => opportunities.filter(opp => {
    if (opp.status !== 'Open') return false;
    if (ownerFilter !== 'All' && opp.salespersonId !== ownerFilter) return false;
    if (healthFilter !== 'All' && opp.health.status !== healthFilter) return false;
    if (view === 'My Pipeline' && opp.salespersonId !== user?.id) return false;
    if (view === 'Needs Attention' && opp.health.status === 'Healthy') return false;
    if (view === 'Stalled Deals' && !(opp.health.reasons.some(r => r.includes('SLA') || r.includes('activity')))) return false;
    if (view === 'No Next Activity' && !opp.health.reasons.includes('No next activity')) return false;
    if (view === 'Follow-up Overdue' && !opp.health.reasons.includes('Follow-up overdue')) return false;
    if (view === 'High Value' && opp.expectedValue < highValueThreshold) return false;
    if (view === 'Quote Pending' && !(opp.quotation && ['Sent', 'Approved', 'Ready for Approval'].includes(opp.quotation.status))) return false;
    return true;
  }), [opportunities, ownerFilter, healthFilter, view, user?.id, highValueThreshold]);

  const pipelineValue = filtered.reduce((sum, item) => sum + item.expectedValue, 0);
  const weightedValue = filtered.reduce((sum, item) => sum + item.expectedValue * ((item.probability || 0) / 100), 0);
  const attentionCount = filtered.filter(item => item.health.status !== 'Healthy').length;

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveDrag(null);
    if (!over) return;
    const opportunity = opportunities.find(item => item.id === String(active.id));
    const targetStage = String(over.id);
    if (!opportunity || opportunity.stage === targetStage) return;
    const previous = opportunities;
    setError('');
    setOpportunities(current => current.map(item => item.id === opportunity.id ? { ...item, stage: targetStage as OpportunityStage } : item));
    try {
      await crmService.transitionOpportunity(opportunity.id, targetStage);
      await load(true);
    } catch (e: any) {
      setOpportunities(previous);
      setError(e?.message || `The opportunity could not move to ${targetStage}.`);
    }
  };

  if (loading && opportunities.length === 0) return <div className="flex h-[600px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-2xl font-black text-slate-900">Sales Pipeline Command Center</h1><span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-[#000080]">{scope}</span></div>
          <p className="mt-1 text-sm text-slate-500">See deal health, next action, stage age and commercial progress without leaving the pipeline.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Metric label="Pipeline" value={`USD ${pipelineValue.toLocaleString()}`} />
          <Metric label="Weighted" value={`USD ${Math.round(weightedValue).toLocaleString()}`} />
          <Metric label="Needs attention" value={attentionCount} alert={attentionCount > 0} />
          {isAdmin && <button onClick={() => navigate('/admin/crm-pipeline-settings')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm hover:border-[#000080]/30"><Settings2 className="h-4 w-4" /> Pipeline settings</button>}
        </div>
      </div>

      {error && <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-black">Stage change blocked</div><div className="mt-0.5 text-xs font-medium">{error}</div></div></div>}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <Filter className="h-4 w-4 text-slate-400" />
        <select value={view} onChange={e => setView(e.target.value as PipelineView)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none focus:border-[#000080]">{VIEW_OPTIONS.map(option => <option key={option}>{option}</option>)}</select>
        <select value={healthFilter} onChange={e => setHealthFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none focus:border-[#000080]"><option>All</option><option>Healthy</option><option>Needs Attention</option><option>At Risk</option></select>
        {(isAdmin || scope === 'team') && <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none focus:border-[#000080]"><option value="All">All owners</option>{owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>}
        <div className="ml-auto text-[10px] font-bold text-slate-400">Drag is only the interface. Server rules remain authoritative.</div>
      </div>

      <DndContext sensors={sensors} onDragStart={({ active }) => setActiveDrag(opportunities.find(item => item.id === String(active.id)) || null)} onDragCancel={() => setActiveDrag(null)} onDragEnd={handleDragEnd}>
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-6 sm:-mx-8 sm:px-8">
          {stages.map(stage => stage.classification === 'won'
            ? <MonthlyWonSalesColumn key={stage.name} stage={stage} ownerFilter={ownerFilter} />
            : <PipelineColumn key={stage.name} stage={stage} opportunities={filtered.filter(item => item.stage === stage.name)} onOpen={setSelected} />)}
        </div>
        <DragOverlay>{activeDrag ? <PipelineCard opportunity={activeDrag} overlay onOpen={() => {}} /> : null}</DragOverlay>
      </DndContext>

      {selected && <OpportunityDrawer opportunity={selected} stages={stages} onClose={() => setSelected(null)} onUpdate={() => load(true)} onNavigate={onNavigate} />}
    </div>
  );
}

function Metric({ label, value, alert = false }: { label: string; value: React.ReactNode; alert?: boolean }) {
  return <div className={`rounded-xl border bg-white px-3 py-2 shadow-sm ${alert ? 'border-amber-200' : 'border-slate-200'}`}><div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</div><div className={`mt-0.5 text-xs font-black ${alert ? 'text-amber-700' : 'text-slate-900'}`}>{value}</div></div>;
}

function PipelineColumn({ stage, opportunities, onOpen }: { stage: PipelineStageConfig; opportunities: PipelineOpportunity[]; onOpen: (opportunity: PipelineOpportunity) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.name });
  const total = opportunities.reduce((sum, item) => sum + item.expectedValue, 0);
  const weighted = opportunities.reduce((sum, item) => sum + item.expectedValue * ((item.probability || 0) / 100), 0);
  const avgAge = opportunities.length ? opportunities.reduce((sum, item) => sum + item.stageAgeHours, 0) / opportunities.length : 0;
  return <div className="w-[310px] min-w-[310px]">
    <div className="mb-2 px-1">
      <div className="flex items-start justify-between gap-2"><div><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} /><h3 className="text-[10px] font-black uppercase tracking-widest text-slate-600">{stage.name}</h3></div><div className="mt-1 flex gap-2 text-[10px] font-semibold text-slate-400"><span>{opportunities.length} deals</span><span>•</span><span>Avg {hoursLabel(avgAge)}</span></div></div><div className="text-right"><div className="text-xs font-black text-slate-900">USD {total.toLocaleString()}</div><div className="text-[9px] font-semibold text-slate-400">Weighted {Math.round(weighted).toLocaleString()}</div></div></div>
    </div>
    <div ref={setNodeRef} className={`flex min-h-[560px] flex-col gap-3 rounded-2xl border p-2 transition-colors ${isOver ? 'border-[#000080]/40 bg-blue-50/60' : 'border-slate-100 bg-slate-50/60'}`}>
      {opportunities.map(opportunity => <DraggablePipelineCard key={opportunity.id} opportunity={opportunity} onOpen={onOpen} />)}
      {opportunities.length === 0 && <div className="flex min-h-32 flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 text-center text-[10px] font-bold text-slate-300">Drop permitted opportunities here</div>}
    </div>
  </div>;
}

function DraggablePipelineCard({ opportunity, onOpen }: { opportunity: PipelineOpportunity; onOpen: (opportunity: PipelineOpportunity) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: opportunity.id, disabled: opportunity.status !== 'Open' });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-20' : ''} {...listeners} {...attributes}><PipelineCard opportunity={opportunity} onOpen={onOpen} /></div>;
}

function PipelineCard({ opportunity, onOpen, overlay = false }: { opportunity: PipelineOpportunity; onOpen: (opportunity: PipelineOpportunity) => void; overlay?: boolean }) {
  const slaExceeded = opportunity.stageSlaHours > 0 && opportunity.stageAgeHours > opportunity.stageSlaHours;
  return <article onClick={() => onOpen(opportunity)} className={`cursor-grab rounded-2xl border bg-white p-4 shadow-sm transition-all active:cursor-grabbing ${overlay ? 'w-[310px] rotate-1 shadow-xl' : 'border-slate-200 hover:border-[#000080]/30 hover:shadow-md'}`}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate text-sm font-black text-slate-900">{opportunity.name}</h4><p className="mt-0.5 flex items-center gap-1 truncate text-[10px] font-semibold text-slate-500"><Building2 className="h-3 w-3 shrink-0" />{opportunity.companyName}</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black ${healthClass(opportunity.health.status)}`}>{opportunity.health.status}</span></div>
    <div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs font-black text-emerald-700">{opportunity.currency} {opportunity.expectedValue.toLocaleString()}</span><span className="text-[10px] font-black text-slate-500">{opportunity.probability || 0}%</span></div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]"><Chip icon={UserRound} text={opportunity.ownerName || 'Unassigned'} /><Chip icon={Target} text={`${opportunity.leadQuality} · ${opportunity.leadScore}`} /><Chip icon={Clock3} text={`${hoursLabel(opportunity.stageAgeHours)} in stage`} danger={slaExceeded} /><Chip icon={Calendar} text={opportunity.meeting?.status || 'No meeting'} /></div>
    {opportunity.health.reasons[0] && <div className={`mt-3 flex items-start gap-1.5 rounded-xl p-2 text-[9px] font-bold ${opportunity.health.status === 'At Risk' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{opportunity.health.reasons[0]}</div>}
    {['Quotation Sent','Negotiation / Decision Pending'].includes(opportunity.stage) && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-[9px]">
      <div className="font-black text-slate-700">Decision: {enumLabel(opportunity.decisionStatus)}</div>
      <div className="mt-1 truncate font-semibold text-slate-500">Next: {opportunity.nextActivity?.subject || 'No opportunity-linked action scheduled'}</div>
      <div className={`mt-1 font-bold ${opportunity.nextActivity?.overdue ? 'text-red-700' : 'text-slate-500'}`}>
        {opportunity.nextActivity?.dueAt ? `${opportunity.nextActivity.overdue ? 'OVERDUE · ' : 'Due · '}${new Date(opportunity.nextActivity.dueAt).toLocaleString()}` : 'Due date missing'}
      </div>
    </div>}
    <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-2.5"><div className="text-[8px] font-black uppercase tracking-widest text-[#000080]/60">Next best action</div><div className="mt-1 flex items-center gap-1 text-[10px] font-black text-[#000080]">{opportunity.nextBestAction?.label || 'Review opportunity'}<ArrowRight className="h-3 w-3" /></div></div>
    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[9px] font-semibold text-slate-400"><span>{opportunity.lastMeaningfulActivity?.at ? `Last ${new Date(opportunity.lastMeaningfulActivity.at).toLocaleDateString()}` : 'No recent timeline event'}</span><div className="flex gap-1">{opportunity.quotation && <Receipt className="h-3.5 w-3.5 text-cyan-600" />}{opportunity.nextActivity?.overdue && <Clock3 className="h-3.5 w-3.5 text-red-600" />}</div></div>
  </article>;
}

function Chip({ icon: Icon, text, danger = false }: { icon: any; text: string; danger?: boolean }) {
  return <div className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 font-bold ${danger ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-100 bg-slate-50 text-slate-500'}`}><Icon className="h-3 w-3 shrink-0" /><span className="truncate">{text}</span></div>;
}

function OpportunityDrawer({ opportunity, stages, onClose, onUpdate, onNavigate }: { opportunity: PipelineOpportunity; stages: PipelineStageConfig[]; onClose: () => void; onUpdate: () => void; onNavigate?: (tab: string) => void }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<CRMLeadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('All');
  const [isMarkingLost, setIsMarkingLost] = useState(false);
  const [lostReason, setLostReason] = useState('Price / Budget');
  const [decisionStatus, setDecisionStatus] = useState<NegotiationDecisionStatus | ''>(opportunity.decisionStatus || '');
  const [objectionCategory, setObjectionCategory] = useState<NegotiationObjectionCategory | ''>(opportunity.primaryObjectionCategory || '');
  const [waitingOn, setWaitingOn] = useState<NegotiationWaitingOn | ''>(opportunity.waitingOn || '');
  const [decisionExpectedAt, setDecisionExpectedAt] = useState(toLocalInput(opportunity.decisionExpectedAt));
  const [nextActionSubject, setNextActionSubject] = useState('Quotation follow-up');
  const [nextActionDueAt, setNextActionDueAt] = useState('');

  const loadDetail = async () => {
    if (!opportunity.leadId) return;
    try { setDetail(await crmService.getLeadDetail(opportunity.leadId)); } catch (e: any) { setError(e?.message || 'Timeline could not be loaded.'); }
  };
  useEffect(() => { void loadDetail(); }, [opportunity.id]);
  useEffect(() => {
    setDecisionStatus(opportunity.decisionStatus || '');
    setObjectionCategory(opportunity.primaryObjectionCategory || '');
    setWaitingOn(opportunity.waitingOn || '');
    setDecisionExpectedAt(toLocalInput(opportunity.decisionExpectedAt));
  }, [opportunity.id, opportunity.decisionStatus, opportunity.primaryObjectionCategory, opportunity.waitingOn, opportunity.decisionExpectedAt]);

  const transition = async (stage: string) => {
    setLoading(true); setError('');
    try { await crmService.transitionOpportunity(opportunity.id, stage); await onUpdate(); await loadDetail(); }
    catch (e: any) { setError(e?.message || 'Stage change was blocked.'); }
    finally { setLoading(false); }
  };

  const addNote = async () => {
    if (!opportunity.leadId || !note.trim()) return;
    setLoading(true); setError('');
    try { await crmService.addLeadNote(opportunity.leadId, note.trim()); setNote(''); await loadDetail(); }
    catch (e: any) { setError(e?.message || 'Note could not be added.'); }
    finally { setLoading(false); }
  };

  const markLost = async () => {
    setLoading(true); setError('');
    try { await crmService.markLost(opportunity.id, lostReason); await onUpdate(); onClose(); }
    catch (e: any) { setError(e?.message || 'Opportunity could not be closed as Lost.'); }
    finally { setLoading(false); }
  };

  const saveDecisionState = async () => {
    if (!decisionStatus) {
      setError('Choose the customer decision status before saving.');
      return;
    }
    setLoading(true); setError('');
    try {
      await crmService.recordNegotiationDecisionState(opportunity.id, {
        decisionStatus,
        primaryObjectionCategory: objectionCategory || null,
        waitingOn: waitingOn || null,
        decisionExpectedAt: decisionExpectedAt ? new Date(decisionExpectedAt).toISOString() : null,
      });
      await onUpdate();
      await loadDetail();
    } catch (e: any) {
      setError(e?.message || 'Negotiation decision state could not be saved.');
    } finally {
      setLoading(false);
    }
  };

  const scheduleNextAction = async () => {
    if (!nextActionDueAt) {
      setError('Choose a future due date and time for the next action.');
      return;
    }
    setLoading(true); setError('');
    try {
      await crmService.scheduleOpportunityNextAction(opportunity.id, {
        dueAt: new Date(nextActionDueAt).toISOString(),
        subject: nextActionSubject.trim(),
        activityType: 'Quotation Follow-Up',
      });
      setNextActionSubject('Quotation follow-up');
      setNextActionDueAt('');
      await onUpdate();
      await loadDetail();
    } catch (e: any) {
      setError(e?.message || 'Next action could not be scheduled.');
    } finally {
      setLoading(false);
    }
  };

  const events = (detail?.events || []).filter(event => timelineMatches(event.eventType, timelineFilter));
  return <div className="fixed inset-0 z-[100] bg-slate-900/35" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-7"><div><div className="flex items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${healthClass(opportunity.health.status)}`}>{opportunity.health.status}</span><span className="text-[10px] font-bold text-slate-400">{opportunity.stage}</span></div><h2 className="mt-2 text-xl font-black text-slate-900">{opportunity.name}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{opportunity.companyName} · {opportunity.ownerName}</p></div><button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></header>
      <div className="flex-1 overflow-y-auto p-5 sm:p-7">
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{error}</div>}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Value" value={`${opportunity.currency} ${opportunity.expectedValue.toLocaleString()}`} /><Metric label="Probability" value={`${opportunity.probability || 0}%`} /><Metric label="Stage age" value={hoursLabel(opportunity.stageAgeHours)} alert={opportunity.stageSlaHours > 0 && opportunity.stageAgeHours > opportunity.stageSlaHours} /><Metric label="Lead quality" value={`${opportunity.leadQuality} · ${opportunity.leadScore}`} /></section>
        <section className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><div className="text-[9px] font-black uppercase tracking-widest text-[#000080]/60">Recommended next action</div><div className="mt-1 text-sm font-black text-[#000080]">{opportunity.nextBestAction?.label || 'Review opportunity'}</div><p className="mt-1 text-xs leading-5 text-slate-600">{opportunity.nextBestAction?.reason}</p>{opportunity.nextBestAction?.url && <a href={opportunity.nextBestAction.url} className="mt-3 inline-flex items-center gap-1 text-xs font-black text-[#000080]">Take action <ExternalLink className="h-3 w-3" /></a>}</section>
        {opportunity.health.reasons.length > 0 && <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"><h3 className="text-xs font-black text-amber-800">Why this deal needs attention</h3><ul className="mt-2 space-y-1 text-xs font-semibold text-amber-700">{opportunity.health.reasons.map(reason => <li key={reason}>• {reason}</li>)}</ul></section>}

        {['Quotation Sent','Negotiation / Decision Pending'].includes(opportunity.stage) && <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-1">
                <div className="text-[9px] font-black uppercase tracking-widest text-[#000080]">Decision &amp; Next Action</div>
                <SellerGuidanceHelp guidance={getSellerGuidance('section.negotiation_next_action')} label="Help for Decision and Next Action" />
              </div>
              <h3 className="mt-1 text-sm font-black text-slate-900">Negotiation is not a parking stage</h3>
              <p className="mt-1 text-[10px] leading-5 text-slate-500">Record what the customer actually said, then keep one explicit opportunity-linked action with an owner and due date.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[9px] font-bold text-slate-600">
              {opportunity.negotiationAttentionReason || 'Current Part 11 state is operationally complete.'}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[9px] font-black uppercase tracking-wide text-slate-500">Decision status
              <select value={decisionStatus} onChange={e => setDecisionStatus(e.target.value as NegotiationDecisionStatus | '')} className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold normal-case">
                <option value="">Not recorded</option>
                {DECISION_OPTIONS.map(value => <option key={value} value={value}>{enumLabel(value)}</option>)}
              </select>
            </label>
            <label className="text-[9px] font-black uppercase tracking-wide text-slate-500">Waiting on
              <select value={waitingOn} onChange={e => setWaitingOn(e.target.value as NegotiationWaitingOn | '')} className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold normal-case">
                <option value="">Not applicable / not recorded</option>
                {WAITING_OPTIONS.map(value => <option key={value} value={value}>{enumLabel(value)}</option>)}
              </select>
            </label>
            <label className="text-[9px] font-black uppercase tracking-wide text-slate-500">Primary objection
              <select value={objectionCategory} onChange={e => setObjectionCategory(e.target.value as NegotiationObjectionCategory | '')} className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold normal-case">
                <option value="">None known</option>
                {OBJECTION_OPTIONS.map(value => <option key={value} value={value}>{enumLabel(value)}</option>)}
              </select>
            </label>
            <label className="text-[9px] font-black uppercase tracking-wide text-slate-500">Expected decision date
              <input type="datetime-local" value={decisionExpectedAt} onChange={e => setDecisionExpectedAt(e.target.value)} className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold normal-case" />
            </label>
          </div>
          <div className="mt-3 flex justify-end"><button disabled={loading || !decisionStatus} onClick={() => void saveDecisionState()} className="min-h-10 rounded-xl bg-[#000080] px-4 text-[10px] font-black text-white disabled:opacity-40">Save truthful decision state</button></div>

          <div className="mt-4 grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2">
            <div>
              <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Last meaningful customer interaction</div>
              <div className="mt-1 text-xs font-black text-slate-800">{opportunity.lastMeaningfulActivity?.title || 'No qualifying interaction recorded'}</div>
              <div className="mt-1 text-[10px] font-semibold text-slate-500">{opportunity.lastMeaningfulActivity?.at ? new Date(opportunity.lastMeaningfulActivity.at).toLocaleString() : 'Derived from canonical communication/activity evidence only'}</div>
            </div>
            <div>
              <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Latest completed outcome</div>
              <div className="mt-1 text-xs font-black text-slate-800">{opportunity.latestCompletedOutcome?.outcome || 'No completed outcome recorded'}</div>
              <div className="mt-1 text-[10px] font-semibold text-slate-500">{opportunity.latestCompletedOutcome?.at ? new Date(opportunity.latestCompletedOutcome.at).toLocaleString() : 'Activity outcomes remain canonical in CRM Activities'}</div>
            </div>
          </div>

          {opportunity.nextActivity
            ? <div className={`mt-4 rounded-xl border p-3 ${opportunity.nextActivity.overdue ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
                <div className="text-[9px] font-black uppercase tracking-wide text-slate-500">Current next action</div>
                <div className="mt-1 text-xs font-black text-slate-900">{opportunity.nextActivity.subject}</div>
                <div className="mt-1 text-[10px] font-semibold text-slate-600">Owner: {opportunity.nextActivity.ownerName || 'Unassigned'} · {opportunity.nextActivity.overdue ? 'OVERDUE · ' : 'Due · '}{new Date(opportunity.nextActivity.dueAt).toLocaleString()}</div>
                <button type="button" onClick={() => onNavigate?.('activities')} className="mt-3 min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-700">Open Activity Center to complete, reschedule or cancel</button>
              </div>
            : <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">No opportunity-linked next action is scheduled.</div>}

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_210px_auto]">
            <label className="text-[9px] font-black uppercase tracking-wide text-slate-500">Next action
              <input value={nextActionSubject} onChange={e => setNextActionSubject(e.target.value)} className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold normal-case" placeholder="Follow up on quotation decision" />
            </label>
            <label className="text-[9px] font-black uppercase tracking-wide text-slate-500">Due
              <input type="datetime-local" value={nextActionDueAt} onChange={e => setNextActionDueAt(e.target.value)} className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold normal-case" />
            </label>
            <button disabled={loading || !nextActionSubject.trim() || !nextActionDueAt} onClick={() => void scheduleNextAction()} className="min-h-10 self-end rounded-xl bg-slate-900 px-4 text-[10px] font-black text-white disabled:opacity-40">Schedule action</button>
          </div>

          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-[10px] leading-5 text-blue-900">
            <div>Commercial exceptions are not approved here. Use the existing Sales Validation or quotation approval/revision workflow. Customer acceptance remains quotation authority, and Part 10B protects every revised Send.</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {opportunity.leadId && <button type="button" onClick={() => navigate('/admin/app/crm?tab=crm_leads')} className="min-h-10 rounded-xl border border-blue-200 bg-white px-3 text-[10px] font-black text-[#000080]">Open CRM commercial review</button>}
              {opportunity.quotation?.id && <button type="button" onClick={() => navigate(`/admin/quotations/${opportunity.quotation?.id}`)} className="min-h-10 rounded-xl border border-blue-200 bg-white px-3 text-[10px] font-black text-[#000080]">Open quotation</button>}
              <button type="button" onClick={() => navigate(opportunity.quotation?.id ? `/admin/quotation-approvals/${opportunity.quotation.id}` : '/admin/quotation-approvals')} className="min-h-10 rounded-xl border border-blue-200 bg-white px-3 text-[10px] font-black text-[#000080]">Open quotation approval</button>
            </div>
          </div>
        </section>}

        <section className="mt-6"><h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pipeline controls</h3><div className="mt-3 flex flex-wrap gap-2">{stages.map(stage => <button key={stage.name} disabled={loading || stage.name === opportunity.stage || stage.name === 'Won'} onClick={() => void transition(stage.name)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 hover:border-[#000080]/30">{stage.name}</button>)}</div><p className="mt-2 text-[10px] font-semibold text-slate-400"><ShieldCheck className="mr-1 inline h-3 w-3" />Won remains controlled by verified payment. Buttons and drag-and-drop cannot bypass it.</p></section>

        {opportunity.leadId && <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#000080] text-white"><MessageSquarePlus className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="text-[9px] font-black uppercase tracking-widest text-[#000080]">Customer communication</div><h3 className="mt-1 text-sm font-black text-slate-900">One conversation point for this opportunity</h3><p className="mt-1 text-[10px] leading-5 text-slate-600">Continue the same customer conversation carried forward from the Lead. Chat, customer messages, Professional Email, WhatsApp and private notes stay connected to this CRM history.</p><div className="mt-3 flex flex-wrap gap-1.5 text-[9px] font-black"><span className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-indigo-700">Website Chat</span><span className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-sky-700">Professional Email</span><span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">WhatsApp</span><span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">Internal Notes</span></div><button type="button" onClick={() => navigate(`/admin/app/crm?tab=inbox&lead=${encodeURIComponent(String(opportunity.leadId))}`)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#000080] px-4 text-[10px] font-black text-white shadow-sm"><MessageSquarePlus className="h-4 w-4" />Open customer conversation<ArrowRight className="h-3.5 w-3.5" /></button></div></div></section>}

        <section className="mt-6 grid gap-2 sm:grid-cols-4"><a href={`/admin/meetings?opportunityId=${opportunity.id}`} className="rounded-xl bg-[#000080] px-3 py-2.5 text-center text-[10px] font-black text-white">Meeting</a><button onClick={() => onNavigate?.('activities')} className="rounded-xl border border-slate-200 px-3 py-2.5 text-[10px] font-black text-slate-700">Activity</button><button onClick={() => navigate(`/admin/quotations/new?opportunityId=${opportunity.id}`)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-[10px] font-black text-slate-700">Quotation</button><button onClick={() => setIsMarkingLost(true)} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[10px] font-black text-red-700">Mark Lost</button></section>

        {isMarkingLost && <section className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4"><div className="flex items-center gap-2"><XCircle className="h-4 w-4 text-red-600" /><h3 className="text-xs font-black text-red-800">Close opportunity as Lost</h3></div><div className="mt-3 flex gap-2"><select value={lostReason} onChange={e => setLostReason(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold">{['Price / Budget','Not Interested','No Response','Already Has Provider','Project Postponed','Competitor Selected','Decision Maker Declined','Timing Not Suitable','Not Qualified','Other'].map(reason => <option key={reason}>{reason}</option>)}</select><button disabled={loading} onClick={() => void markLost()} className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white">Confirm</button><button onClick={() => setIsMarkingLost(false)} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-black text-red-700">Cancel</button></div></section>}

        {opportunity.leadId && <section className="mt-7"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-slate-900">Permanent CRM timeline</h3><p className="text-[10px] font-semibold text-slate-400">Canonical history — previous events are read-only.</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-500">{detail?.events.length || 0} events</span></div><div className="mt-3 flex gap-1 overflow-x-auto pb-1">{timelineFilters.map(filter => <button key={filter} onClick={() => setTimelineFilter(filter)} className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[9px] font-black ${timelineFilter === filter ? 'bg-[#000080] text-white' : 'bg-slate-100 text-slate-500'}`}>{filter}</button>)}</div><div className="mt-4 space-y-3">{events.map(event => <div key={event.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black text-slate-900">{event.title}</div><div className="mt-1 text-[10px] leading-4 text-slate-500">{event.description}</div></div><time className="shrink-0 text-[9px] font-semibold text-slate-400">{new Date(event.occurredAt).toLocaleString()}</time></div><div className="mt-2 text-[9px] font-bold text-slate-400">{event.actorName} · {event.actorRole}</div></div>)}{detail && events.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs font-semibold text-slate-400">No timeline events match this filter.</div>}</div></section>}

        {opportunity.leadId && <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2"><MessageSquarePlus className="h-4 w-4 text-[#000080]" /><h3 className="text-xs font-black text-slate-900">Add internal note</h3></div><textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs outline-none focus:border-[#000080]" placeholder="Add context without changing historical events…" /><div className="mt-2 flex justify-end"><button disabled={loading || !note.trim()} onClick={() => void addNote()} className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black text-white disabled:opacity-40">Add note</button></div></section>}
      </div>
    </aside>
  </div>;
}
