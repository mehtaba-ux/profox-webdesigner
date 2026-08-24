import { supabase } from './supabase';

export type DiscoveryQuestion={
  id:string;
  prompt:string;
  options:string[];
  sortOrder:number;
  section?:string;
  caseKey?:string;
};

export type DiscoveryAcknowledgement={
  id:string;
  statement:string;
  sortOrder:number;
  required:boolean;
};

export type DiscoveryAttemptFeedback={
  questionId:string;
  sortOrder:number;
  correct:boolean;
  criticalMiss:boolean;
  explanation:string;
};

export type DiscoveryAttempt={
  type?:string;
  score?:number;
  passed?:boolean;
  criticalMisses?:number;
  feedback?:DiscoveryAttemptFeedback[];
  submittedAt?:string;
};

export type DiscoveryTrainingConfig={
  framework:string;
  passingScore:number;
  approvalScope:'onboarding_only';
  futureApprovalRequired:false;
  lessonCount:number;
  lessonsCompleted:number;
  questions:DiscoveryQuestion[];
  acknowledgements:DiscoveryAcknowledgement[];
  latestAttempt?:DiscoveryAttempt|null;
  coachingBenchmarks?:{
    targetedQuestions?:string;
    problemFocus?:string;
    talkListen?:string;
    note?:string;
  };
};

export type DiscoveryAssessmentResult={
  score:number;
  passed:boolean;
  status:'Passed'|'Retry Required';
  passingScore:number;
  criticalMisses:number;
  feedback:DiscoveryAttemptFeedback[];
  approvalScope:'onboarding_only';
  futureApprovalRequired:false;
};

export const discoveryCallTrainingService={
  async getConfig(moduleId:string){
    const {data,error}=await supabase.rpc('get_discovery_call_training_config',{p_module_id:moduleId});
    return {data:(data as DiscoveryTrainingConfig|null)||null,error};
  },
  async completeLesson(progressId:string,lessonId:string){
    return supabase.rpc('complete_discovery_call_lesson',{p_progress_id:progressId,p_lesson_id:lessonId});
  },
  async submitAssessment(progressId:string,answers:number[],acknowledgementIds:string[]){
    const {data,error}=await supabase.rpc('submit_discovery_call_assessment',{
      p_progress_id:progressId,
      p_answers:answers,
      p_acknowledgement_ids:acknowledgementIds
    });
    return {data:(data as DiscoveryAssessmentResult|null)||null,error};
  }
};