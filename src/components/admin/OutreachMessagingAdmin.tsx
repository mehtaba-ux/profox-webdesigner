import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, Loader2, Plus, RefreshCw, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { trainingService, TrainingModule } from '../../lib/trainingService';
import {
  OutreachAdminSubmission,
  OutreachMessagingConfig,
  outreachMessagingTrainingService,
} from '../../lib/outreachMessagingTrainingService';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#000080]';
const errorMessage = (error: any, fallback: string) => error?.message || fallback;
const stringifyLines = (values: any[]) => values.map((value) => typeof value === 'string' ? value : JSON.stringify(value)).join('\n');
const parseLines = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean);
const parseJsonLines = (value: string) => parseLines(value).map((line) => JSON.parse(line));

interface EditableConfig {
  acceptedMessageMinWords: number;
  targetMessageMinWords: number;
  targetMessageMaxWords: number;
  acceptedMessageMaxWords: number;
  subjectMinWords: number;
  subjectMaxWords: number;
  passingScore: number;
  channelOptions: string;
  defaultCadence: string;
  requiredReplyScenarios: string;
  rubric: string;
  criticalFailures: string;
}

function toEditable(config: OutreachMessagingConfig, passingScore: number): EditableConfig {
  return {
    acceptedMessageMinWords: config.acceptedMessageMinWords,
    targetMessageMinWords: config.targetMessageMinWords,
    targetMessageMaxWords: config.targetMessageMaxWords,
    acceptedMessageMaxWords: config.acceptedMessageMaxWords,
    subjectMinWords: config.subjectMinWords,
    subjectMaxWords: config.subjectMaxWords,
    passingScore,
    channelOptions: stringifyLines(config.channelOptions),
    defaultCadence: stringifyLines(config.defaultCadence),
    requiredReplyScenarios: stringifyLines(config.requiredReplyScenarios),
    rubric: stringifyLines(config.rubric),
    criticalFailures: stringifyLines(config.criticalFailures),
  };
}

export default function OutreachMessagingAdmin() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [module, setModule] = useState<TrainingModule | null>(null);
  const [config, setConfig] = useState<OutreachMessagingConfig | null>(null);
  const [editable, setEditable] = useState<EditableConfig | null>(null);
  const [submissions, setSubmissions] = useState<OutreachAdminSubmission[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [criticalFailures, setCriticalFailures] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  const [playbooks, setPlaybooks] = useState<any[]>([]);
  const [compliance, setCompliance] = useState<any[]>([]);
  const [tab, setTab] = useState<'reviews' | 'standards' | 'playbooks' | 'compliance'>('reviews');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const modulesResponse = await trainingService.getModules(true);
      const foundModule = (modulesResponse.data || []).find((item) => item.slug === 'outreach-cadence') || null;
      if (!foundModule) throw new Error('Module 7 not found.');

      const [configResponse, submissionsResponse, playbooksResponse, complianceResponse] = await Promise.all([
        outreachMessagingTrainingService.getConfig(foundModule.id),
        outreachMessagingTrainingService.adminListSubmissions(),
        outreachMessagingTrainingService.adminListPlaybooks(foundModule.id),
        outreachMessagingTrainingService.adminListCompliance(foundModule.id),
      ]);

      if (configResponse.error || !configResponse.data) throw configResponse.error || new Error('Module 7 configuration is unavailable.');
      if (submissionsResponse.error) throw submissionsResponse.error;
      if (playbooksResponse.error) throw playbooksResponse.error;
      if (complianceResponse.error) throw complianceResponse.error;

      setModule(foundModule);
      setConfig(configResponse.data);
      setEditable(toEditable(configResponse.data, foundModule.passing_score || 80));
      setSubmissions(submissionsResponse.data || []);
      setPlaybooks(playbooksResponse.data || []);
      setCompliance(complianceResponse.data || []);
      setSelectedId((current) => {
        if (current && (submissionsResponse.data || []).some((item) => item.progressId === current)) return current;
        return (submissionsResponse.data || []).find((item) => item.status === 'Submitted')?.progressId || (submissionsResponse.data || [])[0]?.progressId || '';
      });
    } catch (loadError: any) {
      setError(errorMessage(loadError, 'Module 7 Admin could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin]);

  const selected = submissions.find((item) => item.progressId === selectedId) || null;

  useEffect(() => {
    if (!config || !selected) return;
    setScores(Object.fromEntries(config.rubric.map((item) => [item.key, Number(selected.reviewDetail?.rubricScores?.[item.key] || 0)])));
    setCriticalFailures(Array.isArray(selected.reviewDetail?.criticalFailures) ? selected.reviewDetail.criticalFailures : []);
    setFeedback(selected.reviewDetail?.feedback || '');
  }, [selectedId, config, selected]);

  const totalScore = useMemo(() => Object.values(scores).reduce((sum, value) => sum + Number(value || 0), 0), [scores]);
  const decision = module && totalScore >= (module.passing_score || 80) && criticalFailures.length === 0 ? 'Passed' : 'Retry Required';

  const submitReview = async () => {
    if (!selected || selected.status !== 'Submitted') return;
    setBusy(true);
    setError('');
    const { data, error: reviewError } = await outreachMessagingTrainingService.adminReview(selected.progressId, scores, criticalFailures, feedback);
    if (reviewError) setError(errorMessage(reviewError, 'Review failed.'));
    else {
      setMessage(`Review saved: ${(data as any)?.status} · ${(data as any)?.score}/100.`);
      await load();
    }
    setBusy(false);
  };

  const saveStandards = async () => {
    if (!module || !editable) return;
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...editable,
        channelOptions: parseLines(editable.channelOptions),
        defaultCadence: parseJsonLines(editable.defaultCadence),
        requiredReplyScenarios: parseJsonLines(editable.requiredReplyScenarios),
        rubric: parseJsonLines(editable.rubric),
        criticalFailures: parseJsonLines(editable.criticalFailures),
      };
      const { error: saveError } = await outreachMessagingTrainingService.adminUpdateConfig(module.id, payload);
      if (saveError) throw saveError;
      setMessage('Module 7 standards saved. Approval scope remains onboarding-only.');
      await load();
    } catch (saveError: any) {
      setError(errorMessage(saveError, 'Standards could not be saved. Check JSON-line fields.'));
    } finally {
      setBusy(false);
    }
  };

  const savePlaybook = async (item: any) => {
    if (!module) return;
    setBusy(true);
    setError('');
    const { error: saveError } = await outreachMessagingTrainingService.adminSavePlaybook(module.id, {
      id: item.id,
      code: item.code,
      title: item.title,
      category: item.category,
      channel: item.channel,
      niche_slug: item.niche_slug || null,
      market_code: item.market_code || 'GLOBAL',
      subject_template: item.subject_template || null,
      body_template: item.body_template,
      coaching_note: item.coaching_note || '',
      variables: Array.isArray(item.variables) ? item.variables : parseLines(item.variables || ''),
      active: item.active !== false,
      sort_order: Number(item.sort_order || 100),
    });
    if (saveError) setError(errorMessage(saveError, 'Playbook could not be saved.'));
    else {
      setMessage('Playbook saved.');
      await load();
    }
    setBusy(false);
  };

  const saveCompliance = async (item: any) => {
    if (!module) return;
    setBusy(true);
    setError('');
    const { error: saveError } = await outreachMessagingTrainingService.adminSaveCompliance(module.id, {
      id: item.id,
      market_code: item.market_code,
      market_label: item.market_label,
      channel: item.channel,
      status: item.status,
      summary: item.summary,
      rules: Array.isArray(item.rules) ? item.rules : parseLines(item.rules || ''),
      reference_urls: Array.isArray(item.reference_urls) ? item.reference_urls : parseLines(item.reference_urls || ''),
      active: item.active !== false,
      sort_order: Number(item.sort_order || 100),
    });
    if (saveError) setError(errorMessage(saveError, 'Compliance preset could not be saved.'));
    else {
      setMessage('Compliance preset saved.');
      await load();
    }
    setBusy(false);
  };

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/admin/workspace" replace />;
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex gap-3">
            <button onClick={() => navigate('/admin/app/recruitment?tab=onboarding')} className="rounded-xl border p-2"><ArrowLeft className="h-4 w-4" /></button>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">Sales Academy · Module 7</div>
              <h1 className="text-xl font-black">Outreach Messaging Academy</h1>
              <p className="mt-1 text-xs text-slate-500">One-time certification review plus live message, cadence, and market controls.</p>
            </div>
          </div>
          <button onClick={() => void load()} className="rounded-xl border p-2"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
        <Notice><strong>Scope:</strong> Admin approves the seller’s Module 7 certification once during onboarding. Normal future outreach does not require message-by-message approval.</Notice>
        {error && <Notice danger>{error}</Notice>}
        {message && <Notice>{message}</Notice>}

        <div className="grid grid-cols-2 gap-1 rounded-2xl border bg-white p-1 md:grid-cols-4">
          <Tab active={tab === 'reviews'} onClick={() => setTab('reviews')}>Submissions & Review</Tab>
          <Tab active={tab === 'standards'} onClick={() => setTab('standards')}>Standards & Cadence</Tab>
          <Tab active={tab === 'playbooks'} onClick={() => setTab('playbooks')}>Message Playbooks</Tab>
          <Tab active={tab === 'compliance'} onClick={() => setTab('compliance')}>Market / Compliance</Tab>
        </div>

        {tab === 'reviews' && (
          <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
            <section className="overflow-hidden rounded-3xl border bg-white">
              <div className="border-b bg-slate-50 p-4 text-xs font-black">Trainee Certifications</div>
              <div className="max-h-[700px] divide-y overflow-y-auto">
                {submissions.length === 0 ? <div className="p-6 text-xs text-slate-500">No Module 7 submissions yet.</div> : submissions.map((item) => (
                  <button key={item.progressId} onClick={() => setSelectedId(item.progressId)} className={`w-full p-4 text-left ${selectedId === item.progressId ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                    <div className="text-xs font-black">{item.candidateName}</div>
                    <div className="text-[10px] text-slate-500">{item.candidateEmail || 'No email'}</div>
                    <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black">{item.status}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-5">
              {!selected ? <div className="rounded-3xl border bg-white p-8 text-sm text-slate-500">Select a submission.</div> : (
                <>
                  <div className="rounded-3xl border bg-white p-6">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">Messaging Sequence</div>
                    <h2 className="mt-1 text-lg font-black">{selected.submission?.companyName || selected.candidateName}</h2>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <Data label="Contact" value={`${selected.submission?.targetContact || '—'} · ${selected.submission?.targetRole || '—'}`} />
                      <Data label="Market" value={selected.submission?.marketCode || '—'} />
                      <Data label="Business signal" value={selected.submission?.businessSignal || '—'} />
                      <Data label="Verified observation" value={selected.submission?.verifiedObservation || '—'} />
                    </div>
                    {selected.submission?.evidenceUrl && <a href={selected.submission.evidenceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#000080]">Open evidence <ExternalLink className="h-3.5 w-3.5" /></a>}
                    <DataBlock label={`Subject · ${selected.submission?.subject || ''}`} value={String(selected.submission?.firstEmail || '—')} />
                    <DataBlock label="LinkedIn connection" value={String(selected.submission?.linkedinConnection || '—')} />
                    <DataBlock label="Loom companion" value={String(selected.submission?.loomCompanion || '—')} />
                    <DataBlock label="Follow-ups" value={Object.entries(selected.submission?.followups || {}).map(([key, value]) => `${key}: ${String(value)}`).join('\n\n') || '—'} />
                    <DataBlock label="Reply handling" value={Object.entries(selected.submission?.replyHandling || {}).map(([key, value]) => `${key}: ${String(value)}`).join('\n\n') || '—'} />
                  </div>

                  <div className="rounded-3xl border bg-white p-6">
                    <div className="mb-4 flex items-start justify-between">
                      <div><h3 className="font-black">100-Point Rubric</h3><p className="text-xs text-slate-500">Any critical failure forces Retry Required.</p></div>
                      <div className={`rounded-xl px-4 py-2 text-center ${decision === 'Passed' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}><div className="font-black">{totalScore}/100</div><div className="text-[9px] font-black uppercase">{decision}</div></div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {config?.rubric.map((item) => (
                        <label key={item.key} className="rounded-xl border p-3 text-xs">
                          <span className="flex justify-between font-bold"><span>{item.label}</span><span>/{item.max}</span></span>
                          <input type="number" min={0} max={item.max} disabled={selected.status !== 'Submitted'} className={`${inputClass} mt-2`} value={scores[item.key] ?? 0} onChange={(event) => setScores((current) => ({ ...current, [item.key]: Number(event.target.value) }))} />
                        </label>
                      ))}
                    </div>
                    <div className="mt-5 flex items-start gap-2"><ShieldCheck className="h-5 w-5 text-red-600" /><div><h4 className="text-sm font-black">Critical failures</h4><p className="text-xs text-slate-500">Select every issue actually present.</p></div></div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {config?.criticalFailures.map((item) => (
                        <label key={item.key} className="flex items-start gap-3 rounded-xl border bg-slate-50 p-3 text-xs">
                          <input type="checkbox" disabled={selected.status !== 'Submitted'} checked={criticalFailures.includes(item.key)} onChange={(event) => setCriticalFailures((current) => event.target.checked ? [...current, item.key] : current.filter((key) => key !== item.key))} />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                    <textarea rows={5} disabled={selected.status !== 'Submitted'} className={`${inputClass} mt-4`} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Specific coaching feedback" />
                    {selected.status === 'Submitted' && <button disabled={busy} onClick={() => void submitReview()} className="mt-4 w-full rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white">Submit Admin Decision · {decision}</button>}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {tab === 'standards' && editable && (
          <section className="space-y-5 rounded-3xl border bg-white p-6">
            <div><h2 className="text-lg font-black">Module 7 Standards</h2><p className="text-xs text-slate-500">Admin-editable operating rules. Approval scope is fixed to onboarding-only.</p></div>
            <div className="grid gap-3 md:grid-cols-4">
              <NumberField label="Accepted email min" value={editable.acceptedMessageMinWords} onChange={(value) => setEditable({ ...editable, acceptedMessageMinWords: value })} />
              <NumberField label="Target min" value={editable.targetMessageMinWords} onChange={(value) => setEditable({ ...editable, targetMessageMinWords: value })} />
              <NumberField label="Target max" value={editable.targetMessageMaxWords} onChange={(value) => setEditable({ ...editable, targetMessageMaxWords: value })} />
              <NumberField label="Accepted email max" value={editable.acceptedMessageMaxWords} onChange={(value) => setEditable({ ...editable, acceptedMessageMaxWords: value })} />
              <NumberField label="Subject min words" value={editable.subjectMinWords} onChange={(value) => setEditable({ ...editable, subjectMinWords: value })} />
              <NumberField label="Subject max words" value={editable.subjectMaxWords} onChange={(value) => setEditable({ ...editable, subjectMaxWords: value })} />
              <NumberField label="Passing score" value={editable.passingScore} onChange={(value) => setEditable({ ...editable, passingScore: value })} />
            </div>
            <TextEditor label="Channel options · one per line" value={editable.channelOptions} onChange={(value) => setEditable({ ...editable, channelOptions: value })} />
            <TextEditor label="Default cadence · one JSON object per line" value={editable.defaultCadence} onChange={(value) => setEditable({ ...editable, defaultCadence: value })} />
            <TextEditor label="Required reply scenarios · one JSON object per line" value={editable.requiredReplyScenarios} onChange={(value) => setEditable({ ...editable, requiredReplyScenarios: value })} />
            <TextEditor label="Rubric · one JSON object per line · max points total 100" value={editable.rubric} onChange={(value) => setEditable({ ...editable, rubric: value })} />
            <TextEditor label="Critical failures · one JSON object per line" value={editable.criticalFailures} onChange={(value) => setEditable({ ...editable, criticalFailures: value })} />
            <button disabled={busy} onClick={() => void saveStandards()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white"><Save className="h-4 w-4" />Save Standards</button>
          </section>
        )}

        {tab === 'playbooks' && (
          <CrudSection title="Message Playbooks" onAdd={() => setPlaybooks((current) => [...current, { code: `new_${Date.now()}`, title: 'New Playbook', category: 'cold_email', channel: 'Email', market_code: 'GLOBAL', subject_template: '', body_template: '', coaching_note: '', variables: [], active: true, sort_order: 999 }])}>
            {playbooks.map((item, index) => (
              <div key={item.id || item.code} className="space-y-3 rounded-2xl border p-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <PlainField label="Code" value={item.code || ''} onChange={(value) => setPlaybooks((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, code: value } : row))} />
                  <PlainField label="Title" value={item.title || ''} onChange={(value) => setPlaybooks((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, title: value } : row))} />
                  <PlainField label="Category" value={item.category || ''} onChange={(value) => setPlaybooks((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, category: value } : row))} />
                  <PlainField label="Channel" value={item.channel || ''} onChange={(value) => setPlaybooks((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, channel: value } : row))} />
                </div>
                <PlainField label="Subject template" value={item.subject_template || ''} onChange={(value) => setPlaybooks((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, subject_template: value } : row))} />
                <TextEditor label="Body template" value={item.body_template || ''} onChange={(value) => setPlaybooks((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, body_template: value } : row))} />
                <TextEditor label="Coaching note" value={item.coaching_note || ''} onChange={(value) => setPlaybooks((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, coaching_note: value } : row))} />
                <div className="flex gap-2">
                  <button onClick={() => void savePlaybook(item)} className="rounded-xl bg-[#000080] px-4 py-2 text-xs font-black text-white">Save</button>
                  {item.id && <button onClick={async () => { if (window.confirm('Delete this playbook?')) { await outreachMessagingTrainingService.adminDeletePlaybook(item.id); await load(); } }} className="rounded-xl border p-2 text-red-600"><Trash2 className="h-4 w-4" /></button>}
                </div>
              </div>
            ))}
          </CrudSection>
        )}

        {tab === 'compliance' && (
          <CrudSection title="Market / Channel Compliance Presets" onAdd={() => setCompliance((current) => [...current, { market_code: 'NEW', market_label: 'New Market', channel: 'Email', status: 'admin_review_required', summary: '', rules: [], reference_urls: [], active: true, sort_order: 999 }])}>
            {compliance.map((item, index) => (
              <div key={item.id || `${item.market_code}-${index}`} className="space-y-3 rounded-2xl border p-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <PlainField label="Market code" value={item.market_code || ''} onChange={(value) => setCompliance((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, market_code: value } : row))} />
                  <PlainField label="Market label" value={item.market_label || ''} onChange={(value) => setCompliance((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, market_label: value } : row))} />
                  <PlainField label="Channel" value={item.channel || ''} onChange={(value) => setCompliance((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, channel: value } : row))} />
                  <label><span className="mb-1 block text-[10px] font-black">Status</span><select className={inputClass} value={item.status} onChange={(event) => setCompliance((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, status: event.target.value } : row))}><option value="allowed_with_rules">Allowed with rules</option><option value="admin_review_required">Admin review required</option><option value="do_not_send">Do not send</option></select></label>
                </div>
                <TextEditor label="Summary" value={item.summary || ''} onChange={(value) => setCompliance((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, summary: value } : row))} />
                <TextEditor label="Rules · one per line" value={Array.isArray(item.rules) ? item.rules.join('\n') : item.rules || ''} onChange={(value) => setCompliance((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, rules: value } : row))} />
                <TextEditor label="Reference URLs · one per line" value={Array.isArray(item.reference_urls) ? item.reference_urls.join('\n') : item.reference_urls || ''} onChange={(value) => setCompliance((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, reference_urls: value } : row))} />
                <div className="flex gap-2">
                  <button onClick={() => void saveCompliance(item)} className="rounded-xl bg-[#000080] px-4 py-2 text-xs font-black text-white">Save</button>
                  {item.id && <button onClick={async () => { if (window.confirm('Delete this compliance preset?')) { await outreachMessagingTrainingService.adminDeleteCompliance(item.id); await load(); } }} className="rounded-xl border p-2 text-red-600"><Trash2 className="h-4 w-4" /></button>}
                </div>
              </div>
            ))}
          </CrudSection>
        )}
      </main>
    </div>
  );
}

function Notice({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) {
  return <div className={`rounded-2xl border p-4 text-sm ${danger ? 'border-red-200 bg-red-50 text-red-900' : 'border-blue-200 bg-blue-50 text-blue-950'}`}>{children}</div>;
}
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-xl px-3 py-3 text-xs font-black ${active ? 'bg-[#000080] text-white' : 'text-slate-600'}`}>{children}</button>;
}
function Data({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-black uppercase text-slate-400">{label}</div><div className="mt-1 whitespace-pre-wrap text-xs">{value}</div></div>;
}
function DataBlock({ label, value }: { label: string; value: string }) {
  return <div className="mt-4 rounded-xl bg-slate-50 p-4"><div className="text-[10px] font-black uppercase text-slate-500">{label}</div><pre className="mt-2 whitespace-pre-wrap font-sans text-xs">{value}</pre></div>;
}
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label><span className="mb-1 block text-[10px] font-black">{label}</span><input type="number" className={inputClass} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
function PlainField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span className="mb-1 block text-[10px] font-black">{label}</span><input className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
function TextEditor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-1 block text-[10px] font-black">{label}</span><textarea rows={4} className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
function CrudSection({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) {
  return <section className="space-y-4 rounded-3xl border bg-white p-6"><div className="flex items-center justify-between"><h2 className="text-lg font-black">{title}</h2><button onClick={onAdd} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black"><Plus className="h-4 w-4" />Add</button></div>{children}</section>;
}
