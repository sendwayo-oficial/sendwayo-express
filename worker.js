const json = (data, status=200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

const text = (data, status=200) => new Response(data, {
  status,
  headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
});

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
  const r = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com", {
    cf: { cacheTtl: 300 }
  });
  if (!r.ok) throw new Error("Firebase public keys unavailable");
  const certs = await r.json();
  const keys = {};
  for (const [kid, pem] of Object.entries(certs)) {
    const body = pem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\\s/g, "");
    const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
    keys[kid] = await crypto.subtle.importKey("spki", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]).catch(() => null);
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
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(parts[2]),
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

function id(prefix) {
  return prefix + "_" + crypto.randomUUID();
}

function cents(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid amount");
  return Math.round(n * 100);
}

async function requireProfile(db, uid) {
  const row = await db.prepare("SELECT * FROM users WHERE firebase_uid = ? AND active = 1").bind(uid).first();
  if (!row) throw new Error("SENDWAYO profile not found");
  return row;
}

async function route(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/health") {
    return json({ ok: true, service: "SENDWAYO EXPRESS API", database: !!env.DB, time: new Date().toISOString() });
  }

  const token = await auth(request, env);
  const profile = await requireProfile(env.DB, token.sub);

  if (request.method === "GET" && url.pathname === "/api/me") {
    return json({ ok: true, user: profile });
  }

  if (request.method === "GET" && url.pathname === "/api/beneficiaries") {
    const q = (url.searchParams.get("q") || "").trim();
    if (!q) return json({ ok: true, beneficiaries: [] });
    const like = "%" + q.replace(/[%_]/g, "") + "%";
    const rows = await env.DB.prepare(
      "SELECT id,full_name,phone,country FROM beneficiaries WHERE owner_user_id=? AND active=1 AND (full_name LIKE ? OR phone LIKE ?) ORDER BY full_name LIMIT 20"
    ).bind(profile.id, like, like).all();
    return json({ ok: true, beneficiaries: rows.results || [] });
  }

  if (request.method === "POST" && url.pathname === "/api/beneficiaries") {
    const body = await request.json();
    const fullName = String(body.fullName || "").trim();
    const phone = String(body.phone || "").trim();
    if (!fullName || !phone) return json({ ok: false, error: "Nombre y teléfono son obligatorios" }, 400);
    const beneficiaryId = id("ben");
    await env.DB.prepare(
      "INSERT INTO beneficiaries(id,owner_user_id,full_name,phone,country) VALUES(?,?,?,?,?)"
    ).bind(beneficiaryId, profile.id, fullName, phone, String(body.country || "").trim()).run();
    return json({ ok: true, id: beneficiaryId }, 201);
  }

  if (request.method === "POST" && url.pathname === "/api/deposits") {
    const body = await request.json();
    const amount = cents(body.amount);
    const depositId = id("dep");
    await env.DB.prepare(
      "INSERT INTO deposits(id,user_id,amount_cents,status) VALUES(?,?,?,'PENDIENTE')"
    ).bind(depositId, profile.id, amount).run();
    return json({ ok: true, id: depositId, status: "PENDIENTE" }, 201);
  }

  return json({ ok: false, error: "Route not found" }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (e) {
      return json({ ok: false, error: e?.message || "Internal error" }, e?.message === "Authentication required" ? 401 : 400);
    }
  }
};
