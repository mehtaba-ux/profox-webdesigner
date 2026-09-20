import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Award,
  BellRing,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  DollarSign,
  FileText,
  LayoutDashboard,
  Loader2,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingUp,
  UserPlus,
  Video
} from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import {
  SellerCommandCenterData,
  SellerCommissionEntry,
  SellerCoreProduct,
  SellerDashboardPeriod,
  sellerCommandCenterService
} from '../../lib/sellerCommandCenterService';
import {
  SellerAdjustedCommission,
  SellerEnhancedMeeting,
  SellerExperienceClosureData,
  sellerExperienceClosureService
} from '../../lib/sellerExperienceClosureService';

const SELLER_ROLES = ['sales', 'sales_rep', 'sales_team'];
const PERIODS: Array<{ key: SellerDashboardPeriod; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'custom', label: 'Custom' }
];

function money(value: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency,
      maximumFractionDigits: Number(value || 0) % 1 === 0 ? 0 : 2
    }).format(Number(value || 0));
  } catch {
    return `$${Number(value || 0).toLocaleString()}`;
  }
}

function shortDate(value?: string | null) {
  if (!value) return 'Not scheduled';
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function shortDateTime(value?: string | null, timezone?: string | null) {
  if (!value) return 'Not scheduled';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || undefined,
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}

function greetingFor(timezone?: string | null) {
  try {
    const hour = Number(new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || undefined,
      hour: '2-digit', hourCycle: 'h23'
    }).format(new Date()));
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  } catch {
    return 'Hello';
  }
}

function productPrice(product: SellerCoreProduct) {
  if (product.priceMode === 'custom') return 'Custom Quote';
  const value = money(product.basePrice, product.currency);
  return product.priceMode === 'starting_at' ? `${value}+` : value;
}

function statusClasses(status: string) {
  if (status === 'Paid') return 'bg-emerald-100 text-emerald-800';
  if (status === 'Scheduled') return 'bg-blue-100 text-blue-800';
  if (status === 'Approved') return 'bg-indigo-100 text-indigo-800';
  if (status === 'Earned') return 'bg-teal-100 text-teal-800';
  if (status === 'Adjusted') return 'bg-amber-100 text-amber-800';
  if (status === 'Reversed') return 'bg-red-100 text-red-800';
  return 'bg-amber-100 text-amber-800';
}

function periodLabel(data: SellerCommandCenterData) {
  const match = PERIODS.find(item => item.key === data.period.key)?.label || 'Selected period';
  if (data.period.key === 'custom') return `${shortDate(data.period.start)} – ${shortDate(data.period.end)}`;
  return `${match} · ${shortDate(data.period.start)} – ${shortDate(data.period.end)}`;
}

function comparisonText(value: { absolute: number; percent: number | null } | undefined, formatter?: (value: number) => string) {
  if (!value) return null;
  const prefix = value.absolute > 0 ? '+' : '';
  if (value.percent != null) return `${prefix}${value.percent}% vs previous period`;
  return `${prefix}${formatter ? formatter(value.absolute) : value.absolute} vs previous period`;
}

export default function SellerExperienceClosure() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const allowed = Boolean(user && profile && profile.status === 'active' && (isAdmin || SELLER_ROLES.includes(profile.role)));
  const [core, setCore] = useState<SellerCommandCenterData | null>(null);
  const [closure, setClosure] = useState<SellerExperienceClosureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<SellerDashboardPeriod>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [actionId, setActionId] = useState('');

  const load = async (nextPeriod: SellerDashboardPeriod = period, start = customStart, end = customEnd) => {
    if (nextPeriod === 'custom' && (!start || !end)) return;
    setLoading(true);
    setError('');
    try {
      const [coreData, closureData] = await Promise.all([
        sellerCommandCenterService.get({
          period: nextPeriod,
          startDate: nextPeriod === 'custom' ? start : null,
          endDate: nextPeriod === 'custom' ? end : null
        }),
        sellerExperienceClosureService.get()
      ]);
      setCore(coreData);
      setClosure(closureData);
      setPeriod(coreData.period.key);
    } catch (err: any) {
      setError(err?.message || 'Unable to load the Sales Command Center.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed) void load('month', '', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  useEffect(() => {
    if (!loading && location.hash) {
      const id = location.hash.slice(1);
      window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
    }
  }, [loading, location.hash]);

  const monthlyProgress = useMemo(() => {
    if (!core) return 0;
    return Math.max(0, Math.min(100, Number(core.performance.targetCompletion || 0)));
  }, [core]);

  const markRead = async (id: string) => {
    setActionId(id);
    try {
      await sellerExperienceClosureService.markNotificationRead(id);
      setClosure(current => current ? { ...current, notifications: current.notifications.filter(item => item.id !== id) } : current);
    } catch (err: any) {
      setError(err?.message || 'Notification could not be marked read.');
    } finally {
      setActionId('');
    }
  };

  if (authLoading) return <div className="min-h-screen bg-slate-50" />;
  if (!allowed) return <Navigate to="/admin/workspace" replace />;
  if (loading && !core) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-9 w-9 animate-spin text-[#000080]" /></div>;
  if (!core || !closure) return <div className="min-h-screen bg-slate-50 p-8"><Notice text={error || 'Seller dashboard data is unavailable.'} /></div>;

  const teamMode = core.scope === 'team';
  const counts = core.today.counts;
  const firstName = String(profile?.fullName || '').trim().split(/\s+/)[0] || 'Seller';
  const greeting = greetingFor(core.timezone || profile?.timezone);
  const progressionRules = closure.careerProgression?.criteria || [];

  const priorityCards = [
    { label: 'Follow-ups Due Today', value: counts.followUpsDueToday, path: '/admin/app/crm?tab=activities', danger: false },
    { label: 'Meetings Today', value: counts.meetingsToday, path: '/admin/meetings', danger: false },
    { label: 'Overdue Activities', value: counts.overdueActivities, path: '/admin/app/crm?tab=activities', danger: counts.overdueActivities > 0 },
    { label: 'Quotes Awaiting Response', value: counts.quotationsAwaitingResponse, path: '/admin/app/sales?tab=quotations', danger: false },
    { label: 'Payments Awaiting Verification', value: counts.paymentsAwaitingVerification, path: '/admin/app/sales?tab=payments', danger: counts.paymentsAwaitingVerification > 0 },
    { label: 'Leads Needing Action', value: counts.leadsNeedingAction, path: '/admin/app/crm?tab=crm_leads', danger: counts.leadsNeedingAction > 0 },
    { label: 'Academy / Policy Updates', value: counts.academyPolicyAcknowledgements, path: '/admin/today#seller-notifications', danger: false }
  ];

  const quickActions = [
    { label: 'Add Lead', path: '/admin/app/crm?tab=crm_leads&action=new', icon: UserPlus },
    { label: 'Log Call', path: '/admin/app/crm?tab=activities&action=new&type=Cold%20Call', icon: PhoneCall },
    { label: 'Book Meeting', path: '/admin/meetings?action=new', icon: CalendarDays },
    { label: 'Create Quotation', path: '/admin/app/sales?tab=quotations&action=new', icon: FileText },
    { label: 'Add Follow-Up', path: '/admin/app/crm?tab=activities&action=new&type=Follow-Up', icon: Clock3 },
    { label: 'Sales Resources', path: '/admin/app/academy?tab=training_library', icon: BookOpen }
  ];

  return <div className="profox-app-shell min-h-screen bg-[#f3f7fc] text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#000080]">Sales · Command Center</div>
          <h1 className="mt-1 text-2xl font-black">{teamMode ? 'Sales Team Command Center' : `${greeting}, ${firstName}`}</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">One seller workspace connected to the canonical CRM, Calendar, Quotations, Payments, Commissions, Academy, Notifications and Career Progression systems.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
    </header>

    <main className="mx-auto max-w-7xl space-y-9 p-4 sm:p-8">
      {error && <Notice text={error} />}
      {teamMode && <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900"><strong>Founder/Admin team view:</strong> active sellers remain server-restricted to their own records.</div>}

      <section>
        <SectionHeading number="01" title="Today’s Priorities" subtitle="Current work that needs attention now, from the existing operating systems." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {priorityCards.map(card => <button key={card.label} onClick={() => navigate(card.path)} className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${card.danger ? 'border-red-200' : 'border-slate-200 hover:border-[#000080]/30'}`}>
            <div className={`text-2xl font-black ${card.danger ? 'text-red-700' : 'text-[#000080]'}`}>{card.value}</div>
            <div className="mt-2 text-[11px] font-black leading-4 text-slate-700">{card.label}</div>
            <ArrowRight className="mt-3 h-3.5 w-3.5 text-slate-300" />
          </button>)}
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <Panel title="Needs Your Attention" subtitle="Each row opens the exact record that needs action." icon={<AlertCircle className="h-5 w-5 text-red-600" />}>
            {closure.exactAttention.length === 0 ? <Empty text="Your priority queue is clear." /> : <div className="space-y-2">
              {closure.exactAttention.slice(0, 10).map((item, index) => <button key={`${item.type}-${item.entityId || index}`} onClick={() => navigate(item.actionUrl)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left hover:border-[#000080]/20 hover:bg-blue-50/40">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.priority === 'high' ? 'bg-red-500' : 'bg-amber-500'}`} />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-black">{item.title}</div><div className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</div></div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>)}
            </div>}
          </Panel>

          <Panel title="Meetings requiring preparation" subtitle="Tomorrow’s unprepared meetings plus complete actions for upcoming calls." icon={<Video className="h-5 w-5 text-rose-700" />}>
            {closure.tomorrowMeetings.length === 0 ? <Empty text="No unprepared meetings are scheduled for tomorrow." /> : <div className="space-y-3">{closure.tomorrowMeetings.slice(0, 5).map(meeting => <MeetingActions key={meeting.id} meeting={meeting} navigate={navigate} />)}</div>}
          </Panel>
        </div>

        <div className="mt-5">
          <SectionHeading title="Quick Actions" subtitle="The six approved shortcuts open the existing business workflows—no parallel forms or data stores." />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {quickActions.map(action => { const Icon = action.icon; return <button key={action.label} onClick={() => navigate(action.path)} className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:-translate-y-0.5 hover:border-[#000080]/30 hover:shadow-md"><Icon className="h-5 w-5 text-[#000080]" /><div className="mt-3 text-xs font-black">{action.label}</div><ArrowRight className="mt-2 h-3.5 w-3.5 text-slate-300 group-hover:text-[#000080]" /></button>; })}
          </div>
        </div>
      </section>

      <section>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <SectionHeading number="02" title="Sales Performance" subtitle="Verified, timestamped activity only. Pipeline remains the CRM source of truth." />
          <div className="flex flex-wrap items-center gap-2">{PERIODS.map(item => <button key={item.key} onClick={() => { setPeriod(item.key); if (item.key !== 'custom') void load(item.key, '', ''); }} className={`rounded-xl px-3 py-2 text-[11px] font-black ${period === item.key ? 'bg-[#000080] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{item.label}</button>)}</div>
        </div>
        {period === 'custom' && <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <label className="text-[11px] font-black text-slate-600">Start date<input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-xs" /></label>
          <label className="text-[11px] font-black text-slate-600">End date<input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-xs" /></label>
          <button disabled={!customStart || !customEnd || loading} onClick={() => void load('custom', customStart, customEnd)} className="rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">Apply</button>
        </div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>{periodLabel(core)}</span><span>{core.comparison ? 'Previous-period comparison available' : 'Comparison hidden until prior-period activity exists.'}</span></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard icon={Target} label="Confirmed Paid Sales" value={String(core.performance.confirmedPaidSales)} note={core.comparison ? comparisonText(core.comparison.changes.confirmedPaidSales) || undefined : 'Verified qualifying sales'} />
          <MetricCard icon={DollarSign} label="Verified Revenue" value={money(core.performance.verifiedRevenue)} note={core.comparison ? comparisonText(core.comparison.changes.verifiedRevenue, money) || undefined : 'Verified customer payments'} />
          <MetricCard icon={Award} label="Monthly Target" value={String(core.performance.monthlyTarget)} note="Canonical Sales role policy" />
          <MetricCard icon={TrendingUp} label="Target Completion" value={`${Math.round(core.performance.targetCompletion)}%`} note={`${core.performance.monthlyTargetPaidSales} / ${core.performance.monthlyTarget} this month`}><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#000080]" style={{ width: `${monthlyProgress}%` }} /></div></MetricCard>
          <MetricCard icon={LayoutDashboard} label="Pipeline Value" value={money(core.performance.pipelineValue)} note="Current open-pipeline snapshot" />
          <MetricCard icon={CalendarDays} label="Meetings Completed" value={String(core.performance.meetingsCompleted)} note={core.comparison ? comparisonText(core.comparison.changes.meetingsCompleted) || undefined : 'Completed in period'} />
        </div>

        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <SectionHeading title="Seller Workflow Funnel" subtitle="A simplified execution funnel mapped from the canonical Lead and Opportunity stages. No second pipeline is stored." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{closure.funnel.map((stage, index) => <button key={stage.key} onClick={() => navigate(stage.key === 'new' || stage.key === 'contacted' ? '/admin/app/crm?tab=crm_leads' : '/admin/app/crm?tab=pipeline')} className="relative rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left hover:border-[#000080]/30"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{String(index + 1).padStart(2, '0')}</div><div className="mt-2 text-2xl font-black text-[#000080]">{stage.count}</div><div className="mt-1 text-xs font-black">{stage.label}</div>{index < closure.funnel.length - 1 && <ArrowRight className="absolute -right-2 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-slate-300 lg:block" />}</button>)}</div>
          <div className="mt-4 flex justify-end"><button onClick={() => navigate('/admin/app/crm?tab=pipeline')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-[#000080] hover:border-[#000080]/30">Open CRM <ArrowRight className="h-3.5 w-3.5" /></button></div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <Panel title="Sales by package" subtitle="Verified sales labelled from the live Sales Catalog." icon={<LayoutDashboard className="h-5 w-5 text-[#000080]" />}>
            {core.performance.productBreakdown.length === 0 ? <Empty text="No verified product sales in this period." /> : <div className="space-y-3">{core.performance.productBreakdown.map(row => <div key={row.productCode} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-4"><div><div className="text-sm font-black">{row.productName || row.productCode}</div><div className="text-[10px] text-slate-400">{row.productCode}</div></div><div className="rounded-xl bg-blue-50 px-3 py-2 text-lg font-black text-[#000080]">{row.sales}</div></div>)}</div>}
          </Panel>
          <Panel title="Pipeline movement" subtitle="Count and current value by canonical CRM opportunity stage." icon={<TrendingUp className="h-5 w-5 text-[#000080]" />}>
            {core.pipeline.length === 0 ? <Empty text="No active opportunities in the pipeline yet." /> : <div className="space-y-3">{core.pipeline.map(stage => <button key={stage.stage} onClick={() => navigate('/admin/app/crm?tab=pipeline')} className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left"><div className="font-black text-slate-700">{stage.stage}</div><div className="text-xs font-bold text-slate-500">{stage.count} · {money(stage.value)}</div></button>)}</div>}
          </Panel>
        </div>
      </section>

      <section>
        <SectionHeading number="03" title="Commission Center" subtitle="Read-only seller visibility from the verified commission ledger. Financial state remains server-owned." />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={DollarSign} label="Earned Commission" value={money(core.commissions.earned)} note="Qualifying verified customer payments awaiting approval" />
          <MetricCard icon={CheckCircle2} label="Approved Commission" value={money(core.commissions.approved)} note="Reviewed and eligible for the payout workflow" />
          <MetricCard icon={CalendarDays} label="Upcoming Payout" value={money(core.commissions.upcomingPayout?.amount || 0)} note={core.commissions.upcomingPayout ? `Expected ${shortDate(core.commissions.upcomingPayout.scheduledDate)} · ${core.commissions.upcomingPayout.entryCount} entr${core.commissions.upcomingPayout.entryCount === 1 ? 'y' : 'ies'}` : 'No approved payout batch is scheduled yet'} />
          <MetricCard icon={Award} label="Paid Commission" value={money(core.commissions.paid)} note="Confirmed completed commission payouts" />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniStat label="Pending Verification" value={money(core.commissions.pendingVerification)} />
          <MiniStat label="Scheduled" value={money(core.commissions.scheduled)} />
          <MiniStat label="Adjusted" value={money(Number((core.commissions as any).adjusted || closure.payoutReadiness.adjustedCommissionTotal))} />
          <MiniStat label="Reversed" value={money(core.commissions.reversed)} danger={core.commissions.reversed > 0} />
        </div>
        <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {core.commissions.entries.length === 0 ? <div className="p-6"><Empty text="No commission ledger entries yet." /></div> : <div className="overflow-x-auto"><table className="min-w-[1050px] w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Sale / Client</th><th className="px-4 py-3">Package</th><th className="px-4 py-3">Verified Payment</th><th className="px-4 py-3">Rate</th><th className="px-4 py-3">Commission</th><th className="px-4 py-3">Status</th><th className="px-5 py-3">Payout</th></tr></thead><tbody className="divide-y divide-slate-100">{core.commissions.entries.map(entry => <CommissionRow key={entry.id} entry={entry} teamMode={teamMode} />)}</tbody></table></div>}
        </div>
        {closure.adjustedCommissions.length > 0 && <div className="mt-4 space-y-3">{closure.adjustedCommissions.map(entry => <AdjustmentRow key={entry.id} entry={entry} />)}</div>}
      </section>

      <section id="seller-payouts" className="scroll-mt-24">
        <SectionHeading number="04" title="Next Commission Payment" subtitle="Payout schedule and readiness from the canonical Commission Settings, payout batches and customer payment-verification workflow." />
        <div className="rounded-3xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-6 shadow-sm sm:p-8">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-700">Configured payout schedule</div><div className="mt-2 text-sm font-black text-teal-950">{core.commissions.payoutSchedule || 'See Commission Settings'}</div>{core.commissions.upcomingPayout ? <><div className="mt-5 text-4xl font-black text-teal-950">{money(core.commissions.upcomingPayout.amount)}</div><div className="mt-2 text-xs font-bold text-teal-800">Approved for payout · Expected {shortDate(core.commissions.upcomingPayout.scheduledDate)} · {core.commissions.upcomingPayout.entryCount} eligible entries</div></> : <><div className="mt-5 text-xl font-black text-teal-950">No approved payout batch is scheduled yet.</div><div className="mt-2 text-xs leading-5 text-teal-800">Approved commission stays visible until Management schedules it through the canonical payout workflow.</div></>}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1"><PayoutStat label="Pending Approval" value={money(closure.payoutReadiness.pendingApprovalAmount)} note="Earned / review items not yet approved" /><PayoutStat label="Pending Customer Payment Verification" value={money(closure.payoutReadiness.pendingPaymentVerificationAmount)} note="Customer receipts waiting for protected verification" /><PayoutStat label="Currently Scheduled" value={money(core.commissions.scheduled)} note="Approved entries already assigned to an approved payout batch" /></div>
          </div>
          <button onClick={() => navigate('/admin/app/commissions?tab=my_commissions')} className="mt-5 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white">View Commission Details</button>
        </div>
      </section>

      <section>
        <SectionHeading number="05" title="Sales Target & Career Progression" subtitle="Progression means eligibility for Management Review only—never a guaranteed salary, role, promotion or offer." />
        <div className="grid gap-5 xl:grid-cols-[0.65fr_1.35fr]">
          <Panel title="Monthly sales target" subtitle="Configured centrally in the active Sales role policy." icon={<Target className="h-5 w-5 text-[#000080]" />}><div className="text-4xl font-black text-[#000080]">{core.performance.monthlyTargetPaidSales} / {core.performance.monthlyTarget}</div><div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#000080]" style={{ width: `${monthlyProgress}%` }} /></div><div className="mt-2 text-xs font-bold text-slate-500">{Math.round(monthlyProgress)}% complete</div></Panel>
          <Panel title="Package-level Career Progress" subtitle="Current verified-sale counts against the canonical Career Progression policy." icon={<Award className="h-5 w-5 text-purple-700" />}>
            {progressionRules.length === 0 ? <Empty text="No package-specific progression thresholds are configured." /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{progressionRules.map(rule => { const pct = rule.requiredSales > 0 ? Math.min(100, Math.round((rule.currentSales / rule.requiredSales) * 100)) : 100; return <div key={rule.productCode} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-black">{rule.productName}</div><div className="mt-1 text-[10px] text-slate-400">{rule.productCode}</div></div><span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-black text-slate-600">{rule.currentSales} / {rule.requiredSales}</span></div><div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#000080]" style={{ width: `${pct}%` }} /></div><div className="mt-2 text-right text-[10px] font-black text-slate-500">{pct}%</div></div>; })}</div>}
            <div className="mt-4 rounded-2xl bg-purple-50 p-4 text-xs leading-5 text-purple-900">Meeting the configured criteria creates eligibility for Management Review only.</div>
          </Panel>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel title="Quotations & Payments" subtitle="Canonical quotation, payment wait and verified-sale activation truth. No second payment state is stored here." icon={<CreditCard className="h-5 w-5 text-emerald-700" />}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><MiniStat label="Draft Quotes" value={String(core.quotations.draft)} /><MiniStat label="Ready for Approval" value={String(core.quotations.readyForApproval)} /><MiniStat label="Sent" value={String(core.quotations.sent)} /><MiniStat label="Accepted" value={String(core.quotations.accepted)} /><MiniStat label="Expired" value={String(core.quotations.expired)} danger={core.quotations.expired > 0} /><MiniStat label="Awaiting Customer" value={String(core.payments.awaitingCustomer)} /><MiniStat label="Verification Pending" value={String(core.payments.verificationPending)} danger={core.payments.verificationPending > 0} /><MiniStat label="Verified in Period" value={String(core.payments.verifiedInPeriod)} /></div>
          <div className="mt-5">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Payment / sale activation</div>
            {core.saleActivation.length === 0 ? <Empty text="No Awaiting Payment or Won opportunities are in your current scope." /> : <div className="space-y-3">{core.saleActivation.map(item => <SaleActivationCard key={item.opportunityId} item={item} navigate={navigate} />)}</div>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => navigate('/admin/app/sales?tab=quotations')} className="rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white">Open quotations</button><button onClick={() => navigate('/admin/app/sales?tab=payments')} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black">Open payments</button></div>
        </Panel>
        <Panel title="Upcoming Meetings" subtitle="Prepare, open CRM, join, or reschedule/manage from the canonical Calendar record." icon={<Video className="h-5 w-5 text-rose-700" />}>
          {closure.upcomingMeetings.length === 0 ? <Empty text="No meetings are scheduled in the next seven days." /> : <div className="space-y-3">{closure.upcomingMeetings.slice(0, 6).map(meeting => <MeetingActions key={meeting.id} meeting={meeting} navigate={navigate} />)}</div>}
        </Panel>
      </section>

      <Panel title="Canonical Package Quick Reference" subtitle="Live package, price, scope and payment facts from the same Sales Catalog used by public Pricing and Quotations." icon={<ShieldCheck className="h-5 w-5 text-[#000080]" />}>
        {core.coreProducts.length === 0 ? <Empty text="No active core products are configured." /> : <div className="grid gap-4 lg:grid-cols-2">{core.coreProducts.map(product => <article key={product.code} className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{product.code}</div><h3 className="mt-1 text-base font-black">{product.name}</h3><div className="mt-4 text-2xl font-black text-[#000080]">{productPrice(product)}</div>{product.standardPaymentTerms && <div className="mt-1 text-xs font-bold text-slate-500">Standard terms: {product.standardPaymentTerms}</div>}{product.paymentSchedule?.length > 0 && <div className="mt-4 space-y-2">{product.paymentSchedule.map(step => <div key={`${product.code}-${step.milestoneNumber}`} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"><span className="font-bold text-slate-700">{step.label}</span><span className="font-black text-[#000080]">{step.percentage}%</span></div>)}</div>}<ul className="mt-4 space-y-2">{product.scope.slice(0, 6).map(item => <li key={item} className="flex gap-2 text-xs leading-5 text-slate-600"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#000080]" />{item}</li>)}</ul></article>)}</div>}
        <button onClick={() => navigate('/admin/app/academy?tab=training_library')} className="mt-5 inline-flex items-center gap-2 text-xs font-black text-[#000080]">Open Sales Resources <ArrowRight className="h-3.5 w-3.5" /></button>
      </Panel>

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel title="Recent Verified Sales" subtitle="Most recent verified customer payments; commission remains owned by the commission ledger." icon={<DollarSign className="h-5 w-5 text-emerald-700" />}>
          {core.recentSales.length === 0 ? <Empty text="No verified sales yet." /> : <div className="space-y-3">{core.recentSales.map(sale => <div key={sale.paymentId} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-start justify-between gap-4"><div><div className="text-sm font-black">{sale.customerName}</div><div className="mt-1 text-xs text-slate-500">{sale.productName || sale.productCode || 'Verified payment'} · {shortDate(sale.verifiedAt)}</div></div><div className="text-right"><div className="text-sm font-black text-emerald-700">{money(sale.amount, sale.currency)}</div>{sale.commissionAmount != null && <div className="text-[10px] text-slate-500">Commission {money(sale.commissionAmount, sale.currency)}</div>}</div></div></div>)}</div>}
        </Panel>
        <Panel title="Sales Resources" subtitle="Open the seller execution library for products, handover, proof, scripts and policy reference." icon={<BookOpen className="h-5 w-5 text-[#000080]" />}><div className="grid gap-2 sm:grid-cols-2"><ActionLink label="Products & Payment Schedules" onClick={() => navigate('/admin/app/academy?tab=training_library&resource=catalog')} /><ActionLink label="Handover" onClick={() => navigate('/admin/app/academy?tab=training_library&resource=handover')} /><ActionLink label="Case Studies & Proof" onClick={() => navigate('/admin/app/academy?tab=training_library&resource=proof')} /><ActionLink label="Policies & Academy Reference" onClick={() => navigate('/admin/app/academy?tab=training_library&resource=policies')} /></div></Panel>
      </section>

      <section id="seller-notifications" className="scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <SectionHeading title="Notifications" subtitle="Unread seller alerts from the existing ProFox notification engine." />
        {closure.notifications.length === 0 ? <Empty text="No unread seller notifications." /> : <div className="space-y-3">{closure.notifications.slice(0, 25).map(notification => <div key={notification.id} className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-start"><BellRing className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><button onClick={() => notification.actionUrl && navigate(notification.actionUrl)} className="min-w-0 flex-1 text-left"><div className="text-sm font-black">{notification.title}</div><div className="mt-1 text-xs leading-5 text-slate-500">{notification.message}</div><div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{notification.type || 'Notification'} · {shortDateTime(notification.createdAt, closure.timezone)}</div></button><button onClick={() => void markRead(notification.id)} disabled={actionId === notification.id} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-600 disabled:opacity-50">{actionId === notification.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Mark read</button></div>)}</div>}
      </section>
    </main>
  </div>;
}

function SaleActivationCard({ item, navigate }: { item: SellerCommandCenterData['saleActivation'][number]; navigate: ReturnType<typeof useNavigate> }) {
  const payment = item.payment;
  const quote = item.acceptedQuotation;
  const overdue = payment?.overdue === true;
  return <article className={`rounded-2xl border p-4 ${overdue ? 'border-red-200 bg-red-50/50' : 'border-slate-200 bg-slate-50'}`}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{item.opportunityStage}</div>
        <div className="mt-1 text-sm font-black text-slate-900">{item.operationalLabel.replaceAll('_',' ')}</div>
        {payment && <div className="mt-2 text-xs font-semibold text-slate-600">{payment.paymentType} · {payment.status} · {money(payment.amountDue,payment.currency)} due{payment.amountPaid > 0 ? ` · ${money(payment.amountPaid,payment.currency)} received` : ''}</div>}
        {payment && <div className={`mt-1 text-[10px] font-black ${overdue ? 'text-red-700' : 'text-slate-500'}`}>{overdue ? 'OVERDUE · ' : ''}{payment.dueDate ? `Due ${shortDate(payment.dueDate)}` : 'Due date not recorded'} · Outstanding {money(payment.outstandingAmount,payment.currency)}</div>}
      </div>
      <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${overdue ? 'border-red-200 bg-white text-red-700' : item.opportunityStatus === 'Won' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>{item.opportunityStatus === 'Won' ? 'WON' : 'OPEN'}</span>
    </div>
    {item.nextAction && <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3"><div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Next action</div><div className="mt-1 text-xs font-black text-slate-800">{item.nextAction.label}</div>{item.nextAction.dueAt && <div className="mt-1 text-[10px] font-semibold text-slate-500">Due {shortDateTime(item.nextAction.dueAt)}</div>}</div>}
    {item.blockers.length > 0 && <div className="mt-3 space-y-1">{item.blockers.slice(0,2).map(blocker => <div key={blocker.code} className="text-[10px] font-semibold leading-4 text-amber-800">{blocker.message}</div>)}</div>}
    {item.opportunityStatus === 'Won' && <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[9px] font-black"><span className="rounded-lg bg-white px-2 py-2">Client {item.client.linked ? 'ACTIVE' : 'PENDING'}</span><span className="rounded-lg bg-white px-2 py-2">Project {item.project.created ? 'CREATED' : 'PENDING'}</span><span className="rounded-lg bg-white px-2 py-2">Onboarding {item.onboarding.status || (item.onboarding.created ? 'CREATED' : 'PENDING')}</span></div>}
    <div className="mt-3 flex flex-wrap gap-2">{quote && <button onClick={() => navigate(quote.url)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Accepted quotation</button>}<button onClick={() => navigate(item.paymentWorkspaceUrl)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Open payments</button>{item.nextAction?.kind === 'activity' && <button onClick={() => navigate(item.activityWorkspaceUrl)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Payment Follow-Up</button>}{item.canVerifyPayment && item.operationalLabel === 'VERIFICATION REQUIRED' && <button onClick={() => navigate(item.paymentWorkspaceUrl)} className="rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-black text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Review verification</button>}</div>
  </article>;
}

function MeetingActions({ meeting, navigate }: { meeting: SellerEnhancedMeeting; navigate: ReturnType<typeof useNavigate> }) {
  return <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-sm font-black">{meeting.title || meeting.attendeeName || 'Sales Meeting'}</div><div className="mt-1 text-xs text-slate-500">{shortDateTime(meeting.startAt, meeting.timezone)}</div><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => navigate(meeting.prepUrl)} className="rounded-lg bg-[#000080] px-3 py-2 text-[10px] font-black text-white">Prepare Meeting</button>{meeting.crmFocusUrl && <button onClick={() => navigate(meeting.crmFocusUrl!)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Open CRM</button>}{meeting.meetingUrl && <a href={meeting.meetingUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Join Meeting</a>}<button onClick={() => navigate(meeting.manageUrl)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Reschedule / Manage</button></div></article>;
}

function SectionHeading({ number, title, subtitle }: { number?: string; title: string; subtitle: string }) {
  return <div className="mb-4"><div className="flex items-center gap-2">{number && <span className="text-[10px] font-black tracking-[0.16em] text-[#000080]">{number}</span>}<h2 className="text-lg font-black">{title}</h2></div><p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">{subtitle}</p></div>;
}

function Panel({ title, subtitle, icon, children }: { title: string; subtitle: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-start gap-3">{icon && <div className="rounded-xl bg-slate-50 p-2">{icon}</div>}<div><h3 className="font-black">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p></div></div>{children}</section>;
}

function MetricCard({ icon: Icon, label, value, note, children }: { icon: React.ElementType; label: string; value: string; note?: string; children?: React.ReactNode }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><Icon className="h-4 w-4 text-[#000080]" /></div><div className="mt-3 text-2xl font-black">{value}</div>{note && <div className="mt-2 text-[10px] leading-4 text-slate-500">{note}</div>}{children}</article>;
}

function MiniStat({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${danger ? 'border-red-100 bg-red-50' : 'border-slate-100 bg-slate-50'}`}><div className={`text-lg font-black ${danger ? 'text-red-700' : 'text-slate-900'}`}>{value}</div><div className={`mt-1 text-[10px] font-black uppercase tracking-wider ${danger ? 'text-red-600' : 'text-slate-400'}`}>{label}</div></div>;
}

function PayoutStat({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-teal-100 bg-white p-4"><div className="text-[10px] font-black uppercase tracking-wider text-teal-700">{label}</div><div className="mt-2 text-xl font-black text-teal-950">{value}</div><div className="mt-2 text-[10px] leading-4 text-teal-800">{note}</div></div>;
}

function AdjustmentRow({ entry }: { entry: SellerAdjustedCommission }) {
  return <div className="grid gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-4 sm:grid-cols-[1fr_auto]"><div><div className="text-sm font-black">{entry.entryNumber} · {entry.productName || 'Commission'}</div><div className="mt-1 text-xs leading-5 text-amber-900">{entry.reason || 'Administrator adjustment recorded.'}</div><div className="mt-2 text-[10px] text-slate-500">Adjusted {shortDateTime(entry.adjustedAt)}</div></div><div className="sm:text-right"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{entry.displayStatus}</div><div className="mt-1 text-sm font-black text-[#000080]">{money(entry.adjustedFromAmount, entry.currency)} → {money(entry.currentAmount, entry.currency)}</div></div></div>;
}

function CommissionRow({ entry, teamMode }: { entry: SellerCommissionEntry; teamMode: boolean }) {
  const e = entry as SellerCommissionEntry & { adjustmentReason?: string; adjustedFromAmount?: number; adjustedAt?: string };
  const bonus = Number(entry.selfGeneratedBonusPercent || 0) + Number(entry.performanceBonusPercent || 0);
  return <tr className="align-top"><td className="px-5 py-4"><div className="font-black text-slate-800">{entry.customerName}</div><div className="mt-1 text-[10px] text-slate-400">{entry.entryNumber}{teamMode && entry.salespersonName ? ` · ${entry.salespersonName}` : ''}</div></td><td className="px-4 py-4"><div className="font-black text-slate-700">{entry.productName}</div><div className="text-[10px] text-slate-400">{entry.productCode}</div></td><td className="px-4 py-4"><div className="font-black">{money(entry.verifiedPaymentAmount, entry.currency)}</div><div className="text-[10px] text-slate-400">{entry.paymentReference || 'Verified payment'}</div></td><td className="px-4 py-4"><div className="font-black">{entry.effectiveRatePercent}%</div><div className="text-[10px] text-slate-400">Base {entry.baseRatePercent}%{bonus > 0 ? ` + ${bonus}% bonus` : ''}</div></td><td className="px-4 py-4"><div className="font-black text-[#000080]">{money(entry.commissionAmount, entry.currency)}</div>{e.adjustedFromAmount != null && <div className="text-[10px] text-amber-700">from {money(e.adjustedFromAmount, entry.currency)}</div>}</td><td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${statusClasses(entry.displayStatus)}`}>{entry.displayStatus}</span>{e.adjustmentReason && <div className="mt-2 max-w-[200px] text-[10px] leading-4 text-amber-700">{e.adjustmentReason}</div>}{entry.reversalReason && <div className="mt-2 max-w-[200px] text-[10px] leading-4 text-red-600">{entry.reversalReason}</div>}</td><td className="px-5 py-4"><div className="font-black text-slate-700">{entry.payoutScheduledDate ? shortDate(entry.payoutScheduledDate) : entry.paidAt ? shortDate(entry.paidAt) : 'Not scheduled'}</div>{entry.payoutBatchNumber && <div className="text-[10px] text-slate-400">{entry.payoutBatchNumber}</div>}</td></tr>;
}

function ActionLink({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-black text-slate-700 hover:border-[#000080]/30 hover:text-[#000080]">{label}<ArrowRight className="h-3.5 w-3.5" /></button>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs font-semibold text-slate-500">{text}</div>;
}

function Notice({ text }: { text: string }) {
  return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{text}</div>;
}
