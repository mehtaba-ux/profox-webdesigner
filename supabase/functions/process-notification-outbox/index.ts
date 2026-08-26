import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-profox-cron-token",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
  for (let i = 0; i < av.length; i += 1) diff |= av[i] ^ bv[i];
  return diff === 0;
}

function safeTimeZone(value: unknown, fallback = "UTC") {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return fallback;
  }
}

function formatMeetingTime(iso: unknown, timeZone: unknown) {
  if (typeof iso !== "string" || !iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const zone = safeTimeZone(timeZone);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function enrichPayload(raw: Record<string, unknown>) {
  const payload = { ...raw } as Record<string, unknown>;
  payload.meetingTimeVisitor = formatMeetingTime(payload.startAt, payload.visitorTimezone);
  payload.meetingTimeSeller = formatMeetingTime(payload.startAt, payload.sellerTimezone);
  return payload;
}

async function enrichSecureRecruitmentTaskPayload(
  service: ReturnType<typeof createClient>,
  raw: Record<string, unknown>,
) {
  const taskInstanceId = String(raw.taskInstanceId || "").trim();
  if (!taskInstanceId) return raw;

  const { data, error } = await service.rpc("service_prepare_recruitment_task_delivery", {
    p_task_id: taskInstanceId,
  });
  if (error) throw new Error(`Secure recruitment task link preparation failed: ${error.message}`);
  const taskUrl = String(data?.taskUrl || "").trim();
  if (!taskUrl) throw new Error("Secure recruitment task link preparation returned no task URL.");

  // The raw task token exists only in this in-memory delivery payload. The
  // notification outbox stores taskInstanceId, while Postgres stores only the
  // SHA-256 token hash used by the public task endpoint.
  return { ...raw, ...(data || {}) } as Record<string, unknown>;
}

function render(template: string, payload: Record<string, unknown>) {
  return String(template || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
    const value = payload[key];
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(template: string, payload: Record<string, unknown>) {
  return String(template || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
    const value = payload[key];
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return escapeHtml(JSON.stringify(value));
    return escapeHtml(value);
  });
}

function safeDisplayName(value: unknown, fallback = "ProFox") {
  const candidate = String(value || "")
    .replace(/[\r\n<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return candidate || fallback;
}

function safeEmail(value: unknown) {
  const candidate = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : "";
}

function emailDomain(value: unknown) {
  const email = safeEmail(value);
  return email ? email.split("@")[1] || "" : "";
}

function customerCopyHasDisallowedSymbols(value: string) {
  return /[\u2014\u200D\u20E3\uFE0F\u2300-\u23FF\u2600-\u27BF\u{1F000}-\u{1FAFF}]/u.test(value);
}

function resolveDeliveryOverrides(config: any, payload: Record<string, unknown>) {
  const configuredFromName = safeDisplayName(config?.fromName, "ProFox");
  const fromEmail = safeEmail(config?.fromEmail);
  const fromDomain = emailDomain(fromEmail);
  let fromName = configuredFromName;
  let replyTo = safeEmail(config?.replyTo);

  if (payload.communicationAudience === "customer") {
    fromName = safeDisplayName(payload.humanSenderName, configuredFromName);
    const requestedReplyTo = safeEmail(payload.replyToEmail);
    if (requestedReplyTo && fromDomain && emailDomain(requestedReplyTo) === fromDomain) {
      replyTo = requestedReplyTo;
    } else if (!replyTo || (fromDomain && emailDomain(replyTo) !== fromDomain)) {
      replyTo = fromEmail;
    }
  }

  return { fromName, replyTo };
}

async function sendResend(
  config: any,
  to: string,
  subject: string,
  body: string,
  html: string,
  overrides: { fromName: string; replyTo: string },
) {
  const fromEmail = String(config.fromEmail || "").trim();
  const payload: Record<string, unknown> = {
    from: `${overrides.fromName} <${fromEmail}>`,
    to: [to],
    subject,
    text: body,
  };
  if (html) payload.html = html;
  if (overrides.replyTo) payload.reply_to = overrides.replyTo;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let parsed: any = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = {}; }
  if (!response.ok) throw new Error(`Resend ${response.status}: ${text.slice(0, 1200)}`);
  return String(parsed.id || "");
}

async function sendBrevo(
  config: any,
  to: string,
  subject: string,
  body: string,
  html: string,
  overrides: { fromName: string; replyTo: string },
) {
  const payload: Record<string, unknown> = {
    sender: { name: overrides.fromName, email: String(config.fromEmail || "") },
    to: [{ email: to }],
    subject,
    textContent: body,
  };
  if (html) payload.htmlContent = html;
  if (overrides.replyTo) payload.replyTo = { email: overrides.replyTo };
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": String(config.apiKey || ""),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let parsed: any = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = {}; }
  if (!response.ok) throw new Error(`Brevo ${response.status}: ${text.slice(0, 1200)}`);
  return String(parsed.messageId || "");
}

async function provisionSelectedContentWriters(
  service: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  cronToken: string,
) {
  const { data: candidates, error } = await service.rpc("service_get_content_writer_invite_candidates");
  if (error) {
    console.error("Content Writer provisioning discovery failed", error.message);
    return { discovered: 0, provisioned: 0, failed: 1 };
  }

  let provisioned = 0;
  let failed = 0;
  for (const candidate of candidates || []) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/recruitment-account-invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": serviceRoleKey,
          "x-profox-cron-token": cronToken,
        },
        body: JSON.stringify({ applicantId: candidate.applicant_id }),
      });
      const text = await response.text();
      let payload: any = {};
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
      if (!response.ok || payload?.ok !== true) {
        throw new Error(String(payload?.error || `Account provisioning returned HTTP ${response.status}`));
      }
      provisioned += 1;
    } catch (inviteError) {
      failed += 1;
      console.error(
        "Content Writer account provisioning failed",
        candidate?.applicant_id,
        inviteError instanceof Error ? inviteError.message : "Unknown provisioning error",
      );
    }
  }
  return { discovered: (candidates || []).length, provisioned, failed };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: "Server configuration unavailable" }, 500);

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const requestToken = req.headers.get("x-profox-cron-token") || "";
  const { data: expectedToken, error: tokenError } = await service.rpc("service_get_notification_cron_secret");
  if (tokenError || !(await secureEquals(requestToken, String(expectedToken || "")))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { error: automationError } = await service.rpc("queue_due_sales_automations");
  if (automationError) console.error("Sales automation queue error", automationError.message);

  const { data: config, error: configError } = await service.rpc("service_get_notification_delivery_config");
  if (configError) return jsonResponse({ error: "Unable to load delivery configuration" }, 500);

  const emailEnabled = config?.emailEnabled === true;
  const provider = String(config?.emailProvider || "disabled").toLowerCase();
  const apiKey = String(config?.apiKey || "");
  const fromEmail = String(config?.fromEmail || "");

  if (!emailEnabled || provider === "disabled") {
    await service.rpc("service_suppress_due_notifications_when_disabled");
    return jsonResponse({
      ok: true,
      delivery: "disabled",
      automationQueued: !automationError,
      contentProvisioning: { skipped: true, reason: "email_delivery_disabled" },
    });
  }
  if (!apiKey || !fromEmail || !["resend", "brevo"].includes(provider)) {
    return jsonResponse({ error: "Email provider is enabled but not fully configured" }, 503);
  }

  const contentProvisioning = await provisionSelectedContentWriters(service, supabaseUrl, serviceRoleKey, requestToken);

  const { data: batch, error: claimError } = await service.rpc("service_claim_notification_batch", { p_limit: 25 });
  if (claimError) return jsonResponse({ error: "Unable to claim notification batch" }, 500);

  let sent = 0;
  let failed = 0;
  for (const row of batch || []) {
    try {
      let recipientEmail = String(row.recipient_email || "").trim().toLowerCase();
      if (!recipientEmail && row.recipient_user_id) {
        const { data: profile } = await service
          .from("user_profiles")
          .select("email")
          .eq("id", row.recipient_user_id)
          .maybeSingle();
        recipientEmail = String(profile?.email || "").trim().toLowerCase();
      }
      if (!recipientEmail) throw new Error("Notification has no deliverable email address.");

      let payload = enrichPayload((row.payload || {}) as Record<string, unknown>);
      payload = await enrichSecureRecruitmentTaskPayload(service, payload);
      const subject = render(String(row.subject_template || ""), payload).slice(0, 500);
      const body = render(String(row.body_template || ""), payload).slice(0, 20000);
      const html = row.html_template ? renderHtml(String(row.html_template), payload).slice(0, 100000) : "";
      if (!subject || !body) throw new Error("Notification template rendered empty content.");

      if (payload.communicationAudience === "customer") {
        if (customerCopyHasDisallowedSymbols(subject) || customerCopyHasDisallowedSymbols(body)) {
          throw new Error("Customer email blocked by ProFox copy standard: emojis and em dashes are not allowed.");
        }
      }

      const overrides = resolveDeliveryOverrides(config, payload);
      const messageId = provider === "resend"
        ? await sendResend(config, recipientEmail, subject, body, html, overrides)
        : await sendBrevo(config, recipientEmail, subject, body, html, overrides);

      await service.rpc("service_complete_notification", {
        p_id: row.id,
        p_success: true,
        p_provider_message_id: messageId,
        p_error: "",
      });
      sent += 1;
    } catch (deliveryError) {
      const message = deliveryError instanceof Error ? deliveryError.message : "Unknown delivery error";
      console.error("Notification delivery failed", row.id, message);
      await service.rpc("service_complete_notification", {
        p_id: row.id,
        p_success: false,
        p_provider_message_id: "",
        p_error: message,
      });
      failed += 1;
    }
  }

  return jsonResponse({
    ok: true,
    provider,
    claimed: (batch || []).length,
    sent,
    failed,
    automationQueued: !automationError,
    contentProvisioning,
  });
});
