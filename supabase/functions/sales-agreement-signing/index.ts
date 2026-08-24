import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ success: false, error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return reply({ success: false, error: "Signing service is unavailable." }, 500);

  let input: any;
  try { input = await req.json(); } catch { return reply({ success: false, error: "Invalid request." }, 400); }
  const token = String(input?.token || "").trim();
  const action = String(input?.action || "sign").trim().toLowerCase();
  if (!/^[0-9a-f-]{36}$/i.test(token)) return reply({ success: false, error: "Invalid agreement link." }, 400);

  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const forwarded = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "";
  const ip = forwarded.split(",")[0].trim().slice(0, 200);
  const userAgent = (req.headers.get("user-agent") || "").slice(0, 1000);

  if (action === "decline") {
    const { data, error } = await service.rpc("service_decline_sales_partner_agreement", {
      p_token: token,
      p_reason: String(input?.reason || "").slice(0, 1000),
    });
    if (error) return reply({ success: false, error: error.message }, 400);
    return reply(data || { success: true });
  }

  const { data, error } = await service.rpc("service_sign_sales_partner_agreement", {
    p_token: token,
    p_signer_name: String(input?.signerName || "").trim(),
    p_signature_svg: String(input?.signatureSvg || ""),
    p_acknowledgements: input?.acknowledgements || {},
    p_ip: ip,
    p_user_agent: userAgent,
  });
  if (error) return reply({ success: false, error: error.message }, 400);
  return reply(data || { success: true });
});
