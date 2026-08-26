import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function page(data: any) {
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  const instructions = Array.isArray(data?.instructions) ? data.instructions : [];
  const markets = Array.isArray(data?.focusMarkets) ? data.focusMarkets : [];
  const targetCustomers = Array.isArray(data?.targetCustomers) ? data.targetCustomers.slice(0, 8) : [];
  const working = data?.workingArrangement && typeof data.workingArrangement === "object" ? data.workingArrangement : {};
  const statusClass = (status: string) => status === "Current" ? "current" : status === "Completed" ? "complete" : "upcoming";
  const stepsHtml = steps.map((step: any) => `
    <article class="step ${statusClass(String(step?.status || "Upcoming"))}">
      <div class="step-head"><span class="number">${escapeHtml(step?.number)}</span><div><div class="status">${escapeHtml(step?.status)}</div><h3>${escapeHtml(step?.title)}</h3></div></div>
      <p>${escapeHtml(step?.description)}</p>
    </article>`).join("");
  const instructionsHtml = instructions.map((item: unknown, index: number) => `<li><strong>${index + 1}.</strong><span>${escapeHtml(item)}</span></li>`).join("");
  const marketsHtml = markets.map((item: unknown) => `<span class="chip">${escapeHtml(item)}</span>`).join("");
  const customersHtml = targetCustomers.map((item: unknown) => `<span class="chip muted">${escapeHtml(item)}</span>`).join("");
  const due = data?.dueAt ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(data.dueAt)) : "Contact Recruitment";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><title>ProFox Sales Assessment Guide</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f4f5fb;color:#0f172a;font-family:Inter,Arial,sans-serif}.top{background:#fff;border-bottom:1px solid #e2e8f0;padding:20px}.topin,.wrap{max-width:1040px;margin:auto}.brand{font-weight:900;color:#000080;font-size:20px}.sub{font-size:12px;color:#64748b;margin-top:3px;text-transform:uppercase;letter-spacing:.12em;font-weight:800}.wrap{padding:28px 18px 56px}.card{background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:26px;box-shadow:0 1px 2px rgba(15,23,42,.04);margin-bottom:18px}.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#000080;font-weight:900}.hero h1{font-size:32px;line-height:1.12;margin:8px 0 12px}.hero p,.card p{color:#475569;line-height:1.65}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:20px}.meta{padding:14px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc}.label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#64748b;font-weight:800}.value{font-size:14px;font-weight:800;margin-top:5px}.steps{display:grid;gap:12px}.step{border:1px solid #e2e8f0;border-radius:16px;padding:18px}.step.current{border-color:#000080;background:#f5f6ff}.step.complete{border-color:#bbf7d0;background:#f0fdf4}.step-head{display:flex;gap:12px;align-items:center}.number{display:flex;width:34px;height:34px;border-radius:50%;align-items:center;justify-content:center;background:#eef2ff;color:#000080;font-weight:900}.complete .number{background:#dcfce7;color:#166534}.status{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#64748b;font-weight:900}.step h3{margin:3px 0 0;font-size:17px}.step p{margin:10px 0 0;font-size:14px}.notice{border-left:4px solid #000080;background:#f8fafc;padding:16px 18px;border-radius:10px;color:#334155;line-height:1.6}.chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.chip{padding:7px 10px;border-radius:999px;background:#eef2ff;color:#000080;font-size:12px;font-weight:800}.chip.muted{background:#f1f5f9;color:#475569}ul{list-style:none;padding:0;margin:14px 0 0}li{display:flex;gap:9px;padding:8px 0;color:#475569;line-height:1.55;font-size:14px}li strong{color:#000080}.footer{text-align:center;color:#64748b;font-size:12px;line-height:1.7;margin-top:24px}.support{color:#000080;font-weight:800;text-decoration:none}@media(max-width:720px){.grid{grid-template-columns:1fr}.hero h1{font-size:27px}.card{padding:20px}}
  </style></head><body><header class="top"><div class="topin"><div class="brand">ProFox Web Designer</div><div class="sub">Recruitment - Secure Assessment Guide</div></div></header><main class="wrap">
  <section class="card hero"><div class="eyebrow">Assessment onboarding</div><h1>${escapeHtml(data?.title || "ProFox Sales Assessment Guide")}</h1><p>Hi ${escapeHtml(data?.candidateName || "Candidate")}. ${escapeHtml(data?.description || "Review your assessment journey and next steps.")}</p><div class="grid"><div class="meta"><div class="label">Application</div><div class="value">${escapeHtml(data?.applicationReference || "ProFox candidate")}</div></div><div class="meta"><div class="label">Current phase</div><div class="value">${escapeHtml(data?.currentStageLabel || "Assessment Onboarding")}</div></div><div class="meta"><div class="label">Guide access</div><div class="value">Until ${escapeHtml(due)}</div></div></div></section>
  <section class="card"><div class="eyebrow">Your selection journey</div><h2>Three practical assessment steps</h2><div class="steps">${stepsHtml}</div></section>
  <section class="card"><div class="eyebrow">Before you begin</div><h2>Role and assessment context</h2><p>${escapeHtml(data?.roleOverview || "This role is focused on proactive prospecting, professional sales conversations, follow-up discipline and accurate sales records.")}</p>${marketsHtml ? `<div class="label" style="margin-top:16px">Focus markets</div><div class="chips">${marketsHtml}</div>` : ""}${customersHtml ? `<div class="label" style="margin-top:16px">Typical target customers</div><div class="chips">${customersHtml}</div>` : ""}<div class="grid" style="grid-template-columns:repeat(2,1fr)"><div class="meta"><div class="label">Working days</div><div class="value">${escapeHtml(working?.workingDays || "Monday to Friday")}</div></div><div class="meta"><div class="label">Expected availability</div><div class="value">${escapeHtml(working?.expectedHoursPerWeek || 35)} hours per week</div></div></div></section>
  <section class="card"><div class="eyebrow">Rules and next actions</div><h2>Follow these instructions throughout assessment</h2><ul>${instructionsHtml}</ul></section>
  <section class="card"><div class="notice"><strong>Sales Academy access rule</strong><br>${escapeHtml(data?.academyRule || "Full Sales Academy access is provided only after selection and agreement verification.")}</div></section>
  <div class="footer">Need help? Contact <a class="support" href="mailto:${escapeHtml(data?.supportEmail || "admin@profoxwebdesigner.com")}">${escapeHtml(data?.supportEmail || "admin@profoxwebdesigner.com")}</a><br>ProFox Recruitment Team - ProFox Web Designer</div>
  </main></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return json("Method not allowed", 405);
  const token = new URL(req.url).searchParams.get("token")?.trim() || "";
  if (token.length < 40 || token.length > 200) return json("This assessment access link is invalid or incomplete.", 400);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json("Assessment access is temporarily unavailable.", 503);
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await service.rpc("public_open_sales_assessment_hub", { p_token: token });
  if (error || !data) {
    const message = error?.message || "This assessment access is no longer available.";
    return new Response(`<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f5fb;padding:40px;color:#0f172a"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #fecaca;border-radius:16px;padding:28px"><h1 style="font-size:22px">Assessment access unavailable</h1><p style="line-height:1.6;color:#475569">${escapeHtml(message)}</p><p style="color:#64748b">Contact the ProFox Recruitment Team if you believe you should still have access.</p></div></body></html>`, { status: 410, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow, noarchive", "referrer-policy": "no-referrer" } });
  }
  return new Response(page(data), { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, private", "x-robots-tag": "noindex, nofollow, noarchive", "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
});