import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Ban,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  FileText,
  History,
  Link2,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Target
} from 'lucide-react';
import {
  ContentBrief,
  ContentClaim,
  ContentLifecycleStage,
  ContentWorkspace,
  contentDeliveryService
} from '../../lib/contentDeliveryService';

const STAGES: ContentLifecycleStage[] = [
  'Requested',
  'Intake Validated',
  'Research',
  'Strategy / Brief',
  'Ready for Writing',
  'Drafting',
  'Writer Self-QA',
  'SME / Fact Check',
  '2i Editorial Review',
  'SEO / Conversion Review',
  'Ready for Client Review',
  'Client Approved',
  'Ready for Implementation',
  'Implemented',
  'In-Context QA',
  'Approved for Publication',
  'Published',
  'Measured / Maintained'
];

const WAITING_STAGES = new Set<ContentLifecycleStage>([
  'SME / Fact Check',
  '2i Editorial Review',
  'SEO / Conversion Review',
  'Ready for Client Review',
  'Client Approved',
  'Ready for Implementation',
  'Implemented',
  'In-Context QA',
  'Approved for Publication',
  'Published',
  'Measured / Maintained'
]);

const BRIEF_FIELDS: Array<{ key: keyof ContentBrief; label: string; placeholder: string; required?: boolean; rows?: number }> = [
  { key: 'target_audience', label: 'Target audience', placeholder: 'Who exactly must this content help or persuade?', required: true },
  { key: 'primary_user_need', label: 'Primary user need', placeholder: 'What problem, question or job must this page solve?', required: true },
  { key: 'business_objective', label: 'Business objective', placeholder: 'What business outcome should this content support?', required: true },
  { key: 'primary_cta', label: 'Primary action / CTA', placeholder: 'What should the visitor do next?', required: true },
  { key: 'brand_voice', label: 'Brand voice & positioning', placeholder: 'Tone, vocabulary, positioning and messaging direction.', required: true, rows: 3 },
  { key: 'approved_facts', label: 'Approved facts', placeholder: 'Verified services, locations, credentials, numbers and facts supplied/approved by the client.', required: true, rows: 4 },
  { key: 'required_sections', label: 'Required sections / information', placeholder: 'Required page sections, messages, FAQs, proof and content elements.', required: true, rows: 4 },
  { key: 'differentiators', label: 'Differentiators', placeholder: 'Why should the customer choose this client instead of alternatives?', rows: 3 },
  { key: 'source_material', label: 'Source material', placeholder: 'Existing site, documents, interviews, analytics, research or approved references.', rows: 3 },
  { key: 'competitor_references', label: 'Competitor / market references', placeholder: 'Competitors reviewed for gaps and differentiation. Never copy.', rows: 3 },
  { key: 'seo_primary_keyword', label: 'Primary search topic / keyword', placeholder: 'Where SEO is included.', rows: 2 },
  { key: 'seo_secondary_keywords', label: 'Secondary topics / terminology', placeholder: 'Natural supporting topics and terminology.', rows: 2 },
  { key: 'special_restrictions', label: 'Restrictions / risks', placeholder: 'Legal, claims, compliance, wording, scope or implementation restrictions.', rows: 3 },
  { key: 'approval_contact', label: 'Approval context', placeholder: 'Who must approve facts/content or what approval route applies?', rows: 2 }
];

type TabKey = 'brief' | 'draft' | 'evidence' | 'quality';

function stageProgress(stage: ContentLifecycleStage) {
  if (stage === 'Blocked — Information Required') return 0;
  const index = STAGES.indexOf(stage);
  return index < 0 ? 0 : Math.round(((index + 1) / STAGES.length) * 100);
}

function nextActionLabel(stage: ContentLifecycleStage) {
  switch (stage) {
    case 'Requested': return 'Validate Intake';
    case 'Intake Validated': return 'Start Research';
    case 'Research': return 'Prepare Strategy & Brief';
    case 'Strategy / Brief': return 'Confirm Brief Ready';
    case 'Ready for Writing': return 'Start Writing';
    case 'Drafting': return 'Move to Writer Self-QA';
    case 'Writer Self-QA': return 'Submit for Independent Review';
    default: return 'Continue';
  }
}

function getError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as any).message || 'Something went wrong.');
  return 'Something went wrong.';
}

export default function ContentDeliveryTaskWorkspace({ taskId, onTaskChanged }: { taskId: string; onTaskChanged?: () => void }) {
  const [workspace, setWorkspace] = useState<ContentWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tab, setTab] = useState<TabKey>('brief');
  const [brief, setBrief] = useState<ContentBrief>({});
  const [draft, setDraft] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [claimText, setClaimText] = useState('');
  const [claimType, setClaimType] = useState<ContentClaim['claim_type']>('Factual');
  const [claimSource, setClaimSource] = useState('');
  const [claimNote, setClaimNote] = useState('');
  const [blockReason, setBlockReason] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const next = await contentDeliveryService.getWorkspace(taskId);
      setWorkspace(next);
      setBrief(next.deliverable.brief || {});
      setDraft(next.versions[0]?.content || '');
    } catch (e) {
      setError(getError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [taskId]);

  const latestReview = useMemo(() => workspace?.reviews?.[0] || null, [workspace]);
  const pendingClaims = useMemo(() => workspace?.claims.filter(claim => claim.material && !['Verified', 'Not Required'].includes(claim.verification_status)).length || 0, [workspace]);
  const packageProfile = workspace?.package?.profile || {};

  const run = async (key: string, action: () => Promise<unknown>, message: string) => {
    setBusy(key);
    setError('');
    setSuccess('');
    try {
      await action();
      setSuccess(message);
      await load();
      onTaskChanged?.();
    } catch (e) {
      setError(getError(e));
    } finally {
      setBusy('');
    }
  };

  const saveBrief = () => {
    if (!workspace) return;
    return run('brief', () => contentDeliveryService.saveBrief(workspace.deliverable.id, brief), 'Brief saved and readiness recalculated.');
  };

  const saveVersion = () => {
    if (!workspace) return;
    return run('version', () => contentDeliveryService.saveVersion(workspace.deliverable.id, draft, changeSummary), 'New content version saved.');
  };

  const addClaim = () => {
    if (!workspace) return;
    return run('claim', async () => {
      await contentDeliveryService.upsertClaim({
        deliverableId: workspace.deliverable.id,
        claimText,
        claimType,
        material: true,
        sourceUrl: claimSource,
        sourceNote: claimNote
      });
      setClaimText('');
      setClaimSource('');
      setClaimNote('');
    }, 'Claim added to the evidence register.');
  };

  const advance = () => {
    if (!workspace) return;
    if (workspace.deliverable.lifecycle_stage === 'Writer Self-QA') {
      return run('advance', async () => {
        await contentDeliveryService.recordReview({
          deliverableId: workspace.deliverable.id,
          reviewType: 'Writer Self-QA',
          decision: 'Passed',
          feedback: 'Writer confirmed self-QA completion before independent review.'
        });
        await contentDeliveryService.advance(workspace.deliverable.id);
      }, 'Writer self-QA recorded and work submitted for independent review.');
    }
    return run('advance', () => contentDeliveryService.advance(workspace.deliverable.id), 'Content moved to the next SOP stage.');
  };

  const block = () => {
    if (!workspace || !blockReason.trim()) return;
    return run('block', async () => {
      await contentDeliveryService.block(workspace.deliverable.id, blockReason.trim());
      setBlockReason('');
    }, 'Content item blocked until the missing information is resolved.');
  };

  const resume = () => {
    if (!workspace) return;
    return run('resume', () => contentDeliveryService.resume(workspace.deliverable.id, 'Required information/dependency resolved.'), 'Content work resumed from the previous stage.');
  };

  if (loading) return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /></div>;
  if (!workspace) return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error || 'Content Delivery workspace could not be loaded.'}</div>;

  const { deliverable, readiness, config } = workspace;
  const waiting = WAITING_STAGES.has(deliverable.lifecycle_stage);
  const blocked = deliverable.lifecycle_stage === 'Blocked — Information Required';
  const progress = stageProgress(deliverable.lifecycle_stage);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="bg-[#000080] p-5 text-white sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.17em] text-blue-200">
                <span>{config.sopCode || 'PF-SOP-07'}</span><span>•</span><span>{workspace.package.name || 'Project package'}</span>
              </div>
              <h2 className="mt-2 text-xl font-black">{deliverable.lifecycle_stage}</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-blue-100">
                {blocked ? deliverable.blocked_reason : waiting ? 'Your work is now in a controlled review / approval stage. Keep the source material available and respond only when changes are requested.' : 'Complete this stage carefully. The system will only allow the next step when its required quality gate is satisfied.'}
              </p>
            </div>
            <div className="min-w-[180px]">
              <div className="flex items-center justify-between text-[10px] font-bold text-blue-200"><span>Delivery progress</span><span>{progress}%</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-white" style={{ width: `${progress}%` }} /></div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-4 sm:p-5">
          <Metric label="Brief readiness" value={`${readiness.percent}%`} good={readiness.ready} />
          <Metric label="Current version" value={deliverable.current_version_no ? `V${deliverable.current_version_no}` : 'Not saved'} good={deliverable.current_version_no > 0} />
          <Metric label="Evidence pending" value={String(pendingClaims)} good={pendingClaims === 0} />
          <Metric label="Quality" value={deliverable.quality_score != null ? `${deliverable.quality_score}/100` : deliverable.quality_status} good={deliverable.quality_status === 'Pass'} />
        </div>
      </section>

      {(error || success) && <div className={`rounded-2xl border p-3 text-xs font-semibold ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || success}</div>}

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5">
        {[
          ['brief', 'Brief', Target],
          ['draft', 'Create', FileText],
          ['evidence', 'Verify', ShieldCheck],
          ['quality', 'Quality & history', History]
        ].map(([key, label, Icon]: any) => <button key={key} type="button" onClick={() => setTab(key)} className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition ${tab === key ? 'bg-[#000080] text-white' : 'text-slate-600 hover:bg-slate-50'}`}><Icon className="h-4 w-4" />{label}</button>)}
      </nav>

      {tab === 'brief' && (
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]">Definition of Ready</div><h3 className="mt-1 text-lg font-black">Structured Content Brief</h3><p className="mt-1 text-xs leading-5 text-slate-500">Complete the facts and direction needed to do excellent work. Missing information must be escalated, not invented.</p></div>
            <div className={`rounded-full px-3 py-1.5 text-xs font-black ${readiness.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{readiness.percent}% ready</div>
          </div>
          {readiness.missing?.length > 0 && <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />Missing: {readiness.missing.map(item => item.replaceAll('_', ' ')).join(', ')}</div>}
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {BRIEF_FIELDS.map(field => <label key={String(field.key)} className={field.rows && field.rows >= 4 ? 'md:col-span-2' : ''}><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">{field.label}{field.required ? ' *' : ''}</span><textarea rows={field.rows || 2} value={String(brief[field.key] || '')} onChange={event => setBrief(current => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#000080] focus:bg-white" /></label>)}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div className="text-[11px] font-semibold text-slate-500">Package depth: <strong className="text-slate-800">{String(packageProfile.researchDepth || 'standard').replaceAll('_', ' ')}</strong></div><button type="button" onClick={() => void saveBrief()} disabled={busy === 'brief'} className="flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy === 'brief' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Brief</button></div>
        </section>
      )}

      {tab === 'draft' && (
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><div className="rounded-2xl bg-blue-50 p-3 text-[#000080]"><FileText className="h-5 w-5" /></div><div><h3 className="text-lg font-black">Content Draft</h3><p className="mt-1 text-xs leading-5 text-slate-500">Keep every important version. Never overwrite the review history.</p></div></div>
          <textarea value={draft} onChange={event => setDraft(event.target.value)} rows={18} placeholder="Create or paste the content draft here..." className="mt-5 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800 outline-none focus:border-[#000080] focus:bg-white" />
          <label className="mt-4 block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Version change summary</span><input value={changeSummary} onChange={event => setChangeSummary(event.target.value)} placeholder="What changed in this version?" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-[#000080]" /></label>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="text-[11px] text-slate-500">{workspace.versions.length} saved version{workspace.versions.length === 1 ? '' : 's'}</div><button type="button" onClick={() => void saveVersion()} disabled={busy === 'version'} className="flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy === 'version' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save New Version</button></div>
          {workspace.versions.length > 0 && <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">{workspace.versions.slice(0, 5).map(version => <div key={version.id} className="flex items-start justify-between gap-4 rounded-2xl bg-slate-50 p-3"><div><div className="text-xs font-black text-slate-800">Version {version.version_no} · {version.status}</div><div className="mt-1 text-[11px] text-slate-500">{version.change_summary || 'No change summary'}</div></div><div className="text-[10px] font-bold text-slate-400">{new Date(version.created_at).toLocaleString()}</div></div>)}</div>}
        </section>
      )}

      {tab === 'evidence' && (
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div><div><h3 className="text-lg font-black">Claim & Evidence Register</h3><p className="mt-1 text-xs leading-5 text-slate-500">Material facts, statistics, comparisons, credentials and performance claims need traceable evidence before approval.</p></div></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <label className="md:col-span-2"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Claim</span><textarea rows={3} value={claimText} onChange={event => setClaimText(event.target.value)} placeholder="Write the exact factual or material claim..." className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-[#000080]" /></label>
            <label><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Claim type</span><select value={claimType} onChange={event => setClaimType(event.target.value as ContentClaim['claim_type'])} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold outline-none">{['Factual','Statistic','Comparative','Testimonial','Credential','Performance','Other'].map(type => <option key={type}>{type}</option>)}</select></label>
            <label><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Source URL</span><div className="relative"><Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={claimSource} onChange={event => setClaimSource(event.target.value)} placeholder="https://..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#000080]" /></div></label>
            <label className="md:col-span-2"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Evidence note</span><input value={claimNote} onChange={event => setClaimNote(event.target.value)} placeholder="Where the proof came from and what it supports." className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-[#000080]" /></label>
          </div>
          <div className="mt-4 flex justify-end"><button type="button" onClick={() => void addClaim()} disabled={busy === 'claim' || !claimText.trim()} className="flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-40">{busy === 'claim' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add Claim</button></div>
          <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">{workspace.claims.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs font-semibold text-slate-400">No material claims have been registered yet.</div> : workspace.claims.map(claim => <div key={claim.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex flex-wrap items-center gap-2"><span className="text-[9px] font-black uppercase tracking-wider text-slate-500">{claim.claim_type}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${claim.verification_status === 'Verified' ? 'bg-emerald-100 text-emerald-800' : claim.verification_status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{claim.verification_status}</span></div><p className="mt-2 text-sm font-semibold leading-6 text-slate-800">{claim.claim_text}</p>{(claim.source_url || claim.source_note) && <div className="mt-2 text-[11px] leading-5 text-slate-500">{claim.source_url && <div className="break-all">Source: {claim.source_url}</div>}{claim.source_note && <div>{claim.source_note}</div>}</div>}</div>)}</div>
        </section>
      )}

      {tab === 'quality' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-[#000080]" /><h3 className="text-base font-black">Quality Gate</h3></div>
            <div className="mt-4 grid grid-cols-2 gap-3"><Metric label="Threshold" value={`${config.qualityPassScore || 90}/100`} /><Metric label="Current score" value={deliverable.quality_score != null ? `${deliverable.quality_score}/100` : 'Not scored'} good={deliverable.quality_status === 'Pass'} /><Metric label="Critical defects" value={String(deliverable.critical_defect_count)} good={deliverable.critical_defect_count === 0} /><Metric label="Major defects" value={String(deliverable.major_defect_count)} good={deliverable.major_defect_count === 0} /></div>
            {latestReview && <div className="mt-4 rounded-2xl bg-slate-50 p-4"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Latest review</div><div className="mt-1 text-sm font-black">{latestReview.review_type} · {latestReview.decision}</div>{latestReview.feedback && <p className="mt-2 text-xs leading-5 text-slate-600">{latestReview.feedback}</p>}</div>}
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-xs leading-5 text-slate-700"><strong>Quality rule:</strong> a score of 90+ does not override a C0/C1 critical defect. Independent review remains mandatory.</div>
          </section>
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2"><History className="h-5 w-5 text-[#000080]" /><h3 className="text-base font-black">Activity History</h3></div>
            <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">{workspace.events.map(event => <div key={event.id} className="relative pl-5 text-xs before:absolute before:left-1.5 before:top-1.5 before:h-2 before:w-2 before:rounded-full before:bg-[#000080]"><div className="font-black text-slate-800">{event.event_type}</div>{(event.from_stage || event.to_stage) && <div className="mt-0.5 text-[11px] font-semibold text-slate-500">{event.from_stage || '—'} → {event.to_stage || '—'}</div>}{event.notes && <div className="mt-1 leading-5 text-slate-600">{event.notes}</div>}<div className="mt-1 text-[9px] font-bold text-slate-400">{new Date(event.created_at).toLocaleString()}</div></div>)}</div>
          </section>
        </div>
      )}

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3"><div className={`rounded-2xl p-3 ${blocked ? 'bg-red-50 text-red-600' : waiting ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-[#000080]'}`}>{blocked ? <Ban className="h-5 w-5" /> : waiting ? <Lock className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}</div><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Next action</div><h3 className="mt-1 text-base font-black">{blocked ? 'Resolve missing information' : waiting ? 'Waiting on the controlled review / approval process' : nextActionLabel(deliverable.lifecycle_stage)}</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{blocked ? 'Resume only when the missing information or dependency is genuinely resolved.' : waiting ? 'No extra task is created. The same deliverable continues through review, client approval, implementation and QA.' : 'The backend checks the SOP gate before moving forward. If a required condition is missing, the transition is blocked.'}</p></div></div>
          <div className="flex flex-wrap gap-2">
            {blocked ? <button type="button" onClick={() => void resume()} disabled={busy === 'resume'} className="flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy === 'resume' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Resume Work</button> : !waiting ? <button type="button" onClick={() => void advance()} disabled={busy === 'advance'} className="flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy === 'advance' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{nextActionLabel(deliverable.lifecycle_stage)}</button> : null}
          </div>
        </div>
        {!blocked && !waiting && <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_auto]"><input value={blockReason} onChange={event => setBlockReason(event.target.value)} placeholder="Blocked? Describe the missing information or dependency..." className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs outline-none focus:border-red-400" /><button type="button" onClick={() => void block()} disabled={busy === 'block' || blockReason.trim().length < 3} className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-700 disabled:opacity-40"><Ban className="h-4 w-4" />Block — Information Required</button></div>}
      </section>

      <section className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
        <div className="flex items-start gap-3"><BookOpenCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><div><div className="text-xs font-black text-emerald-900">Simple on the surface, strict underneath</div><p className="mt-1 text-[11px] leading-5 text-emerald-800">Pricing and scope come from the existing Sales Catalog/quotation. Client approval comes from the existing project approval system. This workspace only adds the content-specific SOP evidence needed to protect quality.</p></div></div>
      </section>
    </div>
  );
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className={`mt-1 text-sm font-black ${good === true ? 'text-emerald-700' : good === false ? 'text-amber-700' : 'text-slate-900'}`}>{value}</div></div>;
}
