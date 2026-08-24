import { supabase } from './supabase';

export type DevelopmentEvidenceType =
  | 'architecture_notes' | 'repository' | 'branch' | 'pull_request' | 'commit' | 'build_result' | 'test_result'
  | 'staging_url' | 'implementation_notes' | 'accessibility_check' | 'performance_check' | 'security_check'
  | 'qa_handoff' | 'release_notes' | 'documentation' | 'deployment_reference' | 'production_url' | 'handover_reference'
  | 'reuse_inspection' | 'acceptance_criteria' | 'technical_discovery' | 'architecture_decision' | 'environment_check'
  | 'dependency_review' | 'browser_responsive_check' | 'seo_check' | 'analytics_check' | 'backup_recovery' | 'rollback_plan'
  | 'smoke_test' | 'monitoring_check' | 'incident_reference' | 'root_cause_analysis';

export interface DevelopmentDeliveryWorkspace {
  task: any;
  project: any;
  client: any;
  config: Record<string, any>;
  readiness: { ready: boolean; status: string; checks: Record<string, boolean>; blockers: string[] };
  requiredEvidence: DevelopmentEvidenceType[];
  evidence: any[];
  reviews: any[];
  designHandoff: any[];
}

export interface DevelopmentReviewQueueItem {
  reviewId: string; taskId: string; reviewType: string; reviewRound: number; requestedAt: string;
  taskTitle: string; priority: string; dueDate?: string; projectId: string; projectNumber: string; projectName: string;
  clientName: string; developerName: string; ageHours: number; slaHours: number; slaStatus: 'Healthy'|'Due Soon'|'Breached';
}

export interface HandoverClientPackage {
  productionUrl: string;
  documentationReference: string;
  releaseEvidence: string;
  accessOwnership: string;
  supportBoundary: string;
  repositoryAccess?: string;
  cmsInstructions?: string;
  integrations?: string;
  analyticsTracking?: string;
  backupRecovery?: string;
  trainingReference?: string;
}

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id=(v:string,label:string)=>{if(!UUID_RE.test(v))throw new Error(`${label} is invalid.`)};
const err=(e:any,fallback:string)=>new Error(e?.message||fallback);

export const developmentDeliveryService={
  async getWorkspace(taskId:string):Promise<DevelopmentDeliveryWorkspace>{id(taskId,'Task');const{data,error}=await supabase.rpc('development_delivery_workspace',{p_task_id:taskId});if(error)throw err(error,'Unable to load Development Delivery workspace.');return data as DevelopmentDeliveryWorkspace;},
  async addEvidence(input:{taskId:string;type:DevelopmentEvidenceType;label?:string;referenceUrl?:string;referenceNote?:string;status?:'Draft'|'Provided'|'Verified'}){id(input.taskId,'Task');if(!input.referenceUrl?.trim()&&!input.referenceNote?.trim())throw new Error('Add a source link or evidence note.');const{data,error}=await supabase.rpc('development_delivery_add_evidence',{p_task_id:input.taskId,p_evidence_type:input.type,p_label:input.label?.trim()||'',p_reference_url:input.referenceUrl?.trim()||'',p_reference_note:input.referenceNote?.trim()||'',p_status:input.status||'Provided'});if(error)throw err(error,'Unable to save Development evidence.');return data as string;},
  async startTask(taskId:string){id(taskId,'Task');const{data,error}=await supabase.rpc('development_delivery_start_task',{p_task_id:taskId});if(error)throw err(error,'Unable to start Development work.');return data;},
  async submitForReview(taskId:string,note=''){id(taskId,'Task');const{data,error}=await supabase.rpc('development_delivery_submit_for_review',{p_task_id:taskId,p_note:note.trim()});if(error)throw err(error,'Unable to submit Development work for technical review.');return data;},
  async getMyReviews():Promise<DevelopmentReviewQueueItem[]>{const{data,error}=await supabase.rpc('development_delivery_get_my_reviews');if(error)throw err(error,'Unable to load technical review queue.');return(Array.isArray(data)?data:[]) as DevelopmentReviewQueueItem[];},
  async submitReviewDecision(reviewId:string,decision:'Pass'|'Changes Required',qualityScore:number|null,notes=''){id(reviewId,'Review');if(decision==='Changes Required'&&notes.trim().length<10)throw new Error('Give specific technical feedback before requesting changes.');const{data,error}=await supabase.rpc('development_delivery_submit_review_decision',{p_review_id:reviewId,p_decision:decision,p_quality_score:qualityScore,p_notes:notes.trim()});if(error)throw err(error,'Unable to complete technical review.');return data;},
  async submitHandover(projectId:string,clientPackage:HandoverClientPackage,submissionNote=''){id(projectId,'Project');const{data,error}=await supabase.rpc('development_handover_submit',{p_project_id:projectId,p_client_package:clientPackage,p_submission_note:submissionNote.trim()});if(error)throw err(error,'Unable to submit final handover for manager review.');return data;},
  async reviewHandover(packageId:string,decision:'Approved'|'Changes Required',notes=''){id(packageId,'Handover package');const{data,error}=await supabase.rpc('development_manager_review_handover',{p_package_id:packageId,p_decision:decision,p_notes:notes.trim()});if(error)throw err(error,'Unable to complete final handover review.');return data;}
};
