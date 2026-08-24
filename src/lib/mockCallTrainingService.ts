import { supabase } from './supabase';

export type PracticeDrill={id:string;title:string;category:string;instructions:string;completionPrompt:string;required:boolean;sortOrder:number;completed:boolean;reflection?:string};
export type PracticeRehearsal={rehearsalNo:number;score:number;scores:Record<string,number>;reflection:string;submittedAt?:string};
export type CallPracticeConfig={
  framework:string;lessonCount:number;lessonsCompleted:number;drillsCompleted:number;requiredDrills:number;
  rehearsals:PracticeRehearsal[];rehearsalsRequired:number;readinessBenchmark:number;
  availability:Record<string,any>;readinessAcknowledged:boolean;completed:boolean;drills:PracticeDrill[];
};
export type MockCallHistory={id:string;attemptNo:number;status:string;score?:number|null;feedback?:string;scenarioName:string;scheduledStartAt?:string|null;evaluatedAt?:string|null};
export type TraineeMockCall={
  hasSession:boolean;id?:string;attemptNo?:number;status?:string;scenarioName?:string;sellerBrief?:Record<string,any>;
  evaluatorName?:string;scheduledStartAt?:string|null;scheduledEndAt?:string|null;timezone?:string;meetingUrl?:string;
  score?:number|null;feedback?:string;passingScore:number;history?:MockCallHistory[];
};
export type EvaluatorQueueItem={id:string;attemptNo:number;traineeId:string;traineeName:string;scenarioName:string;scheduledStartAt?:string|null;scheduledEndAt?:string|null;timezone:string;meetingUrl:string;status:string};
export type EvaluatorSession={
  id:string;attemptNo:number;traineeId:string;traineeName:string;scenarioName:string;scenarioVersion:number;
  sellerBrief:Record<string,any>;evaluatorBrief:Record<string,any>;evaluatorInstructions:string;
  rubric:Array<{id:string;title:string;description:string;maxPoints:number;sortOrder:number}>;
  criticalRules:Array<{id:string;title:string;description:string;sortOrder:number}>;
  scheduledStartAt?:string|null;scheduledEndAt?:string|null;timezone:string;meetingUrl:string;status:string;score?:number|null;feedback?:string;
};

export const mockCallTrainingService={
  async getPracticeConfig(moduleId:string){const{data,error}=await supabase.rpc('get_call_practice_training_config',{p_module_id:moduleId});return{data:(data as CallPracticeConfig|null)||null,error};},
  async completePracticeLesson(progressId:string,lessonId:string){return supabase.rpc('complete_call_practice_lesson',{p_progress_id:progressId,p_lesson_id:lessonId});},
  async completePracticeDrill(progressId:string,drillId:string,reflection:string){return supabase.rpc('complete_call_practice_drill',{p_progress_id:progressId,p_drill_id:drillId,p_reflection:reflection});},
  async submitRehearsal(progressId:string,rehearsalNo:number,scores:Record<string,number>,reflection:string){return supabase.rpc('submit_call_practice_rehearsal',{p_progress_id:progressId,p_rehearsal_no:rehearsalNo,p_scores:scores,p_reflection:reflection});},
  async completePracticeAndSchedule(progressId:string,availability:Record<string,any>){const{data,error}=await supabase.rpc('complete_call_practice_and_schedule',{p_progress_id:progressId,p_availability:availability,p_readiness_acknowledged:true});return{data,error};},
  async getMyMockCall(moduleId:string){const{data,error}=await supabase.rpc('get_my_mock_call_session',{p_module_id:moduleId});return{data:(data as TraineeMockCall|null)||null,error};},
  async getEvaluatorQueue(){const{data,error}=await supabase.rpc('get_my_mock_call_evaluator_queue');return{data:(data as EvaluatorQueueItem[]|null)||[],error};},
  async getEvaluatorSession(sessionId:string){const{data,error}=await supabase.rpc('get_mock_call_evaluator_session',{p_session_id:sessionId});return{data:(data as EvaluatorSession|null)||null,error};},
  async updateMeetingLink(sessionId:string,meetingUrl:string){return supabase.rpc('update_mock_call_meeting_link',{p_session_id:sessionId,p_meeting_url:meetingUrl});},
  async declineAssignment(sessionId:string,reason:string){return supabase.rpc('decline_mock_call_assignment',{p_session_id:sessionId,p_reason:reason});},
  async submitEvaluation(sessionId:string,rubricScores:Record<string,number>,criticalRuleIds:string[],feedback:string){const{data,error}=await supabase.rpc('submit_mock_call_evaluation',{p_session_id:sessionId,p_rubric_scores:rubricScores,p_critical_rule_ids:criticalRuleIds,p_feedback:feedback});return{data,error};},
  async updateAutomationSettings(settings:Record<string,any>){const{data,error}=await supabase.rpc('admin_update_mock_call_automation_settings',{p_settings:settings});return{data,error};},
  async reprocessSession(sessionId:string){const{data,error}=await supabase.rpc('admin_reprocess_mock_call_session',{p_session_id:sessionId});return{data,error};}
};
