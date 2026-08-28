import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json","Cache-Control":"no-store"}});
const enc=new TextEncoder();
const base64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"");
async function sha256(value:string){const digest=await crypto.subtle.digest("SHA-256",enc.encode(value));return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");}
const accountsHost=(dc:string)=>({com:"https://accounts.zoho.com",in:"https://accounts.zoho.in",eu:"https://accounts.zoho.eu","com.au":"https://accounts.zoho.com.au",jp:"https://accounts.zoho.jp",ca:"https://accounts.zohocloud.ca",sa:"https://accounts.zoho.sa"} as Record<string,string>)[dc]||"";
const mailHost=(dc:string)=>({com:"https://mail.zoho.com",in:"https://mail.zoho.in",eu:"https://mail.zoho.eu","com.au":"https://mail.zoho.com.au",jp:"https://mail.zoho.jp",ca:"https://mail.zohocloud.ca",sa:"https://mail.zoho.sa"} as Record<string,string>)[dc]||"";
function escapeHtml(value:string){return value.replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[ch]||ch));}
function html(title:string,message:string,success=false){
 const safeTitle=escapeHtml(title);const safeMessage=escapeHtml(message);
 const payload=JSON.stringify({type:"profox-zoho-mail-oauth",success,message});
 return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title></head><body style="margin:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif;color:#0f172a"><main style="max-width:560px;margin:12vh auto;padding:32px;background:#fff;border:1px solid #e2e8f0;border-radius:24px;box-shadow:0 10px 30px rgba(15,23,42,.08)"><div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#000080;text-transform:uppercase">ProFox Professional Email</div><h1 style="font-size:24px;margin:12px 0">${safeTitle}</h1><p style="line-height:1.65;color:#475569">${safeMessage}</p><p style="font-size:13px;color:#64748b">You can close this window and return to ProFox.</p></main><script>try{if(window.opener){window.opener.postMessage(${payload},'*');setTimeout(()=>window.close(),900)}}catch(e){}</script></body></html>`,{status:success?200:400,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
}

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
   const {data:profile}=await service.from("user_profiles").select("id,role,status").eq("id",userData.user.id).maybeSingle();
   if(!profile||String(profile.role).toLowerCase()!=="admin"||String(profile.status).toLowerCase()!=="active")return json({error:"Administrator access required"},403);
   let body:any={};try{body=await req.json();}catch{body={};}if(String(body?.action||"")!=="start")return json({error:"Unsupported action"},400);
   const {data:provider,error:providerError}=await service.rpc("service_get_zoho_provider_credentials");if(providerError)return json({error:"Zoho provider credentials could not be loaded."},500);
   const {data:cfgRow}=await service.from("system_configuration").select("config_value").eq("config_key","professional_integrations").maybeSingle();
   const cfg=cfgRow?.config_value||{};const clientId=String(provider?.clientId||"");const clientSecret=String(provider?.clientSecret||"");const org=String(cfg?.zohoOrganizationId||"").trim();const dc=String(cfg?.zohoDataCenter||"").trim().toLowerCase();
   if(!clientId||!clientSecret||!org||!accountsHost(dc))return json({error:"Save the Zoho OAuth client ID, client secret, organization ID and data center first.",callbackUrl},400);
   const raw=new Uint8Array(32);crypto.getRandomValues(raw);const state=base64url(raw);const hash=await sha256(state);
   const {error:stateError}=await service.from("zoho_mail_oauth_states").insert({state_hash:hash,admin_user_id:userData.user.id,organization_id:org,data_center:dc,redirect_uri:callbackUrl,expires_at:new Date(Date.now()+10*60*1000).toISOString()});
   if(stateError)return json({error:"Zoho authorization could not be initialized."},500);
   await service.from("zoho_mail_oauth_states").delete().lt("expires_at",new Date(Date.now()-24*60*60*1000).toISOString());
   const authorize=new URL(`${accountsHost(dc)}/oauth/v2/auth`);authorize.searchParams.set("scope","ZohoMail.organization.accounts.ALL");authorize.searchParams.set("client_id",clientId);authorize.searchParams.set("response_type","code");authorize.searchParams.set("access_type","offline");authorize.searchParams.set("prompt","consent");authorize.searchParams.set("redirect_uri",callbackUrl);authorize.searchParams.set("state",state);
   return json({authorizeUrl:authorize.toString(),callbackUrl});
 }

 if(req.method!=="GET")return json({error:"Method not allowed"},405);
 const url=new URL(req.url);if(!url.pathname.endsWith("/callback"))return html("Invalid request","This Zoho authorization URL is not valid.");
 const state=url.searchParams.get("state")||"";const code=url.searchParams.get("code")||"";const oauthError=url.searchParams.get("error")||"";
 if(!state)return html("Authorization failed","The Zoho authorization state was missing. Start the connection again from ProFox.");
 const hash=await sha256(state);
 const {data:stateRow}=await service.from("zoho_mail_oauth_states").select("*").eq("state_hash",hash).is("consumed_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
 if(!stateRow)return html("Authorization expired","This Zoho authorization attempt is invalid, expired, or has already been used. Start again from ProFox.");
 const {data:consumedState,error:consumeError}=await service.from("zoho_mail_oauth_states").update({consumed_at:new Date().toISOString()}).eq("id",stateRow.id).is("consumed_at",null).select("id").maybeSingle();
 if(consumeError||!consumedState)return html("Authorization expired","This Zoho authorization attempt has already been consumed. Start again from ProFox.");
 if(oauthError||!code)return html("Zoho permission was not granted",oauthError?`Zoho returned: ${oauthError}. No professional-email automation was enabled.`:"Zoho did not return an authorization code. No professional-email automation was enabled.");

 const dc=String(stateRow.data_center||"");const org=String(stateRow.organization_id||"");const accountBase=accountsHost(dc);const mailBase=mailHost(dc);if(!accountBase||!mailBase)return html("Authorization failed","The selected Zoho data center is not supported.");
 const {data:provider}=await service.rpc("service_get_zoho_provider_credentials");const clientId=String(provider?.clientId||"");const clientSecret=String(provider?.clientSecret||"");
 if(!clientId||!clientSecret)return html("Authorization failed","Zoho OAuth credentials are no longer configured in ProFox.");
 try{
   const tokenResponse=await fetch(`${accountBase}/oauth/v2/token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:clientId,client_secret:clientSecret,redirect_uri:String(stateRow.redirect_uri||callbackUrl),code})});
   const tokenPayload:any=await tokenResponse.json().catch(()=>({}));
   if(!tokenResponse.ok||!tokenPayload?.access_token||!tokenPayload?.refresh_token){
     const detail=String(tokenPayload?.error_description||tokenPayload?.error||"Zoho did not issue the required refresh authorization.").slice(0,300);
     return html("Zoho connection could not be verified",`${detail} No mailbox provisioning was enabled.`);
   }
   const accessToken=String(tokenPayload.access_token);const refreshToken=String(tokenPayload.refresh_token);
   const verifyResponse=await fetch(`${mailBase}/api/organization/${encodeURIComponent(org)}/accounts?start=0&limit=1`,{headers:{Authorization:`Zoho-oauthtoken ${accessToken}`,Accept:"application/json"}});
   const verifyPayload:any=await verifyResponse.json().catch(()=>({}));
   if(!verifyResponse.ok){
     const detail=String(verifyPayload?.status?.description||verifyPayload?.data?.errorCode||`Zoho Mail organization verification failed (${verifyResponse.status}).`).slice(0,350);
     return html("Zoho Mail access was not verified",`${detail} Check the Organization ID, paid Mail plan and OAuth permissions. No mailbox provisioning was enabled.`);
   }
   const {data:stored,error:storeError}=await service.rpc("service_store_verified_zoho_org_mail_connection",{p_admin_user_id:String(stateRow.admin_user_id),p_refresh_token:refreshToken,p_organization_id:org,p_data_center:dc,p_scopes:["ZohoMail.organization.accounts.ALL"]});
   if(storeError)return html("Zoho verified, but ProFox could not activate it","The verified Zoho connection could not be stored safely. No credentials were exposed; reconnect from ProFox.");
   await fetch(`${supabaseUrl.replace(/\/+$/g,"")}/functions/v1/process-professional-mailbox-provisioning`,{method:"POST",headers:{Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"},body:JSON.stringify({source:"zoho-oauth-callback"})}).catch(()=>null);
   const queued=Number(stored?.queuedEmployees||0);
   return html("Zoho Mail connected",`Zoho Mail organization access was verified. Automatic professional-email provisioning is now active${queued?` and ${queued} eligible employee account${queued===1?"":"s"} ${queued===1?"was":"were"} queued`:""}. Google Calendar, Google Meet and Brevo were not replaced.`,true);
 }catch{
   return html("Zoho verification failed","The Zoho service could not be reached safely. Nothing was enabled; start the connection again from ProFox.");
 }
});
