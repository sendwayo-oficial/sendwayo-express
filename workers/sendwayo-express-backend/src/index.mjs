const ROOT = "sendwayo_express_v2";
const DB_DEFAULT = "https://sendwayo-express-default-rtdb.firebaseio.com";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const IDENTITY_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const ADMIN_EMAILS = new Set(["ideletteismorin@gmail.com", "sendwayoexpress@gmail.com"]);
const RATE = 2.10, DOP_FEE = 0.08, HTG_FEE = 0.03;
let tokenCache = { token: "", expiresAt: 0 };

const cents = (v) => Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
const norm = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
const safeKey = (v) => {
  const k = String(v ?? "").replace(/[.#$\[\]/]/g, "_");
  if (!k || k === "." || k === "..") throw new Error("ID no válido.");
  return k;
};
const roleOf = (p) => {
  const r = norm(p?.role || p?.rol);
  if (["admin", "administrador", "administration"].includes(r)) return "ADMIN";
  if (["agente", "agent", "agentes"].includes(r)) return "AGENTE";
  if (["remitente", "remitentes", "sender", "remitter"].includes(r)) return "REMITENTE";
  return "";
};
const fmt = (v) => cents(v).toFixed(2);
function b64url(bytes) {
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, Math.min(i + 0x8000, a.length)));
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
const json64 = (v) => b64url(new TextEncoder().encode(JSON.stringify(v)));
function pemBytes(pem) {
  const body = String(pem || "").replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const raw = atob(body), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
async function firebaseServiceToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.token && tokenCache.expiresAt > now + 60) return tokenCache.token;
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("Falta el secreto FIREBASE_SERVICE_ACCOUNT_JSON en Cloudflare.");
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!sa.client_email || !sa.private_key) throw new Error("El secreto de Firebase está incompleto.");
  const unsigned = json64({ alg: "RS256", typ: "JWT" }) + "." + json64({
    iss: sa.client_email, sub: sa.client_email, aud: TOKEN_URL, iat: now, exp: now + 3500,
    scope: "https://www.googleapis.com/auth/firebase.database"
  });
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = unsigned + "." + b64url(signature);
  const res = await fetch(TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error("Firebase no entregó el token de servicio (" + res.status + ").");
  tokenCache = { token: data.access_token, expiresAt: now + Number(data.expires_in || 3500) };
  return tokenCache.token;
}
async function verifyFirebaseIdentity(idToken, env) {
  if (!env.FIREBASE_WEB_API_KEY) throw new Error("Falta el secreto FIREBASE_WEB_API_KEY en Cloudflare.");
  const res = await fetch(IDENTITY_URL + "?key=" + encodeURIComponent(env.FIREBASE_WEB_API_KEY), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken })
  });
  const data = await res.json().catch(() => ({}));
  const user = Array.isArray(data.users) ? data.users[0] : null;
  if (!res.ok || !user?.localId || user.disabled === true) {
    const e = new Error("La sesión de Firebase no es válida o está desactivada."); e.status = 401; throw e;
  }
  return { uid: user.localId, email: norm(user.email) };
}
function bearer(request) {
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) { const e = new Error("Falta la sesión autenticada de Firebase."); e.status = 401; throw e; }
  return match[1];
}
const dbUrl = (env) => String(env.FIREBASE_DATABASE_URL || DB_DEFAULT).replace(/\/+$/, "");
async function readRoot(env, accessToken) {
  const res = await fetch(dbUrl(env) + "/" + ROOT + ".json?access_token=" + encodeURIComponent(accessToken), {
    headers: { "X-Firebase-ETag": "true", "Cache-Control": "no-store" }
  });
  if (!res.ok) throw new Error("No se pudo leer Firebase (" + res.status + "): " + (await res.text()).slice(0, 250));
  const etag = res.headers.get("ETag");
  if (!etag) throw new Error("Firebase no devolvió la ETag de control.");
  return { root: (await res.json()) || {}, etag };
}
async function writeRoot(env, accessToken, root, etag) {
  const res = await fetch(dbUrl(env) + "/" + ROOT + ".json?access_token=" + encodeURIComponent(accessToken), {
    method: "PUT",
    headers: { "Content-Type": "application/json", "If-Match": etag, "Cache-Control": "no-store" },
    body: JSON.stringify(root)
  });
  if (res.status === 412) return false;
  if (!res.ok) throw new Error("Firebase rechazó la operación (" + res.status + "): " + (await res.text()).slice(0, 300));
  return true;
}
function actorFrom(root, identity) {
  const users = root.users || {}, admin = users.admin;
  if (admin && admin.authUid === identity.uid && roleOf(admin) === "ADMIN") {
    return { role: "ADMIN", userKey: "admin", profile: admin, uid: identity.uid };
  }
  const mapping = root.agentAuth?.[identity.uid] || {}, profile = users[String(mapping.userId || "")];
  if (mapping.active === true && mapping.authUid === identity.uid && profile?.authUid === identity.uid && roleOf(profile) === "AGENTE") {
    return { role: "AGENTE", userKey: String(mapping.userId), profile, uid: identity.uid };
  }
  const e = new Error("La identidad no tiene rol activo de Administración o Agente."); e.status = 403; throw e;
}
function findParent(root, id) {
  const rows = root.envios || {}, value = String(id || "");
  if (!value) return null;
  if (rows[value]) return { key: value, row: rows[value] };
  for (const [key, row] of Object.entries(rows)) if (String(row?.id || row?.operationId || "") === value) return { key, row };
  return null;
}
function findUserKey(users, candidates) {
  for (const candidate of candidates.filter(Boolean).map(String)) {
    if (users[candidate]) return candidate;
    const wanted = norm(candidate);
    const found = Object.entries(users).find(([key, p]) =>
      [key, p?.id, p?.legacyId, p?.accountId, p?.staffId, p?.code, p?.codigo, p?.email, p?.authEmail].some(v => norm(v) === wanted));
    if (found) return found[0];
  }
  return "";
}
function isRdHtNatcashRoute(row) {
  const route = norm([row?.route, row?.ruta, row?.routeName, row?.service, row?.type, row?.tipo].filter(Boolean).join(" "));
  return /(^|[^a-z0-9])(rd|republica dominicana)([^a-z0-9]|$)/.test(route)
    && /(^|[^a-z0-9])(ht|haiti|hati)([^a-z0-9]|$)/.test(route)
    && /natcash|moncash/.test(route);
}
function moneyOf(profile) {
  const b = profile?.balances && typeof profile.balances === "object" ? profile.balances : {};
  const c = profile?.commissions && typeof profile.commissions === "object" ? profile.commissions : (profile?.comisiones || {});
  return {
    balances: { DOP: Number(profile?.balanceDOP ?? profile?.balance ?? b.DOP ?? 0) || 0, HTG: Number(profile?.balanceHTG ?? profile?.balanceHtg ?? b.HTG ?? 0) || 0 },
    commissions: { DOP: Number(profile?.commissionDOP ?? profile?.commission ?? c.DOP ?? 0) || 0, HTG: Number(profile?.commissionHTG ?? profile?.commissionHtg ?? c.HTG ?? 0) || 0 }
  };
}
function writeMoney(profile, m) {
  profile.balance = profile.balanceDOP = profile.balanceRD = cents(m.balances.DOP);
  profile.balanceHTG = profile.balanceHtg = cents(m.balances.HTG);
  profile.commission = profile.commissionDOP = cents(m.commissions.DOP);
  profile.commissionHTG = profile.commissionHtg = cents(m.commissions.HTG);
  profile.balances = { ...(profile.balances || {}), DOP: cents(m.balances.DOP), HTG: cents(m.balances.HTG) };
  profile.commissions = { ...(profile.commissions || {}), DOP: cents(m.commissions.DOP), HTG: cents(m.commissions.HTG) };
  profile.comisiones = { ...(profile.comisiones || {}), DOP: cents(m.commissions.DOP), HTG: cents(m.commissions.HTG) };
}
function getTransactionAmounts(parent) {
  const amountDop = cents(parent.amount ?? parent.montoValue ?? parent.amountValue ?? 0);
  const feeDop = cents(parent.commission ?? parent.fee ?? parent.comision ?? 0);
  if (!(amountDop > 0) || Math.abs(feeDop - cents(amountDop * DOP_FEE)) > 0.01) {
    const e = new Error("El monto o la comisión DOP no coincide con el 8%."); e.status = 422; throw e;
  }
  if (parent.currency && String(parent.currency).toUpperCase() !== "DOP") {
    const e = new Error("La ruta RD → HT debe debitar DOP."); e.status = 422; throw e;
  }
  const netDop = cents(amountDop - feeDop);
  if (parent.net !== undefined && Math.abs(cents(parent.net) - netDop) > 0.02) {
    const e = new Error("El neto DOP guardado no coincide con la comisión del 8%."); e.status = 409; throw e;
  }
  const grossHtg = cents(netDop * RATE);
  const commissionHtg = cents(grossHtg * HTG_FEE);
  return { amountDop, feeDop, netDop, grossHtg, commissionHtg, payoutHtg: cents(grossHtg - commissionHtg) };
}
function ensureAudit(root) {
  root.audit = root.audit && typeof root.audit === "object" ? root.audit : {};
  root.ledger = root.ledger && typeof root.ledger === "object" ? root.ledger : {};
  root.internalSettlements = root.internalSettlements && typeof root.internalSettlements === "object" ? root.internalSettlements : {};
}
function alreadySettled(parent, internal, id) {
  return !!internal && String(parent?.internalSettlementId || "") === id
    && ["settled", "aprobado"].includes(norm(parent?.financialSettlementStatus))
    && ["aprobado", "settled"].includes(norm(internal?.status || internal?.estado));
}
function makeInternal(parent, parentKey, actor, sourceKey, sourceRole, amounts, provider, now) {
  return {
    id: "RDHT-" + parentKey, operationId: "RDHT-" + parentKey, type: "Envío", tipo: "Envío",
    category: "internalSettlements", status: "Aprobado", estado: "Aprobado",
    amount: amounts.grossHtg, commission: amounts.commissionHtg, fee: amounts.commissionHtg,
    net: amounts.payoutHtg, currency: "HTG", currencyCode: "HTG",
    route: "HT → HT " + provider + " — Liquidación interna de RD → HT",
    beneficiary: String(parent.beneficiary || parent.beneficiario || ""),
    beneficiaryPhone: String(parent.beneficiaryPhone || parent.beneficiarioTel || ""),
    userId: "admin", ownerLegacyId: "ADMINADMIN",
    createdByAuthUid: actor.uid, createdByUserId: actor.userKey, createdByRole: actor.role,
    reviewedByAuthUid: actor.uid, reviewedByUserId: actor.userKey, reviewedByRole: actor.role,
    createdAtMs: now, approvedAtMs: now, updatedAtMs: now,
    parentTransactionId: String(parent.id || parentKey), parentFirebaseKey: parentKey,
    settlementRoleScope: "ADMIN_AGENT", isInternalSettlement: true, isSystemSettlement: true, readOnly: true,
    accounting: {
      amountDop: amounts.amountDop, feeDop: amounts.feeDop, netDop: amounts.netDop,
      exchangeRate: RATE, grossHtg: amounts.grossHtg, adminCommissionHtg: amounts.commissionHtg,
      adminPayoutHtg: amounts.payoutHtg, sourceUserKey: sourceKey, sourceRole,
      sourceBalanceWasReserved: amounts.sourceBalanceWasReserved,
      adminCommissionDop: amounts.adminCommissionDop, senderCommissionDop: amounts.senderCommissionDop,
      reservationKey: parentKey
    }
  };
}
async function settleRdHt(env, identity, input) {
  const targetId = String(input.transactionId || input.id || "");
  if (!targetId) { const e = new Error("Falta el ID de la operación RD → HT."); e.status = 400; throw e; }
  const token = await firebaseServiceToken(env);
  for (let attempt = 0; attempt < 5; attempt++) {
    const snap = await readRoot(env, token), root = snap.root;
    const actor = actorFrom(root, identity), users = root.users || {};
    const found = findParent(root, targetId);
    if (!found) { const e = new Error("La operación todavía no está guardada en Firebase. Actualice la lista e inténtelo otra vez."); e.status = 404; throw e; }
    const parentKey = found.key, parent = found.row, settlementKey = safeKey("RDHT-" + parentKey);
    const internal = root.internalSettlements?.[settlementKey];
    if (alreadySettled(parent, internal, settlementKey)) return { ok: true, alreadySettled: true, transactionId: parentKey, settlementId: settlementKey };
    if (norm(parent.status || parent.estado) !== "pendiente") { const e = new Error("La operación no está Pendiente o ya fue procesada."); e.status = 409; throw e; }
    if (!isRdHtNatcashRoute(parent)) { const e = new Error("No se identificó la ruta RD → HT NatCash/MonCash."); e.status = 422; throw e; }
    if (actor.role === "AGENTE" && (
      String(parent.createdByAuthUid || "") === identity.uid ||
      String(parent.createdByUserId || "") === actor.userKey ||
      ["admin", "administrador"].includes(norm(parent.createdByRole)) ||
      String(parent.createdByUserId || "") === "admin"
    )) { const e = new Error("El agente no puede aprobar operaciones propias ni operaciones creadas por Administración."); e.status = 403; throw e; }
    const amounts = getTransactionAmounts(parent);
    const senderKey = findUserKey(users, [parent.userId, parent.ownerLegacyId, parent.ownerCode, parent.ownerId, parent.remitenteId, parent.debitAccountId]);
    const senderProfile = users[senderKey];
    const senderRole = roleOf(senderProfile);
    if (!senderKey || !senderProfile || !["REMITENTE", "AGENTE", "ADMIN"].includes(senderRole)) {
      const e = new Error("No se encontró una cuenta de origen válida. No se modificó ningún balance."); e.status = 409; throw e;
    }
    const sourceKey = senderRole === "REMITENTE" ? senderKey : "admin";
    const sourceProfile = users[sourceKey], admin = users.admin;
    if (!admin || roleOf(admin) !== "ADMIN") { const e = new Error("No se encontró la cuenta administrativa."); e.status = 409; throw e; }
    const sourceMoney = moneyOf(sourceProfile), adminMoney = moneyOf(admin);
    const reservation = senderRole === "REMITENTE" ? (sourceProfile.balanceReservations?.[parentKey] || null) : null;
    let sourceBalanceWasReserved = false;
    if (senderRole === "REMITENTE" && reservation?.status === "RESERVED") {
      if (Math.abs(cents(reservation.amount) - amounts.amountDop) > 0.01 || String(reservation.currency || "DOP").toUpperCase() !== "DOP") {
        const e = new Error("La reserva DOP no coincide con el monto del envío."); e.status = 409; throw e;
      }
      sourceBalanceWasReserved = true;
      sourceProfile.balanceReservations[parentKey] = { ...reservation, status: "SETTLED", settledAtMs: Date.now(), settlementId: settlementKey };
    } else {
      const payer = sourceKey === "admin" ? adminMoney : sourceMoney;
      if (payer.balances.DOP < amounts.amountDop) { const e = new Error("Balance DOP insuficiente. La operación permanece Pendiente."); e.status = 409; throw e; }
      payer.balances.DOP = cents(payer.balances.DOP - amounts.amountDop);
      if (sourceKey === "admin") writeMoney(admin, payer);
      else writeMoney(sourceProfile, payer);
    }
    const adminCommissionDop = senderRole === "REMITENTE" ? cents(amounts.feeDop / 2) : amounts.feeDop;
    const senderCommissionDop = senderRole === "REMITENTE" ? cents(amounts.feeDop - adminCommissionDop) : 0;
    if (senderRole === "REMITENTE") {
      sourceMoney.commissions.DOP = cents(sourceMoney.commissions.DOP + senderCommissionDop);
      writeMoney(sourceProfile, sourceMoney);
    }
    adminMoney.commissions.DOP = cents(adminMoney.commissions.DOP + adminCommissionDop);
    if (adminMoney.balances.HTG < amounts.payoutHtg) { const e = new Error("Balance HTG insuficiente en Administración. El envío sigue Pendiente y no se hizo ningún pago."); e.status = 409; throw e; }
    adminMoney.balances.HTG = cents(adminMoney.balances.HTG - amounts.payoutHtg);
    adminMoney.commissions.HTG = cents(adminMoney.commissions.HTG + amounts.commissionHtg);
    writeMoney(admin, adminMoney);
    if (sourceKey !== "admin") writeMoney(sourceProfile, sourceMoney);
    const now = Date.now(), provider = /moncash/.test(norm(parent.route || parent.ruta || "")) ? "MonCash" : "NatCash";
    const internalRow = makeInternal(parent, parentKey, actor, sourceKey, senderRole, {
      ...amounts, sourceBalanceWasReserved, adminCommissionDop, senderCommissionDop
    }, provider, now);
    root.users = users;
    root.envios[parentKey] = {
      ...parent, status: "Aprobado", estado: "Aprobado",
      reviewedByAuthUid: identity.uid, reviewedByUserId: actor.userKey, reviewedByRole: actor.role,
      reviewedAtMs: now, approvedBy: actor.userKey, aprobadoPor: actor.userKey, approvedAtMs: now,
      internalSettlementId: settlementKey, financialSettlementStatus: "SETTLED", financialSettlementVersion: 1,
      receivedAmount: parent.receivedAmount || fmt(amounts.grossHtg) + " HTG", updatedAtMs: now
    };
    ensureAudit(root);
    if (root.internalSettlements[settlementKey]) { const e = new Error("Ya existe un asiento interno con ese ID; no se tocó el balance."); e.status = 409; throw e; }
    root.internalSettlements[settlementKey] = internalRow;
    root.ledger["RDHT-" + parentKey] = {
      recordId: String(parent.id || parentKey), sourceCollection: "envios", sourceId: String(parent.id || parentKey),
      ledgerLocked: true, ledgerEvent: "APROBACION", eventType: "RD_HT_AUTO_SETTLEMENT",
      amountDop: amounts.amountDop, feeDop: amounts.feeDop, netDop: amounts.netDop,
      exchangeRate: RATE, grossHtg: amounts.grossHtg, adminCommissionHtg: amounts.commissionHtg,
      adminPayoutHtg: amounts.payoutHtg, actorAuthUid: identity.uid, actorUserId: actor.userKey,
      actorRole: actor.role, createdAtMs: now
    };
    root.audit["RDHT-" + parentKey + "-APPROVED"] = {
      event: "RD_HT_AUTO_SETTLEMENT", transactionId: String(parent.id || parentKey),
      settlementId: settlementKey, actorAuthUid: identity.uid, actorUserId: actor.userKey,
      actorRole: actor.role, createdAtMs: now
    };
    if (await writeRoot(env, token, root, snap.etag)) {
      return {
        ok: true, alreadySettled: false, transactionId: parentKey, settlementId: settlementKey,
        accounting: { amountDop: amounts.amountDop, feeDop: amounts.feeDop, netDop: amounts.netDop,
          exchangeRate: RATE, grossHtg: amounts.grossHtg, adminCommissionHtg: amounts.commissionHtg, adminPayoutHtg: amounts.payoutHtg }
      };
    }
  }
  const e = new Error("Firebase cambió durante la aprobación. No se confirmó el asiento; actualice e inténtelo otra vez."); e.status = 409; throw e;
}
async function reverseRdHt(env, identity, input) {
  const token = await firebaseServiceToken(env);
  for (let attempt = 0; attempt < 5; attempt++) {
    const snap = await readRoot(env, token), root = snap.root, actor = actorFrom(root, identity);
    if (actor.role !== "ADMIN") { const e = new Error("Solo Administración puede revertir una liquidación."); e.status = 403; throw e; }
    const found = findParent(root, input.transactionId || input.id);
    if (!found) { const e = new Error("No se encontró la operación original."); e.status = 404; throw e; }
    const parentKey = found.key, parent = found.row, sid = String(parent.internalSettlementId || safeKey("RDHT-" + parentKey));
    const internal = root.internalSettlements?.[sid];
    if (norm(parent.status || parent.estado) === "revertido" && norm(parent.financialSettlementStatus) === "reversed") {
      return { ok: true, alreadyReversed: true, transactionId: parentKey, settlementId: sid };
    }
    if (!internal || !alreadySettled(parent, internal, sid)) { const e = new Error("La operación no tiene una liquidación confirmada que se pueda revertir."); e.status = 409; throw e; }
    const admin = root.users?.admin;
    if (!admin) throw new Error("No se encontró la cuenta de Administración.");
    const accounting = internal.accounting || {}, adminMoney = moneyOf(admin);
    const payoutHtg = cents(accounting.adminPayoutHtg), commissionHtg = cents(accounting.adminCommissionHtg);
    const amountDop = cents(accounting.amountDop), adminComDop = cents(accounting.adminCommissionDop);
    const senderComDop = cents(accounting.senderCommissionDop), sourceKey = String(accounting.sourceUserKey || "admin");
    const source = root.users?.[sourceKey];
    if (!source) { const e = new Error("No se encontró la cuenta de origen para devolver el DOP."); e.status = 409; throw e; }
    if (adminMoney.commissions.HTG < commissionHtg || adminMoney.commissions.DOP < adminComDop) {
      const e = new Error("La comisión de Administración ya se utilizó y no alcanza para revertir. Repóngala primero."); e.status = 409; throw e;
    }
    const sourceRole = String(accounting.sourceRole || roleOf(source));
    const sourceMoney = sourceKey === "admin" ? adminMoney : moneyOf(source);
    if (sourceRole === "REMITENTE" && sourceKey !== "admin" && sourceMoney.commissions.DOP < senderComDop) {
      const e = new Error("La comisión DOP del remitente ya se utilizó y no alcanza para revertir."); e.status = 409; throw e;
    }
    adminMoney.balances.HTG = cents(adminMoney.balances.HTG + payoutHtg);
    adminMoney.commissions.HTG = cents(adminMoney.commissions.HTG - commissionHtg);
    adminMoney.commissions.DOP = cents(adminMoney.commissions.DOP - adminComDop);
    if (sourceRole === "REMITENTE" && sourceKey !== "admin") {
      sourceMoney.balances.DOP = cents(sourceMoney.balances.DOP + amountDop);
      sourceMoney.commissions.DOP = cents(sourceMoney.commissions.DOP - senderComDop);
      if (source.balanceReservations?.[parentKey]) source.balanceReservations[parentKey] = {
        ...source.balanceReservations[parentKey], status: "REFUNDED", refundedAtMs: Date.now(), settlementId: sid
      };
      writeMoney(source, sourceMoney);
    } else adminMoney.balances.DOP = cents(adminMoney.balances.DOP + amountDop);
    writeMoney(admin, adminMoney);
    const now = Date.now();
    root.envios[parentKey] = { ...parent, status: "Revertido", estado: "Revertido",
      financialSettlementStatus: "REVERSED", reversedByAuthUid: identity.uid,
      reversedByUserId: actor.userKey, reversedByRole: actor.role, reversedAtMs: now, updatedAtMs: now };
    root.internalSettlements[sid] = { ...internal, status: "Revertido", estado: "Revertido",
      reversedByAuthUid: identity.uid, reversedByUserId: actor.userKey, reversedAtMs: now, updatedAtMs: now };
    ensureAudit(root);
    root.audit["RDHT-" + parentKey + "-REVERSED"] = {
      event: "RD_HT_AUTO_SETTLEMENT_REVERSAL", transactionId: String(parent.id || parentKey),
      settlementId: sid, actorAuthUid: identity.uid, actorUserId: actor.userKey, createdAtMs: now
    };
    if (await writeRoot(env, token, root, snap.etag)) return { ok: true, alreadyReversed: false, transactionId: parentKey, settlementId: sid };
  }
  const e = new Error("Firebase cambió durante la reversión. No se confirmó ningún cambio."); e.status = 409; throw e;
}
function originAllowed(request, env) {
  const origin = request.headers.get("Origin") || "";
  return String(env.ALLOWED_ORIGINS || "https://sendwayo-oficial.github.io,http://localhost:8787")
    .split(",").map(x => x.trim()).includes(origin) ? origin : "";
}
function reply(request, env, data, status = 200) {
  const origin = originAllowed(request, env), headers = {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Origin"
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return new Response(JSON.stringify(data), { status, headers });
}
async function bodyJson(request) {
  const text = await request.text();
  if (text.length > 12000) { const e = new Error("Solicitud demasiado grande."); e.status = 413; throw e; }
  try { return text ? JSON.parse(text) : {}; } catch { const e = new Error("JSON inválido."); e.status = 400; throw e; }
}
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return reply(request, env, {}, 204);
    const path = new URL(request.url).pathname;
    if (path === "/status" && request.method === "GET") return reply(request, env, { status: "online", service: "SENDWAYO EXPRESS Backend" });
    try {
      if (path === "/api/verify" && request.method === "POST") {
        const identity = await verifyFirebaseIdentity(bearer(request), env);
        return reply(request, env, { valid: true, user: { uid: identity.uid, email: identity.email } });
      }
      if (path === "/api/settle-rd-ht" && request.method === "POST") {
        const identity = await verifyFirebaseIdentity(bearer(request), env);
        return reply(request, env, await settleRdHt(env, identity, await bodyJson(request)));
      }
      if (path === "/api/reverse-rd-ht" && request.method === "POST") {
        const identity = await verifyFirebaseIdentity(bearer(request), env);
        return reply(request, env, await reverseRdHt(env, identity, await bodyJson(request)));
      }
      return reply(request, env, { error: "Endpoint no encontrado." }, 404);
    } catch (error) {
      return reply(request, env, { error: error?.message || "Error interno del backend." }, Number(error?.status) || 500);
    }
  }
};
export { cents, getTransactionAmounts, isRdHtNatcashRoute, moneyOf, norm, roleOf, writeMoney };