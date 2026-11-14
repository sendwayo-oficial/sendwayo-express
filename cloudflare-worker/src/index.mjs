const ROOT = "sendwayo_express_v2";
const DEFAULT_DATABASE_URL = "https://sendwayo-express-default-rtdb.firebaseio.com";
const DEFAULT_ALLOWED_ORIGINS = ["https://sendwayo-oficial.github.io"];
const MAX_ROOT_BYTES = 16 * 1024 * 1024;
const MAX_CAS_ATTEMPTS = 5;
const textEncoder = new TextEncoder();
let oauthCache = { token: "", expiresAt: 0 };

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }, headers || {})
  });
}
function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",").map(function (v) { return v.trim(); }).filter(Boolean);
}
function cors(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = allowedOrigins(env);
  const headers = {
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Authorization,Content-Type",
    "access-control-max-age": "86400",
    "vary": "Origin"
  };
  if (origin && allowed.indexOf(origin) >= 0) headers["access-control-allow-origin"] = origin;
  return { allowed: !origin || allowed.indexOf(origin) >= 0, headers: headers };
}
function norm(value) {
  return String(value == null ? "" : value).normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
function money(value) {
  const parsed = typeof value === "number" ? value : Number(String(value == null ? "" : value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? round2(parsed) : 0;
}
function currency(value) {
  const valueNorm = norm(value);
  if (["dop", "rd$", "peso", "pesos"].indexOf(valueNorm) >= 0) return "DOP";
  if (["htg", "gdes", "gourde", "gourdes"].indexOf(valueNorm) >= 0) return "HTG";
  return valueNorm.toUpperCase();
}
function isRdHtNatcashMoncash(record) {
  const origin = norm(record.originCountry || (record.countryFrom && record.countryFrom.iso2) || record.paisOrigenISO2);
  const destination = norm(record.destinationCountry || (record.countryTo && record.countryTo.iso2) || record.paisDestinoISO2);
  const route = norm([record.route, record.routeExact, record.ruta, record.rutaExacta, record.service, record.description].filter(Boolean).join(" "));
  const provider = norm([record.destinationProvider, record.provider, record.proveedorDestino, route].filter(Boolean).join(" "));
  const direction = (origin === "do" && destination === "ht") ||
    /(?:^|\b)(?:rd|republica dominicana|dominicana)\s*(?:->|→|>|a|to|-)\s*(?:ht|haiti)\b/.test(route) ||
    /republica dominicana.{0,50}\bhaiti\b/.test(route);
  const supportedProvider = /\b(natcash|moncash|montcash)\b/.test(provider);
  const currencyValue = currency(record.currency || record.currencyCode || record.moneda || "DOP");
  const type = norm(record.type || record.tipo || "");
  return direction && supportedProvider && currencyValue === "DOP" &&
    (type.indexOf("envio") >= 0 || type.indexOf("transfer") >= 0 || type === "");
}
function calculateSettlement(input) {
  const amountDOP = money(input.amountDOP);
  const feeDOP = money(input.feeDOP);
  const expectedFee = Math.round(amountDOP * 0.08);
  const netDOP = input.netDOP == null || input.netDOP === ""
    ? round2(amountDOP - feeDOP) : money(input.netDOP);
  if (!(amountDOP > 0)) throw new Error("INVALID_AMOUNT");
  if (Math.abs(feeDOP - expectedFee) > 0.01) throw new Error("INVALID_DOP_FEE");
  if (Math.abs(netDOP - round2(amountDOP - feeDOP)) > 0.01 || !(netDOP > 0)) throw new Error("INVALID_DOP_NET");
  const grossHTG = round2(netDOP * 2.10);
  const commissionHTG = round2(grossHTG * 0.03);
  const payoutHTG = round2(grossHTG - commissionHTG);
  if (!(grossHTG > 0 && payoutHTG > 0)) throw new Error("INVALID_HTG_SETTLEMENT");
  return {
    amountDOP: amountDOP, feeDOP: feeDOP, netDOP: netDOP,
    rate: 2.10, grossHTG: grossHTG, commissionHTG: commissionHTG, payoutHTG: payoutHTG
  };
}
function base64Url(value) {
  const bytes = typeof value === "string" ? textEncoder.encode(value) : value;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function pemBytes(pem) {
  const body = String(pem || "").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, "");
  if (!body) throw new Error("SERVICE_ACCOUNT_PRIVATE_KEY_MISSING");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function serviceAccountToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (oauthCache.token && oauthCache.expiresAt > now + 90) return oauthCache.token;
  let serviceAccount;
  try { serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || ""); }
  catch (_) { throw new Error("SERVICE_ACCOUNT_SECRET_INVALID_JSON"); }
  if (!serviceAccount || !serviceAccount.client_email || !serviceAccount.private_key || !serviceAccount.token_uri) {
    throw new Error("SERVICE_ACCOUNT_SECRET_MISSING_FIELDS");
  }
  if (serviceAccount.project_id && serviceAccount.project_id !== (env.FIREBASE_PROJECT_ID || "sendwayo-express")) {
    throw new Error("SERVICE_ACCOUNT_PROJECT_MISMATCH");
  }
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: serviceAccount.token_uri,
    scope: "https://www.googleapis.com/auth/firebase.database",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + "." + claims;
  const key = await crypto.subtle.importKey(
    "pkcs8", pemBytes(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, textEncoder.encode(unsigned));
  const assertion = unsigned + "." + base64Url(new Uint8Array(signature));
  const response = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion
    })
  });
  const result = await response.json().catch(function () { return {}; });
  if (!response.ok || !result.access_token) throw new Error("GOOGLE_OAUTH_TOKEN_FAILED");
  oauthCache = { token: result.access_token, expiresAt: now + Number(result.expires_in || 3600) };
  return oauthCache.token;
}
async function firebaseIdentity(idToken, env) {
  const apiKey = String(env.FIREBASE_WEB_API_KEY || "");
  if (!apiKey) throw new Error("FIREBASE_WEB_API_KEY_NOT_CONFIGURED");
  const response = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(apiKey),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: idToken })
    }
  );
  const result = await response.json().catch(function () { return {}; });
  const user = result && result.users && result.users[0];
  if (!response.ok || !user || !user.localId || user.disabled === true) throw new Error("INVALID_FIREBASE_ID_TOKEN");
  return { uid: user.localId, email: norm(user.email), emailOriginal: user.email || "" };
}
async function bearerUser(request, env) {
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("AUTH_REQUIRED");
  return firebaseIdentity(match[1], env);
}
function active(profile) {
  if (!profile || typeof profile !== "object") return false;
  const status = norm(profile.status || profile.accountStatus || profile.estado);
  return profile.active !== false && profile.disabled !== true &&
    ["inactive", "disabled", "inactivo", "deshabilitado", "blocked", "bloqueado"].indexOf(status) < 0;
}
function getActor(root, identity) {
  const admin = root.users && root.users.admin;
  if (admin && admin.authUid === identity.uid && active(admin)) {
    return { role: "ADMIN", userId: "admin", profile: admin };
  }
  const mapping = root.agentAuth && root.agentAuth[identity.uid];
  if (!mapping || mapping.active !== true || mapping.authUid !== identity.uid || !mapping.userId) {
    throw new Error("NOT_AUTHORIZED");
  }
  const profile = root.users && root.users[mapping.userId];
  if (!profile || !active(profile) || norm(profile.role || profile.rol) !== "agente") {
    throw new Error("AGENT_PROFILE_INACTIVE");
  }
  return { role: "AGENTE", userId: mapping.userId, profile: profile };
}
function safeKey(value) {
  return String(value || "").replace(/[.#$[\]/\u0000-\u001f\u007f]/g, "_").slice(0, 180);
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(String(value)));
  return Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}
function recordKey(collection, id) {
  if (!collection || typeof collection !== "object") return "";
  const candidate = safeKey(id);
  if (Object.prototype.hasOwnProperty.call(collection, candidate)) return candidate;
  const rows = Object.entries(collection);
  for (let i = 0; i < rows.length; i++) {
    const value = rows[i][1];
    if (value && typeof value === "object" && String(value.id || value.operationId || "") === String(id)) return rows[i][0];
  }
  return "";
}
function rootUrl(env) {
  return String(env.FIREBASE_DATABASE_URL || DEFAULT_DATABASE_URL).replace(/\/+$/, "") + "/" + ROOT + ".json";
}
async function readRoot(env, token) {
  const response = await fetch(rootUrl(env), {
    headers: { authorization: "Bearer " + token, "x-firebase-etag": "true", "cache-control": "no-cache" }
  });
  const body = await response.text();
  if (!response.ok) throw new Error("FIREBASE_DATABASE_READ_FAILED");
  if (body.length > MAX_ROOT_BYTES) throw new Error("FIREBASE_FINANCIAL_ROOT_TOO_LARGE");
  let value = {};
  try { value = body && body !== "null" ? JSON.parse(body) : {}; }
  catch (_) { throw new Error("FIREBASE_DATABASE_INVALID_JSON"); }
  const etag = response.headers.get("etag");
  if (!etag) throw new Error("FIREBASE_DATABASE_ETAG_MISSING");
  return { value: value && typeof value === "object" ? value : {}, etag: etag };
}
async function writeRoot(env, token, etag, value) {
  const response = await fetch(rootUrl(env), {
    method: "PUT",
    headers: { authorization: "Bearer " + token, "content-type": "application/json", "if-match": etag },
    body: JSON.stringify(value)
  });
  if (response.status === 412) return false;
  if (!response.ok) throw new Error("FIREBASE_DATABASE_WRITE_FAILED");
  return true;
}
async function mutateRoot(env, token, mutate) {
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const snapshot = await readRoot(env, token);
    const result = await mutate(snapshot.value);
    if (result && result.noWrite) return result;
    if (await writeRoot(env, token, snapshot.etag, snapshot.value)) return result;
  }
  throw new Error("FINANCIAL_CONFLICT_RETRY_EXHAUSTED");
}
function writeAdminMoney(admin, balanceHTG, commissionHTG) {
  const balances = Object.assign({}, admin.balances || {});
  const commissions = Object.assign({}, admin.commissions || {});
  const comisiones = Object.assign({}, admin.comisiones || {});
  balances.HTG = balanceHTG;
  commissions.HTG = commissionHTG;
  comisiones.HTG = commissionHTG;
  admin.balanceHTG = balanceHTG;
  admin.balanceHtg = balanceHTG;
  admin.commissionHTG = commissionHTG;
  admin.commissionHtg = commissionHTG;
  admin.balances = balances;
  admin.commissions = commissions;
  admin.comisiones = comisiones;
  admin.updatedAtMs = Date.now();
}
function creatorIsAdmin(record) {
  const role = norm(record.createdByRole || "");
  const userId = norm(record.createdByUserId || record.createdById || "");
  return role === "admin" || userId === "admin" || userId === "adminadmin" || userId === "admin-000";
}
function assertCanReview(record, actor, identity) {
  if (actor.role === "ADMIN") return;
  if (actor.role !== "AGENTE") throw new Error("NOT_AUTHORIZED");
  if (record.createdByAuthUid === identity.uid ||
      norm(record.createdByUserId || "") === norm(actor.userId) ||
      creatorIsAdmin(record)) throw new Error("AGENT_CANNOT_APPROVE_OWN_OR_ADMIN_TRANSACTION");
  if (norm(record.status || record.estado) !== "pendiente") throw new Error("TRANSACTION_NOT_PENDING");
}
async function settle(request, env) {
  const identity = await bearerUser(request, env);
  const body = await request.json().catch(function () { return {}; });
  const transactionId = String(body.transactionId || "").trim();
  if (!transactionId || transactionId.length > 180) throw new Error("TRANSACTION_ID_REQUIRED");
  const token = await serviceAccountToken(env);
  const settlementId = "rdht_" + (await sha256(transactionId)).slice(0, 24);

  return mutateRoot(env, token, function (root) {
    const actor = getActor(root, identity);
    root.envios = root.envios || {};
    root.internalSettlements = root.internalSettlements || {};
    root.commissions = root.commissions || {};
    root.ledger = root.ledger || {};
    root.audit = root.audit || {};

    const sourceKey = recordKey(root.envios, transactionId);
    if (!sourceKey) throw new Error("TRANSACTION_NOT_FOUND");
    const original = root.envios[sourceKey];

    if (original.internalSettlementId) {
      const existing = root.internalSettlements[original.internalSettlementId];
      if (existing && (existing.status === "Aprobado" || existing.estado === "Aprobado")) {
        return {
          noWrite: true, alreadySettled: true, transactionId: transactionId,
          settlementId: original.internalSettlementId, amounts: existing.amounts || null
        };
      }
      throw new Error("SETTLEMENT_MARKED_BUT_RECORD_MISSING");
    }

    assertCanReview(original, actor, identity);
    if (!isRdHtNatcashMoncash(original)) throw new Error("NOT_RD_TO_HT_NATCASH_MONCASH");
    const amounts = calculateSettlement({
      amountDOP: original.amount != null ? original.amount : (original.montoValue != null ? original.montoValue : original.monto),
      feeDOP: original.commission != null ? original.commission : (original.fee != null ? original.fee : original.comision),
      netDOP: original.net != null ? original.net : original.neto
    });

    const admin = root.users && root.users.admin;
    if (!admin || !active(admin)) throw new Error("ADMIN_PROFILE_NOT_AVAILABLE");
    const currentBalance = money(admin.balanceHTG != null ? admin.balanceHTG :
      (admin.balanceHtg != null ? admin.balanceHtg : (admin.balances && admin.balances.HTG)));
    const currentCommission = money(admin.commissionHTG != null ? admin.commissionHTG :
      (admin.commissionHtg != null ? admin.commissionHtg :
        (admin.commissions && admin.commissions.HTG != null ? admin.commissions.HTG :
          (admin.comisiones && admin.comisiones.HTG))));
    if (currentBalance + 0.001 < amounts.payoutHTG) throw new Error("ADMIN_HTG_BALANCE_INSUFFICIENT");

    const now = Date.now();
    const providerSource = norm(original.destinationProvider || original.provider || original.proveedorDestino ||
      original.route || original.ruta || "");
    const provider = providerSource.indexOf("moncash") >= 0 ? "MonCash" : "NatCash";
    const internal = {
      id: settlementId,
      type: "Envío interno HT→HT",
      tipo: "Envío interno HT→HT",
      status: "Aprobado",
      estado: "Aprobado",
      currency: "HTG",
      currencyCode: "HTG",
      amount: amounts.grossHTG,
      montoValue: amounts.grossHTG,
      commission: amounts.commissionHTG,
      fee: amounts.commissionHTG,
      net: amounts.payoutHTG,
      neto: amounts.payoutHTG,
      route: "HT → HT " + provider,
      routeExact: "HT → HT " + provider,
      ruta: "HT → HT " + provider,
      rutaExacta: "HT → HT " + provider,
      originCountry: "HT",
      destinationCountry: "HT",
      destinationProvider: provider,
      beneficiary: String(original.beneficiary || original.beneficiario || ""),
      beneficiaryPhone: String(original.beneficiaryPhone || original.beneficiarioTel || ""),
      userId: "admin",
      createdByAuthUid: identity.uid,
      createdByUserId: actor.userId,
      createdByRole: actor.role,
      sourceCollection: "envios",
      sourceTransactionId: transactionId,
      originTransactionId: transactionId,
      createdAtMs: now,
      updatedAtMs: now,
      approvedAtMs: now,
      approvedByAuthUid: identity.uid,
      approvedByRole: actor.role,
      accountingType: "LIQUIDACION_INTERNA_RD_HT",
      amounts: amounts
    };

    const newBalance = round2(currentBalance - amounts.payoutHTG);
    const newCommission = round2(currentCommission + amounts.commissionHTG);
    writeAdminMoney(admin, newBalance, newCommission);

    original.status = "Aprobado";
    original.estado = "Aprobado";
    original.approvedByAuthUid = identity.uid;
    original.approvedByRole = actor.role;
    original.approvedAtMs = now;
    original.updatedAtMs = now;
    original.receivedAmount = amounts.grossHTG.toFixed(2) + " HTG";
    original.montoRecibido = original.receivedAmount;
    original.internalSettlementId = settlementId;
    original.internalSettlementStatus = "Aprobado";
    original.settlementType = "RD_TO_HT_NATCASH_MONCASH";

    root.internalSettlements[settlementId] = internal;
    root.commissions[settlementId] = {
      id: settlementId,
      userId: "admin",
      amount: amounts.commissionHTG,
      currency: "HTG",
      accountingType: "COMISION_GENERADA_RD_HT",
      sourceCollection: "envios",
      sourceId: transactionId,
      originTransactionId: transactionId,
      settlementId: settlementId,
      status: "Aprobado",
      createdAtMs: now,
      createdByAuthUid: identity.uid
    };
    root.ledger[settlementId] = {
      id: settlementId,
      ledgerLocked: true,
      ledgerEvent: "APROBACION",
      recordId: transactionId,
      sourceCollection: "envios",
      sourceId: transactionId,
      transactionType: "LIQUIDACION_INTERNA_RD_HT",
      currency: "HTG",
      grossAmount: amounts.grossHTG,
      commissionCredit: amounts.commissionHTG,
      adminBalanceDebit: amounts.payoutHTG,
      adminBalanceBefore: currentBalance,
      adminBalanceAfter: newBalance,
      adminCommissionBefore: currentCommission,
      adminCommissionAfter: newCommission,
      settlementId: settlementId,
      actorUid: identity.uid,
      actorRole: actor.role,
      createdAtMs: now
    };
    root.audit[settlementId + "_approved"] = {
      id: settlementId + "_approved",
      event: "RD_HT_INTERNAL_SETTLEMENT_APPROVED",
      sourceCollection: "envios",
      sourceId: transactionId,
      settlementId: settlementId,
      actorUid: identity.uid,
      actorRole: actor.role,
      createdAtMs: now
    };
    return {
      transactionId: transactionId,
      settlementId: settlementId,
      alreadySettled: false,
      amounts: amounts,
      adminBalanceHTG: newBalance,
      adminCommissionHTG: newCommission
    };
  });
}
async function reverse(request, env) {
  const identity = await bearerUser(request, env);
  const body = await request.json().catch(function () { return {}; });
  const transactionId = String(body.transactionId || "").trim();
  if (!transactionId || transactionId.length > 180) throw new Error("TRANSACTION_ID_REQUIRED");
  const token = await serviceAccountToken(env);

  return mutateRoot(env, token, function (root) {
    const actor = getActor(root, identity);
    if (actor.role !== "ADMIN") throw new Error("ADMIN_ONLY_REVERSAL");
    const sourceKey = recordKey(root.envios || {}, transactionId);
    if (!sourceKey) throw new Error("TRANSACTION_NOT_FOUND");
    const original = root.envios[sourceKey];
    const settlementId = String(original.internalSettlementId || "");
    if (!settlementId) throw new Error("NO_INTERNAL_SETTLEMENT");
    const internal = root.internalSettlements && root.internalSettlements[settlementId];
    const commissionRow = root.commissions && root.commissions[settlementId];
    if (!internal || !commissionRow) throw new Error("SETTLEMENT_RECORD_MISSING");
    if (original.internalSettlementStatus === "Revertido" || internal.status === "Revertido") {
      return { noWrite: true, alreadyReversed: true, transactionId: transactionId, settlementId: settlementId };
    }

    const amounts = internal.amounts || original.settlementAmounts;
    if (!amounts) throw new Error("SETTLEMENT_AMOUNTS_MISSING");
    const admin = root.users && root.users.admin;
    if (!admin) throw new Error("ADMIN_PROFILE_NOT_AVAILABLE");
    const currentBalance = money(admin.balanceHTG != null ? admin.balanceHTG :
      (admin.balanceHtg != null ? admin.balanceHtg : (admin.balances && admin.balances.HTG)));
    const currentCommission = money(admin.commissionHTG != null ? admin.commissionHTG :
      (admin.commissionHtg != null ? admin.commissionHtg :
        (admin.commissions && admin.commissions.HTG != null ? admin.commissions.HTG :
          (admin.comisiones && admin.comisiones.HTG))));
    if (currentCommission + 0.001 < money(amounts.commissionHTG)) throw new Error("ADMIN_COMMISSION_ALREADY_SPENT");

    const now = Date.now();
    const newBalance = round2(currentBalance + money(amounts.payoutHTG));
    const newCommission = round2(currentCommission - money(amounts.commissionHTG));
    writeAdminMoney(admin, newBalance, newCommission);
    original.status = "Revertido";
    original.estado = "Revertido";
    original.internalSettlementStatus = "Revertido";
    original.reversedAtMs = now;
    original.reversedByAuthUid = identity.uid;
    original.updatedAtMs = now;
    internal.status = "Revertido";
    internal.estado = "Revertido";
    internal.reversedAtMs = now;
    internal.reversedByAuthUid = identity.uid;
    commissionRow.status = "Revertido";
    commissionRow.reversedAtMs = now;

    root.ledger = root.ledger || {};
    root.audit = root.audit || {};
    const reversalId = settlementId + "_rev";
    root.ledger[reversalId] = {
      id: reversalId,
      ledgerLocked: true,
      ledgerEvent: "REVERSAL",
      recordId: transactionId,
      sourceCollection: "envios",
      sourceId: transactionId,
      transactionType: "REVERSO_LIQUIDACION_INTERNA_RD_HT",
      currency: "HTG",
      adminBalanceCredit: money(amounts.payoutHTG),
      adminCommissionDebit: money(amounts.commissionHTG),
      adminBalanceBefore: currentBalance,
      adminBalanceAfter: newBalance,
      adminCommissionBefore: currentCommission,
      adminCommissionAfter: newCommission,
      settlementId: settlementId,
      actorUid: identity.uid,
      actorRole: actor.role,
      createdAtMs: now
    };
    root.audit[reversalId + "_audit"] = {
      id: reversalId + "_audit",
      event: "RD_HT_INTERNAL_SETTLEMENT_REVERSED",
      sourceCollection: "envios",
      sourceId: transactionId,
      settlementId: settlementId,
      actorUid: identity.uid,
      actorRole: actor.role,
      createdAtMs: now
    };
    return {
      transactionId: transactionId,
      settlementId: settlementId,
      alreadyReversed: false,
      adminBalanceHTG: newBalance,
      adminCommissionHTG: newCommission
    };
  });
}
function errorResponse(error) {
  const code = String(error && error.message || "INTERNAL_ERROR");
  const statuses = {
    AUTH_REQUIRED: 401,
    INVALID_FIREBASE_ID_TOKEN: 401,
    NOT_AUTHORIZED: 403,
    ADMIN_ONLY_REVERSAL: 403,
    AGENT_CANNOT_APPROVE_OWN_OR_ADMIN_TRANSACTION: 403,
    AGENT_PROFILE_INACTIVE: 403,
    ADMIN_PROFILE_NOT_AVAILABLE: 409,
    TRANSACTION_NOT_FOUND: 404,
    NO_INTERNAL_SETTLEMENT: 409,
    SETTLEMENT_RECORD_MISSING: 409,
    SETTLEMENT_MARKED_BUT_RECORD_MISSING: 409,
    TRANSACTION_NOT_PENDING: 409,
    NOT_RD_TO_HT_NATCASH_MONCASH: 422,
    INVALID_AMOUNT: 422,
    INVALID_DOP_FEE: 422,
    INVALID_DOP_NET: 422,
    INVALID_HTG_SETTLEMENT: 422,
    ADMIN_HTG_BALANCE_INSUFFICIENT: 409,
    ADMIN_COMMISSION_ALREADY_SPENT: 409,
    FINANCIAL_CONFLICT_RETRY_EXHAUSTED: 409,
    TRANSACTION_ID_REQUIRED: 400,
    SERVICE_ACCOUNT_SECRET_INVALID_JSON: 503,
    SERVICE_ACCOUNT_SECRET_MISSING_FIELDS: 503,
    SERVICE_ACCOUNT_PRIVATE_KEY_MISSING: 503,
    SERVICE_ACCOUNT_PROJECT_MISMATCH: 503,
    FIREBASE_WEB_API_KEY_NOT_CONFIGURED: 503,
    FIREBASE_FINANCIAL_ROOT_TOO_LARGE: 503
  };
  const safeCode = statuses[code] ? code : "FINANCIAL_SERVICE_UNAVAILABLE";
  return { status: statuses[code] || 503, body: { ok: false, error: safeCode } };
}
export const __test = Object.freeze({
  norm: norm,
  currency: currency,
  isRdHtNatcashMoncash: isRdHtNatcashMoncash,
  calculateSettlement: calculateSettlement,
  round2: round2,
  money: money
});
export default {
  async fetch(request, env) {
    const policy = cors(request, env);
    if (!policy.allowed) return jsonResponse({ ok: false, error: "ORIGIN_NOT_ALLOWED" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: policy.headers });
    const path = new URL(request.url).pathname;
    if (path === "/status" && request.method === "GET") {
      return jsonResponse({ ok: true, status: "online", service: "SENDWAYO EXPRESS Financial API" }, 200, policy.headers);
    }
    if (path === "/api/verify" && request.method === "POST") {
      try {
        const identity = await bearerUser(request, env);
        return jsonResponse({ valid: true, user: { uid: identity.uid } }, 200, policy.headers);
      } catch (error) {
        const failure = errorResponse(error);
        return jsonResponse(failure.body, failure.status, policy.headers);
      }
    }
    if (path !== "/api/settle-rd-ht" && path !== "/api/reverse-rd-ht") {
      return jsonResponse({ ok: false, error: "NOT_FOUND" }, 404, policy.headers);
    }
    if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405, policy.headers);
    try {
      const result = path === "/api/settle-rd-ht" ? await settle(request, env) : await reverse(request, env);
      return jsonResponse(Object.assign({ ok: true }, result), 200, policy.headers);
    } catch (error) {
      const failure = errorResponse(error);
      return jsonResponse(failure.body, failure.status, policy.headers);
    }
  }
};
