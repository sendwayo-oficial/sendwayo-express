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

console.log('SENDWAYO top header / no side column: comprobaciones correctas.');
