const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html');
const html = fs.readFileSync(htmlPath, 'utf8');

assert.match(html, /Expediente por ID/, 'el menú y la pantalla deben llamarse Expediente por ID');
assert.match(html, /function subjects\(\)/, 'la consulta debe resolver remitentes y agentes');
assert.match(html, /typeof AGENTES!=='undefined'/, 'el directorio debe usar el arreglo global real de agentes');
assert.match(html, /typeof REMITENTES!=='undefined'/, 'el directorio debe usar el arreglo global real de remitentes');
assert.match(html, /function identity\(a\)\{return \[a\.id,a\.idAnterior,a\.legacyId,a\.accountId,a\.staffId/, 'la búsqueda debe usar identificadores visibles y alias, no correo o UID');
const identityHelper = html.match(/function identity\(a\)\{[^}]+\}/)?.[0] || '';
assert.ok(identityHelper, 'debe existir el normalizador de IDs');
assert.doesNotMatch(identityHelper, /email|phone|a\.aliases/, 'la búsqueda no debe aceptar correo, teléfono ni alias genéricos');
assert.match(html, /placeholder="Introduzca ID del remitente o agente"/, 'el campo debe solicitar el ID');
assert.match(html, /window\.SENDWAYO_REQUESTS/, 'el expediente debe reunir solicitudes sincronizadas');
assert.match(html, /Solicitudes y revisiones relacionadas/, 'el expediente debe mostrar solicitudes');
assert.match(html, /window\.SENDWAYO_BANKS/, 'el expediente debe reunir cuentas bancarias sincronizadas');
assert.match(html, /Cuentas bancarias vinculadas/, 'el expediente debe mostrar cuentas bancarias');
assert.match(html, /function validate\(event\)/, 'el formulario debe validar remitente/agente');
assert.match(html, /password\|contrasena\|clave\|secret\|token/, 'los detalles deben omitir credenciales y secretos');
assert.match(html, /sendwayo:transactions-updated/, 'los datos del expediente y los avisos deben refrescarse con los cambios en tiempo real');
assert.match(html, /translateInterface\(node,languageValue\(\)\)/, 'la traducción debe procesar solo nodos añadidos');
assert.match(html, /roots\.forEach\(root=>scanTables\(root\)\)/, 'la paginación debe revisar solo vistas/tablas insertadas');
assert.match(html, /setInterval\(refresh,30000\)/, 'el resumen diario no debe recalcularse cada cuatro segundos');
assert.match(html, /setInterval\(syncStorage,15000\)/, 'la cola local debe usar un respaldo menos frecuente');
assert.doesNotMatch(html, /setInterval\(refresh,4000\)/, 'no debe quedar el temporizador de cuatro segundos');
assert.doesNotMatch(html, /setInterval\(syncStorage,2500\)/, 'no debe quedar el temporizador de 2,5 segundos');
assert.doesNotMatch(html, /if\(scan\) scanTables\(document\)/, 'no debe quedar el escaneo completo de tablas');

console.log('SENDWAYO expediente/performance: comprobaciones estáticas correctas.');
