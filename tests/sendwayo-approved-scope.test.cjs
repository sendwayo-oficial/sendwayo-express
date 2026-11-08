const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html'), 'utf8');

// Menú: barra superior de identidad y navegación lateral izquierda en escritorio.
assert.match(html, /id="sendwayo-v7-approved-desktop-left-sidebar"/);
assert.match(html, /@media\(min-width:1025px\)[\s\S]*?body\.sendwayo-authenticated #sendwayo-main-sidebar/);
assert.match(html, /width:250px!important/);
assert.match(html, /margin:0 0 0 250px!important/);
assert.match(html, /@media\(max-width:1024px\)[\s\S]*?#sendwayo-main-content/);
assert.match(html, /#sendwayo-mobile-menu\.sendwayo-top-menu-toggle/);
assert.match(html, /#sendwayo-main-content \.view\.hidden\{display:none!important\}/);

// Los módulos se conservan separados y la tabla no pierde su paginación.
assert.match(html, /document\.querySelectorAll\('\.view'\)\.forEach\(v=>v\.classList\.add\('hidden'\)\)/);
assert.match(html, /const perPage=10;/);
assert.match(html, /aria-label="Página posterior"/);

// Métodos aprobados: débito, crédito, transferencia, CardNET, AZUL y Stripe.
for (const term of ['Tarjeta de débito o crédito', 'Débito', 'Crédito', 'Transferencia bancaria a SENDWAYO', 'CardNET', 'AZUL', 'Stripe']) {
  assert.ok(html.includes(term), 'falta método de pago: ' + term);
}
assert.match(html, /No habilitado para RD/);
assert.match(html, /https:\/\/stripe\.com\/global/);
assert.match(html, /requirements-to-open-a-stripe-account-in-another-country/);
assert.match(html, /SENDWAYO no solicita ni almacena número completo de tarjeta, fecha de vencimiento, CVV ni PIN/);
assert.match(html, /Este módulo todavía no procesa cargos ni envía fondos/);

// La V7 no contiene funciones, etiquetas ni rutas de dividendos; no se borran datos externos.
assert.doesNotMatch(html, /dividend|dividendo/i);

// Protecciones financieras críticas no se sustituyen al añadir el menú y el panel de métodos.
assert.match(html, /function balanceOwner\(a\)\{return a&&roleOf\(a\)==='AGENTE'\?\(adminAccount\(\)\|\|a\):\(a\|\|null\);\}/);
assert.match(html, /function commissionOwner\(a\)\{return a&&roleOf\(a\)==='AGENTE'\?\(adminAccount\(\)\|\|a\):\(a\|\|null\);\}/);
assert.match(html, /No se acredita por el retorno del navegador ni por un comprobante subido/);
assert.doesNotMatch(html, /sk_live_|sk_test_|whsec_|STRIPE_SECRET/i);

console.log('SENDWAYO V7 approved scope: desktop sidebar, module isolation, card methods and financial safeguards verified.');
