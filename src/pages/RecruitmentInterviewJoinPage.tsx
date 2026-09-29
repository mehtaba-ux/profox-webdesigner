import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CalendarDays, CheckCircle2, Clock3, Loader2, ShieldCheck, Video } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { recruitmentInterviewJoinService, type PublicRecruitmentInterviewJoin } from '../lib/recruitmentInterviewJoinService';

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
    if (!interview?.joinUrl || redirected.current) return;
    redirected.current = true;
    setRedirecting(true);
    const timer = window.setTimeout(() => {
      window.location.replace(interview.joinUrl);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [interview]);

  const openMeeting = () => {
    if (!interview?.joinUrl) return;
    setRedirecting(true);
    window.location.assign(interview.joinUrl);
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
            <div><div className="text-xs font-black uppercase tracking-[0.14em] text-[#000080]">Secure interview access</div><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Opening your ProFox interview</h1><p className="mt-2 text-sm leading-6 text-slate-600">Hi {interview.candidateName}. Your secure interview link is ready.</p></div>
          </div>

          <div className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex gap-3"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]"/><div><div className="text-xs font-black uppercase tracking-wide text-slate-400">Interview</div><div className="mt-1 text-sm font-bold text-slate-900">{interview.interviewStage}</div></div></div>
            <div className="flex gap-3"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]"/><div><div className="text-xs font-black uppercase tracking-wide text-slate-400">Your device time</div><div className="mt-1 text-sm font-bold text-slate-900">{formatDateTime(interview.startAt)}</div></div></div>
            <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]"/><div><div className="text-xs font-black uppercase tracking-wide text-slate-400">Interviewer</div><div className="mt-1 text-sm font-bold text-slate-900">{interview.interviewerName}</div></div></div>
          </div>

          <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm leading-6 text-slate-700">
            {mobile
              ? 'Opening the secure Zoho participant link now. On phones and tablets, Zoho may hand the meeting off to its mobile app depending on your device and browser.'
              : 'Opening the interview in your browser now. Chrome, Edge, or Firefox on a laptop or desktop gives the smoothest Zoho Meeting experience.'}
          </div>

          <button type="button" onClick={openMeeting} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 text-sm font-black text-white">
            {redirecting ? <Loader2 className="h-4 w-4 animate-spin"/> : <ArrowRight className="h-4 w-4"/>}
            {redirecting ? 'Opening Interview...' : 'Join Interview'}
          </button>

          <p className="mt-4 text-center text-xs leading-5 text-slate-400">If the meeting does not open automatically, use the button above. This page never creates a second meeting.</p>
        </div>
      </section>
    </div>
  </main>;
}
