import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
function json(headers: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function clean(value: unknown, max = 500) { return String(value ?? "").trim().slice(0, max); }
function minor(amount: unknown) { return Math.round(Number(amount || 0) * 100); }
function safeError(payload: any, fallback: string) {
  return clean(payload?.error?.description || payload?.error?.reason || payload?.message || fallback, 800);
}
function normalizedStatus(value: unknown) {
  const status = clean(value, 40).toLowerCase();
  return ["queued", "pending", "processing", "processed", "failed", "reversed", "cancelled"].includes(status) ? status : "pending";
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json(headers, { error: "Method not allowed" }, 405);
  if (origin && !allowedOrigins.has(origin)) return json(headers, { error: "Origin not allowed" }, 403);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json(headers, { error: "Server payout configuration unavailable." }, 500);
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const authorization = req.headers.get("authorization") || "";
  const jwt = authorization.replace(/^Bearer\s+/i, "");
  if (!jwt) return json(headers, { error: "Authentication required" }, 401);
  const { data: authData, error: authError } = await service.auth.getUser(jwt);
  const user = authData?.user;
  if (authError || !user) return json(headers, { error: "Authentication required" }, 401);
  const { data: profile } = await service.from("user_profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (profile?.status !== "active" || !["admin", "finance", "accountant"].includes(String(profile?.role || ""))) {
    return json(headers, { error: "Active Finance access required" }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return json(headers, { error: "Invalid request body" }, 400); }
  const action = clean(body?.action, 60).toLowerCase();
  const { data: config, error: configError } = await service.rpc("service_get_razorpayx_payout_config");
  if (configError) return json(headers, { error: "RazorpayX configuration could not be loaded." }, 503);
  const keyId = clean(config?.keyId, 300);
  const apiSecret = clean(config?.apiSecret, 1000);
  const accountNumber = clean(config?.accountNumber, 80);
  const basic = keyId && apiSecret ? `Basic ${btoa(`${keyId}:${apiSecret}`)}` : "";

  if (action === "test") {
    let success = false;
    let message = "RazorpayX is not fully configured.";
    try {
      if (!basic || !accountNumber) throw new Error(message);
      const url = new URL("https://api.razorpay.com/v1/payouts");
      url.searchParams.set("account_number", accountNumber);
      url.searchParams.set("count", "1");
      const response = await fetch(url, { headers: { Authorization: basic } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(safeError(payload, `RazorpayX credentials were rejected (HTTP ${response.status}).`));
      success = true;
      message = `RazorpayX ${clean(config?.mode, 20) || "test"} credentials and source account connected successfully.`;
    } catch (error) {
      message = error instanceof Error ? error.message : "RazorpayX connection test failed.";
    }
    await service.rpc("service_record_razorpayx_test", { p_success: success, p_message: message });
    return json(headers, { ok: success, message }, success ? 200 : 400);
  }

  if (action !== "process_batch") return json(headers, { error: "Unsupported payout action" }, 400);
  if (config?.ready !== true || !basic || !accountNumber) return json(headers, { error: "RazorpayX must be enabled and pass a current connection test before payout processing." }, 409);
  const batchId = clean(body?.batchId, 80);
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) return json(headers, { error: "A valid payout batch is required." }, 400);

  const { data: prepared, error: prepareError } = await service.rpc("service_prepare_worker_razorpayx_batch", { p_batch_id: batchId, p_actor_id: user.id });
  if (prepareError) return json(headers, { error: prepareError.message || "Payout batch could not be prepared." }, 400);
  const items = Array.isArray(prepared?.items) ? prepared.items : [];
  const results: any[] = [];

  for (const item of items) {
    const attemptId = clean(item?.attemptId, 80);
    const idempotencyKey = clean(item?.idempotencyKey, 80);
    try {
      const method = clean(item?.payoutMethod, 30);
      const details = item?.details && typeof item.details === "object" ? item.details : {};
      const contact: Record<string, unknown> = {
        name: clean(item?.name || details.accountHolderName, 100),
        email: clean(item?.email, 100),
        type: "employee",
        reference_id: clean(item?.referenceId, 40),
        notes: { profox_user_id: clean(item?.workerUserId, 50), profox_payout_id: clean(item?.payoutId, 50) },
      };
      const phone = clean(item?.phone, 30).replace(/[^0-9+]/g, "");
      if (phone) contact.contact = phone;
      const fundAccount = method === "UPI"
        ? { account_type: "vpa", vpa: { address: clean(details.vpa, 320) }, contact }
        : { account_type: "bank_account", bank_account: { name: clean(details.accountHolderName, 100), ifsc: clean(details.ifsc, 20).toUpperCase(), account_number: clean(details.accountNumber, 40) }, contact };
      const requestBody = {
        account_number: accountNumber,
        amount: minor(item?.amount),
        currency: "INR",
        mode: method === "UPI" ? "UPI" : clean(prepared?.defaultBankMode, 10).toUpperCase() || "IMPS",
        purpose: clean(prepared?.purpose, 30) || "salary",
        queue_if_low_balance: prepared?.queueIfLowBalance !== false,
        reference_id: clean(item?.referenceId, 40),
        narration: "ProFox Staff Payout",
        fund_account: fundAccount,
        notes: { profox_batch_id: batchId, profox_payout_id: clean(item?.payoutId, 50), profox_attempt_id: attemptId },
      };
      const response = await fetch("https://api.razorpay.com/v1/payouts", {
        method: "POST",
        headers: { Authorization: basic, "Content-Type": "application/json", "X-Payout-Idempotency": idempotencyKey },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const reason = safeError(payload, `RazorpayX returned HTTP ${response.status}.`);
        // Rate limits and server errors can happen after Razorpay accepted the
        // debit. Preserve the same attempt/idempotency key for a safe retry.
        const ambiguous = response.status === 429 || response.status >= 500;
        const outcome = ambiguous ? "pending" : "failed";
        await service.rpc("service_record_worker_razorpayx_dispatch", { p_attempt_id: attemptId, p_provider_payout_id: null, p_status: outcome, p_fund_account_id: null, p_utr: null, p_failure_reason: reason, p_metadata: { httpStatus: response.status, retrySafe: ambiguous } });
        results.push({ payoutId: item.payoutId, ok: false, status: outcome, error: ambiguous ? "Provider outcome is pending; use the safe retry action." : reason });
        continue;
      }
      const status = normalizedStatus(payload?.status);
      const safeMetadata = { mode: payload?.mode || requestBody.mode, fees: payload?.fees ?? null, tax: payload?.tax ?? null, createdAt: payload?.created_at ?? null };
      const { error: recordError } = await service.rpc("service_record_worker_razorpayx_dispatch", {
        p_attempt_id: attemptId,
        p_provider_payout_id: clean(payload?.id, 160),
        p_status: status,
        p_fund_account_id: clean(payload?.fund_account_id, 160) || null,
        p_utr: clean(payload?.utr, 160) || null,
        p_failure_reason: safeError(payload?.status_details, "") || null,
        p_metadata: safeMetadata,
      });
      if (recordError) throw new Error(recordError.message);
      results.push({ payoutId: item.payoutId, ok: true, status, providerPayoutId: clean(payload?.id, 160) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Payout dispatch outcome is unknown.";
      await service.rpc("service_record_worker_razorpayx_dispatch", { p_attempt_id: attemptId, p_provider_payout_id: null, p_status: "pending", p_fund_account_id: null, p_utr: null, p_failure_reason: reason, p_metadata: { retrySafe: true } });
      results.push({ payoutId: item?.payoutId, ok: false, status: "pending", error: "Dispatch outcome is pending reconciliation; retry is idempotent." });
    }
  }

  const failed = results.filter((result) => !result.ok).length;
  return json(headers, { ok: failed === 0, batchId, attempted: results.length, failed, results }, failed === results.length && results.length > 0 ? 502 : 200);
});
