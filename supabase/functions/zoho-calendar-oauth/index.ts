import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
const randomToken = (size: number) => { const b = new Uint8Array(size); crypto.getRandomValues(b); return b64url(b); };
async function sha256(value: string) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, "0")).join("");
}
const safeReturnPath = (value: unknown) => {
  const p = String(value || "/admin/meetings?tab=availability");
  return p.startsWith("/") && !p.startsWith("//") ? p : "/admin/meetings?tab=availability";
};
const accountsHost = (dc: string) => ({
  com: "https://accounts.zoho.com", in: "https://accounts.zoho.in", eu: "https://accounts.zoho.eu",
  "com.au": "https://accounts.zoho.com.au", jp: "https://accounts.zoho.jp", ca: "https://accounts.zohocloud.ca", sa: "https://accounts.zoho.sa",
} as Record<string, string>)[dc] || "";
const calendarHost = (dc: string) => ({
  com: "https://calendar.zoho.com", in: "https://calendar.zoho.in", eu: "https://calendar.zoho.eu",
  "com.au": "https://calendar.zoho.com.au", jp: "https://calendar.zoho.jp", ca: "https://calendar.zohocloud.ca", sa: "https://calendar.zoho.sa",
} as Record<string, string>)[dc] || "";
const meetingHost = (dc: string) => ({
  com: "https://meeting.zoho.com", in: "https://meeting.zoho.in", eu: "https://meeting.zoho.eu",
  "com.au": "https://meeting.zoho.com.au", jp: "https://meeting.zoho.jp", ca: "https://meeting.zohocloud.ca", sa: "https://meeting.zoho.sa",
} as Record<string, string>)[dc] || "";

async function getPublicBaseUrl(service: any) {
  const { data } = await service.from("system_configuration").select("config_value").eq("config_key", "notification_settings").maybeSingle();
  const configured = String(data?.config_value?.publicBaseUrl || "").replace(/\/$/, "");
  if (/^https:\/\//i.test(configured)) return configured;
  const { data: company } = await service.from("system_configuration").select("config_value").eq("config_key", "company_settings").maybeSingle();
  const website = String(company?.config_value?.website || "").replace(/\/$/, "");
  return /^https:\/\//i.test(website) ? website : "https://www.profoxwebdesigner.com";
}

async function ignoreRpcFailure(request: PromiseLike<unknown>) {
  try { await request; } catch { /* best-effort cleanup only */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server configuration unavailable" }, 500);

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const redirectUri = `${supabaseUrl.replace(/\/+$/g, "")}/functions/v1/zoho-calendar-oauth`;
  const url = new URL(req.url);

  if (req.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error"))) {
    const publicBase = await getPublicBaseUrl(service);
    let returnPath = "/admin/meetings?tab=availability";
    try {
      const state = url.searchParams.get("state") || "";
      if (!state) throw new Error("Missing OAuth state.");
      const stateHash = await sha256(state);
      const { data: stateData, error: stateError } = await service.rpc("service_consume_zoho_calendar_oauth_state", { p_state_hash: stateHash });
      if (stateError || !stateData) throw stateError || new Error("Zoho OAuth state could not be validated.");
      returnPath = safeReturnPath(stateData.returnPath);
      const adminUserId = String(stateData.userId || "");
      const dc = String(stateData.dataCenter || "").toLowerCase();
      if (url.searchParams.get("error")) throw new Error(`Zoho authorization was not completed: ${url.searchParams.get("error")}`);

      const { data: adminProfile } = await service.from("user_profiles").select("role,status").eq("id", adminUserId).maybeSingle();
      if (!adminProfile || adminProfile.role !== "admin" || adminProfile.status !== "active") throw new Error("An active ProFox Administrator must authorize the central Zoho service.");

      const accountBase = accountsHost(dc), calBase = calendarHost(dc), meetingBase = meetingHost(dc);
      if (!accountBase || !calBase || !meetingBase) throw new Error("Unsupported Zoho data center.");
      const { data: provider, error: providerError } = await service.rpc("service_get_zoho_provider_credentials");
      if (providerError) throw providerError;
      const clientId = String(provider?.clientId || ""), clientSecret = String(provider?.clientSecret || "");
      if (!clientId || !clientSecret) throw new Error("Zoho OAuth credentials are not configured on the server.");

      const code = url.searchParams.get("code") || "";
      const tokenResponse = await fetch(`${accountBase}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code }),
      });
      const token: any = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok) throw new Error(String(token?.error_description || token?.error || `Zoho token exchange failed (${tokenResponse.status})`));
      const accessToken = String(token?.access_token || ""), refreshToken = String(token?.refresh_token || "");
      if (!accessToken || !refreshToken) throw new Error("Zoho did not return an offline refresh token. Reconnect and grant Calendar and Meeting access again.");

      const authHeaders = { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: "application/json" };
      const calendarResponse = await fetch(`${calBase}/api/v1/calendars/primary`, { headers: authHeaders });
      const calendarPayload: any = await calendarResponse.json().catch(() => ({}));
      if (!calendarResponse.ok) throw new Error(String(calendarPayload?.error?.[0]?.description || calendarPayload?.message || `Unable to read the primary Zoho Calendar (${calendarResponse.status}).`));
      const cal = Array.isArray(calendarPayload?.calendars) ? calendarPayload.calendars[0] : null;
      if (!cal?.uid) throw new Error("Zoho did not return a primary calendar identifier.");

      const meetingUserResponse = await fetch(`${meetingBase}/api/v2/user.json`, {
        headers: { ...authHeaders, "X-ZSOURCE": "ProFox" },
      });
      const meetingUserPayload: any = await meetingUserResponse.json().catch(() => ({}));
      if (!meetingUserResponse.ok) throw new Error(String(meetingUserPayload?.error?.message || meetingUserPayload?.message || `Unable to verify Zoho Meeting organization access (${meetingUserResponse.status}).`));
      const meetingUser = meetingUserPayload?.userDetails || {};
      const zsoid = String(meetingUser?.zsoid || ""), zuid = String(meetingUser?.zuid || "");
      const accountEmail = String(meetingUser?.primaryEmail || "").trim().toLowerCase();
      if (!zsoid || !zuid || !accountEmail.includes("@")) throw new Error("Zoho Meeting did not return a usable organization, presenter, and account identity.");

      // Read-only capability probe: verifies Meeting API entitlement without creating a fake meeting.
      const probe = await fetch(`${meetingBase}/api/v2/${encodeURIComponent(zsoid)}/sessions.json?listtype=upcoming&index=1&count=1`, {
        headers: { ...authHeaders, "X-ZSOURCE": "ProFox" },
      });
      const probePayload: any = await probe.json().catch(() => ({}));
      if (!probe.ok) {
        const detail = String(probePayload?.error?.message || probePayload?.message || `HTTP ${probe.status}`);
        throw new Error(`Zoho Meeting API access is not available for this organization. ${detail}`);
      }

      const { data: secretId, error: secretError } = await service.rpc("service_store_zoho_service_calendar_refresh_token", { p_refresh_token: refreshToken });
      if (secretError || !secretId) throw secretError || new Error("Secure central refresh-token storage failed.");
      const granted = String(token?.scope || "").split(/[ ,]+/).filter(Boolean);
      const { error: saveError } = await service.rpc("service_upsert_zoho_service_calendar_connection", {
        p_connected_by: adminUserId,
        p_account_email: accountEmail,
        p_zoho_account_id: zsoid,
        p_zoho_user_id: zuid,
        p_meeting_org_id: zsoid,
        p_presenter_zuid: zuid,
        p_data_center: dc,
        p_calendar_id: String(cal.uid),
        p_calendar_timezone: String(cal.timezone || "UTC"),
        p_scopes: granted,
        p_refresh_secret_id: secretId,
        p_meeting_ready: true,
      });
      if (saveError) throw saveError;

      const { error: activateError } = await service.rpc("service_activate_zoho_service_calendar");
      if (activateError) throw activateError;
      await ignoreRpcFailure(service.rpc("service_queue_existing_unsynced_meetings_for_central_zoho"));

      return Response.redirect(`${publicBase}${returnPath}${returnPath.includes("?") ? "&" : "?"}zoho=service_connected`, 302);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Zoho Calendar and Meeting connection failed.";
      await ignoreRpcFailure(service.rpc("service_mark_zoho_service_calendar_state", { p_status: "error", p_error: message, p_success: false }));
      return Response.redirect(`${publicBase}${returnPath}${returnPath.includes("?") ? "&" : "?"}zoho=error&message=${encodeURIComponent(message.slice(0, 300))}`, 302);
    }
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Authentication required" }, 401);
  const { data: profile } = await service.from("user_profiles").select("role,status").eq("id", userData.user.id).maybeSingle();
  if (!profile || profile.status !== "active") return json({ error: "Active ProFox account required" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const action = String(body?.action || "status").toLowerCase();

  if (action === "status") {
    const { data, error } = await userClient.rpc("get_zoho_service_calendar_status");
    if (error) return json({ error: error.message }, 403);
    const { data: provider } = await service.rpc("service_get_zoho_provider_credentials");
    return json({ connection: data, providerConfigured: Boolean(provider?.clientId && provider?.clientSecret), redirectUri });
  }

  if (action === "start" || action === "reconnect") {
    if (profile.role !== "admin") return json({ error: "Only an Administrator can authorize the company-managed Zoho Calendar and Meeting service." }, 403);
    const [{ data: provider }, { data: cfgRow }] = await Promise.all([
      service.rpc("service_get_zoho_provider_credentials"),
      service.from("system_configuration").select("config_value").eq("config_key", "professional_integrations").maybeSingle(),
    ]);
    if (!provider?.clientId || !provider?.clientSecret) return json({ error: "Zoho OAuth provider credentials are not configured yet.", providerConfigured: false }, 503);
    const cfg = cfgRow?.config_value || {};
    const dc = String(cfg?.zohoDataCenter || "com").toLowerCase();
    const accountBase = accountsHost(dc);
    if (!accountBase) return json({ error: "Unsupported Zoho data center configuration." }, 400);

    const state = randomToken(32), stateHash = await sha256(state), returnPath = safeReturnPath(body?.returnPath);
    const { error: stateError } = await service.rpc("service_create_zoho_calendar_oauth_state", {
      p_state_hash: stateHash, p_user_id: userData.user.id, p_return_path: returnPath, p_data_center: dc,
    });
    if (stateError) return json({ error: stateError.message }, 500);

    const scopes = [
      "ZohoCalendar.calendar.READ",
      "ZohoCalendar.event.ALL",
      "ZohoMeeting.manageOrg.READ",
      "ZohoMeeting.meeting.ALL",
    ];
    const authUrl = new URL(`${accountBase}/oauth/v2/auth`);
    authUrl.search = new URLSearchParams({
      scope: scopes.join(","), client_id: String(provider.clientId), response_type: "code", access_type: "offline",
      prompt: "consent", redirect_uri: redirectUri, state,
    }).toString();
    return json({ authorizationUrl: authUrl.toString(), redirectUri, scopes, managedByProFox: true });
  }

  if (action === "disconnect") {
    if (profile.role !== "admin") return json({ error: "Only an Administrator can disconnect the company-managed Zoho service." }, 403);
    const { data: refreshToken } = await service.rpc("service_get_zoho_service_calendar_refresh_token");
    const { data: cfgRow } = await service.from("system_configuration").select("config_value").eq("config_key", "professional_integrations").maybeSingle();
    const dc = String(cfgRow?.config_value?.zohoDataCenter || "com").toLowerCase();
    const accountBase = accountsHost(dc);
    if (refreshToken && accountBase) {
      await fetch(`${accountBase}/oauth/v2/token/revoke`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: String(refreshToken) }),
      }).catch(() => null);
    }
    const { error } = await service.rpc("service_disconnect_zoho_service_calendar", { p_error: null });
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  if (action === "sync_now") {
    const { data, error } = await userClient.rpc("request_zoho_calendar_sync_now");
    if (error) return json({ error: error.message }, 400);
    return json({ queuedJobId: data || null, managedByProFox: true });
  }

  return json({ error: "Unsupported action" }, 400);
});