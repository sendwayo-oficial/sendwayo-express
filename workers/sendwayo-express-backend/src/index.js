const API_VERSION = "2026-11-06";
const ROOT = "sendwayo_express_v2";
const STRIPE_ACCOUNT_COUNTRIES = new Set("AU AT BE BR BG CA CI HR CY CZ DK EE FI FR DE GH GI GR HK HU IN ID IE IT JP KE LV LI LT LU MY MT MX NL NZ NG NO PL PT RO SG SK SI ZA ES SE CH TH AE GB US".split(" "));
const ZERO_DECIMAL = new Set("BIF CLP DJF GNF JPY KMF KRW MGA PYG RWF UGX VND VUV XAF XOF XPF".split(" "));
let serviceTokenCache = { token: "", expiresAt: 0 };

function response(status, data, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, headers)
  });
}
function fail(status, message, extra = {}) {
  return response(status, Object.assign({ error: message }, extra));
}
function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}
function norm(value) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function safeKey(value) {
  const key = clean(value).replace(/[.#$\[\]\/]/g, "_");
  if (!key || key === "." || key === "..") throw new Error("Clave de Firebase no válida.");
  return key;
}
function isCountry(value) {
  return /^[A-Z]{2}$/.test(clean(value).toUpperCase());
}
function isCurrency(value) {
  return /^[A-Z]{3}$/.test(clean(value).toUpperCase());
}
function amountNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 999999999) return 0;
  return Math.round(number * 100) / 100;
}
function minorUnits(amount, currency) {
  const factor = ZERO_DECIMAL.has(currency) ? 1 : 100;
  const result = Math.round(amount * factor);
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error("El importe no es válido para la moneda seleccionada.");
  return result;
}
function base64Url(bytes) {
  let binary = "";
  new Uint8Array(bytes).forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function pemBytes(pem) {
  const body = String(pem || "").replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
function bearer(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}
function cors(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = new Set([
    clean(env.APP_ORIGIN),
    "https://sendwayo-oficial.github.io",
    "https://sendwayo-oficial.github.io"
  ].filter(Boolean));
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,Stripe-Signature",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (allowed.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
async function googleAccessToken(env) {
  if (serviceTokenCache.token && serviceTokenCache.expiresAt > Date.now() + 60000) return serviceTokenCache.token;
  const email = clean(env.FIREBASE_CLIENT_EMAIL);
  const privateKey = clean(env.FIREBASE_PRIVATE_KEY);
  if (!email || !privateKey) throw new Error("Faltan FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY en Cloudflare Secrets.");
  const now = Math.floor(Date.now() / 1000);
  const head = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = {
    iss: email,
    sub: email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3500,
    scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email"
  };
  const payload = base64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const unsigned = head + "." + payload;
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = unsigned + "." + base64Url(signature);
  const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion });
  const result = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok || !data.access_token) throw new Error("No se pudo obtener el token de servicio de Firebase.");
  serviceTokenCache = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in || 3500) * 1000) };
  return serviceTokenCache.token;
}
function databaseBase(env) {
  const value = clean(env.FIREBASE_DATABASE_URL).replace(/\/+$/, "");
  if (!value) throw new Error("Falta FIREBASE_DATABASE_URL en Cloudflare.");
  return value + "/";
}
async function dbRequest(env, path, method = "GET", data = undefined, extraHeaders = {}) {
  const token = await googleAccessToken(env);
  const url = new URL(path.replace(/^\/+/, "") + ".json", databaseBase(env));
  const headers = Object.assign({ "Authorization": "Bearer " + token }, extraHeaders);
  if (data !== undefined) headers["Content-Type"] = "application/json";
  const result = await fetch(url.toString(), {
    method,
    headers,
    body: data === undefined ? undefined : JSON.stringify(data)
  });
  const raw = await result.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch (_) {}
  if (!result.ok) throw new Error("Firebase RTDB respondió HTTP " + result.status + ".");
  return { data: parsed, etag: result.headers.get("ETag") };
}
async function dbGet(env, path) {
  return (await dbRequest(env, path)).data;
}
async function dbPut(env, path, data) {
  return (await dbRequest(env, path, "PUT", data)).data;
}
async function dbPatch(env, path, data) {
  return (await dbRequest(env, path, "PATCH", data)).data;
}
async function verifyFirebaseToken(env, idToken) {
  if (!idToken) throw new Error("Falta el token de Firebase Authentication.");
  const apiKey = clean(env.FIREBASE_WEB_API_KEY);
  if (!apiKey) throw new Error("Falta FIREBASE_WEB_API_KEY en Cloudflare.");
  const url = "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(apiKey);
  const result = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken })
  });
  const body = await result.json().catch(() => ({}));
  const record = body.users && body.users[0];
  if (!result.ok || !record || !record.localId) throw new Error("La sesión de Firebase no es válida o ha expirado.");
  return { uid: record.localId, email: clean(record.email).toLowerCase(), displayName: clean(record.displayName), phoneNumber: clean(record.phoneNumber) };
}
function profileRole(profile) {
  return norm(profile && (profile.role || profile.rol));
}
async function getProfile(env, identity) {
  const users = await dbGet(env, ROOT + "/users") || {};
  const entries = Object.entries(users);
  let match = entries.find(([key, row]) => clean(row && row.authUid) === identity.uid);
  if (!match && identity.email) match = entries.find(([key, row]) => clean(row && (row.authEmail || row.email)).toLowerCase() === identity.email);
  if (!match && identity.email === "ideletteismorin@gmail.com" && users.admin) match = ["admin", users.admin];
  if (!match) return null;
  const key = match[0], profile = match[1] || {};
  const role = profileRole(profile);
  const active = profile.active !== false && profile.disabled !== true && !["inactive", "inactivo", "blocked", "bloqueado"].includes(norm(profile.status || profile.estado));
  return { key, profile, role, active, uid: identity.uid, email: identity.email };
}
async function authenticate(request, env) {
  const identity = await verifyFirebaseToken(env, bearer(request));
  const profile = await getProfile(env, identity);
  if (!profile || !profile.active || !profile.role) throw new Error("La cuenta no está vinculada a un perfil SENDWAYO activo.");
  return { identity, profile };
}
function isAdmin(user) {
  return ["admin", "administrador", "administration"].includes(user && user.profile && user.profile.role);
}
function senderSnapshot(user, submittedCountry) {
  const p = user.profile.profile;
  const country = clean(submittedCountry || p.country || p.countryISO || p.countryCode).toUpperCase();
  return {
    fullName: clean(p.fullName || p.displayName || p.name || p.nombre || user.identity.displayName || p.email || user.identity.email),
    phone: clean(p.phone || p.telefono || p.celular || user.identity.phoneNumber),
    country: isCountry(country) ? country : ""
  };
}
function makeId(prefix) {
  return prefix + Date.now().toString(36).toUpperCase() + crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
}
function mapSettlement(destinationType) {
  if (destinationType === "AUTHORIZED_AGENT") return "AGENT_NETWORK";
  if (destinationType === "BANK_ACCOUNT") return "BANK_TRANSFER";
  return "MERCHANT_SETTLEMENT";
}
function validatePaymentInput(body) {
  const sourceAmount = amountNumber(body.sourceAmount);
  const totalCharged = amountNumber(body.totalCharged == null ? sourceAmount : body.totalCharged);
  const sourceCurrency = clean(body.sourceCurrency).toUpperCase();
  const targetCurrency = clean(body.targetCurrency).toUpperCase();
  const targetAmount = amountNumber(body.targetAmount);
  const countryFrom = clean(body.senderCountry || body.countryFrom).toUpperCase();
  const countryTo = clean(body.recipientCountry || body.countryTo).toUpperCase();
  const destinationType = clean(body.destinationType).toUpperCase();
  const provider = clean(body.provider, 50);
  const phoneOrAccount = clean(body.phoneOrAccount, 100);
  if (!sourceAmount || !totalCharged || totalCharged < sourceAmount) throw new Error("Indique importes válidos; el total cobrado no puede ser menor que el importe base.");
  if (!isCurrency(sourceCurrency) || !isCurrency(targetCurrency) || !targetAmount) throw new Error("Indique la moneda de origen, la moneda de destino y el importe que recibirá el beneficiario.");
  if (!isCountry(countryTo)) throw new Error("Seleccione un país de destino ISO de dos letras.");
  if (!["AUTHORIZED_AGENT", "BANK_ACCOUNT", "MERCHANT"].includes(destinationType)) throw new Error("Seleccione agente autorizado, cuenta bancaria o comercio.");
  if (!provider || !phoneOrAccount) throw new Error("Complete el proveedor y el teléfono o cuenta del beneficiario.");
  return { sourceAmount, totalCharged, sourceCurrency, targetCurrency, targetAmount, countryFrom: isCountry(countryFrom) ? countryFrom : "", countryTo, destinationType, provider, phoneOrAccount };
}
async function newTransaction(env, user, body, gateway) {
  const fields = validatePaymentInput(body);
  const transactionId = makeId("SWX-");
  const now = Date.now();
  const senderInfo = senderSnapshot(user, fields.countryFrom);
  const recipientInfo = {
    provider: fields.provider,
    destinationType: fields.destinationType,
    phoneOrAccount: fields.phoneOrAccount,
    country: fields.countryTo,
    fullName: clean(body.recipientName, 120),
    bankName: clean(body.bankName, 120),
    accountType: clean(body.accountType, 40)
  };
  const transaction = {
    transactionId,
    id: transactionId,
    type: clean(body.transactionType || "ENVIO", 40).toUpperCase(),
    userId: user.profile.key,
    firebaseUid: user.identity.uid,
    ownerAuthUid: user.identity.uid,
    senderInfo,
    recipientInfo,
    paymentDetails: {
      gateway,
      sourceCurrency: fields.sourceCurrency,
      sourceAmount: fields.sourceAmount,
      serviceFee: Math.round((fields.totalCharged - fields.sourceAmount) * 100) / 100,
      totalCharged: fields.totalCharged,
      paymentStatus: "pending",
      providerReference: "",
      createdAt: now
    },
    payoutDetails: {
      settlementType: mapSettlement(fields.destinationType),
      agentInfo: {
        agentId: clean(body.agentId, 80),
        agentName: clean(body.agentName, 120),
        agentAuthUid: ""
      },
      targetCurrency: fields.targetCurrency,
      targetAmount: fields.targetAmount,
      payoutReference: "",
      status: "awaiting_payment"
    },
    route: {
      fromCountry: fields.countryFrom,
      toCountry: fields.countryTo
    },
    status: "pending_payment",
    timestamps: { created: now, updated: now }
  };
  await dbPut(env, ROOT + "/transactions/" + safeKey(transactionId), transaction);
  return transaction;
}
async function updateTransaction(env, id, patch) {
  return dbPatch(env, ROOT + "/transactions/" + safeKey(id), patch);
}
async function createStripeCheckout(env, transaction, idempotencyKey) {
  const accountCountry = clean(env.STRIPE_ACCOUNT_COUNTRY).toUpperCase();
  if (!STRIPE_ACCOUNT_COUNTRIES.has(accountCountry)) {
    throw new Error("Stripe no puede activarse: STRIPE_ACCOUNT_COUNTRY debe ser un país admitido para abrir cuentas comerciales.");
  }
  if (!env.STRIPE_SECRET_KEY) throw new Error("Falta STRIPE_SECRET_KEY en Cloudflare.");
  const appReturn = clean(env.APP_RETURN_URL);
  if (!appReturn) throw new Error("Falta APP_RETURN_URL en Cloudflare.");
  const currency = transaction.paymentDetails.sourceCurrency.toLowerCase();
  const amount = minorUnits(transaction.paymentDetails.totalCharged, currency.toUpperCase());
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", appReturn + "?payment=processing&transaction=" + encodeURIComponent(transaction.transactionId));
  form.set("cancel_url", appReturn + "?payment=cancelled&transaction=" + encodeURIComponent(transaction.transactionId));
  form.set("client_reference_id", transaction.transactionId);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", currency);
  form.set("line_items[0][price_data][unit_amount]", String(amount));
  form.set("line_items[0][price_data][product_data][name]", "SENDWAYO EXPRESS — " + transaction.transactionId);
  form.set("metadata[transactionId]", transaction.transactionId);
  form.set("metadata[userId]", transaction.userId);
  form.set("payment_intent_data[metadata][transactionId]", transaction.transactionId);
  form.set("payment_intent_data[metadata][userId]", transaction.userId);
  const result = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(env.STRIPE_SECRET_KEY + ":"),
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey
    },
    body: form
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok || !data.url || !data.id) throw new Error("Stripe no pudo crear la sesión de pago.");
  await updateTransaction(env, transaction.transactionId, {
    "paymentDetails/checkoutSessionId": data.id,
    "paymentDetails/checkoutUrl": data.url,
    "paymentDetails/providerReference": data.id,
    "timestamps/updated": Date.now()
  });
  return { gateway: "Stripe", checkoutUrl: data.url, sessionId: data.id };
}
function pad12(value) {
  return String(value).padStart(12, "0");
}
async function createCardnetSession(env, transaction, request, idempotencyKey) {
  const required = ["CARDNET_MERCHANT_NUMBER", "CARDNET_MERCHANT_TERMINAL", "CARDNET_ACQUIRER_CODE", "CARDNET_MERCHANT_TYPE", "CARDNET_MERCHANT_NAME"];
  const missing = required.filter(key => !clean(env[key]));
  if (missing.length) throw new Error("Faltan secretos CardNET: " + missing.join(", "));
  const currency = transaction.paymentDetails.sourceCurrency;
  if (!["DOP", "USD"].includes(currency)) throw new Error("CardNET de esta integración admite DOP o USD. Elija otra pasarela para esa moneda.");
  const base = clean(env.CARDNET_BASE_URL || "https://ecommerce.cardnet.com.do").replace(/\/+$/, "");
  const workerUrl = clean(env.WORKER_URL || "https://sendwayo-express-backend.ideletteismorin.workers.dev").replace(/\/+$/, "");
  const now = new Date();
  const sixDigit = String((now.getTime() + Math.floor(Math.random() * 100000)) % 1000000).padStart(6, "0");
  const requestBody = {
    TransactionType: "0200",
    CurrencyCode: currency === "DOP" ? "214" : "840",
    AcquiringInstitutionCode: clean(env.CARDNET_ACQUIRER_CODE),
    MerchantType: clean(env.CARDNET_MERCHANT_TYPE),
    MerchantNumber: clean(env.CARDNET_MERCHANT_NUMBER),
    MerchantTerminal: clean(env.CARDNET_MERCHANT_TERMINAL),
    ReturnUrl: workerUrl + "/api/cardnet/return?transaction=" + encodeURIComponent(transaction.transactionId),
    CancelUrl: workerUrl + "/api/cardnet/return?transaction=" + encodeURIComponent(transaction.transactionId) + "&cancel=1",
    PageLanguaje: "ESP",
    OrdenId: transaction.transactionId.slice(0, 20),
    TransactionId: sixDigit,
    Tax: pad12(Math.round(Number(env.CARDNET_TAX || 0) * 100)),
    MerchantName: clean(env.CARDNET_MERCHANT_NAME).toUpperCase().slice(0, 40),
    Amount: pad12(minorUnits(transaction.paymentDetails.totalCharged, currency)),
    AVS: clean(env.CARDNET_AVS || "SENDWAYO EXPRESS").slice(0, 100)
  };
  const result = await fetch(base + "/api/payment/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(requestBody)
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok || !data.SESSION || !data["session-key"]) throw new Error("CardNET no pudo crear la sesión de pago.");
  await updateTransaction(env, transaction.transactionId, {
    "paymentDetails/cardnetSession": data.SESSION,
    "paymentDetails/cardnetSessionKey": data["session-key"],
    "paymentDetails/cardnetTransactionId": sixDigit,
    "paymentDetails/cardnetBaseUrl": base,
    "paymentDetails/providerReference": data.SESSION,
    "timestamps/updated": Date.now()
  });
  return {
    gateway: "CardNET",
    checkoutForm: { method: "POST", action: base + "/authorize", fields: { SESSION: data.SESSION } },
    sessionId: data.SESSION
  };
}
async function createPayment(request, env, user) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return fail(400, "El cuerpo de la solicitud no es válido.");
  let gateway = clean(body.gateway).toUpperCase();
  if (gateway === "CARDNET") gateway = "CardNET";
  if (gateway === "STRIPE") gateway = "Stripe";
  if (gateway === "AZUL") return fail(501, "AZUL está reservado como pasarela local, pero necesita sus credenciales de comercio y la certificación del canal/API antes de habilitar cobros reales.");
  if (!["CardNET", "Stripe"].includes(gateway)) return fail(400, "Seleccione CardNET o Stripe.");
  let transaction;
  try {
    transaction = await newTransaction(env, user, body, gateway);
    const key = clean(body.idempotencyKey) || transaction.transactionId;
    const checkout = gateway === "Stripe"
      ? await createStripeCheckout(env, transaction, key)
      : await createCardnetSession(env, transaction, request, key);
    return response(201, { transactionId: transaction.transactionId, status: transaction.status, checkout });
  } catch (error) {
    if (transaction) {
      try {
        await updateTransaction(env, transaction.transactionId, {
          status: "payment_setup_failed",
          "paymentDetails/paymentStatus": "setup_failed",
          "paymentDetails/error": clean(error.message, 300),
          "timestamps/updated": Date.now()
        });
      } catch (_) {}
    }
    return fail(400, error.message || "No se pudo preparar el pago.");
  }
}
function secureEqual(a, b) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
async function verifyStripeSignature(rawBody, header, secret) {
  const parts = String(header || "").split(",").map(item => item.trim().split("="));
  const timestamp = (parts.find(item => item[0] === "t") || [])[1];
  const signatures = parts.filter(item => item[0] === "v1").map(item => item[1]);
  if (!timestamp || !signatures.length || !secret) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp + "." + rawBody));
  const expected = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
  return signatures.some(value => secureEqual(value, expected));
}
async function markPaymentPaid(env, transactionId, details) {
  const transaction = await dbGet(env, ROOT + "/transactions/" + safeKey(transactionId));
  if (!transaction) throw new Error("No existe la transacción indicada.");
  if (transaction.paymentDetails && transaction.paymentDetails.paymentStatus === "paid") return transaction;
  const now = Date.now();
  await updateTransaction(env, transactionId, {
    status: "paid_pending_payout",
    "paymentDetails/paymentStatus": "paid",
    "paymentDetails/providerReference": clean(details.providerReference || ""),
    "paymentDetails/paidAt": now,
    "paymentDetails/paymentIntentId": clean(details.paymentIntentId || ""),
    "paymentDetails/checkoutSessionId": clean(details.checkoutSessionId || ""),
    "payoutDetails/status": "awaiting_dispatch",
    "timestamps/updated": now,
    "timestamps/paid": now
  });
  const payoutId = safeKey(transactionId);
  const existing = await dbGet(env, ROOT + "/payoutRequests/" + payoutId);
  if (!existing) {
    await dbPut(env, ROOT + "/payoutRequests/" + payoutId, {
      id: payoutId,
      transactionId,
      userId: transaction.userId,
      ownerAuthUid: transaction.ownerAuthUid,
      provider: transaction.recipientInfo && transaction.recipientInfo.provider,
      destinationType: transaction.recipientInfo && transaction.recipientInfo.destinationType,
      settlementType: transaction.payoutDetails && transaction.payoutDetails.settlementType,
      country: transaction.recipientInfo && transaction.recipientInfo.country,
      targetCurrency: transaction.payoutDetails && transaction.payoutDetails.targetCurrency,
      targetAmount: transaction.payoutDetails && transaction.payoutDetails.targetAmount,
      status: "awaiting_dispatch",
      createdAtMs: now,
      updatedAtMs: now
    });
  }
  return Object.assign({}, transaction, { status: "paid_pending_payout" });
}
async function stripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return fail(503, "Falta STRIPE_WEBHOOK_SECRET en Cloudflare.");
  const raw = await request.text();
  const valid = await verifyStripeSignature(raw, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return fail(400, "Firma de webhook Stripe no válida.");
  let event;
  try { event = JSON.parse(raw); } catch (_) { return fail(400, "JSON del webhook Stripe no válido."); }
  const eventId = safeKey(clean(event.id));
  const marker = ROOT + "/processedStripeEvents/" + eventId;
  const processed = await dbGet(env, marker);
  if (processed) return response(200, { received: true, duplicate: true });
  const object = event.data && event.data.object;
  if (event.type === "checkout.session.completed" && object && object.payment_status === "paid") {
    const transactionId = clean(object.metadata && object.metadata.transactionId || object.client_reference_id);
    if (!transactionId) return fail(400, "El evento Stripe no contiene transactionId.");
    await markPaymentPaid(env, transactionId, {
      providerReference: object.id,
      checkoutSessionId: object.id,
      paymentIntentId: object.payment_intent
    });
  } else if (event.type === "checkout.session.async_payment_failed" || event.type === "payment_intent.payment_failed") {
    const transactionId = clean(object && object.metadata && object.metadata.transactionId);
    if (transactionId) {
      await updateTransaction(env, transactionId, {
        status: "payment_failed",
        "paymentDetails/paymentStatus": "failed",
        "paymentDetails/providerReference": clean(object.id),
        "timestamps/updated": Date.now()
      });
    }
  }
  await dbPut(env, marker, { eventId: event.id, type: event.type, processedAt: Date.now() });
  return response(200, { received: true });
}
async function cardnetReturn(request, env) {
  const url = new URL(request.url);
  const transactionId = clean(url.searchParams.get("transaction"));
  if (!transactionId) return fail(400, "Falta el identificador de la transacción.");
  const transaction = await dbGet(env, ROOT + "/transactions/" + safeKey(transactionId));
  const payment = transaction && transaction.paymentDetails || {};
  if (!transaction || !payment.cardnetSession || !payment.cardnetSessionKey || !payment.cardnetBaseUrl) {
    return fail(404, "No se encontró una sesión CardNET pendiente.");
  }
  const resultUrl = payment.cardnetBaseUrl.replace(/\/+$/, "") + "/api/payment/sessions/" + encodeURIComponent(payment.cardnetSession) + "?sk=" + encodeURIComponent(payment.cardnetSessionKey);
  const result = await fetch(resultUrl, { headers: { "Accept": "application/json" } });
  const data = await result.json().catch(() => ({}));
  const code = clean(data.ResponseCode || data.responseCode);
  if (result.ok && code === "00") {
    await markPaymentPaid(env, transactionId, { providerReference: data.RetrievalReferenceNumber || data.RetrivalReferenceNumber || payment.cardnetSession });
  } else if (result.ok && code) {
    await updateTransaction(env, transactionId, {
      status: "payment_failed",
      "paymentDetails/paymentStatus": "failed",
      "paymentDetails/providerResponseCode": code,
      "paymentDetails/providerMessage": clean(data.ResponseMessage || data.ResponseDescription || ""),
      "timestamps/updated": Date.now()
    });
  } else {
    return fail(502, "CardNET aún no confirmó el resultado. La transacción permanece pendiente de verificación.");
  }
  const destination = new URL(clean(env.APP_RETURN_URL || "https://sendwayo-oficial.github.io/sendwayo-express/SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html"));
  destination.searchParams.set("payment", code === "00" ? "paid" : "failed");
  destination.searchParams.set("transaction", transactionId);
  return Response.redirect(destination.toString(), 303);
}
async function getAllTransactions(env) {
  return await dbGet(env, ROOT + "/transactions") || {};
}
async function listTransactions(user, env) {
  const all = await getAllTransactions(env);
  const admin = isAdmin(user);
  const rows = Object.entries(all).filter(([id, row]) => admin || (
    row && (row.ownerAuthUid === user.identity.uid || row.firebaseUid === user.identity.uid)
  )).map(([id, row]) => Object.assign({ transactionId: id }, row));
  rows.sort((a, b) => Number(b.timestamps && b.timestamps.created || 0) - Number(a.timestamps && a.timestamps.created || 0));
  return response(200, { transactions: rows, admin });
}
async function dispatchPayout(request, env, user) {
  if (!isAdmin(user)) return fail(403, "Solo Administración puede ordenar la dispersión.");
  const body = await request.json().catch(() => ({}));
  const transactionId = clean(body.transactionId);
  if (!transactionId) return fail(400, "Falta transactionId.");
  const key = safeKey(transactionId);
  const transaction = await dbGet(env, ROOT + "/transactions/" + key);
  if (!transaction) return fail(404, "No existe esa transacción.");
  if (!transaction.paymentDetails || transaction.paymentDetails.paymentStatus !== "paid") return fail(409, "No se puede dispersar: el pago no ha sido confirmado.");
  if (transaction.status === "completed") return fail(409, "La dispersión ya está completada.");
  const existing = await dbGet(env, ROOT + "/payoutRequests/" + key) || {};
  if (["assigned_to_agent", "dispatched", "completed"].includes(existing.status)) return fail(409, "Ya existe una orden de dispersión asignada o completada.");
  const recipient = transaction.recipientInfo || {};
  const payout = transaction.payoutDetails || {};
  const now = Date.now();
  let status = "awaiting_provider_configuration";
  let agentInfo = payout.agentInfo || {};
  if (recipient.destinationType === "AUTHORIZED_AGENT") {
    const agentId = clean(body.agentId || agentInfo.agentId);
    if (!agentId) return fail(400, "Para dispersión por agentes, seleccione un agente autorizado.");
    const users = await dbGet(env, ROOT + "/users") || {};
    const match = Object.entries(users).find(([uid, profile]) =>
      profile && [profile.id, profile.staffId, profile.code, profile.codigo, uid].some(value => clean(value) === agentId)
    );
    if (!match) return fail(404, "No se encontró el agente indicado.");
    const agent = match[1];
    if (profileRole(agent) !== "agente" && profileRole(agent) !== "agent") return fail(400, "La cuenta seleccionada no tiene rol de agente.");
    if (agent.active === false || ["inactivo", "inactive"].includes(norm(agent.status || agent.estado))) return fail(409, "El agente está inactivo.");
    agentInfo = {
      agentId: clean(agent.id || agent.staffId || agentId),
      agentName: clean(agent.name || agent.nombre || ""),
      agentAuthUid: clean(agent.authUid),
      agentUserKey: match[0]
    };
    if (!agentInfo.agentAuthUid) return fail(409, "El agente todavía no tiene authUid vinculado en Firebase.");
    status = "assigned_to_agent";
  }
  const payoutReference = clean(existing.payoutReference) || "SWP-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
  const updated = Object.assign({}, existing, {
    id: key,
    transactionId,
    provider: recipient.provider,
    destinationType: recipient.destinationType,
    settlementType: payout.settlementType,
    country: recipient.country,
    targetCurrency: payout.targetCurrency,
    targetAmount: payout.targetAmount,
    agentInfo,
    payoutReference,
    status,
    assignedAgentAuthUid: agentInfo.agentAuthUid || "",
    createdByAuthUid: user.identity.uid,
    updatedAtMs: now
  });
  await dbPut(env, ROOT + "/payoutRequests/" + key, updated);
  await updateTransaction(env, transactionId, {
    "payoutDetails/agentInfo": agentInfo,
    "payoutDetails/payoutReference": payoutReference,
    "payoutDetails/status": status,
    "payoutDetails/assignedAt": now,
    "assignedAgentAuthUid": agentInfo.agentAuthUid || "",
    "timestamps/updated": now
  });
  return response(202, {
    payout: updated,
    note: status === "assigned_to_agent"
      ? "Orden asignada al agente autorizado. El agente debe confirmar la entrega real."
      : "Orden registrada. Para transferir a banco o comercio falta conectar y certificar el proveedor correspondiente."
  });
}
async function payoutQueue(env, user) {
  const all = await dbGet(env, ROOT + "/payoutRequests") || {};
  const rows = Object.entries(all).filter(([id, row]) => isAdmin(user) || row.assignedAgentAuthUid === user.identity.uid)
    .map(([id, row]) => Object.assign({ id }, row));
  rows.sort((a, b) => Number(b.updatedAtMs || b.createdAtMs || 0) - Number(a.updatedAtMs || a.createdAtMs || 0));
  return response(200, { payouts: rows, admin: isAdmin(user) });
}
async function confirmPayout(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const transactionId = clean(body.transactionId);
  const providerReference = clean(body.providerReference, 120);
  const evidence = clean(body.evidence, 500);
  if (!transactionId || !providerReference) return fail(400, "Indique transactionId y la referencia real del pago al beneficiario.");
  const key = safeKey(transactionId);
  const payout = await dbGet(env, ROOT + "/payoutRequests/" + key);
  const transaction = await dbGet(env, ROOT + "/transactions/" + key);
  if (!payout || !transaction) return fail(404, "No existe la orden de dispersión.");
  if (!isAdmin(user) && payout.assignedAgentAuthUid !== user.identity.uid) return fail(403, "Este agente no está asignado a la orden.");
  if (payout.status === "completed" || transaction.status === "completed") return fail(409, "La orden ya fue completada.");
  if (!transaction.paymentDetails || transaction.paymentDetails.paymentStatus !== "paid") return fail(409, "El pago de origen aún no está confirmado.");
  const now = Date.now();
  await dbPatch(env, ROOT + "/payoutRequests/" + key, {
    status: "completed",
    providerReference,
    evidence,
    completedByAuthUid: user.identity.uid,
    completedAtMs: now,
    updatedAtMs: now
  });
  await updateTransaction(env, transactionId, {
    status: "completed",
    "payoutDetails/status": "completed",
    "payoutDetails/payoutReference": providerReference,
    "payoutDetails/completionEvidence": evidence,
    "payoutDetails/completedByAuthUid": user.identity.uid,
    "payoutDetails/completedAt": now,
    "timestamps/updated": now,
    "timestamps/completed": now
  });
  return response(200, { transactionId, status: "completed", completedAt: now });
}
async function handleApi(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request, env) });
  if (request.method === "GET" && url.pathname === "/api/health") {
    return response(200, {
      ok: true,
      service: "SENDWAYO EXPRESS Payments and Payout Engine",
      version: API_VERSION,
      gateways: {
        stripe: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_ACCOUNT_COUNTRY),
        cardnet: Boolean(env.CARDNET_MERCHANT_NUMBER && env.CARDNET_MERCHANT_TERMINAL && env.CARDNET_ACQUIRER_CODE),
        azul: false
      },
      payoutModes: ["AUTHORIZED_AGENT", "BANK_ACCOUNT", "MERCHANT"]
    }, cors(request, env));
  }
  if (request.method === "POST" && url.pathname === "/api/webhooks/stripe") {
    const result = await stripeWebhook(request, env);
    return new Response(result.body, { status: result.status, headers: Object.assign({}, Object.fromEntries(result.headers), cors(request, env)) });
  }
  if (request.method === "GET" && url.pathname === "/api/cardnet/return") {
    return cardnetReturn(request, env);
  }
  let user;
  try { user = await authenticate(request, env); }
  catch (error) { return fail(401, error.message || "No se pudo verificar la sesión.", cors(request, env)); }
  if (request.method === "POST" && url.pathname === "/api/verify") {
    return response(200, { valid: true, user: { uid: user.identity.uid, email: user.identity.email, role: user.profile.role, id: user.profile.profile.id || "" } }, cors(request, env));
  }
  if (request.method === "POST" && url.pathname === "/api/payments/create") {
    const result = await createPayment(request, env, user);
    return new Response(result.body, { status: result.status, headers: Object.assign({}, Object.fromEntries(result.headers), cors(request, env)) });
  }
  if (request.method === "GET" && url.pathname === "/api/transactions") {
    const result = await listTransactions(user, env);
    return new Response(result.body, { status: result.status, headers: Object.assign({}, Object.fromEntries(result.headers), cors(request, env)) });
  }
  if (request.method === "GET" && url.pathname === "/api/payouts/queue") {
    const result = await payoutQueue(env, user);
    return new Response(result.body, { status: result.status, headers: Object.assign({}, Object.fromEntries(result.headers), cors(request, env)) });
  }
  if (request.method === "POST" && url.pathname === "/api/payouts/dispatch") {
    const result = await dispatchPayout(request, env, user);
    return new Response(result.body, { status: result.status, headers: Object.assign({}, Object.fromEntries(result.headers), cors(request, env)) });
  }
  if (request.method === "POST" && url.pathname === "/api/payouts/confirm") {
    const result = await confirmPayout(request, env, user);
    return new Response(result.body, { status: result.status, headers: Object.assign({}, Object.fromEntries(result.headers), cors(request, env)) });
  }
  return fail(404, "Ruta no disponible.", cors(request, env));
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleApi(request, env);
    } catch (error) {
      console.error("[SENDWAYO Worker]", error && error.message ? error.message : error);
      return fail(500, "Error interno del servicio de pagos. No se confirmó ningún pago ni dispersión.", cors(request, env));
    }
  }
};