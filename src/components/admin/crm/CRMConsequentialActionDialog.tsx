import React, { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import SellerGuidanceHelp from './SellerGuidanceHelp';
import type { SellerGuidanceEntry } from '../../../lib/crmSellerGuidance';

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmTone?: 'primary' | 'danger';
  requiredCheckboxLabel?: string;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  guidance?: SellerGuidanceEntry | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (value: { confirmed: boolean; reason: string }) => Promise<void> | void;
};

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export default function CRMConsequentialActionDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmTone = 'primary',
  requiredCheckboxLabel,
  requireReason = false,
  reasonLabel = 'Reason',
  reasonPlaceholder = 'Record a clear reason…',
  guidance,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const headingId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) { setConfirmed(false); setReason(''); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first || dialogRef.current)?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) || []);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;
  const valid = (!requiredCheckboxLabel || confirmed) && (!requireReason || reason.trim().length >= 6);
  const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#000080]';

  return <div className="fixed inset-0 z-[160] flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={headingId} aria-describedby={descriptionId} className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" /><h2 id={headingId} className="text-base font-black text-slate-950">{title}</h2>{guidance && <SellerGuidanceHelp guidance={guidance} />}</div><p id={descriptionId} className="mt-2 text-xs leading-5 text-slate-600">{description}</p></div>
        <button type="button" aria-label="Close dialog" disabled={busy} onClick={onCancel} className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 ${focusRing} disabled:opacity-50`}><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-4 px-5 py-4">
        {requiredCheckboxLabel && <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className={`mt-0.5 h-5 w-5 shrink-0 accent-[#000080] ${focusRing}`} /><span>{requiredCheckboxLabel}</span></label>}
        {requireReason && <label className="block text-xs font-black text-slate-700">{reasonLabel}<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder={reasonPlaceholder} maxLength={2000} rows={4} className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-[#000080] focus:ring-2 focus:ring-blue-100" /><span className="mt-1 block text-[10px] font-semibold text-slate-400">Minimum 6 characters. This explanation becomes part of the audit trail.</span></label>}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
        <button type="button" disabled={busy} onClick={onCancel} className={`min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600 ${focusRing} disabled:opacity-50`}>Cancel</button>
        <button type="button" disabled={!valid || busy} onClick={() => void onConfirm({ confirmed, reason: reason.trim() })} className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-xs font-black text-white ${focusRing} disabled:cursor-not-allowed disabled:opacity-40 ${confirmTone === 'danger' ? 'bg-rose-600' : 'bg-[#000080]'}`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{confirmLabel}</button>
      </div>
    </section>
  </div>;
}
