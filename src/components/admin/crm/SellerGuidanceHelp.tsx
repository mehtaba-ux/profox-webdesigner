import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp, X } from 'lucide-react';
import type { SellerGuidanceEntry } from '../../../lib/crmSellerGuidance';

type SellerGuidanceHelpProps = {
  guidance?: SellerGuidanceEntry;
  label?: string;
  className?: string;
};

type TooltipPosition = { left: number; top: number; width: number };

const DETAIL_SECTIONS: Array<{
  key: keyof SellerGuidanceEntry;
  label: string;
}> = [
  { key: 'meaning', label: 'What this means' },
  { key: 'whyItMatters', label: 'Why it matters' },
  { key: 'sellerAction', label: 'What to do' },
  { key: 'askExample', label: 'How to ask' },
  { key: 'listenFor', label: 'Listen for' },
  { key: 'usefulAnswerExample', label: 'Good example' },
  { key: 'avoid', label: 'Avoid' },
  { key: 'followUp', label: 'If unclear' },
  { key: 'escalation', label: 'Escalate when' },
  { key: 'certaintyNote', label: 'Certainty' },
  { key: 'securityNote', label: 'Security' },
];

export default function SellerGuidanceHelp({ guidance, label, className = '' }: SellerGuidanceHelpProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = useId();
  const dialogTitleId = useId();
  const [quickOpen, setQuickOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({ left: 12, top: 12, width: 320 });

  const positionTooltip = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect || typeof window === 'undefined') return;
    const width = Math.min(320, Math.max(260, window.innerWidth - 24));
    const estimatedHeight = 118;
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12));
    const preferredTop = rect.bottom + 8;
    const top = preferredTop + estimatedHeight > window.innerHeight
      ? Math.max(12, rect.top - estimatedHeight - 8)
      : preferredTop;
    setPosition({ left, top, width });
  };

  useLayoutEffect(() => {
    if (quickOpen) positionTooltip();
  }, [quickOpen]);

  useEffect(() => {
    if (!quickOpen) return;
    const closeQuick = () => setQuickOpen(false);
    window.addEventListener('resize', closeQuick);
    window.addEventListener('scroll', closeQuick, true);
    return () => {
      window.removeEventListener('resize', closeQuick);
      window.removeEventListener('scroll', closeQuick, true);
    };
  }, [quickOpen]);

  useEffect(() => {
    if (!detailOpen) return;
    setQuickOpen(false);
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailOpen(false);
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>('button[data-guidance-close]')?.focus());
    return () => {
      window.removeEventListener('keydown', onKey);
      requestAnimationFrame(() => triggerRef.current?.focus() ?? previous?.focus());
    };
  }, [detailOpen]);

  if (!guidance) return null;

  const accessibleLabel = label ?? `Help for ${guidance.title}`;
  const hasDetails = DETAIL_SECTIONS.some(section => {
    const value = guidance[section.key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });

  const showQuick = () => {
    if (detailOpen || typeof window === 'undefined') return;
    positionTooltip();
    setQuickOpen(true);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={showQuick}
        onMouseLeave={() => setQuickOpen(false)}
        onFocus={showQuick}
        onBlur={() => setQuickOpen(false)}
        onClick={event => {
          event.preventDefault();
          event.stopPropagation();
          if (hasDetails) setDetailOpen(true);
        }}
        aria-label={accessibleLabel}
        aria-describedby={quickOpen ? tooltipId : undefined}
        aria-haspopup={hasDetails ? 'dialog' : undefined}
        aria-expanded={hasDetails ? detailOpen : undefined}
        className={`inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-[#000080] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080] ${className}`}
      >
        <CircleHelp className="h-4 w-4" aria-hidden="true" />
      </button>

      {quickOpen && createPortal(
        <div
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none fixed z-[240] rounded-xl border border-slate-200 bg-slate-950 px-3 py-2.5 text-[11px] font-semibold leading-5 text-white shadow-2xl"
          style={{ left: position.left, top: position.top, width: position.width }}
        >
          <div className="font-black text-white">{guidance.title}</div>
          <div className="mt-0.5 text-slate-200">{guidance.shortHelp}</div>
          {hasDetails && <div className="mt-1 text-[9px] font-black uppercase tracking-wide text-slate-400">Click or tap for detailed help</div>}
        </div>,
        document.body,
      )}

      {detailOpen && createPortal(
        <div
          className="fixed inset-0 z-[245] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[1px] sm:items-center sm:p-5"
          onMouseDown={event => {
            if (event.currentTarget === event.target) setDetailOpen(false);
          }}
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-[1.5rem] border border-slate-200 bg-white shadow-2xl sm:max-w-2xl sm:rounded-[1.5rem]"
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-4 backdrop-blur sm:px-5">
              <div className="min-w-0">
                <div className="text-[9px] font-black uppercase tracking-[.14em] text-[#000080]">Seller guidance</div>
                <h3 id={dialogTitleId} className="mt-1 break-words text-base font-black text-slate-950">{guidance.title}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">{guidance.shortHelp}</p>
              </div>
              <button
                type="button"
                data-guidance-close
                onClick={() => setDetailOpen(false)}
                className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080]"
                aria-label="Close seller guidance"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </header>

            <div className="space-y-4 p-4 sm:p-5">
              {DETAIL_SECTIONS.map(section => {
                const value = guidance[section.key];
                if (!value || (Array.isArray(value) && !value.length)) return null;
                const example = section.key === 'usefulAnswerExample';
                return (
                  <div key={section.key} className={`rounded-xl border p-3.5 ${example ? 'border-blue-100 bg-blue-50/60' : 'border-slate-100 bg-slate-50/70'}`}>
                    <div className="text-[9px] font-black uppercase tracking-[.13em] text-slate-500">
                      {example ? 'Educational example — never saved' : section.label}
                    </div>
                    {Array.isArray(value)
                      ? <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-700">{value.map(item => <li key={item} className="flex gap-2"><span aria-hidden="true">•</span><span>{item}</span></li>)}</ul>
                      : <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{String(value)}</p>}
                  </div>
                );
              })}
              {guidance.sopReference && <div className="text-[9px] font-semibold text-slate-400">SOP reference: {guidance.sopReference}</div>}
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-[10px] font-semibold leading-4 text-amber-900">
                Guidance is instructional only. Opening help never saves an answer, confirms client information, changes lifecycle state, creates a Requirement, or writes Client Voice.
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
