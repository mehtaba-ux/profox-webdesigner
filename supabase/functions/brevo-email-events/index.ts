import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

async function secureEquals(left: string, right: string) {
  if (!left || !right) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const av = new Uint8Array(a), bv = new Uint8Array(b);
  if (av.length !== bv.length) return false;
  let diff = 0;
  for (let i = 0; i < av.length; i += 1) diff |= av[i] ^ bv[i];
  return diff === 0;
}

function eventTime(value: any) {
  const seconds = Number(value?.ts_event ?? value?.ts ?? 0);
  if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000).toISOString();
  return new Date().toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration unavailable" }, 500);
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const cronHeader = req.headers.get("x-profox-cron-token") || "";
  const { data: cronSecret } = await service.rpc("service_get_notification_cron_secret");
  if (body?.action === "register" && await secureEquals(cronHeader, String(cronSecret || ""))) {
    const [{ data: delivery }, { data: webhookToken }] = await Promise.all([
      service.rpc("service_get_notification_delivery_config"),
      service.rpc("service_get_brevo_email_webhook_secret"),
    ]);
    if (String(delivery?.emailProvider || "").toLowerCase() !== "brevo" || !delivery?.apiKey) {
      return json({ error: "Brevo delivery is not configured" }, 409);
    }
    const endpoint = `${supabaseUrl}/functions/v1/brevo-email-events`;
    const events = ["delivered","hardBounce","softBounce","blocked","spam","invalid","deferred","click","opened","uniqueOpened","unsubscribed"];
    const headers = { "api-key": String(delivery.apiKey), "Content-Type": "application/json", Accept: "application/json" };
    const listResponse = await fetch("https://api.brevo.com/v3/webhooks?type=transactional", { headers });
    const listText = await listResponse.text();
    let listPayload: any = {};
    try { listPayload = listText ? JSON.parse(listText) : {}; } catch { listPayload = {}; }
    const noWebhookYet = listResponse.status === 400 && String(listPayload?.code || "") === "document_not_found";
    if (!listResponse.ok && !noWebhookYet) return json({ error: `Brevo webhook discovery failed (${listResponse.status})`, detail: String(listPayload?.message || "") }, 502);
    const existing = (Array.isArray(listPayload?.webhooks) ? listPayload.webhooks : []).find((item: any) =>
      String(item?.url || "") === endpoint || String(item?.description || "") === "ProFox transactional delivery feedback"
    );
    const webhookPayload = {
      description: "ProFox transactional delivery feedback",
      url: endpoint,
      events,
      type: "transactional",
      batched: false,
      auth: { type: "bearer", token: String(webhookToken || "") },
    };
    const target = existing?.id ? `https://api.brevo.com/v3/webhooks/${existing.id}` : "https://api.brevo.com/v3/webhooks";
    const response = await fetch(target, { method: existing?.id ? "PUT" : "POST", headers, body: JSON.stringify(webhookPayload) });
    const text = await response.text();
    let payload: any = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
    if (!response.ok) return json({ error: `Brevo webhook registration failed (${response.status})`, detail: String(payload?.message || text).slice(0, 500) }, 502);
    const webhookId = existing?.id || payload?.id || null;
    await service.from("system_configuration").upsert({
      config_key: "brevo_email_webhook_status",
      config_value: { active: true, webhookId, endpoint, events, verifiedAt: new Date().toISOString() },
      description: "Server-managed Brevo transactional delivery feedback webhook.",
      updated_at: new Date().toISOString(),
    }, { onConflict: "config_key" });
    return json({ ok: true, registered: true, webhookId });
  }

  const { data: webhookSecret, error: secretError } = await service.rpc("service_get_brevo_email_webhook_secret");
  if (secretError || !webhookSecret) return json({ error: "Webhook authentication unavailable" }, 503);
  const authorization = req.headers.get("Authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!(await secureEquals(bearer, String(webhookSecret)))) return json({ error: "Unauthorized" }, 401);

  const events = Array.isArray(body) ? body : [body];
  let recorded = 0;
  for (const item of events) {
    const messageId = String(item?.["message-id"] || item?.messageId || "").trim();
    const eventType = String(item?.event || "").trim();
    if (!messageId || !eventType) continue;
    const { error } = await service.rpc("service_record_email_delivery_event", {
      p_provider_message_id: messageId,
      p_event_type: eventType,
      p_recipient_email: String(item?.email || ""),
      p_reason: String(item?.reason || ""),
      p_occurred_at: eventTime(item),
      p_metadata: {
        subject: String(item?.subject || "").slice(0, 500),
        link: String(item?.link || "").slice(0, 2000),
        tags: Array.isArray(item?.tags) ? item.tags.slice(0, 20).map(String) : [],
      },
    });
    if (!error) recorded += 1;
    else console.error("Brevo delivery event recording failed", error.message);
  }
  return json({ ok: true, received: events.length, recorded });
});
