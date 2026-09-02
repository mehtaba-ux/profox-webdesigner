import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, X } from 'lucide-react';
import { Route, Routes, useLocation } from 'react-router-dom';
import SalesChatInbox from './SalesChatInbox';

interface CustomerCommunicationDrawerProps {
  leadId: string;
  customerLabel?: string;
  onClose: () => void;
}

export default function CustomerCommunicationDrawer({ leadId, customerLabel, onClose }: CustomerCommunicationDrawerProps) {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  const scopedLocation = useMemo(() => {
    const params = new URLSearchParams(location.search);
    params.set('lead', leadId);
    params.delete('conversation');
    return { ...location, search: `?${params.toString()}` };
  }, [leadId, location]);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setVisible(false);
    window.setTimeout(onClose, 220);
  }, [closing, onClose]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [requestClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[180]" role="presentation">
      <button
        type="button"
        aria-label="Close customer communication"
        onClick={requestClose}
        className={`absolute inset-0 bg-slate-950/45 backdrop-blur-[1px] transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Customer communication${customerLabel ? ` for ${customerLabel}` : ''}`}
        className={`absolute inset-y-0 right-0 flex w-full max-w-[1180px] flex-col bg-[#f4f7fb] shadow-2xl transition-transform duration-200 ease-out ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#000080] text-white">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[.14em] text-[#000080]">Customer communication</div>
              <div className="truncate text-sm font-black text-slate-900">{customerLabel || 'Unified customer conversation'}</div>
              <div className="mt-0.5 text-[10px] font-semibold text-slate-400">Your CRM screen stays open behind this panel.</div>
            </div>
          </div>
          <button type="button" onClick={requestClose} className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700" aria-label="Close communication panel">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-4">
          <Routes location={scopedLocation}>
            <Route path="*" element={<SalesChatInbox />} />
          </Routes>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
