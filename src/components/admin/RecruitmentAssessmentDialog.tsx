import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Loader2,
  PencilLine,
  PlusCircle,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { recruitmentAssessmentService } from '../../lib/recruitmentAssessmentService';
import type {
  RecruitmentAssessment,
  RecruitmentAssessmentStatus,
  RecruitmentRubricItem,
  RecruitmentStagePolicy,
} from '../../lib/recruitmentWorkflowService';

export type RecruitmentAssessmentDialogMode = 'edit' | 'new';

interface Props {
  applicantId: string;
  candidateName: string;
  stage: string;
  policy: RecruitmentStagePolicy;
  mode: RecruitmentAssessmentDialogMode;
  assessment?: RecruitmentAssessment;
  completedInterview: boolean;
  interviewSkipped: boolean;
  nextStage?: string | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}

function clampScore(value: unknown, maxPoints: number) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(maxPoints, numeric));
}

function normalizedSavedScores(rubric: RecruitmentRubricItem[], saved?: Record<string, number>) {
  return rubric.reduce<Record<string, number>>((result, item) => {
    result[item.key] = clampScore(saved?.[item.key], item.maxPoints);
    return result;
  }, {});
}

function assessmentStageLabel(stage: string) {
  if (stage === 'Sales Assessment') return 'Sales Suitability Assessment';
  if (stage === 'Lead Research Test') return 'Lead Research Assessment';
  return stage;
}

export default function RecruitmentAssessmentDialog({
  applicantId,
  candidateName,
  stage,
  policy,
  mode,
  assessment,
  completedInterview,
  interviewSkipped,
  nextStage,
  onClose,
  onSaved,
}: Props) {
  const editing = mode === 'edit' && Boolean(assessment);
  const stageLabel = assessmentStageLabel(stage);
  const rubric = useMemo(
    () => editing && assessment?.rubric?.length ? assessment.rubric : policy.rubric || [],
    [assessment, editing, policy.rubric],
  );
  const passingScore = Number(editing ? assessment?.passingScore ?? policy.passingScore ?? 0 : policy.passingScore ?? 0);

  const [status, setStatus] = useState<RecruitmentAssessmentStatus>(editing ? assessment?.status || 'Retry Required' : 'Retry Required');
  const [rubricScores, setRubricScores] = useState<Record<string, number>>(
    editing ? normalizedSavedScores(rubric, assessment?.rubricScores) : normalizedSavedScores(rubric),
  );
  const [hasCriticalFailure, setHasCriticalFailure] = useState(Boolean(editing && assessment?.criticalFailures?.length));
  const [criticalFailures, setCriticalFailures] = useState(editing ? (assessment?.criticalFailures || []).join('\n') : '');
  const [evidence, setEvidence] = useState(editing ? assessment?.evidence || '' : '');
  const [evidenceUrl, setEvidenceUrl] = useState(editing ? assessment?.evidenceUrl || '' : '');
  const [notes, setNotes] = useState(editing ? assessment?.evaluatorNotes || '' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rubricMax = rubric.reduce((sum, item) => sum + Math.max(0, Number(item.maxPoints || 0)), 0);
  const rubricPoints = rubric.reduce((sum, item) => sum + clampScore(rubricScores[item.key], item.maxPoints), 0);
  const score = rubricMax > 0 ? Math.round((rubricPoints / rubricMax) * 100) : 0;
  const meetsPassingScore = score >= passingScore;
  const interviewPassReady = !policy.interviewRequired || completedInterview || interviewSkipped;
  const passEligible = meetsPassingScore && !hasCriticalFailure && interviewPassReady;
  const parsedCriticalFailures = hasCriticalFailure
    ? criticalFailures.split('\n').map(item => item.trim()).filter(Boolean)
    : [];

  const validationError = hasCriticalFailure && parsedCriticalFailures.length === 0
    ? 'Describe the critical failure before saving this assessment.'
    : status === 'Passed' && !meetsPassingScore
      ? `The score must reach the saved passing mark of ${passingScore}% before this assessment can be passed.`
      : status === 'Passed' && hasCriticalFailure
        ? 'A critical failure blocks a Passed decision regardless of the calculated score.'
        : status === 'Passed' && !interviewPassReady
          ? 'Complete the required interview or use the audited Admin skip before marking this assessment Passed.'
          : null;

  const chooseCriticalFailure = (value: boolean) => {
    setHasCriticalFailure(value);
    if (!value) setCriticalFailures('');
    if (value && status === 'Passed') setStatus('Retry Required');
  };

  const chooseStatus = (value: RecruitmentAssessmentStatus) => {
    if (value === 'Passed' && !passEligible) return;
    setStatus(value);
  };

  const save = async () => {
    if (validationError) {
      setError(validationError);
      return;
    }
    if (editing && !assessment) {
      setError('The saved assessment could not be loaded. Close the form and try again.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (editing && assessment) {
        await recruitmentAssessmentService.updateAndProcess({
          assessmentId: assessment.id,
          status,
          score,
          rubricScores,
          criticalFailures: parsedCriticalFailures,
          evidence,
          evidenceUrl,
          notes,
        });
      } else {
        await recruitmentAssessmentService.recordAndProcess({
          applicantId,
          stage,
          status,
          score,
          rubricScores,
          criticalFailures: parsedCriticalFailures,
          evidence,
          evidenceUrl,
          notes,
        });
      }

      const attemptLabel = editing && assessment ? `Assessment attempt #${assessment.attemptNo}` : 'New assessment attempt';
      const message = status === 'Passed'
        ? `${attemptLabel} saved as Passed. Candidate advanced to ${nextStage || 'the next valid stage'}.`
        : `${attemptLabel} saved as ${status}. The candidate remains in ${stageLabel}.`;
      await onSaved(message);
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message || 'The assessment could not be saved.')
        : 'The assessment could not be saved.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-stretch justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[94vh] sm:rounded-3xl">
        <header className="border-b border-slate-200 bg-white px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#000080]">Structured recruitment assessment</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${editing ? 'bg-blue-50 text-[#000080]' : 'bg-slate-100 text-slate-700'}`}>
                  {editing ? <PencilLine className="h-3.5 w-3.5" /> : <PlusCircle className="h-3.5 w-3.5" />}
                  {editing && assessment ? `Editing attempt #${assessment.attemptNo}` : 'New attempt'}
                </span>
              </div>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{stageLabel}</h2>
              <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
                {editing
                  ? `Review and update the saved scoring for ${candidateName}. These values are loaded from the persisted assessment and will remain after refresh or navigation.`
                  : `Create a separate assessment attempt for ${candidateName}. A new attempt starts clean and does not overwrite the previous assessment.`}
              </p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} className="shrink-0 rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50" aria-label="Close assessment">
              <XCircle className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7 sm:py-7">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <div className="text-sm font-semibold text-slate-600">Calculated score</div>
              <div className="mt-1 text-3xl font-bold text-slate-950">{score}%</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <div className="text-sm font-semibold text-slate-600">Passing score</div>
              <div className="mt-1 text-3xl font-bold text-slate-950">{passingScore}%</div>
            </div>
            <div className={`rounded-2xl border p-4 sm:p-5 ${passEligible ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className={`text-sm font-semibold ${passEligible ? 'text-emerald-700' : 'text-amber-700'}`}>Pass eligibility</div>
              <div className={`mt-1 text-lg font-bold ${passEligible ? 'text-emerald-900' : 'text-amber-900'}`}>{passEligible ? 'Ready to pass' : 'Not ready'}</div>
            </div>
          </div>

          {editing && assessment && (
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm leading-6 text-slate-700">
              <strong className="text-[#000080]">Saved assessment loaded.</strong> Editing updates attempt #{assessment.attemptNo}; it does not create a duplicate attempt. The saved rubric and passing-score snapshot are preserved.
            </div>
          )}

          <section className="mt-8">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-950">1. Score the assessment rubric</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">Enter points for each criterion. The percentage updates automatically and is saved with this assessment.</p>
            </div>
            <div className="space-y-3">
              {rubric.map(item => (
                <div key={item.key} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center sm:p-5">
                  <div>
                    <div className="text-base font-semibold leading-6 text-slate-900">{item.label}</div>
                    <div className="mt-1 text-sm text-slate-500">Maximum {item.maxPoints} points</div>
                  </div>
                  <label className="block">
                    <span className="sr-only">Points for {item.label}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={item.maxPoints}
                      value={rubricScores[item.key] ?? 0}
                      onChange={event => setRubricScores(values => ({ ...values, [item.key]: clampScore(event.target.value, item.maxPoints) }))}
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg font-bold text-slate-950 outline-none transition focus:border-[#000080] focus:ring-2 focus:ring-[#000080]/10"
                    />
                  </label>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-2xl border border-slate-200 p-4 sm:p-5">
            <h3 className="text-lg font-bold text-slate-950">2. Critical failure check</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">Select this explicitly. A genuine critical failure blocks Passed regardless of the calculated score.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => chooseCriticalFailure(false)} className={`rounded-xl border p-4 text-left transition ${!hasCriticalFailure ? 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <div className="flex items-center gap-2 text-base font-bold text-slate-950"><CheckCircle2 className="h-5 w-5 text-emerald-600" />No critical failure</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">Choose this when no disqualifying issue was found.</p>
              </button>
              <button type="button" onClick={() => chooseCriticalFailure(true)} className={`rounded-xl border p-4 text-left transition ${hasCriticalFailure ? 'border-red-300 bg-red-50 ring-2 ring-red-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <div className="flex items-center gap-2 text-base font-bold text-slate-950"><AlertCircle className="h-5 w-5 text-red-600" />Critical failure found</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">Choose only when a genuine issue prevents a Passed decision.</p>
              </button>
            </div>
            {hasCriticalFailure && (
              <label className="mt-5 block">
                <span className="text-base font-semibold text-slate-900">Critical failure details</span>
                <span className="mt-1 block text-sm leading-6 text-slate-600">Enter one specific failure per line. At least one detail is required.</span>
                <textarea value={criticalFailures} onChange={event => setCriticalFailures(event.target.value)} rows={3} placeholder="Describe the specific critical failure..." className="mt-2 w-full rounded-xl border border-red-200 bg-white px-4 py-3 text-base leading-6 text-slate-950 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100" />
              </label>
            )}
          </section>

          <section className="mt-8">
            <h3 className="text-lg font-bold text-slate-950">3. Select the assessment decision</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">Passed becomes available only when every protected requirement is satisfied.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {(['Passed', 'Retry Required', 'Failed'] as RecruitmentAssessmentStatus[]).map(option => {
                const disabled = option === 'Passed' && !passEligible;
                const selected = status === option;
                return (
                  <button key={option} type="button" disabled={disabled} onClick={() => chooseStatus(option)} className={`rounded-xl border px-4 py-3.5 text-sm font-bold transition ${selected ? 'border-[#000080] bg-[#000080] text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-[#000080]/30'} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:border-slate-200`}>
                    {option}
                  </button>
                );
              })}
            </div>
            {!meetsPassingScore && <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm leading-6 text-amber-900"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />Score is below the {passingScore}% passing mark.</div>}
            {hasCriticalFailure && <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm leading-6 text-red-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />A critical failure is recorded, so Passed is intentionally unavailable.</div>}
            {policy.interviewRequired && !completedInterview && !interviewSkipped && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm leading-6 text-amber-900"><CalendarClock className="mt-0.5 h-5 w-5 shrink-0" />This stage requires a completed interview before Passed. An Administrator may use the audited skip exception when appropriate.</div>}
            {policy.interviewRequired && interviewSkipped && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm leading-6 text-amber-900"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />The interview requirement was administratively skipped and audited. Score and critical-failure rules still apply.</div>}
          </section>

          <section className="mt-8 space-y-5">
            <div>
              <h3 className="text-lg font-bold text-slate-950">4. Evidence and evaluator notes</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">Keep enough context for another reviewer to understand the score and decision later.</p>
            </div>
            <label className="block">
              <span className="text-base font-semibold text-slate-900">Assessment evidence</span>
              <span className="mt-1 block text-sm leading-6 text-slate-600">Summarize the answers, examples, observations, or work that support the scoring.</span>
              <textarea value={evidence} onChange={event => setEvidence(event.target.value)} rows={4} placeholder="Describe the evidence supporting the rubric scores..." className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base leading-6 text-slate-950 outline-none transition focus:border-[#000080] focus:ring-2 focus:ring-[#000080]/10" />
            </label>
            <label className="block">
              <span className="text-base font-semibold text-slate-900">Evidence link <span className="font-normal text-slate-500">(optional)</span></span>
              <span className="mt-1 block text-sm leading-6 text-slate-600">Add a shareable recording, practical task, portfolio, GitHub, or supporting file link when relevant.</span>
              <input type="url" value={evidenceUrl} onChange={event => setEvidenceUrl(event.target.value)} placeholder="https://..." className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-950 outline-none transition focus:border-[#000080] focus:ring-2 focus:ring-[#000080]/10" />
            </label>
            <label className="block">
              <span className="text-base font-semibold text-slate-900">Evaluator notes <span className="font-normal text-slate-500">(optional)</span></span>
              <span className="mt-1 block text-sm leading-6 text-slate-600">Add internal context or follow-up instructions not already captured above.</span>
              <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3} placeholder="Internal evaluator notes..." className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base leading-6 text-slate-950 outline-none transition focus:border-[#000080] focus:ring-2 focus:ring-[#000080]/10" />
            </label>
          </section>

          {error && <div className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><span>{error}</span></div>}
          {validationError && !error && <div className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><span>{validationError}</span></div>}

          <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm leading-6 text-slate-700">
            <strong className="text-[#000080]">What happens when you save?</strong>
            <p className="mt-1">
              {editing
                ? 'This saved attempt is updated in place. It remains available after refresh and navigation. If you change the decision to Passed, stage progression is processed in the same protected transaction.'
                : 'A separate assessment attempt is created. Passed processes the assessment and next valid recruitment stage together; Retry Required or Failed keeps the candidate in the current stage.'}
            </p>
          </div>
        </div>

        <footer className="border-t border-slate-200 bg-white px-5 py-4 sm:px-7 sm:py-5">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={() => void save()} disabled={busy || Boolean(validationError)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#000066] disabled:cursor-not-allowed disabled:opacity-40">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {status === 'Passed' ? 'Save & Process Passed Assessment' : editing ? 'Save Changes' : 'Save New Attempt'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
