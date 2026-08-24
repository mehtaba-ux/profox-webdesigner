import { supabase } from './supabase';

export type CrmTrainingQuestion={id:string;prompt:string;options:string[];sortOrder:number;section?:string;caseKey?:string};
export type CrmTrainingAcknowledgement={id:string;statement:string;sortOrder:number;required:boolean};
export type CrmTrainingMission={id:string;missionKey:string;title:string;objective:string;instructions:string;scenarioData:Record<string,any>;sortOrder:number};
export type CrmTrainingFeedback={questionId:string;sortOrder:number;correct:boolean;criticalMiss:boolean;explanation:string};
export type CrmTrainingAttempt={type?:string;score?:number;passed?:boolean;criticalMisses?:number;feedback?:CrmTrainingFeedback[];submittedAt?:string};
export type CrmTrainingConfig={
  framework:string;
  principle:string;
  passingScore:number;
  lessonCount:number;
  lessonsCompleted:number;
  missionCount:number;
  missionsCompleted:number;
  missions:CrmTrainingMission[];
  sandboxSnapshot:Record<string,any>;
  questions:CrmTrainingQuestion[];
  acknowledgements:CrmTrainingAcknowledgement[];
  latestAttempt?:CrmTrainingAttempt|null;
  operatingStandard?:{
    sourceOfTruth?:string;
    trainingIsolation?:string;
    stageRule?:string;
    wonRule?:string;
  };
};
export type CrmTrainingMissionResult={missionsCompleted:number;missionCount:number;complete:boolean;progressPercent:number;sandboxSnapshot:Record<string,any>};
export type CrmTrainingAssessmentResult={score:number;passed:boolean;status:'Passed'|'Retry Required';passingScore:number;criticalMisses:number;feedback:CrmTrainingFeedback[]};

export const crmTrainingService={
  async getConfig(moduleId:string){
    const {data,error}=await supabase.rpc('get_crm_training_config',{p_module_id:moduleId});
    return {data:(data as CrmTrainingConfig|null)||null,error};
  },
  async completeLesson(progressId:string,lessonId:string){
    return supabase.rpc('complete_crm_training_lesson',{p_progress_id:progressId,p_lesson_id:lessonId});
  },
  async submitMission(progressId:string,missionId:string,payload:Record<string,any>){
    const {data,error}=await supabase.rpc('submit_crm_training_mission',{
      p_progress_id:progressId,
      p_mission_id:missionId,
      p_payload:payload
    });
    return {data:(data as CrmTrainingMissionResult|null)||null,error};
  },
  async submitAssessment(progressId:string,answers:number[],acknowledgementIds:string[]){
    const {data,error}=await supabase.rpc('submit_crm_training_assessment',{
      p_progress_id:progressId,
      p_answers:answers,
      p_acknowledgement_ids:acknowledgementIds
    });
    return {data:(data as CrmTrainingAssessmentResult|null)||null,error};
  }
};
