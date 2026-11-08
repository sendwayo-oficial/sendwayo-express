const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html'), 'utf8');
const legacyUrlHtml = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html'), 'utf8');
assert.ok(html.includes('sendwayo-v7-user-strip') && legacyUrlHtml.includes('sendwayo-v7-user-strip'),
  'el archivo consolidado y la URL pública deben conservar la cabecera de identidad V7');

const brandAt = html.indexOf('<div id="sendwayo-brand-bar"');
const identityAt = html.indexOf('<section id="sendwayo-v7-user-strip"');
const shellAt = html.indexOf('<div id="sendwayo-workspace-shell"');
assert.ok(brandAt >= 0 && identityAt > brandAt && shellAt > identityAt,
  'la marca, administrador/ID/código y hora deben ir arriba del área de trabajo');

assert.match(html, /id="sendwayo-v7-business-name"/, 'el nombre del negocio debe aparecer en la barra superior');
assert.match(html, /id="sendwayo-v7-role"/, 'el rol de administración debe estar en la franja superior');
assert.match(html, /id="sendwayo-v7-id"/, 'el ID debe estar en la franja superior');
assert.match(html, /id="sendwayo-v7-code"/, 'el código debe estar en la franja superior');
assert.match(html, /id="sendwayo-v7-clock"/, 'la hora debe estar en la franja superior');

assert.match(html, /function purgeLegacySideIdentity\(/, 'debe limpiarse el encabezado viejo del lateral');
assert.match(legacyUrlHtml, /sendwayo-v7-requested-topbar-and-left-vertical-menu-2026-11-08/,
  'la URL pública debe tener la distribución superior y el menú vertical solicitados');
assert.match(legacyUrlHtml, /#sendwayo-main-sidebar\s*\{[^}]*flex-direction:\s*column\s*!important/s,
  'todos los menús deben mostrarse en una columna vertical en el panel izquierdo');
assert.match(legacyUrlHtml, /#sendwayo-main-sidebar\.sendwayo-menu-open\s*\{[^}]*transform:translateX\(0\)!important/s,
  'el panel lateral debe deslizarse desde la izquierda al abrirse');
assert.match(legacyUrlHtml, /brandLeft\.insertBefore\(btn,brandLogo\|\|brandLeft\.firstChild\)/,
  'el botón de tres rayas debe quedar a la izquierda de la marca');
for (const id of ['sendwayo-v7-top-bal-dop','sendwayo-v7-top-bal-htg','sendwayo-v7-top-com-dop','sendwayo-v7-top-com-htg']) {
  assert.match(legacyUrlHtml, new RegExp('id="' + id + '"'),
    'la franja superior debe mostrar balance y comisión en ambas monedas: ' + id);
}
assert.match(legacyUrlHtml, /topPairs\.forEach/,
  'los cuatro importes superiores deben actualizarse desde los valores financieros existentes');
assert.match(legacyUrlHtml, /#sendwayo-v7-user-strip \.sendwayo-workspace-person\s*\{[^}]*flex-direction:row\s*!important/s,
  'administrador, ID, código y datos de sesión deben alinearse horizontalmente');
assert.match(legacyUrlHtml, /#sendwayo-v7-user-strip \.sendwayo-workspace-time\s*\{[^}]*flex-direction:row\s*!important/s,
  'hora y duración de sesión deben permanecer en la misma franja superior');
assert.match(html, /#user-top,#hora-top,#sendwayo-active-identity-strip\{display:none!important/,
  'los campos antiguos no deben duplicar la identidad ni la hora');


// Performance regression coverage: no whole-document work on ordinary clicks.
assert.ok(!html.includes("document.addEventListener('click',function(){window.setTimeout(styleSidebar,50);});"),
  'el formato del menú no debe recalcularse en cada clic');
assert.ok(!html.includes("document.addEventListener('click',()=>setTimeout(hookVisibleExports,20));"),
  'las exportaciones no deben reinspeccionar todos los botones en cada clic');
assert.ok(!html.includes("document.addEventListener('click', () => setTimeout(() => { refreshBellCount(); if (current()) { updateIdentity(); applyIdentityDefaults(false);"),
  'la identidad y los formularios no deben recalcularse al pulsar cualquier parte de la página');
assert.ok(html.includes('sendwayo:local-data-changed'),
  'los cambios locales deben poder activar la sincronización sin esperar al temporizador');
assert.ok(html.includes('CLOUD_SYNC_INTERVAL_MS=15000'),
  'la comprobación completa de respaldo no debe ejecutarse cada cinco segundos');

console.log('SENDWAYO top header / performance: comprobaciones correctas.');
