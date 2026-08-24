import { supabase } from './supabase';

export type PaymentProcessQuestion={id:string;prompt:string;options:string[];sortOrder:number;section?:string;caseKey?:string};
export type PaymentProcessAcknowledgement={id:string;statement:string;sortOrder:number;required:boolean};
export type PaymentProcessFeedback={questionId:string;sortOrder:number;correct:boolean;criticalMiss:boolean;explanation:string};
export type PaymentProcessAttempt={type?:string;score?:number;passed?:boolean;criticalMisses?:number;feedback?:PaymentProcessFeedback[];submittedAt?:string};
export type PaymentProcessConfig={
  framework:string;
  principle:string;
  passingScore:number;
  lessonCount:number;
  lessonsCompleted:number;
  questions:PaymentProcessQuestion[];
  acknowledgements:PaymentProcessAcknowledgement[];
  latestAttempt?:PaymentProcessAttempt|null;
  operatingStandard?:{
    salesAuthority?:string;
    verificationRule?:string;
    sourceOfTruth?:string;
    activationRule?:string;
  };
};
export type PaymentProcessAssessmentResult={score:number;passed:boolean;status:'Passed'|'Retry Required';passingScore:number;criticalMisses:number;feedback:PaymentProcessFeedback[]};

export const paymentProcessTrainingService={
  async getConfig(moduleId:string){
    const {data,error}=await supabase.rpc('get_payment_process_training_config',{p_module_id:moduleId});
    return {data:(data as PaymentProcessConfig|null)||null,error};
  },
  async completeLesson(progressId:string,lessonId:string){
    return supabase.rpc('complete_payment_process_lesson',{p_progress_id:progressId,p_lesson_id:lessonId});
  },
  async submitAssessment(progressId:string,answers:number[],acknowledgementIds:string[]){
    const {data,error}=await supabase.rpc('submit_payment_process_assessment',{
      p_progress_id:progressId,
      p_answers:answers,
      p_acknowledgement_ids:acknowledgementIds
    });
    return {data:(data as PaymentProcessAssessmentResult|null)||null,error};
  }
};
