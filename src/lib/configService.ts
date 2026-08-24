import { supabase } from './supabase';
import {
  PRODUCT_QUIZ_QUESTIONS,
  NICHE_PLAYBOOKS,
  OUTREACH_TEMPLATES,
  ProductQuizQuestion,
  NichePlaybook,
  OutreachTemplate
} from '../data/defaultTraining';

export interface AuditLogEntry {
  id: string;
  entity: string;
  recordId: string;
  recordTitle?: string;
  action: 'create' | 'update' | 'delete' | 'deactivate' | 'activate';
  fieldChanged?: string;
  oldValue?: any;
  newValue?: any;
  changedBy: string;
  changedAt: string;
}

export interface DepartmentConfig {
  id: string;
  code: string;
  name: string;
  description?: string;
  sortOrder: number;
  active: boolean;
}

export interface RoleDisplayConfig {
  roleKey: string;
  displayLabel: string;
  description: string;
  department: string;
  isSystemProtected: boolean;
}

/** @deprecated Current payment schedules live only on Sales Catalog products. */
export interface PaymentScheduleConfig {
  id: string;
  packageCode: string;
  packageName: string;
  description: string;
  milestones: {
    id: string;
    label: string;
    percentage: number;
    stageKey: string;
    requiresVerification: boolean;
  }[];
  active: boolean;
}

export interface CadenceStep {
  stepNumber: number;
  day: number;
  label: string;
  channel: 'Email' | 'LinkedIn' | 'Loom' | 'Phone Call' | 'WhatsApp' | 'Multi-Channel';
  description: string;
  templateId?: string;
}

export interface FollowUpCadenceConfig {
  id: string;
  name: string;
  description: string;
  steps: CadenceStep[];
  active: boolean;
}

export interface RecruitmentStageConfig {
  stageKey: string;
  displayLabel: string;
  description: string;
  sortOrder: number;
  isGated: boolean;
  active: boolean;
}

export interface ProjectStageConfig {
  stageKey: string;
  displayLabel: string;
  description: string;
  sortOrder: number;
  paymentMilestoneKey?: string;
  isProtectedGate: boolean;
  active: boolean;
}

export interface TaskStatusConfig {
  statusKey: string;
  displayLabel: string;
  color: string;
  sortOrder: number;
  active: boolean;
}

export interface TaskPriorityConfig {
  priorityKey: string;
  displayLabel: string;
  badgeClass: string;
  sortOrder: number;
  active: boolean;
}

export interface ClientPortalConfig {
  welcomeHeadline: string;
  welcomeSubheadline: string;
  supportEmail: string;
  supportPhone: string;
  businessHours: string;
  paymentInstructions: string;
  uploadGuidelines: string;
  termsNotice: string;
}

export interface CompanySettingsConfig {
  businessName: string;
  legalEntity: string;
  website: string;
  contactEmail: string;
  contactPhone: string;
  securityContact: string;
  supportEmail: string;
  businessAddress: string;
  currency: string;
  timezone: string;
  vatTaxNumber: string;
  registrationNumber: string;
  lastUpdated: string;
}

/** @deprecated Current Care Plans live only in Sales Catalog. */
export interface CarePlanConfig {
  id: string;
  code: string;
  name: string;
  price: number;
  period: string;
  badge: string;
  description: string;
  features: string[];
  recommendedAddons?: string[];
  sortOrder: number;
  active: boolean;
}

const STORAGE_PREFIX = 'profox_config_';
const AUDIT_LOG_KEY = 'audit_logs';
const RETIRED_COMMERCIAL_KEYS = new Set(['care_plans', 'payment_schedules']);
let hydrationStarted = false;

function readLocal<T>(key: string, defaultVal: T): T {
  if (typeof localStorage === 'undefined') return defaultVal;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : defaultVal;
  } catch {
    return defaultVal;
  }
}

function cacheLocal<T>(key: string, val: T): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(val));
  } catch {
    // Browser storage is a cache only; database remains authoritative persistence.
  }
}

function clearRetiredCommercialCache() {
  if (typeof localStorage === 'undefined') return;
  try {
    RETIRED_COMMERCIAL_KEYS.forEach(key => localStorage.removeItem(STORAGE_PREFIX + key));
  } catch {
    // Best-effort removal of obsolete local commercial data.
  }
}

async function persistConfig<T>(key: string, val: T): Promise<void> {
  if (RETIRED_COMMERCIAL_KEYS.has(key)) {
    console.warn(`Configuration ${key} is retired. Manage current commercial data in Sales Catalog.`);
    return;
  }
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase.from('system_configuration').upsert({
      config_key: key,
      config_value: val as any,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString()
    }, { onConflict: 'config_key' });
    if (error) console.warn(`Configuration persistence failed for ${key}:`, error.message);
  } catch (error) {
    console.warn(`Configuration persistence failed for ${key}:`, error);
  }
}

function setConfig<T>(key: string, val: T): void {
  if (RETIRED_COMMERCIAL_KEYS.has(key)) {
    clearRetiredCommercialCache();
    return;
  }
  cacheLocal(key, val);
  void persistConfig(key, val);
}

export const DEFAULT_COMPANY_SETTINGS: CompanySettingsConfig = {
  businessName: 'ProFox Web Designer',
  legalEntity: 'ProFox Digital Solution',
  website: 'https://www.profoxwebdesigner.com/',
  contactEmail: '',
  contactPhone: '',
  securityContact: '',
  supportEmail: '',
  businessAddress: '',
  currency: 'USD',
  timezone: 'Asia/Kolkata',
  vatTaxNumber: '',
  registrationNumber: '',
  lastUpdated: new Date().toISOString()
};

export const DEFAULT_DEPARTMENTS: DepartmentConfig[] = [
  { id: 'dep_management', code: 'management', name: 'Management', description: 'Executive administration and business oversight', sortOrder: 1, active: true },
  { id: 'dep_sales', code: 'sales', name: 'Sales', description: 'Prospecting, qualification, discovery, quotation and follow-up', sortOrder: 2, active: true },
  { id: 'dep_pm', code: 'project_management', name: 'Project Management', description: 'Delivery planning, assignments, milestones and client coordination', sortOrder: 3, active: true },
  { id: 'dep_design', code: 'uiux_design', name: 'UI/UX Design', description: 'Research, UX, responsive interface and design systems', sortOrder: 4, active: true },
  { id: 'dep_content', code: 'content', name: 'Content', description: 'Conversion copywriting, SEO metadata and content production', sortOrder: 5, active: true },
  { id: 'dep_dev', code: 'development', name: 'Development', description: 'Frontend, backend, CMS and custom application development', sortOrder: 6, active: true },
  { id: 'dep_qa', code: 'qa', name: 'Quality Assurance', description: 'Functional, responsive, accessibility and pre-launch verification', sortOrder: 7, active: true }
];

export const DEFAULT_ROLE_LABELS: RoleDisplayConfig[] = [
  { roleKey: 'admin', displayLabel: 'Administrator', description: 'Full authorized management access', department: 'Management', isSystemProtected: true },
  { roleKey: 'sales', displayLabel: 'Sales Representative', description: 'Own-lead CRM, outreach, quotations and sales workflow', department: 'Sales', isSystemProtected: true },
  { roleKey: 'project_manager', displayLabel: 'Project Manager', description: 'Project delivery, task and team coordination', department: 'Project Management', isSystemProtected: true },
  { roleKey: 'uiux_designer', displayLabel: 'UI/UX Designer', description: 'Assigned UI/UX design work', department: 'UI/UX Design', isSystemProtected: true },
  { roleKey: 'content_writer', displayLabel: 'Content Writer', description: 'Assigned content and copywriting work', department: 'Content', isSystemProtected: true },
  { roleKey: 'developer', displayLabel: 'Developer', description: 'Assigned development work', department: 'Development', isSystemProtected: true },
  { roleKey: 'qa', displayLabel: 'Quality Assurance', description: 'Assigned QA work', department: 'Quality Assurance', isSystemProtected: true },
  { roleKey: 'site_manager', displayLabel: 'Site Manager', description: 'Website content operations', department: 'Management', isSystemProtected: true },
  { roleKey: 'editor', displayLabel: 'Editor', description: 'Website content editing', department: 'Content', isSystemProtected: true },
  { roleKey: 'customer', displayLabel: 'Client', description: 'Client portal access only', department: 'Client', isSystemProtected: true },
  { roleKey: 'pending', displayLabel: 'Pending Approval', description: 'No staff authorization granted', department: 'General', isSystemProtected: true }
];

// Deliberately empty. Current Care Plans and payment schedules are never stored here.
export const DEFAULT_CARE_PLANS: CarePlanConfig[] = [];
export const DEFAULT_PAYMENT_SCHEDULES: PaymentScheduleConfig[] = [];

export const DEFAULT_CADENCE: FollowUpCadenceConfig = {
  id: 'standard_outreach_cadence',
  name: 'ProFox 5-Touch Follow-Up Cadence',
  description: 'Stop immediately when the prospect replies or opts out. Use the channel appropriate to the prospect and log every touch in CRM.',
  steps: [
    { stepNumber: 1, day: 1, label: 'Day 1 — Personalized Loom + Short Message', channel: 'Multi-Channel', description: 'Send a personalized 45–90 second Loom plus a concise message.' },
    { stepNumber: 2, day: 2, label: 'Day 2 — Short Follow-Up', channel: 'Multi-Channel', description: 'Briefly follow up without repeating the full pitch.' },
    { stepNumber: 3, day: 3, label: 'Day 3 — Value Follow-Up', channel: 'Multi-Channel', description: 'Add one relevant observation or useful business insight.' },
    { stepNumber: 4, day: 6, label: 'Day 6 — Follow-Up', channel: 'Multi-Channel', description: 'Ask whether a short 15-minute conversation would be useful.' },
    { stepNumber: 5, day: 9, label: 'Day 9 — Final Follow-Up', channel: 'Multi-Channel', description: 'Politely close the outreach sequence and leave the door open.' }
  ],
  active: true
};

export const DEFAULT_RECRUITMENT_STAGES: RecruitmentStageConfig[] = [
  { stageKey: 'New Application', displayLabel: 'New Application', description: 'Application received.', sortOrder: 1, isGated: false, active: true },
  { stageKey: 'Video Pending', displayLabel: 'Video Pending', description: 'Waiting for required introduction video.', sortOrder: 2, isGated: false, active: true },
  { stageKey: 'Video Review', displayLabel: 'Video Review', description: 'Admin reviews the introduction video.', sortOrder: 3, isGated: true, active: true },
  { stageKey: 'Initial Screening', displayLabel: 'Initial Screening', description: 'Basic fit, English and experience screening.', sortOrder: 4, isGated: true, active: true },
  { stageKey: 'Shortlisted', displayLabel: 'Shortlisted', description: 'Candidate passed initial screening.', sortOrder: 5, isGated: false, active: true },
  { stageKey: 'Sales Assessment', displayLabel: 'Sales Assessment', description: 'Sales capability assessment.', sortOrder: 6, isGated: true, active: true },
  { stageKey: 'Lead Research Test', displayLabel: 'Lead Research Test', description: 'Practical prospect research assessment.', sortOrder: 7, isGated: true, active: true },
  { stageKey: 'CRM Assessment', displayLabel: 'CRM Assessment', description: 'Practical CRM assessment.', sortOrder: 8, isGated: true, active: true },
  { stageKey: 'Selected', displayLabel: 'Selected', description: 'Candidate selected for onboarding.', sortOrder: 9, isGated: true, active: true },
  { stageKey: 'Agreement Pending', displayLabel: 'Agreement Pending', description: 'Waiting for signed independent sales agreement.', sortOrder: 10, isGated: true, active: true },
  { stageKey: 'One-Day Training', displayLabel: 'One-Day Training', description: 'Sales Academy onboarding and practical certification.', sortOrder: 11, isGated: true, active: true },
  { stageKey: 'Final Approval', displayLabel: 'Final Approval', description: 'Admin performs final eligibility review.', sortOrder: 12, isGated: true, active: true },
  { stageKey: 'Ready for System Access', displayLabel: 'Ready for System Access', description: 'All required gates passed; awaiting activation.', sortOrder: 13, isGated: true, active: true },
  { stageKey: 'Activated', displayLabel: 'Activated', description: 'Authorized active Sales Representative.', sortOrder: 14, isGated: true, active: true }
];

export const DEFAULT_REFUSAL_REASONS = [
  'Insufficient Sales Experience', 'English Below Requirement', 'Poor Introduction Video', 'Poor Initial Screening', 'Poor Sales Assessment',
  'Lead Research Test Failed', 'CRM Assessment Failed', 'Availability Below Requirement', 'Equipment/Internet Issue', 'Commission Model Not Accepted',
  'Agreement Declined', 'Training Failed', 'Unresponsive', 'Incorrect Information', 'Not Suitable for International Sales', 'Duplicate Application', 'Other'
];

export const DEFAULT_PROJECT_STAGES: ProjectStageConfig[] = [
  { stageKey: 'Sales Handover', displayLabel: 'Sales Handover', description: 'Approved scope and sales context handed to delivery.', sortOrder: 1, isProtectedGate: false, active: true },
  { stageKey: 'Client Onboarding', displayLabel: 'Client Onboarding', description: 'Client intake and access collection.', sortOrder: 2, isProtectedGate: false, active: true },
  { stageKey: 'Requirements', displayLabel: 'Requirements', description: 'Requirements and architecture confirmation.', sortOrder: 3, isProtectedGate: false, active: true },
  { stageKey: 'Content', displayLabel: 'Content', description: 'Content, imagery and metadata preparation.', sortOrder: 4, isProtectedGate: false, active: true },
  { stageKey: 'UI/UX Design', displayLabel: 'UI/UX Design', description: 'Responsive UI/UX design.', sortOrder: 5, isProtectedGate: false, active: true },
  { stageKey: 'Client Design Approval', displayLabel: 'Client Design Approval', description: 'Formal client design approval.', sortOrder: 6, paymentMilestoneKey: 'design_approval', isProtectedGate: true, active: true },
  { stageKey: 'Development', displayLabel: 'Development', description: 'Implementation and integrations.', sortOrder: 7, isProtectedGate: false, active: true },
  { stageKey: 'QA', displayLabel: 'QA', description: 'Functional, responsive, performance and launch QA.', sortOrder: 8, isProtectedGate: false, active: true },
  { stageKey: 'Client Review', displayLabel: 'Client Review', description: 'Client staging review.', sortOrder: 9, paymentMilestoneKey: 'staging_approval', isProtectedGate: true, active: true },
  { stageKey: 'Final Revisions', displayLabel: 'Final Revisions', description: 'Approved final revision set.', sortOrder: 10, isProtectedGate: false, active: true },
  { stageKey: 'Launch', displayLabel: 'Launch', description: 'Production launch; final payment gate enforced server-side.', sortOrder: 11, paymentMilestoneKey: 'launch', isProtectedGate: true, active: true },
  { stageKey: 'Handover', displayLabel: 'Handover', description: 'Client training and handover.', sortOrder: 12, isProtectedGate: false, active: true },
  { stageKey: 'Completed', displayLabel: 'Completed', description: 'Delivery completed.', sortOrder: 13, isProtectedGate: false, active: true }
];

export const DEFAULT_TASK_STATUSES: TaskStatusConfig[] = [
  { statusKey: 'To Do', displayLabel: 'To Do', color: '#64748B', sortOrder: 1, active: true },
  { statusKey: 'In Progress', displayLabel: 'In Progress', color: '#000080', sortOrder: 2, active: true },
  { statusKey: 'Review', displayLabel: 'Review', color: '#D97706', sortOrder: 3, active: true },
  { statusKey: 'Changes Required', displayLabel: 'Changes Required', color: '#DC2626', sortOrder: 4, active: true },
  { statusKey: 'Done', displayLabel: 'Done', color: '#16A34A', sortOrder: 5, active: true }
];

export const DEFAULT_TASK_PRIORITIES: TaskPriorityConfig[] = [
  { priorityKey: 'Low', displayLabel: 'Low', badgeClass: 'bg-slate-100 text-slate-700', sortOrder: 1, active: true },
  { priorityKey: 'Normal', displayLabel: 'Normal', badgeClass: 'bg-blue-50 text-blue-700', sortOrder: 2, active: true },
  { priorityKey: 'High', displayLabel: 'High', badgeClass: 'bg-amber-50 text-amber-700', sortOrder: 3, active: true },
  { priorityKey: 'Urgent', displayLabel: 'Urgent', badgeClass: 'bg-red-50 text-red-700', sortOrder: 4, active: true }
];

export const DEFAULT_CLIENT_PORTAL: ClientPortalConfig = {
  welcomeHeadline: 'Welcome to Your ProFox Project Workspace',
  welcomeSubheadline: 'Track milestones, review work, see verified payment status and follow delivery progress.',
  supportEmail: '',
  supportPhone: '',
  businessHours: '',
  paymentInstructions: 'Use only the official payment method shown on your approved ProFox payment request.',
  uploadGuidelines: 'Upload only project-related files and never share passwords in public notes.',
  termsNotice: 'Work outside the accepted quotation scope requires an approved change order.'
};

export const DEFAULT_LEAD_SOURCES = ['Google Maps', 'LinkedIn', 'Google Search', 'Facebook', 'Instagram', 'Business Directory', 'Referral', 'Website', 'Cold Call', 'Cold Email', 'Other'];
export const DEFAULT_LOST_REASONS = ['Price / Budget', 'Not Interested', 'No Response', 'Already Has Provider', 'Project Postponed', 'Competitor Selected', 'Decision Maker Declined', 'Timing Not Suitable', 'Not Qualified', 'Invalid Lead', 'Duplicate', 'Other'];

export async function hydrateConfiguration(): Promise<void> {
  if (hydrationStarted) return;
  hydrationStarted = true;
  clearRetiredCommercialCache();
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      hydrationStarted = false;
      return;
    }
    const { data, error } = await supabase.from('system_configuration').select('config_key,config_value');
    if (error) throw error;
    for (const row of data || []) {
      const key = String(row.config_key || '');
      const value = row.config_value;
      if (!key || RETIRED_COMMERCIAL_KEYS.has(key)) continue;
      if (key === 'recruitment_stages' && !Array.isArray(value)) continue;
      cacheLocal(key, value);
    }

    const { data: auditRows } = await supabase
      .from('configuration_audit_log')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(200);
    if (auditRows) {
      const logs: AuditLogEntry[] = auditRows.map((row: any) => ({
        id: row.id,
        entity: row.config_key,
        recordId: row.config_key,
        action: 'update',
        fieldChanged: 'configuration',
        oldValue: row.old_value,
        newValue: row.new_value,
        changedBy: row.changed_by || 'Administrator',
        changedAt: row.changed_at
      }));
      cacheLocal(AUDIT_LOG_KEY, logs);
    }
  } catch (error) {
    console.warn('Configuration hydration warning:', error);
  }
}

if (typeof window !== 'undefined') {
  clearRetiredCommercialCache();
  void hydrateConfiguration();
}

export function logAudit(
  entity: string,
  recordId: string,
  action: 'create' | 'update' | 'delete' | 'deactivate' | 'activate',
  changedField: string,
  oldValue: any,
  newValue: any,
  changedBy: string,
  recordTitle?: string
) {
  const logs = readLocal<AuditLogEntry[]>(AUDIT_LOG_KEY, []);
  const entry: AuditLogEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    entity,
    recordId,
    recordTitle,
    action,
    fieldChanged: changedField,
    oldValue,
    newValue,
    changedBy: changedBy || 'Administrator',
    changedAt: new Date().toISOString()
  };
  cacheLocal(AUDIT_LOG_KEY, [entry, ...logs].slice(0, 200));
}

export const configService = {
  hydrateFromDatabase: hydrateConfiguration,

  getAuditLogs(): AuditLogEntry[] { return readLocal(AUDIT_LOG_KEY, []); },
  clearAuditLogs(): void { cacheLocal(AUDIT_LOG_KEY, []); },
  logAuditEntry(optionsOrEntity: string | { entity: string; recordId: string; action?: string; field?: string; oldValue?: any; newValue?: any; userEmail?: string; label?: string; recordTitle?: string }, recordId?: string, action: any = 'update', changedField = 'configuration', oldValue: any = null, newValue: any = null, changedBy = 'Administrator', recordTitle?: string): void {
    if (typeof optionsOrEntity === 'object') {
      const o = optionsOrEntity;
      const safeAction = ['create','update','delete','deactivate','activate'].includes(o.action || '') ? o.action as AuditLogEntry['action'] : 'update';
      logAudit(o.entity, o.recordId, safeAction, o.field || 'configuration', o.oldValue, o.newValue, o.userEmail || 'Administrator', o.label || o.recordTitle || o.recordId);
    } else {
      logAudit(optionsOrEntity, recordId || 'general', action, changedField, oldValue, newValue, changedBy, recordTitle);
    }
  },

  getCompanySettings(): CompanySettingsConfig { return readLocal('company_settings', DEFAULT_COMPANY_SETTINGS); },
  updateCompanySettings(settings: Partial<CompanySettingsConfig>, userEmail: string): CompanySettingsConfig {
    const current = this.getCompanySettings();
    const updated = { ...current, ...settings, lastUpdated: new Date().toISOString() };
    setConfig('company_settings', updated);
    logAudit('Company Settings','company_settings','update','settings',current,updated,userEmail,'Company Profile');
    return updated;
  },

  getDepartments(includeInactive=false): DepartmentConfig[] {
    const list=[...readLocal('departments',DEFAULT_DEPARTMENTS)].sort((a,b)=>a.sortOrder-b.sortOrder);
    return includeInactive?list:list.filter(x=>x.active);
  },
  saveDepartment(dep: Partial<DepartmentConfig>, userEmail: string): DepartmentConfig {
    const list=this.getDepartments(true);
    const i=list.findIndex(x=>x.id===dep.id);
    const old=i>=0?list[i]:null;
    const saved: DepartmentConfig=i>=0
      ? {...list[i],...dep}
      : {id:dep.id||`dep_${Date.now()}`,code:dep.code||(dep.name||'new').toLowerCase().replace(/\s+/g,'_'),name:dep.name||'New Department',description:dep.description||'',sortOrder:dep.sortOrder||list.length+1,active:dep.active!==false};
    if(i>=0) list[i]=saved; else list.push(saved);
    setConfig('departments',list);
    logAudit('Department',saved.id,i>=0?'update':'create','department',old,saved,userEmail,saved.name);
    return saved;
  },

  getRoleLabels(): RoleDisplayConfig[] { return readLocal('role_labels',DEFAULT_ROLE_LABELS); },
  updateRoleLabel(roleKey:string,updates:Partial<RoleDisplayConfig>,userEmail:string):RoleDisplayConfig|null {
    const list=this.getRoleLabels();
    const i=list.findIndex(x=>x.roleKey===roleKey);
    if(i<0)return null;
    const old=list[i];
    const saved={...old,...updates,roleKey:old.roleKey,isSystemProtected:true};
    list[i]=saved;
    setConfig('role_labels',list);
    logAudit('Role',roleKey,'update','display',old,saved,userEmail,roleKey);
    return saved;
  },

  // Retired compatibility methods. They intentionally expose no alternate commercial data.
  getCarePlans(_includeInactive=false):CarePlanConfig[]{
    clearRetiredCommercialCache();
    return [];
  },
  saveCarePlan(_plan:Partial<CarePlanConfig>,_userEmail:string):CarePlanConfig{
    clearRetiredCommercialCache();
    throw new Error('Care Plans are managed only in Sales Catalog.');
  },
  getPaymentSchedules():PaymentScheduleConfig[]{
    clearRetiredCommercialCache();
    return [];
  },
  savePaymentSchedule(_schedule:PaymentScheduleConfig,_userEmail:string){
    clearRetiredCommercialCache();
    return {success:false,message:'Payment schedules are managed only in Sales Catalog.'};
  },

  getCadence():FollowUpCadenceConfig{return readLocal('outreach_cadence',DEFAULT_CADENCE);},
  saveCadence(cadence:FollowUpCadenceConfig,userEmail:string){
    if(!cadence.steps?.length)return{success:false,message:'Cadence must contain at least 1 outreach step.'};
    for(let i=1;i<cadence.steps.length;i++){
      if(cadence.steps[i].day<cadence.steps[i-1].day)return{success:false,message:'Cadence days must be in ascending order.'};
    }
    const old=this.getCadence();
    setConfig('outreach_cadence',cadence);
    logAudit('Outreach Cadence',cadence.id,'update','steps',old,cadence,userEmail,cadence.name);
    return{success:true};
  },

  getOutreachTemplates():OutreachTemplate[]{return readLocal('outreach_templates',OUTREACH_TEMPLATES);},
  saveOutreachTemplate(t:OutreachTemplate,userEmail:string):OutreachTemplate{
    const list=this.getOutreachTemplates();
    const i=list.findIndex(x=>x.id===t.id);
    const old=i>=0?list[i]:null;
    const saved={...t,id:t.id||`tmpl_${Date.now()}`};
    if(i>=0)list[i]=saved;else list.push(saved);
    setConfig('outreach_templates',list);
    logAudit('Outreach Template',saved.id,i>=0?'update':'create','template',old,saved,userEmail,saved.title);
    return saved;
  },

  getNichePlaybooks():NichePlaybook[]{return readLocal('niche_playbooks',NICHE_PLAYBOOKS);},
  saveNichePlaybook(n:NichePlaybook,userEmail:string):NichePlaybook{
    const list=this.getNichePlaybooks();
    const i=list.findIndex(x=>x.id===n.id);
    const old=i>=0?list[i]:null;
    const saved={...n,id:n.id||`niche_${Date.now()}`};
    if(i>=0)list[i]=saved;else list.push(saved);
    setConfig('niche_playbooks',list);
    logAudit('Niche Playbook',saved.id,i>=0?'update':'create','playbook',old,saved,userEmail,saved.niche);
    return saved;
  },
  deleteNichePlaybook(id:string,userEmail:string):void{
    const list=this.getNichePlaybooks();
    const old=list.find(x=>x.id===id);
    setConfig('niche_playbooks',list.filter(x=>x.id!==id));
    if(old)logAudit('Niche Playbook',id,'delete','playbook',old,null,userEmail,old.niche);
  },

  getQuizQuestions():ProductQuizQuestion[]{return readLocal('quiz_questions',PRODUCT_QUIZ_QUESTIONS);},
  saveQuizQuestion(q:ProductQuizQuestion,userEmail:string):ProductQuizQuestion{
    const list=this.getQuizQuestions();
    const i=list.findIndex(x=>x.id===q.id);
    const old=i>=0?list[i]:null;
    const saved={...q,id:q.id||`pq_${Date.now()}`};
    if(i>=0)list[i]=saved;else list.push(saved);
    setConfig('quiz_questions',list);
    logAudit('Quiz Question',saved.id,i>=0?'update':'create','question',old,saved,userEmail,saved.question.slice(0,40));
    return saved;
  },
  deleteQuizQuestion(id:string,userEmail:string):void{
    const list=this.getQuizQuestions();
    const old=list.find(x=>x.id===id);
    setConfig('quiz_questions',list.filter(x=>x.id!==id));
    if(old)logAudit('Quiz Question',id,'delete','question',old,null,userEmail,old.question.slice(0,40));
  },

  getRecruitmentStages(includeInactive=false):RecruitmentStageConfig[]{
    const list=[...readLocal('recruitment_stages',DEFAULT_RECRUITMENT_STAGES)].sort((a,b)=>a.sortOrder-b.sortOrder);
    return includeInactive?list:list.filter(x=>x.active);
  },
  updateRecruitmentStage(stageKey:string,updates:Partial<RecruitmentStageConfig>,userEmail:string):RecruitmentStageConfig|null{
    const list=this.getRecruitmentStages(true);
    const i=list.findIndex(x=>x.stageKey===stageKey);
    if(i<0)return null;
    const old=list[i];
    const saved={...old,...updates,stageKey:old.stageKey,isGated:old.isGated};
    list[i]=saved;
    setConfig('recruitment_stages',list);
    logAudit('Recruitment Stage',stageKey,'update','stage',old,saved,userEmail,stageKey);
    return saved;
  },
  getRefusalReasons():string[]{return readLocal('refusal_reasons',DEFAULT_REFUSAL_REASONS);},
  saveRefusalReasons(reasons:string[],userEmail:string):void{
    const old=this.getRefusalReasons();
    setConfig('refusal_reasons',reasons);
    logAudit('Refusal Reasons','refusal_reasons','update','reasons',old,reasons,userEmail,'Recruitment Refusal Reasons');
  },

  getProjectStages(includeInactive=false):ProjectStageConfig[]{
    const list=[...readLocal('project_stages',DEFAULT_PROJECT_STAGES)].sort((a,b)=>a.sortOrder-b.sortOrder);
    return includeInactive?list:list.filter(x=>x.active);
  },
  updateProjectStage(stageKey:string,updates:Partial<ProjectStageConfig>,userEmail:string):ProjectStageConfig|null{
    const list=this.getProjectStages(true);
    const i=list.findIndex(x=>x.stageKey===stageKey);
    if(i<0)return null;
    const old=list[i];
    const saved={...old,...updates,stageKey:old.stageKey,isProtectedGate:old.isProtectedGate,paymentMilestoneKey:old.paymentMilestoneKey};
    list[i]=saved;
    setConfig('project_stages',list);
    logAudit('Project Stage',stageKey,'update','stage',old,saved,userEmail,stageKey);
    return saved;
  },
  getTaskStatuses():TaskStatusConfig[]{return [...readLocal('task_statuses',DEFAULT_TASK_STATUSES)].sort((a,b)=>a.sortOrder-b.sortOrder);},
  saveTaskStatus(status:TaskStatusConfig,userEmail:string):void{
    const list=this.getTaskStatuses();
    const i=list.findIndex(x=>x.statusKey===status.statusKey);
    const old=i>=0?list[i]:null;
    if(i>=0)list[i]=status;else list.push(status);
    setConfig('task_statuses',list);
    logAudit('Task Status',status.statusKey,i>=0?'update':'create','status',old,status,userEmail,status.displayLabel);
  },
  getTaskPriorities():TaskPriorityConfig[]{return [...readLocal('task_priorities',DEFAULT_TASK_PRIORITIES)].sort((a,b)=>a.sortOrder-b.sortOrder);},
  saveTaskPriority(priority:TaskPriorityConfig,userEmail:string):void{
    const list=this.getTaskPriorities();
    const i=list.findIndex(x=>x.priorityKey===priority.priorityKey);
    const old=i>=0?list[i]:null;
    if(i>=0)list[i]=priority;else list.push(priority);
    setConfig('task_priorities',list);
    logAudit('Task Priority',priority.priorityKey,i>=0?'update':'create','priority',old,priority,userEmail,priority.displayLabel);
  },

  getLeadSources():string[]{return readLocal('lead_sources',DEFAULT_LEAD_SOURCES);},
  saveLeadSources(sources:string[],userEmail:string):void{
    const old=this.getLeadSources();
    setConfig('lead_sources',sources);
    logAudit('Lead Sources','lead_sources','update','sources',old,sources,userEmail,'Lead Sources');
  },
  getLostReasons():string[]{return readLocal('lost_reasons',DEFAULT_LOST_REASONS);},
  saveLostReasons(reasons:string[],userEmail:string):void{
    const old=this.getLostReasons();
    setConfig('lost_reasons',reasons);
    logAudit('Lost Reasons','lost_reasons','update','reasons',old,reasons,userEmail,'Lost Reasons');
  },

  getClientPortalConfig():ClientPortalConfig{return readLocal('client_portal_config',DEFAULT_CLIENT_PORTAL);},
  updateClientPortalConfig(config:Partial<ClientPortalConfig>,userEmail:string):ClientPortalConfig{
    const old=this.getClientPortalConfig();
    const updated={...old,...config};
    setConfig('client_portal_config',updated);
    logAudit('Client Experience','client_portal_config','update','portal',old,updated,userEmail,'Client Portal');
    return updated;
  }
};
