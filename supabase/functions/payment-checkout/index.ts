import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function clean(value: unknown, max = 500) { return String(value ?? "").trim().slice(0, max); }
function asNumber(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function roundMoney(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function apiError(provider: string, status: number, text: string) {
  let message = `${provider} returned HTTP ${status}`;
  try { const parsed = JSON.parse(text); message = clean(parsed?.error?.description || parsed?.message || parsed?.name || message, 400); } catch { /* no-op */ }
  return new Error(message);
}

function minorExponent(currency: string) {
  const c = currency.toUpperCase();
  if (["BIF","CLP","DJF","GNF","JPY","KMF","KRW","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"].includes(c)) return 0;
  if (["BHD","JOD","KWD","OMR","TND"].includes(c)) return 3;
  return 2;
}
function toMinor(amount: number, currency: string) { return Math.round(amount * 10 ** minorExponent(currency)); }
function moneyValue(amount: number) { return amount.toFixed(2); }

async function hmacHex(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(signature).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function constantEquals(a: string, b: string) {
  const left = a.toLowerCase(); const right = b.toLowerCase();
  if (!left || left.length !== right.length) return false;
  let diff = 0; for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function paypalToken(config: any) {
  const base = config.mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  const credentials = btoa(`${clean(config.clientId, 500)}:${clean(config.apiSecret, 1000)}`);
  const response = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST", headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials",
  });
  const text = await response.text(); if (!response.ok) throw apiError("PayPal", response.status, text);
  const payload = JSON.parse(text); if (!payload.access_token) throw new Error("PayPal did not return an access token.");
  return { base, token: String(payload.access_token) };
}

async function fetchFxRateToInr(service: any, sourceCurrency: string) {
  const source = sourceCurrency.toUpperCase();
  if (source === "INR") return { rate: 1, source: "No FX conversion", quotedAt: new Date().toISOString() };

  let liveError = "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(source)}&to=INR`, {
      headers: { Accept: "application/json", "User-Agent": "ProFox-Payment-Checkout/1.0" },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Frankfurter returned HTTP ${response.status}`);
    const payload = JSON.parse(text);
    const rate = asNumber(payload?.rates?.INR);
    if (!(rate > 0)) throw new Error("Frankfurter did not return a valid INR rate.");
    const marketDate = clean(payload?.date, 32);
    return {
      rate,
      source: marketDate ? `Frankfurter reference (${marketDate})` : "Frankfurter reference",
      quotedAt: new Date().toISOString(),
    };
  } catch (error) {
    liveError = error instanceof Error ? error.message : "Live FX lookup failed.";
  } finally {
    clearTimeout(timeout);
  }

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: fallback } = await service
    .from("payment_gateway_attempts")
    .select("fx_rate,fx_source,fx_quoted_at")
    .eq("provider", "razorpay")
    .eq("currency", source)
    .eq("provider_currency", "INR")
    .not("fx_rate", "is", null)
    .gte("fx_quoted_at", cutoff)
    .order("fx_quoted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const fallbackRate = asNumber(fallback?.fx_rate);
  if (fallbackRate > 0) {
    return {
      rate: fallbackRate,
      source: `Recent stored reference · ${clean(fallback?.fx_source || "ProFox FX", 120)}`,
      quotedAt: new Date().toISOString(),
    };
  }
  throw new Error(`Unable to obtain the current ${source} to INR exchange rate. ${liveError}`.trim());
}

async function lockRazorpayCharge(service: any, prepared: any) {
  const sourceAmount = asNumber(prepared?.amount);
  const sourceCurrency = clean(prepared?.currency, 10).toUpperCase();
  if (!(sourceAmount > 0) || !/^[A-Z]{3}$/.test(sourceCurrency)) throw new Error("Payment amount or currency is invalid.");

  const lockedAmount = asNumber(prepared?.providerAmount);
  const lockedCurrency = clean(prepared?.providerCurrency, 10).toUpperCase();
  if (lockedAmount > 0 && lockedCurrency === "INR") {
    return {
      providerAmount: lockedAmount,
      providerCurrency: lockedCurrency,
      fxRate: asNumber(prepared?.fxRate) || (sourceCurrency === "INR" ? 1 : 0),
      fxSource: clean(prepared?.fxSource, 160),
      fxQuotedAt: clean(prepared?.fxQuotedAt, 80),
    };
  }

  const fx = await fetchFxRateToInr(service, sourceCurrency);
  const providerAmount = sourceCurrency === "INR" ? roundMoney(sourceAmount) : roundMoney(sourceAmount * fx.rate);
  if (!(providerAmount > 0)) throw new Error("Converted Razorpay amount is invalid.");

  const { data: stored, error: storeError } = await service.rpc("service_store_payment_gateway_quote", {
    p_attempt_id: prepared.attemptId,
    p_provider_amount: providerAmount,
    p_provider_currency: "INR",
    p_fx_rate: sourceCurrency === "INR" ? 1 : fx.rate,
    p_fx_source: fx.source,
    p_fx_quoted_at: fx.quotedAt,
  });
  if (storeError) throw new Error(storeError.message);
  return {
    providerAmount: asNumber(stored?.providerAmount) || providerAmount,
    providerCurrency: clean(stored?.providerCurrency || "INR", 10).toUpperCase(),
    fxRate: asNumber(stored?.fxRate) || (sourceCurrency === "INR" ? 1 : fx.rate),
    fxSource: clean(stored?.fxSource || fx.source, 160),
    fxQuotedAt: clean(stored?.fxQuotedAt || fx.quotedAt, 80),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRole) return json({ error: "Server payment configuration unavailable." }, 500);
  const service = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  const action = clean(body.action, 80).toLowerCase();
  const publicToken = clean(body.paymentToken, 256);

  try {
    if (action === "create") {
      const provider = clean(body.provider, 30).toLowerCase();
      const { data: prepared, error: prepareError } = await service.rpc("service_prepare_payment_gateway_checkout", { p_token: publicToken, p_provider: provider });
      if (prepareError) throw new Error(prepareError.message);
      if (prepared?.alreadyPaid) return json({ ok: true, alreadyPaid: true, payment: prepared });
      if (prepared?.reused && prepared?.providerOrderId) {
        if (provider === "paypal" && prepared.checkoutUrl) return json({ ok: true, provider, attemptId: prepared.attemptId, redirectUrl: prepared.checkoutUrl, reused: true });
        if (provider === "razorpay") {
          const providerAmount = asNumber(prepared.providerAmount);
          const providerCurrency = clean(prepared.providerCurrency, 10).toUpperCase();
          if (!(providerAmount > 0) || providerCurrency !== "INR") throw new Error("The existing Razorpay order does not contain a valid locked INR quote. Please retry after the previous attempt expires.");
          return json({
            ok: true, provider, attemptId: prepared.attemptId, orderId: prepared.providerOrderId, keyId: prepared.publicId,
            amount: toMinor(providerAmount, providerCurrency), currency: providerCurrency,
            providerAmount, providerCurrency, originalAmount: asNumber(prepared.amount), originalCurrency: prepared.currency,
            fxRate: asNumber(prepared.fxRate), fxSource: prepared.fxSource, fxQuotedAt: prepared.fxQuotedAt,
            customerName: prepared.customerName, customerEmail: prepared.customerEmail, paymentReference: prepared.paymentReference, reused: true,
          });
        }
      }
      const { data: config, error: configError } = await service.rpc("service_get_payment_gateway_provider", { p_provider: provider });
      if (configError) throw new Error("Unable to load payment provider configuration.");
      if (config?.enabled !== true || !clean(config?.apiSecret)) throw new Error("Selected payment provider is not fully configured.");

      if (provider === "razorpay") {
        const charge = await lockRazorpayCharge(service, prepared);
        if (charge.providerCurrency !== "INR") throw new Error("Razorpay checkout must be created in INR.");
        const authorization = `Basic ${btoa(`${clean(config.keyId, 300)}:${clean(config.apiSecret, 1000)}`)}`;
        const orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
          method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: toMinor(charge.providerAmount, charge.providerCurrency), currency: charge.providerCurrency,
            receipt: clean(prepared.paymentReference, 40),
            notes: {
              payment_id: prepared.paymentId,
              attempt_id: prepared.attemptId,
              payment_reference: prepared.paymentReference,
              original_amount: moneyValue(asNumber(prepared.amount)),
              original_currency: clean(prepared.currency, 10).toUpperCase(),
              fx_rate: String(charge.fxRate || 1),
              fx_source: clean(charge.fxSource, 120),
            },
          }),
        });
        const text = await orderResponse.text();
        if (!orderResponse.ok) {
          await service.rpc("service_fail_payment_gateway_attempt", { p_attempt_id: prepared.attemptId, p_code: `RAZORPAY_${orderResponse.status}`, p_message: text.slice(0, 800) });
          throw apiError("Razorpay", orderResponse.status, text);
        }
        const order = JSON.parse(text);
        const { error: storeError } = await service.rpc("service_store_payment_gateway_order", {
          p_attempt_id: prepared.attemptId,
          p_provider_order_id: order.id,
          p_checkout_url: null,
          p_metadata: {
            orderStatus: order.status,
            createdAt: order.created_at,
            originalAmount: asNumber(prepared.amount),
            originalCurrency: clean(prepared.currency, 10).toUpperCase(),
            providerAmount: charge.providerAmount,
            providerCurrency: charge.providerCurrency,
            fxRate: charge.fxRate,
            fxSource: charge.fxSource,
            fxQuotedAt: charge.fxQuotedAt,
          },
        });
        if (storeError) throw new Error(storeError.message);
        return json({
          ok: true, provider, attemptId: prepared.attemptId, orderId: order.id, keyId: clean(config.keyId, 300),
          amount: order.amount, currency: order.currency,
          providerAmount: charge.providerAmount, providerCurrency: charge.providerCurrency,
          originalAmount: asNumber(prepared.amount), originalCurrency: clean(prepared.currency, 10).toUpperCase(),
          fxRate: charge.fxRate, fxSource: charge.fxSource, fxQuotedAt: charge.fxQuotedAt,
          customerName: prepared.customerName, customerEmail: prepared.customerEmail, paymentReference: prepared.paymentReference,
        });
      }

      if (provider === "paypal") {
        const auth = await paypalToken(config);
        const paymentLink = clean(prepared.paymentLink, 1200);
        const separator = paymentLink.includes("?") ? "&" : "?";
        const returnUrl = `${paymentLink}${separator}provider=paypal&paypal_return=1&attempt=${encodeURIComponent(prepared.attemptId)}`;
        const cancelUrl = `${paymentLink}${separator}provider=paypal&paypal_cancel=1&attempt=${encodeURIComponent(prepared.attemptId)}`;
        const createResponse = await fetch(`${auth.base}/v2/checkout/orders`, {
          method: "POST",
          headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json", "PayPal-Request-Id": prepared.attemptId },
          body: JSON.stringify({ intent: "CAPTURE", purchase_units: [{ reference_id: prepared.attemptId, custom_id: prepared.paymentId, invoice_id: clean(prepared.paymentReference, 127), amount: { currency_code: String(prepared.currency).toUpperCase(), value: moneyValue(asNumber(prepared.amount)) } }], application_context: { brand_name: "ProFox Web Designer", user_action: "PAY_NOW", return_url: returnUrl, cancel_url: cancelUrl } }),
        });
        const text = await createResponse.text(); if (!createResponse.ok) { await service.rpc("service_fail_payment_gateway_attempt", { p_attempt_id: prepared.attemptId, p_code: `PAYPAL_${createResponse.status}`, p_message: text.slice(0, 800) }); throw apiError("PayPal", createResponse.status, text); }
        const order = JSON.parse(text); const approval = (order.links || []).find((link: any) => link.rel === "approve" || link.rel === "payer-action")?.href;
        if (!approval) { await service.rpc("service_fail_payment_gateway_attempt", { p_attempt_id: prepared.attemptId, p_code: "PAYPAL_APPROVAL_URL_MISSING", p_message: "PayPal order did not return an approval URL." }); throw new Error("PayPal did not return an approval URL."); }
        const { error: storeError } = await service.rpc("service_store_payment_gateway_order", { p_attempt_id: prepared.attemptId, p_provider_order_id: order.id, p_checkout_url: approval, p_metadata: { orderStatus: order.status } });
        if (storeError) throw new Error(storeError.message);
        return json({ ok: true, provider, attemptId: prepared.attemptId, redirectUrl: approval });
      }
      throw new Error("Unsupported provider.");
    }

    if (action === "razorpay_verify") {
      const attemptId = clean(body.attemptId, 80); const paymentId = clean(body.razorpayPaymentId, 120); const receivedSignature = clean(body.razorpaySignature, 256);
      const { data: attempt, error: bindError } = await service.rpc("service_authorize_payment_gateway_attempt", { p_token: publicToken, p_attempt_id: attemptId });
      if (bindError) throw new Error(bindError.message); if (attempt?.provider !== "razorpay" || !attempt?.providerOrderId) throw new Error("Razorpay checkout attempt is invalid.");
      const { data: config, error: configError } = await service.rpc("service_get_payment_gateway_provider", { p_provider: "razorpay" }); if (configError) throw new Error("Unable to load Razorpay configuration.");
      const expected = await hmacHex(clean(config.apiSecret, 1000), `${attempt.providerOrderId}|${paymentId}`);
      if (!constantEquals(expected, receivedSignature)) throw new Error("Razorpay payment signature verification failed.");
      const authorization = `Basic ${btoa(`${clean(config.keyId, 300)}:${clean(config.apiSecret, 1000)}`)}`;
      let response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: authorization } });
      let text = await response.text(); if (!response.ok) throw apiError("Razorpay", response.status, text); let payment = JSON.parse(text);
      const expectedAmount = asNumber(attempt.providerAmount);
      const expectedCurrency = clean(attempt.providerCurrency, 10).toUpperCase();
      if (!(expectedAmount > 0) || expectedCurrency !== "INR") throw new Error("Razorpay checkout attempt is missing its locked INR conversion quote.");
      const expectedMinor = toMinor(expectedAmount, expectedCurrency);
      if (payment.order_id !== attempt.providerOrderId || Number(payment.amount) !== expectedMinor || String(payment.currency).toUpperCase() !== expectedCurrency) throw new Error("Razorpay payment details do not match the locked ProFox INR payment request.");
      if (payment.status === "authorized") {
        response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/capture`, { method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" }, body: JSON.stringify({ amount: expectedMinor, currency: expectedCurrency }) });
        text = await response.text(); if (!response.ok) throw apiError("Razorpay capture", response.status, text); payment = JSON.parse(text);
      }
      if (payment.status !== "captured") throw new Error(`Razorpay payment is ${clean(payment.status, 40) || "not captured"}.`);
      const { data: settled, error: settleError } = await service.rpc("service_finalize_payment_gateway_attempt", {
        p_attempt_id: attemptId,
        p_provider_payment_id: paymentId,
        p_provider_capture_id: paymentId,
        p_metadata: {
          status: payment.status,
          method: payment.method,
          providerAmount: expectedAmount,
          providerCurrency: expectedCurrency,
          originalAmount: asNumber(attempt.amount),
          originalCurrency: clean(attempt.currency, 10).toUpperCase(),
          fxRate: asNumber(attempt.fxRate),
          fxSource: clean(attempt.fxSource, 160),
          fxQuotedAt: clean(attempt.fxQuotedAt, 80),
        },
      });
      if (settleError) throw new Error(settleError.message); return json({ ok: true, verified: true, payment: settled });
    }

    if (action === "paypal_capture") {
      const attemptId = clean(body.attemptId, 80);
      const { data: attempt, error: bindError } = await service.rpc("service_authorize_payment_gateway_attempt", { p_token: publicToken, p_attempt_id: attemptId });
      if (bindError) throw new Error(bindError.message); if (attempt?.provider !== "paypal" || !attempt?.providerOrderId) throw new Error("PayPal checkout attempt is invalid.");
      const suppliedOrder = clean(body.providerOrderId, 120); if (suppliedOrder && suppliedOrder !== attempt.providerOrderId) throw new Error("PayPal order does not match this ProFox payment attempt.");
      const { data: config, error: configError } = await service.rpc("service_get_payment_gateway_provider", { p_provider: "paypal" }); if (configError) throw new Error("Unable to load PayPal configuration.");
      const auth = await paypalToken(config);
      let response = await fetch(`${auth.base}/v2/checkout/orders/${encodeURIComponent(attempt.providerOrderId)}/capture`, { method: "POST", headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json", "PayPal-Request-Id": `${attemptId}-capture` }, body: "{}" });
      let text = await response.text(); let order: any;
      if (!response.ok) {
        response = await fetch(`${auth.base}/v2/checkout/orders/${encodeURIComponent(attempt.providerOrderId)}`, { headers: { Authorization: `Bearer ${auth.token}` } });
        text = await response.text(); if (!response.ok) throw apiError("PayPal", response.status, text); order = JSON.parse(text);
      } else order = JSON.parse(text);
      if (order.status !== "COMPLETED") throw new Error(`PayPal order is ${clean(order.status, 60) || "not completed"}.`);
      const capture = order.purchase_units?.[0]?.payments?.captures?.[0]; if (!capture || capture.status !== "COMPLETED") throw new Error("PayPal capture is not completed.");
      const capturedAmount = asNumber(capture.amount?.value); const capturedCurrency = clean(capture.amount?.currency_code, 10).toUpperCase();
      if (Math.abs(capturedAmount - asNumber(attempt.amount)) > 0.001 || capturedCurrency !== String(attempt.currency).toUpperCase()) throw new Error("PayPal capture amount or currency does not match the ProFox payment request.");
      const { data: settled, error: settleError } = await service.rpc("service_finalize_payment_gateway_attempt", { p_attempt_id: attemptId, p_provider_payment_id: capture.id, p_provider_capture_id: capture.id, p_metadata: { status: capture.status } });
      if (settleError) throw new Error(settleError.message); return json({ ok: true, verified: true, payment: settled });
    }

    return json({ error: "Unsupported payment action." }, 400);
  } catch (error) {
    console.error("Payment checkout error", error instanceof Error ? error.message : "Unknown error");
    return json({ error: error instanceof Error ? error.message : "Payment could not be processed." }, 400);
  }
});
