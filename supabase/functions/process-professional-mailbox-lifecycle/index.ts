import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const accountsHost = (dc: string) => ({
  com: "https://accounts.zoho.com",
  in: "https://accounts.zoho.in",
  eu: "https://accounts.zoho.eu",
  "com.au": "https://accounts.zoho.com.au",
  jp: "https://accounts.zoho.jp",
  ca: "https://accounts.zohocloud.ca",
  sa: "https://accounts.zoho.sa",
} as Record<string, string>)[dc] || "";

const mailHost = (dc: string) => ({
  com: "https://mail.zoho.com",
  in: "https://mail.zoho.in",
  eu: "https://mail.zoho.eu",
  "com.au": "https://mail.zoho.com.au",
  jp: "https://mail.zoho.jp",
  ca: "https://mail.zohocloud.ca",
  sa: "https://mail.zoho.sa",
} as Record<string, string>)[dc] || "";

function safeError(payload: any, status: number) {
  const parts = [
    payload?.data?.errorCode,
    payload?.data?.moreInfo,
    payload?.status?.description,
    payload?.error_description,
    payload?.error,
    payload?.message,
  ].map(value => String(value || "").trim()).filter(Boolean);
  return ([...new Set(parts)].join(" | ") || `Zoho API request failed (${status})`).slice(0, 1600);
}

function retryDelay(attempts: number) {
  const base = 30;
  const exp = Math.min(base * Math.pow(2, Math.max(attempts - 1, 0)), 21600);
  return Math.max(15, Math.round(exp + Math.random() * Math.min(exp * 0.25, 60)));
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration unavailable" }, 500);

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const cronHeader = req.headers.get("x-profox-mailbox-cron-token") || "";
  const authHeader = req.headers.get("Authorization") || "";
  const { data: cronSecret } = await service.rpc("service_get_professional_mailbox_cron_secret");
  const internalAuth = authHeader === `Bearer ${serviceKey}`;
  if (!internalAuth && (!cronSecret || cronHeader !== String(cronSecret))) return json({ error: "Unauthorized" }, 401);

  const { data: runtime, error: runtimeError } = await service.rpc("service_get_zoho_org_mail_runtime");
  if (runtimeError) return json({ error: "Zoho Mail runtime configuration could not be loaded." }, 500);
  if (String(runtime?.status || "") !== "connected") return json({ ok: true, claimed: 0, reason: "zoho_mail_not_connected" });

  const dc = String(runtime?.dataCenter || "");
  const orgId = String(runtime?.organizationId || "");
  const clientId = String(runtime?.clientId || "");
  const clientSecret = String(runtime?.clientSecret || "");
  const refreshToken = String(runtime?.refreshToken || "");
  const accountBase = accountsHost(dc);
  const mailBase = mailHost(dc);
  if (!accountBase || !mailBase || !orgId || !clientId || !clientSecret || !refreshToken) {
    return json({ error: "Verified Zoho Mail runtime configuration is incomplete." }, 503);
  }

  const { data: jobs, error: claimError } = await service.rpc("service_claim_professional_mailbox_lifecycle", { p_limit: 10 });
  if (claimError) return json({ error: claimError.message }, 500);
  if (!jobs?.length) return json({ ok: true, claimed: 0, results: [] });

  let token = "";
  try {
    const response = await fetch(`${accountBase}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }),
    });
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.access_token) {
      const message = safeError(payload, response.status);
      for (const job of jobs) {
        await service.rpc("service_finish_professional_mailbox_lifecycle", {
          p_user_id: job.user_id,
          p_action: job.lifecycle_action,
          p_success: false,
          p_error: message,
          p_retry_seconds: retryDelay(Number(job.lifecycle_attempts || 1)),
        });
      }
      return json({ ok: false, claimed: jobs.length, error: "Zoho token refresh failed." }, response.status >= 500 ? 503 : 400);
    }
    token = String(payload.access_token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zoho token endpoint unavailable.";
    for (const job of jobs) {
      await service.rpc("service_finish_professional_mailbox_lifecycle", {
        p_user_id: job.user_id,
        p_action: job.lifecycle_action,
        p_success: false,
        p_error: message,
        p_retry_seconds: retryDelay(Number(job.lifecycle_attempts || 1)),
      });
    }
    return json({ ok: false, claimed: jobs.length, error: "Zoho token endpoint unavailable." }, 503);
  }

  const headers = { Authorization: `Zoho-oauthtoken ${token}`, Accept: "application/json", "Content-Type": "application/json" };
  const results: Array<Record<string, unknown>> = [];

  for (const job of jobs) {
    const action = String(job.lifecycle_action || "");
    const accountId = String(job.provider_account_id || "").trim();
    const zuid = String(job.provider_user_id || "").trim();
    try {
      if (!accountId || !zuid || !["disable", "enable"].includes(action)) {
        throw new Error("Professional mailbox lifecycle identifiers are incomplete.");
      }

      const body = action === "disable"
        ? { mode: "disableUser", blockIncoming: true, removeMailforward: false, removeGroupMembership: false, removeAlias: false, zuid }
        : { mode: "enableUser", unblockIncoming: true, zuid };

      const response = await fetch(`${mailBase}/api/organization/${encodeURIComponent(orgId)}/accounts/${encodeURIComponent(accountId)}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      });
      const payload: any = await response.json().catch(() => ({}));
      const detail = safeError(payload, response.status);
      const alreadyAtTarget = action === "disable"
        ? /already.*(disable|inactive)|user.*inactive|account.*inactive/i.test(detail)
        : /already.*(enable|active)|user.*active|account.*active/i.test(detail);

      if (!response.ok && !alreadyAtTarget) {
        const retryable = response.status === 429 || response.status >= 500;
        await service.rpc("service_finish_professional_mailbox_lifecycle", {
          p_user_id: job.user_id,
          p_action: action,
          p_success: false,
          p_error: detail,
          p_retry_seconds: retryable ? retryDelay(Number(job.lifecycle_attempts || 1)) : 21600,
        });
        results.push({ userId: job.user_id, action, status: retryable ? "retry" : "blocked", providerStatus: response.status });
        continue;
      }

      await service.rpc("service_finish_professional_mailbox_lifecycle", {
        p_user_id: job.user_id,
        p_action: action,
        p_success: true,
        p_error: null,
        p_retry_seconds: 60,
      });
      results.push({ userId: job.user_id, action, status: "succeeded" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Professional mailbox lifecycle operation failed.";
      await service.rpc("service_finish_professional_mailbox_lifecycle", {
        p_user_id: job.user_id,
        p_action: action || "disable",
        p_success: false,
        p_error: message,
        p_retry_seconds: retryDelay(Number(job.lifecycle_attempts || 1)),
      });
      results.push({ userId: job.user_id, action, status: "retry" });
    }
  }

  return json({ ok: true, claimed: jobs.length, results });
});
