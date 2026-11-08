/**
 * SENDWAYO payment routes — fail-closed reference for Cloudflare Workers.
 * Not production-ready: CardNET's merchant-specific QA credentials and exact
 * webhook verification contract must be supplied before implementing the adapter.
 * Never accept PAN/CVV/PIN here. Use the acquirer's hosted checkout/tokenization.
 */
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

export async function handlePaymentRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/payments/status") {
    return json({
      module: "sendwayo-payments",
      mode: "disabled",
      cardProvider: env.CARD_PROVIDER || null,
      canCreatePayment: false,
      reason: "MERCHANT_ONBOARDING_AND_PROVIDER_VERIFICATION_REQUIRED"
    });
  }

  if (request.method === "POST" && url.pathname === "/api/payments/intents") {
    // Intentionally fail closed. Do not create a fake pending payment or ledger entry.
    if (!env.CARDNET_MERCHANT_ID || !env.CARDNET_TERMINAL_ID || !env.CARDNET_ADAPTER_ENABLED) {
      return json({ ok: false, code: "PROVIDER_NOT_CONFIGURED", message: "El comercio aún no tiene afiliación y credenciales QA configuradas." }, 503);
    }
    // TODO: implement only against the exact CardNET merchant contract:
    // authenticate Firebase user server-side; authorize role and service;
    // validate amount/currency/order ownership; persist an idempotent intent;
    // request a hosted checkout session; return only its provider URL/session ID.
    return json({ ok: false, code: "ADAPTER_NOT_CERTIFIED" }, 503);
  }

  if (request.method === "POST" && url.pathname === "/api/payments/webhooks/cardnet") {
    // Never accept browser return parameters as payment proof.
    // Implement provider-specific signature/authentication and replay protection
    // only after CardNET supplies the merchant webhook/notification specification.
    return json({ ok: false, code: "WEBHOOK_VERIFIER_NOT_CONFIGURED" }, 503);
  }

  return json({ ok: false, code: "NOT_FOUND" }, 404);
}
