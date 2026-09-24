import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, ArrowRight, Award, BookOpen, FlaskConical, Loader2, ShieldCheck, Target, UserCheck } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { trainingService, TrainingLesson, TrainingModule, UserProgress } from '../../lib/trainingService';
import {
  FinalCertificationConfig,
  FinalCertificationJudgmentResult,
  FinalCertificationMission,
  finalCertificationService
} from '../../lib/finalCertificationService';

interface FinalCertificationViewProps {
  modules: TrainingModule[];
  progressList: UserProgress[];
  onSubmitExam?: (answers: number[]) => Promise<{ score: number; passed: boolean; error?: string }>;
  onRequestFinalApproval: () => void;
  isSubmitting?: boolean;
  userStatus?: string;
  onboardingStatus?: string;
}

type View = 'briefings' | 'missions' | 'judgment' | 'live' | 'result';
const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#000080] focus:ring-4 focus:ring-blue-100';
const phases = [
  { start: 1, end: 2, title: 'Certification Mindset' },
  { start: 3, end: 4, title: 'Diagnosis & Recommendation' },
  { start: 5, end: 6, title: 'Resistance & Decision' },
  { start: 7, end: 8, title: 'Commercial & Operational Truth' },
  { start: 9, end: 10, title: 'Trust & Final Rules' }
];
const messageFromError = (error: any, fallback: string) => error?.message || fallback;

export default function FinalCertificationView({
  modules,
  progressList,
  onRequestFinalApproval,
  isSubmitting = false,
  userStatus,
  onboardingStatus
}: FinalCertificationViewProps) {
  const { user } = useAuth();
  const [module, setModule] = useState<TrainingModule | null>(null);
  const [lessons, setLessons] = useState<TrainingLesson[]>([]);
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [config, setConfig] = useState<FinalCertificationConfig | null>(null);
  const [view, setView] = useState<View>('briefings');
  const [lessonIndex, setLessonIndex] = useState(0);
  const [missionIndex, setMissionIndex] = useState(0);
  const [missionPayload, setMissionPayload] = useState<Record<string, any>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [confirmJudgment, setConfirmJudgment] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);
  const [acks, setAcks] = useState<Record<string, boolean>>({});
  const [judgment, setJudgment] = useState<FinalCertificationJudgmentResult | null>(null);
  const [selfAssessment, setSelfAssessment] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const moduleResult = modules.length ? { data: modules, error: null } : await trainingService.getModules();
      if (moduleResult.error) throw moduleResult.error;
      const target = (moduleResult.data || []).find(item => item.slug === 'final-certification');
      if (!target) throw new Error('Final Certification module is unavailable.');
      setModule(target);

      let progressResult = await trainingService.getUserProgress(user.id);
      if (progressResult.error) throw progressResult.error;
      let currentProgress = (progressResult.data || []).find(item => item.module_id === target.id) || null;
      if (!currentProgress) {
        const started = await trainingService.startModule(user.id, target.id);
        if (started.error) throw started.error;
        progressResult = await trainingService.getUserProgress(user.id);
        if (progressResult.error) throw progressResult.error;
        currentProgress = (progressResult.data || []).find(item => item.module_id === target.id) || null;
      }
      if (!currentProgress) throw new Error('Final Certification progress could not be initialized.');
      setProgress(currentProgress);

      const [lessonResult, configResult] = await Promise.all([
        trainingService.getLessons(target.id),
        finalCertificationService.getConfig(target.id)
      ]);
      if (lessonResult.error) throw lessonResult.error;
      if (configResult.error || !configResult.data) throw configResult.error || new Error('Final Certification configuration is unavailable.');

      const loadedLessons = lessonResult.data || [];
      const loadedConfig = configResult.data;
      setLessons(loadedLessons);
      setConfig(loadedConfig);
      setLessonIndex(Math.min(loadedConfig.briefingsCompleted, Math.max(loadedLessons.length - 1, 0)));
      setMissionIndex(Math.min(loadedConfig.missionsCompleted, Math.max(loadedConfig.missions.length - 1, 0)));
      setAnswers(previous => previous.length === loadedConfig.questions.length ? previous : Array(loadedConfig.questions.length).fill(-1));
      setAcks(previous => Object.keys(previous).length ? previous : Object.fromEntries(loadedConfig.acknowledgements.map(item => [item.id, false])));

      if (currentProgress.status === 'Passed' || currentProgress.status === 'Completed') setView('result');
      else if (loadedConfig.briefingsCompleted < loadedLessons.length) setView('briefings');
      else if (loadedConfig.missionsCompleted < loadedConfig.missionCount) setView('missions');
      else if (!loadedConfig.judgmentPassed) setView('judgment');
      else setView('live');
    } catch (caught: any) {
      setError(messageFromError(caught, 'Final Certification could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [user?.id, modules.length]);
  useEffect(() => { setMissionPayload({}); }, [missionIndex, config?.missionsCompleted]);

  const requiredModules = modules.filter(item => item.required && item.slug !== 'final-certification');
  const completedPrereqs = requiredModules.filter(item => {
    const itemProgress = progressList.find(row => row.module_id === item.id);
    return itemProgress?.status === 'Passed' || itemProgress?.status === 'Completed';
  }).length;
  const requiredAcks = useMemo(() => config?.acknowledgements.filter(item => item.required) || [], [config]);
  const allAcks = requiredAcks.every(item => acks[item.id]);
  const allAnswered = !!config && answers.length === config.questions.length && answers.every(value => Number.isInteger(value) && value >= 0);
  const briefingsDone = !!config && lessons.length > 0 && config.briefingsCompleted >= lessons.length;
  const missionsDone = !!config && config.missionsCompleted >= config.missionCount;
  const currentMission = config?.missions[missionIndex];
  const currentQuestion = config?.questions[questionIndex];
  const phase = phases.find(item => lessonIndex + 1 >= item.start && lessonIndex + 1 <= item.end) || phases[phases.length - 1];
  const alreadyActive = userStatus === 'active' || onboardingStatus === 'completed';

  const completeBriefing = async () => {
    if (!progress || !lessons[lessonIndex]) return;
    setBusy(true); setError(''); setMessage('');
    const { data, error: saveError } = await finalCertificationService.completeBriefing(progress.id, lessons[lessonIndex].id);
    if (saveError) setError(messageFromError(saveError, 'Briefing progress could not be saved.'));
    else {
      const done = Number((data as any)?.briefingsCompleted || 0);
      setConfig(previous => previous ? { ...previous, briefingsCompleted: done } : previous);
      if (done >= lessons.length) {
        setView('missions'); setMissionIndex(0);
        setMessage('All 10 certification briefings are complete. The end-to-end deal simulation is unlocked.');
      } else setLessonIndex(done);
    }
    setBusy(false);
  };

  const submitMission = async () => {
    if (!progress || !currentMission || !config) return;
    setBusy(true); setError(''); setMessage('');
    const { data, error: saveError } = await finalCertificationService.submitMission(progress.id, currentMission.id, missionPayload);
    if (saveError) setError(messageFromError(saveError, 'Capstone mission could not be verified.'));
    else if (data) {
      setConfig(previous => previous ? { ...previous, missionsCompleted: data.missionsCompleted, sandboxSnapshot: data.sandboxSnapshot } : previous);
      setMissionPayload({});
      if (data.complete) {
        setView('judgment'); setQuestionIndex(0); setConfirmJudgment(false);
        setMessage('All 12 deal missions are verified. The final judgment gate is unlocked.');
      } else {
        setMissionIndex(data.missionsCompleted);
        setMessage(`Mission ${data.missionsCompleted} verified. Continue the Apex Roofing opportunity.`);
      }
    }
    setBusy(false);
  };

  const submitJudgment = async () => {
    if (!progress || !config) return;
    if (!allAnswered) { setError('Answer every final judgment scenario before submitting.'); return; }
    if (!allAcks) { setError('Confirm all eight final operating commitments.'); return; }
    setBusy(true); setError('');
    const acknowledgementIds = requiredAcks.filter(item => acks[item.id]).map(item => item.id);
    const { data, error: scoreError } = await finalCertificationService.submitJudgment(progress.id, answers, acknowledgementIds);
    if (scoreError) setError(messageFromError(scoreError, 'Final judgment certification could not be scored.'));
    else if (data) {
      setJudgment(data);
      await load();
      if (data.passed) setMessage('Judgment gate passed. Your live three-round certification is waiting for Management assignment.');
    }
    setBusy(false);
  };

  const submitSelfAssessment = async () => {
    if (!progress) return;
    const fields = ['strengths', 'clarityLoss', 'missedSignal', 'differentNextTime', 'developmentPriority'];
    if (fields.some(key => (selfAssessment[key] || '').trim().length < 20)) {
      setError('Give a thoughtful response of at least 20 characters to every self-assessment prompt.');
      return;
    }
    setBusy(true); setError('');
    const { error: submitError } = await finalCertificationService.submitSelfAssessment(progress.id, selfAssessment);
    if (submitError) setError(messageFromError(submitError, 'Self-assessment could not be submitted.'));
    else { setMessage('Self-assessment submitted. Management can now complete your live evaluation.'); await load(); }
    setBusy(false);
  };

  const retryJudgment = () => {
    if (!config) return;
    setAnswers(Array(config.questions.length).fill(-1));
    setAcks(Object.fromEntries(config.acknowledgements.map(item => [item.id, false])));
    setQuestionIndex(0); setConfirmJudgment(false); setJudgment(null); setError(''); setView('judgment');
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  if (!module || !config) return <Notice danger>{error || 'Module 20 is unavailable.'}</Notice>;

  if ((progress?.status === 'Passed' || progress?.status === 'Completed') && view === 'result') {
    return <div className="space-y-5">
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8">
        <div className="flex items-start gap-4">
          <Award className="h-9 w-9 shrink-0 text-emerald-600" />
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">Sales Academy Certified</div>
            <h2 className="mt-1 text-2xl font-black text-emerald-950">Module 20 — Final Certification Passed</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-900">You passed the briefings, 12 deal missions, 30-scenario judgment gate and live three-round Management evaluation. Certification does not activate production access; Final Approval remains separate.</p>
            <div className="mt-4 inline-flex rounded-xl bg-white px-4 py-2 text-sm font-black text-emerald-800">Final live score: {progress?.score ?? config.liveSession?.score ?? 0}/100</div>
            {!alreadyActive && <button disabled={isSubmitting} onClick={onRequestFinalApproval} className="ml-3 mt-4 rounded-xl bg-[#000080] px-5 py-2.5 text-xs font-black text-white disabled:opacity-40">Request Management Final Approval</button>}
          </div>
        </div>
      </section>
      <Framework value={config.framework} />
    </div>;
  }

  return <div className="space-y-6">
    <section className="rounded-3xl bg-gradient-to-r from-[#000080] to-[#FF0E0E] p-7 text-white shadow-xl">
      <div className="text-[10px] font-black uppercase tracking-[.2em] text-white/75">Module 20 · Sales Academy Capstone</div>
      <h2 className="mt-2 text-2xl font-black">Prove You Can Run the Sale.</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/85">Demonstrate independent judgment from research and outreach through discovery, recommendation, closing, commercial control, payment truth, CRM, calendar and confidentiality.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-5">
        <Stat value={`${config.briefingsCompleted}/${lessons.length}`} label="Briefings" />
        <Stat value={`${config.missionsCompleted}/${config.missionCount}`} label="Deal Missions" />
        <Stat value={`${config.passingScore}/100`} label="Each Scored Gate" />
        <Stat value="0" label="Critical Misses" />
        <Stat value={`${completedPrereqs}/${requiredModules.length}`} label="Prior Modules" />
      </div>
    </section>
    <Framework value={config.framework} />
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-black">Complete operating readiness</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mini label="Execution" value={config.operatingStandard?.execution || ''} />
        <Mini label="Commercial truth" value={config.operatingStandard?.commercialTruth || ''} />
        <Mini label="Operational truth" value={config.operatingStandard?.operationalTruth || ''} />
        <Mini label="Activation boundary" value={config.operatingStandard?.activation || ''} />
      </div>
    </section>
    {error && <Notice danger>{error}</Notice>}
    {message && <Notice>{message}</Notice>}
    {judgment && !judgment.passed && <Notice danger><strong>Judgment retry required:</strong> {judgment.score}/100 with {judgment.criticalMisses} critical miss(es). Briefings and deal missions remain complete.</Notice>}

    <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-1 md:grid-cols-4">
      <Tab active={view === 'briefings'} onClick={() => setView('briefings')}>1. Certification Briefings</Tab>
      <Tab active={view === 'missions'} disabled={!briefingsDone} onClick={() => setView('missions')}>2. End-to-End Deal</Tab>
      <Tab active={view === 'judgment'} disabled={!missionsDone} onClick={() => { setView('judgment'); setConfirmJudgment(false); }}>3. Judgment Gate</Tab>
      <Tab active={view === 'live'} disabled={!config.judgmentPassed} onClick={() => setView('live')}>4. Live Certification</Tab>
    </div>

    {view === 'briefings' && lessons[lessonIndex] && <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div><div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">{phase.title} · Briefing {lessonIndex + 1} of {lessons.length}</div><h3 className="mt-1 text-lg font-black">{lessons[lessonIndex].title}</h3></div>
        <BookOpen className="h-6 w-6 text-[#000080]" />
      </div>
      <div className="prose prose-slate max-w-none rounded-2xl bg-slate-50 p-6 text-sm leading-7"><ReactMarkdown>{lessons[lessonIndex].content || ''}</ReactMarkdown></div>
      <div className="mt-5 flex justify-between gap-3">
        <button disabled={lessonIndex === 0} onClick={() => setLessonIndex(index => Math.max(0, index - 1))} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold disabled:opacity-30"><ArrowLeft className="h-4 w-4" />Previous</button>
        {lessonIndex < config.briefingsCompleted
          ? <button onClick={() => setLessonIndex(index => Math.min(lessons.length - 1, index + 1))} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold">Review Next<ArrowRight className="h-4 w-4" /></button>
          : !briefingsDone && <button disabled={busy} onClick={() => void completeBriefing()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:opacity-40">I Understand & Can Apply It<ArrowRight className="h-4 w-4" /></button>}
      </div>
    </section>}

    {view === 'missions' && currentMission && <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">Apex Roofing · Mission {missionIndex + 1} of {config.missionCount}</div><h3 className="mt-1 text-xl font-black">{currentMission.title}</h3><p className="mt-2 text-sm text-slate-600">{currentMission.objective}</p></div><FlaskConical className="h-7 w-7 text-[#000080]" /></div>
      <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-950"><strong>Capstone sandbox:</strong> {currentMission.instructions} Nothing here creates or changes a live customer, opportunity, quotation, payment or meeting.</div>
      <Scenario mission={currentMission} />
      <MissionForm mission={currentMission} value={missionPayload} onChange={setMissionPayload} catalog={config.salesCatalog} />
      <div className="mt-6 flex items-center justify-between gap-4 border-t pt-5"><span className="text-xs text-slate-500">The server verifies sequence, catalog truth and critical decisions before unlocking the next mission.</span><button disabled={busy} onClick={() => void submitMission()} className="rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:opacity-40">Verify Mission & Continue</button></div>
    </section>}

    {view === 'judgment' && !confirmJudgment && currentQuestion && <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">Final situation {questionIndex + 1} of {config.questions.length}</div><h3 className="mt-2 max-w-4xl text-base font-black leading-6">{currentQuestion.prompt}</h3></div><Target className="h-6 w-6 text-[#000080]" /></div>
      <div className="mt-5 grid gap-3">{currentQuestion.options.map((option, optionIndex) => <button key={optionIndex} type="button" onClick={() => setAnswers(previous => previous.map((value, index) => index === questionIndex ? optionIndex : value))} className={`rounded-2xl border p-4 text-left text-sm ${answers[questionIndex] === optionIndex ? 'border-[#000080] bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200'}`}><b className="mr-2">{String.fromCharCode(65 + optionIndex)}.</b>{option}</button>)}</div>
      <div className="mt-6 flex justify-between"><button disabled={questionIndex === 0} onClick={() => setQuestionIndex(index => Math.max(0, index - 1))} className="rounded-xl border px-4 py-2.5 text-xs font-bold disabled:opacity-30">Previous</button>{questionIndex < config.questions.length - 1 ? <button disabled={answers[questionIndex] < 0} onClick={() => setQuestionIndex(index => index + 1)} className="rounded-xl bg-[#000080] px-5 py-2.5 text-xs font-black text-white disabled:opacity-40">Next Situation</button> : <button disabled={!allAnswered} onClick={() => setConfirmJudgment(true)} className="rounded-xl bg-[#000080] px-5 py-2.5 text-xs font-black text-white disabled:opacity-40">Review Final Commitments</button>}</div>
    </section>}

    {view === 'judgment' && confirmJudgment && <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex gap-3"><ShieldCheck className="h-7 w-7 text-[#000080]" /><div><h3 className="text-lg font-black">Final Operating Commitments</h3><p className="text-sm text-slate-500">All eight are required. Judgment requires 90/100 and zero critical misses.</p></div></div>
      <div className="mt-5 space-y-3">{config.acknowledgements.map(item => <label key={item.id} className="flex gap-3 rounded-2xl border bg-slate-50 p-4 text-sm"><input type="checkbox" checked={!!acks[item.id]} onChange={event => setAcks(previous => ({ ...previous, [item.id]: event.target.checked }))} /><span>{item.statement}</span></label>)}</div>
      <div className="mt-6 flex justify-between"><button onClick={() => setConfirmJudgment(false)} className="rounded-xl border px-4 py-2.5 text-xs font-bold">Back to Scenarios</button><button disabled={busy || !allAcks} onClick={() => void submitJudgment()} className="rounded-xl bg-[#000080] px-6 py-3 text-xs font-black text-white disabled:opacity-40">{busy ? 'Scoring...' : 'Submit Final Judgment Gate'}</button></div>
    </section>}

    {view === 'live' && <LiveStage config={config} selfAssessment={selfAssessment} setSelfAssessment={setSelfAssessment} submitSelfAssessment={submitSelfAssessment} busy={busy} />}
    {judgment && !judgment.passed && view === 'judgment' && <div className="flex justify-center"><button onClick={retryJudgment} className="rounded-xl border border-[#000080] px-5 py-2.5 text-xs font-black text-[#000080]">Retry Judgment Scenarios</button></div>}
  </div>;
}

function LiveStage({ config, selfAssessment, setSelfAssessment, submitSelfAssessment, busy }: any) {
  const session = config.liveSession;
  if (!session) return <Notice>Judgment passed. A fresh live certification session is being prepared.</Notice>;
  const prompts = [
    ['strengths', 'What did you do well?'],
    ['clarityLoss', 'Where did you lose clarity?'],
    ['missedSignal', 'Which buyer signal did you nearly miss?'],
    ['differentNextTime', 'What would you do differently next time?'],
    ['developmentPriority', 'What is your single biggest sales-development priority?']
  ];
  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">Live Capstone · Attempt {session.attemptNo}</div><h3 className="mt-1 text-xl font-black">Three-Round Buyer Simulation — {session.caseName}</h3><p className="mt-2 text-sm text-slate-600">Round 1: Discovery · Round 2: Recommendation, Objection & Close · Round 3: Rapid Operational Judgment.</p></div><UserCheck className="h-7 w-7 text-[#000080]" /></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><Mini label="Status" value={String(session.status || 'pending').replaceAll('_', ' ')} /><Mini label="Evaluator" value={session.evaluatorName || 'Waiting for Management assignment'} /><Mini label="Scheduled" value={session.scheduledStartAt ? new Date(session.scheduledStartAt).toLocaleString() : 'Not scheduled yet'} /><Mini label="Meeting" value={session.meetingUrl || 'Management will provide the meeting link'} /></div>
    <div className="mt-5 rounded-2xl bg-slate-50 p-5"><div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">Seller Brief</div><pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">{Object.entries(session.sellerBrief || {}).map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`).join('\n')}</pre></div>
    {session.status === 'awaiting_self_assessment' && !session.selfAssessmentSubmitted && <div className="mt-6"><h4 className="font-black">Private self-assessment before evaluator results</h4><p className="mt-1 text-xs text-slate-500">Reflect before seeing the evaluator score. This is part of independent seller development.</p><div className="mt-4 space-y-4">{prompts.map(([key, label]) => <label key={key} className="block text-xs font-bold text-slate-700">{label}<textarea value={selfAssessment[key] || ''} onChange={event => setSelfAssessment((previous: any) => ({ ...previous, [key]: event.target.value }))} className={`${input} mt-2 min-h-24`} /></label>)}</div><button disabled={busy} onClick={() => void submitSelfAssessment()} className="mt-5 rounded-xl bg-[#000080] px-6 py-3 text-xs font-black text-white disabled:opacity-40">Submit Self-Assessment</button></div>}
    {session.status === 'awaiting_evaluation' && <Notice>Your reflection is locked. Management can now complete the 100-point live evaluation.</Notice>}
    {session.status === 'scheduled' && <Notice>Prepare from the seller brief, join on time, and treat the simulation exactly like a real buyer conversation.</Notice>}
    {session.status === 'retry_required' && <Notice danger>Live retry required. Your judgment gate remains passed; a fresh buyer case is being prepared.</Notice>}
  </section>;
}

function MissionForm({ mission, value, onChange, catalog }: { mission: FinalCertificationMission; value: Record<string, any>; onChange: React.Dispatch<React.SetStateAction<Record<string, any>>>; catalog: any[] }) {
  const set = (key: string, next: any) => onChange(previous => ({ ...previous, [key]: next }));
  const area = (key: string, placeholder: string) => <textarea key={key} value={value[key] || ''} onChange={event => set(key, event.target.value)} placeholder={placeholder} className={`${input} min-h-24`} />;
  switch (mission.missionKey) {
    case 'research_account': return <Grid>{area('businessFacts', 'Verified business facts')}{area('personalization', 'Useful personalization observations')}{area('unknowns', 'Important unknowns')}{area('assumptionsToAvoid', 'What must not be assumed')}</Grid>;
    case 'qualify_prospect': return <Grid><Select value={value.decision} set={next => set('decision', next)} options={['pursue', 'nurture', 'disqualify']} />{area('rationale', 'Explain the qualification decision')}</Grid>;
    case 'personalized_outreach': return <Grid>{area('observation', 'Specific observation')}{area('relevance', 'Why it matters')}{area('value', 'Value direction without overpromising')}{area('cta', 'Low-friction CTA')}</Grid>;
    case 'handle_reply_book': return <Grid>{area('reply', 'Reply to Sarah without overpitching')}<Select value={value.meetingType} set={next => set('meetingType', next)} options={['Discovery', 'Proposal Review', 'Follow-Up']} /><input className={input} value={value.buyerTimezone || ''} onChange={event => set('buyerTimezone', event.target.value)} placeholder="Buyer timezone" />{area('nextAction', 'Exact next action + owner + date/purpose')}</Grid>;
    case 'prepare_discovery': return <Grid>{area('known', 'What we know')}{area('unknowns', 'What we still need to learn')}{area('questions', 'High-value discovery questions')}{area('objective', 'Meeting objective')}{area('desiredNextStep', 'Desired legitimate next step')}</Grid>;
    case 'conduct_discovery': return <Grid>{['current', 'gap', 'impact', 'outcome', 'whyNow', 'decisionProcess', 'fit', 'nextStep'].map(key => area(key, key.replace(/([A-Z])/g, ' $1')))}</Grid>;
    case 'recommend_solution': return <Grid><select className={input} value={value.productCode || ''} onChange={event => set('productCode', event.target.value)}><option value="">Choose from live Sales Catalog</option>{catalog.filter((item: any) => ['package', 'discovery'].includes(item.productType)).map((item: any) => <option key={item.code} value={item.code}>{item.name} — {item.code}</option>)}</select>{area('rationale', 'Connect recommendation to discovered outcomes and note what still needs validation')}</Grid>;
    case 'handle_objection': return <Grid>{['clarify', 'validate', 'isolate', 'respond', 'confirm', 'nextStep'].map(key => area(key, key))}</Grid>;
    case 'close_real_decision': return <Grid><Select value={value.decision} set={next => set('decision', next)} options={['schedule_decision_maker_review', 'mark_closed_won', 'send_discount']} />{area('commitment', 'Describe the legitimate buyer commitment and next meeting')}</Grid>;
    case 'commercial_path': return <Grid><select className={input} value={value.productCode || ''} onChange={event => set('productCode', event.target.value)}><option value="">Use prior live-catalog recommendation</option>{catalog.filter((item: any) => ['package', 'discovery'].includes(item.productType)).map((item: any) => <option key={item.code} value={item.code}>{item.name}</option>)}</select><Select value={value.route} set={next => set('route', next)} options={['catalog_auto', 'manager_review']} />{area('paymentTerms', 'State the payment structure from the live catalog/approved quotation path')}</Grid>;
    case 'payment_judgment': return <Grid><Select value={value.decision} set={next => set('decision', next)} options={['wait_for_verified_payment', 'mark_won_from_customer_message', 'start_project_now']} />{area('customerResponse', 'How you preserve momentum while protecting financial truth')}</Grid>;
    case 'final_crm_handoff': return <Grid>{area('companyContact', 'Correct company/contact/stakeholders')}{area('leadSourceStage', 'Truthful lead source and current stage')}{area('commercialState', 'Quotation/payment state')}{area('nextAction', 'Action + owner + date + purpose')}{area('handoffSummary', 'Complete handoff another authorized teammate can continue from')}</Grid>;
    default: return area('notes', 'Complete the mission response');
  }
}

function Scenario({ mission }: { mission: FinalCertificationMission }) {
  const entries = Object.entries(mission.scenarioData || {});
  if (!entries.length) return null;
  return <div className="mt-5 grid gap-2 sm:grid-cols-2">{entries.map(([key, value]) => <div key={key} className="rounded-xl border bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{key.replace(/([A-Z])/g, ' $1')}</div><div className="mt-1 text-xs font-semibold text-slate-700">{typeof value === 'string' ? value : JSON.stringify(value)}</div></div>)}</div>;
}
function Select({ value, set, options }: { value?: string; set: (value: string) => void; options: string[] }) { return <select className={input} value={value || ''} onChange={event => set(event.target.value)}><option value="">Choose the best action</option>{options.map(option => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}</select>; }
function Grid({ children }: { children: React.ReactNode }) { return <div className="mt-5 grid gap-3 md:grid-cols-2">{children}</div>; }
function Framework({ value }: { value: string }) { return <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4"><div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">Final operating framework</div><div className="mt-1 text-sm font-black text-blue-950">{value}</div></section>; }
function Stat({ value, label }: { value: string; label: string }) { return <div className="rounded-2xl border border-white/20 bg-white/10 p-3"><div className="text-lg font-black">{value}</div><div className="text-[9px] font-bold uppercase tracking-wider text-white/70">{label}</div></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</div><div className="mt-1 text-xs font-semibold leading-5 text-slate-700">{value}</div></div>; }
function Tab({ children, active, disabled, onClick }: any) { return <button disabled={disabled} onClick={onClick} className={`rounded-xl px-4 py-3 text-xs font-black ${active ? 'bg-[#000080] text-white' : 'text-slate-600 hover:bg-slate-50'} disabled:opacity-30`}>{children}</button>; }
function Notice({ children, danger = false }: any) { return <div className={`rounded-2xl border p-4 text-sm ${danger ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>{children}</div>; }
