import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-profox-zoho-calendar-cron-token",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
const toBasicUtc = (value: string | Date) => {
  const d = value instanceof Date ? value : new Date(value);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
};
const eventFrom = (payload: any) => Array.isArray(payload?.events) ? payload.events[0] : payload?.event || null;
const sessionFrom = (payload: any) => payload?.session || payload?.meeting || null;
const zohoError = (payload: any, status: number) => String(
  payload?.error?.[0]?.description || payload?.error?.[0]?.message || payload?.status?.description ||
  payload?.data?.errorCode || payload?.message || payload?.error_description || payload?.error ||
  `Zoho API request failed (${status})`
).slice(0, 1800);
const retryable = (status: number) => status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
const reconnectRequired = (status: number, payload: any) => status === 401 || status === 403 || /INVALID_OAUTHTOKEN|INVALID_TOKEN|invalid oauth|scope|permission/i.test(zohoError(payload, status));
const retryDelay = (attempts: number) => Math.max(10, Math.min(21600, Math.round(30 * Math.pow(2, Math.max(attempts - 1, 0)))));
const markerFor = (meetingId: string) => `ProFox Meeting ID: ${meetingId}`;

function meetingStart(value: string, timeZone: string) {
  const d = new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true,
  }).formatToParts(d);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("month")} ${pick("day")}, ${pick("year")} ${pick("hour")}:${pick("minute")} ${pick("dayPeriod")}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server configuration unavailable" }, 500);
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  const cronHeader = req.headers.get("x-profox-zoho-calendar-cron-token") || "";
  const { data: cronSecret } = await service.rpc("service_get_zoho_calendar_cron_secret");
  let manual = false;
  if (!cronSecret || cronHeader !== String(cronSecret)) {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Authentication required" }, 401);
    if (String(body?.action || "") !== "sync_now") return json({ error: "Unsupported manual action" }, 400);
    const { error: queueError } = await userClient.rpc("request_zoho_calendar_sync_now");
    if (queueError) return json({ error: queueError.message }, 400);
    manual = true;
  }

  const { data: ready } = await service.rpc("service_central_zoho_ready");
  if (!ready) return json({ processed: 0, results: [], centralZohoReady: false, manual });

  const { data: connection, error: connectionError } = await service.from("zoho_service_calendar_connection").select("*").eq("singleton_key", "primary").maybeSingle();
  if (connectionError || !connection || connection.status !== "connected") return json({ error: connectionError?.message || "Central Zoho service connection is unavailable." }, 503);
  if (!connection.calendar_id || !connection.meeting_org_id || !connection.presenter_zuid || !connection.meeting_ready) return json({ error: "Central Zoho Calendar/Meeting capability is incomplete." }, 503);

  const { data: provider, error: providerError } = await service.rpc("service_get_zoho_provider_credentials");
  if (providerError || !provider?.clientId || !provider?.clientSecret) return json({ error: "Zoho OAuth provider credentials are not configured." }, 503);
  const { data: refreshToken, error: refreshError } = await service.rpc("service_get_zoho_service_calendar_refresh_token");
  if (refreshError || !refreshToken) return json({ error: "Central Zoho refresh token is unavailable." }, 503);

  const dc = String(connection.data_center || "").toLowerCase();
  const accountBase = accountsHost(dc), calendarBase = calendarHost(dc), meetingBase = meetingHost(dc);
  if (!accountBase || !calendarBase || !meetingBase) return json({ error: "Unsupported Zoho data center." }, 500);

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(`${accountBase}/oauth/v2/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ refresh_token: String(refreshToken), client_id: String(provider.clientId), client_secret: String(provider.clientSecret), grant_type: "refresh_token" }),
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Zoho token endpoint unavailable." }, 503);
  }
  const tokenPayload: any = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    const message = zohoError(tokenPayload, tokenResponse.status);
    await service.rpc("service_mark_zoho_service_calendar_state", { p_status: "reconnect_required", p_error: message, p_success: false });
    return json({ error: message }, tokenResponse.status === 401 ? 401 : 503);
  }
  const token = String(tokenPayload.access_token);

  const { data: jobs, error: claimError } = await service.rpc("service_claim_zoho_sync_jobs", { p_limit: 25 });
  if (claimError) return json({ error: claimError.message }, 500);
  const results: any[] = [];

  async function finish(job: any, status: string, message = "", retrySeconds?: number) {
    await service.rpc("service_finish_zoho_sync_job", { p_job_id: job.id, p_status: status, p_error: message || null, p_retry_seconds: retrySeconds ?? null });
  }
  async function markHealthy() {
    await service.rpc("service_mark_zoho_service_calendar_state", { p_status: "connected", p_error: null, p_success: true });
  }
  async function api(base: string, path: string, init: RequestInit = {}, meetingApi = false) {
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          ...(meetingApi ? { "X-ZSOURCE": "ProFox" } : {}),
          ...(init.headers || {}),
          Authorization: `Zoho-oauthtoken ${token}`,
        },
      });
    } catch (error) {
      throw Object.assign(new Error(error instanceof Error ? error.message : "Zoho network error"), { kind: "network" });
    }
    const text = await response.text();
    let payload: any = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
    return { response, payload };
  }
  async function loadMeeting(job: any) {
    const { data, error } = await service.from("sales_meetings").select("*").eq("id", job.meeting_id).eq("salesperson_id", job.user_id).maybeSingle();
    if (error || !data) throw Object.assign(new Error(error?.message || "Meeting no longer exists."), { kind: "failed" });
    return data;
  }
  async function loadCalendarLink(job: any) {
    const { data } = await service.from("zoho_calendar_event_links").select("*").eq("meeting_id", job.meeting_id).maybeSingle();
    return data || null;
  }
  async function loadPrivateLink(job: any) {
    const { data } = await service.from("meeting_provider_private_links").select("*").eq("meeting_id", job.meeting_id).eq("provider", "zoho_meeting").maybeSingle();
    return data || null;
  }
  async function ensureStillZoho(job: any) {
    const { data } = await service.rpc("service_meeting_external_provider", { p_meeting_id: job.meeting_id });
    return String(data || "") === "zoho";
  }
  async function quarantineCreate(job: any, what: string, detail: string) {
    const message = `${what} create result is uncertain; automatic retry stopped to prevent a duplicate. ${detail}`.slice(0, 1900);
    await finish(job, "dead_letter", message);
    return false;
  }
  async function handleFailure(job: any, response: Response, payload: any, operation: "create" | "idempotent", label: string) {
    const message = zohoError(payload, response.status);
    if (reconnectRequired(response.status, payload)) {
      await service.rpc("service_mark_zoho_service_calendar_state", { p_status: "reconnect_required", p_error: message, p_success: false });
      await finish(job, "reconnect_required", message);
      return false;
    }
    if (operation === "create" && retryable(response.status)) return quarantineCreate(job, label, message);
    if (retryable(response.status)) {
      await finish(job, "retry", message, retryDelay(Number(job.attempts || 1)));
      return false;
    }
    await finish(job, "failed", message);
    return false;
  }

  function meetingBody(meeting: any) {
    const timezone = String(meeting.timezone || connection.calendar_timezone || "UTC");
    const duration = Math.max(60000, new Date(meeting.end_at).getTime() - new Date(meeting.start_at).getTime());
    const agenda = `${String(meeting.description || "").trim()}${meeting.description ? "\n\n" : ""}${markerFor(String(meeting.id))}`;
    const session: any = {
      topic: String(meeting.title || "ProFox Meeting").slice(0, 200),
      agenda: agenda.slice(0, 2000),
      presenter: String(connection.presenter_zuid),
      startTime: meetingStart(String(meeting.start_at), timezone),
      duration,
      timezone,
    };
    if (validEmail(String(meeting.attendee_email || ""))) {
      session.participants = [{ email: String(meeting.attendee_email).trim().toLowerCase() }];
    }
    return { session };
  }
  async function getMeetingByKey(key: string) {
    return api(meetingBase, `/api/v2/${encodeURIComponent(String(connection.meeting_org_id))}/sessions/${encodeURIComponent(key)}.json`, { method: "GET" }, true);
  }
  async function findExistingMeetingByMarker(meeting: any) {
    const marker = markerFor(String(meeting.id));
    const path = `/api/v2/${encodeURIComponent(String(connection.meeting_org_id))}/sessions.json?listtype=upcoming&index=1&count=100`;
    const listing = await api(meetingBase, path, { method: "GET" }, true);
    if (!listing.response.ok) return null;
    const candidates = [
      ...(Array.isArray(listing.payload?.sessions) ? listing.payload.sessions : []),
      ...(Array.isArray(listing.payload?.session) ? listing.payload.session : []),
    ];
    const exact = candidates.filter((item: any) => String(item?.agenda || item?.description || "").includes(marker));
    if (exact.length !== 1) return null;
    const key = String(exact[0]?.meetingKey || exact[0]?.meeting_key || "");
    if (!key) return null;
    const current = await getMeetingByKey(key);
    return current.response.ok ? sessionFrom(current.payload) : null;
  }
  async function persistPrivate(job: any, session: any) {
    const key = String(session?.meetingKey || session?.meeting_key || "");
    const join = String(session?.joinLink || session?.join_link || "");
    const start = String(session?.startLink || session?.start_link || "");
    if (!key || !/^https:\/\//i.test(join) || !/^https:\/\//i.test(start)) {
      throw Object.assign(new Error("Zoho Meeting did not return meetingKey, joinLink and startLink."), { kind: "uncertain_create" });
    }
    const { error } = await service.rpc("service_upsert_meeting_provider_private_link", {
      p_meeting_id: job.meeting_id, p_external_meeting_id: key, p_join_url: join, p_host_url: start,
    });
    if (error) throw Object.assign(new Error(error.message), { kind: "persist" });
    return { key, join, start };
  }
  async function ensureMeeting(job: any, meeting: any) {
    const existing = await loadPrivateLink(job);
    if (existing?.external_meeting_id) {
      const current = await getMeetingByKey(String(existing.external_meeting_id));
      if (current.response.status === 404) {
        await finish(job, "dead_letter", "Stored Zoho meetingKey no longer exists. Automatic recreation is blocked to prevent duplicate provider meetings.");
        return null;
      }
      if (!current.response.ok) { await handleFailure(job, current.response, current.payload, "idempotent", "Zoho Meeting"); return null; }
      const update = await api(meetingBase, `/api/v2/${encodeURIComponent(String(connection.meeting_org_id))}/sessions/${encodeURIComponent(String(existing.external_meeting_id))}.json`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meetingBody(meeting)),
      }, true);
      if (!update.response.ok) { await handleFailure(job, update.response, update.payload, "idempotent", "Zoho Meeting"); return null; }
      const updated = sessionFrom(update.payload) || sessionFrom(current.payload);
      try { return await persistPrivate(job, { ...updated, meetingKey: existing.external_meeting_id, joinLink: updated?.joinLink || existing.join_url, startLink: updated?.startLink || existing.host_url }); }
      catch (error) { await finish(job, "retry", error instanceof Error ? error.message : "Private Zoho Meeting link persistence failed.", retryDelay(Number(job.attempts || 1))); return null; }
    }

    try {
      const recovered = await findExistingMeetingByMarker(meeting);
      if (recovered) return await persistPrivate(job, recovered);
    } catch {
      // Read-only preflight failure does not create anything; continue to the explicit create call.
    }

    let created;
    try {
      created = await api(meetingBase, `/api/v2/${encodeURIComponent(String(connection.meeting_org_id))}/sessions.json`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meetingBody(meeting)),
      }, true);
    } catch (error) {
      await quarantineCreate(job, "Zoho Meeting", error instanceof Error ? error.message : "Network failure");
      return null;
    }
    if (!created.response.ok) { await handleFailure(job, created.response, created.payload, "create", "Zoho Meeting"); return null; }
    try { return await persistPrivate(job, sessionFrom(created.payload)); }
    catch (error: any) {
      await quarantineCreate(job, "Zoho Meeting", error?.message || "Response could not be persisted");
      return null;
    }
  }

  function calendarEventData(meeting: any, eventUid?: string, etag?: string) {
    const data: any = {
      title: String(meeting.title || "ProFox Meeting"),
      dateandtime: { start: toBasicUtc(meeting.start_at), end: toBasicUtc(meeting.end_at), timezone: String(meeting.timezone || "UTC") },
      isallday: false, isprivate: false,
      description: `${String(meeting.description || "").trim()}${meeting.description ? "\n\n" : ""}${markerFor(String(meeting.id))}`,
      transparency: 0, conference: "none", notifyType: 1, allowForwarding: true,
    };
    if (validEmail(String(meeting.attendee_email || ""))) data.attendees = [{ email: String(meeting.attendee_email).trim().toLowerCase(), status: "NEEDS-ACTION", attendance: 1 }];
    if (eventUid) data.uid = eventUid;
    if (etag) data.etag = etag;
    return data;
  }
  async function getCalendarEvent(eventId: string) {
    const cal = encodeURIComponent(String(connection.calendar_id));
    return api(calendarBase, `/api/v1/calendars/${cal}/events/${encodeURIComponent(eventId)}`, { method: "GET" });
  }
  async function persistCalendar(job: any, event: any, operation: string, joinUrl: string) {
    const uid = String(event?.uid || "");
    if (!uid) throw new Error("Zoho Calendar returned no event UID.");
    const { error } = await service.rpc("service_upsert_zoho_event_link", {
      p_meeting_id: job.meeting_id, p_user_id: job.user_id, p_calendar_id: String(connection.calendar_id),
      p_event_id: uid, p_etag: String(event?.etag || ""), p_meeting_url: joinUrl, p_operation: operation,
    });
    if (error) throw new Error(error.message);
  }
  async function upsertCalendar(job: any, meeting: any, joinUrl: string) {
    const cal = encodeURIComponent(String(connection.calendar_id));
    const link = await loadCalendarLink(job);
    if (link?.external_event_id) {
      const current = await getCalendarEvent(String(link.external_event_id));
      if (current.response.status === 404) {
        await finish(job, "dead_letter", "Stored Zoho Calendar event ID no longer exists. Automatic recreation is blocked to prevent duplicate events.");
        return false;
      }
      if (!current.response.ok) return handleFailure(job, current.response, current.payload, "idempotent", "Zoho Calendar event");
      const existing = eventFrom(current.payload);
      const params = new URLSearchParams({ eventdata: JSON.stringify(calendarEventData(meeting, String(link.external_event_id), String(existing?.etag || link.etag || ""))) });
      const written = await api(calendarBase, `/api/v1/calendars/${cal}/events/${encodeURIComponent(String(link.external_event_id))}?${params.toString()}`, { method: "PUT" });
      if (!written.response.ok) return handleFailure(job, written.response, written.payload, "idempotent", "Zoho Calendar event");
      try { await persistCalendar(job, eventFrom(written.payload) || { uid: link.external_event_id, etag: link.etag }, "update", joinUrl); return true; }
      catch (error: any) { await finish(job, "retry", error?.message || "Zoho Calendar event persistence failed.", retryDelay(Number(job.attempts || 1))); return false; }
    }

    const params = new URLSearchParams({ eventdata: JSON.stringify(calendarEventData(meeting)) });
    let written;
    try { written = await api(calendarBase, `/api/v1/calendars/${cal}/events?${params.toString()}`, { method: "POST" }); }
    catch (error) { await quarantineCreate(job, "Zoho Calendar event", error instanceof Error ? error.message : "Network failure"); return false; }
    if (!written.response.ok) return handleFailure(job, written.response, written.payload, "create", "Zoho Calendar event");
    try { await persistCalendar(job, eventFrom(written.payload), "create", joinUrl); return true; }
    catch (error: any) { await quarantineCreate(job, "Zoho Calendar event", error?.message || "Response could not be persisted"); return false; }
  }

  async function deleteProviderObjects(job: any) {
    const privateLink = await loadPrivateLink(job);
    const calendarLink = await loadCalendarLink(job);
    if (privateLink?.external_meeting_id) {
      let deleted;
      try { deleted = await api(meetingBase, `/api/v2/${encodeURIComponent(String(connection.meeting_org_id))}/sessions/${encodeURIComponent(String(privateLink.external_meeting_id))}.json`, { method: "DELETE" }, true); }
      catch (error) { await finish(job, "retry", error instanceof Error ? error.message : "Zoho Meeting delete network error.", retryDelay(Number(job.attempts || 1))); return false; }
      if (!deleted.response.ok && deleted.response.status !== 404) return handleFailure(job, deleted.response, deleted.payload, "idempotent", "Zoho Meeting delete");
    }
    if (calendarLink?.external_event_id) {
      let deleted;
      try { deleted = await api(calendarBase, `/api/v1/calendars/${encodeURIComponent(String(connection.calendar_id))}/events/${encodeURIComponent(String(calendarLink.external_event_id))}`, { method: "DELETE", headers: calendarLink.etag ? { etag: String(calendarLink.etag) } : {} }); }
      catch (error) { await finish(job, "retry", error instanceof Error ? error.message : "Zoho Calendar delete network error.", retryDelay(Number(job.attempts || 1))); return false; }
      if (!deleted.response.ok && deleted.response.status !== 404) return handleFailure(job, deleted.response, deleted.payload, "idempotent", "Zoho Calendar delete");
      const { error } = await service.rpc("service_delete_zoho_event_link", { p_meeting_id: job.meeting_id, p_user_id: job.user_id });
      if (error) { await finish(job, "retry", error.message, retryDelay(Number(job.attempts || 1))); return false; }
    } else if (privateLink) {
      const { error } = await service.rpc("service_delete_meeting_provider_private_link", { p_meeting_id: job.meeting_id });
      if (error) { await finish(job, "retry", error.message, retryDelay(Number(job.attempts || 1))); return false; }
    }
    await finish(job, "succeeded");
    await markHealthy();
    return true;
  }

  for (const job of (jobs || [])) {
    try {
      if (!job.meeting_id || !(await ensureStillZoho(job))) {
        await finish(job, "skipped", "Meeting is not routed to Zoho.");
        results.push({ id: job.id, status: "skipped" });
        continue;
      }
      const meeting = await loadMeeting(job);
      if (job.job_type === "delete_event" || meeting.status === "Cancelled") {
        const ok = await deleteProviderObjects(job);
        results.push({ id: job.id, status: ok ? "succeeded" : "deferred", operation: "delete" });
        continue;
      }
      if (!["Scheduled", "Rescheduled"].includes(String(meeting.status))) {
        await finish(job, "skipped", `Meeting status ${meeting.status} is not syncable.`);
        results.push({ id: job.id, status: "skipped" });
        continue;
      }
      const meetingLink = await ensureMeeting(job, meeting);
      if (!meetingLink) { results.push({ id: job.id, status: "deferred", operation: "meeting" }); continue; }
      const calendarOk = await upsertCalendar(job, meeting, meetingLink.join);
      if (!calendarOk) { results.push({ id: job.id, status: "deferred", operation: "calendar" }); continue; }
      await finish(job, "succeeded");
      await markHealthy();
      results.push({ id: job.id, status: "succeeded", operation: "upsert" });
    } catch (error: any) {
      const message = error?.message || "Zoho synchronization failed.";
      if (error?.kind === "network") await finish(job, "retry", message, retryDelay(Number(job.attempts || 1)));
      else if (error?.kind === "uncertain_create") await finish(job, "dead_letter", message);
      else await finish(job, "failed", message);
      results.push({ id: job.id, status: "error", error: message });
    }
  }

  return json({ processed: results.length, results, centralZohoReady: true, manual });
});
