import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  RefreshCw,
  CalendarCheck,
} from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { SalesTodayDashboard, salesAutomationService } from '../../lib/salesAutomationService';

function formatDateTime(value: string, timezone?: string) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}

export default function SellerTodayDashboard() {
  const navigate = useNavigate();
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const allowed = Boolean(user && (isAdmin || (profile?.role === 'sales' && profile?.status === 'active')));
  const [data, setData] = useState<SalesTodayDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await salesAutomationService.getTodayDashboard());
    } catch (err: any) {
      setError(err?.message || 'Unable to load your sales day.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  if (authLoading) return <div className="min-h-screen bg-slate-50" />;
  if (!allowed) return <Navigate to="/admin/workspace" replace />;

  const counts = data?.counts || { meetingsToday: 0, overdueActivities: 0, newBookings: 0, quotationFollowUps: 0, unreadNotifications: 0 };
  const cards = [
    { label: 'Meetings Today', value: counts.meetingsToday, icon: CalendarDays, tone: 'bg-blue-50 text-[#000080]' },
    { label: 'New Bookings', value: counts.newBookings, icon: CalendarCheck, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Follow-Ups Overdue', value: counts.overdueActivities, icon: AlertCircle, tone: 'bg-red-50 text-red-700' },
    { label: 'Quotation Follow-Ups', value: counts.quotationFollowUps, icon: FileText, tone: 'bg-amber-50 text-amber-700' },
    { label: 'Unread Alerts', value: counts.unreadNotifications, icon: Bell, tone: 'bg-violet-50 text-violet-700' }
  ];

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-3"><button onClick={()=>navigate('/admin/workspace')} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><ArrowLeft className="h-4 w-4"/></button><div><h1 className="text-xl font-black">Today</h1><p className="text-xs text-slate-500">What needs your attention now—meetings, follow-ups, new bookings and quotations.</p></div></div>
        <button onClick={()=>void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/> Refresh</button>
      </div>
    </header>
    <main className="mx-auto max-w-7xl p-4 sm:p-8">
      {error&&<div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
      {loading&&!data?<div className="flex min-h-80 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>:<>
        {isAdmin&&data?.scope==='team'&&<div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800"><strong>Team view:</strong> this founder/admin view rolls up active sales work across the team. Individual sellers see only their own workload.</div>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{cards.map(card=>{const Icon=card.icon;return <div key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${card.tone}`}><Icon className="h-5 w-5"/></div><div className="mt-4 text-3xl font-black">{card.value}</div><div className="mt-1 text-xs font-bold text-slate-500">{card.label}</div></div>;})}</div>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-black">Today's meetings</h2><p className="mt-1 text-xs text-slate-500">Preparation first, then the call.</p></div><CalendarDays className="h-5 w-5 text-[#000080]"/></div>{(data?.todayMeetings||[]).length===0?<Empty text="No scheduled meetings today."/>:<div className="space-y-3">{data!.todayMeetings.map((meeting:any)=><div key={meeting.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="text-sm font-black">{meeting.companyName||meeting.title}</div><div className="mt-1 text-xs text-slate-500">{meeting.contactName||'Prospect'} · {meeting.serviceInterest||meeting.title}</div><div className="mt-2 flex items-center gap-2 text-xs font-bold text-[#000080]"><Clock3 className="h-3.5 w-3.5"/>{formatDateTime(meeting.startAt,meeting.timezone)}</div></div><div className="flex gap-2"><button onClick={()=>navigate(meeting.prepUrl)} className="rounded-xl bg-[#000080] px-3 py-2 text-[11px] font-black text-white">Open prep</button>{meeting.meetingUrl&&<a href={meeting.meetingUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700">Join</a>}</div></div></div>)}</div>}</div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-black">Overdue follow-ups</h2><p className="mt-1 text-xs text-slate-500">Oldest items appear first.</p></div><AlertCircle className="h-5 w-5 text-red-600"/></div>{(data?.overdueActivities||[]).length===0?<Empty text="Nothing overdue. Nice and clean."/>:<div className="space-y-3">{data!.overdueActivities.map((item:any)=><button key={item.id} onClick={()=>navigate('/admin/app/crm?tab=activities')} className="block w-full rounded-2xl border border-red-100 bg-red-50/40 p-4 text-left hover:bg-red-50"><div className="text-sm font-black">{item.subject}</div><div className="mt-1 text-xs text-slate-500">{item.activityType} · due {formatDateTime(item.dueAt)}</div></button>)}</div>}</div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-black">Quotation actions</h2><p className="mt-1 text-xs text-slate-500">Sent quotations waiting for follow-up.</p></div><FileText className="h-5 w-5 text-amber-600"/></div>{(data?.quotationActions||[]).length===0?<Empty text="No quotation follow-ups due."/>:<div className="space-y-3">{data!.quotationActions.map((q:any)=><button key={q.id} onClick={()=>navigate(q.url||'/admin/app/sales?tab=quotations')} className="block w-full rounded-2xl border border-amber-100 bg-amber-50/40 p-4 text-left hover:bg-amber-50"><div className="text-sm font-black">{q.customerName}</div><div className="mt-1 text-xs text-slate-500">{q.quotationNumber} · {q.currency} {Number(q.total||0).toLocaleString()} · sent {formatDateTime(q.sentAt)}</div></button>)}</div>}</div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-black">Notifications</h2><p className="mt-1 text-xs text-slate-500">New bookings and actions that need attention.</p></div><Bell className="h-5 w-5 text-violet-600"/></div>{(data?.notifications||[]).length===0?<Empty text="No unread notifications."/>:<div className="space-y-3">{data!.notifications.map((n:any)=><div key={n.id} className="rounded-2xl border border-violet-100 bg-violet-50/30 p-4"><button onClick={()=>n.actionUrl&&navigate(n.actionUrl)} className="block w-full text-left"><div className="text-sm font-black">{n.title}</div><div className="mt-1 text-xs leading-5 text-slate-500">{n.message}</div></button><button onClick={async()=>{await salesAutomationService.markNotificationRead(n.id);await load();}} className="mt-3 inline-flex items-center gap-1 text-[10px] font-black text-violet-700"><CheckCircle2 className="h-3.5 w-3.5"/> Mark read</button></div>)}</div>}</div>
        </section>
      </>}
    </main>
  </div>;
}

function Empty({text}:{text:string}) {
  return <div className="rounded-2xl border border-dashed border-slate-200 p-7 text-center text-xs font-semibold text-slate-400">{text}</div>;
}
