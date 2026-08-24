import { supabase } from './supabase';

export type FinalCertificationMission={
  id:string;
  missionKey:string;
  title:string;
  objective:string;
  instructions:string;
  scenarioData:Record<string,any>;
  sortOrder:number;
};
export type FinalCertificationQuestion={id:string;prompt:string;options:string[];sortOrder:number;section?:string;caseKey?:string};
export type FinalCertificationAcknowledgement={id:string;statement:string;sortOrder:number;required:boolean};
export type FinalCertificationFeedback={questionId:string;sortOrder:number;correct:boolean;criticalMiss:boolean;explanation:string};
export type FinalCertificationLiveSession={
  id:string;
  attemptNo:number;
  caseName:string;
  sellerBrief:Record<string,any>;
  status:string;
  evaluatorName?:string|null;
  scheduledStartAt?:string|null;
  scheduledEndAt?:string|null;
  meetingUrl?:string|null;
  score?:number|null;
  feedback?:string|null;
  selfAssessmentSubmitted?:boolean;
};
export type FinalCertificationCatalogItem={code:string;name:string;category:string;productType:string;priceMode:string;basePrice:number;currency:string;managerApprovalRequired:boolean;standardPaymentTerms?:string|null;paymentSchedule?:any};
export type FinalCertificationConfig={
  framework:string;
  principle:string;
  passingScore:number;
  briefingCount:number;
  briefingsCompleted:number;
  missionCount:number;
  missionsCompleted:number;
  missions:FinalCertificationMission[];
  salesCatalog:FinalCertificationCatalogItem[];
  sandboxSnapshot:Record<string,any>;
  questions:FinalCertificationQuestion[];
  acknowledgements:FinalCertificationAcknowledgement[];
  judgmentPassed:boolean;
  judgmentScore?:number|null;
  judgmentCriticalMisses?:number|null;
  liveSession?:FinalCertificationLiveSession|null;
  operatingStandard?:Record<string,string>;
};
export type FinalCertificationMissionResult={missionsCompleted:number;missionCount:number;complete:boolean;progressPercent:number;sandboxSnapshot:Record<string,any>};
export type FinalCertificationJudgmentResult={score:number;passed:boolean;status:string;passingScore:number;criticalMisses:number;feedback:FinalCertificationFeedback[];liveSessionId?:string|null};

export const finalCertificationService={
  async getConfig(moduleId:string){
    const {data,error}=await supabase.rpc('get_final_certification_config',{p_module_id:moduleId});
    return {data:(data as FinalCertificationConfig|null)||null,error};
  },
  async completeBriefing(progressId:string,lessonId:string){
    return supabase.rpc('complete_final_certification_briefing',{p_progress_id:progressId,p_lesson_id:lessonId});
  },
  async submitMission(progressId:string,missionId:string,payload:Record<string,any>){
    const {data,error}=await supabase.rpc('submit_final_certification_mission',{p_progress_id:progressId,p_mission_id:missionId,p_payload:payload});
    return {data:(data as FinalCertificationMissionResult|null)||null,error};
  },
  async submitJudgment(progressId:string,answers:number[],acknowledgementIds:string[]){
    const {data,error}=await supabase.rpc('submit_final_certification_judgment',{p_progress_id:progressId,p_answers:answers,p_acknowledgement_ids:acknowledgementIds});
    return {data:(data as FinalCertificationJudgmentResult|null)||null,error};
  },
  async submitSelfAssessment(progressId:string,payload:Record<string,string>){
    return supabase.rpc('submit_final_certification_self_assessment',{p_progress_id:progressId,p_payload:payload});
  },
  async claimLiveSession(sessionId:string){return supabase.rpc('admin_claim_final_certification_session',{p_session_id:sessionId});},
  async scheduleLiveSession(sessionId:string,startAt:string,durationMinutes:number,meetingUrl:string){return supabase.rpc('admin_schedule_final_certification_session',{p_session_id:sessionId,p_start_at:startAt,p_duration_minutes:durationMinutes,p_meeting_url:meetingUrl});},
  async markLiveComplete(sessionId:string){return supabase.rpc('admin_mark_final_certification_live_complete',{p_session_id:sessionId});},
  async submitLiveEvaluation(sessionId:string,rubricScores:Record<string,number>,criticalRuleIds:string[],feedback:string){return supabase.rpc('admin_submit_final_certification_evaluation',{p_session_id:sessionId,p_rubric_scores:rubricScores,p_critical_rule_ids:criticalRuleIds,p_feedback:feedback});}
};
