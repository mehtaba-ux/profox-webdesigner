import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-profox-calendar-cron-token","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json","Cache-Control":"no-store"}});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const validEmail=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const eventIdFor=(meetingId:string)=>`m${meetingId.replaceAll("-","").toLowerCase()}`;
const conferenceRequestIdFor=(meetingId:string)=>`pf${meetingId.replaceAll("-","").toLowerCase()}`;
const calendarUrl=(calendarId:string,path:string)=>`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId||"primary")}${path}`;
const extractMeet=(event:any)=>String(event?.hangoutLink||(event?.conferenceData?.entryPoints||[]).find((x:any)=>x?.entryPointType==="video")?.uri||"");
const conferenceState=(event:any,requested:boolean)=>{const code=String(event?.conferenceData?.createRequest?.status?.statusCode||"").toLowerCase();if(code==="success"||extractMeet(event))return "success";if(code==="failure")return "failed";if(requested)return "pending";return "none";};

function retryDelay(attempts:number,base:number){const exponential=Math.min(base*Math.pow(2,Math.max(attempts-1,0)),21600);const jitter=Math.floor(Math.random()*Math.max(1,Math.min(exponential*.25,60)));return Math.max(5,Math.round(exponential+jitter));}
function googleErrorMessage(payload:any,status:number){return String(payload?.error?.message||payload?.error_description||payload?.error||`Google API request failed (${status})`).slice(0,1800);}
function errorReasons(payload:any){const errors=payload?.error?.errors;return Array.isArray(errors)?errors.map((x:any)=>String(x?.reason||"")).filter(Boolean):[];}
function shouldRetry(status:number,payload:any){if(status===429||status>=500)return true;const reasons=errorReasons(payload);return status===403&&reasons.some((x:string)=>["rateLimitExceeded","userRateLimitExceeded","quotaExceeded","backendError"].includes(x));}
function needsReconnect(status:number,payload:any){if(status===401)return true;const reasons=errorReasons(payload);return status===403&&reasons.some((x:string)=>["authError","insufficientPermissions","forbidden"].includes(x));}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
 const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 let clientId=Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID")||"";
 let clientSecret=Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET")||"";
 if(!supabaseUrl||!anonKey||!serviceKey)return json({error:"Server configuration unavailable"},500);
 const service=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 if(!clientId||!clientSecret){
  const {data:provider}=await service.rpc("service_get_google_calendar_provider_credentials");
  clientId=clientId||String(provider?.clientId||"");
  clientSecret=clientSecret||String(provider?.clientSecret||"");
 }
 let body:any={};try{body=await req.json();}catch{body={};}

 // Cron uses a Vault token. Staff manual runs require a valid JWT and can queue only their own synchronization.
 const cronHeader=req.headers.get("x-profox-calendar-cron-token")||"";
 const {data:cronSecret}=await service.rpc("service_get_google_calendar_cron_secret");
 let manualUserId="";
 if(!cronSecret||cronHeader!==String(cronSecret)){
   const authHeader=req.headers.get("Authorization")||"";
   if(!authHeader.startsWith("Bearer "))return json({error:"Authentication required"},401);
   const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
   const {data:userData,error:userError}=await userClient.auth.getUser();
   if(userError||!userData.user)return json({error:"Authentication required"},401);
   manualUserId=userData.user.id;
   if(String(body?.action||"")==="sync_now"){
     const {error:queueError}=await userClient.rpc("request_google_calendar_sync_now");
     if(queueError)return json({error:queueError.message},400);
   }else return json({error:"Unsupported manual action"},400);
 }

 await service.rpc("service_queue_due_google_busy_refreshes");
 const {data:configRow}=await service.from("system_configuration").select("config_value").eq("config_key","google_calendar_settings").maybeSingle();
 const cfg=configRow?.config_value||{};
 const maxAttempts=Math.min(Math.max(Number(cfg.maxSyncAttempts||8),1),20);
 const baseRetry=Math.min(Math.max(Number(cfg.baseRetrySeconds||30),5),1800);
 const lookaheadDays=Math.min(Math.max(Number(cfg.busyLookaheadDays||90),7),365);
 const sendUpdates=["all","externalOnly","none"].includes(String(cfg.sendUpdates))?String(cfg.sendUpdates):"none";
 const {data:jobs,error:claimError}=await service.rpc("service_claim_google_sync_jobs",{p_limit:25});
 if(claimError)return json({error:claimError.message},500);
 const results:any[]=[];

 async function audit(job:any,status:string,httpStatus:number|null,detail:string){await service.rpc("service_log_google_sync",{p_user_id:job.user_id,p_meeting_id:job.meeting_id||null,p_job_id:job.id,p_operation:job.job_type,p_status:status,p_http_status:httpStatus,p_detail:detail});}
 async function finish(job:any,status:string,message="",retrySeconds?:number){await service.rpc("service_finish_google_sync_job",{p_job_id:job.id,p_status:status,p_error:message||null,p_retry_seconds:retrySeconds??null});}
 async function reconnect(job:any,message:string,httpStatus:number|null=null){await service.rpc("service_mark_google_connection_state",{p_user_id:job.user_id,p_status:"reconnect_required",p_error:message,p_success:false});await finish(job,"reconnect_required",message);await audit(job,"reconnect_required",httpStatus,message);}
 async function failOrRetry(job:any,message:string,httpStatus:number|null=null,forceRetry=false){const retry=forceRetry&&Number(job.attempts)<maxAttempts;if(retry){const delay=retryDelay(Number(job.attempts),baseRetry);await finish(job,"retry",message,delay);await audit(job,"retry",httpStatus,`${message} · retry in ${delay}s`);}else{await finish(job,"failed",message);/* A sync/configuration error does not revoke the saved OAuth grant. Keep the account connected and reserve reconnect_required for invalid credentials or permissions. */await service.rpc("service_mark_google_connection_state",{p_user_id:job.user_id,p_status:"connected",p_error:message,p_success:false});await audit(job,"failed",httpStatus,message);}}

 async function accessTokenFor(job:any){
   if(!clientId||!clientSecret)throw Object.assign(new Error("Google Calendar server OAuth credentials are not configured."),{kind:"configuration"});
   const {data:refreshToken,error:refreshError}=await service.rpc("service_get_google_refresh_token",{p_user_id:job.user_id});
   if(refreshError||!refreshToken)throw Object.assign(new Error("Google Calendar refresh token is unavailable. Reconnect the Google account."),{kind:"reconnect"});
   let response:Response;try{response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:String(refreshToken),grant_type:"refresh_token"})});}catch(error){throw Object.assign(new Error(error instanceof Error?error.message:"Google token endpoint unavailable"),{kind:"retry"});}
   const payload:any=await response.json().catch(()=>({}));
   if(!response.ok){const message=googleErrorMessage(payload,response.status);if(String(payload?.error||"")==="invalid_grant"||response.status===401)throw Object.assign(new Error(message),{kind:"reconnect",status:response.status});if(response.status===429||response.status>=500)throw Object.assign(new Error(message),{kind:"retry",status:response.status});throw Object.assign(new Error(message),{kind:"configuration",status:response.status});}
   const token=String(payload?.access_token||"");if(!token)throw Object.assign(new Error("Google token refresh returned no access token."),{kind:"reconnect"});return token;
 }
 async function googleFetch(job:any,token:string,url:string,init:RequestInit={}){
   let response:Response;try{response=await fetch(url,{...init,headers:{...(init.headers||{}),Authorization:`Bearer ${token}`,"Content-Type":"application/json"}});}catch(error){throw Object.assign(new Error(error instanceof Error?error.message:"Google Calendar network error"),{kind:"retry"});}
   const text=await response.text();let payload:any={};try{payload=text?JSON.parse(text):{};}catch{payload={raw:text};}
   return {response,payload};
 }

 async function refreshBusy(job:any,token:string,connection:any){
   const timeMin=new Date(Date.now()-60*60*1000).toISOString();const timeMax=new Date(Date.now()+lookaheadDays*86400000).toISOString();
   const {response,payload}=await googleFetch(job,token,"https://www.googleapis.com/calendar/v3/freeBusy",{method:"POST",body:JSON.stringify({timeMin,timeMax,items:[{id:connection.calendar_id||"primary"}]})});
   if(!response.ok){const message=googleErrorMessage(payload,response.status);if(needsReconnect(response.status,payload))return reconnect(job,message,response.status);return failOrRetry(job,message,response.status,shouldRetry(response.status,payload));}
   const calendar=payload?.calendars?.[connection.calendar_id||"primary"]||payload?.calendars?.primary||{};
   if(Array.isArray(calendar?.errors)&&calendar.errors.length){const message=`Google FreeBusy returned calendar errors: ${JSON.stringify(calendar.errors).slice(0,800)}`;return failOrRetry(job,message,response.status,true);}
   const busy=Array.isArray(calendar?.busy)?calendar.busy:[];
   const {error:replaceError}=await service.rpc("service_replace_google_busy_blocks",{p_user_id:job.user_id,p_calendar_id:connection.calendar_id||"primary",p_window_start:timeMin,p_window_end:timeMax,p_busy:busy});
   if(replaceError)return failOrRetry(job,replaceError.message,null,true);
   await finish(job,"succeeded");await audit(job,"succeeded",200,`Google busy cache refreshed (${busy.length} busy interval${busy.length===1?"":"s"}).`);return true;
 }

 async function loadMeeting(job:any){const {data,error}=await service.from("sales_meetings").select("*").eq("id",job.meeting_id).eq("salesperson_id",job.user_id).maybeSingle();if(error||!data)throw Object.assign(new Error(error?.message||"Meeting no longer exists."),{kind:"failed"});return data;}
 async function loadLink(job:any){const {data}=await service.from("google_calendar_event_links").select("*").eq("meeting_id",job.meeting_id).maybeSingle();return data||null;}
 async function persistEvent(job:any,connection:any,event:any,eventId:string,conferenceRequestId:string,operation:string){const meetUrl=extractMeet(event);const requested=Boolean(connection.create_meet);const state=conferenceState(event,requested);const {error}=await service.rpc("service_upsert_google_event_link",{p_meeting_id:job.meeting_id,p_user_id:job.user_id,p_calendar_id:connection.calendar_id||"primary",p_event_id:eventId,p_conference_request_id:conferenceRequestId,p_meet_url:meetUrl,p_etag:String(event?.etag||""),p_conference_status:state,p_operation:operation});if(error)throw Object.assign(new Error(error.message),{kind:"retry"});return {meetUrl,state};}
 function eventBody(meeting:any,connection:any,eventId:string,conferenceRequestId:string,includeId:boolean,requestMeet:boolean){const body:any={summary:String(meeting.title||"ProFox Meeting"),description:`${String(meeting.description||"").trim()}${meeting.description?"\n\n":""}ProFox Meeting ID: ${meeting.id}`,start:{dateTime:new Date(meeting.start_at).toISOString(),timeZone:String(meeting.timezone||connection.calendar_timezone||"UTC")},end:{dateTime:new Date(meeting.end_at).toISOString(),timeZone:String(meeting.timezone||connection.calendar_timezone||"UTC")},extendedProperties:{private:{profoxMeetingId:String(meeting.id),profoxSource:"profox-calendar"}}};if(includeId)body.id=eventId;if(validEmail(String(meeting.attendee_email||"")))body.attendees=[{email:String(meeting.attendee_email).toLowerCase(),displayName:String(meeting.attendee_name||"")||undefined}];if(requestMeet)body.conferenceData={createRequest:{requestId:conferenceRequestId,conferenceSolutionKey:{type:"hangoutsMeet"}}};return body;}

 async function upsertOrReconcile(job:any,token:string,connection:any){
   const meeting=await loadMeeting(job);if(meeting.status==="Cancelled")return deleteEvent(job,token,connection);
   const link=await loadLink(job);const eventId=String(link?.external_event_id||eventIdFor(meeting.id));const conferenceRequestId=String(link?.conference_request_id||conferenceRequestIdFor(meeting.id));const base=calendarUrl(connection.calendar_id||"primary",`/events/${encodeURIComponent(eventId)}`);const requestMeet=Boolean(connection.create_meet)&&!String(link?.meet_url||meeting.meeting_url||"").startsWith("https://meet.google.com/");
   let existing:any=null;const get=await googleFetch(job,token,`${base}?conferenceDataVersion=1`,{method:"GET"});
   if(get.response.ok)existing=get.payload;else if(get.response.status!==404){const message=googleErrorMessage(get.payload,get.response.status);if(needsReconnect(get.response.status,get.payload))return reconnect(job,message,get.response.status);return failOrRetry(job,message,get.response.status,shouldRetry(get.response.status,get.payload));}
   if(job.job_type==="reconcile_event"&&existing){const saved=await persistEvent(job,connection,existing,eventId,conferenceRequestId,"reconcile");if(saved.state==="pending"&&!saved.meetUrl&&Number(job.attempts)<maxAttempts){await finish(job,"retry","Google Meet conference creation is still pending.",Math.max(15,baseRetry));await audit(job,"retry",200,"Google event exists; Meet conference is still pending.");return;}await finish(job,"succeeded");await service.rpc("service_mark_google_connection_state",{p_user_id:job.user_id,p_status:"connected",p_error:null,p_success:true});await audit(job,"succeeded",200,saved.meetUrl?"Google event and Meet link reconciled.":"Google event reconciled.");return true;}
   const body=eventBody(meeting,connection,eventId,conferenceRequestId,!existing,requestMeet&&!existing);
   let write;if(existing){write=await googleFetch(job,token,`${base}?conferenceDataVersion=1&sendUpdates=${encodeURIComponent(sendUpdates)}`,{method:"PATCH",body:JSON.stringify(body)});}else{write=await googleFetch(job,token,`${calendarUrl(connection.calendar_id||"primary","/events")}?conferenceDataVersion=1&sendUpdates=${encodeURIComponent(sendUpdates)}`,{method:"POST",body:JSON.stringify(body)});if(write.response.status===409){await sleep(150);write=await googleFetch(job,token,`${base}?conferenceDataVersion=1`,{method:"GET"});}}
   if(!write.response.ok){const message=googleErrorMessage(write.payload,write.response.status);if(needsReconnect(write.response.status,write.payload))return reconnect(job,message,write.response.status);return failOrRetry(job,message,write.response.status,shouldRetry(write.response.status,write.payload));}
   const saved=await persistEvent(job,connection,write.payload,eventId,conferenceRequestId,"upsert");await finish(job,"succeeded");await service.rpc("service_mark_google_connection_state",{p_user_id:job.user_id,p_status:"connected",p_error:null,p_success:true});await audit(job,"succeeded",write.response.status,saved.meetUrl?"Google event synchronized and Meet link saved to the ProFox meeting.":`Google event synchronized${saved.state==="pending"?"; Meet creation pending":""}.`);
   if(saved.state==="pending"&&!saved.meetUrl)await service.rpc("queue_google_calendar_sync",{p_user_id:job.user_id,p_job_type:"reconcile_event",p_meeting_id:job.meeting_id,p_force:true});
   await service.rpc("queue_google_calendar_sync",{p_user_id:job.user_id,p_job_type:"refresh_busy",p_meeting_id:null,p_force:true});return true;
 }
 async function deleteEvent(job:any,token:string,connection:any){
   const meeting=await loadMeeting(job);const link=await loadLink(job);const eventId=String(link?.external_event_id||eventIdFor(meeting.id));const url=`${calendarUrl(connection.calendar_id||"primary",`/events/${encodeURIComponent(eventId)}`)}?sendUpdates=${encodeURIComponent(sendUpdates)}`;const result=await googleFetch(job,token,url,{method:"DELETE"});
   if(!result.response.ok&&result.response.status!==404&&result.response.status!==410){const message=googleErrorMessage(result.payload,result.response.status);if(needsReconnect(result.response.status,result.payload))return reconnect(job,message,result.response.status);return failOrRetry(job,message,result.response.status,shouldRetry(result.response.status,result.payload));}
   if(link)await service.from("google_calendar_event_links").update({last_operation:"delete",last_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("meeting_id",job.meeting_id);
   await finish(job,"succeeded");await service.rpc("service_mark_google_connection_state",{p_user_id:job.user_id,p_status:"connected",p_error:null,p_success:true});await audit(job,"succeeded",result.response.status===404?404:204,result.response.status===404?"Google event was already absent; cancellation treated as synchronized.":"Google event cancelled/deleted for the ProFox meeting.");await service.rpc("queue_google_calendar_sync",{p_user_id:job.user_id,p_job_type:"refresh_busy",p_meeting_id:null,p_force:true});return true;
 }

 for(const job of (jobs||[])){
   try{
     if(manualUserId&&job.user_id!==manualUserId){await finish(job,"retry","Deferred to scheduled worker.",5);continue;}
     const {data:connection,error:connectionError}=await service.from("google_calendar_connections").select("*").eq("user_id",job.user_id).maybeSingle();
     if(connectionError||!connection||connection.status!=="connected"||connection.sync_enabled!==true){await finish(job,"failed","Google Calendar is no longer connected/enabled.");continue;}
     const token=await accessTokenFor(job);
     if(job.job_type==="refresh_busy")await refreshBusy(job,token,connection);
     else if(job.job_type==="delete_event")await deleteEvent(job,token,connection);
     else await upsertOrReconcile(job,token,connection);
     results.push({id:job.id,type:job.job_type,processed:true});
   }catch(error:any){const message=error instanceof Error?error.message:"Google sync failed.";const kind=String(error?.kind||"");if(kind==="reconnect")await reconnect(job,message,error?.status||null);else if(kind==="retry")await failOrRetry(job,message,error?.status||null,true);else if(kind==="failed")await failOrRetry(job,message,error?.status||null,false);else await failOrRetry(job,message,error?.status||null,false);results.push({id:job.id,type:job.job_type,processed:false,error:message});}
 }
 await service.rpc("service_google_sync_maintenance");
 return json({ok:true,claimed:(jobs||[]).length,results});
});
