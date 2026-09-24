import { supabase } from './supabase';

export type PresentationQuestion={
  id:string;
  prompt:string;
  options:string[];
  sortOrder:number;
  section?:string;
  caseKey?:string;
};

export type PresentationAcknowledgement={
  id:string;
  statement:string;
  sortOrder:number;
  required:boolean;
};

export type PresentationAttemptFeedback={
  questionId:string;
  sortOrder:number;
  correct:boolean;
  criticalMiss:boolean;
  explanation:string;
};

export type PresentationAttempt={
  type?:string;
  score?:number;
  passed?:boolean;
  criticalMisses?:number;
  feedback?:PresentationAttemptFeedback[];
  submittedAt?:string;
};

export type PresentationTrainingConfig={
  framework:string;
  principle:string;
  passingScore:number;
  lessonCount:number;
  lessonsCompleted:number;
  questions:PresentationQuestion[];
  acknowledgements:PresentationAcknowledgement[];
  latestAttempt?:PresentationAttempt|null;
  operatingStandard?:{
    priorityLimit?:string;
    proofRule?:string;
    interactionRule?:string;
    commercialRule?:string;
  };
};

export type PresentationAssessmentResult={
  score:number;
  passed:boolean;
  status:'Passed'|'Retry Required';
  passingScore:number;
  criticalMisses:number;
  feedback:PresentationAttemptFeedback[];
};

export const productPresentationTrainingService={
  async getConfig(moduleId:string){
    const {data,error}=await supabase.rpc('get_product_presentation_training_config',{p_module_id:moduleId});
    return {data:(data as PresentationTrainingConfig|null)||null,error};
  },
  async completeLesson(progressId:string,lessonId:string){
    return supabase.rpc('complete_product_presentation_lesson',{p_progress_id:progressId,p_lesson_id:lessonId});
  },
  async submitAssessment(progressId:string,answers:number[],acknowledgementIds:string[]){
    const {data,error}=await supabase.rpc('submit_product_presentation_assessment',{
      p_progress_id:progressId,
      p_answers:answers,
      p_acknowledgement_ids:acknowledgementIds
    });
    return {data:(data as PresentationAssessmentResult|null)||null,error};
  }
};
