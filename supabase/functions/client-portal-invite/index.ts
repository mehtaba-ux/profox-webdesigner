import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://www.profoxwebdesigner.com",
  "https://profoxwebdesigner.com",
  "http://localhost:3000",
  "http://localhost:5173",
]);

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://www.profoxwebdesigner.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(headers: Record<string, string>, status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json(headers, 405, { error: "Method not allowed" });
  if (origin && !allowedOrigins.has(origin)) return json(headers, 403, { error: "Origin not allowed" });

  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !serviceKey) throw new Error("Client portal invitation service is not configured.");

    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) return json(headers, 401, { error: "Authentication required" });
    const token = authHeader.slice(7).trim();
    const { data: authData, error: authError } = await service.auth.getUser(token);
    if (authError || !authData.user) return json(headers, 401, { error: "Authentication required" });

    const { data: caller, error: callerError } = await service
      .from("user_profiles")
      .select("id,role,status")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (callerError || !caller || caller.role !== "admin" || caller.status !== "active") {
      return json(headers, 403, { error: "Active Admin access required" });
    }

    const body = await req.json().catch(() => ({}));
    const clientId = String(body?.clientId || "").trim();
    if (!isUuid(clientId)) return json(headers, 400, { error: "Valid client ID is required" });

    const { data: client, error: clientError } = await service
      .from("clients")
      .select("id,company_name,primary_contact_name,email,status,linked_user_id,portal_invite_count,portal_invite_last_sent_at")
      .eq("id", clientId)
      .maybeSingle();
    if (clientError || !client) return json(headers, 404, { error: "Client record not found" });
    if (client.status !== "Active") return json(headers, 409, { error: "Only an active client can receive portal access" });
    if (Number(client.portal_invite_count || 0) >= 50) return json(headers, 429, { error: "Client portal invitation limit reached. Review the account before trying again" });
    if (client.portal_invite_last_sent_at) {
      const elapsed = Date.now() - new Date(client.portal_invite_last_sent_at).getTime();
      if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 120_000) {
        return json(headers, 429, { error: "A portal invitation was sent recently. Please wait before resending" });
      }
    }

    const email = String(client.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(headers, 409, { error: "Client email is invalid" });
    const safeOrigin = origin && allowedOrigins.has(origin) ? origin : "https://www.profoxwebdesigner.com";
    const redirectTo = `${safeOrigin}/client-portal`;

    let targetUserId = String(client.linked_user_id || "").trim();
    if (!targetUserId) {
      const { data: profileRows, error: lookupError } = await service
        .from("user_profiles")
        .select("id,email,role,status")
        .ilike("email", email)
        .limit(1);
      if (lookupError) throw new Error(lookupError.message || "Client portal account lookup failed");
      const candidate = profileRows?.[0];
      if (candidate && !["pending", "customer"].includes(String(candidate.role))) {
        return json(headers, 409, { error: "This email belongs to a staff account and cannot be used for the client portal" });
      }
      if (candidate?.id) targetUserId = String(candidate.id);
    }

    let inviteMode: "invite" | "recovery" = "invite";
    if (!targetUserId) {
      const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
        data: { full_name: String(client.primary_contact_name || "").trim(), account_type: "customer" },
        redirectTo,
      });
      if (inviteError) throw new Error(inviteError.message || "Client portal invitation could not be sent");
      targetUserId = String(invited.user?.id || "").trim();
      if (!targetUserId) throw new Error("Invited account identifier was not returned");

      const { error: profileError } = await service.from("user_profiles").upsert({
        id: targetUserId,
        email,
        full_name: String(client.primary_contact_name || "").trim(),
      }, { onConflict: "id", ignoreDuplicates: true });
      if (profileError) {
        await service.auth.admin.deleteUser(targetUserId).catch(() => undefined);
        throw new Error(profileError.message || "Client portal profile could not be prepared");
      }

      const { error: linkError } = await service.rpc("service_link_client_portal_invite", {
        p_client_id: clientId,
        p_target_user_id: targetUserId,
      });
      if (linkError) {
        await service.auth.admin.deleteUser(targetUserId).catch(() => undefined);
        throw new Error(linkError.message || "Client portal account could not be linked");
      }
    } else {
      inviteMode = "recovery";
      const { error: resetError } = await service.auth.resetPasswordForEmail(email, { redirectTo });
      if (resetError) throw new Error(resetError.message || "Client portal access email could not be sent");

      if (!client.linked_user_id) {
        const { error: linkError } = await service.rpc("service_link_client_portal_invite", {
          p_client_id: clientId,
          p_target_user_id: targetUserId,
        });
        if (linkError) throw new Error(linkError.message || "Client portal account could not be linked");
      } else {
        const { error: recordError } = await service.rpc("service_record_client_portal_resend", { p_client_id: clientId });
        if (recordError) throw new Error(recordError.message || "Client portal resend could not be recorded");
      }
    }

    return json(headers, 200, { ok: true, linkedUserId: targetUserId, inviteMode });
  } catch (error) {
    return json(headers, 400, { error: error instanceof Error ? error.message : "Client portal invitation failed" });
  }
});
