import { supabase } from './supabase';

export type MeetingBookingQuestion={
  id:string;
  prompt:string;
  options:string[];
  sortOrder:number;
  section?:string;
  caseKey?:string;
};

export type MeetingBookingAcknowledgement={
  id:string;
  statement:string;
  sortOrder:number;
  required:boolean;
};

export type MeetingBookingAttemptFeedback={
  questionId:string;
  sortOrder:number;
  correct:boolean;
  criticalMiss:boolean;
  explanation:string;
};

export type MeetingBookingAttempt={
  type?:string;
  score?:number;
  passed?:boolean;
  criticalMisses?:number;
  feedback?:MeetingBookingAttemptFeedback[];
  submittedAt?:string;
};

export type MeetingBookingTrainingConfig={
  framework:string;
  passingScore:number;
  approvalScope:'onboarding_only';
  futureApprovalRequired:false;
  lessonCount:number;
  lessonsCompleted:number;
  questions:MeetingBookingQuestion[];
  acknowledgements:MeetingBookingAcknowledgement[];
  latestAttempt?:MeetingBookingAttempt|null;
  meetingSettings?:Record<string,any>;
  publicBookingSettings?:Record<string,any>;
};

export type MeetingBookingAssessmentResult={
  score:number;
  passed:boolean;
  status:'Passed'|'Retry Required';
  passingScore:number;
  criticalMisses:number;
  feedback:MeetingBookingAttemptFeedback[];
  approvalScope:'onboarding_only';
  futureApprovalRequired:false;
};

export const meetingBookingTrainingService={
  async getConfig(moduleId:string){
    const {data,error}=await supabase.rpc('get_meeting_booking_training_config',{p_module_id:moduleId});
    return {data:(data as MeetingBookingTrainingConfig|null)||null,error};
  },
  async completeLesson(progressId:string,lessonId:string){
    return supabase.rpc('complete_meeting_booking_lesson',{p_progress_id:progressId,p_lesson_id:lessonId});
  },
  async submitAssessment(progressId:string,answers:number[],acknowledgementIds:string[]){
    const {data,error}=await supabase.rpc('submit_meeting_booking_assessment',{
      p_progress_id:progressId,
      p_answers:answers,
      p_acknowledgement_ids:acknowledgementIds
    });
    return {data:(data as MeetingBookingAssessmentResult|null)||null,error};
  }
};
