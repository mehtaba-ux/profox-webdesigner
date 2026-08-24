import { supabase } from './supabase';

export type UIUXApplicant = {
  id:string; fullName:string; email:string; phone?:string; country?:string; timezone?:string; position:string; stage:string; rating:number;
  linkedUserId?:string; agreementStatus:string; onboardingStatus:string; onboardingProgress:number; finalApproval:boolean; refusalReason?:string;
  applicationReference?:string; applicationSubmittedAt?:string; portfolioUrl?:string; cvStoragePath?:string; cvUrl?:string; linkedinUrl?:string;
  availableHoursPerWeek?:number; applicationAnswers:Record<string,any>; careerJobId:string; createdAt:string; updatedAt:string;
};

export type UIUXStagePolicy = {
  id?:string; jobId?:string; stage:string; sortOrder:number; active:boolean; assessmentRequired:boolean; passingScore?:number|null;
  slaHours:number; interviewRequired:boolean; rubric:Array<{key:string;label:string;maxPoints:number}>;
};

const arr = <T,>(value:unknown):T[] => Array.isArray(value) ? value as T[] : [];
const mapApplicant=(r:any):UIUXApplicant=>({
  id:r.id,fullName:r.full_name,email:r.email,phone:r.phone,country:r.country,timezone:r.timezone,position:r.position,stage:r.stage,rating:Number(r.rating||0),
  linkedUserId:r.linked_user_id||undefined,agreementStatus:r.agreement_status||'not_sent',onboardingStatus:r.onboarding_status||'not_started',onboardingProgress:Number(r.onboarding_progress||0),
  finalApproval:Boolean(r.final_approval),refusalReason:r.refusal_reason||undefined,applicationReference:r.application_reference||undefined,applicationSubmittedAt:r.application_submitted_at||undefined,
  portfolioUrl:r.portfolio_url||undefined,cvStoragePath:r.cv_storage_path||undefined,cvUrl:r.cv_url||undefined,linkedinUrl:r.linkedin_url||undefined,
  availableHoursPerWeek:r.available_hours_per_week==null?undefined:Number(r.available_hours_per_week),applicationAnswers:r.application_answers&&typeof r.application_answers==='object'?r.application_answers:{},
  careerJobId:r.career_job_id,createdAt:r.created_at,updatedAt:r.updated_at,
});

export const uiuxPeopleService={
  async getJob(){const {data,error}=await supabase.from('career_jobs').select('*').eq('slug','ui-ux-designer').maybeSingle();if(error)throw error;return data;},
  async getApplicants():Promise<UIUXApplicant[]>{
    const {data:job,error:jobError}=await supabase.from('career_jobs').select('id').eq('slug','ui-ux-designer').maybeSingle();
    if(jobError)throw jobError;if(!job?.id)return[];
    const {data,error}=await supabase.from('applicants').select('*').eq('career_job_id',job.id).order('created_at',{ascending:false});
    if(error)throw error;return(data||[]).map(mapApplicant);
  },
  async getPolicies(jobId:string):Promise<UIUXStagePolicy[]>{
    const {data,error}=await supabase.rpc('admin_get_recruitment_stage_policies',{p_job_id:jobId});if(error)throw error;
    return arr<any>(data).map(r=>({id:r.id,jobId:r.jobId,stage:String(r.stage||''),sortOrder:Number(r.sortOrder||0),active:r.active!==false,assessmentRequired:Boolean(r.assessmentRequired),passingScore:r.passingScore==null?null:Number(r.passingScore),slaHours:Number(r.slaHours||0),interviewRequired:Boolean(r.interviewRequired),rubric:arr<any>(r.rubric).map(x=>({key:String(x.key||''),label:String(x.label||''),maxPoints:Number(x.maxPoints||0)}))}));
  },
  async getSnapshot(applicantId:string){const{data,error}=await supabase.rpc('admin_get_applicant_review_snapshot',{p_applicant_id:applicantId});if(error)throw error;return data;},
  async getTimeline(applicantId:string){const{data,error}=await supabase.rpc('admin_get_applicant_timeline',{p_applicant_id:applicantId});if(error)throw error;return arr<any>(data);},
  async getWorkflowMeta(applicantId:string){const{data,error}=await supabase.rpc('admin_get_applicant_workflow_meta',{p_applicant_id:applicantId});if(error)throw error;return data||{};},
  async getAssessments(applicantId:string){const{data,error}=await supabase.rpc('admin_get_recruitment_assessments',{p_applicant_id:applicantId});if(error)throw error;return arr<any>(data);},
  async recordAssessment(input:{applicantId:string;stage:string;status:'Passed'|'Failed'|'Retry Required';score:number;rubricScores:Record<string,number>;criticalFailures:string[];evidence:string;evidenceUrl:string;notes:string}){
    const{error}=await supabase.rpc('admin_record_recruitment_assessment',{p_applicant_id:input.applicantId,p_stage:input.stage,p_status:input.status,p_score:input.score,p_rubric_scores:input.rubricScores,p_critical_failures:input.criticalFailures,p_evidence:input.evidence,p_evidence_url:input.evidenceUrl,p_notes:input.notes});if(error)throw error;
  },
  async getInterviews(applicantId:string){const{data,error}=await supabase.rpc('admin_get_recruitment_interviews',{p_applicant_id:applicantId});if(error)throw error;return arr<any>(data);},
  async scheduleInterview(input:{applicantId:string;startAt:string;endAt:string;timezone:string;meetingUrl?:string;interviewerId?:string|null}){
    const{error}=await supabase.rpc('admin_schedule_recruitment_interview',{p_applicant_id:input.applicantId,p_start_at:input.startAt,p_end_at:input.endAt,p_timezone:input.timezone,p_meeting_url:input.meetingUrl||'',p_interviewer_id:input.interviewerId||null});if(error)throw error;
  },
  async updateInterview(input:{interviewId:string;status:string;outcomeNotes:string;meetingUrl?:string|null}){const{error}=await supabase.rpc('admin_update_recruitment_interview',{p_interview_id:input.interviewId,p_status:input.status,p_outcome_notes:input.outcomeNotes,p_meeting_url:input.meetingUrl??null});if(error)throw error;},
  async advance(applicantId:string){const{error}=await supabase.rpc('admin_advance_applicant_stage',{p_applicant_id:applicantId,p_target_stage:null});if(error)throw error;},
  async close(applicantId:string,reason:string,notes:string){const{error}=await supabase.rpc('admin_close_applicant',{p_applicant_id:applicantId,p_reason:reason,p_notes:notes});if(error)throw error;},
  async issueAgreement(applicantId:string){const{data,error}=await supabase.rpc('admin_issue_candidate_agreement',{p_applicant_id:applicantId});if(error)throw error;return data;},
  async sendAcademyAccess(applicantId:string){const{data,error}=await supabase.functions.invoke('recruitment-account-invite',{body:{applicantId}});if(error)throw new Error((error as any)?.context?.error||error.message||'Account invitation failed.');if(!data?.ok)throw new Error(data?.error||'Account invitation failed.');return data;},
  async getAcademyStatus(userId:string){const{data,error}=await supabase.rpc('admin_get_uiux_academy_status',{p_user_id:userId});if(error)throw error;return data||{track:'uiux_design',modules:[],readyForFinalApproval:false};},
  async reviewTraining(progressId:string,status:'Passed'|'Retry Required',feedback:string,score:number){const{error}=await supabase.rpc('admin_review_training_progress',{p_progress_id:progressId,p_status:status,p_feedback:feedback.trim(),p_score:Math.max(0,Math.min(100,Math.round(score)))});if(error)throw error;},
  async finalApprove(applicantId:string){const{error}=await supabase.rpc('approve_uiux_candidate_final',{p_applicant_id:applicantId});if(error)throw error;},
  async activate(userId:string){const{error}=await supabase.rpc('activate_uiux_designer',{p_user_id:userId});if(error)throw error;},
  async getSecureCv(path?:string){if(!path)return'';if(!path.startsWith('applications/'))throw new Error('Invalid recruitment file path.');const{data,error}=await supabase.storage.from('recruitment-applications').createSignedUrl(path,900);if(error)throw error;return data?.signedUrl||'';},
};
