import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

const accountsHost=(dc:string)=>({
  com:"https://accounts.zoho.com",in:"https://accounts.zoho.in",eu:"https://accounts.zoho.eu",
  "com.au":"https://accounts.zoho.com.au",jp:"https://accounts.zoho.jp",ca:"https://accounts.zohocloud.ca",sa:"https://accounts.zoho.sa"
} as Record<string,string>)[dc]||"";
const mailHost=(dc:string)=>({
  com:"https://mail.zoho.com",in:"https://mail.zoho.in",eu:"https://mail.zoho.eu",
  "com.au":"https://mail.zoho.com.au",jp:"https://mail.zoho.jp",ca:"https://mail.zohocloud.ca",sa:"https://mail.zoho.sa"
} as Record<string,string>)[dc]||"";

function retryDelay(attempts:number){const base=30;const exp=Math.min(base*Math.pow(2,Math.max(attempts-1,0)),21600);return Math.max(10,Math.round(exp+Math.random()*Math.min(exp*.25,60)));}
function safeError(payload:any,status:number){return String(payload?.data?.errorCode||payload?.data?.moreInfo||payload?.status?.description||payload?.error_description||payload?.error||payload?.message||`Zoho API request failed (${status})`).slice(0,1600);}
function normalizePart(value:string){return value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,".").replace(/^\.+|\.+$/g,"").replace(/\.{2,}/g,".");}
function nameParts(fullName:string,fallbackEmail:string,userId:string){
  const words=String(fullName||"").trim().split(/\s+/).map(normalizePart).filter(Boolean);
  if(words.length>=2)return {first:words[0],last:words[words.length-1],base:`${words[0]}.${words[words.length-1]}`.slice(0,48)};
  if(words.length===1)return {first:words[0],last:"",base:words[0].slice(0,48)};
  const emailBase=normalizePart(String(fallbackEmail||"").split("@")[0]||"");
  const base=(emailBase||`employee.${userId.replaceAll("-","").slice(0,8)}`).slice(0,48);
  return {first:base.split(".")[0]||"Employee",last:"",base};
}
function tempPassword(){
  const bytes=new Uint8Array(18);crypto.getRandomValues(bytes);
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let body="";for(const b of bytes)body+=alphabet[b%alphabet.length];
  return `Pf!${body}9a`;
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!supabaseUrl||!serviceKey)return json({error:"Server configuration unavailable"},500);
  const service=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

  const cronHeader=req.headers.get("x-profox-mailbox-cron-token")||"";
  const authHeader=req.headers.get("Authorization")||"";
  const {data:cronSecret}=await service.rpc("service_get_professional_mailbox_cron_secret");
  const internalAuth=authHeader===`Bearer ${serviceKey}`;
  if(!internalAuth&&(!cronSecret||cronHeader!==String(cronSecret)))return json({error:"Unauthorized"},401);

  const {data:runtime,error:runtimeError}=await service.rpc("service_get_zoho_org_mail_runtime");
  if(runtimeError)return json({error:"Zoho Mail runtime configuration could not be loaded."},500);
  if(String(runtime?.status||"")!=="connected")return json({ok:true,claimed:0,reason:"zoho_mail_not_connected"});
  const dc=String(runtime?.dataCenter||"");const orgId=String(runtime?.organizationId||"");
  const clientId=String(runtime?.clientId||"");const clientSecret=String(runtime?.clientSecret||"");const refreshToken=String(runtime?.refreshToken||"");
  const accountBase=accountsHost(dc);const mailBase=mailHost(dc);
  if(!accountBase||!mailBase||!orgId||!clientId||!clientSecret||!refreshToken){
    await service.rpc("service_mark_zoho_org_mail_connection_error",{p_status:"error",p_error:"Verified Zoho Mail runtime configuration is incomplete."});
    return json({error:"Verified Zoho Mail runtime configuration is incomplete."},503);
  }

  const {data:jobs,error:claimError}=await service.rpc("service_claim_professional_mailbox_jobs",{p_limit:10});
  if(claimError)return json({error:claimError.message},500);
  if(!jobs?.length)return json({ok:true,claimed:0,results:[]});

  let token="";
  try{
    const tokenResponse=await fetch(`${accountBase}/oauth/v2/token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({refresh_token:refreshToken,client_id:clientId,client_secret:clientSecret,grant_type:"refresh_token"})});
    const payload:any=await tokenResponse.json().catch(()=>({}));
    if(!tokenResponse.ok||!payload?.access_token){
      const message=safeError(payload,tokenResponse.status);
      if((tokenResponse.status===400&&String(payload?.error||"")==="invalid_code")||String(payload?.error||"")==="invalid_grant"){
        await service.rpc("service_mark_zoho_org_mail_connection_error",{p_status:"reconnect_required",p_error:"Zoho OAuth refresh access was revoked or is no longer valid."});
        for(const job of jobs)await service.rpc("service_finish_professional_mailbox_job",{p_job_id:job.id,p_status:"skipped",p_error:"Zoho Mail reconnect is required."});
        return json({ok:false,claimed:jobs.length,reconnectRequired:true},401);
      }
      for(const job of jobs)await service.rpc("service_finish_professional_mailbox_job",{p_job_id:job.id,p_status:Number(job.attempts)>=8?"dead_letter":"retry",p_error:message,p_retry_seconds:retryDelay(Number(job.attempts))});
      return json({ok:false,claimed:jobs.length,error:"Zoho token refresh failed."},tokenResponse.status>=500?503:400);
    }
    token=String(payload.access_token);
  }catch(error){
    const message=error instanceof Error?error.message:"Zoho token endpoint unavailable.";
    for(const job of jobs)await service.rpc("service_finish_professional_mailbox_job",{p_job_id:job.id,p_status:Number(job.attempts)>=8?"dead_letter":"retry",p_error:message,p_retry_seconds:retryDelay(Number(job.attempts))});
    return json({ok:false,claimed:jobs.length,error:"Zoho token endpoint unavailable."},503);
  }

  const results:any[]=[];
  const headers={Authorization:`Zoho-oauthtoken ${token}`,Accept:"application/json","Content-Type":"application/json"};

  async function getRemote(email:string){
    const r=await fetch(`${mailBase}/api/organization/${encodeURIComponent(orgId)}/accounts/${encodeURIComponent(email)}`,{headers});
    const payload:any=await r.json().catch(()=>({}));
    if(r.ok)return {exists:true,payload};
    if(r.status===404)return {exists:false,payload};
    const description=String(payload?.status?.description||payload?.data?.errorCode||"").toLowerCase();
    if(description.includes("not found")||description.includes("no account"))return {exists:false,payload};
    throw Object.assign(new Error(safeError(payload,r.status)),{status:r.status});
  }

  for(const job of jobs){
    try{
      const {data:profile,error:profileError}=await service.from("user_profiles").select("id,full_name,email,timezone,status,onboarding_status,role").eq("id",job.user_id).maybeSingle();
      if(profileError||!profile){await service.rpc("service_finish_professional_mailbox_job",{p_job_id:job.id,p_status:"skipped",p_error:"Employee profile no longer exists."});continue;}
      const {data:cfgRow}=await service.from("system_configuration").select("config_value").eq("config_key","notification_settings").maybeSingle();
      const fromEmail=String(cfgRow?.config_value?.fromEmail||"contact@profoxwebdesigner.com").toLowerCase();
      const domain=fromEmail.split("@")[1]||"profoxwebdesigner.com";
      const parts=nameParts(String(profile.full_name||""),String(profile.email||""),String(profile.id));

      const {data:localAccount}=await service.from("staff_professional_accounts").select("work_email,mailbox_status,provider_user_id,provider_account_id").eq("user_id",job.user_id).maybeSingle();
      if(localAccount?.mailbox_status==="active"&&localAccount?.work_email){await service.rpc("service_finish_professional_mailbox_job",{p_job_id:job.id,p_status:"succeeded",p_work_email:localAccount.work_email,p_provider_user_id:localAccount.provider_user_id||null,p_provider_account_id:localAccount.provider_account_id||null});results.push({id:job.id,status:"already_active"});continue;}

      let chosen="";let remote:any=null;
      for(let suffix=1;suffix<=100;suffix++){
        const local=suffix===1?parts.base:`${parts.base}.${suffix}`;
        const candidate=`${local.slice(0,63-domain.length)}@${domain}`;
        const {data:localCollision}=await service.from("staff_professional_accounts").select("user_id").eq("work_email",candidate).neq("user_id",job.user_id).maybeSingle();
        if(localCollision)continue;
        const found=await getRemote(candidate);
        if(!found.exists){chosen=candidate;break;}
        const remoteData=found.payload?.data||found.payload;
        const remoteId=String(remoteData?.zuid||remoteData?.userId||"");
        const accountId=String(remoteData?.accountId||"");
        const existingLocalOwner=await service.from("staff_professional_accounts").select("user_id").eq("work_email",candidate).maybeSingle();
        if(existingLocalOwner.data?.user_id===job.user_id){chosen=candidate;remote={userId:remoteId,accountId};break;}
      }
      if(!chosen)throw Object.assign(new Error("No collision-safe professional email address was available after 100 attempts."),{terminal:true});

      if(remote){
        await service.rpc("service_finish_professional_mailbox_job",{p_job_id:job.id,p_status:"succeeded",p_work_email:chosen,p_provider_user_id:remote.userId||null,p_provider_account_id:remote.accountId||null,p_initial_password:null});
        results.push({id:job.id,status:"existing_remote_account_linked",workEmail:chosen});continue;
      }

      const password=tempPassword();
      const createResponse=await fetch(`${mailBase}/api/organization/${encodeURIComponent(orgId)}/accounts`,{method:"POST",headers,body:JSON.stringify({primaryEmailAddress:chosen,password,firstName:parts.first||"Employee",lastName:parts.last||"",displayName:String(profile.full_name||parts.first||"ProFox Employee").slice(0,100),role:"member",timeZone:String(profile.timezone||"Asia/Kolkata"),oneTimePassword:true})});
      const createPayload:any=await createResponse.json().catch(()=>({}));
      if(!createResponse.ok){
        const message=safeError(createPayload,createResponse.status);
        if(createResponse.status===409||/exist|duplicate/i.test(message)){
          await sleep(200);const found=await getRemote(chosen);
          if(found.exists){const d=found.payload?.data||found.payload;await service.rpc("service_finish_professional_mailbox_job",{p_job_id:job.id,p_status:"succeeded",p_work_email:chosen,p_provider_user_id:String(d?.zuid||d?.userId||"")||null,p_provider_account_id:String(d?.accountId||"")||null,p_initial_password:null});results.push({id:job.id,status:"race_reconciled",workEmail:chosen});continue;}
        }
        if(createResponse.status===401||createResponse.status===403){await service.rpc("service_mark_zoho_org_mail_connection_error",{p_status:"reconnect_required",p_error:"Zoho Mail organization authorization no longer permits account provisioning."});await service.rpc("service_finish_professional_mailbox_job",{p_job_id:job.id,p_status:"skipped",p_error:"Zoho Mail reconnect is required."});results.push({id:job.id,status:"reconnect_required"});continue;}
        const retry=createResponse.status===429||createResponse.status>=500;
        await service.rpc("service_finish_professional_mailbox_job",{p_job_id:job.id,p_status:retry&&Number(job.attempts)<8?"retry":"dead_letter",p_error:message,p_retry_seconds:retryDelay(Number(job.attempts))});results.push({id:job.id,status:retry?"retry":"dead_letter"});continue;
      }
      const d=createPayload?.data||{};
      await service.rpc("service_finish_professional_mailbox_job",{p_job_id:job.id,p_status:"succeeded",p_work_email:chosen,p_provider_user_id:String(d?.zuid||d?.userId||"")||null,p_provider_account_id:String(d?.accountId||"")||null,p_initial_password:password});
      results.push({id:job.id,status:"created",workEmail:chosen});
    }catch(error:any){
      const message=error instanceof Error?error.message:"Professional mailbox provisioning failed.";
      const terminal=Boolean(error?.terminal);const retryable=!terminal&&(Number(error?.status||0)===429||Number(error?.status||0)>=500||!error?.status);
      await service.rpc("service_finish_professional_mailbox_job",{p_job_id:job.id,p_status:retryable&&Number(job.attempts)<8?"retry":"dead_letter",p_error:message,p_retry_seconds:retryDelay(Number(job.attempts))});
      results.push({id:job.id,status:retryable?"retry":"dead_letter"});
    }
  }

  await service.rpc("service_mark_zoho_org_mail_connection_error",{p_status:"connected",p_error:null});
  return json({ok:true,claimed:jobs.length,results});
});
