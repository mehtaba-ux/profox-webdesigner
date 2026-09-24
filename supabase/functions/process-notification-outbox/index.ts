import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-profox-cron-token",
};

type ServiceClient = ReturnType<typeof createClient>;
type MailAttachment = { filename: string; content: string };

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

function formatAgreementTime(iso: unknown) {
  if (typeof iso !== "string" || !iso) return "Not recorded";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(date);
}

function enrichPayload(raw: Record<string, unknown>) {
  const payload = { ...raw } as Record<string, unknown>;
  payload.meetingTimeVisitor = formatMeetingTime(payload.startAt, payload.visitorTimezone);
  payload.meetingTimeSeller = formatMeetingTime(payload.startAt, payload.sellerTimezone);
  return payload;
}

async function enrichSecureRecruitmentTaskPayload(service: ServiceClient, raw: Record<string, unknown>) {
  const taskInstanceId = String(raw.taskInstanceId || "").trim();
  if (!taskInstanceId) return raw;
  const { data, error } = await service.rpc("service_prepare_recruitment_task_delivery", { p_task_id: taskInstanceId });
  if (error) throw new Error(`Secure recruitment task link preparation failed: ${error.message}`);
  const taskUrl = String(data?.taskUrl || "").trim();
  if (!taskUrl) throw new Error("Secure recruitment task link preparation returned no task URL.");
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
    .replace(/\"/g, "&quot;")
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
  const candidate = String(value || "").replace(/[\r\n<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
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
    if (requestedReplyTo && fromDomain && emailDomain(requestedReplyTo) === fromDomain) replyTo = requestedReplyTo;
    else if (!replyTo || (fromDomain && emailDomain(replyTo) !== fromDomain)) replyTo = fromEmail;
  }
  return { fromName, replyTo };
}

function pdfText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2022\u00B7]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/€/g, "EUR ")
    .replace(/£/g, "GBP ")
    .replace(/₹/g, "INR ")
    .replace(/[^\x20-\x7E\n\r\t]/g, "?")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  return btoa(binary);
}

function signaturePng(svg: unknown) {
  const match = String(svg || "").match(/<image[^>]+href=["']data:image\/png;base64,([^"']+)["']/i);
  if (!match?.[1]) return null;
  try {
    const binary = atob(match[1]);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function wrapPdfText(font: PDFFont, value: string, size: number, maxWidth: number) {
  const clean = pdfText(value);
  if (!clean) return [""];
  const lines: string[] = [];
  for (const paragraph of clean.split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) { current = candidate; continue; }
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) { current = word; continue; }
      let fragment = "";
      for (const char of word) {
        const next = fragment + char;
        if (font.widthOfTextAtSize(next, size) > maxWidth && fragment) { lines.push(fragment); fragment = char; }
        else fragment = next;
      }
      current = fragment;
    }
    if (current) lines.push(current);
    if (!words.length) lines.push("");
  }
  return lines.length ? lines : [""];
}

type PdfState = { pdf: PDFDocument; page: PDFPage; regular: PDFFont; bold: PDFFont; y: number; pageNo: number };
const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 46, CONTENT_W = PAGE_W - MARGIN * 2;
const NAVY = rgb(0, 0, 0.5), RED = rgb(0.9, 0.055, 0.055), INK = rgb(0.06, 0.09, 0.16), MUTED = rgb(0.36, 0.42, 0.5), LINE = rgb(0.88, 0.9, 0.93);

function addPdfPage(state: PdfState) {
  state.page = state.pdf.addPage([PAGE_W, PAGE_H]); state.pageNo += 1; state.y = PAGE_H - MARGIN;
  state.page.drawText("ProFox Web Designer", { x: MARGIN, y: state.y, size: 9, font: state.bold, color: NAVY });
  state.page.drawText(`Executed agreement - page ${state.pageNo}`, { x: PAGE_W - MARGIN - 135, y: state.y, size: 8, font: state.regular, color: MUTED });
  state.y -= 22; state.page.drawLine({ start: { x: MARGIN, y: state.y }, end: { x: PAGE_W - MARGIN, y: state.y }, thickness: 0.6, color: LINE }); state.y -= 18;
}
function ensurePdfSpace(state: PdfState, needed: number) { if (state.y - needed < MARGIN + 28) addPdfPage(state); }
function drawPdfLines(state: PdfState, value: unknown, options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number; indent?: number } = {}) {
  const size = options.size ?? 10, font = options.bold ? state.bold : state.regular, color = options.color ?? INK, gap = options.gap ?? 4, indent = options.indent ?? 0, lineHeight = size + gap;
  for (const line of wrapPdfText(font, pdfText(value), size, CONTENT_W - indent)) {
    ensurePdfSpace(state, lineHeight + 2); if (line) state.page.drawText(line, { x: MARGIN + indent, y: state.y, size, font, color }); state.y -= lineHeight;
  }
}
function drawPdfHeading(state: PdfState, value: unknown, level: 1 | 2 = 2) { const size = level === 1 ? 19 : 13; ensurePdfSpace(state, size + 18); state.y -= level === 1 ? 4 : 2; drawPdfLines(state, value, { size, bold: true, color: NAVY, gap: 5 }); state.y -= 4; }
function drawPdfLabelValue(state: PdfState, label: string, value: unknown) { ensurePdfSpace(state, 31); drawPdfLines(state, label.toUpperCase(), { size: 7, bold: true, color: MUTED, gap: 2 }); drawPdfLines(state, value || "Not recorded", { size: 9.5, bold: true, color: INK, gap: 4 }); state.y -= 4; }
function drawPdfRule(state: PdfState) { ensurePdfSpace(state, 14); state.page.drawLine({ start: { x: MARGIN, y: state.y }, end: { x: PAGE_W - MARGIN, y: state.y }, thickness: 0.7, color: LINE }); state.y -= 14; }

async function drawSignatureBlock(state: PdfState, label: string, signer: string, title: string, signedAt: unknown, signatureSvg: unknown, signatureHash: unknown) {
  ensurePdfSpace(state, 145); drawPdfLines(state, label, { size: 11, bold: true, color: NAVY, gap: 4 });
  const png = signaturePng(signatureSvg); if (!png) throw new Error(`${label} signature image could not be rendered into the executed PDF.`);
  const image = await state.pdf.embedPng(png), scale = Math.min(190 / image.width, 70 / image.height, 1), width = image.width * scale, height = image.height * scale;
  ensurePdfSpace(state, height + 68); state.page.drawRectangle({ x: MARGIN, y: state.y - height - 8, width: 210, height: height + 16, borderColor: LINE, borderWidth: 0.7, color: rgb(1, 1, 1) });
  state.page.drawImage(image, { x: MARGIN + 10, y: state.y - height, width, height }); state.y -= height + 20;
  drawPdfLines(state, signer, { size: 9.5, bold: true, gap: 3 }); if (title) drawPdfLines(state, title, { size: 8.5, color: MUTED, gap: 3 });
  drawPdfLines(state, `Signed: ${formatAgreementTime(signedAt)}`, { size: 8.5, color: MUTED, gap: 3 }); drawPdfLines(state, `Signature hash: ${signatureHash || "Not recorded"}`, { size: 7.5, color: MUTED, gap: 3 }); state.y -= 8;
}
function agreementRoleLabel(row: any) { if (row?.agreement_type === "uiux_designer") return "UI/UX Designer"; if (row?.agreement_type === "web_developer") return "Web Developer"; return "Sales Partner"; }

async function buildExecutedAgreementPdf(row: any) {
  const pdf = await PDFDocument.create(), regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const verifiedDate = row.verified_at ? new Date(row.verified_at) : new Date(); if (!Number.isNaN(verifiedDate.getTime())) { pdf.setCreationDate(verifiedDate); pdf.setModificationDate(verifiedDate); }
  pdf.setTitle(pdfText(row.template_snapshot?.title || `${agreementRoleLabel(row)} Agreement`)); pdf.setAuthor("ProFox Digital Solution / ProFox Web Designer"); pdf.setSubject(`Executed agreement ${pdfText(row.agreement_number)}`); pdf.setCreator("ProFox Agreement System"); pdf.setProducer("ProFox Agreement System");
  const firstPage = pdf.addPage([PAGE_W, PAGE_H]); const state: PdfState = { pdf, page: firstPage, regular, bold, y: PAGE_H - MARGIN, pageNo: 1 };
  state.page.drawText("PROFOX - EXECUTED AGREEMENT", { x: MARGIN, y: state.y, size: 9, font: bold, color: RED }); state.y -= 24;
  drawPdfHeading(state, row.template_snapshot?.title || `Independent ${agreementRoleLabel(row)} Agreement`, 1);
  if (row.template_snapshot?.subtitle) drawPdfLines(state, row.template_snapshot.subtitle, { size: 11, bold: true, color: MUTED, gap: 5 });
  if (row.template_snapshot?.introduction) { state.y -= 7; drawPdfLines(state, row.template_snapshot.introduction, { size: 10, color: INK, gap: 5 }); }
  state.y -= 10; drawPdfRule(state);
  const partner = row.partner_snapshot || {}, company = row.company_snapshot || {}, commercial = row.commercial_snapshot || {}, training = row.training_snapshot || {}, hiring = row.hiring_snapshot || {}, roleLabel = agreementRoleLabel(row);
  drawPdfHeading(state, "Agreement record", 2); drawPdfLabelValue(state, "Agreement ID", row.agreement_number); drawPdfLabelValue(state, "Agreement version", `Version ${row.template_version}.0`); drawPdfLabelValue(state, "Status", "Verified / Fully executed"); drawPdfLabelValue(state, "Company", `${company.legalEntity || "ProFox Digital Solution"} / ${company.businessName || "ProFox Web Designer"}`); drawPdfLabelValue(state, roleLabel, `${partner.fullName || "Candidate"}${partner.email ? ` / ${partner.email}` : ""}`); drawPdfLabelValue(state, "Department", row.target_department || hiring.department || "Not recorded"); if (hiring.applicationReference) drawPdfLabelValue(state, "Application reference", hiring.applicationReference); drawPdfRule(state);
  const sections = Array.isArray(row.template_snapshot?.sections) ? row.template_snapshot.sections : [];
  sections.forEach((section: any, index: number) => { drawPdfHeading(state, section?.title || section?.heading || `Section ${index + 1}`, 2); const body = String(section?.body || section?.text || "").trim(), paragraphs = body.split(/\n\s*\n/).filter(Boolean); if (!paragraphs.length) drawPdfLines(state, body, { size: 9.5, gap: 5 }); else paragraphs.forEach((paragraph: string) => { drawPdfLines(state, paragraph, { size: 9.5, gap: 5 }); state.y -= 4; }); state.y -= 5; drawPdfRule(state); });
  if (row.agreement_type === "sales_partner") {
    drawPdfHeading(state, "Commercial terms captured for this agreement", 2); drawPdfLines(state, "These values are from the frozen commercial snapshot captured when this agreement was issued.", { size: 9, color: MUTED, gap: 4 }); state.y -= 5;
    const products = Array.isArray(commercial.products) ? commercial.products : [], settings = commercial.settings || {};
    for (const product of products) { const currency = pdfText(product.currency || "USD"), price = Number(product.basePrice) > 0 ? `${currency} ${Number(product.basePrice).toLocaleString("en-US")}${product.priceMode === "starting_at" ? "+" : ""}` : "Approved quotation", rate = product.requiresAdminRate ? `${Number(product.minRatePercent || 0)}%-${Number(product.maxRatePercent || 0)}% approved per quotation` : `${Number(product.baseRatePercent || 0)}%`; drawPdfLines(state, `${product.productName || "Offer"}: ${price} | Base commission: ${rate}`, { size: 9, bold: true, gap: 4 }); }
    if (settings.self_generated_bonus_percent !== undefined) drawPdfLines(state, `Self-sourced and closed bonus: +${Number(settings.self_generated_bonus_percent || 0)} percentage points`, { size: 9, gap: 4 });
    if (settings.performance_bonus_percent !== undefined) drawPdfLines(state, `Performance bonus: +${Number(settings.performance_bonus_percent || 0)} percentage points when the configured rule is met.`, { size: 9, gap: 4 });
    if (settings.payout_schedule) drawPdfLines(state, `Payout schedule: ${settings.payout_schedule}`, { size: 9, gap: 4 }); drawPdfLines(state, "Payout trigger: eligible client funds must be received and verified by ProFox before commission is generated.", { size: 9, gap: 4 }); state.y -= 8; drawPdfRule(state);
  }
  drawPdfHeading(state, "Onboarding and access", 2); drawPdfLines(state, `Training track: ${training.track || "Assigned ProFox Academy"}`, { size: 9.5, gap: 4 }); drawPdfLines(state, training.productionAccess || "Production access remains locked until the required onboarding, final review and authorized activation are complete.", { size: 9.5, gap: 4 }); state.y -= 8; drawPdfRule(state);
  const acknowledgements = Array.isArray(row.template_snapshot?.acknowledgements) ? row.template_snapshot.acknowledgements : [];
  if (acknowledgements.length) { drawPdfHeading(state, "Candidate acknowledgements", 2); for (const item of acknowledgements) { const key = String(item?.key || ""), accepted = row.partner_acknowledgements && key ? row.partner_acknowledgements[key] === true : false; drawPdfLines(state, `${accepted ? "Accepted" : "Recorded"}: ${item?.text || item?.label || key}`, { size: 8.8, gap: 4 }); } state.y -= 8; drawPdfRule(state); }
  drawPdfHeading(state, "Signature record", 2); await drawSignatureBlock(state, `Candidate / ${roleLabel}`, row.partner_signer_name || partner.fullName || "Candidate", roleLabel, row.partner_signed_at, row.partner_signature_svg, row.partner_signature_hash); await drawSignatureBlock(state, "For ProFox", row.company_signer_name || "Authorized ProFox signatory", row.company_signer_title || "Authorized Signatory", row.company_signed_at, row.company_signature_svg, row.company_signature_hash);
  drawPdfRule(state); drawPdfHeading(state, "Digital execution record", 2); drawPdfLabelValue(state, "Verified", formatAgreementTime(row.verified_at)); drawPdfLines(state, `Document hash: ${row.document_hash}`, { size: 7.5, color: MUTED, gap: 3 }); drawPdfLines(state, `Execution hash: ${row.execution_hash}`, { size: 7.5, color: MUTED, gap: 3 }); state.y -= 8; drawPdfLines(state, "This PDF was generated from the immutable agreement snapshots and signature evidence stored for the executed agreement. Later template or pricing changes do not alter this record.", { size: 8.5, color: MUTED, gap: 4 });
  for (const page of pdf.getPages()) { page.drawLine({ start: { x: MARGIN, y: 30 }, end: { x: PAGE_W - MARGIN, y: 30 }, thickness: 0.5, color: LINE }); page.drawText(`Agreement ${pdfText(row.agreement_number)} | ProFox Digital Solution`, { x: MARGIN, y: 17, size: 7, font: regular, color: MUTED }); }
  return await pdf.save({ useObjectStreams: false });
}

async function prepareAgreementAttachments(service: ServiceClient, payload: Record<string, unknown>): Promise<MailAttachment[]> {
  const requested = payload.attachExecutedAgreement === true || String(payload.attachExecutedAgreement || "").toLowerCase() === "true"; if (!requested) return [];
  const agreementId = String(payload.agreementId || "").trim(); if (!agreementId) throw new Error("Executed agreement attachment requested without an agreement ID.");
  const { data: row, error } = await service.from("sales_partner_agreements").select("id,agreement_number,applicant_id,template_version,status,partner_snapshot,company_snapshot,commercial_snapshot,training_snapshot,hiring_snapshot,template_snapshot,document_hash,partner_signer_name,partner_signature_svg,partner_signature_hash,partner_acknowledgements,partner_signed_at,company_signer_name,company_signer_title,company_signature_svg,company_signature_hash,company_signed_at,execution_hash,verified_at,agreement_type,target_role,target_department").eq("id", agreementId).maybeSingle();
  if (error) throw new Error(`Executed agreement could not be loaded: ${error.message}`); if (!row) throw new Error("Executed agreement record was not found."); if (String(row.status) !== "Verified") throw new Error("Only a verified agreement can be attached as a final signed copy.");
  if (!row.partner_signed_at || !row.partner_signature_svg || !row.partner_signature_hash) throw new Error("Verified agreement is missing candidate signature evidence."); if (!row.company_signed_at || !row.company_signature_svg || !row.company_signature_hash) throw new Error("Verified agreement is missing ProFox signature evidence."); if (!row.document_hash || !row.execution_hash || !row.verified_at) throw new Error("Verified agreement is missing execution integrity evidence.");
  const applicantId = String(payload.applicantId || "").trim(); if (applicantId && applicantId !== String(row.applicant_id)) throw new Error("Agreement attachment does not belong to the notification applicant.");
  const pdfBytes = await buildExecutedAgreementPdf(row); if (pdfBytes.length > 10 * 1024 * 1024) throw new Error("Executed agreement PDF exceeds the safe email attachment limit.");
  const safeNumber = String(row.agreement_number || "agreement").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 100); return [{ filename: `ProFox-${safeNumber}-Fully-Signed.pdf`, content: bytesToBase64(pdfBytes) }];
}

async function sendResend(config: any, to: string, subject: string, body: string, html: string, overrides: { fromName: string; replyTo: string }, attachments: MailAttachment[] = []) {
  const fromEmail = String(config.fromEmail || "").trim(); const payload: Record<string, unknown> = { from: `${overrides.fromName} <${fromEmail}>`, to: [to], subject, text: body }; if (html) payload.html = html; if (overrides.replyTo) payload.reply_to = overrides.replyTo; if (attachments.length) payload.attachments = attachments.map((attachment) => ({ filename: attachment.filename, content: attachment.content }));
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const text = await response.text(); let parsed: any = {}; try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = {}; } if (!response.ok) throw new Error(`Resend ${response.status}: ${text.slice(0, 1200)}`); return String(parsed.id || "");
}
async function sendBrevo(config: any, to: string, subject: string, body: string, html: string, overrides: { fromName: string; replyTo: string }, attachments: MailAttachment[] = []) {
  const payload: Record<string, unknown> = { sender: { name: overrides.fromName, email: String(config.fromEmail || "") }, to: [{ email: to }], subject, textContent: body }; if (html) payload.htmlContent = html; if (overrides.replyTo) payload.replyTo = { email: overrides.replyTo }; if (attachments.length) payload.attachment = attachments.map((attachment) => ({ name: attachment.filename, content: attachment.content }));
  const response = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": String(config.apiKey || ""), "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) }); const text = await response.text(); let parsed: any = {}; try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = {}; } if (!response.ok) throw new Error(`Brevo ${response.status}: ${text.slice(0, 1200)}`); return String(parsed.messageId || "");
}

async function provisionSelectedContentWriters(service: ServiceClient, supabaseUrl: string, serviceRoleKey: string, cronToken: string) {
  const { data: candidates, error } = await service.rpc("service_get_content_writer_invite_candidates"); if (error) { console.error("Content Writer provisioning discovery failed", error.message); return { discovered: 0, provisioned: 0, failed: 1 }; }
  let provisioned = 0, failed = 0; for (const candidate of candidates || []) { try { const response = await fetch(`${supabaseUrl}/functions/v1/recruitment-account-invite`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceRoleKey}`, "apikey": serviceRoleKey, "x-profox-cron-token": cronToken }, body: JSON.stringify({ applicantId: candidate.applicant_id }) }); const text = await response.text(); let payload: any = {}; try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; } if (!response.ok || payload?.ok !== true) throw new Error(String(payload?.error || `Account provisioning returned HTTP ${response.status}`)); provisioned += 1; } catch (inviteError) { failed += 1; console.error("Content Writer account provisioning failed", candidate?.applicant_id, inviteError instanceof Error ? inviteError.message : "Unknown provisioning error"); } }
  return { discovered: (candidates || []).length, provisioned, failed };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders }); if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "", serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: "Server configuration unavailable" }, 500);
  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }), requestToken = req.headers.get("x-profox-cron-token") || ""; const { data: expectedToken, error: tokenError } = await service.rpc("service_get_notification_cron_secret"); if (tokenError || !(await secureEquals(requestToken, String(expectedToken || "")))) return jsonResponse({ error: "Unauthorized" }, 401);
  const { error: automationError } = await service.rpc("queue_due_sales_automations"); if (automationError) console.error("Sales automation queue error", automationError.message); const { data: config, error: configError } = await service.rpc("service_get_notification_delivery_config"); if (configError) return jsonResponse({ error: "Unable to load delivery configuration" }, 500);
  const emailEnabled = config?.emailEnabled === true, provider = String(config?.emailProvider || "disabled").toLowerCase(), apiKey = String(config?.apiKey || ""), fromEmail = String(config?.fromEmail || ""); if (!emailEnabled || provider === "disabled") { await service.rpc("service_suppress_due_notifications_when_disabled"); return jsonResponse({ ok: true, delivery: "disabled", automationQueued: !automationError, contentProvisioning: { skipped: true, reason: "email_delivery_disabled" } }); } if (!apiKey || !fromEmail || !["resend", "brevo"].includes(provider)) return jsonResponse({ error: "Email provider is enabled but not fully configured" }, 503);
  const contentProvisioning = await provisionSelectedContentWriters(service, supabaseUrl, serviceRoleKey, requestToken), { data: batch, error: claimError } = await service.rpc("service_claim_notification_batch", { p_limit: 25 }); if (claimError) return jsonResponse({ error: "Unable to claim notification batch" }, 500);
  let sent = 0, failed = 0; for (const row of batch || []) { try { let recipientEmail = String(row.recipient_email || "").trim().toLowerCase(); if (!recipientEmail && row.recipient_user_id) { const { data: profile } = await service.from("user_profiles").select("email").eq("id", row.recipient_user_id).maybeSingle(); recipientEmail = String(profile?.email || "").trim().toLowerCase(); } if (!recipientEmail) throw new Error("Notification has no deliverable email address."); let payload = enrichPayload((row.payload || {}) as Record<string, unknown>); payload = await enrichSecureRecruitmentTaskPayload(service, payload); const subject = render(String(row.subject_template || ""), payload).slice(0, 500), body = render(String(row.body_template || ""), payload).slice(0, 20000), html = row.html_template ? renderHtml(String(row.html_template), payload).slice(0, 100000) : ""; if (!subject || !body) throw new Error("Notification template rendered empty content."); if (payload.communicationAudience === "customer" && (customerCopyHasDisallowedSymbols(subject) || customerCopyHasDisallowedSymbols(body))) throw new Error("Customer email blocked by ProFox copy standard: emojis and em dashes are not allowed."); const attachments = await prepareAgreementAttachments(service, payload), overrides = resolveDeliveryOverrides(config, payload), messageId = provider === "resend" ? await sendResend(config, recipientEmail, subject, body, html, overrides, attachments) : await sendBrevo(config, recipientEmail, subject, body, html, overrides, attachments); await service.rpc("service_complete_notification", { p_id: row.id, p_success: true, p_provider_message_id: messageId, p_error: "" }); sent += 1; } catch (deliveryError) { const message = deliveryError instanceof Error ? deliveryError.message : "Unknown delivery error"; console.error("Notification delivery failed", row.id, message); await service.rpc("service_complete_notification", { p_id: row.id, p_success: false, p_provider_message_id: "", p_error: message }); failed += 1; } }
  return jsonResponse({ ok: true, provider, claimed: (batch || []).length, sent, failed, automationQueued: !automationError, contentProvisioning });
});
