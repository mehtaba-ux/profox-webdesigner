import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Info,
  Loader2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { CRMLead, LEAD_STATUSES, LeadStatus } from '../../../types';

type Props = {
  lead: CRMLead;
  busy?: boolean;
  onStage: (value: LeadStatus) => void | Promise<void>;
  fullWidth?: boolean;
};

type QualificationRule = {
  id: string;
  label: string;
  detail: string;
};

const ESSENTIAL_RULES: QualificationRule[] = [
  { id: 'need', label: 'Need confirmed', detail: 'A real business problem or project exists that ProFox can solve.' },
  { id: 'fit', label: 'Service fit confirmed', detail: 'The requirement matches a service ProFox can realistically deliver.' },
  { id: 'engaged', label: 'Prospect engaged', detail: 'There has been meaningful two-way contact or discovery, not only a form submission.' },
  { id: 'next_step', label: 'Next step agreed', detail: 'A clear sales action is identified, such as discovery, proposal, quotation, or review.' },
];

const COMMERCIAL_RULES: QualificationRule[] = [
  { id: 'budget', label: 'Budget viable', detail: 'The prospect has a realistic budget or willingness to invest at the required level.' },
  { id: 'authority', label: 'Decision-maker identified', detail: 'You are speaking with the approver or someone who can directly involve them.' },
  { id: 'timeline', label: 'Timeline realistic', detail: 'There is a genuine intention to start within a reasonable and defined period.' },
];

const stageTone: Record<LeadStatus, string> = {
  New: 'border-blue-200 bg-blue-50 text-blue-700',
  Researching: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  Contacted: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  'Follow-Up': 'border-amber-200 bg-amber-50 text-amber-700',
  Interested: 'border-violet-200 bg-violet-50 text-violet-700',
  Qualified: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'Not Qualified': 'border-rose-200 bg-rose-50 text-rose-700',
};

const stageDot: Record<LeadStatus, string> = {
  New: 'bg-blue-500',
  Researching: 'bg-indigo-500',
  Contacted: 'bg-cyan-500',
  'Follow-Up': 'bg-amber-500',
  Interested: 'bg-violet-500',
  Qualified: 'bg-emerald-500',
  'Not Qualified': 'bg-rose-500',
};

export default function CRMLeadStagePicker({ lead, busy = false, onStage, fullWidth = false }: Props) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [qualificationOpen, setQualificationOpen] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [position, setPosition] = useState({ left: 12, top: 12, width: 272, mobile: false });

  const essentialCount = useMemo(() => ESSENTIAL_RULES.filter(rule => checks[rule.id]).length, [checks]);
  const commercialCount = useMemo(() => COMMERCIAL_RULES.filter(rule => checks[rule.id]).length, [checks]);
  const qualificationReady = essentialCount === ESSENTIAL_RULES.length && commercialCount >= 2;

  const positionMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mobile = window.innerWidth < 640;
    if (mobile) {
      setPosition({ left: 12, top: 0, width: Math.max(280, window.innerWidth - 24), mobile: true });
      return;
    }
    const width = 272;
    const estimatedHeight = 310;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const top = rect.bottom + 8 + estimatedHeight > window.innerHeight
      ? Math.max(12, rect.top - estimatedHeight - 8)
      : rect.bottom + 8;
    setPosition({ left, top, width, mobile: false });
  };

  const openMenu = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (busy) return;
    positionMenu();
    setShowGuide(false);
    setOpen(true);
  };

  const chooseStage = (value: LeadStatus) => {
    if (value === 'Qualified') {
      setOpen(false);
      setChecks({});
      setQualificationOpen(true);
      return;
    }
    if (value === lead.status) {
      setOpen(false);
      return;
    }
    setOpen(false);
    void onStage(value);
  };

  const confirmQualification = () => {
    if (!qualificationReady) return;
    setQualificationOpen(false);
    void onStage('Qualified');
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!qualificationOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setQualificationOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [qualificationOpen]);

  const guideLeft = (() => {
    const preferredRight = position.left + position.width + 10;
    if (preferredRight + 320 <= window.innerWidth - 12) return preferredRight;
    const preferredLeft = position.left - 330;
    if (preferredLeft >= 12) return preferredLeft;
    return Math.max(12, Math.min(position.left, window.innerWidth - 332));
  })();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={busy}
        onClick={openMenu}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Stage for ${lead.title}: ${lead.status}`}
        className={`${fullWidth ? 'flex w-full' : 'inline-flex min-w-[145px]'} h-10 items-center justify-between gap-3 rounded-xl border px-3 text-left text-[11px] font-black outline-none transition hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[#000080]/25 disabled:opacity-50 ${stageTone[lead.status]}`}
      >
        <span className="min-w-0 truncate">{lead.status}</span>
        {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
      </button>

      {open && createPortal(
        <>
          <button type="button" aria-label="Close stage menu" className="fixed inset-0 z-[180] cursor-default bg-transparent" onClick={() => setOpen(false)} />
          <div
            className={`fixed z-[181] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15 ${position.mobile ? 'max-h-[72vh] overflow-y-auto' : ''}`}
            style={position.mobile ? { left: 12, right: 12, bottom: 12 } : { left: position.left, top: position.top, width: position.width }}
            role="listbox"
            aria-label={`Choose stage for ${lead.title}`}
            onClick={event => event.stopPropagation()}
          >
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="text-[9px] font-black uppercase tracking-[.16em] text-slate-400">Lead stage</div>
              <div className="mt-0.5 text-xs font-black text-slate-900">Choose the next stage</div>
            </div>
            <div className="p-2">
              {LEAD_STATUSES.map(value => {
                const selected = value === lead.status;
                const qualified = value === 'Qualified';
                if (qualified) {
                  return (
                    <div key={value} onMouseEnter={() => setShowGuide(true)} onFocus={() => setShowGuide(true)}>
                      <div className={`flex items-center rounded-xl ${showGuide ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => chooseStage(value)}
                          className="flex min-h-10 min-w-0 flex-1 items-center gap-2.5 px-3 text-left text-xs font-bold text-slate-700"
                        >
                          <span className={`h-2 w-2 shrink-0 rounded-full ${stageDot[value]}`} />
                          <span className="min-w-0 flex-1">{value}</span>
                          {selected && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                        </button>
                        <button
                          type="button"
                          onClick={event => { event.stopPropagation(); setShowGuide(current => !current); }}
                          className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-100"
                          aria-label="Show qualification rule"
                          title="Qualification rule"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </div>
                      {position.mobile && showGuide && <div className="mx-1 mb-2 mt-1"><QualificationGuide compact /></div>}
                    </div>
                  );
                }
                return (
                  <button
                    key={value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setShowGuide(false)}
                    onFocus={() => setShowGuide(false)}
                    onClick={() => chooseStage(value)}
                    className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${stageDot[value]}`} />
                    <span className="min-w-0 flex-1">{value}</span>
                    {selected && <Check className="h-4 w-4 shrink-0 text-[#000080]" />}
                  </button>
                );
              })}
            </div>
            <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-[9px] font-semibold leading-4 text-slate-500">
              <span className="font-black text-emerald-700">Qualified</span> opens the qualification checkpoint and moves the lead to Pipeline when confirmed.
            </div>
          </div>
          {!position.mobile && showGuide && (
            <div
              className="fixed z-[182] w-[320px]"
              style={{ left: guideLeft, top: position.top }}
              onMouseEnter={() => setShowGuide(true)}
              onClick={event => event.stopPropagation()}
            >
              <QualificationGuide />
            </div>
          )}
        </>,
        document.body,
      )}

      {qualificationOpen && createPortal(
        <div className="fixed inset-0 z-[190] flex items-end justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={event => { if (event.currentTarget === event.target) setQualificationOpen(false); }}>
          <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] border border-white/40 bg-white shadow-2xl">
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-emerald-700"><ShieldCheck className="h-4 w-4" />Qualification checkpoint</div>
                <h3 className="mt-1 text-lg font-black text-slate-950 sm:text-xl">Ready to qualify this lead and move it to Pipeline?</h3>
                <p className="mt-1 break-words text-xs leading-5 text-slate-500">{lead.title} · {lead.companyName}</p>
              </div>
              <button type="button" onClick={() => setQualificationOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50" aria-label="Close qualification checkpoint"><X className="h-4 w-4" /></button>
            </header>

            <div className="space-y-6 p-5 sm:p-6">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-black text-slate-900">ProFox qualification standard</div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-black text-[#000080] shadow-sm">4 required + any 2 of 3</span>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-slate-600">Passing this checkpoint moves the canonical lead into Pipeline as one linked opportunity. The lead history remains preserved for attribution and audit.</p>
              </div>

              <RuleChecklist
                title="Essential checks"
                subtitle="All 4 are required"
                rules={ESSENTIAL_RULES}
                checks={checks}
                onToggle={id => setChecks(current => ({ ...current, [id]: !current[id] }))}
                tone="required"
              />
              <RuleChecklist
                title="Commercial signals"
                subtitle="Confirm at least 2 of 3"
                rules={COMMERCIAL_RULES}
                checks={checks}
                onToggle={id => setChecks(current => ({ ...current, [id]: !current[id] }))}
                tone="commercial"
              />

              <div className={`rounded-2xl border p-4 ${qualificationReady ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className={`text-xs font-black ${qualificationReady ? 'text-emerald-800' : 'text-slate-700'}`}>{qualificationReady ? 'Qualification standard met' : 'Qualification standard not met yet'}</div>
                    <div className="mt-1 text-[10px] font-semibold text-slate-500">Essentials {essentialCount}/4 · Commercial {commercialCount}/3</div>
                  </div>
                  {qualificationReady ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <Circle className="h-6 w-6 text-slate-300" />}
                </div>
              </div>
            </div>

            <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:flex-row sm:justify-end sm:px-6">
              <button type="button" onClick={() => setQualificationOpen(false)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600 hover:bg-slate-50">Keep current stage</button>
              <button type="button" disabled={!qualificationReady || busy} onClick={confirmQualification} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 text-xs font-black text-white shadow-lg shadow-blue-950/10 disabled:cursor-not-allowed disabled:opacity-40"><ShieldCheck className="h-4 w-4" />Qualify & move to Pipeline</button>
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}

function QualificationGuide({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/10 ${compact ? 'shadow-none' : ''}`}>
      <div className="border-b border-slate-100 px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[9px] font-black uppercase tracking-[.14em] text-[#000080]">Qualification criteria</div>
          <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[8px] font-black text-[#000080]">4 required + 2 of 3</span>
        </div>
        <div className="mt-1.5 text-[15px] font-black leading-5 text-slate-950">Ready for Pipeline?</div>
        <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">Confirm every required check plus at least two commercial signals.</p>
      </div>
      <div className="space-y-2.5 p-3">
        <GuideGroup title="Required" requirement="All 4" rules={ESSENTIAL_RULES} />
        <GuideGroup title="Commercial" requirement="Any 2 of 3" rules={COMMERCIAL_RULES} />
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5">
          <div className="text-[9px] font-black uppercase tracking-[.1em] text-[#000080]">Pipeline handoff</div>
          <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-600">One linked opportunity is used. The original lead and its history stay preserved.</p>
        </div>
      </div>
    </section>
  );
}

function GuideGroup({ title, requirement, rules }: { title: string; requirement: string; rules: QualificationRule[] }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] font-black uppercase tracking-[.1em] text-slate-500">{title}</div>
        <div className="text-[9px] font-black text-slate-400">{requirement}</div>
      </div>
      <div className="mt-2 space-y-1.5">
        {rules.map(rule => (
          <div key={rule.id} className="flex items-start gap-2 text-[10px] font-bold leading-4 text-slate-700">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <span>{rule.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RuleChecklist({ title, subtitle, rules, checks, onToggle, tone }: { title: string; subtitle: string; rules: QualificationRule[]; checks: Record<string, boolean>; onToggle: (id: string) => void; tone: 'required' | 'commercial' }) {
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h4 className="text-sm font-black text-slate-900">{title}</h4>
          <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{subtitle}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${tone === 'required' ? 'bg-blue-50 text-[#000080]' : 'bg-violet-50 text-violet-700'}`}>{tone === 'required' ? 'REQUIRED' : 'COMMERCIAL FIT'}</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {rules.map(rule => {
          const checked = Boolean(checks[rule.id]);
          return (
            <button key={rule.id} type="button" onClick={() => onToggle(rule.id)} className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition ${checked ? 'border-emerald-200 bg-emerald-50/80' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}>
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}><Check className="h-3.5 w-3.5" /></span>
              <span className="min-w-0">
                <span className="block text-[11px] font-black text-slate-800">{rule.label}</span>
                <span className="mt-1 block text-[10px] leading-4 text-slate-500">{rule.detail}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}