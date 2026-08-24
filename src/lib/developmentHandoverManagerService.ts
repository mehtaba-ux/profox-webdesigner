import { supabase } from './supabase';
import { developmentDeliveryService } from './developmentDeliveryService';

export interface DevelopmentHandoverQueueItem {
  packageId:string;version:number;submittedAt:string;submissionNote:string;clientPackage:Record<string,string>;
  projectId:string;projectNumber:string;projectName:string;projectStage:string;clientName:string;
  preparedBy:string;developerName:string;projectManagerId?:string;ageHours:number;
}

export const developmentHandoverManagerService={
 async getQueue():Promise<DevelopmentHandoverQueueItem[]>{
  const{data,error}=await supabase.rpc('development_manager_get_handover_queue');
  if(error)throw new Error(error.message||'Unable to load final handover review queue.');
  return(Array.isArray(data)?data:[]) as DevelopmentHandoverQueueItem[];
 },
 async review(packageId:string,decision:'Approved'|'Changes Required',notes=''){
  return developmentDeliveryService.reviewHandover(packageId,decision,notes);
 }
};
