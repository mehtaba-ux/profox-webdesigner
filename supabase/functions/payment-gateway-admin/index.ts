import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});}
function clean(v:unknown,max=500){return String(v??"").trim().slice(0,max);}
async function paypalToken(config:any){const base=config.mode==="live"?"https://api-m.paypal.com":"https://api-m.sandbox.paypal.com";const credentials=btoa(`${clean(config.clientId,500)}:${clean(config.apiSecret,1000)}`);const r=await fetch(`${base}/v1/oauth2/token`,{method:"POST",headers:{Authorization:`Basic ${credentials}`,"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});const text=await r.text();if(!r.ok)throw new Error(`PayPal authentication failed (HTTP ${r.status}).`);const p=JSON.parse(text);if(!p.access_token)throw new Error("PayPal did not return an access token.");return true;}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL")||"";const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";if(!url||!serviceKey)return json({error:"Server unavailable"},500);
  const authHeader=req.headers.get("authorization")||"";const jwt=authHeader.replace(/^Bearer\s+/i,"");if(!jwt)return json({error:"Authentication required"},401);
  const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const{data:userData,error:userError}=await service.auth.getUser(jwt);if(userError||!userData.user)return json({error:"Authentication required"},401);
  const{data:profile}=await service.from("user_profiles").select("role,status").eq("id",userData.user.id).maybeSingle();if(profile?.role!=="admin"||profile?.status!=="active")return json({error:"Administrator access required"},403);
  let body:any={};try{body=await req.json();}catch{return json({error:"Invalid request body"},400);}const provider=clean(body.provider,30).toLowerCase();if(!["razorpay","paypal"].includes(provider))return json({error:"Unsupported payment provider"},400);
  let success=false;let message="";
  try{
    const{data:config,error:configError}=await service.rpc("service_get_payment_gateway_provider",{p_provider:provider});if(configError)throw new Error("Unable to load provider configuration.");if(!clean(config?.apiSecret))throw new Error("Provider API secret is not configured.");
    if(provider==="razorpay"){
      if(!clean(config?.keyId))throw new Error("Razorpay Key ID is not configured.");const authorization=`Basic ${btoa(`${clean(config.keyId,300)}:${clean(config.apiSecret,1000)}`)}`;const r=await fetch("https://api.razorpay.com/v1/orders?count=1",{headers:{Authorization:authorization}});if(!r.ok)throw new Error(`Razorpay credentials were rejected (HTTP ${r.status}).`);success=true;message=`Razorpay ${config.mode||"test"} credentials connected successfully.`;
    }else{if(!clean(config?.clientId))throw new Error("PayPal Client ID is not configured.");await paypalToken(config);success=true;message=`PayPal ${config.mode||"sandbox"} credentials connected successfully.`;}
  }catch(error){message=error instanceof Error?error.message:"Provider connection test failed.";}
  await service.rpc("service_record_payment_gateway_test",{p_provider:provider,p_success:success,p_message:message});return json({ok:success,provider,message},success?200:400);
});
