import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  Save,
  Send,
  ShieldCheck,
  Video
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { trainingService, TrainingLesson, TrainingModule, UserProgress } from '../../lib/trainingService';
import { LoomOutreachConfig, loomOutreachTrainingService } from '../../lib/loomOutreachTrainingService';

interface LoomSubmissionWidgetProps {
  onSubmit?: (loomUrl: string, notes: string) => void;
  isSubmitting?: boolean;
}

type FormState = {
  companyName: string;
  prospectUrl: string;
  targetContact: string;
  targetRole: string;
  prospectSourceReference: string;
  evidenceUrl: string;
  observation: string;
  whyItMatters: string;
  idea: string;
  profoxFit: string;
  cta: string;
  loomUrl: string;
  durationSeconds: number;
  companionMessage: string;
  videoChecklist: {
    faceVisible: boolean;
    prospectContextShown: boolean;
    audioClear: boolean;
    cleanScreen: boolean;
    naturalDelivery: boolean;
  };
  integrity: {
    qualifiedProspect: boolean;
    verifiedObservation: boolean;
    factHypothesisDiscipline: boolean;
    noFabrication: boolean;
    noGuarantees: boolean;
    noUnauthorizedCommitment: boolean;
    notSentBeforeApproval: boolean;
    privacyProtected: boolean;
    oneIdeaOnly: boolean;
  };
};

const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#000080]';
const blankForm = (): FormState => ({
  companyName: '', prospectUrl: '', targetContact: '', targetRole: '', prospectSourceReference: '', evidenceUrl: '',
  observation: '', whyItMatters: '', idea: '', profoxFit: '', cta: '', loomUrl: '', durationSeconds: 45, companionMessage: '',
  videoChecklist: { faceVisible: false, prospectContextShown: false, audioClear: false, cleanScreen: false, naturalDelivery: false },
  integrity: {
    qualifiedProspect: false, verifiedObservation: false, factHypothesisDiscipline: false, noFabrication: false,
    noGuarantees: false, noUnauthorizedCommitment: false, notSentBeforeApproval: false, privacyProtected: false, oneIdeaOnly: false
  }
});

function errorText(error: any, fallback: string) { return error?.message || fallback; }

export default function LoomSubmissionWidget(_props: LoomSubmissionWidgetProps) {
  void _props;
  const { user } = useAuth();
  const [module, setModule] = useState<TrainingModule | null>(null);
  const [progress, setProgress] = useState<UserProgress | undefined>();
  const [lessons, setLessons] = useState<TrainingLesson[]>([]);
  const [config, setConfig] = useState<LoomOutreachConfig | null>(null);
  const [form, setForm] = useState<FormState>(blankForm());
  const [lessonIndex, setLessonIndex] = useState(0);
  const [view, setView] = useState<'learn' | 'assignment'>('learn');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const hydratedRef = useRef(false);

  const load = async () => {
    if (!user) return;
    setLoading(true); setError(''); hydratedRef.current = false;
    try {
      const [modulesRes, progressRes] = await Promise.all([
        trainingService.getModules(), trainingService.getUserProgress(user.id)
      ]);
      const target = (modulesRes.data || []).find(item => item.slug === 'loom-outreach');
      if (!target) throw new Error('Module 6 Personalized Loom Outreach was not found.');
      let current = (progressRes.data || []).find(item => item.module_id === target.id);
      if (!current) {
        const started = await trainingService.startModule(user.id, target.id);
        if (started.error || !started.data) throw started.error || new Error('Module 6 could not be started.');
        current = started.data;
      }
      const [lessonsRes, cfgRes] = await Promise.all([
        trainingService.getLessons(target.id), loomOutreachTrainingService.getConfig(target.id)
      ]);
      if (lessonsRes.error && (!lessonsRes.data || lessonsRes.data.length === 0)) throw lessonsRes.error;
      if (cfgRes.error || !cfgRes.data) throw cfgRes.error || new Error('Module 6 configuration is unavailable.');
      setModule(target); setProgress(current); setLessons(lessonsRes.data || []); setConfig(cfgRes.data);
      const draft = cfgRes.data.draftData;
      if (draft && typeof draft === 'object' && Object.keys(draft).length) {
        setForm(prev => ({ ...prev, ...draft, videoChecklist: { ...prev.videoChecklist, ...(draft.videoChecklist || {}) }, integrity: { ...prev.integrity, ...(draft.integrity || {}) } }));
      } else if (cfgRes.data.latestSubmission && current?.status !== 'Passed') {
        const previous = cfgRes.data.latestSubmission;
        setForm(prev => ({ ...prev, ...previous, loomUrl: '', videoChecklist: { ...prev.videoChecklist, ...(previous.videoChecklist || {}) }, integrity: { ...prev.integrity, ...(previous.integrity || {}), notSentBeforeApproval: false } }));
      }
      const completed = Number(cfgRes.data.lessonsCompleted || 0);
      setLessonIndex(Math.min(completed, Math.max((lessonsRes.data || []).length - 1, 0)));
      if ((lessonsRes.data || []).length > 0 && completed >= (lessonsRes.data || []).length) setView('assignment');
      Promise.resolve().then(() => { hydratedRef.current = true; });
    } catch (e: any) {
      setError(errorText(e, 'Module 6 could not be loaded.'));
    } finally { setLoading(false); }
  };

  useEffect(() => { if (user) void load(); }, [user?.id]);

  const lessonsDone = Boolean(config && lessons.length > 0 && config.lessonsCompleted >= lessons.length);
  const certified = progress?.status === 'Passed' || progress?.status === 'Completed';
  const underReview = progress?.status === 'Submitted';
  const allVideoChecks = Object.values(form.videoChecklist).every(Boolean);
  const allIntegrityChecks = Object.values(form.integrity).every(Boolean);
  const validLoom = /^https?:\/\/([a-z0-9-]+\.)?loom\.com\/(share|v)\//i.test(form.loomUrl.trim());
  const durationValid = Boolean(config && Number.isInteger(Number(form.durationSeconds)) && Number(form.durationSeconds) >= config.minDurationSeconds && Number(form.durationSeconds) <= config.maxDurationSeconds);
  const canSubmit = lessonsDone && validLoom && durationValid && allVideoChecks && allIntegrityChecks && !underReview && !certified;
  const targetTiming = config ? `${config.targetDurationMin}–${config.targetDurationMax}s target · ${config.minDurationSeconds}–${config.maxDurationSeconds}s accepted` : '';
  const latestReview = config?.latestReview;

  const patch = (updates: Partial<FormState>) => setForm(prev => ({ ...prev, ...updates }));

  useEffect(() => {
    if (!hydratedRef.current || !progress || view !== 'assignment' || underReview || certified) return;
    const timer = window.setTimeout(() => {
      void loomOutreachTrainingService.saveDraft(progress.id, form).then(({ error: e }) => {
        if (e) console.error('Loom certification auto-save failed:', e);
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [progress?.id, view, underReview, certified, form]);

  const completeLesson = async () => {
    if (!progress || !lessons[lessonIndex]) return;
    setBusy(true); setError(''); setMessage('');
    const { data, error: e } = await loomOutreachTrainingService.completeLesson(progress.id, lessons[lessonIndex].id);
    if (e) setError(errorText(e, 'Lesson progress could not be saved.'));
    else {
      const next = Number((data as any)?.lessonsCompleted || 0);
      setConfig(prev => prev ? { ...prev, lessonsCompleted: next } : prev);
      if (next >= lessons.length) {
        setView('assignment'); setMessage('Training complete. Now create your one-time certification Loom.');
      } else setLessonIndex(next);
      await refreshProgressOnly();
    }
    setBusy(false);
  };

  const refreshProgressOnly = async () => {
    if (!user || !module) return;
    const result = await trainingService.getUserProgress(user.id);
    setProgress((result.data || []).find(item => item.module_id === module.id));
  };

  const saveDraft = async () => {
    if (!progress) return;
    setBusy(true); setError(''); setMessage('');
    const { error: e } = await loomOutreachTrainingService.saveDraft(progress.id, form);
    if (e) setError(errorText(e, 'Draft could not be saved.'));
    else setMessage('Certification draft saved.');
    setBusy(false);
  };

  const submit = async () => {
    if (!progress || !config) return;
    if (!canSubmit) { setError('Complete all lessons, required fields, timing checks, recording checklist, and integrity acknowledgements before submitting.'); return; }
    setBusy(true); setError(''); setMessage('');
    const payload = { type: 'loom_outreach_v2', ...form, durationSeconds: Number(form.durationSeconds) };
    const { error: e } = await loomOutreachTrainingService.submit(progress.id, payload);
    if (e) setError(errorText(e, 'Certification Loom could not be submitted.'));
    else {
      setMessage('Certification Loom submitted for Admin review. Do not send this test video to the prospect while review is pending.');
      await load();
    }
    setBusy(false);
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  if (!module || !config) return <Notice danger>{error || 'Module 6 is unavailable.'}</Notice>;

  if (certified) return (
    <div className="space-y-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-8">
      <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-7 w-7 text-emerald-600" /><div>
        <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Module 6 Certified</div>
        <h2 className="mt-1 text-xl font-black text-emerald-950">Personalized Loom Outreach Passed</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-emerald-900">Your one-time onboarding Loom test has been approved. After you complete onboarding, you do <strong>not</strong> submit normal prospecting Loom videos for per-video Admin approval. Apply this standard independently in live outreach.</p>
        {latestReview?.totalScore !== undefined && <p className="mt-3 text-xs font-bold">Certification score: {latestReview.totalScore}/100</p>}
      </div></div>
    </div>
  );

  return <div className="space-y-6">
    <section className="rounded-3xl bg-gradient-to-r from-[#000080] to-[#FF0E0E] p-7 text-white shadow-xl">
      <div className="text-[10px] font-black uppercase tracking-[.2em] text-white/75">Module 6 · One-Time Onboarding Certification</div>
      <h2 className="mt-2 text-2xl font-black">Personalized Loom Outreach</h2>
      <p className="mt-2 max-w-3xl text-sm text-white/85">Learn a simple high-ticket video outreach system, create one personalized test Loom, and submit it for Admin approval before you represent ProFox independently.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-4"><Stat value={`${config.lessonsCompleted}/${lessons.length}`} label="Lessons"/><Stat value={targetTiming} label="Video Timing"/><Stat value="80/100" label="Pass Standard"/><Stat value="One Time" label="Approval Scope"/></div>
    </section>

    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
      <strong>Important:</strong> Admin approval is required for this certification video only. Once Module 6 is passed and your onboarding is completed, normal outreach Looms do not require ongoing per-video approval.
    </div>

    {latestReview?.status === 'Retry Required' && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <div className="font-black">Retry Required · {latestReview.totalScore ?? 0}/100</div>
      <p className="mt-1">Use the Admin feedback below, record a new version, and resubmit. Your completed lessons remain complete.</p>
      {latestReview.feedback && <p className="mt-2 rounded-xl bg-white/70 p-3 text-xs"><strong>Admin feedback:</strong> {latestReview.feedback}</p>}
    </div>}
    {error && <Notice danger>{error}</Notice>}{message && <Notice>{message}</Notice>}

    <div className="flex gap-2 rounded-2xl border bg-white p-1">
      <button onClick={() => setView('learn')} className={`flex-1 rounded-xl px-4 py-3 text-xs font-black ${view === 'learn' ? 'bg-[#000080] text-white' : 'text-slate-600'}`}>1. Learn the Outreach SOP</button>
      <button disabled={!lessonsDone} onClick={() => setView('assignment')} className={`flex-1 rounded-xl px-4 py-3 text-xs font-black ${view === 'assignment' ? 'bg-[#000080] text-white' : 'text-slate-600'} disabled:opacity-40`}>2. One-Time Video Certification</button>
    </div>

    {view === 'learn' && <section className="rounded-3xl border bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between"><div><div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">Lesson {lessonIndex + 1} of {lessons.length}</div><h3 className="mt-1 text-lg font-black">{lessons[lessonIndex]?.title}</h3></div><BookOpen className="h-6 w-6 text-[#000080]"/></div>
      <div className="prose prose-slate max-w-none rounded-2xl bg-slate-50 p-6 text-sm"><ReactMarkdown>{lessons[lessonIndex]?.content || ''}</ReactMarkdown></div>
      <div className="mt-5 flex items-center justify-between">
        <button disabled={lessonIndex === 0} onClick={() => setLessonIndex(i => Math.max(0, i - 1))} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold disabled:opacity-30"><ArrowLeft className="h-4 w-4"/>Previous</button>
        {lessonIndex < config.lessonsCompleted && <button onClick={() => setLessonIndex(i => Math.min(lessons.length - 1, i + 1))} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold">Review Next<ArrowRight className="h-4 w-4"/></button>}
        {lessonIndex === config.lessonsCompleted && !lessonsDone && <button disabled={busy} onClick={() => void completeLesson()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white">Mark Learned & Continue<ArrowRight className="h-4 w-4"/></button>}
      </div>
    </section>}

    {view === 'assignment' && <div className="space-y-6">
      {!underReview && <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold text-[#000080]">Draft auto-save is active. You can leave this page and continue your Loom certification later.</div>}
      {underReview && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-start gap-3"><Clock3 className="mt-0.5 h-5 w-5 text-amber-700"/><div><h3 className="text-sm font-black text-amber-950">Certification under Admin review</h3><p className="mt-1 text-xs text-amber-900">Do not send this training video to the prospect. Wait for Approve or Retry Required.</p>{config.latestSubmission?.loomUrl && <a href={config.latestSubmission.loomUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#000080]">Open submitted Loom<ExternalLink className="h-3.5 w-3.5"/></a>}</div></div></div>}

      <Section title="A. Prospect & research" subtitle="Use one genuinely qualified prospect and one evidence-backed observation.">
        <div className="grid gap-3 md:grid-cols-2"><Field label="Company name *"><input className={input} value={form.companyName} onChange={e => patch({ companyName: e.target.value })}/></Field><Field label="Prospect website / primary public URL *"><input type="url" className={input} value={form.prospectUrl} onChange={e => patch({ prospectUrl: e.target.value })} placeholder="https://..."/></Field><Field label="Target contact / stakeholder *"><input className={input} value={form.targetContact} onChange={e => patch({ targetContact: e.target.value })}/></Field><Field label="Role / title *"><input className={input} value={form.targetRole} onChange={e => patch({ targetRole: e.target.value })}/></Field><Field label="Module 5 / CRM / source reference *"><input className={input} value={form.prospectSourceReference} onChange={e => patch({ prospectSourceReference: e.target.value })} placeholder="CRM lead ID, Module 5 candidate ID, or source reference"/></Field><Field label="Evidence URL *"><input type="url" className={input} value={form.evidenceUrl} onChange={e => patch({ evidenceUrl: e.target.value })} placeholder="https://..."/></Field></div>
      </Section>

      <Section title="B. Build one outreach angle" subtitle="NOTICE → IMPACT → IDEA → INVITATION. Keep facts and hypotheses separate.">
        <div className="grid gap-3 md:grid-cols-2"><Field label="Verified observation *"><textarea rows={4} className={input} value={form.observation} onChange={e => patch({ observation: e.target.value })} placeholder="What did you actually see?"/></Field><Field label="Why it may matter *"><textarea rows={4} className={input} value={form.whyItMatters} onChange={e => patch({ whyItMatters: e.target.value })} placeholder="Use careful language; do not invent losses or internal problems."/></Field><Field label="One useful idea / direction *"><textarea rows={4} className={input} value={form.idea} onChange={e => patch({ idea: e.target.value })}/></Field><Field label="Low-pressure invitation / CTA *"><textarea rows={4} className={input} value={form.cta} onChange={e => patch({ cta: e.target.value })} placeholder="If useful, I can... / Worth exploring?"/></Field><Field label="Likely ProFox fit *"><select className={input} value={form.profoxFit} onChange={e => patch({ profoxFit: e.target.value })}><option value="">Select fit</option>{config.profoxFitOptions.map(option => <option key={option}>{option}</option>)}</select></Field></div>
      </Section>

      <Section title="C. Record the Loom" subtitle={`${targetTiming}. Hard maximum is ${config.maxDurationSeconds} seconds.`}>
        <div className="mb-4 grid gap-2 sm:grid-cols-4"><Mini title="NOTICE" text="0–5s · prove relevance"/><Mini title="IMPACT" text="5–20s · show observation"/><Mini title="IDEA" text="20–40s · useful direction"/><Mini title="INVITATION" text="40–50s · small next step"/></div>
        <div className="grid gap-3 md:grid-cols-2"><Field label="Loom share URL *"><div className="relative"><input type="url" className={`${input} pr-10`} value={form.loomUrl} onChange={e => patch({ loomUrl: e.target.value })} placeholder="https://www.loom.com/share/..."/>{validLoom && <a href={form.loomUrl} target="_blank" rel="noreferrer" className="absolute right-3 top-1/2 -translate-y-1/2 text-[#000080]"><ExternalLink className="h-4 w-4"/></a>}</div></Field><Field label="Video duration in seconds *"><input type="number" min={config.minDurationSeconds} max={config.maxDurationSeconds} className={input} value={form.durationSeconds} onChange={e => patch({ durationSeconds: Number(e.target.value) })}/><div className={`mt-1 text-[10px] font-bold ${durationValid ? 'text-emerald-600' : 'text-red-600'}`}>{durationValid ? `Within ${config.minDurationSeconds}–${config.maxDurationSeconds}s requirement` : `Must be ${config.minDurationSeconds}–${config.maxDurationSeconds} seconds`}</div></Field></div>
        <Field label="Companion outreach message *"><textarea rows={3} className={input} value={form.companionMessage} onChange={e => patch({ companionMessage: e.target.value })} placeholder="Keep this short. Do not repeat the full video."/></Field>
      </Section>

      <Section title="D. Recording quality checklist" subtitle="Confirm what is actually true in the video you are submitting.">
        <CheckGrid items={[
          ['faceVisible','My face is clearly visible.'],['prospectContextShown','The video clearly demonstrates real prospect context.'],['audioClear','Audio is clear and understandable.'],['cleanScreen','My screen is clean and contains no unrelated private information.'],['naturalDelivery','Delivery is natural; I am not reading a robotic script.']
        ]} values={form.videoChecklist} onChange={(key, value) => setForm(prev => ({ ...prev, videoChecklist: { ...prev.videoChecklist, [key]: value } }))}/>
      </Section>

      <Section title="E. Integrity & trust acknowledgement" subtitle="These rules protect the prospect, ProFox, and your credibility.">
        <CheckGrid items={[
          ['qualifiedProspect','I used a genuinely qualified prospect.'],['verifiedObservation','I independently verified the observation and evidence.'],['factHypothesisDiscipline','I kept facts, observations, hypotheses, and unknowns separate.'],['noFabrication','I did not fabricate facts, people, metrics, losses, or evidence.'],['noGuarantees','I made no unsupported guarantee or outcome promise.'],['noUnauthorizedCommitment','I made no unauthorized pricing, scope, timeline, legal, security, or delivery commitment.'],['notSentBeforeApproval','I have NOT sent this certification video to the real prospect.'],['privacyProtected','I did not expose private or confidential information.'],['oneIdeaOnly','The video focuses on one clear insight rather than a service dump.']
        ]} values={form.integrity} onChange={(key, value) => setForm(prev => ({ ...prev, integrity: { ...prev.integrity, [key]: value } }))}/>
      </Section>

      {!underReview && <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-xs text-slate-600"><ShieldCheck className="h-5 w-5 text-[#000080]"/><span>Passing this one test certifies the skill. Future outreach videos will not require per-video Admin approval.</span></div><div className="flex gap-2"><button disabled={busy} onClick={() => void saveDraft()} className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-black"><Save className="h-4 w-4"/>Save Now</button><button disabled={busy || !canSubmit} onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:opacity-40"><Send className="h-4 w-4"/>Submit One-Time Loom Test</button></div></div>}
    </div>}
  </div>;
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <section className="rounded-3xl border bg-white p-6 shadow-sm"><div className="mb-5"><h3 className="text-base font-black text-slate-900">{title}</h3><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div><div className="space-y-4">{children}</div></section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[11px] font-black text-slate-700">{label}</span>{children}</label>; }
function Stat({ value, label }: { value: string; label: string }) { return <div className="rounded-2xl border border-white/20 bg-white/10 p-3"><div className="text-sm font-black">{value}</div><div className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-white/70">{label}</div></div>; }
function Mini({ title, text }: { title: string; text: string }) { return <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black text-[#000080]">{title}</div><div className="mt-1 text-[10px] text-slate-500">{text}</div></div>; }
function Notice({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) { return <div className={`rounded-2xl border p-4 text-sm ${danger ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{children}</div>; }
function CheckGrid({ items, values, onChange }: { items: Array<[string,string]>; values: Record<string,boolean>; onChange: (key:string,value:boolean)=>void }) { return <div className="grid gap-2 md:grid-cols-2">{items.map(([key,label]) => <label key={key} className="flex cursor-pointer items-start gap-3 rounded-xl border bg-slate-50 p-3 text-xs text-slate-700"><input type="checkbox" checked={Boolean(values[key])} onChange={e => onChange(key,e.target.checked)} className="mt-0.5 h-4 w-4"/><span>{label}</span></label>)}</div>; }
