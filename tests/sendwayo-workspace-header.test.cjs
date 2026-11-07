const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html'), 'utf8');

const focused = html.match(/function buildIdentityStrip\(\)\{[\s\S]*?\n \}/)?.[0] || '';
assert.ok(focused, 'debe existir la única franja de identidad del área privada');
assert.match(focused, /top\.insertAdjacentElement\('afterend',strip\)/, 'la franja debe quedar directamente debajo de la barra de marca, a todo lo ancho');
assert.doesNotMatch(focused, /root\.insertBefore\(strip,root\.firstChild\)/, 'la identidad no debe quedar dentro de la columna de contenido');
assert.match(html, /#sendwayo-v7-user-strip\s*\{[^}]*width:\s*100%[^}]*top:\s*48px/s, 'la franja superior debe ocupar el ancho completo debajo de la marca');
assert.match(html, /#user-top\s*\{[^}]*display:\s*none/s, 'el distintivo de usuario antiguo no debe duplicar datos junto a la marca');
assert.match(html, /#hora-top\s*\{[^}]*display:\s*none/s, 'la hora antigua no debe duplicarse en la barra de marca');
assert.match(html, /#sendwayo-active-identity-strip\s*\{[^}]*display:\s*none/s, 'la franja de identidad duplicada debe quedar desactivada');
assert.match(html, /function moveBusinessNameAboveUser\(\)\s*\{[^}]*return;/, 'no debe volver a apilar el nombre del administrador debajo del negocio');
assert.doesNotMatch(html, /wrap\.appendChild\(userBadge\)/, 'el ID del usuario no debe moverse al grupo izquierdo de la marca');
assert.match(html, /id="sendwayo-main-sidebar"/, 'la navegación de módulos debe conservar sus botones funcionales');

console.log('SENDWAYO workspace header: comprobaciones estáticas correctas.');
