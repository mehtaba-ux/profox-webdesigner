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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-profox-cron-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(headers: Record<string, string>, status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function secureEquals(left: string, right: string) {
  if (!left || !right) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  if (av.length !== bv.length) return false;
  let diff = 0;
  for (let index = 0; index < av.length; index += 1) diff |= av[index] ^ bv[index];
  return diff === 0;
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
    if (!url || !serviceKey) throw new Error("Account invitation service is not configured.");

    const service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const cronToken = req.headers.get("x-profox-cron-token") || "";
    let cronAuthorized = false;
    if (cronToken) {
      const { data: expectedToken, error: tokenError } = await service.rpc("service_get_notification_cron_secret");
      cronAuthorized = !tokenError && await secureEquals(cronToken, String(expectedToken || ""));
      if (!cronAuthorized) return json(headers, 401, { error: "Unauthorized" });
    }

    let callerProfile: { id: string; role: string; status: string } | null = null;
    if (!cronAuthorized) {
      const authHeader = req.headers.get("authorization") || "";
      if (!authHeader.toLowerCase().startsWith("bearer ")) return json(headers, 401, { error: "Authentication required" });
      const token = authHeader.slice(7).trim();
      const { data: authData, error: authError } = await service.auth.getUser(token);
      const caller = authData?.user;
      if (authError || !caller) return json(headers, 401, { error: "Authentication required" });

      const { data: profile, error: profileError } = await service
        .from("user_profiles")
        .select("id,role,status")
        .eq("id", caller.id)
        .maybeSingle();
      if (profileError || !profile || profile.status !== "active") {
        return json(headers, 403, { error: "Active staff access required" });
      }
      callerProfile = profile as { id: string; role: string; status: string };
    }

    const body = await req.json().catch(() => ({}));
    const applicantId = String(body?.applicantId || "").trim();
    if (!isUuid(applicantId)) return json(headers, 400, { error: "Valid applicant ID is required" });

    const { data: applicant, error: applicantError } = await service
      .from("applicants")
      .select("id,full_name,email,stage,agreement_status,refusal_reason,linked_user_id,onboarding_invite_count,onboarding_invite_last_sent_at,career_job_id")
      .eq("id", applicantId)
      .maybeSingle();
    if (applicantError || !applicant) return json(headers, 404, { error: "Candidate not found" });

    const { data: job, error: jobError } = applicant.career_job_id
      ? await service
          .from("career_jobs")
          .select("application_type,role_details")
          .eq("id", applicant.career_job_id)
          .maybeSingle()
      : { data: null, error: null };
    if (jobError) throw new Error(jobError.message || "Candidate job context could not be loaded");

    const applicationType = String(job?.application_type || "sales_representative");
    const fallbackRole = applicationType === "content_writer" ? "content_writer" : applicationType === "sales_representative" ? "sales" : "pending";
    const systemRole = String(job?.role_details?.systemRole || fallbackRole);
    const fallbackTrack = systemRole === "content_writer" ? "content_delivery" : systemRole === "uiux_designer" ? "uiux_design" : systemRole === "developer" ? "web_development" : "sales";
    const trainingTrack = String(job?.role_details?.trainingTrack || fallbackTrack);

    if (!new Set(["sales", "content_writer", "uiux_designer", "developer"]).has(systemRole)) {
      return json(headers, 409, { error: "This role does not have a protected onboarding account workflow yet" });
    }

    if (cronAuthorized && systemRole !== "content_writer") {
      return json(headers, 403, { error: "Automated provisioning is restricted to Content Writer onboarding" });
    }

    if (!cronAuthorized) {
      const callerRole = String(callerProfile?.role || "");
      if (systemRole === "content_writer") {
        if (!["admin", "editor", "site_manager"].includes(callerRole)) {
          return json(headers, 403, { error: "Content recruitment management access required" });
        }
      } else if (callerRole !== "admin") {
        return json(headers, 403, { error: "Active Admin access required" });
      }
    }

    if (String(applicant.refusal_reason || "").trim()) {
      return json(headers, 409, { error: "Closed candidates cannot receive onboarding access" });
    }

    const allowedStages = systemRole === "content_writer"
      ? ["Selected", "Content Academy"]
      : systemRole === "uiux_designer"
        ? ["Selected", "Agreement Pending", "Design Academy"]
        : systemRole === "developer"
          ? ["Selected", "Agreement Pending", "Developer Academy"]
          : ["Selected", "Agreement Pending", "One-Day Training"];
    if (!allowedStages.includes(String(applicant.stage))) {
      return json(headers, 409, { error: "Candidate is not in an account invitation stage" });
    }

    if (systemRole !== "content_writer" && String(applicant.agreement_status || "").toLowerCase() !== "signed") {
      return json(headers, 409, { error: "A verified candidate agreement is required before Academy access" });
    }

    if (Number(applicant.onboarding_invite_count || 0) >= 20) {
      return json(headers, 429, { error: "Invitation resend limit reached. Review the candidate account before trying again" });
    }
    if (applicant.onboarding_invite_last_sent_at) {
      const elapsed = Date.now() - new Date(applicant.onboarding_invite_last_sent_at).getTime();
      if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 120_000) {
        return json(headers, 429, { error: "An Academy access invitation was sent recently. Please wait before resending" });
      }
    }

    const email = String(applicant.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(headers, 409, { error: "Candidate email is invalid" });

    const safeOrigin = origin && allowedOrigins.has(origin) ? origin : "https://www.profoxwebdesigner.com";
    const redirectTo = systemRole === "content_writer"
      ? `${safeOrigin}/team-onboarding/setup?track=${encodeURIComponent(trainingTrack)}`
      : `${safeOrigin}/sales-onboarding/setup?track=${encodeURIComponent(trainingTrack)}`;

    let targetUserId = String(applicant.linked_user_id || "").trim();
    let inviteMode: "invite" | "recovery" = "invite";
    let createdNewUser = false;

    if (!targetUserId) {
      const { data: profileRows, error: profileLookupError } = await service
        .from("user_profiles")
        .select("id,email,role,status")
        .ilike("email", email)
        .limit(1);
      if (profileLookupError) throw new Error(profileLookupError.message || "Candidate account lookup failed");
      if (profileRows?.[0]?.id) targetUserId = String(profileRows[0].id);
    }

    let linkData: any;
    if (targetUserId) {
      inviteMode = "recovery";
      const { data, error } = await service.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });
      if (error) throw new Error(error.message || "Secure account link could not be generated");
      linkData = data;
    } else {
      const { data, error } = await service.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          redirectTo,
          data: { full_name: String(applicant.full_name || "").trim() },
        },
      });
      if (error) throw new Error(error.message || "Secure Academy account invitation could not be generated");
      linkData = data;
      targetUserId = String(data?.user?.id || "").trim();
      createdNewUser = Boolean(targetUserId);
    }

    const actionLink = String(linkData?.properties?.action_link || "").trim();
    if (!targetUserId || !actionLink) {
      if (createdNewUser && targetUserId) await service.auth.admin.deleteUser(targetUserId).catch(() => undefined);
      throw new Error("Secure account setup link could not be generated");
    }

    let linked: any;
    try {
      const { error: profileUpsertError } = await service.from("user_profiles").upsert({
        id: targetUserId,
        email,
        full_name: String(applicant.full_name || "").trim(),
      }, { onConflict: "id", ignoreDuplicates: true });
      if (profileUpsertError) throw new Error(profileUpsertError.message || "Candidate profile could not be prepared");

      const rpcName = systemRole === "content_writer"
        ? "service_link_invited_candidate"
        : systemRole === "uiux_designer"
          ? "service_link_invited_uiux_candidate"
          : systemRole === "developer"
            ? "service_link_invited_developer_candidate"
            : "service_link_invited_sales_candidate";
      const { data, error: linkedError } = await service.rpc(rpcName, {
        p_applicant_id: applicantId,
        p_target_user_id: targetUserId,
        p_account_invite_url: actionLink,
      });
      if (linkedError) throw new Error(linkedError.message || "Candidate Academy access could not be linked");
      linked = data;
    } catch (linkingError) {
      if (createdNewUser && targetUserId) {
        const { error: cleanupError } = await service.auth.admin.deleteUser(targetUserId);
        if (cleanupError) console.error("Failed to clean up unlinked invited Auth user", cleanupError.message);
      }
      throw linkingError;
    }

    const academyStage = systemRole === "content_writer"
      ? "Content Academy"
      : systemRole === "uiux_designer"
        ? "Design Academy"
        : systemRole === "developer"
          ? "Developer Academy"
          : "One-Day Training";

    return json(headers, 200, {
      ok: true,
      linkedUserId: targetUserId,
      stage: linked?.stage || academyStage,
      status: linked?.status || "onboarding",
      systemRole,
      trainingTrack,
      inviteMode,
      inviteNumber: linked?.inviteNumber || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account invitation failed";
    return json(headers, 400, { error: message });
  }
});