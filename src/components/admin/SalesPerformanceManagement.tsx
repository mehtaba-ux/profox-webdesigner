import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck2,
  CheckCircle2,
  LockKeyhole,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  TrendingUp,
  UserCheck
} from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import {
  SALES_PERFORMANCE_MANAGEMENT_ACTIONS,
  SALES_PERFORMANCE_QUALITY_AREAS,
  normalizeSalesPerformanceSnapshot,
  salesPerformanceService,
  type SalesPerformanceAdminPayload,
  type SalesPerformanceAdminPerson,
  type SalesPerformanceDecision,
  type SalesPerformanceManagementAction,
  type SalesPerformanceQualityKey,
  type SalesPerformanceQualityMetric,
  type SalesPerformanceReview,
  type SalesPerformanceSnapshot,
  type SalesPerformanceReviewStatus,
  type SalesPerformanceSellerPayload,
  type SalesPerformanceSettings
} from '../../lib/salesPerformanceService';

const SELLER_ROLES = ['sales', 'sales_rep', 'sales_team'];
const decisions: SalesPerformanceDecision[] = ['Continue', 'Extend Review', 'Restrict Scope', 'Close Engagement'];
const statuses: SalesPerformanceReviewStatus[] = ['Scheduled', 'In Review', 'Completed', 'Cancelled'];
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-50 disabled:bg-slate-50 disabled:text-slate-500';

const reviewLabels: Record<string, string> = {
  day_7_checkin: 'Day 7 Check-In',
  day_30_review: 'Day 30 Review',
  day_60_review: 'Day 60 Review',
  day_90_final: 'Day 90 Final Review',
  first_20_quality: 'First 20 Interaction Quality Review',
  weekly_coaching: 'Weekly Sales Coaching'
};

function dateLabel(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function money(value: number) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value || 0));
  } catch {
    return `$${Number(value || 0).toLocaleString()}`;
  }
}

function reviewLabel(review: SalesPerformanceReview) {
  return reviewLabels[review.reviewType] || review.reviewType;
}

function isOverdue(review?: SalesPerformanceReview | null) {
  if (!review || !review.scheduledFor || !['Scheduled', 'In Review'].includes(review.status)) return false;
  return new Date(`${review.scheduledFor}T23:59:59`).getTime() < Date.now();
}

function hasCompleteQualityEvidence(review: SalesPerformanceReview) {
  return SALES_PERFORMANCE_QUALITY_AREAS.every(area => String(review.qualityEvidence?.[area.key] || '').trim().length > 0);
}

export default function SalesPerformanceManagement() {
  const navigate = useNavigate();
  const { isAdmin, role, status, loading: authLoading } = useAuth();
  const isSeller = SELLER_ROLES.includes(String(role)) && status === 'active';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sellerData, setSellerData] = useState<SalesPerformanceSellerPayload | null>(null);
  const [adminData, setAdminData] = useState<SalesPerformanceAdminPayload | null>(null);
  const [settings, setSettings] = useState<SalesPerformanceSettings | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<SalesPerformanceAdminPerson | null>(null);
  const [selectedReview, setSelectedReview] = useState<SalesPerformanceReview | null>(null);
  const [selectedReviewSnapshot, setSelectedReviewSnapshot] = useState<SalesPerformanceSnapshot | null>(null);
  const [reviewSnapshotLoading, setReviewSnapshotLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (isAdmin) {
        const data = await salesPerformanceService.getAdmin();
        setAdminData(data);
        setSettings(data.settings);
        setSelectedPerson(current => current ? data.salespeople.find(person => person.userId === current.userId) || null : null);
      } else if (isSeller) {
        setSellerData(await salesPerformanceService.getMine());
      }
    } catch (err: any) {
      setError(err?.message || 'Sales performance management could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && (isAdmin || isSeller)) void load();
  }, [authLoading, isAdmin, isSeller]);

  useEffect(() => {
    let active = true;
    if (!selectedReview) {
      setSelectedReviewSnapshot(null);
      setReviewSnapshotLoading(false);
      return () => { active = false; };
    }
    if (selectedReview.status === 'Completed') {
      setSelectedReviewSnapshot(normalizeSalesPerformanceSnapshot(selectedReview.metricsSnapshot || {}));
      setReviewSnapshotLoading(false);
      return () => { active = false; };
    }
    if (!isAdmin) return () => { active = false; };

    setReviewSnapshotLoading(true);
    void salesPerformanceService.getPeriodSnapshot(selectedReview.salespersonId, selectedReview.periodStart, selectedReview.periodEnd)
      .then(snapshot => { if (active) setSelectedReviewSnapshot(snapshot); })
      .catch(() => { if (active) setSelectedReviewSnapshot(null); })
      .finally(() => { if (active) setReviewSnapshotLoading(false); });
    return () => { active = false; };
  }, [selectedReview?.id, selectedReview?.status, isAdmin]);

  const saveSettings = async () => {
    if (!settings) return;
    if (!(settings.reviewDay7 > 0 && settings.reviewDay30 > settings.reviewDay7 && settings.reviewDay60 > settings.reviewDay30 && settings.reviewDay90 > settings.reviewDay60)) {
      setError('Review days must be positive and strictly increasing.');
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      const data = await salesPerformanceService.saveSettings(settings);
      setAdminData(data);
      setSettings(data.settings);
      setMessage('Post-activation performance policy saved. Future Scheduled reviews were refreshed without rewriting completed evidence.');
    } catch (err: any) {
      setError(err?.message || 'Performance policy could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const saveReview = async (review: SalesPerformanceReview) => {
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await salesPerformanceService.updateReview({
        reviewId: review.id,
        status: review.status,
        decision: review.decision || null,
        qualityEvidence: review.qualityEvidence,
        requiredActions: review.requiredActions,
        strengths: review.strengths,
        coachingActions: review.coachingActions,
        risks: review.risks,
        reviewNotes: review.reviewNotes,
        scopeRestrictions: review.scopeRestrictions,
        improvementPlan: review.improvementPlan
      });
      setMessage(result.accessActionRequired ? `${result.message} No account access was changed automatically.` : result.message);
      setSelectedReview(null);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Performance review could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  if (!isAdmin && !isSeller) return <Navigate to="/admin/workspace" replace />;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate('/admin/workspace')} className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#FF0E0E]">Sales · Post-Activation</div>
            <h1 className="mt-1 text-2xl font-black">Performance & Coaching</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Move from supervised execution to independent performance while CRM, meetings, quotations, payments, commissions and Career Progression remain the systems of record.</p>
          </div>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
      </div>
    </header>

    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {isAdmin && adminData && settings
        ? <AdminExperience data={adminData} settings={settings} setSettings={setSettings} saving={saving} onSaveSettings={saveSettings} onSelectPerson={setSelectedPerson} onSelectReview={review => setSelectedReview({ ...review, qualityEvidence: { ...review.qualityEvidence }, requiredActions: [...review.requiredActions] })} />
        : sellerData ? <SellerExperience data={sellerData} /> : null}
    </main>

    {selectedPerson && !selectedReview && <PersonDrawer person={selectedPerson} onClose={() => setSelectedPerson(null)} onSelectReview={review => setSelectedReview({ ...review, qualityEvidence: { ...review.qualityEvidence }, requiredActions: [...review.requiredActions] })} />}
    {selectedReview && <ReviewDrawer review={selectedReview} setReview={setSelectedReview} snapshot={selectedReviewSnapshot} snapshotLoading={reviewSnapshotLoading} saving={saving} onClose={() => setSelectedReview(null)} onSave={saveReview} />}
  </div>;
}

function AdminExperience({ data, settings, setSettings, saving, onSaveSettings, onSelectPerson, onSelectReview }: {
  data: SalesPerformanceAdminPayload;
  settings: SalesPerformanceSettings;
  setSettings: (value: SalesPerformanceSettings) => void;
  saving: boolean;
  onSaveSettings: () => Promise<void>;
  onSelectPerson: (person: SalesPerformanceAdminPerson) => void;
  onSelectReview: (review: SalesPerformanceReview) => void;
}) {
  const due = useMemo(() => data.salespeople
    .flatMap(person => person.reviews.map(review => ({ person, review })))
    .filter(item => !['Completed', 'Cancelled'].includes(item.review.status) && new Date(`${item.review.scheduledFor}T23:59:59`).getTime() <= Date.now())
    .sort((a, b) => a.review.scheduledFor.localeCompare(b.review.scheduledFor)), [data.salespeople]);
  const patch = (partial: Partial<SalesPerformanceSettings>) => setSettings({ ...settings, ...partial });

  return <>
    <section className="rounded-3xl bg-gradient-to-br from-[#090b25] to-[#000080] p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-200">Management operating loop</div><h2 className="mt-2 text-2xl font-black">Supervise quality, not just volume.</h2><p className="mt-2 text-sm leading-6 text-blue-100/80">Live operating facts stay in CRM, Calendar, Sales and Commissions. Completed reviews preserve an immutable snapshot plus structured quality evidence and the management decision.</p></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><HeroStat label="Active Sellers" value={data.salespeople.length} /><HeroStat label="Due Reviews" value={due.length} /><HeroStat label="Policy Version" value={`v${settings.policyVersion}`} /></div>
      </div>
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#000080]">One policy source</div><h2 className="mt-2 text-xl font-black">90-day supervision cadence</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Policy changes regenerate future Scheduled checkpoints only. Completed review history stays locked.</p></div>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black"><input type="checkbox" checked={settings.enabled} onChange={e => patch({ enabled: e.target.checked })} />Program enabled</label>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField label="Day 7 check-in" value={settings.reviewDay7} onChange={value => patch({ reviewDay7: value })} />
        <NumberField label="Day 30 review" value={settings.reviewDay30} onChange={value => patch({ reviewDay30: value })} />
        <NumberField label="Day 60 review" value={settings.reviewDay60} onChange={value => patch({ reviewDay60: value })} />
        <NumberField label="Day 90 final review" value={settings.reviewDay90} onChange={value => patch({ reviewDay90: value })} />
        <NumberField label="First quality review after interactions" value={settings.firstInteractionReviewCount} onChange={value => patch({ firstInteractionReviewCount: value })} />
        <NumberField label="Coaching interval (days)" value={settings.weeklyCoachingIntervalDays} onChange={value => patch({ weeklyCoachingIntervalDays: value })} />
        <NumberField label="CRM logging target (%)" value={settings.crmLoggingTargetPercent} min={0} max={100} onChange={value => patch({ crmLoggingTargetPercent: value })} />
      </div>
      <div className="mt-6 flex justify-end"><button onClick={() => void onSaveSettings()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save performance policy</button></div>
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-end justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#FF0E0E]">Review queue</div><h2 className="mt-2 text-xl font-black">Reviews requiring management attention</h2><p className="mt-1 text-xs text-slate-500">The first Admin who saves an open review becomes its recorded owner.</p></div><div className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">{due.length} due</div></div>
      {due.length === 0 ? <Empty text="No due performance or coaching reviews." /> : <div className="mt-5 space-y-3">{due.slice(0, 12).map(({ person, review }) => <button key={review.id} onClick={() => onSelectReview(review)} className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-[#000080]/30 hover:bg-blue-50/30"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isOverdue(review) ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}><CalendarCheck2 className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-black">{person.name}</div><div className="mt-1 text-xs text-slate-500">{reviewLabel(review)} · due {dateLabel(review.scheduledFor)} · {review.ownerId ? 'owner assigned' : 'unassigned'}</div></div><StatusPill status={review.status} /></button>)}</div>}
    </section>

    <section>
      <div className="mb-4"><h2 className="text-xl font-black">Activated seller portfolio</h2><p className="mt-1 text-xs text-slate-500">Each card is composed from the seller's existing ProFox operational record.</p></div>
      {data.salespeople.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No active seller account is currently available for post-activation performance management.</div> : <div className="grid gap-5 lg:grid-cols-2">{data.salespeople.map(person => <SellerAdminCard key={person.userId} person={person} settings={settings} onOpen={() => onSelectPerson(person)} />)}</div>}
    </section>
  </>;
}

function SellerAdminCard({ person, settings, onOpen }: { person: SalesPerformanceAdminPerson; settings: SalesPerformanceSettings; onOpen: () => void }) {
  const days = person.snapshot.daysActive;
  const phase = days == null ? 'Activation record required' : days <= settings.reviewDay30 ? 'Supervised Execution' : days <= settings.reviewDay60 ? 'Pipeline Building' : days <= settings.reviewDay90 ? 'Independent Execution' : 'Post-90-Day';
  return <button onClick={onOpen} className="rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#000080]/25 hover:shadow-md">
    <div className="flex items-start justify-between gap-4"><div><div className="text-base font-black">{person.name}</div><div className="mt-1 text-xs text-slate-500">{person.email}</div></div><div className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#000080]">{phase}</div></div>
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><MiniMetric label="Interactions" value={person.snapshot.customerInteractions} /><MiniMetric label="Meetings" value={person.snapshot.meetingsCompleted} /><MiniMetric label="Verified sales" value={person.snapshot.verifiedSales} /><MiniMetric label="Overdue" value={person.snapshot.overdueActivities} danger={person.snapshot.overdueActivities > 0} /></div>
    <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Next review</div><div className="mt-1 text-sm font-black">{person.nextReview ? reviewLabel(person.nextReview) : 'No open review'}</div>{person.nextReview && <div className={`mt-1 text-xs ${isOverdue(person.nextReview) ? 'font-bold text-red-600' : 'text-slate-500'}`}>{dateLabel(person.nextReview.scheduledFor)} · {person.nextReview.ownerId ? 'owner assigned' : 'unassigned'}</div>}</div>
  </button>;
}

function SellerExperience({ data }: { data: SalesPerformanceSellerPayload }) {
  const completed = data.reviews.filter(review => review.status === 'Completed').sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));
  return <>
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#090b25] to-[#000080] p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"><div className="max-w-3xl"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-200">Your post-activation journey</div><h2 className="mt-2 text-2xl font-black">{data.phase}</h2><p className="mt-2 text-sm leading-6 text-blue-100/80">Your live work stays in CRM, Calendar, Sales and Commissions. This page shows the supervision phase, checkpoints and immutable coaching evidence.</p></div><div className="grid grid-cols-2 gap-3"><HeroStat label="Days Active" value={data.daysActive ?? '—'} /><HeroStat label="Completed Reviews" value={completed.length} /></div></div>
    </section>

    {!data.activation?.activationDate && <Notice tone="warning">Your account is active, but a canonical Activated-stage record is not linked yet. Review scheduling stays paused rather than inventing an activation date.</Notice>}

    <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-xl bg-blue-50 p-2.5 text-[#000080]"><CalendarCheck2 className="h-5 w-5" /></div><div><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Next checkpoint</div><h3 className="font-black">{data.nextReview ? reviewLabel(data.nextReview) : 'No open review'}</h3></div></div>{data.nextReview ? <div className="mt-5"><div className={`text-2xl font-black ${isOverdue(data.nextReview) ? 'text-red-600' : 'text-slate-900'}`}>{dateLabel(data.nextReview.scheduledFor)}</div><div className="mt-2 text-xs text-slate-500">Status: {data.nextReview.status} · {data.nextReview.ownerId ? 'review owner assigned' : 'awaiting management owner'}</div>{isOverdue(data.nextReview) && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">This review is overdue and should be completed with management.</div>}</div> : <p className="mt-5 text-sm text-slate-500">No open checkpoint is currently scheduled.</p>}</div>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="text-[10px] font-black uppercase tracking-wide text-[#000080]">Live operating evidence</div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><MiniMetric label="Interactions" value={data.snapshot.customerInteractions} /><MiniMetric label="CRM completed" value={data.snapshot.crmActivitiesCompleted} /><MiniMetric label="Meetings" value={data.snapshot.meetingsCompleted} /><MiniMetric label="Verified sales" value={data.snapshot.verifiedSales} /><MiniMetric label="Open pipeline" value={money(data.snapshot.pipelineValue)} /><MiniMetric label="Quotes sent" value={data.snapshot.quotationsSent} /><MiniMetric label="Overdue activities" value={data.snapshot.overdueActivities} danger={data.snapshot.overdueActivities > 0} /><MiniMetric label="Missing next step" value={data.snapshot.opportunitiesMissingNextFollowUp} danger={data.snapshot.opportunitiesMissingNextFollowUp > 0} /></div></div>
    </section>

    <QualityEvidencePanel snapshot={data.snapshot} />

    <Journey settings={data.settings} />

    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div><div className="text-[10px] font-black uppercase tracking-wide text-[#FF0E0E]">Completed evidence</div><h2 className="mt-2 text-xl font-black">Review & coaching history</h2><p className="mt-1 text-xs text-slate-500">Completed reviews are locked historical evidence. Live CRM and sales facts continue to update independently.</p></div>{completed.length === 0 ? <Empty text="No performance review has been completed yet." /> : <div className="mt-5 space-y-4">{completed.map(review => <CompletedReviewCard key={review.id} review={review} />)}</div>}</section>
  </>;
}

function Journey({ settings }: { settings: SalesPerformanceSettings }) {
  const stages = [
    { icon: ShieldCheck, title: `Days 1–${settings.reviewDay30}`, subtitle: 'Supervised Execution', detail: `Live practice, approved prospecting and CRM discipline. Target: ${settings.crmLoggingTargetPercent}% CRM logging.` },
    { icon: TrendingUp, title: `Days ${settings.reviewDay30 + 1}–${settings.reviewDay60}`, subtitle: 'Pipeline Building', detail: `Discovery and follow-up in the field, with quality review after ${settings.firstInteractionReviewCount} customer interactions.` },
    { icon: UserCheck, title: `Days ${settings.reviewDay60 + 1}–${settings.reviewDay90}`, subtitle: 'Independent Execution', detail: 'Manage assigned work independently using approved quotation, payment, forecast and follow-up rules.' }
  ];
  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="text-[10px] font-black uppercase tracking-wide text-[#000080]">90-day ramp</div><h2 className="mt-2 text-xl font-black">From learning to independent performance</h2><div className="mt-5 grid gap-4 lg:grid-cols-3">{stages.map(stage => { const Icon = stage.icon; return <div key={stage.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><Icon className="h-5 w-5 text-[#000080]" /><div className="mt-4 text-[10px] font-black uppercase tracking-wide text-slate-400">{stage.title}</div><div className="mt-1 font-black">{stage.subtitle}</div><p className="mt-2 text-xs leading-5 text-slate-500">{stage.detail}</p></div>; })}</div></section>;
}

function PersonDrawer({ person, onClose, onSelectReview }: { person: SalesPerformanceAdminPerson; onClose: () => void; onSelectReview: (review: SalesPerformanceReview) => void }) {
  return <div className="fixed inset-0 z-[120] flex justify-end bg-slate-950/30" onMouseDown={onClose}><div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8" onMouseDown={e => e.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-wide text-[#000080]">Seller performance record</div><h2 className="mt-1 text-2xl font-black">{person.name}</h2><p className="mt-1 text-xs text-slate-500">{person.email}</p></div><button onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black">Close</button></div><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"><MiniMetric label="Interactions" value={person.snapshot.customerInteractions} /><MiniMetric label="Meetings" value={person.snapshot.meetingsCompleted} /><MiniMetric label="Pipeline" value={money(person.snapshot.pipelineValue)} /><MiniMetric label="Verified sales" value={person.snapshot.verifiedSales} /></div><div className="mt-7"><QualityEvidencePanel snapshot={person.snapshot} compact /></div><div className="mt-7"><h3 className="font-black">Review schedule</h3><div className="mt-3 space-y-3">{person.reviews.map(review => <button key={review.id} onClick={() => onSelectReview(review)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-[#000080]/30"><div className="min-w-0 flex-1"><div className="text-sm font-black">{reviewLabel(review)}</div><div className="mt-1 text-xs text-slate-500">{dateLabel(review.scheduledFor)} · {review.ownerId ? 'owner assigned' : 'unassigned'}</div></div><StatusPill status={review.status} /></button>)}</div></div></div></div>;
}

function ReviewDrawer({ review, setReview, snapshot, snapshotLoading, saving, onClose, onSave }: { review: SalesPerformanceReview; setReview: (review: SalesPerformanceReview | null) => void; snapshot: SalesPerformanceSnapshot | null; snapshotLoading: boolean; saving: boolean; onClose: () => void; onSave: (review: SalesPerformanceReview) => Promise<void> }) {
  const locked = review.status === 'Completed';
  const patch = (partial: Partial<SalesPerformanceReview>) => setReview({ ...review, ...partial });
  const patchQuality = (key: SalesPerformanceQualityKey, value: string) => patch({ qualityEvidence: { ...review.qualityEvidence, [key]: value } });
  const toggleAction = (action: SalesPerformanceManagementAction) => {
    const next = review.requiredActions.includes(action) ? review.requiredActions.filter(item => item !== action) : [...review.requiredActions, action];
    patch({ requiredActions: next });
  };
  const completionReady = review.status !== 'Completed' || Boolean(review.decision && review.reviewNotes.trim() && hasCompleteQualityEvidence(review)
    && (review.decision !== 'Extend Review' || review.improvementPlan.trim())
    && (review.decision !== 'Restrict Scope' || review.scopeRestrictions.trim()));

  return <div className="fixed inset-0 z-[130] flex justify-end bg-slate-950/40" onMouseDown={onClose}><div className="h-full w-full max-w-3xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8" onMouseDown={e => e.stopPropagation()}>
    <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-wide text-[#FF0E0E]">Management review</div><h2 className="mt-1 text-2xl font-black">{reviewLabel(review)}</h2><p className="mt-1 text-xs text-slate-500">Scheduled {dateLabel(review.scheduledFor)} · evidence period {dateLabel(review.periodStart)}–{dateLabel(review.periodEnd)} · {review.ownerId ? 'owner assigned' : 'owner assigned on first save'}</p></div><button onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black">Close</button></div>

    {locked && <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-800"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Historical evidence locked.</strong> Completed performance reviews cannot be reopened or rewritten. Record any follow-up in the next coaching/review checkpoint.</div></div>}

    <div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Review status"><select disabled={locked} className={inputClass} value={review.status} onChange={e => patch({ status: e.target.value as SalesPerformanceReviewStatus })}>{statuses.map(value => <option key={value}>{value}</option>)}</select></Field><Field label="Management decision"><select disabled={locked} className={inputClass} value={review.decision || ''} onChange={e => patch({ decision: (e.target.value || null) as SalesPerformanceDecision | null })}><option value="">Select when completing</option>{decisions.map(value => <option key={value}>{value}</option>)}</select></Field></div>

    <section className="mt-6 rounded-3xl border border-blue-100 bg-blue-50/40 p-5">
      <div className="text-[10px] font-black uppercase tracking-wide text-[#000080]">System evidence · read only</div>
      <h3 className="mt-1 font-black">Quantitative evidence for this review period</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">This evidence supports the human review. It never preselects a decision, required action, access restriction or employment outcome.</p>
      {snapshotLoading ? <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading period evidence…</div>
        : snapshot && Object.keys(snapshot.qualityEvidence || {}).length > 0
          ? <div className="mt-5"><QualityEvidencePanel snapshot={snapshot} compact /></div>
          : <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white p-4 text-xs text-slate-500">{locked ? 'This is a legacy completed snapshot without Part 15 quality metrics. Historical evidence was not backfilled.' : 'Period evidence is unavailable. The review may not infer missing quality data.'}</div>}
    </section>

    <section className="mt-7 rounded-3xl border border-slate-200 bg-slate-50 p-5"><div className="text-[10px] font-black uppercase tracking-wide text-[#000080]">Approved quality evidence</div><h3 className="mt-1 font-black">Cover every required review area</h3><p className="mt-1 text-xs leading-5 text-slate-500">A review cannot be completed until evidence is recorded for all nine policy areas. Use factual observations; “not yet observed” is acceptable when that is the truthful evidence.</p><div className="mt-5 grid gap-4 md:grid-cols-2">{SALES_PERFORMANCE_QUALITY_AREAS.map(area => <Field key={area.key} label={area.label}><textarea disabled={locked} rows={3} className={inputClass} value={review.qualityEvidence?.[area.key] || ''} onChange={e => patchQuality(area.key, e.target.value)} placeholder={area.help} /><div className="mt-1 text-[10px] leading-4 text-slate-400">{area.help}</div></Field>)}</div></section>

    <section className="mt-6"><div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Management actions</div><div className="mt-3 flex flex-wrap gap-2">{SALES_PERFORMANCE_MANAGEMENT_ACTIONS.map(action => <label key={action} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black ${review.requiredActions.includes(action) ? 'border-[#000080]/30 bg-blue-50 text-[#000080]' : 'border-slate-200 bg-white text-slate-600'} ${locked ? 'cursor-default opacity-80' : ''}`}><input disabled={locked} type="checkbox" checked={review.requiredActions.includes(action)} onChange={() => toggleAction(action)} />{action}</label>)}</div></section>

    <div className="mt-6 space-y-4"><TextArea disabled={locked} label="Strengths observed" value={review.strengths} onChange={value => patch({ strengths: value })} /><TextArea disabled={locked} label="Coaching actions / next practice" value={review.coachingActions} onChange={value => patch({ coachingActions: value })} /><TextArea disabled={locked} label="Risks / quality concerns" value={review.risks} onChange={value => patch({ risks: value })} /><TextArea disabled={locked} label="Management notes — required to complete" value={review.reviewNotes} onChange={value => patch({ reviewNotes: value })} />{review.decision === 'Restrict Scope' && <TextArea disabled={locked} label="Scope restrictions — required" value={review.scopeRestrictions} onChange={value => patch({ scopeRestrictions: value })} />}{review.decision === 'Extend Review' && <TextArea disabled={locked} label="Improvement plan — required" value={review.improvementPlan} onChange={value => patch({ improvementPlan: value })} />}{(review.decision === 'Close Engagement' || review.requiredActions.includes('Temporary Access Restriction')) && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs leading-5 text-red-800"><strong>No duplicate access system:</strong> the management requirement is recorded here. Apply any actual restriction/offboarding through the existing Team & Users control.</div>}</div>

    {!locked && <div className="mt-7"><div className={`mb-3 rounded-xl px-3 py-2 text-xs ${completionReady ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{completionReady ? 'Review evidence is ready for the selected status.' : 'To complete: choose a decision, add management notes, complete all nine quality evidence areas, and provide any decision-specific plan.'}</div><div className="flex justify-end"><button onClick={() => void onSave(review)} disabled={saving || !completionReady} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save review</button></div></div>}
  </div></div>;
}

function CompletedReviewCard({ review }: { review: SalesPerformanceReview }) {
  return <div className="rounded-2xl border border-slate-200 p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex items-center gap-2 font-black"><LockKeyhole className="h-4 w-4 text-emerald-600" />{reviewLabel(review)}</div><div className="mt-1 text-xs text-slate-500">Scheduled {dateLabel(review.scheduledFor)}{review.completedAt ? ` · completed ${new Date(review.completedAt).toLocaleDateString()}` : ''} · owner recorded</div></div>{review.decision && <DecisionPill decision={review.decision} />}</div>{review.requiredActions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{review.requiredActions.map(action => <span key={action} className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-[#000080]">{action}</span>)}</div>}<div className="mt-4 grid gap-3 md:grid-cols-2">{SALES_PERFORMANCE_QUALITY_AREAS.map(area => <div key={area.key} className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{area.label}</div><p className="mt-1 text-xs leading-5 text-slate-600">{review.qualityEvidence?.[area.key] || 'No evidence recorded'}</p></div>)}</div>{review.reviewNotes && <FeedbackLine label="Management notes" text={review.reviewNotes} />}{review.strengths && <FeedbackLine label="Strengths" text={review.strengths} />}{review.coachingActions && <FeedbackLine label="Coaching actions" text={review.coachingActions} />}{review.improvementPlan && <FeedbackLine label="Improvement plan" text={review.improvementPlan} />}{review.scopeRestrictions && <FeedbackLine label="Scope restrictions" text={review.scopeRestrictions} />}</div>;
}

function HeroStat({ label, value }: { label: string; value: string | number }) { return <div className="min-w-24 rounded-2xl bg-white/10 px-4 py-3"><div className="text-xl font-black">{value}</div><div className="mt-1 text-[9px] font-black uppercase tracking-wide text-blue-200">{label}</div></div>; }
function MiniMetric({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) { return <div className={`rounded-2xl border p-3 ${danger ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}><div className={`text-lg font-black ${danger ? 'text-red-700' : 'text-slate-900'}`}>{value}</div><div className="mt-1 text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div></div>; }
function NumberField({ label, value, onChange, min = 1, max }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }) { return <Field label={label}><input type="number" min={min} max={max} className={inputClass} value={value} onChange={e => onChange(Number(e.target.value))} /></Field>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><div className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</div>{children}</label>; }
function TextArea({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) { return <Field label={label}><textarea disabled={disabled} rows={4} className={inputClass} value={value} onChange={e => onChange(e.target.value)} /></Field>; }
function StatusPill({ status }: { status: SalesPerformanceReviewStatus }) { const cls = status === 'Completed' ? 'bg-emerald-50 text-emerald-700' : status === 'In Review' ? 'bg-blue-50 text-[#000080]' : status === 'Cancelled' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'; return <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${cls}`}>{status}</span>; }
function DecisionPill({ decision }: { decision: SalesPerformanceDecision }) { const cls = decision === 'Continue' ? 'bg-emerald-50 text-emerald-700' : decision === 'Extend Review' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'; return <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${cls}`}>{decision}</span>; }
function FeedbackLine({ label, text }: { label: string; text: string }) { return <div className="mt-4 border-t border-slate-100 pt-3"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div><p className="mt-1 text-xs leading-5 text-slate-600">{text}</p></div>; }
function Empty({ text }: { text: string }) { return <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">{text}</div>; }
function Notice({ tone, children }: { tone: 'success' | 'error' | 'warning'; children: ReactNode }) { const cls = tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-700'; const Icon = tone === 'success' ? CheckCircle2 : AlertTriangle; return <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm font-semibold ${cls}`}><Icon className="mt-0.5 h-5 w-5 shrink-0" />{children}</div>; }
