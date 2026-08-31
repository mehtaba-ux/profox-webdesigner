import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function clean(value: unknown, max = 500) { return String(value ?? "").trim().slice(0, max); }
async function hmacHex(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(signature).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function equal(left: string, right: string) {
  left = left.toLowerCase(); right = right.toLowerCase();
  if (!left || left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return different === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return response({ error: "Server unavailable" }, 500);
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const raw = await req.text();
  const signature = clean(req.headers.get("x-razorpay-signature"), 256);
  const eventId = clean(req.headers.get("x-razorpay-event-id"), 255);
  try {
    const { data: config, error: configError } = await service.rpc("service_get_razorpayx_payout_config");
    if (configError) throw new Error("RazorpayX webhook configuration is unavailable.");
    const secret = clean(config?.webhookSecret, 1000);
    if (!secret || !signature || !eventId) return response({ error: "Webhook verification information is incomplete." }, 401);
    const expected = await hmacHex(secret, raw);
    if (!equal(expected, signature)) return response({ error: "Invalid webhook signature" }, 401);
    let event: any;
    try { event = JSON.parse(raw); } catch { return response({ error: "Invalid webhook body" }, 400); }
    const eventType = clean(event?.event, 150).toLowerCase();
    if (!eventType.startsWith("payout.")) return response({ ok: true, ignored: true });
    const payout = event?.payload?.payout?.entity;
    const providerPayoutId = clean(payout?.id, 160);
    const status = clean(payout?.status, 40).toLowerCase();
    if (!providerPayoutId || !["queued", "pending", "processing", "processed", "failed", "reversed", "cancelled"].includes(status)) {
      return response({ error: "Webhook payout entity is incomplete." }, 400);
    }
    const failure = clean(payout?.status_details?.description || payout?.status_details?.reason || payout?.failure_reason, 1000);
    const { data, error } = await service.rpc("service_apply_razorpayx_webhook_event", {
      p_provider_event_id: eventId,
      p_event_type: eventType,
      p_provider_payout_id: providerPayoutId,
      p_status: status,
      p_fund_account_id: clean(payout?.fund_account_id, 160) || null,
      p_utr: clean(payout?.utr, 160) || null,
      p_failure_reason: failure || null,
      p_metadata: { mode: payout?.mode || null, fees: payout?.fees ?? null, tax: payout?.tax ?? null, createdAt: payout?.created_at ?? event?.created_at ?? null },
    });
    if (error) throw new Error(error.message);
    return response({ ok: true, ...data });
  } catch (error) {
    console.error("RazorpayX webhook error", error instanceof Error ? error.message : "Unknown error");
    return response({ error: "Webhook processing failed; retry required." }, 500);
  }
});
