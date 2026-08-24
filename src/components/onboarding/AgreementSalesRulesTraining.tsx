import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, ChevronRight, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '../../lib/supabase';
import { trainingService, TrainingLesson, UserProgress } from '../../lib/trainingService';
import { useAcademyResumeSync } from '../../hooks/useAcademyResumeCheckpoint';

type Phase = 'lesson' | 'assessment' | 'acknowledgement';

interface AssessmentQuestion {
  id: string;
  prompt: string;
  options: string[];
  sortOrder: number;
}

interface AcknowledgementItem {
  id: string;
  statement: string;
  sortOrder: number;
  required: boolean;
}

interface AssessmentFeedback {
  questionId: string;
  correct: boolean;
  explanation: string;
}

interface AssessmentResult {
  score: number;
  passed: boolean;
  passingScore: number;
  feedback: AssessmentFeedback[];
  status: string;
}

interface Props {
  moduleId: string;
  moduleTitle: string;
  moduleDescription: string;
  lessons: TrainingLesson[];
  progress?: UserProgress;
  completed: boolean;
  onRefresh: () => Promise<void> | void;
  onExit: () => void;
}

function errorMessage(error: any, fallback: string) {
  return error?.message || fallback;
}

export default function AgreementSalesRulesTraining({
  moduleId,
  moduleTitle,
  moduleDescription,
  lessons,
  progress,
  completed,
  onRefresh,
  onExit
}: Props) {
  const totalSteps = lessons.length + 2;
  const initialLessonIndex = Math.max(
    0,
    Math.min(
      Math.max(lessons.length - 1, 0),
      Math.floor(((progress?.progress_percent || 0) / 100) * Math.max(totalSteps, 1))
    )
  );

  const [phase, setPhase] = useState<Phase>(
    progress?.status === 'Retry Required'
      ? 'assessment'
      : !completed && progress?.score && progress.score >= 90
        ? 'acknowledgement'
        : 'lesson'
  );
  const [lessonIndex, setLessonIndex] = useState(initialLessonIndex);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [passingScore, setPassingScore] = useState(90);
  const [acknowledgements, setAcknowledgements] = useState<AcknowledgementItem[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [checkedAcks, setCheckedAcks] = useState<Record<string, boolean>>({});
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResult | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadConfig();
  }, [moduleId]);

  useEffect(() => {
    if (!completed && progress?.score != null && progress.score >= passingScore && phase === 'lesson') {
      setPhase('acknowledgement');
    }
  }, [completed, progress?.score, passingScore, phase]);

  const loadConfig = async () => {
    setLoadingConfig(true);
    setError('');
    try {
      const [assessmentRes, acknowledgementRes] = await Promise.all([
        supabase.rpc('get_training_module_assessment', { p_module_id: moduleId }),
        supabase.rpc('get_training_module_acknowledgements', { p_module_id: moduleId })
      ]);
      if (assessmentRes.error) throw assessmentRes.error;
      if (acknowledgementRes.error) throw acknowledgementRes.error;

      const payload = (assessmentRes.data || {}) as { passingScore?: number; questions?: AssessmentQuestion[] };
      const loadedQuestions = payload.questions || [];
      setPassingScore(Number(payload.passingScore || 90));
      setQuestions(loadedQuestions);
      setAnswers(Array(loadedQuestions.length).fill(-1));
      setAcknowledgements((acknowledgementRes.data || []) as AcknowledgementItem[]);
    } catch (err: any) {
      setError(errorMessage(err, 'Unable to load the Agreement & Sales Rules assessment.'));
    } finally {
      setLoadingConfig(false);
    }
  };

  useAcademyResumeSync(
    loadingConfig ? null : moduleId,
    !loadingConfig && !completed && !assessmentResult,
    { phase, lessonIndex, questionIndex, answers, checkedAcks },
    checkpoint => {
      if (!checkpoint) return;
      const passedAssessment = progress?.score != null && progress.score >= passingScore;
      if (passedAssessment) {
        setPhase('acknowledgement');
      } else if (progress?.status === 'Retry Required') {
        setPhase('assessment');
      } else if (['lesson', 'assessment', 'acknowledgement'].includes(checkpoint.phase)) {
        setPhase(checkpoint.phase as Phase);
      }
      const savedLesson = Number(checkpoint.lessonIndex);
      if (Number.isInteger(savedLesson)) setLessonIndex(Math.max(0, Math.min(savedLesson, Math.max(lessons.length - 1, 0))));
      const savedQuestion = Number(checkpoint.questionIndex);
      if (Number.isInteger(savedQuestion)) setQuestionIndex(Math.max(0, Math.min(savedQuestion, Math.max(questions.length - 1, 0))));
      if (!passedAssessment && progress?.status !== 'Retry Required' && Array.isArray(checkpoint.answers) && checkpoint.answers.length === questions.length) {
        setAnswers(checkpoint.answers.map((value: any) => Number.isInteger(value) ? value : -1));
      }
      if (checkpoint.checkedAcks && typeof checkpoint.checkedAcks === 'object') setCheckedAcks(checkpoint.checkedAcks);
    }
  );

  const currentStep = phase === 'lesson'
    ? Math.min(lessonIndex + 1, Math.max(lessons.length, 1))
    : phase === 'assessment'
      ? lessons.length + 1
      : lessons.length + 2;

  const stepPercent = Math.round((currentStep / Math.max(totalSteps, 1)) * 100);
  const currentLesson = lessons[lessonIndex];
  const currentQuestion = questions[questionIndex];
  const requiredAcks = useMemo(() => acknowledgements.filter(item => item.required), [acknowledgements]);
  const allRequiredConfirmed = requiredAcks.every(item => checkedAcks[item.id]);

  const saveProgressPercent = async (percent: number) => {
    if (!progress || completed) return;
    const { error: progressError } = await trainingService.updateProgress(progress.id, {
      progress_percent: Math.max(progress.progress_percent || 0, Math.min(percent, 89))
    });
    if (progressError) throw progressError;
    await onRefresh();
  };

  const nextLesson = async () => {
    if (!currentLesson) return;
    setSaving(true);
    setError('');
    try {
      if (lessonIndex < lessons.length - 1) {
        const next = lessonIndex + 1;
        setLessonIndex(next);
        await saveProgressPercent(Math.round(((next + 1) / Math.max(totalSteps, 1)) * 100));
      } else if (completed) {
        onExit();
      } else {
        setPhase('assessment');
        setQuestionIndex(0);
        await saveProgressPercent(Math.round((lessons.length / Math.max(totalSteps, 1)) * 100));
      }
    } catch (err: any) {
      setError(errorMessage(err, 'Unable to save your training progress.'));
    } finally {
      setSaving(false);
    }
  };

  const previousLesson = () => {
    if (lessonIndex > 0) setLessonIndex(previous => previous - 1);
  };

  const submitAssessment = async () => {
    if (!progress) return;
    if (answers.some(answer => answer < 0)) {
      setError('Please answer every scenario before submitting the knowledge check.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const { data, error: submitError } = await supabase.rpc('submit_training_module_assessment', {
        p_progress_id: progress.id,
        p_answers: answers
      });
      if (submitError) throw submitError;
      const result = data as AssessmentResult;
      setAssessmentResult(result);
      await onRefresh();
    } catch (err: any) {
      setError(errorMessage(err, 'Unable to submit the knowledge check.'));
    } finally {
      setSaving(false);
    }
  };

  const continueAfterAssessment = () => {
    if (!assessmentResult?.passed) return;
    setAssessmentResult(null);
    setPhase('acknowledgement');
    setError('');
  };

  const reviewTrainingAgain = () => {
    setPhase('lesson');
    setLessonIndex(0);
    setQuestionIndex(0);
    setAnswers(Array(questions.length).fill(-1));
    setAssessmentResult(null);
    setError('');
  };

  const completeAcknowledgement = async () => {
    if (!progress || !allRequiredConfirmed) return;
    setSaving(true);
    setError('');
    try {
      const selectedIds = acknowledgements.filter(item => checkedAcks[item.id]).map(item => item.id);
      const { error: completionError } = await supabase.rpc('complete_training_module_acknowledgement', {
        p_progress_id: progress.id,
        p_ack_ids: selectedIds
      });
      if (completionError) throw completionError;
      await onRefresh();
      onExit();
    } catch (err: any) {
      setError(errorMessage(err, 'Unable to complete the rules acknowledgement.'));
    } finally {
      setSaving(false);
    }
  };

  if (loadingConfig) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
        <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-[#000080]" />
        <p className="text-sm font-medium text-slate-500">Loading Agreement & Sales Rules...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#000080]">Module 2 · Agreement & Sales Rules</div>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">{moduleTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{moduleDescription}</p>
          </div>
          <div className="shrink-0 text-left md:text-right">
            <div className="text-sm font-black text-slate-900">Step {currentStep} of {totalSteps}</div>
            <div className="mt-0.5 text-xs text-slate-400">{completed ? 'Completed · Review mode' : `${stepPercent}% through this module`}</div>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-[#000080] transition-all duration-300" style={{ width: `${completed ? 100 : stepPercent}%` }} />
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
      )}

      {phase === 'lesson' && (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 md:px-8">
            <div className="text-[11px] font-black uppercase tracking-wider text-[#000080]">Training {lessonIndex + 1} of {lessons.length}</div>
            <h3 className="mt-1 text-lg font-bold text-slate-900">{currentLesson?.title || 'Training content'}</h3>
          </div>

          <div className="px-5 py-6 md:px-8 md:py-8">
            {currentLesson ? (
              <div className="prose prose-slate max-w-none text-sm leading-7 prose-headings:text-slate-950 prose-h1:text-2xl prose-h2:mt-8 prose-h2:text-xl prose-h3:text-lg prose-blockquote:border-[#000080] prose-blockquote:bg-blue-50/50 prose-blockquote:px-4 prose-blockquote:py-1 prose-blockquote:not-italic">
                <ReactMarkdown>{currentLesson.content}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No training content is currently attached to this step.</p>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-8">
            <button
              type="button"
              onClick={previousLesson}
              disabled={lessonIndex === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" /> Previous Training
            </button>
            <button
              type="button"
              onClick={() => void nextLesson()}
              disabled={saving || !currentLesson}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-6 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#000066] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {lessonIndex < lessons.length - 1 ? 'Next Training' : completed ? 'Back to Modules' : 'Start Knowledge Check'}
              {!saving && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {phase === 'assessment' && (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 md:px-8">
            <div className="text-[11px] font-black uppercase tracking-wider text-[#000080]">Knowledge Check · Step {lessons.length + 1} of {totalSteps}</div>
            <h3 className="mt-1 text-xl font-bold text-slate-900">10 High-Ticket Sales Scenarios</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">Apply the rules to realistic situations. You need {passingScore}% to continue. If you leave before submitting, your unfinished answers and current scenario are saved.</p>
          </div>

          {!assessmentResult && currentQuestion && (
            <div className="px-5 py-6 md:px-8 md:py-8">
              <div className="mb-5 flex items-center justify-between gap-3">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">Scenario {questionIndex + 1} of {questions.length}</span>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-[#000080]">Progress saved</span>
              </div>
              <h4 className="text-lg font-bold leading-7 text-slate-950">{currentQuestion.prompt}</h4>

              <div className="mt-6 space-y-3">
                {currentQuestion.options.map((option, optionIndex) => {
                  const selected = answers[questionIndex] === optionIndex;
                  return (
                    <button
                      key={`${currentQuestion.id}:${optionIndex}`}
                      type="button"
                      onClick={() => setAnswers(previous => previous.map((value, index) => index === questionIndex ? optionIndex : value))}
                      className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left text-sm leading-6 transition ${selected ? 'border-[#000080] bg-blue-50/60 text-slate-950' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
                    >
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${selected ? 'border-[#000080] bg-[#000080] text-white' : 'border-slate-300 bg-white text-slate-500'}`}>
                        {String.fromCharCode(65 + optionIndex)}
                      </span>
                      <span>{option}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-7 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => questionIndex === 0 ? setPhase('lesson') : setQuestionIndex(previous => previous - 1)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-4 w-4" /> {questionIndex === 0 ? 'Back to Training' : 'Previous Scenario'}
                </button>

                {questionIndex < questions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setQuestionIndex(previous => previous + 1)}
                    disabled={answers[questionIndex] < 0}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-6 py-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next Scenario <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void submitAssessment()}
                    disabled={saving || answers.some(answer => answer < 0)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-6 py-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />} Submit Knowledge Check
                  </button>
                )}
              </div>
            </div>
          )}

          {assessmentResult && (
            <div className="px-5 py-7 md:px-8 md:py-8">
              <div className={`rounded-2xl border p-5 ${assessmentResult.passed ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex items-start gap-3">
                  {assessmentResult.passed ? <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-green-600" /> : <RotateCcw className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" />}
                  <div>
                    <div className="text-xl font-black text-slate-950">{assessmentResult.score}%</div>
                    <div className="mt-1 text-sm font-bold text-slate-800">{assessmentResult.passed ? 'Knowledge check passed.' : `Review required. You need ${assessmentResult.passingScore}% to continue.`}</div>
                  </div>
                </div>
              </div>

              {!assessmentResult.passed && (
                <div className="mt-5 space-y-3">
                  <h4 className="text-sm font-black text-slate-900">Review the scenarios you missed</h4>
                  {assessmentResult.feedback.filter(item => !item.correct).map(item => {
                    const question = questions.find(questionItem => questionItem.id === item.questionId);
                    return (
                      <div key={item.questionId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-bold leading-6 text-slate-900">{question?.prompt}</div>
                        <div className="mt-2 text-sm leading-6 text-slate-600">{item.explanation}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-6 flex justify-end">
                {assessmentResult.passed ? (
                  <button type="button" onClick={continueAfterAssessment} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-6 py-3 text-xs font-bold text-white">
                    Continue to Acknowledgement <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button type="button" onClick={reviewTrainingAgain} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-6 py-3 text-xs font-bold text-white">
                    <RotateCcw className="h-4 w-4" /> Review Training Again
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'acknowledgement' && !completed && (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 md:px-8">
            <div className="text-[11px] font-black uppercase tracking-wider text-[#000080]">Final Acknowledgement · Step {totalSteps} of {totalSteps}</div>
            <h3 className="mt-1 text-xl font-bold text-slate-900">Confirm the ProFox Sales Rules</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">Read every statement. Required statements must be confirmed before Module 2 can be completed.</p>
          </div>

          <div className="space-y-3 px-5 py-6 md:px-8">
            {acknowledgements.map(item => (
              <label key={item.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${checkedAcks[item.id] ? 'border-[#000080] bg-blue-50/50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                <input
                  type="checkbox"
                  checked={Boolean(checkedAcks[item.id])}
                  onChange={event => setCheckedAcks(previous => ({ ...previous, [item.id]: event.target.checked }))}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-[#000080] focus:ring-[#000080]"
                />
                <span className="text-sm leading-6 text-slate-700">{item.statement}{item.required ? <span className="ml-1 font-bold text-red-600">*</span> : null}</span>
              </label>
            ))}
          </div>

          <div className="border-t border-slate-100 px-5 py-5 md:px-8">
            <div className="mb-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">
              I have read and understood the ProFox Agreement & Sales Rules and agree to follow them throughout my Sales Partner relationship with ProFox.
            </div>
            <button
              type="button"
              onClick={() => void completeAcknowledgement()}
              disabled={saving || !allRequiredConfirmed}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#000080] px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#000066] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              I Understand & Confirm
            </button>
          </div>
        </div>
      )}

      {completed && (
        <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
          <Check className="h-5 w-5 shrink-0" />
          <span><strong>Module 2 completed.</strong> You can review the training above at any time. Module 3 is available according to your Academy progress.</span>
        </div>
      )}
    </div>
  );
}
