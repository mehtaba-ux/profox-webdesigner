import { supabase } from './supabase';

export type ConfidentialityTrainingQuestion={id:string;prompt:string;options:string[];sortOrder:number;section?:string;caseKey?:string};
export type ConfidentialityTrainingAcknowledgement={id:string;statement:string;sortOrder:number;required:boolean};
export type ConfidentialityTrainingMission={id:string;missionKey:string;title:string;objective:string;instructions:string;scenarioData:Record<string,any>;sortOrder:number};
export type ConfidentialityTrainingFeedback={questionId:string;sortOrder:number;correct:boolean;criticalMiss:boolean;explanation:string};
export type ConfidentialityTrainingAttempt={type?:string;score?:number;passed?:boolean;criticalMisses?:number;feedback?:ConfidentialityTrainingFeedback[];submittedAt?:string};
export type ConfidentialityTrainingConfig={
 framework:string;principle:string;passingScore:number;lessonCount:number;lessonsCompleted:number;missionCount:number;missionsCompleted:number;
 missions:ConfidentialityTrainingMission[];sandboxSnapshot:Record<string,any>;questions:ConfidentialityTrainingQuestion[];acknowledgements:ConfidentialityTrainingAcknowledgement[];latestAttempt?:ConfidentialityTrainingAttempt|null;
 operatingStandard?:{minimize?:string;access?:string;sharing?:string;incident?:string;trainingIsolation?:string};
};
export type ConfidentialityTrainingMissionResult={missionsCompleted:number;missionCount:number;complete:boolean;progressPercent:number;sandboxSnapshot:Record<string,any>};
export type ConfidentialityTrainingAssessmentResult={score:number;passed:boolean;status:'Passed'|'Retry Required';passingScore:number;criticalMisses:number;feedback:ConfidentialityTrainingFeedback[]};

export const confidentialityTrainingService={
 async getConfig(moduleId:string){const{data,error}=await supabase.rpc('get_confidentiality_training_config',{p_module_id:moduleId});return{data:(data as ConfidentialityTrainingConfig|null)||null,error};},
 async completeLesson(progressId:string,lessonId:string){return supabase.rpc('complete_confidentiality_training_lesson',{p_progress_id:progressId,p_lesson_id:lessonId});},
 async submitMission(progressId:string,missionId:string,payload:Record<string,any>){const{data,error}=await supabase.rpc('submit_confidentiality_training_mission',{p_progress_id:progressId,p_mission_id:missionId,p_payload:payload});return{data:(data as ConfidentialityTrainingMissionResult|null)||null,error};},
 async submitAssessment(progressId:string,answers:number[],acknowledgementIds:string[]){const{data,error}=await supabase.rpc('submit_confidentiality_training_assessment',{p_progress_id:progressId,p_answers:answers,p_acknowledgement_ids:acknowledgementIds});return{data:(data as ConfidentialityTrainingAssessmentResult|null)||null,error};}
};
