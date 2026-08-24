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
  const headers = { ...cors(origin), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  if (origin && !allowedOrigins.has(origin)) return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers });

  try {
    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const kind = String(body?.kind || "").trim().toLowerCase();
    const filename = String(body?.filename || "").trim();
    const contentType = String(body?.contentType || "").trim().toLowerCase();
    const sizeBytes = Number(body?.sizeBytes || 0);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter your email before uploading a file.");
    if (!['cv','video'].includes(kind)) throw new Error("Unsupported file type.");
    if (!filename || filename.length > 180 || !Number.isFinite(sizeBytes) || sizeBytes < 1) throw new Error("Invalid file.");

    const ip = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown").split(",")[0].trim();
    const ipHash = await sha256(`profox-recruitment:${ip}`);
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Upload service is not configured.");

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: intent, error: intentError } = await admin.rpc("service_create_recruitment_upload_intent", {
      p_email: email,
      p_kind: kind,
      p_filename: filename,
      p_content_type: contentType,
      p_size_bytes: sizeBytes,
      p_ip_hash: ipHash,
    });
    if (intentError) throw new Error(intentError.message || "Upload could not be authorized.");

    const { data: signed, error: signedError } = await admin.storage.from("recruitment-applications").createSignedUploadUrl(intent.path);
    if (signedError || !signed?.token) throw new Error(signedError?.message || "Upload link could not be created.");

    return new Response(JSON.stringify({ path: intent.path, token: signed.token, expiresAt: intent.expiresAt, maxBytes: intent.maxBytes }), { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload request failed.";
    return new Response(JSON.stringify({ error: message }), { status: 400, headers });
  }
});