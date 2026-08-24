import { supabase } from './supabase';

export type ClosingQuestion={
  id:string;
  prompt:string;
  options:string[];
  sortOrder:number;
  section?:string;
  caseKey?:string;
};

export type ClosingAcknowledgement={
  id:string;
  statement:string;
  sortOrder:number;
  required:boolean;
};

export type ClosingAttemptFeedback={
  questionId:string;
  sortOrder:number;
  correct:boolean;
  criticalMiss:boolean;
  explanation:string;
};

export type ClosingAttempt={
  type?:string;
  score?:number;
  passed?:boolean;
  criticalMisses?:number;
  feedback?:ClosingAttemptFeedback[];
  submittedAt?:string;
};

export type ClosingTrainingConfig={
  framework:string;
  principle:string;
  passingScore:number;
  lessonCount:number;
  lessonsCompleted:number;
  questions:ClosingQuestion[];
  acknowledgements:ClosingAcknowledgement[];
  latestAttempt?:ClosingAttempt|null;
  operatingStandard?:{
    readinessRule?:string;
    askRule?:string;
    commitmentRule?:string;
    handoffRule?:string;
  };
};

export type ClosingAssessmentResult={
  score:number;
  passed:boolean;
  status:'Passed'|'Retry Required';
  passingScore:number;
  criticalMisses:number;
  feedback:ClosingAttemptFeedback[];
};

export const closingTrainingService={
  async getConfig(moduleId:string){
    const {data,error}=await supabase.rpc('get_closing_training_config',{p_module_id:moduleId});
    return {data:(data as ClosingTrainingConfig|null)||null,error};
  },
  async completeLesson(progressId:string,lessonId:string){
    return supabase.rpc('complete_closing_training_lesson',{p_progress_id:progressId,p_lesson_id:lessonId});
  },
  async submitAssessment(progressId:string,answers:number[],acknowledgementIds:string[]){
    const {data,error}=await supabase.rpc('submit_closing_training_assessment',{
      p_progress_id:progressId,
      p_answers:answers,
      p_acknowledgement_ids:acknowledgementIds
    });
    return {data:(data as ClosingAssessmentResult|null)||null,error};
  }
};
