import { supabase } from './supabase';
import { agreementService } from './agreementService';
import { Applicant, ApplicantStage, AgreementStatus, OnboardingStatus } from '../types';

export interface ApplicantApplicationData {
  applicationReference?: string;
  applicationVersion?: string;
  applicationPolicyVersion?: string;
  applicationSubmittedAt?: string;
  careerJobId?: string;
  careerJobTitle?: string;
  careerJobSlug?: string;
  applicationType?: string;
  portfolioUrl?: string;
  applicationAnswers?: Record<string, any>;
  currentJobTitle?: string;
  digitalSalesExperience?: string;
  internationalSalesExperience?: string;
  englishRating?: string;
  salesExperienceMonths?: number;
  b2bExperienceMonths?: number;
  countryCode?: string;
  targetMarkets: string[];
  prospectingChannels: string[];
  crmExperience?: string;
  weeklyAvailability?: string;
  availableDays: string[];
  availableHoursPerWeek?: number;
  preferredWorkWindow?: string;
  earliestStartDate?: string;
  previousSalesResults?: string;
  sampleOutreachMessage?: string;
  professionalReference?: string;
  heardAboutSource?: string;
  heardAboutDetail?: string;
  motivation?: string;
  hasLaptopInternet?: boolean;
  comfortableCommission?: boolean;
  comfortableSourcing?: boolean;
  comfortableEnglishCalls?: boolean;
  videoCommitment?: boolean;
  accuracyConfirmedAt?: string;
  privacyConsentAt?: string;
  cvStoragePath?: string;
  videoStoragePath?: string;
}

export type ApplicantRecord = Applicant & ApplicantApplicationData;

export interface ApplicantReviewCheck { key:string; label:string; passed:boolean; detail?:string }
export interface ApplicantReviewSnapshot {
  reference?: string;
  applicationVersion?: string;
  policyVersion?: string;
  submittedAt?: string;
  currentStage?: string;
  portfolioUrl?: string;
  answers?: Record<string, any>;
  checks: ApplicantReviewCheck[];
  passedChecks: number;
  totalChecks: number;
  completenessPercent: number;
  readyForReview: boolean;
  currentPolicy?: { minimumSalesExperienceMonths?:number; minimumWeeklyHours?:number; jobUpdatedAt?:string };
}
export interface ApplicantTimelineEvent {
  id:string; category:string; type:string; title:string; detail?:string; status?:string; occurredAt:string; actor?:string; metadata?:Record<string,any>;
}

export interface SalesApplicationV3Payload {
  fullName:string; email:string; phone:string; country:string; countryCode:string; timezone:string; linkedinUrl:string; currentRole?:string;
  salesExperience:string; salesExperienceMonths:number; b2bExperienceMonths?:number|null; digitalSalesExperience?:string; internationalSalesExperience?:string;
  englishRating:string; previousSalesResults:string; targetMarkets:string[]; prospectingChannels:string[]; crmExperience?:string;
  availableDays:string[]; availableHoursPerWeek:number; preferredWorkWindow?:string; earliestStartDate?:string;
  sampleOutreachMessage:string; professionalReference?:string; heardAboutSource?:string; heardAboutDetail?:string; message?:string;
  hasLaptopInternet:boolean; comfortableCommission:boolean; comfortableSourcing:boolean; comfortableEnglishCalls:boolean; videoCommitment:boolean;
  consentAccurate:boolean; consentPrivacy:boolean; cvUrl?:string; videoUrl?:string; cvStoragePath?:string; videoStoragePath?:string;
}

const APPLICANT_SELECT='*, career_job:career_jobs(id,title,slug,application_type)';

export const applicantService = {
  async getApplicants(): Promise<ApplicantRecord[]> {
    const { data, error } = await supabase.from('applicants').select(APPLICANT_SELECT).order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(this.mapFromDb);
  },
  async getApplicantById(id: string): Promise<ApplicantRecord> {
    const { data, error } = await supabase.from('applicants').select(APPLICANT_SELECT).eq('id', id).single();
    if (error) throw error;
    return this.mapFromDb(data);
  },
  async getApplicantReviewSnapshot(id:string):Promise<ApplicantReviewSnapshot|null>{
    const {data,error}=await supabase.rpc('admin_get_applicant_review_snapshot',{p_applicant_id:id});
    if(error)throw error;
    return data ? {
      ...data,
      portfolioUrl:data.portfolioUrl||undefined,
      answers:data.answers&&typeof data.answers==='object'?data.answers:{},
      checks:Array.isArray(data.checks)?data.checks:[],
      passedChecks:Number(data.passedChecks||0),totalChecks:Number(data.totalChecks||0),completenessPercent:Number(data.completenessPercent||0),readyForReview:Boolean(data.readyForReview)
    } as ApplicantReviewSnapshot : null;
  },
  async getApplicantTimeline(id:string):Promise<ApplicantTimelineEvent[]>{
    const {data,error}=await supabase.rpc('admin_get_applicant_timeline',{p_applicant_id:id});
    if(error)throw error;
    return Array.isArray(data)?data:[];
  },
  async getSecureApplicationFileUrl(storagePath?:string){
    if(!storagePath)return '';
    if(!storagePath.startsWith('applications/'))throw new Error('Invalid recruitment file path.');
    const {data,error}=await supabase.storage.from('recruitment-applications').createSignedUrl(storagePath,900);
    if(error)throw error;
    return data?.signedUrl||'';
  },
  async uploadPublicApplicationFile(email:string,kind:'cv'|'video',file:File,onProgress?:(value:number)=>void){
    const cvTypes=['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const videoTypes=['video/mp4','video/webm','video/quicktime'];
    const max=kind==='cv'?8*1024*1024:80*1024*1024;
    if(!(kind==='cv'?cvTypes:videoTypes).includes(file.type))throw new Error(kind==='cv'?'CV must be PDF, DOC or DOCX.':'Video must be MP4, WebM or MOV.');
    if(file.size<1||file.size>max)throw new Error(kind==='cv'?'CV must be 8 MB or smaller.':'Video must be 80 MB or smaller.');
    onProgress?.(10);
    const {data:intent,error:intentError}=await supabase.functions.invoke('recruitment-upload-intent',{body:{email,kind,filename:file.name,contentType:file.type,sizeBytes:file.size}});
    if(intentError)throw new Error((intentError as any)?.context?.error||intentError.message||'Could not prepare secure upload.');
    if(!intent?.path||!intent?.token)throw new Error(intent?.error||'Could not prepare secure upload.');
    onProgress?.(35);
    const {error:uploadError}=await supabase.storage.from('recruitment-applications').uploadToSignedUrl(intent.path,intent.token,file,{contentType:file.type});
    if(uploadError)throw uploadError;
    onProgress?.(100);
    return {path:intent.path as string,expiresAt:intent.expiresAt as string};
  },
  async createApplicant(applicant: Partial<ApplicantRecord>) {
    const { data, error } = await supabase.from('applicants').insert([this.mapToDb(applicant)]).select(APPLICANT_SELECT).single();
    if (error) throw error;
    return this.mapFromDb(data);
  },
  async updateApplicant(id: string, updates: Partial<ApplicantRecord>) {
    if (updates.stage !== undefined) throw new Error('Recruitment stage changes must use the protected recruitment workflow.');
    if (updates.refusalReason !== undefined) throw new Error('Candidate closure must use the protected recruitment close workflow.');
    if (updates.finalApproval === true) throw new Error('Final approval must use the secure recruitment workflow.');
    if (updates.agreementStatus !== undefined) {
      if (updates.agreementStatus === 'sent') { await agreementService.issue(id); return this.getApplicantById(id); }
      throw new Error('Agreement status is controlled by the secure agreement signing workflow. Use Candidate Agreements to issue, countersign or verify an agreement.');
    }
    const { data, error } = await supabase.from('applicants').update(this.mapToDb(updates)).eq('id', id).select(APPLICANT_SELECT).single();
    if (error) throw error;
    return this.mapFromDb(data);
  },
  async changeStage(id: string, stage: ApplicantStage) {
    if (stage === 'Ready for System Access' || stage === 'Activated') throw new Error('This protected stage is set only by the secure final approval or activation workflow.');
    const { error } = await supabase.rpc('admin_advance_applicant_stage', { p_applicant_id: id, p_target_stage: stage });
    if (error) throw error;
    return this.getApplicantById(id);
  },
  async refuseApplicant(id: string, reason: string) {
    const { error } = await supabase.rpc('admin_close_applicant', { p_applicant_id: id, p_reason: reason, p_notes: '' });
    if (error) throw error;
    return this.getApplicantById(id);
  },
  async linkSalesCandidateAccount(applicantId: string, userId: string) {
    const { error } = await supabase.rpc('link_sales_candidate_account', { p_applicant_id: applicantId, p_target_user_id: userId });
    if (error) throw error;
    return this.getApplicantById(applicantId);
  },
  async approveSalesCandidateFinal(applicantId: string) {
    const { error } = await supabase.rpc('approve_sales_candidate_final', { p_applicant_id: applicantId });
    if (error) throw error;
    return this.getApplicantById(applicantId);
  },
  async activateSalesperson(userId: string, adminId?: string) {
    const { error } = await supabase.rpc('activate_salesperson', { target_user_id: userId, admin_id: adminId || null });
    if (error) throw error;
  },
  /** @deprecated Use the secure invitation workflow for new trainees; this remains for controlled legacy Sales account linking. */
  async linkToUser(id:string,userId:string){return this.linkSalesCandidateAccount(id,userId)},
  async submitSalesApplicationV3(applicationData:SalesApplicationV3Payload):Promise<{success:boolean;duplicate?:boolean;message?:string;error?:string;field?:string;applicant_id?:string;reference?:string;stage?:string}>{
    const {data,error}=await supabase.rpc('submit_public_sales_application_v3',{p_application:{...applicationData,fullName:applicationData.fullName.trim(),email:applicationData.email.trim().toLowerCase()}});
    if(error){console.error('Sales application V3 RPC failed:',error);return{success:false,error:'We could not submit your application right now. Please try again.'}}
    return(data||{success:false,error:'No response received from application service.'})as any;
  },
  async submitPublicApplication(applicationData: {
    fullName:string;email:string;phone?:string;country?:string;timezone?:string;linkedinUrl?:string;currentRole?:string;
    salesExperience?:string;digitalSalesExperience?:string;internationalSalesExperience?:string;englishRating?:string;
    availability?:string;weeklyAvailability?:string;previousSalesResults?:string;sampleOutreachMessage?:string;professionalReference?:string;
    hasLaptopInternet?:boolean;comfortableCommission?:boolean;comfortableSourcing?:boolean;cvUrl?:string;videoUrl?:string;
    referralSource?:string;message?:string;applicationVersion?:'legacy'|'sales_role_v2';
  }): Promise<{success:boolean;duplicate?:boolean;message?:string;error?:string;applicant_id?:string;stage?:string}> {
    const cleanEmail=applicationData.email.trim().toLowerCase(),cleanName=applicationData.fullName.trim();
    if(cleanName.length<2)return{success:false,error:'Please provide a valid full name.'};
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))return{success:false,error:'Please provide a valid email address.'};
    if (applicationData.applicationVersion === 'sales_role_v2') {
      const { data, error } = await supabase.rpc('submit_public_sales_application_v2', { p_application: { ...applicationData, fullName: cleanName, email: cleanEmail, referralSource: applicationData.referralSource || 'ProFox Website' } });
      if(error){console.error('Sales application V2 RPC failed:',error);return{success:false,error:'We could not submit your application right now. Please try again.'}}
      return(data||{success:false,error:'No response received from application service.'})as any;
    }
    const{data,error}=await supabase.rpc('submit_public_application',{
      p_full_name:cleanName,p_email:cleanEmail,p_phone:applicationData.phone||'',p_country:applicationData.country||'',p_timezone:applicationData.timezone||'UTC',
      p_linkedin_url:applicationData.linkedinUrl||'',p_current_role:applicationData.currentRole||'',p_sales_experience:applicationData.salesExperience||'',
      p_digital_sales_experience:applicationData.digitalSalesExperience||'',p_international_sales_experience:applicationData.internationalSalesExperience||'',
      p_english_rating:applicationData.englishRating||'',p_availability:applicationData.availability||applicationData.weeklyAvailability||'',
      p_has_laptop_internet:applicationData.hasLaptopInternet??true,p_comfortable_commission:applicationData.comfortableCommission??true,
      p_comfortable_sourcing:applicationData.comfortableSourcing??true,p_cv_url:applicationData.cvUrl||'',p_video_url:applicationData.videoUrl||'',
      p_referral_source:applicationData.referralSource||'ProFox Website',p_message:applicationData.message||'',p_previous_sales_results:applicationData.previousSalesResults||'',
      p_weekly_availability:applicationData.weeklyAvailability||applicationData.availability||'',p_sample_outreach_message:applicationData.sampleOutreachMessage||'',p_professional_reference:applicationData.professionalReference||'',p_application_version:'legacy'
    });
    if(error){console.error('Public recruitment RPC failed:',error);return{success:false,error:'We could not submit your application right now. Please try again.'}}
    return(data||{success:false,error:'No response received from application service.'})as any;
  },
  mapFromDb(db:any):ApplicantRecord{return{
    id:db.id,fullName:db.full_name,email:db.email,phone:db.phone,country:db.country,timezone:db.timezone,position:db.position,linkedinUrl:db.linkedin_url,cvUrl:db.cv_url,videoUrl:db.video_url,
    salesExperience:db.sales_experience,skills:db.skills,source:db.source,stage:db.stage as ApplicantStage,rating:db.rating,notes:db.notes,refusalReason:db.refusal_reason,agreementStatus:db.agreement_status as AgreementStatus,
    onboardingStatus:db.onboarding_status as OnboardingStatus,onboardingProgress:db.onboarding_progress,finalApproval:db.final_approval,linkedUserId:db.linked_user_id,createdAt:db.created_at,updatedAt:db.updated_at,
    applicationReference:db.application_reference,applicationVersion:db.application_version,applicationPolicyVersion:db.application_policy_version,applicationSubmittedAt:db.application_submitted_at,
    careerJobId:db.career_job_id,careerJobTitle:db.career_job?.title,careerJobSlug:db.career_job?.slug,applicationType:db.career_job?.application_type,
    portfolioUrl:db.portfolio_url,applicationAnswers:db.application_answers&&typeof db.application_answers==='object'?db.application_answers:{},
    currentJobTitle:db.current_job_title,digitalSalesExperience:db.digital_sales_experience,internationalSalesExperience:db.international_sales_experience,englishRating:db.english_rating,
    salesExperienceMonths:db.sales_experience_months==null?undefined:Number(db.sales_experience_months),b2bExperienceMonths:db.b2b_experience_months==null?undefined:Number(db.b2b_experience_months),countryCode:db.country_code,
    targetMarkets:Array.isArray(db.target_markets)?db.target_markets:[],prospectingChannels:Array.isArray(db.prospecting_channels)?db.prospecting_channels:[],crmExperience:db.crm_experience,
    weeklyAvailability:db.weekly_availability,availableDays:Array.isArray(db.available_days)?db.available_days:[],availableHoursPerWeek:db.available_hours_per_week==null?undefined:Number(db.available_hours_per_week),preferredWorkWindow:db.preferred_work_window,
    earliestStartDate:db.earliest_start_date,previousSalesResults:db.previous_sales_results,sampleOutreachMessage:db.sample_outreach_message,professionalReference:db.professional_reference,
    heardAboutSource:db.heard_about_source,heardAboutDetail:db.heard_about_detail,motivation:db.motivation,hasLaptopInternet:db.has_laptop_internet,comfortableCommission:db.comfortable_commission,
    comfortableSourcing:db.comfortable_sourcing,comfortableEnglishCalls:db.comfortable_english_calls,videoCommitment:db.video_commitment,accuracyConfirmedAt:db.accuracy_confirmed_at,privacyConsentAt:db.privacy_consent_at,
    cvStoragePath:db.cv_storage_path,videoStoragePath:db.video_storage_path
  }},
  mapToDb(app:Partial<ApplicantRecord>):any{const db:any={};
    if(app.fullName!==undefined)db.full_name=app.fullName;if(app.email!==undefined)db.email=app.email;if(app.phone!==undefined)db.phone=app.phone;if(app.country!==undefined)db.country=app.country;if(app.timezone!==undefined)db.timezone=app.timezone;
    if(app.position!==undefined)db.position=app.position;if(app.linkedinUrl!==undefined)db.linkedin_url=app.linkedinUrl;if(app.cvUrl!==undefined)db.cv_url=app.cvUrl;if(app.videoUrl!==undefined)db.video_url=app.videoUrl;if(app.salesExperience!==undefined)db.sales_experience=app.salesExperience;
    if(app.skills!==undefined)db.skills=app.skills;if(app.source!==undefined)db.source=app.source;if(app.stage!==undefined)db.stage=app.stage;if(app.rating!==undefined)db.rating=app.rating;if(app.notes!==undefined)db.notes=app.notes;if(app.refusalReason!==undefined)db.refusal_reason=app.refusalReason;
    if(app.onboardingStatus!==undefined)db.onboarding_status=app.onboardingStatus;if(app.onboardingProgress!==undefined)db.onboarding_progress=app.onboardingProgress;if(app.finalApproval!==undefined)db.final_approval=app.finalApproval;if(app.linkedUserId!==undefined)db.linked_user_id=app.linkedUserId;
    if(app.careerJobId!==undefined)db.career_job_id=app.careerJobId;if(app.portfolioUrl!==undefined)db.portfolio_url=app.portfolioUrl;if(app.applicationAnswers!==undefined)db.application_answers=app.applicationAnswers;
    if(app.currentJobTitle!==undefined)db.current_job_title=app.currentJobTitle;if(app.digitalSalesExperience!==undefined)db.digital_sales_experience=app.digitalSalesExperience;if(app.internationalSalesExperience!==undefined)db.international_sales_experience=app.internationalSalesExperience;
    if(app.englishRating!==undefined)db.english_rating=app.englishRating;if(app.salesExperienceMonths!==undefined)db.sales_experience_months=app.salesExperienceMonths;if(app.b2bExperienceMonths!==undefined)db.b2b_experience_months=app.b2bExperienceMonths;if(app.countryCode!==undefined)db.country_code=app.countryCode;
    if(app.targetMarkets!==undefined)db.target_markets=app.targetMarkets;if(app.prospectingChannels!==undefined)db.prospecting_channels=app.prospectingChannels;if(app.crmExperience!==undefined)db.crm_experience=app.crmExperience;if(app.availableDays!==undefined)db.available_days=app.availableDays;
    if(app.availableHoursPerWeek!==undefined)db.available_hours_per_week=app.availableHoursPerWeek;if(app.preferredWorkWindow!==undefined)db.preferred_work_window=app.preferredWorkWindow;if(app.earliestStartDate!==undefined)db.earliest_start_date=app.earliestStartDate;
    if(app.previousSalesResults!==undefined)db.previous_sales_results=app.previousSalesResults;if(app.sampleOutreachMessage!==undefined)db.sample_outreach_message=app.sampleOutreachMessage;if(app.professionalReference!==undefined)db.professional_reference=app.professionalReference;
    if(app.heardAboutSource!==undefined)db.heard_about_source=app.heardAboutSource;if(app.heardAboutDetail!==undefined)db.heard_about_detail=app.heardAboutDetail;if(app.motivation!==undefined)db.motivation=app.motivation;
    return db;}
};