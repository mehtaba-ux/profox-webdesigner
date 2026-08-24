import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function clean(v: unknown, max = 500) { return String(v ?? "").trim().slice(0, max); }
function minorExponent(currency: string) { const c=currency.toUpperCase(); if(["BIF","CLP","DJF","GNF","JPY","KMF","KRW","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"].includes(c))return 0;if(["BHD","JOD","KWD","OMR","TND"].includes(c))return 3;return 2; }
function toMinor(amount:number,currency:string){return Math.round(amount*10**minorExponent(currency));}
async function hmacHex(secret:string,message:string){const e=new TextEncoder();const k=await crypto.subtle.importKey("raw",e.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const s=new Uint8Array(await crypto.subtle.sign("HMAC",k,e.encode(message)));return Array.from(s).map(b=>b.toString(16).padStart(2,"0")).join("");}
function equal(a:string,b:string){a=a.toLowerCase();b=b.toLowerCase();if(!a||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return response({error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL")||"";const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";if(!url||!key)return response({error:"Server unavailable"},500);
  const service=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const raw=await req.text();const signature=clean(req.headers.get("x-razorpay-signature"),256);const eventId=clean(req.headers.get("x-razorpay-event-id"),255);
  let claim:any=null;
  try{
    const{data:config,error:configError}=await service.rpc("service_get_payment_gateway_provider",{p_provider:"razorpay"});if(configError)throw new Error("Unable to load Razorpay webhook configuration.");
    const secret=clean(config?.webhookSecret,1000);if(!secret||!signature||!eventId)return response({error:"Razorpay webhook verification information is incomplete."},401);
    const expected=await hmacHex(secret,raw);if(!equal(expected,signature))return response({error:"Invalid webhook signature"},401);
    let event:any;try{event=JSON.parse(raw);}catch{return response({error:"Invalid webhook body"},400);}
    const type=clean(event?.event,255);const payment=event?.payload?.payment?.entity||null;const orderId=clean(payment?.order_id,160);const providerPaymentId=clean(payment?.id,160);
    const{data:claimData,error:claimError}=await service.rpc("service_register_payment_gateway_event",{p_provider:"razorpay",p_event_id:eventId,p_event_type:type,p_provider_order_id:orderId,p_provider_payment_id:providerPaymentId,p_metadata:{createdAt:event?.created_at||null,accountId:event?.account_id||null}});if(claimError)throw new Error(claimError.message);claim=claimData;
    if(claim?.isNew!==true)return response({ok:true,duplicate:true});
    try{
      const attemptId=claim?.attemptId;if(!attemptId)throw new Error("No matching ProFox gateway attempt.");
      const{data:attempt,error:attemptError}=await service.rpc("service_get_payment_gateway_attempt",{p_attempt_id:attemptId});if(attemptError)throw new Error(attemptError.message);
      if(type==="payment.captured"){
        if(!payment)throw new Error("Captured event has no payment entity.");
        if(String(payment.order_id||"")!==String(attempt.providerOrderId||""))throw new Error("Razorpay order does not match the ProFox attempt.");
        if(Number(payment.amount)!==toMinor(Number(attempt.amount),String(attempt.currency))||String(payment.currency||"").toUpperCase()!==String(attempt.currency).toUpperCase())throw new Error("Razorpay webhook amount or currency mismatch.");
        const{error:settleError}=await service.rpc("service_finalize_payment_gateway_attempt",{p_attempt_id:attemptId,p_provider_payment_id:providerPaymentId,p_provider_capture_id:providerPaymentId,p_metadata:{status:payment.status,method:payment.method,eventId}});if(settleError)throw new Error(settleError.message);
      }else if(type==="payment.failed"){
        const{error:failError}=await service.rpc("service_fail_payment_gateway_attempt",{p_attempt_id:attemptId,p_code:clean(payment?.error_code,120)||"PAYMENT_FAILED",p_message:clean(payment?.error_description,800)||"Razorpay payment attempt failed."});if(failError)throw new Error(failError.message);
      }
      const{error:completeError}=await service.rpc("service_complete_payment_gateway_event",{p_event_id:claim.eventId,p_processed:true,p_error:""});if(completeError)throw new Error(completeError.message);
      return response({ok:true,retry:claim?.retry===true});
    }catch(error){
      const message=error instanceof Error?error.message:"Unknown processing error";console.error("Razorpay webhook processing error",message);
      if(claim?.eventId){const{error:recordError}=await service.rpc("service_complete_payment_gateway_event",{p_event_id:claim.eventId,p_processed:false,p_error:message});if(recordError)console.error("Razorpay webhook failure-state persistence error",recordError.message);}
      return response({error:"Webhook processing failed; retry required."},500);
    }
  }catch(error){console.error("Razorpay webhook error",error instanceof Error?error.message:"Unknown error");return response({error:"Webhook processing unavailable; retry required."},500);}
});
