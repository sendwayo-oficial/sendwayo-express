const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html'), 'utf8');

assert.match(html, /id="sendwayo-brand-bar"/, 'la barra superior debe tener un contenedor único');
assert.match(html, /id="sendwayo-main-content"/, 'el contenido de cada módulo debe tener un contenedor principal a ancho completo');
assert.match(html, /id="sendwayo-v7-user-strip"/, 'la identidad de cuenta debe vivir en una franja superior');
assert.match(html, /id="sendwayo-v7-business-name"/, 'el nombre comercial SENDWAYO EXPRESS debe mostrarse arriba');
assert.match(html, /id="sendwayo-v7-role"/, 'el rol debe mostrarse en la franja superior');
assert.match(html, /id="sendwayo-v7-id"/, 'el ID debe mostrarse en la franja superior');
assert.match(html, /id="sendwayo-v7-code"/, 'el código debe mostrarse en la franja superior');
assert.match(html, /id="sendwayo-v7-clock"/, 'la hora debe mostrarse en la franja superior');
assert.match(html, /body\.sendwayo-authenticated #sendwayo-mobile-menu\.sendwayo-top-menu-toggle\{display:inline-flex!important\}/, 'el menú debe permanecer accesible en escritorio y móvil');
const canonicalStyle = html.slice(html.indexOf('<style id="sendwayo-v7-canonical-top-workspace-style">'));
assert.match(canonicalStyle, /#sendwayo-main-sidebar\{[^}]*position:fixed!important;[^}]*transform:translateX\(-105%\)!important/s, 'la navegación no debe ocupar una columna fija al lado del contenido');
assert.match(html, /#sendwayo-main-content\{[^}]*width:100%!important;[^}]*max-width:100%!important/s, 'el área de trabajo debe ocupar todo el ancho');
assert.match(html, /id="sendwayo-top-logout"[^>]*onclick="window\.cerrarSesion\(\)"/, 'el botón Salir de arriba debe cerrar la sesión');
assert.match(html, /#sendwayo-main-sidebar #sendwayo-v7-user-strip[^}]*display:none!important/, 'la identidad no debe duplicarse en el menú');
assert.doesNotMatch(html, /sendwayo-v7-unified-workspace-header/, 'no debe quedar una segunda hoja de estilos de cabecera');
assert.doesNotMatch(html, /sendwayo-v7-top-only-workspace-controller/, 'debe existir un solo controlador final de cabecera');
assert.doesNotMatch(html, /sendwayo-v7-top-only-workspace-layout/, 'debe existir una sola hoja de estilos final de distribución');

console.log('SENDWAYO top header / full-width workspace: comprobaciones correctas.');
