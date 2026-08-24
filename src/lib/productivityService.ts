import { supabase } from './supabase';

export type ProductivityBucket = 'Do Now' | 'Overdue' | 'Upcoming' | 'Waiting';
export type ProductivityEntityType = 'lead'|'opportunity'|'activity'|'meeting'|'quotation'|'payment'|'client'|'project'|'project_task'|'applicant'|'notification';
export type AiCapabilityKey = 'lead_research'|'outreach_drafting'|'loom_preparation'|'meeting_preparation'|'meeting_summary'|'sales_coaching'|'next_best_action_explanation'|'quotation_assistant'|'project_handover'|'project_task_breakdown'|'management_intelligence';

export interface ProductivityItem {itemKey:string;sourceType:string;entityType:ProductivityEntityType;entityId:string;title:string;subtitle:string;dueAt?:string|null;priorityScore:number;bucket:ProductivityBucket;actionLabel:string;actionKey:string;actionUrl:string;quick:boolean;requiresConfirmation:boolean;metadata:Record<string,any>}
export interface ProductivityCommandCenter {scope:'mine'|'team';role:string;counts:{doNow:number;overdue:number;upcoming:number;waiting:number;total:number};items:ProductivityItem[];generatedAt:string}
export interface NextBestAction {entityType:string;entityId:string;label:string;actionKey:string;url:string;reason:string;quick:boolean;requiresInput:boolean;requiresConfirmation:boolean}
export interface ProductivityPlaybookItem {key:string;label:string;description?:string}
export interface ProductivityPlaybook {id:string;key:string;name:string;description:string;checklist:ProductivityPlaybookItem[]}
export interface ProductivityPlaybookState {stage:string;playbook:ProductivityPlaybook|null;completedItems:string[]}
export interface ProductivitySearchResult {entityType:ProductivityEntityType;entityId:string;title:string;subtitle:string;url:string}
export interface ProductivityMetrics {days:number;actionsCompleted:number;activitiesCompleted:number;projectTasksCompleted:number;meetingsCompleted:number;dayReviews:number}
export interface AiSource {title:string;url:string}

export interface ProductivityAiStatus {
 enabled:boolean;provider:'gemini';model:string;providerConfigured:boolean;maxOutputTokens:number;maxRequestsPerUserHour:number;maxInputCharacters:number;
 capabilities:Record<AiCapabilityKey,boolean>;humanReviewRequired:boolean;coreSystemIndependent:boolean;protectedActionsAllowed:boolean;canConfigure:boolean;
 externalWebResearchEnabled:boolean;externalResearchMaxRequestsPerUserHour:number;
}
export interface AiUsageSummary {days:number;totalRuns:number;completed:number;failed:number;blocked:number;externalResearchRuns:number;averageLatencyMs:number;inputCharacters:number;outputCharacters:number;byCapability:Array<{capability:AiCapabilityKey|string;runs:number;completed:number;failed:number;blocked:number;externalResearch:number}>;privacy:string}
export interface ProductivityPlaybookAdminRow {id?:string;playbook_key:string;name:string;description:string;entity_type:string;stage:string;roles:string[];checklist:ProductivityPlaybookItem[];active:boolean;sort_order:number}

const defaultCapabilities:Record<AiCapabilityKey,boolean>={lead_research:false,outreach_drafting:false,loom_preparation:false,meeting_preparation:false,meeting_summary:false,sales_coaching:false,next_best_action_explanation:false,quotation_assistant:false,project_handover:false,project_task_breakdown:false,management_intelligence:false};
const defaultAi:ProductivityAiStatus={enabled:false,provider:'gemini',model:'gemini-3.6-flash',providerConfigured:false,maxOutputTokens:1800,maxRequestsPerUserHour:20,maxInputCharacters:24000,capabilities:defaultCapabilities,humanReviewRequired:true,coreSystemIndependent:true,protectedActionsAllowed:false,canConfigure:false,externalWebResearchEnabled:false,externalResearchMaxRequestsPerUserHour:8};

export const productivityService={
 async getCommandCenter(scope:'mine'|'team'='mine'):Promise<ProductivityCommandCenter>{const{data,error}=await supabase.rpc('get_productivity_command_center',{p_scope:scope});if(error)throw error;return data as ProductivityCommandCenter},
 async getNextAction(entityType:string,entityId:string):Promise<NextBestAction>{const{data,error}=await supabase.rpc('get_productivity_next_action',{p_entity_type:entityType,p_entity_id:entityId});if(error)throw error;return data as NextBestAction},
 async executeAction(actionKey:string,entityType:string,entityId:string,payload:Record<string,unknown>={}){const{data,error}=await supabase.rpc('execute_productivity_action',{p_action_key:actionKey,p_entity_type:entityType,p_entity_id:entityId,p_payload:payload});if(error)throw error;return data as Record<string,unknown>},
 async search(query:string,limit=20):Promise<ProductivitySearchResult[]>{if(query.trim().length<2)return[];const{data,error}=await supabase.rpc('search_productivity_workspace',{p_query:query,p_limit:limit});if(error)throw error;return(data||[])as ProductivitySearchResult[]},
 async getPlaybook(entityType:string,entityId:string):Promise<ProductivityPlaybookState>{const{data,error}=await supabase.rpc('get_productivity_playbook',{p_entity_type:entityType,p_entity_id:entityId});if(error)throw error;return data as ProductivityPlaybookState},
 async setChecklistItem(playbookId:string,entityType:string,entityId:string,itemKey:string,completed:boolean){const{data,error}=await supabase.rpc('set_productivity_checklist_item',{p_playbook_id:playbookId,p_entity_type:entityType,p_entity_id:entityId,p_item_key:itemKey,p_completed:completed});if(error)throw error;return data as{completedItems:string[];allDone:boolean}},
 async completeDay(notes:string,tomorrowFocus:string){const{data,error}=await supabase.rpc('complete_productivity_day',{p_notes:notes,p_tomorrow_focus:tomorrowFocus});if(error)throw error;return data},
 async getMetrics(days=7):Promise<ProductivityMetrics>{const{data,error}=await supabase.rpc('get_productivity_metrics',{p_days:days});if(error)throw error;return data as ProductivityMetrics},

 async getAiStatus():Promise<ProductivityAiStatus>{const{data,error}=await supabase.rpc('get_ai_assistance_status');if(error)throw error;return{...defaultAi,...(data||{}),capabilities:{...defaultCapabilities,...(data?.capabilities||{})}}as ProductivityAiStatus},
 async configureAi(input:{enabled:boolean;apiKey?:string;model:string;maxOutputTokens:number;capabilities:Record<AiCapabilityKey,boolean>;maxRequestsPerUserHour:number;maxInputCharacters:number;externalWebResearchEnabled:boolean;externalResearchMaxRequestsPerUserHour:number}):Promise<ProductivityAiStatus>{const{data,error}=await supabase.rpc('admin_set_ai_assistance_settings_v2',{p_enabled:input.enabled,p_api_key:input.apiKey||'',p_model:input.model,p_max_output_tokens:input.maxOutputTokens,p_capabilities:input.capabilities,p_max_requests_per_user_hour:input.maxRequestsPerUserHour,p_max_input_characters:input.maxInputCharacters,p_external_web_research_enabled:input.externalWebResearchEnabled,p_external_research_max_requests_per_user_hour:input.externalResearchMaxRequestsPerUserHour});if(error)throw error;return{...defaultAi,...(data||{}),capabilities:{...defaultCapabilities,...(data?.capabilities||{})}}as ProductivityAiStatus},
 async getAiUsage(days=30):Promise<AiUsageSummary>{const{data,error}=await supabase.rpc('admin_get_ai_usage_summary',{p_days:days});if(error)throw error;return data as AiUsageSummary},
 async getAiContext(entityType:string,entityId:string,mode:string){const{data,error}=await supabase.rpc('get_productivity_ai_context',{p_entity_type:entityType,p_entity_id:entityId,p_mode:mode});if(error)throw error;return data},
 async runCopilot(entityType:string,entityId:string,mode:string,instructions=''):Promise<{output:string;model:string;capability?:AiCapabilityKey;humanReviewRequired?:boolean;coreSystemContinues?:boolean;externalResearchUsed?:boolean;sources?:AiSource[]}>{const{data,error}=await supabase.functions.invoke('productivity-copilot',{body:{entityType,entityId,mode,instructions}});if(error)throw error;if(!data?.output)throw new Error(data?.error||'AI assistance did not return a draft.');return{output:data.output,model:data.model||'',capability:data.capability,humanReviewRequired:data.humanReviewRequired,coreSystemContinues:data.coreSystemContinues,externalResearchUsed:data.externalResearchUsed,sources:Array.isArray(data.sources)?data.sources:[]}},
 async runManagementAi(periodDays=30,instructions=''):Promise<{output:string;model:string;sources?:AiSource[]}>{const{data,error}=await supabase.functions.invoke('productivity-copilot',{body:{entityType:'management',mode:'management_brief',periodDays,instructions}});if(error)throw error;if(!data?.output)throw new Error(data?.error||'Management AI did not return a brief.');return{output:data.output,model:data.model||'',sources:Array.isArray(data.sources)?data.sources:[]}},

 async listPlaybooks():Promise<ProductivityPlaybookAdminRow[]>{const{data,error}=await supabase.from('productivity_playbooks').select('*').order('entity_type').order('sort_order').order('name');if(error)throw error;return(data||[])as ProductivityPlaybookAdminRow[]},
 async savePlaybook(row:ProductivityPlaybookAdminRow){const payload={...row,updated_at:new Date().toISOString()};const query=row.id?supabase.from('productivity_playbooks').update(payload).eq('id',row.id):supabase.from('productivity_playbooks').insert(payload);const{data,error}=await query.select('*').single();if(error)throw error;return data as ProductivityPlaybookAdminRow},
 async deletePlaybook(id:string){const{error}=await supabase.from('productivity_playbooks').delete().eq('id',id);if(error)throw error}
};
