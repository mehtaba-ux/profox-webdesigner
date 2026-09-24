import { useAcademyResumeSync } from './useAcademyResumeCheckpoint';

export type StandardAssessmentView = 'learn' | 'assessment' | 'result';

export function useStandardAssessmentResume(args: {
  moduleId?: string | null;
  loading: boolean;
  terminal: boolean;
  retryRequired: boolean;
  lessonsDone: boolean;
  lessonCount: number;
  questionCount: number;
  view: StandardAssessmentView;
  lessonIndex: number;
  questionIndex: number;
  confirmStage: boolean;
  answers: number[];
  acknowledgements: Record<string, boolean>;
  setView: (value: StandardAssessmentView) => void;
  setLessonIndex: (value: number) => void;
  setQuestionIndex: (value: number) => void;
  setConfirmStage: (value: boolean) => void;
  setAnswers: (value: number[]) => void;
  setAcknowledgements: (value: Record<string, boolean>) => void;
}) {
  const {
    moduleId, loading, terminal, retryRequired, lessonsDone, lessonCount, questionCount,
    view, lessonIndex, questionIndex, confirmStage, answers, acknowledgements,
    setView, setLessonIndex, setQuestionIndex, setConfirmStage, setAnswers, setAcknowledgements
  } = args;

  return useAcademyResumeSync(
    loading ? null : moduleId,
    !loading && !terminal && view !== 'result',
    { view, lessonIndex, questionIndex, confirmStage, answers, acknowledgements },
    checkpoint => {
      if (terminal) return;

      // Retry Required is a fresh assessment attempt. Completed lesson state remains
      // authoritative on the server and is never reconstructed from a checkpoint.
      if (retryRequired) {
        setView('assessment');
        setLessonIndex(Math.max(lessonCount - 1, 0));
        setQuestionIndex(0);
        setConfirmStage(false);
        setAnswers(Array(questionCount).fill(-1));
        setAcknowledgements({});
        return;
      }

      if (!checkpoint) {
        if (lessonsDone) setView('assessment');
        return;
      }

      const savedView = checkpoint.view;
      if (savedView === 'assessment' && lessonsDone) setView('assessment');
      else if (savedView === 'learn') setView('learn');

      const savedLesson = Number(checkpoint.lessonIndex);
      if (Number.isInteger(savedLesson)) {
        setLessonIndex(Math.max(0, Math.min(savedLesson, Math.max(lessonCount - 1, 0))));
      }

      const savedQuestion = Number(checkpoint.questionIndex);
      if (Number.isInteger(savedQuestion)) {
        setQuestionIndex(Math.max(0, Math.min(savedQuestion, Math.max(questionCount - 1, 0))));
      }

      if (Array.isArray(checkpoint.answers) && checkpoint.answers.length === questionCount) {
        setAnswers(checkpoint.answers.map(value => Number.isInteger(value) ? Number(value) : -1));
      }

      if (checkpoint.acknowledgements && typeof checkpoint.acknowledgements === 'object' && !Array.isArray(checkpoint.acknowledgements)) {
        setAcknowledgements(checkpoint.acknowledgements as Record<string, boolean>);
      }

      setConfirmStage(Boolean(checkpoint.confirmStage && lessonsDone));
    }
  );
}
