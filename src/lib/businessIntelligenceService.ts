import { supabase } from './supabase';

export type BusinessSeverity = 'Critical'|'High'|'Medium';

export interface BusinessException {
  exceptionKey:string;
  severity:BusinessSeverity;
  area:'Sales'|'Finance'|'Delivery'|'Recruitment'|string;
  type:string;
  title:string;
  detail:string;
  entityType:string;
  entityId:string;
  ownerUserId?:string|null;
  priorityScore:number;
  bucket:'Do Now'|'Overdue'|'Upcoming'|'Waiting'|string;
  actionLabel:string;
  actionUrl:string;
  metadata:Record<string,unknown>;
}

export interface BusinessIntelligenceSettings {
  active:boolean;
  primaryCurrency:string;
  defaultPeriodDays:number;
  thresholds:{
    leadResponseHours:number;
    staleLeadDays:number;
    staleOpportunityDays:number;
    staleQuotationDays:number;
    overduePaymentGraceDays:number;
    projectRiskDays:number;
    applicantStageDays:number;
    maxOpenTasksPerPerson:number;
  };
  stageForecastWeights:Record<string,number>;
}

export interface CurrencyPipeline {
  currency:string;
  openPipeline:number;
  weightedPipeline:number;
}
export interface CurrencyFinance {
  currency:string;
  verifiedRevenue:number;
  outstanding:number;
  overdue:number;
  commissionsOutstanding:number;
  activeProjectValue:number;
}
export interface TeamWorkloadRow {
  userId:string;
  name:string;
  role:string;
  department?:string|null;
  openTasks:number;
  overdueActivities:number;
  meetingsNext7Days:number;
  atCapacity:boolean;
}

export interface BusinessIntelligenceDashboard {
  periodDays:number;
  primaryCurrency:string;
  generatedAt:string;
  health:{score:number;status:'Healthy'|'Watch'|'At Risk'|string;critical:number;high:number;medium:number;openExceptions:number};
  overview:{activeLeads:number;openOpportunities:number;activeProjects:number;activeStaff:number;clients:number};
  sales:{
    leadsCreated:number;opportunitiesCreated:number;meetingsCompleted:number;quotationsSent:number;wonDeals:number;lostDeals:number;
    winRate:number;leadToOpportunityRate:number;averageSalesCycleDays:number;weightedPipelinePrimary:number;
    pipelineByCurrency:CurrencyPipeline[];stageCounts:Record<string,number>;sourcePerformance:Array<{source:string;leads:number;opportunities:number;won:number}>;
  };
  delivery:{activeProjects:number;completedProjects:number;atRiskProjects:number;overdueTasks:number;tasksDueNext7Days:number;unassignedProjects:number;workload:TeamWorkloadRow[]};
  finance:{primary:{currency:string;verifiedRevenue:number;previousPeriodRevenue:number;revenueChangePercent:number|null;outstanding:number};byCurrency:CurrencyFinance[]};
  recruitment:{activeCandidates:number;newCandidates:number;activated:number;stuckCandidates:number;stageCounts:Record<string,number>};
  team:{activeStaff:number;atCapacity:number;workload:TeamWorkloadRow[];dayClosesLast7Days:number};
  exceptions:BusinessException[];
  settingsSummary:{thresholds:BusinessIntelligenceSettings['thresholds'];stageForecastWeights:Record<string,number>};
}

export interface ManagementBrief {
  periodDays:number;
  generatedAt:string;
  headline:string;
  pulse:Array<{label:string;value:string}>;
  watch:Array<{title:string;detail:string;area:string;severity:string;actionUrl:string}>;
  decisions:Array<{title:string;actionLabel:string;actionUrl:string;severity:string}>;
}

export const businessIntelligenceService={
  async getDashboard(periodDays=30):Promise<BusinessIntelligenceDashboard>{
    const {data,error}=await supabase.rpc('get_business_intelligence_dashboard',{p_period_days:periodDays});
    if(error)throw error;
    return data as BusinessIntelligenceDashboard;
  },
  async getBrief(periodDays=7):Promise<ManagementBrief>{
    const {data,error}=await supabase.rpc('get_business_intelligence_brief',{p_period_days:periodDays});
    if(error)throw error;
    return data as ManagementBrief;
  },
  async getSettings():Promise<BusinessIntelligenceSettings>{
    const {data,error}=await supabase.rpc('admin_get_business_intelligence_settings');
    if(error)throw error;
    return data as BusinessIntelligenceSettings;
  },
  async saveSettings(settings:BusinessIntelligenceSettings):Promise<BusinessIntelligenceSettings>{
    const {data,error}=await supabase.rpc('admin_set_business_intelligence_settings',{p_settings:settings});
    if(error)throw error;
    return data as BusinessIntelligenceSettings;
  }
};
