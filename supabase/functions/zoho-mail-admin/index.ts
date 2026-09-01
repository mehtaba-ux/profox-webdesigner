import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json","Cache-Control":"no-store"}});
const enc=new TextEncoder();
const base64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"");
async function sha256(value:string){const digest=await crypto.subtle.digest("SHA-256",enc.encode(value));return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");}
const accountsHost=(dc:string)=>({com:"https://accounts.zoho.com",in:"https://accounts.zoho.in",eu:"https://accounts.zoho.eu","com.au":"https://accounts.zoho.com.au",jp:"https://accounts.zoho.jp",ca:"https://accounts.zohocloud.ca",sa:"https://accounts.zoho.sa"} as Record<string,string>)[dc]||"";
const mailHost=(dc:string)=>({com:"https://mail.zoho.com",in:"https://mail.zoho.in",eu:"https://mail.zoho.eu","com.au":"https://mail.zoho.com.au",jp:"https://mail.zoho.jp",ca:"https://mail.zohocloud.ca",sa:"https://mail.zoho.sa"} as Record<string,string>)[dc]||"";
const USER_MAIL_SCOPES=["ZohoMail.accounts.READ","ZohoMail.messages.CREATE","ZohoMail.messages.READ","ZohoMail.folders.READ"];
function escapeHtml(value:string){return value.replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[ch]||ch));}
function scriptSafeJson(value:unknown){return JSON.stringify(value).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");}
function html(title:string,message:string,success=false,purpose:"organization"|"user_send"="organization"){
 const safeTitle=escapeHtml(title);const safeMessage=escapeHtml(message);const type=purpose==="user_send"?"profox-zoho-mail-send-oauth":"profox-zoho-mail-oauth";const payload=scriptSafeJson({type,success,message});
 return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title></head><body style="margin:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif;color:#0f172a"><main style="max-width:560px;margin:12vh auto;padding:32px;background:#fff;border:1px solid #e2e8f0;border-radius:24px;box-shadow:0 10px 30px rgba(15,23,42,.08)"><div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#000080;text-transform:uppercase">ProFox Professional Email</div><h1 style="font-size:24px;margin:12px 0">${safeTitle}</h1><p style="line-height:1.65;color:#475569">${safeMessage}</p><p style="font-size:13px;color:#64748b">You can close this window and return to ProFox.</p></main><script>try{if(window.opener){window.opener.postMessage(${payload},'*');setTimeout(()=>window.close(),900)}}catch(e){}</script></body></html>`,{status:success?200:400,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
}
function safeDetail(payload:any,fallback:string){return String(payload?.status?.description||payload?.data?.errorCode||payload?.error_description||payload?.error||payload?.message||fallback).slice(0,500);}
function makeState(){const raw=new Uint8Array(32);crypto.getRandomValues(raw);return base64url(raw);}
async function tokenFromCode(base:string,input:{clientId:string;clientSecret:string;redirectUri:string;code:string}){
 const response=await fetch(`${base}/oauth/v2/token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:input.clientId,client_secret:input.clientSecret,redirect_uri:input.redirectUri,code:input.code})});
 const payload:any=await response.json().catch(()=>({}));
 return {response,payload};
}
async function tokenFromRefresh(base:string,input:{clientId:string;clientSecret:string;refreshToken:string}){
 const response=await fetch(`${base}/oauth/v2/token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",client_id:input.clientId,client_secret:input.clientSecret,refresh_token:input.refreshToken})});
 const payload:any=await response.json().catch(()=>({}));
 return {response,payload};
}
function providerMessageId(payload:any){return String(payload?.data?.messageId||payload?.data?.messageID||payload?.data?.id||payload?.messageId||"");}
function payloadRows(payload:any):any[]{return Array.isArray(payload?.data)?payload.data:Array.isArray(payload)?payload:[];}
function extractEmails(value:unknown):string[]{const matches=String(value||"").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[];return [...new Set(matches.map(item=>item.toLowerCase()))];}
function stripHtml(value:string){return value.replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<br\s*\/?>/gi,"\n").replace(/<\/p>/gi,"\n").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\r/g,"").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").replace(/[ \t]{2,}/g," ").trim().slice(0,50000);}
function zohoDate(value:unknown){const text=String(value||"").trim();const numberValue=Number(text);if(text&&Number.isFinite(numberValue)){const ms=numberValue>100000000000?numberValue:numberValue*1000;const date=new Date(ms);if(!Number.isNaN(date.getTime()))return date.toISOString();}const parsed=new Date(text);return Number.isNaN(parsed.getTime())?new Date().toISOString():parsed.toISOString();}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!supabaseUrl||!anonKey||!serviceKey)return req.method==="GET"?html("Configuration unavailable","The ProFox server configuration is incomplete."):json({error:"Server configuration unavailable"},500);
 const service=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const callbackUrl=`${supabaseUrl.replace(/\/+$/g,"")}/functions/v1/zoho-mail-admin/callback`;

 if(req.method==="POST"){
   const authHeader=req.headers.get("Authorization")||"";if(!authHeader.startsWith("Bearer "))return json({error:"Authentication required"},401);
   const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
   const {data:userData,error:userError}=await userClient.auth.getUser();if(userError||!userData.user)return json({error:"Authentication required"},401);
   const userId=String(userData.user.id);
   let body:any={};try{body=await req.json();}catch{body={};}
   const action=String(body?.action||"");

   if(action==="start"){
     const {data:profile}=await service.from("user_profiles").select("id,role,status").eq("id",userId).maybeSingle();
     if(!profile||String(profile.role).toLowerCase()!=="admin"||String(profile.status).toLowerCase()!=="active")return json({error:"Administrator access required"},403);
     const {data:provider,error:providerError}=await service.rpc("service_get_zoho_provider_credentials");if(providerError)return json({error:"Zoho provider credentials could not be loaded."},500);
     const {data:cfgRow}=await service.from("system_configuration").select("config_value").eq("config_key","professional_integrations").maybeSingle();
     const cfg=cfgRow?.config_value||{};const clientId=String(provider?.clientId||"");const clientSecret=String(provider?.clientSecret||"");const org=String(cfg?.zohoOrganizationId||"").trim();const dc=String(cfg?.zohoDataCenter||"").trim().toLowerCase();
     if(!clientId||!clientSecret||!org||!accountsHost(dc))return json({error:"Save the Zoho OAuth client ID, client secret, organization ID and data center first.",callbackUrl},400);
     const state=makeState();const hash=await sha256(state);
     const {error:stateError}=await service.from("zoho_mail_oauth_states").insert({state_hash:hash,admin_user_id:userId,organization_id:org,data_center:dc,redirect_uri:callbackUrl,expires_at:new Date(Date.now()+10*60*1000).toISOString()});
     if(stateError)return json({error:"Zoho authorization could not be initialized."},500);
     await service.from("zoho_mail_oauth_states").delete().lt("expires_at",new Date(Date.now()-24*60*60*1000).toISOString());
     const authorize=new URL(`${accountsHost(dc)}/oauth/v2/auth`);authorize.searchParams.set("scope","ZohoMail.organization.accounts.ALL");authorize.searchParams.set("client_id",clientId);authorize.searchParams.set("response_type","code");authorize.searchParams.set("access_type","offline");authorize.searchParams.set("prompt","consent");authorize.searchParams.set("redirect_uri",callbackUrl);authorize.searchParams.set("state",state);
     return json({authorizeUrl:authorize.toString(),callbackUrl});
   }

   if(action==="start_user_send"){
     const {data:eligible,error:eligibleError}=await service.rpc("service_professional_mailbox_eligible",{p_user_id:userId});
     if(eligibleError||eligible!==true)return json({error:"Professional email is available only to eligible active Sales and Management accounts."},403);
     const {data:account}=await service.from("staff_professional_accounts").select("work_email,mail_provider,mailbox_status,provider_account_id").eq("user_id",userId).maybeSingle();
     const workEmail=String(account?.work_email||"").trim().toLowerCase();const providerAccountId=String(account?.provider_account_id||"").trim();
     if(!account||String(account.mailbox_status)!=="active"||String(account.mail_provider)!=="zoho"||!workEmail||!providerAccountId)return json({error:"Your active Zoho professional mailbox is required before connecting professional email."},409);
     const {data:provider,error:providerError}=await service.rpc("service_get_zoho_provider_credentials");if(providerError)return json({error:"Zoho provider credentials could not be loaded."},500);
     const {data:orgConnection}=await service.from("zoho_organization_mail_connection").select("status,data_center").eq("singleton_key","primary").maybeSingle();
     const clientId=String(provider?.clientId||"");const clientSecret=String(provider?.clientSecret||"");const dc=String(orgConnection?.data_center||"").trim().toLowerCase();
     if(!clientId||!clientSecret||String(orgConnection?.status)!=="connected"||!accountsHost(dc))return json({error:"The company Zoho Mail connection is not ready. Ask an administrator to verify Zoho Mail first."},409);
     const state=makeState();const hash=await sha256(state);
     const {error:stateError}=await service.from("zoho_user_mail_send_oauth_states").insert({state_hash:hash,user_id:userId,work_email:workEmail,provider_account_id:providerAccountId,data_center:dc,redirect_uri:callbackUrl,expires_at:new Date(Date.now()+10*60*1000).toISOString()});
     if(stateError)return json({error:"Professional email authorization could not be initialized."},500);
     await service.from("zoho_user_mail_send_oauth_states").delete().lt("expires_at",new Date(Date.now()-24*60*60*1000).toISOString());
     const authorize=new URL(`${accountsHost(dc)}/oauth/v2/auth`);authorize.searchParams.set("scope",USER_MAIL_SCOPES.join(","));authorize.searchParams.set("client_id",clientId);authorize.searchParams.set("response_type","code");authorize.searchParams.set("access_type","offline");authorize.searchParams.set("prompt","consent");authorize.searchParams.set("redirect_uri",callbackUrl);authorize.searchParams.set("state",state);
     return json({authorizeUrl:authorize.toString(),callbackUrl,workEmail});
   }

   if(action==="sync_inbox"){
     const {data:eligible,error:eligibleError}=await service.rpc("service_professional_mailbox_eligible",{p_user_id:userId});
     if(eligibleError||eligible!==true)return json({error:"Professional email is available only to eligible active Sales and Management accounts."},403);
     const {data:connection,error:connectionError}=await service.from("zoho_user_mail_send_connections").select("user_id,work_email,provider_account_id,data_center,scopes,status").eq("user_id",userId).maybeSingle();
     if(connectionError||!connection||String(connection.status)!=="connected")return json({error:"Connect your professional Zoho Mail permission before synchronizing customer replies.",reconnectRequired:true},409);
     const scopes=new Set((Array.isArray(connection.scopes)?connection.scopes:[]).map((scope:unknown)=>String(scope)));
     const missingScopes=USER_MAIL_SCOPES.filter(scope=>!scopes.has(scope));
     if(missingScopes.length){return json({error:"Reconnect professional email once to enable secure customer reply synchronization.",reconnectRequired:true},409);}

     const {data:runtime,error:runtimeError}=await service.rpc("service_get_zoho_user_mail_send_credentials",{p_user_id:userId});
     if(runtimeError)return json({error:"Professional Zoho Mail authorization is unavailable.",reconnectRequired:true},409);
     const dc=String(runtime?.dataCenter||"");const accountBase=accountsHost(dc);const mailBase=mailHost(dc);const clientId=String(runtime?.clientId||"");const clientSecret=String(runtime?.clientSecret||"");const refreshToken=String(runtime?.refreshToken||"");const accountId=String(runtime?.accountId||"");const workEmail=String(runtime?.workEmail||"").trim().toLowerCase();
     if(!accountBase||!mailBase||!clientId||!clientSecret||!refreshToken||!accountId||!workEmail||workEmail!==String(connection.work_email||"").trim().toLowerCase()||accountId!==String(connection.provider_account_id||""))return json({error:"Professional Zoho Mail runtime identity is incomplete.",reconnectRequired:true},409);

     const refreshed=await tokenFromRefresh(accountBase,{clientId,clientSecret,refreshToken});
     if(!refreshed.response.ok||!refreshed.payload?.access_token){
       const detail=safeDetail(refreshed.payload,"Zoho Mail authorization could not be refreshed.");const reconnect=refreshed.response.status===401||/invalid[_ ]?grant|invalid[_ ]?token|unauthor/i.test(detail);
       await service.from("zoho_user_mail_send_connections").update({status:reconnect?"reconnect_required":"error",last_attempt_at:new Date().toISOString(),last_error:detail,updated_at:new Date().toISOString()}).eq("user_id",userId);
       return json({error:reconnect?"Reconnect your professional Zoho Mail permission, then synchronize again.":detail,reconnectRequired:reconnect},reconnect?401:502);
     }
     const accessToken=String(refreshed.payload.access_token);const zohoHeaders={Authorization:`Zoho-oauthtoken ${accessToken}`,Accept:"application/json"};

     const foldersResponse=await fetch(`${mailBase}/api/accounts/${encodeURIComponent(accountId)}/folders`,{headers:zohoHeaders});
     const foldersPayload:any=await foldersResponse.json().catch(()=>({}));
     if(!foldersResponse.ok){const detail=safeDetail(foldersPayload,`Zoho Mail folder lookup failed (${foldersResponse.status}).`);await service.from("zoho_user_mail_send_connections").update({last_attempt_at:new Date().toISOString(),last_error:detail,updated_at:new Date().toISOString()}).eq("user_id",userId);return json({error:detail},502);}
     const inboxFolder=payloadRows(foldersPayload).find((folder:any)=>String(folder?.folderType||"").toLowerCase()==="inbox")||payloadRows(foldersPayload).find((folder:any)=>String(folder?.folderName||"").toLowerCase()==="inbox");
     const inboxFolderId=String(inboxFolder?.folderId||"");
     if(!inboxFolderId)return json({error:"Zoho Mail Inbox folder could not be identified safely."},502);

     const [conversationCustomers,leadCustomers]=await Promise.all([
       service.from("sales_chat_conversations").select("customer_email").eq("current_sales_id",userId).neq("status","resolved"),
       service.from("crm_leads").select("email").eq("salesperson_id",userId).is("archived_at",null),
     ]);
     if(conversationCustomers.error||leadCustomers.error)return json({error:"Assigned customer identities could not be loaded safely."},500);
     const allowedCustomers=new Set<string>();
     for(const row of conversationCustomers.data||[])for(const email of extractEmails(row.customer_email))allowedCustomers.add(email);
     for(const row of leadCustomers.data||[])for(const email of extractEmails(row.email))allowedCustomers.add(email);
     if(!allowedCustomers.size){await service.from("zoho_user_mail_send_connections").update({last_attempt_at:new Date().toISOString(),last_verified_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq("user_id",userId);return json({scanned:0,matched:0,synced:0,skippedExisting:0,skippedUnmatched:0});}

     const messageUrl=new URL(`${mailBase}/api/accounts/${encodeURIComponent(accountId)}/messages/view`);messageUrl.searchParams.set("folderId",inboxFolderId);messageUrl.searchParams.set("start","1");messageUrl.searchParams.set("limit","100");messageUrl.searchParams.set("sortBy","date");messageUrl.searchParams.set("sortorder","false");messageUrl.searchParams.set("includeto","true");messageUrl.searchParams.set("includesent","false");
     const listResponse=await fetch(messageUrl,{headers:zohoHeaders});const listPayload:any=await listResponse.json().catch(()=>({}));
     if(!listResponse.ok){const detail=safeDetail(listPayload,`Zoho Mail Inbox lookup failed (${listResponse.status}).`);await service.from("zoho_user_mail_send_connections").update({last_attempt_at:new Date().toISOString(),last_error:detail,updated_at:new Date().toISOString()}).eq("user_id",userId);return json({error:detail},502);}
     const messages=payloadRows(listPayload);const candidates=messages.filter((item:any)=>{
       const from=extractEmails(item?.fromAddress)[0]||"";const to=extractEmails(item?.toAddress);return Boolean(String(item?.messageId||""))&&allowedCustomers.has(from)&&from!==workEmail&&to.includes(workEmail);
     });
     const candidateIds=[...new Set(candidates.map((item:any)=>String(item.messageId)).filter(Boolean))];
     const existingIds=new Set<string>();
     if(candidateIds.length){const existing=await service.from("client_email_messages").select("provider_message_id").eq("provider","zoho").in("provider_message_id",candidateIds);if(existing.error)return json({error:"Existing email synchronization state could not be checked safely."},500);for(const row of existing.data||[])existingIds.add(String(row.provider_message_id));}

     let matched=0,synced=0,skippedExisting=0,skippedUnmatched=messages.length-candidates.length;
     for(const item of candidates){
       const messageId=String(item?.messageId||"");if(existingIds.has(messageId)){skippedExisting++;continue;}
       const fromEmail=extractEmails(item?.fromAddress)[0]||"";const threadId=String(item?.threadId||"");
       const {data:resolution,error:resolutionError}=await service.rpc("service_resolve_client_email_conversation",{p_provider_thread_id:threadId||null,p_customer_email:fromEmail,p_employee_user_id:userId});
       if(resolutionError||resolution?.assignmentRequired||!resolution?.conversationId){skippedUnmatched++;continue;}
       const conversationId=String(resolution.conversationId);const {data:conversation}=await service.from("sales_chat_conversations").select("id,current_sales_id,customer_email").eq("id",conversationId).eq("current_sales_id",userId).maybeSingle();
       if(!conversation||String(conversation.customer_email||"").trim().toLowerCase()!==fromEmail){skippedUnmatched++;continue;}
       matched++;
       const folderId=String(item?.folderId||inboxFolderId);const contentResponse=await fetch(`${mailBase}/api/accounts/${encodeURIComponent(accountId)}/folders/${encodeURIComponent(folderId)}/messages/${encodeURIComponent(messageId)}/content`,{headers:zohoHeaders});
       const contentPayload:any=await contentResponse.json().catch(()=>({}));if(!contentResponse.ok){continue;}
       const bodyHtml=String(contentPayload?.data?.content||contentPayload?.content||"").slice(0,100000);const bodyText=stripHtml(bodyHtml)||String(item?.summary||"").slice(0,50000);
       const toEmails=extractEmails(item?.toAddress);const ccEmails=extractEmails(item?.ccAddress);const subject=String(item?.subject||"").slice(0,500);
       const {error:upsertError}=await service.rpc("service_upsert_client_email_message",{p_conversation_id:conversationId,p_provider:"zoho",p_provider_message_id:messageId,p_provider_thread_id:threadId||null,p_direction:"inbound",p_employee_user_id:userId,p_from_email:fromEmail,p_to_emails:toEmails,p_cc_emails:ccEmails,p_bcc_emails:[],p_subject:subject,p_body_text:bodyText,p_body_html:bodyHtml,p_attachments:[],p_delivery_status:"received",p_sent_or_received_at:zohoDate(item?.receivedTime||item?.sentDateInGMT||item?.receivedDate)});
       if(!upsertError){synced++;existingIds.add(messageId);}
     }
     const now=new Date().toISOString();await service.from("zoho_user_mail_send_connections").update({status:"connected",last_attempt_at:now,last_verified_at:now,last_error:null,updated_at:now}).eq("user_id",userId);
     return json({scanned:messages.length,matched,synced,skippedExisting,skippedUnmatched});
   }

   if(action==="send"){
     const leadId=String(body?.leadId||"").trim();const subject=String(body?.subject||"");const messageBody=String(body?.body||"");const idempotencyKey=String(body?.idempotencyKey||"").trim();
     if(!leadId||!idempotencyKey)return json({error:"Lead and email request identifiers are required."},400);
     const {data:prepared,error:prepareError}=await userClient.rpc("crm_prepare_professional_email_send",{p_lead_id:leadId,p_subject:subject,p_body:messageBody,p_idempotency_key:idempotencyKey});
     if(prepareError)return json({error:prepareError.message||"Professional email send could not be prepared."},400);
     const requestId=String(prepared?.requestId||"");
     if(!requestId)return json({error:"Professional email send request was not created."},500);
     if(String(prepared?.status)==="provider_accepted")return json({providerAccepted:true,requestId,providerMessageId:"",sender:String(prepared?.sender||""),recipient:String(prepared?.recipient||"")});
     if(String(prepared?.status)==="failed")return json({error:"This email request has already failed. Compose and send it again to create a new request."},409);
     const {data:requestRow,error:requestError}=await service.from("professional_email_send_requests").select("id,user_id,sender_email,recipient_email,subject,message_body,status").eq("id",requestId).eq("user_id",userId).maybeSingle();
     if(requestError||!requestRow||String(requestRow.status)!=="pending")return json({error:"Professional email send request could not be loaded safely."},500);
     try{
       const {data:runtime,error:runtimeError}=await service.rpc("service_get_zoho_user_mail_send_credentials",{p_user_id:userId});
       if(runtimeError)throw new Error(runtimeError.message||"Professional Zoho Mail authorization is unavailable.");
       const dc=String(runtime?.dataCenter||"");const accountBase=accountsHost(dc);const mailBase=mailHost(dc);const clientId=String(runtime?.clientId||"");const clientSecret=String(runtime?.clientSecret||"");const refreshToken=String(runtime?.refreshToken||"");const accountId=String(runtime?.accountId||"");const workEmail=String(runtime?.workEmail||"").toLowerCase();
       if(!accountBase||!mailBase||!clientId||!clientSecret||!refreshToken||!accountId||workEmail!==String(requestRow.sender_email).toLowerCase())throw new Error("Professional Zoho Mail runtime identity is incomplete.");
       const refreshed=await tokenFromRefresh(accountBase,{clientId,clientSecret,refreshToken});
       if(!refreshed.response.ok||!refreshed.payload?.access_token){const detail=safeDetail(refreshed.payload,"Zoho Mail send authorization could not be refreshed.");const reconnect=refreshed.response.status===401||/invalid[_ ]?grant|invalid[_ ]?token|unauthor/i.test(detail);await service.rpc("service_fail_professional_email_send",{p_request_id:requestId,p_error:detail,p_reconnect_required:reconnect,p_provider_response_code:String(refreshed.response.status)});return json({error:reconnect?"Reconnect your professional Zoho Mail permission, then try again.":detail,reconnectRequired:reconnect},reconnect?401:502);}
       const sendResponse=await fetch(`${mailBase}/api/accounts/${encodeURIComponent(accountId)}/messages`,{method:"POST",headers:{Authorization:`Zoho-oauthtoken ${String(refreshed.payload.access_token)}`,Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify({fromAddress:workEmail,toAddress:String(requestRow.recipient_email),subject:String(requestRow.subject),content:String(requestRow.message_body),mailFormat:"plaintext"})});
       const sendPayload:any=await sendResponse.json().catch(()=>({}));const statusCode=Number(sendPayload?.status?.code||sendResponse.status);const accepted=sendResponse.ok&&statusCode>=200&&statusCode<300;
       if(!accepted){const detail=safeDetail(sendPayload,`Zoho Mail rejected the send request (${sendResponse.status}).`);const reconnect=sendResponse.status===401||/invalid[_ ]?token|oauth|unauthor/i.test(detail);await service.rpc("service_fail_professional_email_send",{p_request_id:requestId,p_error:detail,p_reconnect_required:reconnect,p_provider_response_code:String(statusCode||sendResponse.status)});return json({error:reconnect?"Reconnect your professional Zoho Mail permission, then try again.":detail,reconnectRequired:reconnect},reconnect?401:502);}
       const messageId=providerMessageId(sendPayload);const {error:completeError}=await service.rpc("service_complete_professional_email_send",{p_request_id:requestId,p_provider_message_id:messageId,p_provider_response_code:String(statusCode)});if(completeError)return json({error:"Zoho accepted the email, but ProFox could not finish the CRM audit record. Do not resend until an administrator reviews this request.",providerAccepted:true,requestId},500);
       return json({providerAccepted:true,requestId,providerMessageId:messageId,sender:String(requestRow.sender_email),recipient:String(requestRow.recipient_email)});
     }catch(error){const detail=String(error instanceof Error?error.message:"Professional email could not be sent.").slice(0,500);await service.rpc("service_fail_professional_email_send",{p_request_id:requestId,p_error:detail,p_reconnect_required:false,p_provider_response_code:null});return json({error:detail},502);}
   }

   return json({error:"Unsupported action"},400);
 }

 if(req.method!=="GET")return json({error:"Method not allowed"},405);
 const url=new URL(req.url);if(!url.pathname.endsWith("/callback"))return html("Invalid request","This Zoho authorization URL is not valid.");
 const state=url.searchParams.get("state")||"";const code=url.searchParams.get("code")||"";const oauthError=url.searchParams.get("error")||"";
 if(!state)return html("Authorization failed","The Zoho authorization state was missing. Start the connection again from ProFox.");
 const hash=await sha256(state);const nowIso=new Date().toISOString();
 const {data:adminState}=await service.from("zoho_mail_oauth_states").select("*").eq("state_hash",hash).is("consumed_at",null).gt("expires_at",nowIso).maybeSingle();
 if(adminState){
   const {data:consumedState,error:consumeError}=await service.from("zoho_mail_oauth_states").update({consumed_at:nowIso}).eq("id",adminState.id).is("consumed_at",null).select("id").maybeSingle();
   if(consumeError||!consumedState)return html("Authorization expired","This Zoho authorization attempt has already been consumed. Start again from ProFox.");
   if(oauthError||!code)return html("Zoho permission was not granted",oauthError?`Zoho returned: ${oauthError}. No professional-email automation was enabled.`:"Zoho did not return an authorization code. No professional-email automation was enabled.");
   const dc=String(adminState.data_center||"");const org=String(adminState.organization_id||"");const accountBase=accountsHost(dc);const mailBase=mailHost(dc);if(!accountBase||!mailBase)return html("Authorization failed","The selected Zoho data center is not supported.");
   const {data:provider}=await service.rpc("service_get_zoho_provider_credentials");const clientId=String(provider?.clientId||"");const clientSecret=String(provider?.clientSecret||"");if(!clientId||!clientSecret)return html("Authorization failed","Zoho OAuth credentials are no longer configured in ProFox.");
   try{
     const token=await tokenFromCode(accountBase,{clientId,clientSecret,redirectUri:String(adminState.redirect_uri||callbackUrl),code});
     if(!token.response.ok||!token.payload?.access_token||!token.payload?.refresh_token){const detail=safeDetail(token.payload,"Zoho did not issue the required refresh authorization.");return html("Zoho connection could not be verified",`${detail} No mailbox provisioning was enabled.`);}
     const verifyResponse=await fetch(`${mailBase}/api/organization/${encodeURIComponent(org)}/accounts?start=0&limit=1`,{headers:{Authorization:`Zoho-oauthtoken ${String(token.payload.access_token)}`,Accept:"application/json"}});const verifyPayload:any=await verifyResponse.json().catch(()=>({}));
     if(!verifyResponse.ok){const detail=safeDetail(verifyPayload,`Zoho Mail organization verification failed (${verifyResponse.status}).`);return html("Zoho Mail access was not verified",`${detail} Check the Organization ID, Mail plan/API entitlement and OAuth permissions. No mailbox provisioning was enabled.`);}
     const {error:storeError}=await service.rpc("service_store_verified_zoho_org_mail_connection",{p_admin_user_id:String(adminState.admin_user_id),p_refresh_token:String(token.payload.refresh_token),p_organization_id:org,p_data_center:dc,p_scopes:["ZohoMail.organization.accounts.ALL"]});
     if(storeError)return html("Zoho verified, but ProFox could not save the connection","The verified Zoho connection could not be stored safely. No credentials were exposed; reconnect from ProFox.");
     return html("Zoho Mail connected","Zoho Mail organization access was verified successfully. No staff mailbox was created and no provisioning policy was enabled automatically. Calendar and meeting providers are also unchanged. Return to ProFox, run one controlled mailbox canary, then enable the existing policy only after that test passes.",true);
   }catch{return html("Zoho verification failed","The Zoho service could not be reached safely. Nothing was enabled; start the connection again from ProFox.");}
 }

 const {data:userState}=await service.from("zoho_user_mail_send_oauth_states").select("*").eq("state_hash",hash).is("consumed_at",null).gt("expires_at",nowIso).maybeSingle();
 if(!userState)return html("Authorization expired","This Zoho authorization attempt is invalid, expired, or has already been used. Start again from ProFox.",false,"user_send");
 const {data:consumedUserState,error:consumeUserError}=await service.from("zoho_user_mail_send_oauth_states").update({consumed_at:nowIso}).eq("id",userState.id).is("consumed_at",null).select("id").maybeSingle();
 if(consumeUserError||!consumedUserState)return html("Authorization expired","This professional email authorization has already been consumed. Start again from ProFox.",false,"user_send");
 if(oauthError||!code)return html("Zoho permission was not granted",oauthError?`Zoho returned: ${oauthError}. ProFox cannot use this professional mailbox until permission is connected.`:"Zoho did not return an authorization code.",false,"user_send");
 const dc=String(userState.data_center||"");const accountBase=accountsHost(dc);const mailBase=mailHost(dc);if(!accountBase||!mailBase)return html("Authorization failed","The selected Zoho data center is not supported.",false,"user_send");
 const {data:provider}=await service.rpc("service_get_zoho_provider_credentials");const clientId=String(provider?.clientId||"");const clientSecret=String(provider?.clientSecret||"");if(!clientId||!clientSecret)return html("Authorization failed","Zoho OAuth credentials are no longer configured in ProFox.",false,"user_send");
 try{
   const token=await tokenFromCode(accountBase,{clientId,clientSecret,redirectUri:String(userState.redirect_uri||callbackUrl),code});
   if(!token.response.ok||!token.payload?.access_token||!token.payload?.refresh_token){const detail=safeDetail(token.payload,"Zoho did not issue the required professional email authorization.");return html("Professional email could not be connected",detail,false,"user_send");}
   const verifyResponse=await fetch(`${mailBase}/api/accounts`,{headers:{Authorization:`Zoho-oauthtoken ${String(token.payload.access_token)}`,Accept:"application/json"}});const verifyText=await verifyResponse.text();let verifyPayload:any={};try{verifyPayload=JSON.parse(verifyText);}catch{verifyPayload={};}
   if(!verifyResponse.ok){const detail=safeDetail(verifyPayload,`Zoho Mail account verification failed (${verifyResponse.status}).`);return html("Professional mailbox was not verified",detail,false,"user_send");}
   const expectedEmail=String(userState.work_email||"").trim().toLowerCase();const expectedAccountId=String(userState.provider_account_id||"").trim();
   if(!expectedEmail||!expectedAccountId||!verifyText.toLowerCase().includes(expectedEmail)||!verifyText.includes(expectedAccountId))return html("Wrong Zoho mailbox","Sign in to the exact professional mailbox shown in ProFox. The authorized Zoho account did not match this employee mailbox, so no permission was saved.",false,"user_send");
   const {error:storeError}=await service.rpc("service_store_zoho_user_mail_send_connection",{p_user_id:String(userState.user_id),p_refresh_token:String(token.payload.refresh_token),p_work_email:expectedEmail,p_provider_account_id:expectedAccountId,p_data_center:dc,p_scopes:USER_MAIL_SCOPES});
   if(storeError)return html("Zoho verified, but ProFox could not save professional email permission","The verified professional mailbox permission could not be stored safely. Reconnect from ProFox.",false,"user_send");
   return html("Professional email connected",`${expectedEmail} is now authorized for secure customer email sending and matched reply synchronization inside ProFox.`,true,"user_send");
 }catch{return html("Professional email verification failed","Zoho Mail could not be reached safely. No permission was saved; reconnect from ProFox.",false,"user_send");}
});
