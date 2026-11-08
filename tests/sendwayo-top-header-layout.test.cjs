const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html'), 'utf8');

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
assert.match(html, /#sendwayo-main-sidebar\s*\{[^}]*display:\s*none\s*!important/s,
  'no debe quedar una columna lateral visible');
assert.match(html, /#sendwayo-main-sidebar\.sendwayo-menu-open\s*\{[^}]*display:\s*grid\s*!important/s,
  'el menú debe aparecer solamente como panel superior al abrirlo');
assert.match(html, /#sendwayo-workspace-shell\s*\{[^}]*display:\s*block\s*!important/s,
  'el espacio de trabajo debe eliminar el diseño de dos columnas');
assert.match(html, /#sendwayo-main-content\s*\{[^}]*width:\s*100%\s*!important/s,
  'el módulo debe ocupar todo el ancho');
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
