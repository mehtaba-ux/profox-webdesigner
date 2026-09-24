import { supabase } from './supabase';

export type OutreachPlaybook={id:string;code:string;title:string;category:string;channel:string;nicheSlug?:string|null;marketCode:string;subjectTemplate?:string|null;bodyTemplate:string;coachingNote:string;variables:string[];sortOrder:number};
export type CompliancePreset={id:string;marketCode:string;marketLabel:string;channel:string;status:'allowed_with_rules'|'admin_review_required'|'do_not_send';summary:string;rules:string[];referenceUrls:string[];sortOrder:number};
export type OutreachMessagingConfig={acceptedMessageMinWords:number;targetMessageMinWords:number;targetMessageMaxWords:number;acceptedMessageMaxWords:number;subjectMinWords:number;subjectMaxWords:number;approvalScope:'onboarding_only';channelOptions:string[];defaultCadence:Array<{day:number;channel:string;label:string;purpose:string}>;requiredReplyScenarios:Array<{key:string;label:string}>;rubric:Array<{key:string;label:string;max:number}>;criticalFailures:Array<{key:string;label:string}>;lessonCount:number;lessonsCompleted:number;draftData?:any;latestSubmission?:any;latestReview?:any;playbooks:OutreachPlaybook[];compliancePresets:CompliancePreset[]};
export type OutreachAdminSubmission={progressId:string;userId:string;status:string;score?:number|null;feedback?:string|null;reviewedAt?:string|null;updatedAt?:string|null;candidateName:string;candidateEmail?:string|null;assignmentId?:string|null;submittedAt?:string|null;submission?:any;reviewDetail?:any};

export const outreachMessagingTrainingService={
 async getConfig(moduleId:string){const {data,error}=await supabase.rpc('get_outreach_messaging_training_config',{p_module_id:moduleId});return {data:(data as OutreachMessagingConfig|null)||null,error};},
 async completeLesson(progressId:string,lessonId:string){return supabase.rpc('complete_outreach_messaging_lesson',{p_progress_id:progressId,p_lesson_id:lessonId});},
 async saveDraft(progressId:string,draft:any){return supabase.rpc('save_outreach_messaging_draft',{p_progress_id:progressId,p_draft:draft});},
 async submit(progressId:string,submission:any){return supabase.rpc('submit_outreach_messaging_assignment',{p_progress_id:progressId,p_submission:submission});},
 async adminListSubmissions(){const {data,error}=await supabase.rpc('admin_list_outreach_messaging_submissions');return {data:((data||[]) as OutreachAdminSubmission[]),error};},
 async adminReview(progressId:string,rubricScores:Record<string,number>,criticalFailures:string[],feedback:string){return supabase.rpc('admin_review_outreach_messaging_assignment',{p_progress_id:progressId,p_rubric_scores:rubricScores,p_critical_failures:criticalFailures,p_feedback:feedback.trim()});},
 async adminUpdateConfig(moduleId:string,config:any){return supabase.rpc('admin_update_outreach_messaging_config',{p_module_id:moduleId,p_config:config});},
 async adminListPlaybooks(moduleId:string){return supabase.from('outreach_message_playbooks').select('*').eq('module_id',moduleId).order('sort_order');},
 async adminSavePlaybook(moduleId:string,item:any){const payload={...item,module_id:moduleId,updated_at:new Date().toISOString()};delete payload.id;const q=item.id?supabase.from('outreach_message_playbooks').update(payload).eq('id',item.id):supabase.from('outreach_message_playbooks').insert(payload);return q.select().single();},
 async adminDeletePlaybook(id:string){return supabase.from('outreach_message_playbooks').delete().eq('id',id);},
 async adminListCompliance(moduleId:string){return supabase.from('outreach_compliance_presets').select('*').eq('module_id',moduleId).order('sort_order');},
 async adminSaveCompliance(moduleId:string,item:any){const payload={...item,module_id:moduleId,updated_at:new Date().toISOString()};delete payload.id;const q=item.id?supabase.from('outreach_compliance_presets').update(payload).eq('id',item.id):supabase.from('outreach_compliance_presets').insert(payload);return q.select().single();},
 async adminDeleteCompliance(id:string){return supabase.from('outreach_compliance_presets').delete().eq('id',id);}
};
