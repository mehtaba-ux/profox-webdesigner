import { supabase } from './supabase';

export type CareerJobStatus = 'Draft' | 'Published' | 'Closed';
export type CareerApplicationType = 'sales_representative' | 'content_writer' | 'general' | 'external_link';

export interface SalesRoleDetails {
  subtitle?: string;
  focusMarkets?: string[];
  roleOverview?: string;
  prospectingChannels?: string[];
  crmDiscipline?: string[];
  idealCandidate?: string[];
  preferredExperience?: string[];
  experienceNote?: string;
  targetCustomers?: string[];
  digitalProblemSignals?: string[];
  workingArrangement?: { workingDays?: string; expectedHoursPerWeek?: number };
  equipmentRequirements?: string[];
  performanceExpectations?: {
    qualifiedProspectsPerDay?: string;
    qualifiedOutreachPerDay?: string;
    callsPerDay?: string;
    followUps?: string;
    meetings?: string;
    minimumMonthlyPaidSales?: number;
  };
  paymentRules?: string[];
  authorityRestrictions?: string[];
  authorityNote?: string;
  applicationRequirements?: string[];
  applicationForm?: {
    minimumSalesExperienceMonths?: number;
    minimumWeeklyHours?: number;
    sourceOptions?: string[];
    portfolioRequired?: boolean;
    cvRequired?: boolean;
  };
  video?: {
    minimumSeconds?: number;
    recommendedMaximumSeconds?: number;
    questions?: string[];
    standards?: string[];
    evaluation?: string;
  };
  additionalServiceSummary?: string[];
  careerProgressionNote?: string;
  targetRole?: string;
  targetDepartment?: string;
  academyKey?: string;
}

export interface CareerJob {
  id: string;
  slug: string;
  title: string;
  shortSummary: string;
  description: string;
  department: string;
  category: string;
  location: string;
  workplaceType: 'Remote' | 'Hybrid' | 'On-site';
  engagementType: string;
  experience: string;
  responsibilities: string[];
  requirements: string[];
  selectionProcess: Array<{ title: string; text: string }>;
  compensation: Array<{ label?: string; price?: string; rate?: string; example?: string }>;
  roleDetails: SalesRoleDetails;
  coreProductCodes: string[];
  additionalServiceCodes: string[];
  applicationType: CareerApplicationType;
  applicationUrl?: string;
  applicationCta: string;
  requiresIntroVideo: boolean;
  featured: boolean;
  displayOrder: number;
  status: CareerJobStatus;
  publishedAt?: string;
  closesAt?: string;
  seoTitle?: string;
  seoDescription?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CareerCatalogOption { code:string;name:string;category:string;productType:string;priceMode:string;basePrice:number;currency:string }
export interface PublicSalesProduct extends CareerCatalogOption { shortDescription?:string;fullDescription?:string;scope?:string[];paymentTerms?:string }
export interface PublicCommissionRule { productCode:string;productName:string;baseRatePercent:number;minRatePercent:number;maxRatePercent:number;requiresAdminRate:boolean }
export interface PublicCareerProgression {
  enabled:boolean;title?:string;description?:string;qualificationMode?:'ANY'|'ALL';periodType?:'calendar_month'|'rolling_30_days'|'quarter';minimumTotalSales?:number;minimumActiveDays?:number;salaryAmount?:number|null;salaryCurrency?:string|null;incentiveDescription?:string;managementReviewRequired?:boolean;
  thresholds?:Array<{productCode:string;productName:string;requiredSales:number;basePrice:number;currency:string;priceMode:string}>;
}
export interface PublicSalesRoleContext {
  job:CareerJob;products:PublicSalesProduct[];additionalServices:PublicSalesProduct[];
  commission:{selfGeneratedBonusPercent:number;performanceThreshold:number;performanceBonusPercent:number;payoutSchedule:string;rules:PublicCommissionRule[]};
  careerProgression:PublicCareerProgression;
}

const mapFromDb=(row:any):CareerJob=>({id:row.id,slug:row.slug,title:row.title,shortSummary:row.short_summary||'',description:row.description||'',department:row.department||'General',category:row.category||'General',location:row.location||'Remote',workplaceType:row.workplace_type||'Remote',engagementType:row.engagement_type||'Contract',experience:row.experience||'',responsibilities:Array.isArray(row.responsibilities)?row.responsibilities:[],requirements:Array.isArray(row.requirements)?row.requirements:[],selectionProcess:Array.isArray(row.selection_process)?row.selection_process:[],compensation:Array.isArray(row.compensation)?row.compensation:[],roleDetails:row.role_details&&typeof row.role_details==='object'?row.role_details:{},coreProductCodes:Array.isArray(row.core_product_codes)?row.core_product_codes:[],additionalServiceCodes:Array.isArray(row.additional_service_codes)?row.additional_service_codes:[],applicationType:row.application_type||'general',applicationUrl:row.application_url||undefined,applicationCta:row.application_cta||'Apply for this role',requiresIntroVideo:!!row.requires_intro_video,featured:!!row.featured,displayOrder:Number(row.display_order||0),status:row.status||'Draft',publishedAt:row.published_at||undefined,closesAt:row.closes_at||undefined,seoTitle:row.seo_title||undefined,seoDescription:row.seo_description||undefined,createdAt:row.created_at||undefined,updatedAt:row.updated_at||undefined});
const mapToDb=(job:Partial<CareerJob>)=>{const row:Record<string,any>={};const set=(key:string,value:any)=>{if(value!==undefined)row[key]=value};set('slug',job.slug);set('title',job.title);set('short_summary',job.shortSummary);set('description',job.description);set('department',job.department);set('category',job.category);set('location',job.location);set('workplace_type',job.workplaceType);set('engagement_type',job.engagementType);set('experience',job.experience);set('responsibilities',job.responsibilities);set('requirements',job.requirements);set('selection_process',job.selectionProcess);set('compensation',job.compensation);set('role_details',job.roleDetails);set('core_product_codes',job.coreProductCodes);set('additional_service_codes',job.additionalServiceCodes);set('application_type',job.applicationType);set('application_url',job.applicationUrl||null);set('application_cta',job.applicationCta);set('requires_intro_video',job.requiresIntroVideo);set('featured',job.featured);set('display_order',job.displayOrder);set('status',job.status);set('published_at',job.publishedAt||null);set('closes_at',job.closesAt||null);set('seo_title',job.seoTitle||null);set('seo_description',job.seoDescription||null);row.updated_at=new Date().toISOString();return row};
const normalizeSalesContextJob=(job:any):CareerJob=>({id:job?.id||'',slug:job?.slug||'',title:job?.title||'',shortSummary:job?.shortSummary||'',description:job?.description||'',department:job?.department||'Sales',category:job?.category||'International Sales',location:job?.location||'Remote - Worldwide',workplaceType:job?.workplaceType||'Remote',engagementType:job?.engagementType||'Independent contractor - Commission-based',experience:job?.experience||'',responsibilities:Array.isArray(job?.responsibilities)?job.responsibilities:[],requirements:Array.isArray(job?.requirements)?job.requirements:[],selectionProcess:Array.isArray(job?.selectionProcess)?job.selectionProcess:[],compensation:[],roleDetails:job?.roleDetails||{},coreProductCodes:[],additionalServiceCodes:[],applicationType:'sales_representative',applicationCta:job?.applicationCta||'Apply for this role',requiresIntroVideo:Boolean(job?.requiresIntroVideo),featured:false,displayOrder:0,status:'Published',seoTitle:job?.seoTitle||undefined,seoDescription:job?.seoDescription||undefined});

export const careerService={
 async getPublicJobs(){const{data,error}=await supabase.from('career_jobs').select('*').order('featured',{ascending:false}).order('display_order',{ascending:true}).order('published_at',{ascending:false});if(error)throw error;return(data||[]).map(mapFromDb)},
 async getPublicJobBySlug(slug:string){const{data,error}=await supabase.from('career_jobs').select('*').eq('slug',slug).maybeSingle();if(error)throw error;return data?mapFromDb(data):null},
 async getPublicSalesRoleContext(slug:string):Promise<PublicSalesRoleContext|null>{const{data,error}=await supabase.rpc('get_public_sales_role_context',{p_slug:slug});if(error)throw error;if(!data)return null;return{...data,job:normalizeSalesContextJob(data.job),products:Array.isArray(data.products)?data.products:[],additionalServices:Array.isArray(data.additionalServices)?data.additionalServices:[],commission:{selfGeneratedBonusPercent:Number(data.commission?.selfGeneratedBonusPercent||0),performanceThreshold:Number(data.commission?.performanceThreshold||0),performanceBonusPercent:Number(data.commission?.performanceBonusPercent||0),payoutSchedule:data.commission?.payoutSchedule||'',rules:Array.isArray(data.commission?.rules)?data.commission.rules:[]},careerProgression:data.careerProgression||{enabled:false}}as PublicSalesRoleContext},
 async getAdminJobs(){const{data,error}=await supabase.from('career_jobs').select('*').order('display_order',{ascending:true}).order('created_at',{ascending:false});if(error)throw error;return(data||[]).map(mapFromDb)},
 async getActiveCatalogOptions():Promise<CareerCatalogOption[]>{const{data,error}=await supabase.from('sales_products').select('code,name,category,product_type,price_mode,base_price,currency').eq('active',true).order('sort_order',{ascending:true});if(error)throw error;return(data||[]).map((row:any)=>({code:row.code,name:row.name,category:row.category||'General',productType:row.product_type||'addon',priceMode:row.price_mode||'fixed',basePrice:Number(row.base_price||0),currency:row.currency||'USD'}))},
 async createJob(job:Partial<CareerJob>){const payload=mapToDb(job);delete payload.updated_at;const{data,error}=await supabase.from('career_jobs').insert(payload).select('*').single();if(error)throw error;return mapFromDb(data)},
 async updateJob(id:string,job:Partial<CareerJob>){const{data,error}=await supabase.from('career_jobs').update(mapToDb(job)).eq('id',id).select('*').single();if(error)throw error;return mapFromDb(data)},
 async deleteJob(id:string){const{error}=await supabase.from('career_jobs').delete().eq('id',id);if(error)throw error}
};