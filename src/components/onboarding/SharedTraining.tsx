import React, { useEffect, useState } from 'react';
import {
  CheckCircle,
  Clock,
  Lock,
  ChevronRight,
  BookOpen,
  Award,
  Loader2,
  ArrowLeft
} from 'lucide-react';
import { trainingService, TrainingModule, UserProgress, TrainingLesson, type AcademyDescriptor } from '../../lib/trainingService';
import { academyResumeService } from '../../lib/academyResumeService';
import { useAuth } from '../../lib/AuthContext';
import ReactMarkdown from 'react-markdown';

import AgreementSalesRulesTraining from './AgreementSalesRulesTraining';
import ProductQuiz from './ProductQuiz';
import NichePlaybooksView from './NichePlaybooksView';
import LeadResearchForm, { ProspectSubmission } from './LeadResearchForm';
import LoomSubmissionWidget from './LoomSubmissionWidget';
import OutreachTemplatesView from './OutreachTemplatesView';
import MeetingBookingTraining from './MeetingBookingTraining';
import DiscoveryCallTraining from './DiscoveryCallTraining';
import CallPracticeTraining from './CallPracticeTraining';
import AutomatedMockSalesCall from './AutomatedMockSalesCall';
import CalendarSetupChecklist from './CalendarSetupChecklist';
import CrmPracticalTestWidget from './CrmPracticalTestWidget';
import FinalCertificationView from './FinalCertificationView';
import ProductPresentationView from './ProductPresentationView';
import ObjectionHandlingView from './ObjectionHandlingView';
import ClosingTrainingView from './ClosingTrainingView';
import QuotationProcessView from './QuotationProcessView';
import PaymentProcessView from './PaymentProcessView';
import ConfidentialityAckWidget from './ConfidentialityAckWidget';

function messageFromError(error: any, fallback: string) {
  return error?.message || fallback;
}

function isSpecializedModule(slug: string) {
  return [
    'agreement-rules','product-training','product-package-training','niche-training','niche-specific-training',
    'lead-research','lead-research-qualification','loom-outreach','personalized-loom-outreach',
    'outreach-cadence','outreach-messages-followup','meeting-booking','discovery-script','call-practice',
    'mock-call-test','mock-sales-call-test','presentation-skills','product-presentation','objections',
    'objection-handling','closing','closing-training','quotation-process','payment-process','calendar-setup',
    'calendar-meeting-setup','crm-training','crm-practical-test','confidentiality-data-protection','final-certification'
  ].includes(slug);
}

function resolveLessonIndex(lessonCount: number, item?: UserProgress, checkpoint?: any) {
  if (lessonCount <= 0) return 0;
  const saved = Number(checkpoint?.lessonIndex);
  if (Number.isInteger(saved) && saved >= 0) return Math.min(saved, lessonCount - 1);
  const percent = Math.max(0, Math.min(100, Number(item?.progress_percent || 0)));
  // Legacy module starts used 10% as a placeholder. Without a real resume checkpoint,
  // that must still mean "start at Lesson 1", not "skip to Lesson 2".
  if (percent <= 10) return 0;
  const derived = Math.floor((percent / 100) * lessonCount);
  return Math.min(Math.max(derived, 0), lessonCount - 1);
}

export default function MyTraining() {
  const { user, profile } = useAuth();
  const [academy, setAcademy] = useState<AcademyDescriptor>(() => trainingService.academyDescriptor(null));
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [progress, setProgress] = useState<UserProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState<TrainingModule | null>(null);
  const [selectedLessons, setSelectedLessons] = useState<TrainingLesson[]>([]);
  const [selectedSubmissionData, setSelectedSubmissionData] = useState<any | null>(null);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) void loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [academyRes, modulesRes, progressRes] = await Promise.all([
        trainingService.getMyAcademyDescriptor(),
        trainingService.getModules(),
        trainingService.getUserProgress(user.id)
      ]);
      if (!academyRes.error) setAcademy(academyRes.data);
      if (modulesRes.error) throw modulesRes.error;
      if (progressRes.error) throw progressRes.error;
      setModules(modulesRes.data || []);
      setProgress(progressRes.data || []);
    } catch (error) {
      console.error('Error loading training data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getModuleProgress = (moduleId: string) => progress.find(item => item.module_id === moduleId);

  const isModuleLocked = (module: TrainingModule) => {
    if (module.sort_order === 1) return false;
    const previousModule = modules.find(item => item.sort_order === module.sort_order - 1);
    if (!previousModule) return false;
    const previousProgress = getModuleProgress(previousModule.id);
    return !(previousProgress?.status === 'Passed' || previousProgress?.status === 'Completed');
  };

  const handleSelectModule = async (module: TrainingModule) => {
    if (!user) return;
    if (isModuleLocked(module)) {
      alert('Please complete the previous required module first.');
      return;
    }

    if (academy.finalCertificationSlug && academy.track !== 'sales' && module.slug === academy.finalCertificationSlug) {
      window.location.assign('/academy/final-certification');
      return;
    }

    setSelectedModule(module);
    setLoading(true);
    try {
      let currentProgress = getModuleProgress(module.id);
      let startedNow = false;
      if (!currentProgress) {
        const started = await trainingService.startModule(user.id, module.id);
        if (started.error || !started.data) throw started.error || new Error('Unable to start this training module.');
        currentProgress = started.data;
        startedNow = true;
      }

      const [lessonsResult, assignmentResult, resumeResult] = await Promise.all([
        trainingService.getLessons(module.id),
        trainingService.getLatestAssignment(user.id, module.id),
        academyResumeService.get(module.id)
      ]);
      const loadedLessons = lessonsResult.data || [];
      setSelectedLessons(loadedLessons);
      setSelectedSubmissionData(assignmentResult.data || null);
      setCurrentLessonIndex(
        isSpecializedModule(module.slug)
          ? 0
          : startedNow
            ? 0
            : resolveLessonIndex(loadedLessons.length, currentProgress, resumeResult.data)
      );

      if (startedNow) await loadData();
    } catch (error) {
      console.error('Error loading module details:', error);
      alert(messageFromError(error, 'Unable to open this training module.'));
    } finally {
      setLoading(false);
    }
  };

  const exitSelectedModule = () => {
    if (selectedModule && !isSpecializedModule(selectedModule.slug)) {
      const item = getModuleProgress(selectedModule.id);
      if (item && !['Submitted','Passed','Completed'].includes(item.status)) {
        void academyResumeService.save(selectedModule.id, { view: 'lesson', lessonIndex: currentLessonIndex });
      }
    }
    setSelectedModule(null);
    setSelectedSubmissionData(null);
    setCurrentLessonIndex(0);
  };

  const markCurrentModuleComplete = async () => {
    if (!selectedModule) return false;
    const currentProgress = getModuleProgress(selectedModule.id);
    if (!currentProgress) return false;

    const { error } = await trainingService.updateProgress(currentProgress.id, {
      status: 'Completed',
      progress_percent: 100,
      completed_at: new Date().toISOString()
    });
    if (error) {
      alert(messageFromError(error, 'Unable to complete this module.'));
      return false;
    }
    await academyResumeService.clear(selectedModule.id);
    await loadData();
    return true;
  };

  const handlePreviousLesson = async () => {
    if (!selectedModule || currentLessonIndex <= 0) return;
    const previousIndex = currentLessonIndex - 1;
    setCurrentLessonIndex(previousIndex);

    const currentProgress = getModuleProgress(selectedModule.id);
    const isComplete = currentProgress?.status === 'Passed' || currentProgress?.status === 'Completed';
    if (!isComplete && !isSpecializedModule(selectedModule.slug)) {
      const resume = await academyResumeService.save(selectedModule.id, { view: 'lesson', lessonIndex: previousIndex });
      if (resume.error) console.error('Unable to save lesson resume checkpoint:', resume.error);
    }
  };

  const handleCompleteLessonModule = async () => {
    if (!selectedModule) return;
    const currentProgress = getModuleProgress(selectedModule.id);
    if (!currentProgress) return;

    if (currentLessonIndex < selectedLessons.length - 1) {
      const nextIndex = currentLessonIndex + 1;
      setCurrentLessonIndex(nextIndex);

      const isComplete = currentProgress.status === 'Passed' || currentProgress.status === 'Completed';
      if (isComplete) return;

      const calculatedPercent = Math.round((nextIndex / Math.max(selectedLessons.length, 1)) * 100);
      // Revision must never move recorded progress backwards.
      const percent = Math.max(Number(currentProgress.progress_percent || 0), calculatedPercent);
      const [{ error }, resume] = await Promise.all([
        trainingService.updateProgress(currentProgress.id, { progress_percent: percent }),
        academyResumeService.save(selectedModule.id, { view: 'lesson', lessonIndex: nextIndex })
      ]);
      if (error) alert(messageFromError(error, 'Unable to save lesson progress.'));
      if (resume.error) console.error('Unable to save lesson resume checkpoint:', resume.error);
      return;
    }

    if (currentProgress.status === 'Passed' || currentProgress.status === 'Completed') return;
    if (await markCurrentModuleComplete()) exitSelectedModule();
  };

  const handleCompleteSelfStudyModule = async (evidenceType: string) => {
    if (!selectedModule || !user) return;
    const currentProgress = getModuleProgress(selectedModule.id);
    if (!currentProgress) return;

    setIsSubmitting(true);
    const evidence = {
      type: evidenceType,
      acknowledged: true,
      completedAt: new Date().toISOString()
    };
    const { error: evidenceError } = await trainingService.saveEvidence(
      user.id,
      selectedModule.id,
      currentProgress.id,
      evidence
    );
    if (evidenceError) {
      setIsSubmitting(false);
      alert(messageFromError(evidenceError, 'Unable to record module completion evidence.'));
      return;
    }

    const completed = await markCurrentModuleComplete();
    setIsSubmitting(false);
    if (completed) {
      setSelectedSubmissionData(evidence);
      exitSelectedModule();
    }
  };

  const handleQuizComplete = async (answers: number[]) => {
    if (!selectedModule) return { score: 0, passed: false, error: 'Training module is not selected.' };
    const currentProgress = getModuleProgress(selectedModule.id);
    if (!currentProgress) return { score: 0, passed: false, error: 'Training progress record is unavailable.' };

    const { data, error } = await trainingService.submitQuizAnswers(currentProgress.id, answers);
    if (error || !data) {
      return { score: 0, passed: false, error: messageFromError(error, 'Quiz verification failed.') };
    }
    await loadData();
    return { score: data.score, passed: data.passed };
  };

  const handleFinalExamSubmit = async (answers: number[]) => {
    if (!selectedModule || !user) return { score: 0, passed: false, error: 'Final Certification module is not selected.' };
    const currentProgress = getModuleProgress(selectedModule.id);
    if (!currentProgress) return { score: 0, passed: false, error: 'Final Certification progress record is unavailable.' };

    const { data, error } = await trainingService.submitQuizAnswers(currentProgress.id, answers);
    if (error || !data) {
      return { score: 0, passed: false, error: messageFromError(error, 'Final exam verification failed.') };
    }
    const latestAssignment = await trainingService.getLatestAssignment(user.id, selectedModule.id);
    setSelectedSubmissionData(latestAssignment.data || null);
    await loadData();
    return { score: data.score, passed: data.passed };
  };

  const submitReviewedAssignment = async (submissionData: any) => {
    if (!selectedModule || !user) return;
    const currentProgress = getModuleProgress(selectedModule.id);
    if (!currentProgress) return;

    setIsSubmitting(true);
    const { error } = await trainingService.submitAssignment(user.id, selectedModule.id, currentProgress.id, submissionData);
    setIsSubmitting(false);
    if (error) {
      alert(messageFromError(error, 'Training submission failed.'));
      return;
    }
    setSelectedSubmissionData(submissionData);
    await loadData();
  };

  const handleLeadResearchSubmit = async (prospects: ProspectSubmission[]) => {
    await submitReviewedAssignment({ type: 'lead_research', prospects, submittedAt: new Date().toISOString() });
  };

  const handleLoomSubmit = async (loomUrl: string, notes: string) => {
    await submitReviewedAssignment({ type: 'loom_outreach', loomUrl, notes, submittedAt: new Date().toISOString() });
  };

  const handleCrmTestSubmit = async (data: any) => {
    await submitReviewedAssignment({ type: 'crm_practical', ...data, submittedAt: new Date().toISOString() });
  };

  const handleCalendarChecklistSave = async (items: Record<string, boolean>) => {
    if (!selectedModule || !user) return;
    const currentProgress = getModuleProgress(selectedModule.id);
    if (!currentProgress || currentProgress.status === 'Completed') return;

    const completedCount = Object.values(items).filter(Boolean).length;
    const isDone = completedCount === 9;
    const evidence = {
      type: 'calendar_setup',
      items,
      completed: isDone,
      savedAt: new Date().toISOString()
    };

    const { error: evidenceError } = await trainingService.saveEvidence(user.id, selectedModule.id, currentProgress.id, evidence);
    if (evidenceError) {
      alert(messageFromError(evidenceError, 'Calendar checklist evidence could not be saved.'));
      return;
    }

    const { error } = await trainingService.updateProgress(currentProgress.id, {
      status: isDone ? 'Completed' : 'In Progress',
      progress_percent: Math.round((completedCount / 9) * 100),
      completed_at: isDone ? new Date().toISOString() : undefined
    });
    if (error) {
      alert(messageFromError(error, 'Calendar checklist could not be saved.'));
      return;
    }
    setSelectedSubmissionData(evidence);
    await loadData();
  };

  const handleConfidentialitySubmit = async (data: { agreed: boolean; date: string }) => {
    if (!selectedModule || !user || !data.agreed) return;
    const currentProgress = getModuleProgress(selectedModule.id);
    if (!currentProgress) return;

    setIsSubmitting(true);
    const evidence = {
      type: 'confidentiality_ack',
      agreed: true,
      acknowledgedAt: data.date
    };
    const { error: evidenceError } = await trainingService.saveEvidence(user.id, selectedModule.id, currentProgress.id, evidence);
    if (evidenceError) {
      setIsSubmitting(false);
      alert(messageFromError(evidenceError, 'Confidentiality acknowledgement evidence could not be saved.'));
      return;
    }

    const { error } = await trainingService.updateProgress(currentProgress.id, {
      status: 'Completed',
      progress_percent: 100,
      completed_at: new Date().toISOString()
    });
    setIsSubmitting(false);
    if (error) {
      alert(messageFromError(error, 'Confidentiality acknowledgement could not be saved.'));
      return;
    }
    setSelectedSubmissionData(evidence);
    await loadData();
  };

  const handleRequestFinalApproval = async () => {
    setIsSubmitting(true);
    const { error } = await trainingService.requestFinalApproval();
    setIsSubmitting(false);
    if (error) {
      alert(messageFromError(error, 'Final Approval request could not be submitted.'));
      return;
    }
    await loadData();
    alert('Final Approval request submitted to Management.');
  };

  const calculateOverallProgress = () => {
    if (modules.length === 0) return 0;
    const completed = progress.filter(item => item.status === 'Passed' || item.status === 'Completed').length;
    return Math.round((completed / modules.length) * 100);
  };

  if (loading && !selectedModule && modules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <Loader2 className="mb-4 h-8 w-8 animate-spin text-[#000080]" />
        <p className="font-medium text-slate-500">Loading your ProFox Academy...</p>
      </div>
    );
  }

  const selectedProgress = selectedModule ? getModuleProgress(selectedModule.id) : undefined;
  const selectedCompleted = selectedProgress?.status === 'Passed' || selectedProgress?.status === 'Completed';
  const accountStatus = profile?.status === 'active' ? academy.activeRoleLabel : 'Onboarding';

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 md:p-8">
      {!selectedModule ? (
        <>
          <div className="space-y-6 rounded-3xl bg-gradient-to-r from-[#000080] to-[#FF0E0E] p-8 text-white shadow-xl">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
              <div className="space-y-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/80">{academy.certificationLabel}</div>
                <h1 className="text-3xl font-extrabold tracking-tight">{academy.name}</h1>
                <p className="max-w-xl text-xs leading-relaxed text-white/80">
                  Complete every required module and practical gate in your assigned curriculum to qualify for Management Final Approval and controlled production access.
                </p>
              </div>

              <div className="min-w-[180px] rounded-2xl border border-white/20 bg-white/10 p-5 text-center backdrop-blur-md">
                <div className="mb-1 text-4xl font-black">{calculateOverallProgress()}%</div>
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">Certification Progress</div>
                <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-white/20">
                  <div className="h-full bg-white transition-all duration-300" style={{ width: `${calculateOverallProgress()}%` }} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 md:grid-cols-4">
              <Metric icon={<CheckCircle className="h-5 w-5 text-green-300" />} value={`${progress.filter(item => item.status === 'Completed' || item.status === 'Passed').length} / ${modules.length}`} label="Passed Modules" />
              <Metric icon={<Clock className="h-5 w-5 text-amber-300" />} value={String(progress.filter(item => item.status === 'Submitted').length)} label="Under Management Review" />
              <Metric icon={<Award className="h-5 w-5 text-blue-300" />} value={accountStatus} label="Current Account Status" />
              <Metric icon={<BookOpen className="h-5 w-5 text-white" />} value={`${modules.length} Modules`} label="Assigned Curriculum" />
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Training Curriculum</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {modules.map((module, index) => {
                const item = getModuleProgress(module.id);
                const locked = isModuleLocked(module);
                const isPassed = item?.status === 'Passed' || item?.status === 'Completed';
                const isSubmitted = item?.status === 'Submitted';
                const isRetry = item?.status === 'Retry Required';
                const isRoleFinalCertification = academy.track !== 'sales' && module.slug === academy.finalCertificationSlug;

                let badgeStyle = 'bg-slate-100 text-slate-600 border-slate-200';
                let statusLabel = 'Not Started';
                if (locked) {
                  badgeStyle = 'bg-slate-100 text-slate-400 border-slate-200';
                  statusLabel = 'Locked';
                } else if (isPassed) {
                  badgeStyle = 'bg-green-100 text-green-800 border-green-300 font-bold';
                  statusLabel = 'Passed';
                } else if (isSubmitted) {
                  badgeStyle = 'bg-amber-100 text-amber-800 border-amber-300 font-bold';
                  statusLabel = 'Under Review';
                } else if (isRetry) {
                  badgeStyle = 'bg-red-100 text-red-800 border-red-300 font-bold';
                  statusLabel = 'Retry Required';
                } else if (item?.status === 'In Progress') {
                  badgeStyle = 'bg-blue-100 text-blue-800 border-blue-300 font-bold';
                  statusLabel = 'In Progress';
                }

                const actionLabel = locked
                  ? 'Complete previous module'
                  : isRoleFinalCertification
                    ? 'Open Final Certification'
                    : isPassed
                      ? 'Review Module'
                      : isSubmitted
                        ? 'View Submission Status'
                        : isRetry
                          ? 'Retry Certification'
                          : item?.status === 'In Progress'
                            ? `Continue · ${Math.max(0, Math.min(100, item.progress_percent || 0))}%`
                            : 'Start Module';

                return (
                  <div
                    key={module.id}
                    onClick={() => !locked && void handleSelectModule(module)}
                    className={`flex flex-col justify-between rounded-3xl border p-6 transition-all ${locked ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60' : 'cursor-pointer border-slate-200 bg-white hover:border-[#000080] hover:shadow-lg'}`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#000080]/10 text-xs font-extrabold text-[#000080]">{index + 1}</span>
                        <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] ${badgeStyle}`}>
                          {locked ? <Lock className="h-3 w-3" /> : isPassed ? <CheckCircle className="h-3 w-3" /> : null}
                          <span>{statusLabel}</span>
                        </span>
                      </div>
                      <h3 className="text-sm font-bold leading-snug text-slate-900">{module.title}</h3>
                      <p className="line-clamp-2 text-xs text-slate-500">{module.description}</p>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs font-bold text-[#000080]">
                      <span>{actionLabel}</span>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          <button
            onClick={exitSelectedModule}
            className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition-all hover:text-[#000080]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to All Modules</span>
          </button>

          {selectedModule.slug === 'agreement-rules' ? (
            <AgreementSalesRulesTraining
              moduleId={selectedModule.id}
              moduleTitle={selectedModule.title}
              moduleDescription={selectedModule.description}
              lessons={selectedLessons}
              progress={selectedProgress}
              completed={selectedCompleted}
              onRefresh={loadData}
              onExit={exitSelectedModule}
            />
          ) : (selectedModule.slug === 'product-training' || selectedModule.slug === 'product-package-training') ? (
            <ProductQuiz onComplete={handleQuizComplete} passingScore={selectedModule.passing_score || 80} />
          ) : (selectedModule.slug === 'niche-training' || selectedModule.slug === 'niche-specific-training') ? (
            <NichePlaybooksView moduleId={selectedModule.id} />
          ) : (selectedModule.slug === 'lead-research' || selectedModule.slug === 'lead-research-qualification') ? (
            <LeadResearchForm onSubmit={handleLeadResearchSubmit} isSubmitting={isSubmitting} />
          ) : (selectedModule.slug === 'loom-outreach' || selectedModule.slug === 'personalized-loom-outreach') ? (
            <LoomSubmissionWidget onSubmit={handleLoomSubmit} isSubmitting={isSubmitting} />
          ) : (selectedModule.slug === 'outreach-cadence' || selectedModule.slug === 'outreach-messages-followup') ? (
            <OutreachTemplatesView onComplete={selectedCompleted ? undefined : () => void handleCompleteSelfStudyModule('outreach_training_complete')} />
          ) : selectedModule.slug === 'meeting-booking' ? (
            <MeetingBookingTraining
              module={selectedModule}
              lessons={selectedLessons}
              progress={selectedProgress}
              onRefresh={loadData}
            />
          ) : selectedModule.slug === 'discovery-script' ? (
            <DiscoveryCallTraining
              module={selectedModule}
              lessons={selectedLessons}
              progress={selectedProgress}
              onRefresh={loadData}
            />
          ) : selectedModule.slug === 'call-practice' ? (
            <CallPracticeTraining
              module={selectedModule}
              lessons={selectedLessons}
              progress={selectedProgress}
              onRefresh={loadData}
            />
          ) : (selectedModule.slug === 'mock-call-test' || selectedModule.slug === 'mock-sales-call-test') ? (
            <AutomatedMockSalesCall
              module={selectedModule}
              progress={selectedProgress}
              onRefresh={loadData}
            />
          ) : (selectedModule.slug === 'presentation-skills' || selectedModule.slug === 'product-presentation') ? (
            <ProductPresentationView onComplete={() => void handleCompleteSelfStudyModule('product_presentation_complete')} />
          ) : (selectedModule.slug === 'objections' || selectedModule.slug === 'objection-handling') ? (
            <ObjectionHandlingView onComplete={() => void handleCompleteSelfStudyModule('objection_handling_complete')} />
          ) : (selectedModule.slug === 'closing' || selectedModule.slug === 'closing-training') ? (
            <ClosingTrainingView onComplete={() => void handleCompleteSelfStudyModule('closing_training_complete')} />
          ) : selectedModule.slug === 'quotation-process' ? (
            <QuotationProcessView onComplete={() => void handleCompleteSelfStudyModule('quotation_training_complete')} />
          ) : selectedModule.slug === 'payment-process' ? (
            <PaymentProcessView onComplete={() => void handleCompleteSelfStudyModule('payment_training_complete')} />
          ) : (selectedModule.slug === 'calendar-setup' || selectedModule.slug === 'calendar-meeting-setup') ? (
            <CalendarSetupChecklist
              onSave={handleCalendarChecklistSave}
              savedState={selectedSubmissionData?.type === 'calendar_setup' ? selectedSubmissionData.items : {}}
              completed={selectedProgress?.status === 'Completed' || selectedProgress?.status === 'Passed'}
            />
          ) : (selectedModule.slug === 'crm-training' || selectedModule.slug === 'crm-practical-test') ? (
            <CrmPracticalTestWidget onSubmit={handleCrmTestSubmit} isSubmitting={isSubmitting} />
          ) : selectedModule.slug === 'confidentiality-data-protection' ? (
            <ConfidentialityAckWidget
              onAcknowledge={handleConfidentialitySubmit}
              isSubmitting={isSubmitting}
              status={selectedProgress?.status}
            />
          ) : selectedModule.slug === 'final-certification' ? (
            <FinalCertificationView
              modules={modules}
              progressList={progress}
              onSubmitExam={handleFinalExamSubmit}
              onRequestFinalApproval={handleRequestFinalApproval}
              isSubmitting={isSubmitting}
              userStatus={profile?.status}
              onboardingStatus={profile?.onboardingStatus}
            />
          ) : (
            <div className="space-y-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
              <div className="border-b border-slate-100 pb-6">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">{selectedModule.slug}</div>
                <h2 className="mt-1 text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">{selectedModule.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{selectedModule.description}</p>
              </div>

              {selectedLessons.length > 0 && selectedLessons[currentLessonIndex] && (
                <div className="mx-auto w-full max-w-4xl space-y-5 sm:space-y-6">
                  <div className="rounded-2xl border border-[#000080]/10 bg-[#000080]/[0.03] px-4 py-4 sm:px-6">
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#000080]">
                      Lesson {currentLessonIndex + 1} of {selectedLessons.length}
                    </div>
                    <h3 className="mt-1.5 text-xl font-bold leading-snug text-slate-900 sm:text-2xl">
                      {selectedLessons[currentLessonIndex].title}
                    </h3>
                  </div>
                  <div className="prose prose-slate max-w-none rounded-2xl border border-slate-200/80 bg-slate-50/70 p-5 text-[15px] leading-7 text-slate-700 sm:p-8 sm:text-base sm:leading-8 prose-headings:mt-8 prose-headings:mb-4 prose-headings:font-bold prose-headings:leading-tight prose-headings:text-slate-900 prose-p:my-4 prose-li:my-2 prose-ul:my-5 prose-ol:my-5 prose-strong:font-bold prose-strong:text-slate-900">
                    <ReactMarkdown>{selectedLessons[currentLessonIndex].content}</ReactMarkdown>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-4 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium text-slate-500">Step {currentLessonIndex + 1} of {selectedLessons.length || 1}</span>
                <div className="flex w-full flex-col-reverse gap-3 sm:w-auto sm:flex-row sm:items-center">
                  {currentLessonIndex > 0 && (
                    <button
                      type="button"
                      onClick={() => void handlePreviousLesson()}
                      className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 transition-all hover:border-[#000080] hover:text-[#000080]"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Previous Lesson</span>
                    </button>
                  )}
                  {(currentLessonIndex < selectedLessons.length - 1 || !selectedCompleted) && (
                    <button
                      type="button"
                      onClick={() => void handleCompleteLessonModule()}
                      className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#000080] px-7 py-3 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#000066]"
                    >
                      <span>{currentLessonIndex < selectedLessons.length - 1 ? 'Next Lesson' : 'Complete Module'}</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/10 p-3">
      <div className="shrink-0">{icon}</div>
      <div>
        <div className="text-base font-bold">{value}</div>
        <div className="text-[10px] font-bold uppercase opacity-70">{label}</div>
      </div>
    </div>
  );
}
