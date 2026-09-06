import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://www.profoxwebdesigner.com",
  "https://profoxwebdesigner.com",
  "http://localhost:3000",
  "http://localhost:5173",
]);

function cors(origin: string | null) {
  const allowed = origin && allowedOrigins.has(origin) ? origin : "https://www.profoxwebdesigner.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  if (origin && !allowedOrigins.has(origin)) return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers });

  try {
    const authorization = req.headers.get("authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers });

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Private asset service is not configured.");

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userResult, error: userError } = await admin.auth.getUser(token);
    const user = userResult?.user;
    if (userError || !user?.id) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers });

    const body = await req.json();
    const applicantId = String(body?.applicantId || "").trim();
    const assetType = String(body?.assetType || "").trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicantId)) {
      return new Response(JSON.stringify({ error: "Valid applicant is required" }), { status: 400, headers });
    }
    if (!['cv', 'video'].includes(assetType)) {
      return new Response(JSON.stringify({ error: "Asset type must be cv or video" }), { status: 400, headers });
    }

    const ip = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown").split(",")[0].trim();
    const ipHash = await sha256(`profox-recruitment-private-asset:${ip}`);
    const userAgent = (req.headers.get("user-agent") || "").slice(0, 500);

    const { data: authorizationResult, error: authorizationError } = await admin.rpc("service_authorize_recruitment_asset_access", {
      p_actor_user_id: user.id,
      p_applicant_id: applicantId,
      p_asset_type: assetType,
      p_ip_hash: ipHash,
      p_user_agent: userAgent,
    });
    if (authorizationError || !authorizationResult?.authorized || !authorizationResult?.path) {
      const message = authorizationError?.message || "Recruitment asset access is not authorized.";
      const unavailable = /not available|not found/i.test(message);
      return new Response(JSON.stringify({ error: unavailable ? "Requested recruitment asset is unavailable." : "You are not authorized to open this recruitment asset." }), { status: unavailable ? 404 : 403, headers });
    }

    const expiresInSeconds = 600;
    const { data: signed, error: signedError } = await admin.storage
      .from("recruitment-applications")
      .createSignedUrl(String(authorizationResult.path), expiresInSeconds);
    if (signedError || !signed?.signedUrl) throw new Error("Private recruitment asset link could not be created.");

    return new Response(JSON.stringify({ signedUrl: signed.signedUrl, expiresInSeconds }), { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Private recruitment asset request failed.";
    return new Response(JSON.stringify({ error: message }), { status: 400, headers });
  }
});
