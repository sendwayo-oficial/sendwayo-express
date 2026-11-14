const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html", "utf8");
const rules = JSON.parse(fs.readFileSync("database.rules.json", "utf8"));
const worker = fs.readFileSync("cloudflare-worker/src/index.mjs", "utf8");

assert.ok(html.includes("sendwayo-express-financial-api.ideletteismorin.workers.dev"), "V7 debe llamar al Worker financiero aislado");
assert.ok(html.includes('request("/api/settle-rd-ht", id)'), "la aprobación RD→HT debe ejecutarse en el servidor");
assert.ok(html.includes('request("/api/reverse-rd-ht", id)'), "Administración debe poder solicitar el reverso");
assert.ok(html.includes("internalSettlements"), "V7 debe leer la colección de liquidaciones internas");
assert.ok(html.includes("originCountry:txt(t.countryFrom?.iso2"), "V7 debe persistir país de origen ISO");
assert.ok(html.includes("destinationCountry:txt(t.countryTo?.iso2"), "V7 debe persistir país de destino ISO");
assert.ok(html.includes("destinationProvider:txt(t.proveedorDestino"), "V7 debe persistir proveedor de pago");
assert.ok(html.includes("CATEGORIES.filter(c=>!['credits','commissions','internalSettlements'].includes(c))"), "los remitentes no deben consultar la colección interna");
assert.ok(html.includes("category==='internalSettlements'||(role==='AGENTE'&&category==='envios')"), "agentes deben ver la operación original y el registro interno");
assert.ok(html.includes("window.sendwayoReverseRdHt"), "debe estar disponible el reverso administrativo");
assert.ok(worker.includes('if (actor.role !== "ADMIN") throw new Error("ADMIN_ONLY_REVERSAL")'), "el reverso debe ser exclusivo de Administración");
assert.ok(worker.includes("if (currentBalance + 0.001 < amounts.payoutHTG)"), "no se debe liquidar sin balance HTG suficiente");
assert.ok(worker.includes("original.internalSettlementId"), "debe existir control de idempotencia");

const collections = rules.rules.sendwayo_express_v2;
assert.ok(collections.internalSettlements && collections.internalSettlements[".read"], "Admin y agentes activos deben poder leer liquidaciones internas");
assert.ok(!Object.prototype.hasOwnProperty.call(collections.internalSettlements, ".write"), "el navegador no debe escribir la colección interna");
assert.equal(collections[".write"], false, "la raíz financiera debe conservar el bloqueo de escritura del cliente");

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1]).filter(Boolean);
assert.ok(scripts.length > 0, "V7 debe tener scripts");
for (let index = 0; index < scripts.length; index++) {
  assert.doesNotThrow(() => new Function(scripts[index]), "script V7 #" + (index + 1) + " debe analizarse");
}
console.log("PASS: liquidación V7, roles, campos de ruta, reglas y sintaxis JavaScript.");
