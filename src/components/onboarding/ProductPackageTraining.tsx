import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronRight, Loader2, RotateCcw, ShieldCheck, Store } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '../../lib/supabase';
import { trainingService, TrainingLesson, UserProgress } from '../../lib/trainingService';
import { useAcademyResumeSync } from '../../hooks/useAcademyResumeCheckpoint';

type Phase = 'lesson' | 'catalog' | 'knowledge' | 'scenario' | 'recommendation' | 'result';

type Product = {
  id: string;
  code: string;
  name: string;
  category: string;
  productType: string;
  priceMode: string;
  basePrice: number | string;
  currency: string;
  billingPeriod?: string | null;
  shortDescription?: string | null;
  scope?: string[];
  technology?: string | null;
  managerApprovalRequired?: boolean;
  sortOrder: number;
};

type Question = {
  id: string;
  prompt: string;
  options: string[];
  sortOrder: number;
  section: 'knowledge' | 'scenario' | 'recommendation';
  caseKey?: string;
};

type Feedback = {
  questionId: string;
  correct: boolean;
  critical: boolean;
  explanation: string;
  section: string;
  caseKey?: string;
};

type AssessmentResult = {
  score: number;
  passed: boolean;
  passingScore: number;
  criticalMisses: number;
  criticalPass: boolean;
  feedback: Feedback[];
  status: string;
};

type Props = {
  moduleId: string;
  moduleTitle: string;
  moduleDescription: string;
  lessons: TrainingLesson[];
  progress?: UserProgress;
  completed: boolean;
  onRefresh: () => Promise<void> | void;
  onExit: () => void;
};

const sectionOrder: Array<'knowledge' | 'scenario' | 'recommendation'> = ['knowledge', 'scenario', 'recommendation'];

function errorMessage(error: any, fallback: string) {
  return error?.message || fallback;
}

function formatMoney(product: Product) {
  if (product.priceMode === 'custom') return 'Custom quotation';
  const value = Number(product.basePrice || 0);
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: product.currency || 'USD',
    maximumFractionDigits: 0
  }).format(value);
  if (product.billingPeriod) return `${amount}/${product.billingPeriod}`;
  return product.priceMode === 'starting_at' ? `${amount}+` : amount;
}

function phaseTitle(phase: Phase) {
  if (phase === 'knowledge') return 'Product Knowledge';
  if (phase === 'scenario') return 'Customer-Fit Scenarios';
  if (phase === 'recommendation') return 'Recommendation Lab';
  return '';
}

function caseTitle(caseKey?: string) {
  if (caseKey === 'case-local-service') return 'Case 1 · Local Service Company';
  if (caseKey === 'case-growth-b2b') return 'Case 2 · Growing B2B Company';
  if (caseKey === 'case-clinic-system') return 'Case 3 · Clinic Operations';
  return 'Recommendation Case';
}

export default function ProductPackageTraining({
  moduleId,
  moduleTitle,
  moduleDescription,
  lessons,
  progress,
  completed,
  onRefresh,
  onExit
}: Props) {
  const [phase, setPhase] = useState<Phase>(progress?.status === 'Retry Required' ? 'knowledge' : 'lesson');
  const [lessonIndex, setLessonIndex] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [passingScore, setPassingScore] = useState(80);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('All');

  useEffect(() => {
    void loadTraining();
  }, [moduleId]);

  const loadTraining = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('get_product_package_training', { p_module_id: moduleId });
      if (rpcError) throw rpcError;
      const payload = (data || {}) as { products?: Product[]; questions?: Question[]; passingScore?: number };
      setProducts(payload.products || []);
      setQuestions(payload.questions || []);
      setPassingScore(Number(payload.passingScore || 80));
    } catch (err: any) {
      setError(errorMessage(err, 'Unable to load Product & Package Training.'));
    } finally {
      setLoading(false);
    }
  };

  useAcademyResumeSync(
    loading ? null : moduleId,
    !loading && !completed && !result,
    { phase, lessonIndex, questionIndex, answers, catalogCategory },
    checkpoint => {
      if (completed) return;
      if (progress?.status === 'Retry Required') {
        setPhase('knowledge');
        setQuestionIndex(0);
        setAnswers({});
        setLessonIndex(Math.max(lessons.length - 1, 0));
        return;
      }
      if (checkpoint) {
        if (['lesson', 'catalog', 'knowledge', 'scenario', 'recommendation'].includes(checkpoint.phase)) {
          setPhase(checkpoint.phase as Phase);
        }
        const savedLesson = Number(checkpoint.lessonIndex);
        if (Number.isInteger(savedLesson)) setLessonIndex(Math.max(0, Math.min(savedLesson, Math.max(lessons.length - 1, 0))));
        const savedQuestion = Number(checkpoint.questionIndex);
        if (Number.isInteger(savedQuestion)) setQuestionIndex(Math.max(0, savedQuestion));
        if (checkpoint.answers && typeof checkpoint.answers === 'object') setAnswers(checkpoint.answers);
        if (typeof checkpoint.catalogCategory === 'string') setCatalogCategory(checkpoint.catalogCategory);
        return;
      }

      // Backward-compatible resume for progress created before the checkpoint engine.
      const storedPercent = Number(progress?.progress_percent || 0);
      if (storedPercent >= 70) {
        setPhase('knowledge');
        setQuestionIndex(0);
        setLessonIndex(Math.max(lessons.length - 1, 0));
      } else if (storedPercent >= 65) {
        setPhase('catalog');
        setLessonIndex(Math.max(lessons.length - 1, 0));
      } else if (lessons.length > 0 && storedPercent > 10) {
        const totalSteps = lessons.length + 4;
        const inferredCompleted = Math.floor((storedPercent / 74) * totalSteps);
        setLessonIndex(Math.max(0, Math.min(inferredCompleted - 1, lessons.length - 1)));
      }
    }
  );

  const groupedProducts = useMemo(() => {
    const groups = new Map<string, Product[]>();
    products.forEach(product => {
      const key = product.category || 'Other';
      groups.set(key, [...(groups.get(key) || []), product]);
    });
    return groups;
  }, [products]);

  const categories = useMemo(() => ['All', ...Array.from(groupedProducts.keys())], [groupedProducts]);

  const visibleProducts = useMemo(() => {
    if (catalogCategory === 'All') return products;
    return products.filter(product => product.category === catalogCategory);
  }, [products, catalogCategory]);

  const currentQuestions = useMemo(() => {
    if (!sectionOrder.includes(phase as any)) return [];
    return questions.filter(question => question.section === phase);
  }, [questions, phase]);

  useEffect(() => {
    if (currentQuestions.length && questionIndex >= currentQuestions.length) setQuestionIndex(currentQuestions.length - 1);
  }, [currentQuestions.length, questionIndex]);

  const currentQuestion = currentQuestions[questionIndex];
  const totalSteps = lessons.length + 4;
  const stepNumber = phase === 'lesson'
    ? Math.min(lessonIndex + 1, Math.max(lessons.length, 1))
    : phase === 'catalog'
      ? lessons.length + 1
      : phase === 'knowledge'
        ? lessons.length + 2
        : phase === 'scenario'
          ? lessons.length + 3
          : lessons.length + 4;
  const percent = completed ? 100 : Math.min(100, Math.round((stepNumber / Math.max(totalSteps, 1)) * 100));

  const saveLearningProgress = async (targetPercent: number) => {
    if (!progress || completed) return;
    const { error: progressError } = await trainingService.updateProgress(progress.id, {
      progress_percent: Math.max(progress.progress_percent || 0, Math.min(targetPercent, 74))
    });
    if (progressError) throw progressError;
    await onRefresh();
  };

  const nextLesson = async () => {
    setSaving(true);
    setError('');
    try {
      if (lessonIndex < lessons.length - 1) {
        const next = lessonIndex + 1;
        setLessonIndex(next);
        await saveLearningProgress(Math.round(((next + 1) / totalSteps) * 74));
      } else {
        setPhase('catalog');
        await saveLearningProgress(65);
      }
    } catch (err: any) {
      setError(errorMessage(err, 'Unable to save your training progress.'));
    } finally {
      setSaving(false);
    }
  };

  const startAssessment = async () => {
    setSaving(true);
    setError('');
    try {
      if (completed) {
        onExit();
        return;
      }
      setPhase('knowledge');
      setQuestionIndex(0);
      await saveLearningProgress(70);
    } catch (err: any) {
      setError(errorMessage(err, 'Unable to start the product assessment.'));
    } finally {
      setSaving(false);
    }
  };

  const chooseAnswer = (questionId: string, index: number) => {
    setAnswers(current => ({ ...current, [questionId]: index }));
  };

  const nextQuestion = () => {
    if (!currentQuestion || answers[currentQuestion.id] == null) {
      setError('Choose the best answer before continuing.');
      return;
    }
    setError('');
    if (questionIndex < currentQuestions.length - 1) {
      setQuestionIndex(current => current + 1);
      return;
    }
    if (phase === 'knowledge') {
      setPhase('scenario');
      setQuestionIndex(0);
      return;
    }
    if (phase === 'scenario') {
      setPhase('recommendation');
      setQuestionIndex(0);
      return;
    }
    void submitAssessment();
  };

  const previousQuestion = () => {
    setError('');
    if (questionIndex > 0) {
      setQuestionIndex(current => current - 1);
      return;
    }
    if (phase === 'scenario') {
      setPhase('knowledge');
      setQuestionIndex(Math.max(questions.filter(q => q.section === 'knowledge').length - 1, 0));
    } else if (phase === 'recommendation') {
      setPhase('scenario');
      setQuestionIndex(Math.max(questions.filter(q => q.section === 'scenario').length - 1, 0));
    }
  };

  const submitAssessment = async () => {
    if (!progress) return;
    const ordered = [...questions].sort((a, b) => a.sortOrder - b.sortOrder);
    if (ordered.some(question => answers[question.id] == null)) {
      setError('Every product assessment question must be answered before submission.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data, error: submitError } = await supabase.rpc('submit_product_package_assessment', {
        p_progress_id: progress.id,
        p_answers: ordered.map(question => answers[question.id])
      });
      if (submitError) throw submitError;
      setResult(data as AssessmentResult);
      setPhase('result');
      await onRefresh();
    } catch (err: any) {
      setError(errorMessage(err, 'Unable to submit Product & Package Training assessment.'));
    } finally {
      setSaving(false);
    }
  };

  const retryAssessment = () => {
    setAnswers({});
    setResult(null);
    setQuestionIndex(0);
    setPhase('knowledge');
    setError('');
  };

  const reviewTraining = () => {
    setAnswers({});
    setResult(null);
    setQuestionIndex(0);
    setLessonIndex(0);
    setPhase('lesson');
    setError('');
  };

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
        <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-[#000080]" />
        <p className="text-sm font-medium text-slate-500">Loading Product & Package Training...</p>
      </div>
    );
  }

  const missedFeedback = (result?.feedback || []).filter(item => !item.correct);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#000080]">Module 3 · Product & Package Training</div>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">{moduleTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{moduleDescription}</p>
          </div>
          <div className="shrink-0 text-left md:text-right">
            <div className="text-sm font-black text-slate-900">Step {stepNumber} of {totalSteps}</div>
            <div className="mt-0.5 text-xs text-slate-400">{completed ? 'Completed · Review mode' : `${percent}% through this module · saved`}</div>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-[#000080] transition-all duration-300" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      {phase === 'lesson' && (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 md:px-8">
            <div className="text-[11px] font-black uppercase tracking-wider text-[#000080]">Training {lessonIndex + 1} of {lessons.length}</div>
            <h3 className="mt-1 text-lg font-bold text-slate-900">{lessons[lessonIndex]?.title || 'Product training'}</h3>
          </div>
          <div className="px-5 py-6 md:px-8 md:py-8">
            {lessons[lessonIndex] ? (
              <div className="prose prose-slate max-w-none text-sm leading-7 prose-headings:text-slate-950 prose-h1:text-2xl prose-h2:mt-8 prose-h2:text-xl prose-h3:text-lg prose-blockquote:border-[#000080] prose-blockquote:bg-blue-50/50 prose-blockquote:px-4 prose-blockquote:py-1 prose-blockquote:not-italic">
                <ReactMarkdown>{lessons[lessonIndex].content}</ReactMarkdown>
              </div>
            ) : <p className="text-sm text-slate-500">No training content is currently attached to this step.</p>}
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-8">
            <button type="button" onClick={() => setLessonIndex(value => Math.max(0, value - 1))} disabled={lessonIndex === 0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 disabled:opacity-40">
              <ArrowLeft className="h-4 w-4" /> Previous Training
            </button>
            <button type="button" onClick={() => void nextLesson()} disabled={saving || !lessons[lessonIndex]} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-6 py-3 text-xs font-bold text-white disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {lessonIndex < lessons.length - 1 ? 'Next Training' : 'Open Live Sales Catalog'}
              {!saving && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {phase === 'catalog' && (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 md:px-8">
            <div className="flex items-center gap-2 text-[#000080]"><Store className="h-5 w-5" /><span className="text-[11px] font-black uppercase tracking-wider">Live Admin Sales Catalog</span></div>
            <h3 className="mt-2 text-xl font-bold text-slate-900">Current products, scope & pricing</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">These values are loaded from the current Admin-controlled catalog. Use this screen as the commercial source of truth for new business—never an old screenshot or remembered price.</p>
          </div>
          <div className="px-5 py-6 md:px-8">
            <div className="mb-5 flex flex-wrap gap-2">
              {categories.map(category => (
                <button key={category} type="button" onClick={() => setCatalogCategory(category)} className={`rounded-full px-3 py-2 text-xs font-bold transition ${catalogCategory === category ? 'bg-[#000080] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-[#000080]/30'}`}>{category}</button>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {visibleProducts.map(product => (
                <article key={product.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{product.category}</div><h4 className="mt-1 text-sm font-black text-slate-900">{product.name}</h4></div>
                    <div className="shrink-0 text-right"><div className="text-sm font-black text-[#000080]">{formatMoney(product)}</div>{product.managerApprovalRequired && <div className="mt-1 text-[9px] font-black uppercase text-red-600">Approval required</div>}</div>
                  </div>
                  {product.shortDescription && <p className="mt-2 text-xs leading-5 text-slate-500">{product.shortDescription}</p>}
                  {!!product.scope?.length && <ul className="mt-3 space-y-1 text-xs text-slate-600">{product.scope.slice(0, 5).map(item => <li key={item}>• {item}</li>)}</ul>}
                  {product.technology && <div className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-400">Technology: {product.technology}</div>}
                </article>
              ))}
            </div>
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-between md:px-8">
            <button type="button" onClick={() => { setPhase('lesson'); setLessonIndex(Math.max(lessons.length - 1, 0)); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600"><ArrowLeft className="h-4 w-4" /> Back to Training</button>
            <button type="button" onClick={() => void startAssessment()} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-6 py-3 text-xs font-bold text-white disabled:opacity-50">{completed ? 'Back to Modules' : `Start Product Assessment · ${passingScore}% required`}<ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {(phase === 'knowledge' || phase === 'scenario' || phase === 'recommendation') && currentQuestion && (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 md:px-8">
            <div className="text-[11px] font-black uppercase tracking-wider text-[#000080]">{phaseTitle(phase)} · {questionIndex + 1} of {currentQuestions.length}</div>
            {phase === 'recommendation' && <div className="mt-1 text-xs font-bold text-slate-500">{caseTitle(currentQuestion.caseKey)}</div>}
            <h3 className="mt-3 text-lg font-bold leading-7 text-slate-900">{currentQuestion.prompt}</h3>
          </div>
          <div className="space-y-3 px-5 py-6 md:px-8">
            {currentQuestion.options.map((option, index) => {
              const selected = answers[currentQuestion.id] === index;
              return <button key={`${currentQuestion.id}-${index}`} type="button" onClick={() => chooseAnswer(currentQuestion.id, index)} className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left text-sm leading-6 transition ${selected ? 'border-[#000080] bg-blue-50/60 text-slate-950' : 'border-slate-200 text-slate-600 hover:border-[#000080]/30'}`}><span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${selected ? 'border-[#000080] bg-[#000080] text-white' : 'border-slate-300'}`}>{String.fromCharCode(65 + index)}</span><span>{option}</span></button>;
            })}
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-between md:px-8">
            <button type="button" onClick={previousQuestion} disabled={phase === 'knowledge' && questionIndex === 0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 disabled:opacity-40"><ArrowLeft className="h-4 w-4" /> Previous</button>
            <button type="button" onClick={nextQuestion} disabled={saving || answers[currentQuestion.id] == null} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-6 py-3 text-xs font-bold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{phase === 'recommendation' && questionIndex === currentQuestions.length - 1 ? 'Submit Assessment' : 'Next'}{!saving && <ChevronRight className="h-4 w-4" />}</button>
          </div>
        </div>
      )}

      {phase === 'result' && result && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex items-start gap-4">
            {result.passed ? <CheckCircle2 className="mt-0.5 h-8 w-8 shrink-0 text-emerald-600" /> : <ShieldCheck className="mt-0.5 h-8 w-8 shrink-0 text-amber-600" />}
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-[#000080]">Product Assessment Result</div>
              <h3 className="mt-1 text-2xl font-black text-slate-950">{result.passed ? 'Module 3 passed' : 'Review and retry'}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">Score: <strong className="text-slate-900">{result.score}%</strong> · Required: {result.passingScore}% · Critical rules: <strong className={result.criticalPass ? 'text-emerald-700' : 'text-red-700'}>{result.criticalPass ? 'Passed' : `${result.criticalMisses} missed`}</strong></p>
            </div>
          </div>

          {!result.passed && (
            <div className="mt-6 space-y-3">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">You must reach the overall passing score and answer every critical safety rule correctly. Completed training stays complete; only the assessment retry starts fresh.</div>
              {missedFeedback.map((item, index) => (
                <div key={`${item.questionId}-${index}`} className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Missed item {index + 1}{item.critical ? ' · Critical rule' : ''}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.explanation}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            {result.passed ? (
              <button type="button" onClick={onExit} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-6 py-3 text-xs font-bold text-white">Module Complete · Back to Academy <ChevronRight className="h-4 w-4" /></button>
            ) : (
              <><button type="button" onClick={reviewTraining} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-xs font-bold text-slate-600"><ArrowLeft className="h-4 w-4" /> Review Training</button><button type="button" onClick={retryAssessment} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-bold text-white"><RotateCcw className="h-4 w-4" /> Retry Assessment</button></>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
