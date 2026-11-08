const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html'), 'utf8');

assert.match(html, /id="sendwayo-brand-bar"/, 'la marca debe tener una barra superior dedicada');
assert.match(html, /id="sendwayo-v7-business-name"[^>]*>SENDWAYO EXPRESS/, 'el nombre del negocio debe mostrarse arriba');
assert.match(html, /id="sendwayo-v7-user-strip"/, 'la identidad debe estar en una franja superior');
assert.match(html, /id="sendwayo-v7-name"/, 'el nombre del usuario debe estar en la franja');
assert.match(html, /id="sendwayo-v7-role"/, 'el rol ADMINISTRADOR/AGENTE/REMITENTE debe estar en la franja');
assert.match(html, /id="sendwayo-v7-id"/, 'el ID debe estar en la franja');
assert.match(html, /id="sendwayo-v7-code"/, 'el código debe estar en la franja');
assert.match(html, /id="sendwayo-v7-clock"/, 'la hora debe estar en la franja');
assert.match(html, /id="sendwayo-v7-duration"/, 'la duración de sesión debe estar en la franja');
assert.match(html, /function refreshIdentity\(\)/, 'el controlador debe refrescar la identidad activa');
const refreshIdentity = html.match(/function refreshIdentity\(\)\{[\s\S]*?\n \}/)?.[0] || '';
assert.match(refreshIdentity, /'sendwayo-v7-name':txt\(u&&\(u\.nombre\|\|u\.name\|\|u\.email\)/, 'el nombre visible debe proceder de la cuenta activa');
assert.match(refreshIdentity, /'sendwayo-v7-role':u\?roleLabel\(u\)/, 'el rol visible debe proceder del perfil activo');
assert.ok(refreshIdentity.includes("'sendwayo-v7-id':txt(u&&(u.id||u.accountId)"), 'el ID visible debe proceder del perfil activo');
assert.ok(refreshIdentity.includes("'sendwayo-v7-code':txt(u&&(u.codigo||u.code||u.codigo2)"), 'el código visible debe proceder del perfil activo');
assert.match(html, /id="sendwayo-main-content"/, 'el contenido principal debe usar un único contenedor');
const layoutCss=html.slice(html.indexOf('<style id="sendwayo-v7-no-side-identity-final">'));
assert.ok(layoutCss.includes('#sendwayo-main-sidebar{\n display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;'), 'el menú no debe reservar una columna mientras está cerrado');
assert.ok(layoutCss.includes('#sendwayo-main-sidebar.sendwayo-menu-open{display:grid!important;transform:translateY(0)!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important}'), 'el menú debe aparecer solo cuando se abra');
assert.match(layoutCss, /#sendwayo-main-content\{[\s\S]*?width:100%!important[\s\S]*?max-width:100%!important/s, 'el módulo activo debe ocupar todo el ancho');
assert.match(html, /id="sendwayo-mobile-menu"/, 'el botón del menú debe estar en la franja superior');
assert.match(html, /id="sendwayo-top-logout"/, 'Salir debe estar en la franja superior');
const finalLayout = html.slice(html.indexOf('<style id="sendwayo-v7-no-side-identity-final">'));
assert.match(finalLayout, /#sendwayo-v7-user-strip\\{[^}]*flex-direction:column!important/s,
  'la identidad y el horario deben apilarse verticalmente en una franja superior');
assert.match(finalLayout, /#sendwayo-v7-user-strip \\.sendwayo-workspace-person\\{[^}]*width:100%!important[^}]*flex-direction:column!important/s,
  'el nombre y los datos de la cuenta deben ocupar filas superiores completas');
assert.match(finalLayout, /#sendwayo-v7-user-strip \\.sendwayo-workspace-time\\{[^}]*width:100%!important[^}]*justify-content:flex-start!important/s,
  'fecha, hora y duración deben ir debajo de la identidad y no a su lado');
assert.match(finalLayout, /#sendwayo-main-content\\{[^}]*width:100%!important[^}]*max-width:100%!important/s,
  'el módulo seleccionado debe seguir ocupando el ancho completo debajo del encabezado');
assert.doesNotMatch(html, /sendwayo-v7-top-only-workspace-controller/, 'no debe quedar un segundo controlador de identidad');
assert.doesNotMatch(html, /sendwayo-v7-unified-workspace-header/, 'no debe quedar una segunda hoja de cabecera');
assert.doesNotMatch(html, /sendwayo-v7-top-only-workspace-layout/, 'no debe quedar otra hoja de distribución contradictoria');

console.log('SENDWAYO workspace header: cabecera superior y área de trabajo completa verificadas.');
