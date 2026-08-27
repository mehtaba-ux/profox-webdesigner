import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, PauseCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

type DeadlineState = {
  stage?: string;
  startedAt?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
  secondsRemaining?: number | null;
  overdue?: boolean;
  pausedForReview?: boolean;
  reviewWaitStartedAt?: string | null;
};

function formatRemaining(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function SalesAcademyDeadlineBanner() {
  const { role } = useAuth();
  const [deadline, setDeadline] = useState<DeadlineState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!['sales', 'sales_rep', 'sales_team'].includes(String(role || ''))) return;
    let mounted = true;
    const load = async () => {
      const { data, error } = await supabase.rpc('get_my_sales_academy_deadline');
      if (!mounted) return;
      if (error) {
        console.error('Unable to load Sales Academy deadline:', error.message);
        return;
      }
      setDeadline((data || null) as DeadlineState | null);
      setNow(Date.now());
    };
    void load();
    const refresh = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => { mounted = false; window.clearInterval(refresh); };
  }, [role]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const view = useMemo(() => {
    if (!deadline?.dueAt) return null;
    const due = new Date(deadline.dueAt);
    const dueMs = due.getTime();
    if (!Number.isFinite(dueMs)) return null;
    const remainingMs = dueMs - now;
    const completed = Boolean(deadline.completedAt) || ['Final Approval', 'Ready for System Access', 'Activated'].includes(String(deadline.stage || ''));
    const paused = !completed && deadline.pausedForReview === true;
    const overdue = !completed && !paused && remainingMs <= 0;
    return {
      completed,
      paused,
      overdue,
      remaining: formatRemaining(remainingMs),
      deadlineLabel: due.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    };
  }, [deadline, now]);

  if (!['sales', 'sales_rep', 'sales_team'].includes(String(role || '')) || !view) return null;

  if (view.completed) {
    return (
      <div className="mx-auto max-w-7xl px-4 pt-4 md:px-8">
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div><div className="text-sm font-black">Sales Academy training completed</div><p className="mt-1 text-xs leading-5 text-emerald-700">Your training window is complete. Continue following the Final Approval and activation instructions shown in your workspace.</p></div>
        </div>
      </div>
    );
  }

  if (view.paused) {
    return (
      <div className="mx-auto max-w-7xl px-4 pt-4 md:px-8">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div><div className="text-sm font-black text-amber-900">Training countdown paused for Management review</div><p className="mt-1 text-xs leading-5 text-amber-800">A required submission is waiting for ProFox review. Your remaining training time is protected while this review is pending. When the final pending review is resolved, the deadline will automatically move forward by the exact review-wait duration.</p><div className="mt-2 text-[11px] font-bold text-amber-900"><span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{view.remaining} protected time remaining</span></div></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 md:px-8">
      <div className={`rounded-2xl border p-4 shadow-sm ${view.overdue ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}`}>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            {view.overdue ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" /> : <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-[#000080]" />}
            <div>
              <div className={`text-sm font-black ${view.overdue ? 'text-red-900' : 'text-[#000080]'}`}>{view.overdue ? '10-day Sales Academy deadline reached' : '10-day Sales Academy completion window'}</div>
              <p className={`mt-1 text-xs leading-5 ${view.overdue ? 'text-red-700' : 'text-blue-800'}`}>{view.overdue ? 'Continue completing any remaining candidate-controlled requirements. Management has been notified to review your current status and any review blockers.' : 'Complete all required modules, assessments and candidate-controlled practical submissions within this training window. Work steadily and do not leave the curriculum until the final day.'}</p>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-bold">
                <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{view.overdue ? 'Deadline reached' : `${view.remaining} remaining`}</span>
                <span>Due {view.deadlineLabel}</span>
              </div>
            </div>
          </div>
          {!view.overdue && <div className="shrink-0 rounded-xl bg-white px-4 py-3 text-center shadow-sm ring-1 ring-blue-100"><div className="text-xl font-black text-[#000080]">{view.remaining}</div><div className="text-[9px] font-black uppercase tracking-wider text-slate-500">Time Remaining</div></div>}
        </div>
      </div>
    </div>
  );
}
