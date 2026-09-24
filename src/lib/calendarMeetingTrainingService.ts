import { supabase } from './supabase';

export type CalendarTrainingQuestion={id:string;prompt:string;options:string[];sortOrder:number;section?:string;caseKey?:string};
export type CalendarTrainingAcknowledgement={id:string;statement:string;sortOrder:number;required:boolean};
export type CalendarTrainingMission={id:string;missionKey:string;title:string;objective:string;instructions:string;scenarioData:Record<string,any>;sortOrder:number};
export type CalendarTrainingFeedback={questionId:string;sortOrder:number;correct:boolean;criticalMiss:boolean;explanation:string};
export type CalendarTrainingAttempt={type?:string;score?:number;passed?:boolean;criticalMisses?:number;feedback?:CalendarTrainingFeedback[];submittedAt?:string};
export type CalendarTrainingConfig={
  framework:string;
  principle:string;
  passingScore:number;
  lessonCount:number;
  lessonsCompleted:number;
  missionCount:number;
  missionsCompleted:number;
  missions:CalendarTrainingMission[];
  sandboxSnapshot:Record<string,any>;
  questions:CalendarTrainingQuestion[];
  acknowledgements:CalendarTrainingAcknowledgement[];
  latestAttempt?:CalendarTrainingAttempt|null;
  operatingStandard?:{
    capacity?:string;
    timezone?:string;
    preparation?:string;
    trainingIsolation?:string;
  };
};
export type CalendarTrainingMissionResult={missionsCompleted:number;missionCount:number;complete:boolean;progressPercent:number;sandboxSnapshot:Record<string,any>};
export type CalendarTrainingAssessmentResult={score:number;passed:boolean;status:'Passed'|'Retry Required';passingScore:number;criticalMisses:number;feedback:CalendarTrainingFeedback[]};

export const calendarMeetingTrainingService={
  async getConfig(moduleId:string){
    const {data,error}=await supabase.rpc('get_calendar_training_config',{p_module_id:moduleId});
    return {data:(data as CalendarTrainingConfig|null)||null,error};
  },
  async completeLesson(progressId:string,lessonId:string){
    return supabase.rpc('complete_calendar_training_lesson',{p_progress_id:progressId,p_lesson_id:lessonId});
  },
  async submitMission(progressId:string,missionId:string,payload:Record<string,any>){
    const {data,error}=await supabase.rpc('submit_calendar_training_mission',{
      p_progress_id:progressId,
      p_mission_id:missionId,
      p_payload:payload
    });
    return {data:(data as CalendarTrainingMissionResult|null)||null,error};
  },
  async submitAssessment(progressId:string,answers:number[],acknowledgementIds:string[]){
    const {data,error}=await supabase.rpc('submit_calendar_training_assessment',{
      p_progress_id:progressId,
      p_answers:answers,
      p_acknowledgement_ids:acknowledgementIds
    });
    return {data:(data as CalendarTrainingAssessmentResult|null)||null,error};
  }
};
