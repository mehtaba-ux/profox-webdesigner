import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const text = (body: string, status = 200) => new Response(body, {
  status,
  headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
});
const encoder = new TextEncoder();

function safeDetail(payload: any, fallback: string) {
  return String(payload?.error?.message || payload?.error?.error_user_msg || payload?.message || fallback).slice(0, 500);
}
function digits(value: unknown) { return String(value || "").replace(/[^0-9]/g, ""); }
function asIsoTimestamp(value: unknown) {
  const raw = String(value || "").trim();
  const numeric = Number(raw);
  if (raw && Number.isFinite(numeric)) {
    const date = new Date(numeric > 100000000000 ? numeric : numeric * 1000);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}
function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}
async function hmacSha256Hex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(signature)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function extractMessageText(message: any) {
  const type = String(message?.type || "unknown");
  if (type === "text") return String(message?.text?.body || "").slice(0, 50000);
  if (type === "button") return String(message?.button?.text || "[button reply]").slice(0, 50000);
  if (type === "interactive") return String(message?.interactive?.button_reply?.title || message?.interactive?.list_reply?.title || "[interactive reply]").slice(0, 50000);
  if (type === "reaction") return String(message?.reaction?.emoji || "[reaction]").slice(0, 50000);
  if (["image", "video", "audio", "document", "sticker", "location", "contacts"].includes(type)) return `[${type} received]`;
  return `[${type || "unsupported"} message received]`;
}
function providerMessageId(payload: any) { return String(payload?.messages?.[0]?.id || "").trim(); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server configuration unavailable." }, 500);

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: credentials, error: credentialsError } = await service.rpc("service_get_whatsapp_business_credentials");
  if (credentialsError) return json({ error: "WhatsApp Business configuration could not be loaded." }, 500);

  const enabled = Boolean(credentials?.enabled);
  const phoneNumberId = String(credentials?.phoneNumberId || "").trim();
  const businessPhone = digits(credentials?.businessPhone);
  const accessToken = String(credentials?.accessToken || "");
  const verifyToken = String(credentials?.verifyToken || "");
  const appSecret = String(credentials?.appSecret || "");
  const graphApiVersion = /^v[0-9]+\.[0-9]+$/.test(String(credentials?.graphApiVersion || "")) ? String(credentials.graphApiVersion) : "v23.0";
  const defaultTemplateName = String(credentials?.defaultTemplateName || "").trim();
  const defaultTemplateLanguage = String(credentials?.defaultTemplateLanguage || "en_US").trim() || "en_US";
  const configured = enabled && Boolean(phoneNumberId && businessPhone && accessToken && verifyToken && appSecret);

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode") || "";
    const suppliedVerifyToken = url.searchParams.get("hub.verify_token") || "";
    const challenge = url.searchParams.get("hub.challenge") || "";
    if (!configured || mode !== "subscribe" || !challenge || !timingSafeEqual(suppliedVerifyToken, verifyToken)) return text("Webhook verification failed.", 403);
    return text(challenge, 200);
  }
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const contentType = req.headers.get("Content-Type") || "";

  // Authenticated ProFox send path. Provider credentials never leave the server.
  if (authHeader.startsWith("Bearer ") && contentType.toLowerCase().includes("application/json")) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Authentication required." }, 401);

    let body: any = {};
    try { body = await req.json(); } catch { return json({ error: "Invalid request body." }, 400); }
    if (String(body?.action || "") !== "send") return json({ error: "Unsupported action." }, 400);
    if (!configured) return json({ error: "WhatsApp Business is not connected by an administrator." }, 409);

    const conversationId = String(body?.conversationId || "").trim();
    const message = String(body?.message || "");
    const idempotencyKey = String(body?.idempotencyKey || "").trim();
    if (!conversationId || !idempotencyKey) return json({ error: "Conversation and request identifiers are required." }, 400);

    const { data: prepared, error: prepareError } = await userClient.rpc("customer_communication_prepare_whatsapp_send", {
      p_conversation_id: conversationId,
      p_message: message,
      p_idempotency_key: idempotencyKey,
    });
    if (prepareError) return json({ error: prepareError.message || "WhatsApp send could not be prepared." }, 400);

    const requestId = String(prepared?.requestId || "");
    if (!requestId) return json({ error: "WhatsApp send request was not created." }, 500);
    if (String(prepared?.status) === "provider_accepted") {
      return json({ providerAccepted: true, requestId, providerMessageId: String(prepared?.providerMessageId || ""), recipientPhone: String(prepared?.recipientPhone || "") });
    }
    if (String(prepared?.status) === "failed") return json({ error: "This WhatsApp request has already failed. Create a new message request." }, 409);

    const { data: requestRow, error: requestError } = await service
      .from("whatsapp_send_requests")
      .select("id,user_id,conversation_id,recipient_phone,message_body,status")
      .eq("id", requestId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (requestError || !requestRow || String(requestRow.status) !== "pending") return json({ error: "WhatsApp send request could not be loaded safely." }, 500);

    const serviceWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentInbound, error: recentInboundError } = await service
      .from("client_whatsapp_messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound")
      .gte("sent_or_received_at", serviceWindowStart)
      .limit(1);
    if (recentInboundError) return json({ error: "WhatsApp service-window state could not be verified safely." }, 500);
    const sessionOpen = Boolean(recentInbound?.length);
    if (!sessionOpen && !defaultTemplateName) {
      await service.rpc("service_fail_whatsapp_send", {
        p_request_id: requestId,
        p_error: "No active WhatsApp customer-service window and no approved outbound template is configured.",
        p_provider_response_code: null,
      });
      return json({ error: "This customer has not messaged the business on WhatsApp in the last 24 hours. Ask an administrator to configure an approved outbound WhatsApp template before starting a new conversation." }, 409);
    }

    const graphBody = sessionOpen
      ? {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: String(requestRow.recipient_phone),
          type: "text",
          text: { preview_url: false, body: String(requestRow.message_body) },
        }
      : {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: String(requestRow.recipient_phone),
          type: "template",
          template: {
            name: defaultTemplateName,
            language: { code: defaultTemplateLanguage },
            components: [{ type: "body", parameters: [{ type: "text", text: String(requestRow.message_body) }] }],
          },
        };

    const graphResponse = await fetch(`https://graph.facebook.com/${encodeURIComponent(graphApiVersion)}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(graphBody),
    });
    const graphPayload: any = await graphResponse.json().catch(() => ({}));
    const responseCode = String(graphResponse.status);
    const messageId = providerMessageId(graphPayload);

    if (!graphResponse.ok || !messageId) {
      const detail = safeDetail(graphPayload, `WhatsApp rejected the send request (${graphResponse.status}).`);
      await service.rpc("service_fail_whatsapp_send", { p_request_id: requestId, p_error: detail, p_provider_response_code: responseCode });
      return json({ error: detail }, graphResponse.status === 429 ? 429 : 502);
    }

    const { error: completeError } = await service.rpc("service_complete_whatsapp_send", {
      p_request_id: requestId,
      p_provider_message_id: messageId,
      p_provider_response_code: responseCode,
    });
    if (completeError) {
      return json({
        error: "WhatsApp accepted the message, but ProFox could not finish the audit record. Do not resend until an administrator reviews the request.",
        providerAccepted: true,
        requestId,
        providerMessageId: messageId,
      }, 500);
    }

    return json({ providerAccepted: true, requestId, providerMessageId: messageId, recipientPhone: String(requestRow.recipient_phone), usedTemplate: !sessionOpen });
  }

  // Public Meta webhook path. HMAC is checked on the exact raw body before parsing.
  if (!configured) return json({ error: "WhatsApp Business is not enabled." }, 503);
  const rawBody = await req.text();
  const suppliedSignature = (req.headers.get("x-hub-signature-256") || "").trim().toLowerCase();
  if (!suppliedSignature.startsWith("sha256=")) return json({ error: "Webhook signature required." }, 401);
  const expectedSignature = `sha256=${await hmacSha256Hex(appSecret, rawBody)}`;
  if (!timingSafeEqual(suppliedSignature, expectedSignature)) return json({ error: "Invalid webhook signature." }, 401);

  let payload: any = {};
  try { payload = JSON.parse(rawBody); } catch { return json({ error: "Invalid webhook payload." }, 400); }
  if (String(payload?.object || "") !== "whatsapp_business_account") return json({ received: true, ignored: true });

  let inboundSeen = 0;
  let inboundSynced = 0;
  let inboundUnmatched = 0;
  let statusesSeen = 0;

  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (String(change?.field || "") !== "messages") continue;
      const value = change?.value || {};
      const webhookPhoneNumberId = String(value?.metadata?.phone_number_id || "");
      if (webhookPhoneNumberId && webhookPhoneNumberId !== phoneNumberId) continue;
      const contactName = String(value?.contacts?.[0]?.profile?.name || "").slice(0, 120);

      for (const messageItem of Array.isArray(value?.messages) ? value.messages : []) {
        inboundSeen += 1;
        const fromPhone = digits(messageItem?.from);
        const messageId = String(messageItem?.id || "").trim();
        if (!fromPhone || !messageId) { inboundUnmatched += 1; continue; }
        const messageType = String(messageItem?.type || "unknown").slice(0, 80);
        const messageText = extractMessageText(messageItem);
        const receivedAt = asIsoTimestamp(messageItem?.timestamp);
        const safeMetadata = {
          contactName,
          whatsappId: String(value?.contacts?.[0]?.wa_id || fromPhone),
          providerTimestamp: String(messageItem?.timestamp || ""),
        };

        const { data: resolution, error: resolutionError } = await service.rpc("service_resolve_client_whatsapp_conversation", { p_customer_phone: fromPhone });
        if (resolutionError || resolution?.assignmentRequired || !resolution?.conversationId) {
          inboundUnmatched += 1;
          await service.rpc("service_store_unmatched_whatsapp_message", {
            p_provider_message_id: messageId,
            p_from_phone: fromPhone,
            p_to_phone: businessPhone,
            p_message_type: messageType,
            p_message_text: messageText,
            p_payload_metadata: { ...safeMetadata, resolutionReason: String(resolution?.reason || resolutionError?.message || "unmatched") },
            p_received_at: receivedAt,
          });
          continue;
        }

        const { error: upsertError } = await service.rpc("service_upsert_client_whatsapp_message", {
          p_conversation_id: String(resolution.conversationId),
          p_provider_message_id: messageId,
          p_direction: "inbound",
          p_employee_user_id: null,
          p_from_phone: fromPhone,
          p_to_phone: businessPhone,
          p_message_type: messageType,
          p_message_text: messageText,
          p_payload_metadata: safeMetadata,
          p_delivery_status: "received",
          p_sent_or_received_at: receivedAt,
        });
        if (!upsertError) inboundSynced += 1;
      }

      for (const statusItem of Array.isArray(value?.statuses) ? value.statuses : []) {
        statusesSeen += 1;
        const messageId = String(statusItem?.id || "").trim();
        if (!messageId) continue;
        await service.rpc("service_update_whatsapp_delivery_status", {
          p_provider_message_id: messageId,
          p_status: String(statusItem?.status || "unknown").slice(0, 80),
          p_at: asIsoTimestamp(statusItem?.timestamp),
        });
      }
    }
  }

  return json({ received: true, inboundSeen, inboundSynced, inboundUnmatched, statusesSeen });
});
