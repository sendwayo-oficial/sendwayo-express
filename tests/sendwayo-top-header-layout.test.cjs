const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html'), 'utf8');
const publicHtml = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html'), 'utf8');
assert.equal(publicHtml, html, 'la URL pública V118 debe llevar exactamente el contenido V7 consolidado');

const brandAt = html.indexOf('<div id="sendwayo-brand-bar"');
const identityAt = html.indexOf('<section id="sendwayo-v7-user-strip"');
const shellAt = html.indexOf('<div id="sendwayo-workspace-shell"');
assert.ok(brandAt >= 0 && identityAt > brandAt && shellAt > identityAt,
  'la marca y la identidad deben ir antes del área de trabajo');
const logoAt = html.indexOf('sendwayo-brand-logo', brandAt);
const nameAt = html.indexOf('sendwayo-v7-business-name', brandAt);
const menuAt = html.indexOf('sendwayo-mobile-menu', brandAt);
assert.ok(logoAt < nameAt && nameAt < menuAt, 'orden: logo, nombre comercial y un solo menú');
assert.equal((html.match(/id="sendwayo-mobile-menu"/g) || []).length, 1, 'solo un botón hamburguesa');
assert.match(html, /id="sendwayo-v7-role"/, 'el rol debe mostrarse arriba');
assert.match(html, /id="sendwayo-v7-id"/, 'el ID debe mostrarse arriba');
assert.match(html, /id="sendwayo-v7-date"/, 'la fecha debe mostrarse arriba');
assert.match(html, /id="sendwayo-v7-clock"/, 'la hora debe mostrarse arriba');
assert.match(html, /id="sendwayo-v7-duration"/, 'la duración de sesión debe mostrarse arriba');
assert.doesNotMatch(html, /Código:|Cód\.:|id="sendwayo-v7-code"/, 'no debe quedar código visible');
assert.match(html, /function purgeLegacySideIdentity\(/, 'debe limpiarse la identidad lateral antigua');
assert.match(html, /#sendwayo-main-sidebar\.sendwayo-menu-open/, 'el menú móvil debe deslizarse desde la izquierda');
assert.match(html, /#sendwayo-v7-user-strip \.sendwayo-workspace-person\s*\{[^}]*flex-direction:row\s*!important/s,
  'nombre, rol e ID deben quedar en una línea');
assert.match(html, /#sendwayo-v7-user-strip \.sendwayo-workspace-time\s*\{[^}]*flex-direction:row\s*!important/s,
  'fecha, hora y duración deben quedar en una línea');
assert.match(html, /#user-top,#hora-top,#sendwayo-active-identity-strip\{display:none!important/,
  'los campos antiguos no deben duplicar la identidad ni la hora');
assert.ok(html.includes('sendwayo-v7-final-integrity'), 'se conserva el control de aprobación única');
assert.ok(html.includes('sendwayo-v7-header-one-line-runtime'), 'se conserva el encabezado de una línea');
assert.ok(html.includes('attachCountrySearch(select)'), 'los países se pueden escribir y buscar por sugerencias');
assert.ok(html.includes('sendwayoOpenIdFile'), 'se conserva el expediente por ID');
assert.ok(html.includes('sendwayoOpenCardPayments'), 'se conserva el onboarding de tarjetas');
assert.ok(!html.includes('2200'), 'no se debe reintroducir la espera artificial de Firebase');
assert.ok(!html.includes('renderPrincipal(); },500'), 'no se debe abrir el tablero antes del login');

assert.ok(!html.includes("document.addEventListener('click',function(){window.setTimeout(styleSidebar,50);});"),
  'el menú no debe recalcularse en cada clic');
assert.ok(!html.includes("document.addEventListener('click',()=>setTimeout(hookVisibleExports,20));"),
  'las exportaciones no deben reinspeccionarse en cada clic');
assert.ok(!html.includes("document.addEventListener('click', () => setTimeout(() => { refreshBellCount(); if (current()) { updateIdentity(); applyIdentityDefaults(false);"),
  'la identidad no debe recalcularse en cada clic');
assert.ok(html.includes('sendwayo:local-data-changed'), 'los cambios locales deben activar sincronización');
assert.ok(html.includes('CLOUD_SYNC_INTERVAL_MS=15000'), 'el respaldo no debe revisarse cada cinco segundos');

console.log('SENDWAYO V7/V118: cabecera de una línea, menú lateral, ID sin código y rendimiento verificados.');
