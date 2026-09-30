import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CalendarClock, CalendarDays, CheckCircle2, Clock3, Loader2, ShieldCheck, Video } from 'lucide-react';
import { useParams } from 'react-router-dom';
import {
  recruitmentInterviewJoinService,
  type PublicRecruitmentInterviewJoin,
  type PublicRecruitmentInterviewRescheduleResult,
  type PublicRecruitmentInterviewRescheduleSlot,
} from '../lib/recruitmentInterviewJoinService';

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Scheduled interview';
  return date.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

export default function RecruitmentInterviewJoinPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [interview, setInterview] = useState<PublicRecruitmentInterviewJoin | null>(null);
  const [error, setError] = useState('');
  const [redirecting, setRedirecting] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [slots, setSlots] = useState<PublicRecruitmentInterviewRescheduleSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedStart, setSelectedStart] = useState('');
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [rescheduleResult, setRescheduleResult] = useState<PublicRecruitmentInterviewRescheduleResult | null>(null);
  const redirected = useRef(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await recruitmentInterviewJoinService.open(token);
        if (!active) return;
        setInterview(result);
      } catch (err: any) {
        if (active) setError(err?.message || 'This interview link is invalid or no longer active.');
      }
    };
    void load();
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!interview?.joinUrl || interview.meetingEnded || interview.canReschedule || redirected.current || rescheduleResult) return;
    redirected.current = true;
    setRedirecting(true);
    const timer = window.setTimeout(() => {
      window.location.replace(interview.joinUrl);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [interview, rescheduleResult]);

  const selectedSlot = useMemo(() => slots.find(slot => slot.startAt === selectedStart) || null, [slots, selectedStart]);

  const openMeeting = () => {
    if (!interview?.joinUrl) return;
    setRedirecting(true);
    window.location.assign(interview.joinUrl);
  };

  const openReschedule = async () => {
    if (!interview?.canReschedule || rescheduleBusy) return;
    setRescheduleOpen(true);
    setRescheduleError('');
    if (slots.length) return;
    setSlotsLoading(true);
    try {
      const rows = await recruitmentInterviewJoinService.listRescheduleSlots(token);
      setSlots(rows);
    } catch (err: any) {
      setRescheduleError(err?.message || 'Available reschedule times could not be loaded.');
    } finally {
      setSlotsLoading(false);
    }
  };

  const confirmReschedule = async () => {
    if (!selectedSlot || rescheduleBusy) return;
    setRescheduleBusy(true);
    setRescheduleError('');
    try {
      const result = await recruitmentInterviewJoinService.reschedule(token, selectedSlot.startAt);
      setRescheduleResult(result);
      setInterview(current => current ? {
        ...current,
        startAt: result.startAt,
        endAt: result.endAt,
        timezone: result.timezone,
        joinUrl: '',
        canReschedule: false,
        candidateRescheduled: true,
        meetingEnded: false,
      } : current);
      setRescheduleOpen(false);
      setSlots([]);
      setSelectedStart('');
    } catch (err: any) {
      setRescheduleError(err?.message || 'The interview could not be rescheduled.');
    } finally {
      setRescheduleBusy(false);
    }
  };

  if (error) {
    return <main className="min-h-screen bg-[#f4f5fb] px-4 py-10">
      <div className="mx-auto max-w-xl rounded-3xl border border-red-200 bg-white p-7 shadow-sm">
        <div className="flex items-start gap-3 text-red-700">
          <AlertCircle className="mt-0.5 h-6 w-6 shrink-0"/>
          <div><h1 className="text-xl font-black">Interview link unavailable</h1><p className="mt-2 text-sm leading-6">{error}</p><p className="mt-3 text-sm leading-6 text-slate-600">Please use the latest ProFox Recruitment email or contact the Recruitment Team if your interview is still scheduled.</p></div>
        </div>
      </div>
    </main>;
  }

  if (!interview) {
    return <main className="min-h-screen bg-[#f4f5fb] px-4 py-10">
      <div className="mx-auto flex max-w-xl items-center justify-center rounded-3xl border border-slate-200 bg-white p-14 shadow-sm">
        <Loader2 className="h-7 w-7 animate-spin text-[#000080]"/>
      </div>
    </main>;
  }

  const mobile = isMobileDevice();

  return <main className="min-h-screen bg-[#f4f5fb] px-4 py-8 sm:py-12">
    <div className="mx-auto max-w-xl">
      <header className="mb-5 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <div><div className="text-xl font-black text-[#000080]">ProFox Web Designer</div><div className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Recruitment Interview</div></div>
        <ShieldCheck className="h-6 w-6 text-[#000080]"/>
      </header>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="h-1.5 bg-[#000080]"/>
        <div className="p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[#000080]"><Video className="h-6 w-6"/></span>
            <div>
              <div className="text-xs font-black uppercase tracking-[0.14em] text-[#000080]">Secure interview access</div>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{interview.meetingEnded ? 'Your scheduled interview has ended' : 'Your ProFox interview is ready'}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">Hi {interview.candidateName}. {interview.meetingEnded ? 'The original meeting link is no longer active.' : 'Choose whether to join now or use the one-time reschedule option.'}</p>
            </div>
          </div>

          <div className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex gap-3"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]"/><div><div className="text-xs font-black uppercase tracking-wide text-slate-400">Interview</div><div className="mt-1 text-sm font-bold text-slate-900">{interview.interviewStage}</div></div></div>
            <div className="flex gap-3"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]"/><div><div className="text-xs font-black uppercase tracking-wide text-slate-400">Your device time</div><div className="mt-1 text-sm font-bold text-slate-900">{formatDateTime(interview.startAt)}</div></div></div>
            <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]"/><div><div className="text-xs font-black uppercase tracking-wide text-slate-400">Interviewer</div><div className="mt-1 text-sm font-bold text-slate-900">{interview.interviewerName}</div></div></div>
          </div>

          {rescheduleResult ? (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-start gap-3 text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0"/>
                <div>
                  <div className="font-black">Interview rescheduled</div>
                  <p className="mt-1 text-sm leading-6">Your new interview time is <strong>{formatDateTime(rescheduleResult.startAt)}</strong>.</p>
                  <p className="mt-2 text-sm leading-6">ProFox is updating the existing Zoho meeting and calendar event. A fresh interview email will be sent when the updated meeting link is ready.</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {interview.meetingEnded ? (
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  {interview.canReschedule
                    ? <>You may reschedule this interview <strong>once</strong>. The new time must be later than the original interview and no more than <strong>24 hours later</strong>{interview.rescheduleDeadline ? <> (deadline: {formatDateTime(interview.rescheduleDeadline)})</> : null}.</>
                    : interview.candidateRescheduled
                      ? 'The one-time candidate reschedule has already been used. Please use the latest interview email for the updated meeting.'
                      : 'The candidate self-reschedule window has closed. Please contact the ProFox Recruitment Team if you still need assistance.'}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm leading-6 text-slate-700">
                  {mobile
                    ? 'Use Join Interview to open the secure Zoho participant link. On phones and tablets, Zoho may hand the meeting off to its mobile app depending on your device and browser.'
                    : 'Use Join Interview to open the meeting in your browser. Chrome, Edge, or Firefox on a laptop or desktop gives the smoothest Zoho Meeting experience.'}
                </div>
              )}

              {interview.joinUrl && !interview.meetingEnded && (
                <button type="button" onClick={openMeeting} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 text-sm font-black text-white">
                  {redirecting ? <Loader2 className="h-4 w-4 animate-spin"/> : <ArrowRight className="h-4 w-4"/>}
                  {redirecting ? 'Opening Interview...' : 'Join Interview'}
                </button>
              )}

              {interview.canReschedule && (
                <button type="button" onClick={() => void openReschedule()} disabled={rescheduleBusy} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#000080]/20 bg-white px-5 text-sm font-black text-[#000080] hover:bg-blue-50 disabled:opacity-50">
                  <CalendarClock className="h-4 w-4"/>
                  Reschedule Interview
                </button>
              )}
            </>
          )}

          {rescheduleOpen && !rescheduleResult && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="font-black text-slate-900">Choose a new time</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">You can use this option only once. Only available times within the 24-hour delay limit are shown.</p>

              {rescheduleError && <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700"><AlertCircle className="mt-1 h-4 w-4 shrink-0"/>{rescheduleError}</div>}

              {slotsLoading ? (
                <div className="flex min-h-28 items-center justify-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-[#000080]"/>Loading available times...</div>
              ) : slots.length ? (
                <>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {slots.map(slot => {
                      const selected = slot.startAt === selectedStart;
                      return <button key={slot.startAt} type="button" onClick={() => setSelectedStart(slot.startAt)} className={'rounded-xl border p-3 text-left transition ' + (selected ? 'border-[#000080] bg-blue-50 ring-2 ring-[#000080]/10' : 'border-slate-200 bg-white hover:border-[#000080]/30')}>
                        <div className="text-sm font-bold text-slate-900">{formatDateTime(slot.startAt)}</div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">{slot.durationMinutes} minutes</div>
                      </button>;
                    })}
                  </div>
                  <button type="button" onClick={() => void confirmReschedule()} disabled={!selectedSlot || rescheduleBusy} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 text-sm font-black text-white disabled:opacity-40">
                    {rescheduleBusy && <Loader2 className="h-4 w-4 animate-spin"/>}
                    Confirm New Time
                  </button>
                </>
              ) : (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">No available interviewer time is currently available within the allowed 24-hour delay. Please contact the ProFox Recruitment Team.</div>
              )}
            </div>
          )}

          <p className="mt-4 text-center text-xs leading-5 text-slate-400">Rescheduling updates the existing interview and Zoho meeting. It does not create a duplicate meeting.</p>
        </div>
      </section>
    </div>
  </main>;
}
