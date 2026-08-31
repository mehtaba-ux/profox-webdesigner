import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://www.profoxwebdesigner.com",
  "https://profoxwebdesigner.com",
  "http://localhost:3000",
  "http://localhost:5173",
]);

const testEmailSuffix = "@profoxwebdesigner.test";
const testStaffRoles = new Set(["sales", "content_writer", "uiux_designer", "developer"]);

function cors(origin: string | null) {
  const allowed = origin && allowedOrigins.has(origin) ? origin : "https://www.profoxwebdesigner.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(headers: Record<string, string>, status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);

  if (Deno.env.get("ENABLE_TEST_STAFF_LOGIN") !== "true") {
    return json(headers, 404, { error: "Not found" });
  }

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json(headers, 405, { error: "Method not allowed" });
  if (origin && !allowedOrigins.has(origin)) return json(headers, 403, { error: "Origin not allowed" });

  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !serviceRoleKey) return json(headers, 503, { error: "Test staff access is not configured" });

    const authorization = req.headers.get("authorization") || "";
    if (!authorization.toLowerCase().startsWith("bearer ")) {
      return json(headers, 401, { error: "Authentication required" });
    }

    const service = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const callerToken = authorization.slice(7).trim();
    const { data: callerAuth, error: callerAuthError } = await service.auth.getUser(callerToken);
    const caller = callerAuth?.user;
    if (callerAuthError || !caller) return json(headers, 401, { error: "Authentication required" });

    const { data: callerProfile, error: callerProfileError } = await service
      .from("user_profiles")
      .select("id,role,status")
      .eq("id", caller.id)
      .maybeSingle();
    if (callerProfileError || !callerProfile || callerProfile.role !== "admin" || callerProfile.status !== "active") {
      return json(headers, 403, { error: "Active Admin access required" });
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body?.targetUserId || "").trim();
    if (!isUuid(targetUserId)) return json(headers, 400, { error: "Valid test employee ID is required" });
    if (targetUserId === caller.id) return json(headers, 409, { error: "You are already signed in to this account" });

    const { data: targetProfile, error: targetProfileError } = await service
      .from("user_profiles")
      .select("id,email,full_name,role,status,onboarding_status,onboarding_progress")
      .eq("id", targetUserId)
      .maybeSingle();
    if (targetProfileError || !targetProfile) return json(headers, 404, { error: "Test employee not found" });

    const email = String(targetProfile.email || "").trim().toLowerCase();
    const isEligibleProfile = email.endsWith(testEmailSuffix)
      && testStaffRoles.has(String(targetProfile.role || ""))
      && targetProfile.status === "active"
      && targetProfile.onboarding_status === "completed"
      && Number(targetProfile.onboarding_progress || 0) === 100;
    if (!isEligibleProfile) return json(headers, 403, { error: "Only activated synthetic test employees can be accessed" });

    const { data: targetAuth, error: targetAuthError } = await service.auth.admin.getUserById(targetUserId);
    const targetAuthUser = targetAuth?.user;
    if (targetAuthError || !targetAuthUser) return json(headers, 404, { error: "Test employee Auth account not found" });
    if (targetAuthUser.app_metadata?.test_account !== true || targetAuthUser.email_confirmed_at == null) {
      return json(headers, 403, { error: "Target account is not a verified synthetic test account" });
    }

    const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError) throw new Error(linkError.message || "One-time employee session could not be generated");

    const tokenHash = String(linkData?.properties?.hashed_token || "").trim();
    if (!tokenHash) throw new Error("One-time employee session token is unavailable");

    console.info(JSON.stringify({
      event: "test_staff_login_issued",
      adminUserId: caller.id,
      targetUserId,
      targetRole: targetProfile.role,
      issuedAt: new Date().toISOString(),
    }));

    return json(headers, 200, {
      ok: true,
      tokenHash,
      verificationType: "magiclink",
      employee: {
        id: targetProfile.id,
        fullName: targetProfile.full_name,
        email,
        role: targetProfile.role,
      },
    });
  } catch (error) {
    console.error("test-staff-login failed", error);
    return json(headers, 500, {
      error: error instanceof Error ? error.message : "Test employee session could not be created",
    });
  }
});
