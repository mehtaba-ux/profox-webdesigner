import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
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

const USER_MAIL_SCOPES = ["ZohoMail.accounts.READ", "ZohoMail.messages.CREATE", "ZohoMail.messages.READ", "ZohoMail.folders.READ"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_EMAIL_ATTACHMENT_TOTAL = 10 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "video/quicktime", "video/mpeg",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv",
]);

function safeDetail(payload: any, fallback: string) {
  return String(payload?.status?.description || payload?.data?.errorCode || payload?.error_description || payload?.error || payload?.message || fallback).slice(0, 500);
}
function providerMessageId(payload: any) {
  return String(payload?.data?.messageId || payload?.data?.messageID || payload?.data?.id || payload?.messageId || "");
}
function payloadRows(payload: any): any[] {
  return Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
}
async function tokenFromRefresh(base: string, input: { clientId: string; clientSecret: string; refreshToken: string }) {
  const response = await fetch(`${base}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
    }),
  });
  const payload: any = await response.json().catch(() => ({}));
  return { response, payload };
}
function normalizedAttachmentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item: any) => String(item?.id || item || "").trim()).filter(id => UUID_RE.test(id)))];
}
function sameIds(a: string[], b: string[]) {
  return [...a].sort().join(",") === [...b].sort().join(",");
}
function safeFileName(value: unknown) {
  return String(value || "attachment").replace(/[\r\n"\\/]/g, "-").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180) || "attachment";
}
function inferContentType(fileName: string, headerValue: string | null) {
  const header = String(headerValue || "").split(";")[0].trim().toLowerCase();
  if (ALLOWED_TYPES.has(header)) return header;
  const lower = fileName.toLowerCase();
  const byExtension: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mpeg": "video/mpeg", ".mpg": "video/mpeg",
    ".pdf": "application/pdf", ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain", ".csv": "text/csv",
  };
  const extension = Object.keys(byExtension).find(ext => lower.endsWith(ext));
  return extension ? byExtension[extension] : "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server configuration unavailable" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Authentication required" }, 401);
  const userId = String(userData.user.id);

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const action = String(body?.action || "");

  const getRuntime = async () => {
    const { data: runtime, error } = await service.rpc("service_get_zoho_user_mail_send_credentials", { p_user_id: userId });
    if (error) throw new Error(error.message || "Professional Zoho Mail authorization is unavailable.");
    const dc = String(runtime?.dataCenter || "");
    const accountBase = accountsHost(dc);
    const mailBase = mailHost(dc);
    const clientId = String(runtime?.clientId || "");
    const clientSecret = String(runtime?.clientSecret || "");
    const refreshToken = String(runtime?.refreshToken || "");
    const accountId = String(runtime?.accountId || "");
    const workEmail = String(runtime?.workEmail || "").trim().toLowerCase();
    if (!accountBase || !mailBase || !clientId || !clientSecret || !refreshToken || !accountId || !workEmail) {
      throw new Error("Professional Zoho Mail runtime identity is incomplete.");
    }
    const refreshed = await tokenFromRefresh(accountBase, { clientId, clientSecret, refreshToken });
    if (!refreshed.response.ok || !refreshed.payload?.access_token) {
      const detail = safeDetail(refreshed.payload, "Zoho Mail authorization could not be refreshed.");
      const reconnect = refreshed.response.status === 401 || /invalid[_ ]?grant|invalid[_ ]?token|unauthor/i.test(detail);
      const error: any = new Error(reconnect ? "Reconnect your professional Zoho Mail permission, then try again." : detail);
      error.reconnectRequired = reconnect;
      error.providerStatus = refreshed.response.status;
      throw error;
    }
    return { accountBase, mailBase, accountId, workEmail, accessToken: String(refreshed.payload.access_token) };
  };

  const getBridge = async () => {
    const [{ data: secret, error: secretError }, { data: cfg, error: cfgError }] = await Promise.all([
      service.rpc("service_get_communication_attachment_ingest_secret"),
      service.from("system_configuration").select("config_value").eq("config_key", "public_app_base_url").maybeSingle(),
    ]);
    const baseUrl = String(cfg?.config_value?.url || "").replace(/\/+$/g, "");
    if (secretError || cfgError || !secret || !/^https:\/\//i.test(baseUrl)) throw new Error("Private attachment storage bridge is not configured.");
    return { secret: String(secret), baseUrl };
  };

  if (action === "send") {
    const leadId = String(body?.leadId || "").trim();
    const subject = String(body?.subject || "");
    const messageBody = String(body?.body || "");
    const idempotencyKey = String(body?.idempotencyKey || "").trim();
    const requestedAttachmentIds = normalizedAttachmentIds(body?.attachments);
    if (!leadId || !idempotencyKey) return json({ error: "Lead and email request identifiers are required." }, 400);
    if (requestedAttachmentIds.length < 1 || requestedAttachmentIds.length > 5) return json({ error: "Professional Email requires between 1 and 5 valid attachment records." }, 400);

    const { data: prepared, error: prepareError } = await userClient.rpc("crm_prepare_professional_email_send", {
      p_lead_id: leadId,
      p_subject: subject,
      p_body: messageBody,
      p_idempotency_key: idempotencyKey,
    });
    if (prepareError) return json({ error: prepareError.message || "Professional email send could not be prepared." }, 400);
    const requestId = String(prepared?.requestId || "");
    if (!UUID_RE.test(requestId)) return json({ error: "Professional email send request was not created." }, 500);
    if (String(prepared?.status) === "provider_accepted") return json({ providerAccepted: true, requestId, providerMessageId: "", sender: String(prepared?.sender || ""), recipient: String(prepared?.recipient || "") });
    if (String(prepared?.status) === "failed") return json({ error: "This email request has already failed. Compose and send it again to create a new request." }, 409);

    const { data: requestRow, error: requestError } = await service.from("professional_email_send_requests")
      .select("id,user_id,sender_email,recipient_email,subject,message_body,status,attachment_ids")
      .eq("id", requestId).eq("user_id", userId).maybeSingle();
    if (requestError || !requestRow || String(requestRow.status) !== "pending") return json({ error: "Professional email send request could not be loaded safely." }, 500);

    const alreadyBound = Array.isArray(requestRow.attachment_ids) ? requestRow.attachment_ids.map((id: unknown) => String(id)) : [];
    if (alreadyBound.length && !sameIds(alreadyBound, requestedAttachmentIds)) return json({ error: "This pending email request is already bound to a different attachment set." }, 409);
    if (!alreadyBound.length) {
      const { error: bindError } = await userClient.rpc("communication_attachment_bind_email_request", { p_request_id: requestId, p_attachment_ids: requestedAttachmentIds });
      if (bindError) return json({ error: bindError.message || "Professional email attachments could not be bound safely." }, 400);
    }

    const { data: manifest, error: manifestError } = await userClient.rpc("communication_attachment_email_send_manifest", { p_request_id: requestId });
    const attachmentManifest = Array.isArray(manifest) ? manifest : [];
    if (manifestError || attachmentManifest.length !== requestedAttachmentIds.length) return json({ error: manifestError?.message || "Professional email attachment manifest is incomplete." }, 400);
    const totalBytes = attachmentManifest.reduce((sum: number, item: any) => sum + Number(item?.sizeBytes || 0), 0);
    if (totalBytes < 1 || totalBytes > MAX_EMAIL_ATTACHMENT_TOTAL) return json({ error: "Professional Email attachments must total 10 MB or less." }, 400);

    try {
      const runtime = await getRuntime();
      if (runtime.workEmail !== String(requestRow.sender_email || "").trim().toLowerCase()) throw new Error("Professional Zoho Mail runtime identity does not match this send request.");
      const bridge = await getBridge();
      const providerAttachments: Array<{ storeName: string; attachmentPath: string; attachmentName: string }> = [];

      for (const attachment of attachmentManifest) {
        const attachmentId = String(attachment?.id || "");
        if (!UUID_RE.test(attachmentId)) throw new Error("Email attachment identifier is invalid.");
        const exportUrl = `${bridge.baseUrl}/api/communication-attachments/service-email-export/${encodeURIComponent(attachmentId)}?requestId=${encodeURIComponent(requestId)}`;
        const exportResponse = await fetch(exportUrl, { headers: { "X-ProFox-Attachment-Ingest-Token": bridge.secret, Accept: "application/octet-stream" }, cache: "no-store" });
        if (!exportResponse.ok) {
          const payload: any = await exportResponse.json().catch(() => ({}));
          throw new Error(String(payload?.error || `Private R2 attachment export failed (${exportResponse.status}).`).slice(0, 500));
        }
        const bytes = await exportResponse.arrayBuffer();
        if (bytes.byteLength !== Number(attachment?.sizeBytes || 0)) throw new Error("Email attachment size did not match the authorized R2 record.");

        const uploadUrl = new URL(`${runtime.mailBase}/api/accounts/${encodeURIComponent(runtime.accountId)}/messages/attachments`);
        uploadUrl.searchParams.set("fileName", safeFileName(attachment?.name));
        uploadUrl.searchParams.set("isInline", "false");
        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            Authorization: `Zoho-oauthtoken ${runtime.accessToken}`,
            Accept: "application/json",
            "Content-Type": "application/octet-stream",
          },
          body: bytes,
        });
        const uploadPayload: any = await uploadResponse.json().catch(() => ({}));
        const uploadStatus = Number(uploadPayload?.status?.code || uploadResponse.status);
        const uploaded = uploadPayload?.data;
        if (!uploadResponse.ok || uploadStatus < 200 || uploadStatus >= 300 || !uploaded?.storeName || !uploaded?.attachmentPath || !uploaded?.attachmentName) {
          throw new Error(safeDetail(uploadPayload, `Zoho Mail attachment upload failed (${uploadResponse.status}).`));
        }
        providerAttachments.push({
          storeName: String(uploaded.storeName),
          attachmentPath: String(uploaded.attachmentPath),
          attachmentName: String(uploaded.attachmentName),
        });
      }

      const sendResponse = await fetch(`${runtime.mailBase}/api/accounts/${encodeURIComponent(runtime.accountId)}/messages`, {
        method: "POST",
        headers: { Authorization: `Zoho-oauthtoken ${runtime.accessToken}`, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAddress: runtime.workEmail,
          toAddress: String(requestRow.recipient_email),
          subject: String(requestRow.subject),
          content: String(requestRow.message_body),
          mailFormat: "plaintext",
          attachments: providerAttachments,
        }),
      });
      const sendPayload: any = await sendResponse.json().catch(() => ({}));
      const statusCode = Number(sendPayload?.status?.code || sendResponse.status);
      const accepted = sendResponse.ok && statusCode >= 200 && statusCode < 300;
      if (!accepted) {
        const detail = safeDetail(sendPayload, `Zoho Mail rejected the attachment send request (${sendResponse.status}).`);
        const reconnect = sendResponse.status === 401 || /invalid[_ ]?token|oauth|unauthor/i.test(detail);
        await service.rpc("service_fail_professional_email_send", { p_request_id: requestId, p_error: detail, p_reconnect_required: reconnect, p_provider_response_code: String(statusCode || sendResponse.status) });
        return json({ error: reconnect ? "Reconnect your professional Zoho Mail permission, then try again." : detail, reconnectRequired: reconnect }, reconnect ? 401 : 502);
      }

      const messageId = providerMessageId(sendPayload);
      const { error: completeError } = await service.rpc("service_complete_professional_email_send", { p_request_id: requestId, p_provider_message_id: messageId, p_provider_response_code: String(statusCode) });
      if (completeError) return json({ error: "Zoho accepted the email, but ProFox could not finish the CRM audit record. Do not resend until an administrator reviews this request.", providerAccepted: true, requestId }, 500);
      return json({ providerAccepted: true, requestId, providerMessageId: messageId, sender: String(requestRow.sender_email), recipient: String(requestRow.recipient_email), attachmentCount: providerAttachments.length });
    } catch (error: any) {
      const detail = String(error?.message || "Professional email attachments could not be sent.").slice(0, 500);
      const reconnect = Boolean(error?.reconnectRequired);
      await service.rpc("service_fail_professional_email_send", { p_request_id: requestId, p_error: detail, p_reconnect_required: reconnect, p_provider_response_code: error?.providerStatus ? String(error.providerStatus) : null });
      return json({ error: detail, reconnectRequired: reconnect }, reconnect ? 401 : 502);
    }
  }

  if (action === "sync_inbox_attachments") {
    const { data: eligible, error: eligibleError } = await service.rpc("service_professional_mailbox_eligible", { p_user_id: userId });
    if (eligibleError || eligible !== true) return json({ error: "Professional email is available only to eligible active Sales and Management accounts." }, 403);
    const { data: connection, error: connectionError } = await service.from("zoho_user_mail_send_connections")
      .select("user_id,work_email,provider_account_id,scopes,status")
      .eq("user_id", userId).maybeSingle();
    if (connectionError || !connection || String(connection.status) !== "connected") return json({ error: "Connect your professional Zoho Mail permission before synchronizing attachments.", reconnectRequired: true }, 409);
    const scopes = new Set((Array.isArray(connection.scopes) ? connection.scopes : []).map((scope: unknown) => String(scope)));
    const missingScopes = USER_MAIL_SCOPES.filter(scope => !scopes.has(scope));
    if (missingScopes.length) return json({ error: "Reconnect professional email once to enable secure attachment synchronization.", reconnectRequired: true }, 409);

    try {
      const runtime = await getRuntime();
      if (runtime.workEmail !== String(connection.work_email || "").trim().toLowerCase() || runtime.accountId !== String(connection.provider_account_id || "")) {
        return json({ error: "Professional Zoho Mail runtime identity is incomplete.", reconnectRequired: true }, 409);
      }
      const bridge = await getBridge();
      const zohoHeaders = { Authorization: `Zoho-oauthtoken ${runtime.accessToken}`, Accept: "application/json" };
      const foldersResponse = await fetch(`${runtime.mailBase}/api/accounts/${encodeURIComponent(runtime.accountId)}/folders`, { headers: zohoHeaders });
      const foldersPayload: any = await foldersResponse.json().catch(() => ({}));
      if (!foldersResponse.ok) return json({ error: safeDetail(foldersPayload, `Zoho Mail folder lookup failed (${foldersResponse.status}).`) }, 502);
      const inboxFolder = payloadRows(foldersPayload).find((folder: any) => String(folder?.folderType || "").toLowerCase() === "inbox") || payloadRows(foldersPayload).find((folder: any) => String(folder?.folderName || "").toLowerCase() === "inbox");
      const inboxFolderId = String(inboxFolder?.folderId || "");
      if (!inboxFolderId) return json({ error: "Zoho Mail Inbox folder could not be identified safely." }, 502);

      const messageUrl = new URL(`${runtime.mailBase}/api/accounts/${encodeURIComponent(runtime.accountId)}/messages/view`);
      messageUrl.searchParams.set("folderId", inboxFolderId);
      messageUrl.searchParams.set("start", "1");
      messageUrl.searchParams.set("limit", "100");
      messageUrl.searchParams.set("sortBy", "date");
      messageUrl.searchParams.set("sortorder", "false");
      messageUrl.searchParams.set("includeto", "true");
      messageUrl.searchParams.set("includesent", "false");
      const listResponse = await fetch(messageUrl, { headers: zohoHeaders });
      const listPayload: any = await listResponse.json().catch(() => ({}));
      if (!listResponse.ok) return json({ error: safeDetail(listPayload, `Zoho Mail Inbox lookup failed (${listResponse.status}).`) }, 502);
      const providerMessages = payloadRows(listPayload);
      const providerMap = new Map(providerMessages.map((item: any) => [String(item?.messageId || ""), item]));
      const providerIds = [...providerMap.keys()].filter(Boolean);
      if (!providerIds.length) return json({ scannedMessages: 0, messagesWithAttachments: 0, imported: 0, skippedExisting: 0, skippedUnsupported: 0, failed: 0 });

      const existingMail = await service.from("client_email_messages")
        .select("id,conversation_id,provider_message_id")
        .eq("provider", "zoho").eq("direction", "inbound").eq("employee_user_id", userId)
        .in("provider_message_id", providerIds);
      if (existingMail.error) return json({ error: "Synchronized customer email records could not be loaded safely." }, 500);

      let messagesWithAttachments = 0;
      let imported = 0;
      let skippedExisting = 0;
      let skippedUnsupported = 0;
      let failed = 0;

      for (const emailRow of existingMail.data || []) {
        const providerItem: any = providerMap.get(String(emailRow.provider_message_id));
        if (!providerItem) continue;
        const folderId = String(providerItem?.folderId || inboxFolderId);
        const messageId = String(emailRow.provider_message_id);
        const infoResponse = await fetch(`${runtime.mailBase}/api/accounts/${encodeURIComponent(runtime.accountId)}/folders/${encodeURIComponent(folderId)}/messages/${encodeURIComponent(messageId)}/attachmentinfo?includeInline=false`, { headers: zohoHeaders });
        const infoPayload: any = await infoResponse.json().catch(() => ({}));
        if (!infoResponse.ok) { failed++; continue; }
        const attachmentInfo = Array.isArray(infoPayload?.data?.attachments) ? infoPayload.data.attachments : Array.isArray(infoPayload?.attachments) ? infoPayload.attachments : [];
        if (!attachmentInfo.length) continue;
        messagesWithAttachments++;

        const existing = await service.from("communication_attachments")
          .select("id,provider_metadata")
          .eq("email_message_id", emailRow.id).in("state", ["pending", "ready", "linked"]);
        if (existing.error) { failed++; continue; }
        const existingProviderIds = new Set((existing.data || []).map((row: any) => String(row?.provider_metadata?.providerAttachmentId || "")).filter(Boolean));

        for (const providerAttachment of attachmentInfo) {
          const providerAttachmentId = String(providerAttachment?.attachmentId || "").trim();
          const name = safeFileName(providerAttachment?.attachmentName || "attachment");
          const declaredSize = Number(providerAttachment?.attachmentSize || 0);
          if (!providerAttachmentId) { failed++; continue; }
          if (existingProviderIds.has(providerAttachmentId)) { skippedExisting++; continue; }
          if (declaredSize > MAX_ATTACHMENT_BYTES) { skippedUnsupported++; continue; }

          const contentResponse = await fetch(`${runtime.mailBase}/api/accounts/${encodeURIComponent(runtime.accountId)}/folders/${encodeURIComponent(folderId)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(providerAttachmentId)}`, {
            headers: { Authorization: `Zoho-oauthtoken ${runtime.accessToken}`, Accept: "application/octet-stream" },
          });
          if (!contentResponse.ok) { failed++; continue; }
          const bytes = await contentResponse.arrayBuffer();
          if (bytes.byteLength < 1 || bytes.byteLength > MAX_ATTACHMENT_BYTES) { skippedUnsupported++; continue; }
          const contentType = inferContentType(name, contentResponse.headers.get("Content-Type"));
          if (!contentType || !ALLOWED_TYPES.has(contentType)) { skippedUnsupported++; continue; }

          const form = new FormData();
          form.set("conversationId", String(emailRow.conversation_id));
          form.set("emailMessageId", String(emailRow.id));
          form.set("providerAttachmentId", providerAttachmentId);
          form.set("file", new File([bytes], name, { type: contentType }));
          const ingestResponse = await fetch(`${bridge.baseUrl}/api/communication-attachments/service-email-ingest`, {
            method: "POST",
            headers: { "X-ProFox-Attachment-Ingest-Token": bridge.secret },
            body: form,
          });
          if (!ingestResponse.ok) { failed++; continue; }
          imported++;
          existingProviderIds.add(providerAttachmentId);
        }

        const canonical = await service.from("communication_attachments")
          .select("id,original_name,content_type,size_bytes,channel")
          .eq("email_message_id", emailRow.id).eq("state", "linked").eq("customer_visible", true)
          .order("created_at", { ascending: true });
        if (canonical.error) { failed++; continue; }
        const attachmentJson = (canonical.data || []).map((row: any) => ({
          id: String(row.id),
          name: String(row.original_name || "Attachment"),
          contentType: String(row.content_type || "application/octet-stream"),
          sizeBytes: Number(row.size_bytes || 0),
          channel: String(row.channel || "email"),
        }));
        const update = await service.from("client_email_messages").update({ attachments: attachmentJson, updated_at: new Date().toISOString() }).eq("id", emailRow.id);
        if (update.error) failed++;
      }

      return json({
        scannedMessages: (existingMail.data || []).length,
        messagesWithAttachments,
        imported,
        skippedExisting,
        skippedUnsupported,
        failed,
      });
    } catch (error: any) {
      const detail = String(error?.message || "Professional inbox attachments could not be synchronized.").slice(0, 500);
      return json({ error: detail, reconnectRequired: Boolean(error?.reconnectRequired) }, error?.reconnectRequired ? 401 : 502);
    }
  }

  return json({ error: "Unsupported action" }, 400);
});
