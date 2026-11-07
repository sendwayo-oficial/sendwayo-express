const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html'), 'utf8');

const focused = html.match(/function buildIdentityStrip\(\)\{[\s\S]*?\n \}/)?.[0] || '';
assert.ok(focused, 'debe existir la única franja de identidad del área privada');
assert.match(focused, /brandBar\.insertAdjacentElement\('afterend',strip\)/, 'la franja debe quedar directamente debajo de la barra de marca');
assert.doesNotMatch(focused, /root\.insertBefore\(strip,root\.firstChild\)/, 'la identidad no debe quedar dentro de la columna de contenido');
assert.match(html, /#sendwayo-v7-user-strip\.sendwayo-workspace-identity\s*\{[^}]*top:\s*48px[^}]*width:\s*100%/s, 'la franja superior debe ocupar el ancho completo debajo de la marca');
assert.match(html, /#user-top,#hora-top,#sendwayo-active-identity-strip\{display:none!important/, 'los distintivos antiguos no deben duplicar datos junto a la marca');
const moveFn = html.match(/function moveBusinessNameAboveUser\(\)\{[\s\S]*?function installInvestigationViewRoute/)?.[0] || '';
assert.ok(moveFn, 'debe existir el control que evita el antiguo movimiento lateral');
assert.match(moveFn, /return;/, 'la rutina antigua debe dejar de mover el usuario junto al negocio');
assert.doesNotMatch(moveFn, /wrap\.appendChild\(userBadge\)/, 'el ID del usuario no debe moverse al grupo izquierdo de la marca');
assert.match(html, /id="sendwayo-main-sidebar"/, 'la navegación de módulos debe seguir disponible');

console.log('SENDWAYO workspace header: comprobaciones estáticas correctas.');
