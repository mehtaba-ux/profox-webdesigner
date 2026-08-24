import { supabase } from './supabase';

export type ObjectionQuestion={
  id:string;
  prompt:string;
  options:string[];
  sortOrder:number;
  section?:string;
  caseKey?:string;
};

export type ObjectionAcknowledgement={
  id:string;
  statement:string;
  sortOrder:number;
  required:boolean;
};

export type ObjectionAttemptFeedback={
  questionId:string;
  sortOrder:number;
  correct:boolean;
  criticalMiss:boolean;
  explanation:string;
};

export type ObjectionAttempt={
  type?:string;
  score?:number;
  passed?:boolean;
  criticalMisses?:number;
  feedback?:ObjectionAttemptFeedback[];
  submittedAt?:string;
};

export type ObjectionTrainingConfig={
  framework:string;
  principle:string;
  passingScore:number;
  lessonCount:number;
  lessonsCompleted:number;
  questions:ObjectionQuestion[];
  acknowledgements:ObjectionAcknowledgement[];
  latestAttempt?:ObjectionAttempt|null;
  operatingStandard?:{
    diagnoseFirst?:string;
    responseRule?:string;
    escalationRule?:string;
    stopRule?:string;
  };
};

export type ObjectionAssessmentResult={
  score:number;
  passed:boolean;
  status:'Passed'|'Retry Required';
  passingScore:number;
  criticalMisses:number;
  feedback:ObjectionAttemptFeedback[];
};

export const objectionHandlingTrainingService={
  async getConfig(moduleId:string){
    const {data,error}=await supabase.rpc('get_objection_handling_training_config',{p_module_id:moduleId});
    return {data:(data as ObjectionTrainingConfig|null)||null,error};
  },
  async completeLesson(progressId:string,lessonId:string){
    return supabase.rpc('complete_objection_handling_lesson',{p_progress_id:progressId,p_lesson_id:lessonId});
  },
  async submitAssessment(progressId:string,answers:number[],acknowledgementIds:string[]){
    const {data,error}=await supabase.rpc('submit_objection_handling_assessment',{
      p_progress_id:progressId,
      p_answers:answers,
      p_acknowledgement_ids:acknowledgementIds
    });
    return {data:(data as ObjectionAssessmentResult|null)||null,error};
  }
};
