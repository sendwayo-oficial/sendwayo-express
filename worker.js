const json = (data, status=200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

const nowIso = () => new Date().toISOString();

function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function decodeJwtPart(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

let certCache = { expires: 0, keys: null };

async function firebaseKeys() {
  const now = Date.now();
  if (certCache.keys && certCache.expires > now) return certCache.keys;
  const r = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com", { cf: { cacheTtl: 300 } });
  if (!r.ok) throw new Error("Firebase public keys unavailable");
  const jwks = await r.json();
  const keys = {};
  for (const jwk of (jwks.keys || [])) {
    keys[jwk.kid] = await crypto.subtle.importKey(
      "jwk", jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false, ["verify"]
    );
  }
  certCache = { keys, expires: now + 300000 };
  return keys;
}

async function verifyFirebaseToken(token, env) {
  if (!token) throw new Error("Missing Firebase token");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token");
  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  if (payload.aud !== env.FIREBASE_PROJECT_ID) throw new Error("Invalid audience");
  if (payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`) throw new Error("Invalid issuer");
  if (!payload.sub || payload.sub.length > 128) throw new Error("Invalid subject");
  if (payload.exp * 1000 <= Date.now()) throw new Error("Token expired");
  const key = (await firebaseKeys())[header.kid];
  if (!key) throw new Error("Unknown signing key");
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1])
  );
  if (!ok) throw new Error("Invalid token signature");
  return payload;
}

async function auth(request, env) {
  const value = request.headers.get("authorization") || "";
  if (!value.startsWith("Bearer ")) throw new Error("Authentication required");
  return verifyFirebaseToken(value.slice(7), env);
}

async function requireProfile(db, uid) {
  const row = await db.prepare(
    "SELECT * FROM users WHERE firebase_uid = ? AND active = 1"
  ).bind(uid).first();
  if (!row) throw new Error("SENDWAYO profile not found");
  return row;
}

function requireAdmin(profile) {
  if (profile.role !== "ADMIN") throw new Error("Admin authorization required");
}

function id(prefix) {
  return prefix + "_" + crypto.randomUUID();
}

function remitenteId() {
  return "ID" + String(Math.floor(Math.random() * 100000000)).padStart(8, "0");
}

function cents(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid amount");
  return Math.round(n * 100);
}

function optionalNote(status, note) {
  const s = String(note || "").trim();
  if ((status === "RECHAZADO" || status === "NO_COINCIDE") && !s) {
    throw new Error("Se requiere una nota para RECHAZADO o NO_COINCIDE");
  }
  if (status === "APROBADO" && s) throw new Error("APROBADO no permite nota");
  return s || null;
}

function rateFor(serviceType, origin, destination) {
  const s = String(serviceType || "").toUpperCase();
  const o = String(origin || "").toUpperCase();
  const d = String(destination || "").toUpperCase();
  if (s.includes("RECARG") || s.includes("PAGO") || s.includes("SERVICIO") || s.includes("PAQUET")) return 0.05;
  if (o.includes("HTI") && d.includes("HTI")) return 0;
  return 0.10;
}

// The amount entered by the client is the TOTAL the customer gives.
// The fee is contained inside that total: fee = total - net amount.
function feeInsideTotal(totalCents, rate) {
  if (!rate) return 0;
  return Math.round(totalCents * rate / (1 + rate));
}

function ticket() {
  const d = new Date();
  const stamp = [
    d.getUTCFullYear(),
    String(d.getUTCMonth()+1).padStart(2,"0"),
    String(d.getUTCDate()).padStart(2,"0")
  ].join("");
  return "SW-" + stamp + "-" + crypto.randomUUID().replace(/-/g,"").slice(0,8).toUpperCase();
}

async function body(request) {
  try { return await request.json(); }
  catch { throw new Error("JSON body inválido"); }
}

async function adminListUsers(db) {
  const r = await db.prepare(
    "SELECT id,role,full_name,phone,active,balance_cents,commission_cents,created_at,updated_at FROM users ORDER BY role DESC, full_name"
  ).all();
  return r.results || [];
}

async function route(request, env) {
  if (!env.DB) return json({ ok:false, error:"D1 binding no configurado" }, 503);

  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/api/health") {
    return json({
      ok: true,
      service: "SENDWAYO EXPRESS API",
      database: true,
      time: nowIso()
    });
  }

  const token = await auth(request, env);
  const profile = await requireProfile(env.DB, token.sub);

  if (request.method === "GET" && url.pathname === "/api/me") {
    return json({ ok: true, user: profile });
  }

  if (request.method === "GET" && url.pathname === "/api/beneficiaries") {
    const q = (url.searchParams.get("q") || "").trim();
    if (!q) return json({ ok:true, beneficiaries:[] });
    const like = "%" + q.replace(/[%_]/g, "") + "%";
    const rows = await env.DB.prepare(
      "SELECT id,full_name,phone,country FROM beneficiaries WHERE owner_user_id=? AND active=1 AND (full_name LIKE ? OR phone LIKE ?) ORDER BY full_name LIMIT 20"
    ).bind(profile.id, like, like).all();
    return json({ ok:true, beneficiaries: rows.results || [] });
  }

  if (request.method === "POST" && url.pathname === "/api/beneficiaries") {
    const b = await body(request);
    const fullName = String(b.fullName || "").trim();
    const phone = String(b.phone || "").trim();
    const country = String(b.country || "").trim();
    if (!fullName || !phone) return json({ok:false,error:"Nombre y teléfono son obligatorios"},400);

    const existing = await env.DB.prepare(
      "SELECT id,full_name,phone,country FROM beneficiaries WHERE owner_user_id=? AND phone=? AND active=1"
    ).bind(profile.id, phone).first();
    if (existing) return json({ok:false,error:"El beneficiario ya existe",beneficiary:existing},409);

    const beneficiaryId = id("ben");
    await env.DB.prepare(
      "INSERT INTO beneficiaries(id,owner_user_id,full_name,phone,country) VALUES(?,?,?,?,?)"
    ).bind(beneficiaryId,profile.id,fullName,phone,country).run();
    return json({ok:true,id:beneficiaryId},201);
  }

  if (request.method === "POST" && url.pathname === "/api/deposits") {
    const b = await body(request);
    const amount = cents(b.amount);
    const depositId = id("dep");
    await env.DB.prepare(
      "INSERT INTO deposits(id,user_id,amount_cents,status) VALUES(?,?,?,'PENDIENTE')"
    ).bind(depositId,profile.id,amount).run();
    return json({ok:true,id:depositId,status:"PENDIENTE"},201);
  }

  if (request.method === "GET" && url.pathname === "/api/deposits") {
    const isAdmin = profile.role === "ADMIN";
    const sql = isAdmin
      ? "SELECT d.*,u.full_name,u.phone FROM deposits d JOIN users u ON u.id=d.user_id ORDER BY d.created_at DESC LIMIT 500"
      : "SELECT d.* FROM deposits d WHERE d.user_id=? ORDER BY d.created_at DESC LIMIT 200";
    const r = isAdmin ? await env.DB.prepare(sql).all() : await env.DB.prepare(sql).bind(profile.id).all();
    return json({ok:true,deposits:r.results||[]});
  }

  if (request.method === "GET" && url.pathname === "/api/transfers") {
    const isAdmin = profile.role === "ADMIN";
    const sql = isAdmin
      ? `SELECT t.*,u.full_name AS sender_name,b.full_name AS beneficiary_name,b.phone AS beneficiary_phone
         FROM transfers t JOIN users u ON u.id=t.sender_user_id JOIN beneficiaries b ON b.id=t.beneficiary_id
         ORDER BY t.created_at DESC LIMIT 500`
      : `SELECT t.*,b.full_name AS beneficiary_name,b.phone AS beneficiary_phone
         FROM transfers t JOIN beneficiaries b ON b.id=t.beneficiary_id
         WHERE t.sender_user_id=? ORDER BY t.created_at DESC LIMIT 200`;
    const r = isAdmin ? await env.DB.prepare(sql).all() : await env.DB.prepare(sql).bind(profile.id).all();
    return json({ok:true,transfers:r.results||[]});
  }

  if (request.method === "POST" && url.pathname === "/api/transfers") {
    if (profile.role !== "REMITENTE") throw new Error("Solo un remitente puede crear envíos");
    const b = await body(request);
    const beneficiaryId = String(b.beneficiaryId || "").trim();
    const serviceType = String(b.serviceType || "").trim();
    const origin = String(b.originCountry || "").trim();
    const destination = String(b.destinationCountry || "").trim();
    if (!beneficiaryId || !serviceType) throw new Error("Beneficiario y servicio son obligatorios");

    const beneficiary = await env.DB.prepare(
      "SELECT id FROM beneficiaries WHERE id=? AND owner_user_id=? AND active=1"
    ).bind(beneficiaryId,profile.id).first();
    if (!beneficiary) throw new Error("Beneficiario no válido");

    const total = cents(b.amount);
    const rate = rateFor(serviceType,origin,destination);
    const fee = feeInsideTotal(total,rate);
    const commission = fee;
    const senderCommission = Math.floor(commission / 2);
    const adminCommission = commission - senderCommission;
    const transferId = id("tr");
    const ticketNo = ticket();

    await env.DB.prepare(
      `INSERT INTO transfers(
        id,ticket,sender_user_id,beneficiary_id,service_type,origin_country,destination_country,
        amount_cents,fee_cents,commission_cents,sender_commission_cents,admin_commission_cents,status
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'PENDIENTE')`
    ).bind(
      transferId,ticketNo,profile.id,beneficiaryId,serviceType,origin,destination,
      total,fee,commission,senderCommission,adminCommission
    ).run();

    return json({
      ok:true,id:transferId,ticket:ticketNo,status:"PENDIENTE",
      amount_cents:total,fee_cents:fee,commission_cents:commission,
      sender_commission_cents:senderCommission,admin_commission_cents:adminCommission
    },201);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/deposits/decision") {
    requireAdmin(profile);
    const b = await body(request);
    const depositId = String(b.depositId || "").trim();
    const status = String(b.status || "").trim().toUpperCase();
    const note = optionalNote(status,b.note);
    if (!["APROBADO","RECHAZADO","NO_COINCIDE"].includes(status)) throw new Error("Estado inválido");

    const deposit = await env.DB.prepare(
      "SELECT * FROM deposits WHERE id=?"
    ).bind(depositId).first();
    if (!deposit) throw new Error("Depósito no encontrado");
    if (deposit.status !== "PENDIENTE") throw new Error("El depósito ya fue procesado");

    if (status !== "APROBADO") {
      await env.DB.prepare(
        "UPDATE deposits SET status=?,note=?,approved_by=?,approved_at=? WHERE id=? AND status='PENDIENTE'"
      ).bind(status,note,profile.id,nowIso(),depositId).run();
      return json({ok:true,status});
    }

    const ledgerId = id("led");
    const result = await env.DB.batch([
      env.DB.prepare(
        "UPDATE deposits SET status='APROBADO',note=NULL,approved_by=?,approved_at=? WHERE id=? AND status='PENDIENTE'"
      ).bind(profile.id,nowIso(),depositId),
      env.DB.prepare(
        "UPDATE users SET balance_cents=balance_cents+?,updated_at=? WHERE id=? AND active=1"
      ).bind(deposit.amount_cents,nowIso(),deposit.user_id),
      env.DB.prepare(
        "INSERT INTO ledger(id,user_id,kind,amount_cents,reference_type,reference_id) VALUES(?,?,?,?,?,?)"
      ).bind(ledgerId,deposit.user_id,"DEPOSITO_APROBADO",deposit.amount_cents,"deposit",depositId)
    ]);
    if (!result.every(x => x.success)) throw new Error("No se pudo completar la aprobación del depósito");
    return json({ok:true,status:"APROBADO",credited_cents:deposit.amount_cents});
  }

  if (request.method === "POST" && url.pathname === "/api/admin/transfers/decision") {
    requireAdmin(profile);
    const b = await body(request);
    const transferId = String(b.transferId || "").trim();
    const status = String(b.status || "").trim().toUpperCase();
    const note = optionalNote(status,b.note);
    if (!["APROBADO","RECHAZADO","NO_COINCIDE"].includes(status)) throw new Error("Estado inválido");

    const transfer = await env.DB.prepare(
      "SELECT * FROM transfers WHERE id=?"
    ).bind(transferId).first();
    if (!transfer) throw new Error("Envío no encontrado");
    if (transfer.status !== "PENDIENTE") throw new Error("El envío ya fue procesado");

    if (status !== "APROBADO") {
      await env.DB.prepare(
        "UPDATE transfers SET status=?,note=?,approved_by=?,approved_at=? WHERE id=? AND status='PENDIENTE'"
      ).bind(status,note,profile.id,nowIso(),transferId).run();
      return json({ok:true,status});
    }

    const sender = await env.DB.prepare(
      "SELECT id,balance_cents,active FROM users WHERE id=? AND role='REMITENTE'"
    ).bind(transfer.sender_user_id).first();
    if (!sender || !sender.active) throw new Error("Remitente no válido");
    if (Number(sender.balance_cents) < Number(transfer.amount_cents)) {
      throw new Error("Saldo insuficiente del remitente");
    }

    const ledgerSender = id("led");
    const ledgerSenderCommission = id("led");
    const ledgerAdminCommission = id("led");
    const stamp = nowIso();

    const result = await env.DB.batch([
      env.DB.prepare(
        "UPDATE transfers SET status='APROBADO',note=NULL,approved_by=?,approved_at=? WHERE id=? AND status='PENDIENTE'"
      ).bind(profile.id,stamp,transferId),
      env.DB.prepare(
        "UPDATE users SET balance_cents=balance_cents-?,commission_cents=commission_cents+?,updated_at=? WHERE id=? AND balance_cents>=? AND active=1"
      ).bind(transfer.amount_cents,transfer.sender_commission_cents,stamp,transfer.sender_user_id,transfer.amount_cents),
      env.DB.prepare(
        "UPDATE users SET balance_cents=balance_cents+?,updated_at=? WHERE id=? AND role='ADMIN' AND active=1"
      ).bind(transfer.admin_commission_cents,stamp,profile.id),
      env.DB.prepare(
        "INSERT INTO ledger(id,user_id,kind,amount_cents,reference_type,reference_id) VALUES(?,?,?,?,?,?)"
      ).bind(ledgerSender,transfer.sender_user_id,"ENVIO_DEBITO", -Number(transfer.amount_cents),"transfer",transferId),
      env.DB.prepare(
        "INSERT INTO ledger(id,user_id,kind,amount_cents,reference_type,reference_id) VALUES(?,?,?,?,?,?)"
      ).bind(ledgerSenderCommission,transfer.sender_user_id,"COMISION_REMITENTE", transfer.sender_commission_cents,"transfer",transferId),
      env.DB.prepare(
        "INSERT INTO ledger(id,user_id,kind,amount_cents,reference_type,reference_id) VALUES(?,?,?,?,?,?)"
      ).bind(ledgerAdminCommission,profile.id,"COMISION_ADMIN", transfer.admin_commission_cents,"transfer",transferId)
    ]);

    if (!result.every(x => x.success)) throw new Error("No se pudo completar la aprobación del envío");
    return json({
      ok:true,status:"APROBADO",
      debited_cents:transfer.amount_cents,
      sender_commission_cents:transfer.sender_commission_cents,
      admin_commission_cents:transfer.admin_commission_cents
    });
  }

  if (request.method === "GET" && url.pathname === "/api/admin/users") {
    requireAdmin(profile);
    return json({ok:true,users:await adminListUsers(env.DB)});
  }

  if (request.method === "POST" && url.pathname === "/api/admin/credit") {
    requireAdmin(profile);
    const b = await body(request);
    const userId = String(b.userId || "").trim();
    const amount = cents(b.amount);
    const kind = String(b.kind || "ACREDITACION_ADMIN").trim().toUpperCase();
    if (!["ACREDITACION_ADMIN","BONO","COMISION"].includes(kind)) throw new Error("Tipo de crédito inválido");

    const user = await env.DB.prepare("SELECT id,role,active FROM users WHERE id=?").bind(userId).first();
    if (!user || !user.active) throw new Error("Remitente no encontrado");
    const ledgerId = id("led");
    const stamp = nowIso();
    const update = kind === "COMISION"
      ? "UPDATE users SET commission_cents=commission_cents+?,updated_at=? WHERE id=? AND active=1"
      : "UPDATE users SET balance_cents=balance_cents+?,updated_at=? WHERE id=? AND active=1";
    const result = await env.DB.batch([
      env.DB.prepare(update).bind(amount,stamp,userId),
      env.DB.prepare(
        "INSERT INTO ledger(id,user_id,kind,amount_cents,reference_type,reference_id) VALUES(?,?,?,?,?,?)"
      ).bind(ledgerId,userId,kind,amount,"admin",profile.id)
    ]);
    if (!result.every(x=>x.success)) throw new Error("No se pudo acreditar");
    return json({ok:true,userId,amount_cents:amount,kind});
  }

  if (request.method === "POST" && url.pathname === "/api/admin/adjust-balance") {
    requireAdmin(profile);
    const b = await body(request);
    const userId = String(b.userId || "").trim();
    const delta = Number(b.delta);
    if (!Number.isFinite(delta) || delta === 0) throw new Error("Ajuste inválido");
    const deltaCents = Math.round(delta * 100);
    const user = await env.DB.prepare("SELECT id,balance_cents,active FROM users WHERE id=?").bind(userId).first();
    if (!user || !user.active) throw new Error("Usuario no encontrado");
    if (Number(user.balance_cents) + deltaCents < 0) throw new Error("El ajuste dejaría el saldo negativo");
    const ledgerId = id("led");
    const result = await env.DB.batch([
      env.DB.prepare("UPDATE users SET balance_cents=balance_cents+?,updated_at=? WHERE id=? AND active=1")
        .bind(deltaCents,nowIso(),userId),
      env.DB.prepare("INSERT INTO ledger(id,user_id,kind,amount_cents,reference_type,reference_id) VALUES(?,?,?,?,?,?)")
        .bind(ledgerId,userId,"AJUSTE_SALDO",deltaCents,"admin",profile.id)
    ]);
    if (!result.every(x=>x.success)) throw new Error("No se pudo ajustar el saldo");
    return json({ok:true,userId,delta_cents:deltaCents});
  }

  if (request.method === "POST" && url.pathname === "/api/admin/reset") {
    requireAdmin(profile);
    const b = await body(request);
    if (b.confirm !== "RESET_SENDWAYO") throw new Error("Confirmación de reset inválida");
    const result = await env.DB.batch([
      env.DB.prepare("UPDATE users SET balance_cents=0,commission_cents=0,updated_at=?").bind(nowIso()),
      env.DB.prepare("DELETE FROM ledger"),
      env.DB.prepare("DELETE FROM transfers"),
      env.DB.prepare("DELETE FROM deposits")
    ]);
    if (!result.every(x=>x.success)) throw new Error("No se pudo completar el reset");
    return json({ok:true,reset:true});
  }

  return json({ok:false,error:"Route not found"},404);
}

export default {
  async fetch(request, env) {
    try {
      return await route(request,env);
    } catch (e) {
      const message = e?.message || "Internal error";
      const status =
        message === "Authentication required" ? 401 :
        message === "Admin authorization required" ? 403 :
        message === "Route not found" ? 404 :
        message === "El beneficiario ya existe" ? 409 : 400;
      return json({ok:false,error:message},status);
    }
  }
};
