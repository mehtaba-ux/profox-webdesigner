import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function response(body: unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});}
function clean(v:unknown,max=500){return String(v??"").trim().slice(0,max);}
async function paypalToken(config:any){const base=config.mode==="live"?"https://api-m.paypal.com":"https://api-m.sandbox.paypal.com";const credentials=btoa(`${clean(config.clientId,500)}:${clean(config.apiSecret,1000)}`);const r=await fetch(`${base}/v1/oauth2/token`,{method:"POST",headers:{Authorization:`Basic ${credentials}`,"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});const t=await r.text();if(!r.ok)throw new Error(`PayPal authentication failed (${r.status}).`);const p=JSON.parse(t);if(!p.access_token)throw new Error("PayPal access token missing.");return{base,token:String(p.access_token)};}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return response({error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL")||"";const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";if(!url||!key)return response({error:"Server unavailable"},500);
  const service=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const raw=await req.text();let event:any;try{event=JSON.parse(raw);}catch{return response({error:"Invalid webhook body"},400);}
  let claim:any=null;
  try{
    const{data:config,error:configError}=await service.rpc("service_get_payment_gateway_provider",{p_provider:"paypal"});if(configError)throw new Error("Unable to load PayPal webhook configuration.");
    const webhookId=clean(config?.webhookId,100);if(!webhookId)throw new Error("PayPal webhook ID is not configured.");const auth=await paypalToken(config);
    const verifyBody={auth_algo:clean(req.headers.get("paypal-auth-algo"),100),cert_url:clean(req.headers.get("paypal-cert-url"),500),transmission_id:clean(req.headers.get("paypal-transmission-id"),100),transmission_sig:clean(req.headers.get("paypal-transmission-sig"),600),transmission_time:clean(req.headers.get("paypal-transmission-time"),120),webhook_id:webhookId,webhook_event:event};
    if(!verifyBody.auth_algo||!verifyBody.cert_url||!verifyBody.transmission_id||!verifyBody.transmission_sig||!verifyBody.transmission_time)return response({error:"Missing PayPal verification headers"},401);
    const verify=await fetch(`${auth.base}/v1/notifications/verify-webhook-signature`,{method:"POST",headers:{Authorization:`Bearer ${auth.token}`,"Content-Type":"application/json"},body:JSON.stringify(verifyBody)});const verifyText=await verify.text();
    if(!verify.ok){if(verify.status>=500)return response({error:"PayPal verification service unavailable; retry required."},503);return response({error:"PayPal webhook verification failed"},401);}
    const verified=JSON.parse(verifyText);if(verified.verification_status!=="SUCCESS")return response({error:"Invalid PayPal webhook signature"},401);
    const type=clean(event?.event_type,255);const eventId=clean(event?.id,255);const resource=event?.resource||{};const captureId=clean(resource?.id,160);const orderId=clean(resource?.supplementary_data?.related_ids?.order_id,160);
    if(!eventId)return response({error:"PayPal event ID missing"},400);
    const{data:claimData,error:claimError}=await service.rpc("service_register_payment_gateway_event",{p_provider:"paypal",p_event_id:eventId,p_event_type:type,p_provider_order_id:orderId,p_provider_payment_id:captureId,p_metadata:{createTime:event?.create_time||null,resourceType:event?.resource_type||null}});if(claimError)throw new Error(claimError.message);claim=claimData;
    if(claim?.isNew!==true)return response({ok:true,duplicate:true});
    try{
      const attemptId=claim?.attemptId;if(!attemptId)throw new Error("No matching ProFox gateway attempt.");
      const{data:attempt,error:attemptError}=await service.rpc("service_get_payment_gateway_attempt",{p_attempt_id:attemptId});if(attemptError)throw new Error(attemptError.message);
      if(type==="PAYMENT.CAPTURE.COMPLETED"){
        const amount=Number(resource?.amount?.value||0);const currency=clean(resource?.amount?.currency_code,10).toUpperCase();if(resource?.status!=="COMPLETED"||Math.abs(amount-Number(attempt.amount))>0.001||currency!==String(attempt.currency).toUpperCase())throw new Error("PayPal webhook capture amount, currency, or status mismatch.");
        const{error:settleError}=await service.rpc("service_finalize_payment_gateway_attempt",{p_attempt_id:attemptId,p_provider_payment_id:captureId,p_provider_capture_id:captureId,p_metadata:{status:resource.status,eventId}});if(settleError)throw new Error(settleError.message);
      }else if(["PAYMENT.CAPTURE.DENIED","CHECKOUT.PAYMENT-APPROVAL.REVERSED"].includes(type)){
        const{error:failError}=await service.rpc("service_fail_payment_gateway_attempt",{p_attempt_id:attemptId,p_code:type,p_message:"PayPal reported that the payment attempt did not complete."});if(failError)throw new Error(failError.message);
      }
      const{error:completeError}=await service.rpc("service_complete_payment_gateway_event",{p_event_id:claim.eventId,p_processed:true,p_error:""});if(completeError)throw new Error(completeError.message);
      return response({ok:true,retry:claim?.retry===true});
    }catch(error){
      const message=error instanceof Error?error.message:"Unknown processing error";console.error("PayPal webhook processing error",message);
      if(claim?.eventId){const{error:recordError}=await service.rpc("service_complete_payment_gateway_event",{p_event_id:claim.eventId,p_processed:false,p_error:message});if(recordError)console.error("PayPal webhook failure-state persistence error",recordError.message);}
      return response({error:"Webhook processing failed; retry required."},500);
    }
  }catch(error){console.error("PayPal webhook error",error instanceof Error?error.message:"Unknown error");return response({error:"Webhook processing unavailable; retry required."},500);}
});
