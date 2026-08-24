import { supabase } from './supabase';

export type QuotationProcessQuestion={id:string;prompt:string;options:string[];sortOrder:number;section?:string;caseKey?:string};
export type QuotationProcessAcknowledgement={id:string;statement:string;sortOrder:number;required:boolean};
export type QuotationProcessFeedback={questionId:string;sortOrder:number;correct:boolean;criticalMiss:boolean;explanation:string};
export type QuotationProcessAttempt={type?:string;score?:number;passed?:boolean;criticalMisses?:number;feedback?:QuotationProcessFeedback[];submittedAt?:string};
export type QuotationProcessConfig={
  framework:string;
  principle:string;
  passingScore:number;
  lessonCount:number;
  lessonsCompleted:number;
  questions:QuotationProcessQuestion[];
  acknowledgements:QuotationProcessAcknowledgement[];
  latestAttempt?:QuotationProcessAttempt|null;
  operatingStandard?:{
    standardRoute?:string;
    approvalRoute?:string;
    catalogRule?:string;
    handoffRule?:string;
  };
};
export type QuotationProcessAssessmentResult={score:number;passed:boolean;status:'Passed'|'Retry Required';passingScore:number;criticalMisses:number;feedback:QuotationProcessFeedback[]};

export const quotationProcessTrainingService={
  async getConfig(moduleId:string){
    const {data,error}=await supabase.rpc('get_quotation_process_training_config',{p_module_id:moduleId});
    return {data:(data as QuotationProcessConfig|null)||null,error};
  },
  async completeLesson(progressId:string,lessonId:string){
    return supabase.rpc('complete_quotation_process_lesson',{p_progress_id:progressId,p_lesson_id:lessonId});
  },
  async submitAssessment(progressId:string,answers:number[],acknowledgementIds:string[]){
    const {data,error}=await supabase.rpc('submit_quotation_process_assessment',{
      p_progress_id:progressId,
      p_answers:answers,
      p_acknowledgement_ids:acknowledgementIds
    });
    return {data:(data as QuotationProcessAssessmentResult|null)||null,error};
  }
};
