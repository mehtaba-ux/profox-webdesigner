import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLIENT_PORTAL_ORIGIN = "https://www.profoxwebdesigner.com";
const allowedOrigins = new Set([
  CLIENT_PORTAL_ORIGIN,
  "https://profoxwebdesigner.com",
  "http://localhost:3000",
  "http://localhost:5173",
]);

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : CLIENT_PORTAL_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(headers: Record<string, string>, status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function isPortalToken(value: string) {
  return /^[0-9a-f]{40,256}$/i.test(value);
}

function cleanName(value: unknown) {
  return String(value || "").replace(/[\r\n<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json(headers, 405, { error: "Method not allowed" });
  if (origin && !allowedOrigins.has(origin)) return json(headers, 403, { error: "Origin not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceKey) throw new Error("Client Portal verification service is not configured.");

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "create").trim().toLowerCase();
    const inviteToken = String(body?.inviteToken || "").trim();
    const fullName = cleanName(body?.fullName);
    const password = String(body?.password || "");

    if (!["create", "resend"].includes(action)) return json(headers, 400, { error: "Unsupported verification action" });
    if (!isPortalToken(inviteToken)) return json(headers, 400, { error: "A valid Client Portal invitation is required" });
    if (action === "create" && password.length < 6) return json(headers, 400, { error: "Password must be at least 6 characters" });
    if (password.length > 256) return json(headers, 400, { error: "Password is too long" });

    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: context, error: contextError } = await service.rpc("service_client_portal_verification_context", {
      p_token: inviteToken,
    });
    if (contextError || !context) throw new Error(contextError?.message || "Client Portal invitation could not be verified");
    if (context.alreadyLinked === true) return json(headers, 409, { error: "This customer already has an active Client Portal. Sign in instead." });

    const email = String(context.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Client Portal email is invalid");

    const { data: profileRows, error: profileLookupError } = await service
      .from("user_profiles")
      .select("id,email,role,status")
      .ilike("email", email)
      .limit(2);
    if (profileLookupError) throw new Error(profileLookupError.message || "Client Portal account lookup failed");
    if ((profileRows || []).length > 1) throw new Error("Multiple accounts use this email. ProFox support must review the account before activation.");

    const existing = profileRows?.[0];
    if (existing && !["pending", "customer"].includes(String(existing.role))) {
      return json(headers, 409, { error: "This email belongs to a staff account and cannot be used for the Client Portal" });
    }

    let userId = String(existing?.id || "").trim();
    if (action === "resend" && !userId) return json(headers, 409, { error: "Create the Client Portal account before resending verification" });

    if (!userId) {
      const { data: created, error: createError } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: {
          full_name: fullName || String(context.contactName || "").trim(),
          account_type: "customer",
        },
      });
      if (createError) throw new Error(createError.message || "Client Portal account could not be created");
      userId = String(created.user?.id || "").trim();
      if (!userId) throw new Error("Client Portal account identifier was not returned");

      const { error: profileError } = await service.from("user_profiles").upsert({
        id: userId,
        email,
        full_name: fullName || String(context.contactName || "").trim(),
      }, { onConflict: "id" });
      if (profileError) {
        await service.auth.admin.deleteUser(userId).catch(() => undefined);
        throw new Error(profileError.message || "Client Portal profile could not be prepared");
      }
    } else if (action === "create") {
      const { error: updateError } = await service.auth.admin.updateUserById(userId, {
        password,
        user_metadata: {
          full_name: fullName || String(context.contactName || "").trim(),
          account_type: "customer",
        },
      });
      if (updateError) throw new Error(updateError.message || "Client Portal account could not be prepared");

      const { error: profileError } = await service.from("user_profiles").update({
        full_name: fullName || String(context.contactName || "").trim(),
      }).eq("id", userId);
      if (profileError) throw new Error(profileError.message || "Client Portal profile could not be updated");
    }

    // Customer-facing email links must always return to the canonical production portal.
    // Localhost stays CORS-allowed for developer testing, but it is never embedded into an email.
    const redirectTo = `${CLIENT_PORTAL_ORIGIN}/client-portal?invite=${encodeURIComponent(inviteToken)}`;
    const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (linkError) throw new Error(linkError.message || "Secure verification link could not be generated");

    const verificationUrl = String(linkData?.properties?.action_link || "").trim();
    if (!verificationUrl) throw new Error("Secure verification link was not returned");

    let generatedRedirect = "";
    try {
      const verification = new URL(verificationUrl);
      generatedRedirect = verification.searchParams.get("redirect_to") || verification.searchParams.get("redirectTo") || "";
    } catch {
      throw new Error("Secure verification link format is invalid");
    }
    if (generatedRedirect && !generatedRedirect.startsWith(`${CLIENT_PORTAL_ORIGIN}/client-portal`)) {
      throw new Error("Secure verification link did not preserve the production Client Portal redirect");
    }

    const { data: queued, error: queueError } = await service.rpc("service_queue_client_portal_verification", {
      p_token: inviteToken,
      p_user_id: userId,
      p_verification_url: verificationUrl,
    });
    if (queueError || queued?.queued !== true) throw new Error(queueError?.message || "Verification email could not be queued");

    return json(headers, 200, {
      ok: true,
      verificationQueued: true,
      attempt: Number(queued.attempt || 1),
      requestId: String(queued.notificationId || ""),
    });
  } catch (error) {
    return json(headers, 400, {
      error: error instanceof Error ? error.message : "Client Portal verification failed",
    });
  }
});
