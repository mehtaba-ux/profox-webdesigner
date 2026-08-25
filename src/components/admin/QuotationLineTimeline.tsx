import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Clock3, RotateCcw, TriangleAlert } from 'lucide-react';
import type { CpqLine } from '../../lib/quotationCpqService';

export type TimelineSource = 'catalog' | 'seller_estimate' | 'admin_override';

type Props = {
  line: CpqLine;
  locked: boolean;
  isAdmin: boolean;
  onChange: (changes: Partial<CpqLine>) => void;
};

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function lineTimelineText(line: Pick<CpqLine, 'itemType' | 'durationMinSnapshot' | 'durationMaxSnapshot' | 'durationUnitSnapshot' | 'timelineImpactSnapshot'>) {
  const min = numberOrNull(line.durationMinSnapshot);
  const max = numberOrNull(line.durationMaxSnapshot);
  const impact = line.timelineImpactSnapshot || 'assessment_required';
  const unit = line.durationUnitSnapshot || 'business_days';

  if (line.itemType === 'care_plan' && impact === 'parallel' && min == null && max == null) {
    return 'Ongoing · no delivery extension';
  }
  if (impact === 'assessment_required') return 'Timeline requires assessment';
  if (min == null || max == null) return 'Timeline required';

  const unitLabel = unit === 'business_days'
    ? (min === 1 && max === 1 ? 'business day' : 'business days')
    : unit.replaceAll('_', ' ');
  const range = min === max ? `${min} ${unitLabel}` : `${min}–${max} ${unitLabel}`;
  if (impact === 'additive') return `Adds approximately ${range}`;
  if (impact === 'parallel') return `Runs in parallel · ${range}`;
  return range;
}

function baselineFor(line: CpqLine) {
  const config = (line.configurationSnapshot || {}) as Record<string, any>;
  const baseline = config.catalogTimeline;
  if (baseline && typeof baseline === 'object') return baseline;
  return {
    min: line.durationMinSnapshot ?? null,
    max: line.durationMaxSnapshot ?? null,
    unit: line.durationUnitSnapshot || 'business_days',
    impact: line.timelineImpactSnapshot || 'assessment_required',
    note: line.durationNoteSnapshot || '',
    status: config.timelineStatus || 'configured'
  };
}

export function timelineSource(line: CpqLine): TimelineSource {
  const configured = String((line.configurationSnapshot as any)?.timelineSource || '');
  if (configured === 'seller_estimate' || configured === 'admin_override' || configured === 'catalog') return configured;
  return line.salesProductId ? 'catalog' : 'seller_estimate';
}

export function timelineStatus(line: CpqLine) {
  const configured = String((line.configurationSnapshot as any)?.timelineStatus || '');
  if (configured === 'missing' || configured === 'configured') return configured;
  if (line.salesProductId && line.timelineImpactSnapshot === 'assessment_required') return 'configured';
  if (line.itemType === 'care_plan' && line.timelineImpactSnapshot === 'parallel' && line.durationMinSnapshot == null && line.durationMaxSnapshot == null) return 'configured';
  return line.durationMinSnapshot != null && line.durationMaxSnapshot != null ? 'configured' : 'missing';
}

function SourceBadge({ source }: { source: TimelineSource }) {
  if (source === 'catalog') return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><Check className="h-3 w-3" />Catalog Timeline</span>;
  if (source === 'admin_override') return <span className="text-[10px] font-bold text-violet-700">Admin Override</span>;
  return <span className="text-[10px] font-bold text-amber-700">Seller Estimate</span>;
}

export default function QuotationLineTimeline({ line, locked, isAdmin, onChange }: Props) {
  const source = timelineSource(line);
  const status = timelineStatus(line);
  const impact = line.timelineImpactSnapshot || 'assessment_required';
  const hasProtectedCatalogTimeline = Boolean(line.salesProductId && status === 'configured' && impact !== 'assessment_required' && !(line.itemType === 'care_plan' && impact === 'parallel' && line.durationMinSnapshot == null));
  const canEdit = !locked && (line.lineType === 'custom' || status === 'missing' || impact === 'assessment_required' || isAdmin);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [min, setMin] = useState(line.durationMinSnapshot == null ? '' : String(line.durationMinSnapshot));
  const [max, setMax] = useState(line.durationMaxSnapshot == null ? '' : String(line.durationMaxSnapshot));
  const [unit, setUnit] = useState(line.durationUnitSnapshot || 'business_days');
  const [editorImpact, setEditorImpact] = useState(line.timelineImpactSnapshot || 'assessment_required');
  const [note, setNote] = useState(line.durationNoteSnapshot || '');

  const text = useMemo(() => lineTimelineText(line), [line]);

  const beginEdit = () => {
    setMin(line.durationMinSnapshot == null ? '' : String(line.durationMinSnapshot));
    setMax(line.durationMaxSnapshot == null ? '' : String(line.durationMaxSnapshot));
    setUnit(line.durationUnitSnapshot || 'business_days');
    setEditorImpact(line.timelineImpactSnapshot || 'assessment_required');
    setNote(line.durationNoteSnapshot || '');
    setError('');
    setEditing(true);
  };

  const saveEstimate = () => {
    const parsedMin = numberOrNull(min);
    const parsedMax = numberOrNull(max);
    if (unit !== 'business_days') {
      setError('Use a timeline unit supported by the Sales Catalog.');
      return;
    }
    if (editorImpact !== 'assessment_required' && (parsedMin == null || parsedMax == null || parsedMin <= 0 || parsedMax < parsedMin)) {
      setError('Enter a valid minimum and maximum duration.');
      return;
    }

    const nextSource: TimelineSource = line.salesProductId
      ? (isAdmin && hasProtectedCatalogTimeline ? 'admin_override' : 'seller_estimate')
      : (isAdmin ? 'admin_override' : 'seller_estimate');
    const currentConfig = { ...((line.configurationSnapshot || {}) as Record<string, unknown>) };
    onChange({
      durationMinSnapshot: editorImpact === 'assessment_required' ? null : parsedMin,
      durationMaxSnapshot: editorImpact === 'assessment_required' ? null : parsedMax,
      durationUnitSnapshot: unit,
      timelineImpactSnapshot: editorImpact,
      durationNoteSnapshot: note.trim(),
      configurationSnapshot: {
        ...currentConfig,
        timelineSource: nextSource,
        timelineStatus: 'configured'
      }
    });
    setEditing(false);
    setError('');
  };

  const resetToCatalog = () => {
    if (!line.salesProductId) return;
    const baseline = baselineFor(line);
    const currentConfig = { ...((line.configurationSnapshot || {}) as Record<string, unknown>) };
    onChange({
      durationMinSnapshot: numberOrNull(baseline.min),
      durationMaxSnapshot: numberOrNull(baseline.max),
      durationUnitSnapshot: baseline.unit || 'business_days',
      timelineImpactSnapshot: baseline.impact || 'assessment_required',
      durationNoteSnapshot: baseline.note || '',
      configurationSnapshot: {
        ...currentConfig,
        timelineSource: 'catalog',
        timelineStatus: baseline.status || 'configured',
        catalogTimeline: baseline
      }
    });
    setEditing(false);
    setError('');
  };

  if (!['product', 'custom'].includes(line.lineType)) return <span className="text-slate-400">—</span>;

  return <div className="min-w-[170px]">
    {status === 'missing' ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
      <p className="flex items-center gap-1.5 font-bold text-amber-800"><TriangleAlert className="h-3.5 w-3.5" />Timeline required</p>
      <p className="mt-1 text-[10px] leading-4 text-amber-700">Add a quotation-only estimate before this scope can be sent.</p>
    </div> : <div>
      <p className="flex items-start gap-1.5 font-semibold leading-4 text-slate-700"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />{text}</p>
      <div className="mt-1"><SourceBadge source={source} /></div>
      {line.durationNoteSnapshot && <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-400">{line.durationNoteSnapshot}</p>}
    </div>}

    {!editing && canEdit && <div className="mt-2 flex flex-wrap gap-1.5">
      <button type="button" onClick={beginEdit} className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold text-[#000080] hover:bg-slate-50">
        {status === 'missing' ? 'Add estimate' : hasProtectedCatalogTimeline && isAdmin ? 'Override' : 'Add / edit estimate'}
      </button>
      {line.salesProductId && source !== 'catalog' && <button type="button" onClick={resetToCatalog} className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50" title="Restore Sales Catalog timeline"><RotateCcw className="h-3 w-3" /></button>}
    </div>}

    {editing && <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-[10px]">
      <div className="mb-2 flex items-center justify-between"><b className="text-slate-700">Quotation timeline</b><button type="button" onClick={() => setEditing(false)} className="text-slate-400">Cancel</button></div>
      <div className="grid grid-cols-2 gap-2">
        <label><span className="mb-1 block text-slate-500">Minimum</span><input disabled={editorImpact === 'assessment_required'} type="number" min={1} value={min} onChange={e => setMin(e.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 disabled:bg-slate-100" /></label>
        <label><span className="mb-1 block text-slate-500">Maximum</span><input disabled={editorImpact === 'assessment_required'} type="number" min={1} value={max} onChange={e => setMax(e.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 disabled:bg-slate-100" /></label>
      </div>
      <label className="mt-2 block"><span className="mb-1 block text-slate-500">Duration unit</span><select value={unit} onChange={e => setUnit(e.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5"><option value="business_days">Business days</option></select></label>
      <label className="mt-2 block"><span className="mb-1 block text-slate-500">Timeline impact</span><select value={editorImpact} onChange={e => setEditorImpact(e.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5"><option value="base">Base</option><option value="additive">Additive</option><option value="parallel">Parallel</option><option value="assessment_required">Assessment Required</option></select></label>
      <label className="mt-2 block"><span className="mb-1 block text-slate-500">Note / assumption</span><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className="w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5" placeholder="Optional timeline assumption" /></label>
      {error && <p className="mt-2 font-semibold text-red-600">{error}</p>}
      <div className="mt-2 flex justify-end"><button type="button" onClick={saveEstimate} className="rounded-md bg-[#000080] px-2.5 py-1.5 font-bold text-white">Save timeline</button></div>
    </div>}
  </div>;
}
