import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarClock, CheckCircle2, ExternalLink, Loader2, RefreshCw, Settings, XCircle } from 'lucide-react';
import {
  recruitmentInterviewService,
  type RecruitmentInterviewBookingContext,
  type RecruitmentInterviewSlot,
} from '../../lib/recruitmentInterviewService';

interface Props {
  applicantId: string;
  candidateName: string;
  candidateTimezone?: string;
  context: RecruitmentInterviewBookingContext;
  onClose: () => void;
  onBooked: () => Promise<void>;
}

function formatDate(value: string, timeZone: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatTime(value: string, timeZone: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export default function RecruitmentInterviewBookingDialog({
  applicantId,
  candidateName,
  candidateTimezone,
  context,
  onClose,
  onBooked,
}: Props) {
  const [liveContext, setLiveContext] = useState(context);
  const [slots, setSlots] = useState<RecruitmentInterviewSlot[]>([]);
  const [selectedStart, setSelectedStart] = useState('');
  const [loading, setLoading] = useState(context.calendarReady);
  const [refreshingSetup, setRefreshingSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLiveContext(context);
  }, [context]);

  const refreshSetupStatus = useCallback(async (silent = false) => {
    if (!silent) setRefreshingSetup(true);
    try {
      const next = await recruitmentInterviewService.getBookingContext(applicantId);
      setLiveContext(next);
      setSelectedStart('');
      if (!next.calendarReady) setSlots([]);
      setError(null);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Meeting setup status could not be refreshed.');
    } finally {
      if (!silent) setRefreshingSetup(false);
    }
  }, [applicantId]);

  useEffect(() => {
    if (liveContext.calendarReady) return;
    const handleFocus = () => { void refreshSetupStatus(true); };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [liveContext.calendarReady, refreshSetupStatus]);

  useEffect(() => {
    let active = true;
    if (!liveContext.calendarReady) {
      setLoading(false);
      return () => { active = false; };
    }
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await recruitmentInterviewService.listAvailableSlots(applicantId, undefined, 14);
        if (active) setSlots(rows);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Available interview times could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [applicantId, liveContext.calendarReady]);

  const visibleSlots = useMemo(() => slots.slice(0, 36), [slots]);
  const selectedSlot = useMemo(() => slots.find(slot => slot.startAt === selectedStart) || null, [slots, selectedStart]);
  const candidateZone = candidateTimezone || liveContext.timezone;

  const book = async () => {
    if (!selectedSlot) return;
    setBusy(true);
    setError(null);
    try {
      await recruitmentInterviewService.bookInterview(applicantId, selectedSlot.startAt);
      await onBooked();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The interview could not be booked.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-stretch justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-3xl">
        <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#000080]">Protected recruitment booking</div>
              <h3 className="mt-1 text-xl font-bold text-slate-900">Book Recruitment Interview</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">Choose an available time from the responsible person&apos;s configured calendar. ProFox creates the Google Meet link automatically after booking.</p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Close booking" className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:text-slate-800 disabled:opacity-50"><XCircle className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Interviewer</div><div className="mt-1 text-sm font-bold text-slate-900">{liveContext.interviewerName}</div><div className="mt-1 text-xs text-slate-500">{liveContext.timezone}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Meeting setup</div><div className="mt-1 text-sm font-bold text-slate-900">{liveContext.providerLabel} · {liveContext.durationMinutes} min</div><div className="mt-1 text-xs text-slate-500">Candidate: {candidateName}</div></div>
          </div>

          {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700"><AlertCircle className="mt-1 h-4 w-4 shrink-0" />{error}</div>}

          {!liveContext.calendarReady ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <Settings className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-amber-900">{liveContext.setupTitle || 'Meeting setup required'}</div>
                  <p className="mt-1 text-sm leading-6 text-amber-800">{liveContext.setupMessage || 'Configure your calendar and meeting platform before booking candidate interviews.'}</p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <a href={liveContext.setupUrl || '/admin/booking-setup?source=recruitment'} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#000080] shadow-sm ring-1 ring-amber-200 hover:bg-amber-50">
                      {liveContext.setupActionLabel || 'Open Meeting Setup'}<ExternalLink className="h-4 w-4" />
                    </a>
                    <button type="button" onClick={() => void refreshSetupStatus()} disabled={refreshingSetup} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-100/60 px-4 py-2.5 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-60">
                      <RefreshCw className={`h-4 w-4 ${refreshingSetup ? 'animate-spin' : ''}`} />{refreshingSetup ? 'Checking...' : 'Check Setup Again'}
                    </button>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-amber-700">Setup opens in a new tab so this candidate stays open. When you return, ProFox re-checks the setup automatically and moves you to the next missing requirement, if any.</p>
                </div>
              </div>
            </div>
          ) : loading ? (
            <div className="flex min-h-[240px] items-center justify-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-[#000080]" />Loading available times...</div>
          ) : !visibleSlots.length ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center"><CalendarClock className="mx-auto h-6 w-6 text-slate-400" /><div className="mt-2 text-sm font-bold text-slate-800">No available times in the next 14 days</div><p className="mt-1 text-xs leading-5 text-slate-500">Your meeting setup is ready, but no open interview slots are available in this period. Update availability or time off, then check again.</p><button type="button" onClick={() => void refreshSetupStatus()} disabled={refreshingSetup} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[#000080] hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshingSetup ? 'animate-spin' : ''}`} />Refresh availability</button></div>
          ) : (
            <section className="mt-5">
              <div className="flex items-end justify-between gap-3"><div><h4 className="text-sm font-bold text-slate-900">Available interview times</h4><p className="mt-1 text-xs leading-5 text-slate-500">Primary time is shown in {liveContext.timezone}. Candidate local time is shown underneath when different.</p></div><span className="text-xs font-semibold text-slate-400">{slots.length} available</span></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {visibleSlots.map(slot => {
                  const selected = selectedStart === slot.startAt;
                  const candidateTime = candidateZone !== liveContext.timezone ? `${formatDate(slot.startAt, candidateZone)} · ${formatTime(slot.startAt, candidateZone)} (${candidateZone})` : '';
                  return <button key={slot.startAt} type="button" onClick={() => setSelectedStart(slot.startAt)} className={`rounded-xl border p-3 text-left transition ${selected ? 'border-[#000080] bg-blue-50 ring-2 ring-[#000080]/10' : 'border-slate-200 bg-white hover:border-[#000080]/30'}`}><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-bold text-slate-900">{formatDate(slot.startAt, liveContext.timezone)}</div><div className="mt-0.5 text-sm font-semibold text-[#000080]">{formatTime(slot.startAt, liveContext.timezone)} · {slot.durationMinutes} min</div>{candidateTime && <div className="mt-1 text-xs leading-5 text-slate-500">Candidate: {candidateTime}</div>}</div>{selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#000080]" />}</div></button>;
                })}
              </div>
              {slots.length > visibleSlots.length && <p className="mt-3 text-xs text-slate-400">Showing the earliest {visibleSlots.length} available times. Adjust availability if a later date is needed.</p>}
            </section>
          )}

          {liveContext.calendarReady && <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs leading-5 text-slate-600"><strong className="text-[#000080]">Automatic meeting delivery:</strong> ProFox creates the calendar event through the connected account, generates the Google Meet link, and sends the candidate&apos;s branded interview email only after that join link is ready.</div>}
        </div>

        <div className="border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-700 disabled:opacity-50">Cancel</button><button type="button" onClick={() => void book()} disabled={busy || !selectedSlot || !liveContext.calendarReady} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#000080] py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Book Interview</button></div>
        </div>
      </div>
    </div>
  );
}
