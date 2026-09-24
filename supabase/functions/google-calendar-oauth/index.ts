import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json","Cache-Control":"no-store"}});
const base64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
const randomToken=(size:number)=>{const bytes=new Uint8Array(size);crypto.getRandomValues(bytes);return base64url(bytes);};
const sha256Bytes=async(text:string)=>new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)));
const sha256Hex=async(text:string)=>Array.from(await sha256Bytes(text)).map(b=>b.toString(16).padStart(2,"0")).join("");
const safeReturnPath=(value:unknown)=>{const path=String(value||"/admin/meetings?tab=availability");return path.startsWith("/")&&!path.startsWith("//")?path:"/admin/meetings?tab=availability";};

async function getPublicBaseUrl(service:any){
 const {data}=await service.from("system_configuration").select("config_value").eq("config_key","notification_settings").maybeSingle();
 const configured=String(data?.config_value?.publicBaseUrl||"").replace(/\/$/,"");
 if(/^https:\/\//i.test(configured))return configured;
 const {data:company}=await service.from("system_configuration").select("config_value").eq("config_key","company_settings").maybeSingle();
 const website=String(company?.config_value?.website||"").replace(/\/$/,"");
 return /^https:\/\//i.test(website)?website:"https://www.profoxwebdesigner.com";
}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
 const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 let clientId=Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID")||"";
 let clientSecret=Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET")||"";
 const redirectUri=Deno.env.get("GOOGLE_CALENDAR_REDIRECT_URI")||`${supabaseUrl}/functions/v1/google-calendar-oauth`;
 if(!supabaseUrl||!anonKey||!serviceKey)return json({error:"Server configuration unavailable"},500);
 const service=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 if(!clientId||!clientSecret){
  const {data:provider}=await service.rpc("service_get_google_calendar_provider_credentials");
  clientId=clientId||String(provider?.clientId||"");
  clientSecret=clientSecret||String(provider?.clientSecret||"");
 }
 const url=new URL(req.url);

 // Google redirects here without a Supabase JWT. OAuth state is one-time, short-lived and server validated.
 if(req.method==="GET"&&(url.searchParams.has("code")||url.searchParams.has("error"))){
  const state=url.searchParams.get("state")||"";
  const publicBase=await getPublicBaseUrl(service);
  let returnPath="/admin/meetings?tab=availability";
  try{
   if(!state)throw new Error("Missing OAuth state.");
   const stateHash=await sha256Hex(state);
   const {data:stateData,error:stateError}=await service.rpc("service_consume_google_oauth_state",{p_state_hash:stateHash});
   if(stateError||!stateData)throw stateError||new Error("OAuth state could not be validated.");
   returnPath=safeReturnPath(stateData.returnPath);
   if(url.searchParams.get("error"))throw new Error(`Google authorization was not completed: ${url.searchParams.get("error")}`);
   if(!clientId||!clientSecret)throw new Error("Google Calendar OAuth credentials are not configured on the server.");
   const code=url.searchParams.get("code")||"";
   const tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,code_verifier:String(stateData.codeVerifier||""),grant_type:"authorization_code",redirect_uri:redirectUri})});
   const tokenJson:any=await tokenResponse.json().catch(()=>({}));
   if(!tokenResponse.ok)throw new Error(String(tokenJson?.error_description||tokenJson?.error||`Google token exchange failed (${tokenResponse.status})`));
   const accessToken=String(tokenJson?.access_token||"");
   const refreshToken=String(tokenJson?.refresh_token||"");
   if(!accessToken||!refreshToken)throw new Error("Google did not return an offline refresh token. Reconnect and grant Calendar access again.");

   const [calendarResponse,userInfoResponse]=await Promise.all([
    fetch("https://www.googleapis.com/calendar/v3/calendars/primary",{headers:{Authorization:`Bearer ${accessToken}`}}),
    fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:`Bearer ${accessToken}`}})
   ]);
   const calendar:any=await calendarResponse.json().catch(()=>({}));
   const userInfo:any=await userInfoResponse.json().catch(()=>({}));
   if(!calendarResponse.ok)throw new Error(String(calendar?.error?.message||"Unable to read the primary Google Calendar."));
   if(!userInfoResponse.ok)throw new Error("Unable to verify the connected Google account.");
   const userId=String(stateData.userId||"");
   const {data:secretId,error:secretError}=await service.rpc("service_store_google_refresh_token",{p_user_id:userId,p_refresh_token:refreshToken});
   if(secretError||!secretId)throw secretError||new Error("Secure refresh-token storage failed.");
   const grantedScopes=String(tokenJson?.scope||"").split(/\s+/).filter(Boolean);
   const {error:saveError}=await service.rpc("service_upsert_google_calendar_connection",{p_user_id:userId,p_google_subject:String(userInfo?.sub||""),p_account_email:String(userInfo?.email||calendar?.id||""),p_calendar_id:"primary",p_calendar_timezone:String(calendar?.timeZone||"UTC"),p_scopes:grantedScopes,p_refresh_secret_id:secretId});
   if(saveError)throw saveError;
   await service.rpc("queue_google_calendar_sync",{p_user_id:userId,p_job_type:"refresh_busy",p_meeting_id:null,p_force:true}).catch(()=>null);
   return Response.redirect(`${publicBase}${returnPath}${returnPath.includes("?")?"&":"?"}google=connected`,302);
  }catch(error){
   const message=error instanceof Error?error.message:"Google Calendar connection failed.";
   return Response.redirect(`${publicBase}${returnPath}${returnPath.includes("?")?"&":"?"}google=error&message=${encodeURIComponent(message.slice(0,300))}`,302);
  }
 }

 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const authHeader=req.headers.get("Authorization")||"";
 if(!authHeader.startsWith("Bearer "))return json({error:"Authentication required"},401);
 const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:userData,error:userError}=await userClient.auth.getUser();
 if(userError||!userData.user)return json({error:"Authentication required"},401);
 let body:any={};try{body=await req.json();}catch{body={};}
 const action=String(body?.action||"status").toLowerCase();

 if(action==="provider_status"||action==="provider_setup"){
  const {data:profile}=await service.from("user_profiles").select("role,status").eq("id",userData.user.id).maybeSingle();
  if(profile?.role!=="admin"||profile?.status!=="active")return json({error:"Administrator access required"},403);
  if(action==="provider_status"){
   const {data,error}=await service.rpc("service_get_google_calendar_provider_status",{p_admin_user_id:userData.user.id});
   if(error)return json({error:error.message},500);
   return json({provider:data,redirectUri});
  }
  const {data,error}=await service.rpc("service_set_google_calendar_provider",{
   p_admin_user_id:userData.user.id,
   p_client_id:String(body?.clientId||""),
   p_client_secret:String(body?.clientSecret||"")
  });
  if(error)return json({error:error.message},400);
  return json({provider:data,redirectUri});
 }

 if(action==="status"){
  const {data,error}=await userClient.rpc("get_google_calendar_connection_status");
  if(error)return json({error:error.message},403);
  return json({connection:data,providerConfigured:Boolean(clientId&&clientSecret),redirectUri});
 }
 if(action==="start"||action==="reconnect"){
  const {error:accessError}=await userClient.rpc("get_google_calendar_connection_status");
  if(accessError)return json({error:accessError.message},403);
  if(!clientId||!clientSecret)return json({error:"Google Calendar OAuth is not configured yet. Add the server-side Google OAuth client credentials first.",providerConfigured:false},503);
  const state=randomToken(32),verifier=randomToken(64),challenge=base64url(await sha256Bytes(verifier)),stateHash=await sha256Hex(state);
  const returnPath=safeReturnPath(body?.returnPath);
  const {error:stateError}=await service.rpc("service_create_google_oauth_state",{p_state_hash:stateHash,p_user_id:userData.user.id,p_code_verifier:verifier,p_return_path:returnPath});
  if(stateError)return json({error:stateError.message},500);
  const scopes=["openid","email","https://www.googleapis.com/auth/calendar.events","https://www.googleapis.com/auth/calendar.events.freebusy","https://www.googleapis.com/auth/calendar.calendars.readonly"];
  const authUrl=new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:"code",scope:scopes.join(" "),access_type:"offline",prompt:"consent",include_granted_scopes:"true",state,code_challenge:challenge,code_challenge_method:"S256"}).toString();
  return json({authorizationUrl:authUrl.toString()});
 }
 if(action==="disconnect"){
  const {data:refreshToken}=await service.rpc("service_get_google_refresh_token",{p_user_id:userData.user.id});
  let googleGrantRevoked=false;
  if(refreshToken){
   try{
    const revokeResponse=await fetch("https://oauth2.googleapis.com/revoke",{
     method:"POST",
     headers:{"Content-Type":"application/x-www-form-urlencoded"},
     body:new URLSearchParams({token:String(refreshToken)})
    });
    googleGrantRevoked=revokeResponse.ok;
   }catch{
    // Local disconnect must still succeed even when Google is temporarily unreachable.
   }
  }
  const {error}=await service.rpc("service_disconnect_google_calendar",{p_user_id:userData.user.id});
  if(error)return json({error:error.message},500);
  return json({success:true,googleGrantRevoked});
 }
 if(action==="preferences"){
  const {data,error}=await userClient.rpc("set_google_calendar_preferences",{p_sync_enabled:Boolean(body?.syncEnabled),p_create_meet:Boolean(body?.createMeet)});
  if(error)return json({error:error.message},400);
  return json({connection:data});
 }
 return json({error:"Unsupported action"},400);
});
