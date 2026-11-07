const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html');
const html = fs.readFileSync(htmlPath, 'utf8');

assert.match(html, /Expediente por ID/, 'el menú y la pantalla deben llamarse Expediente por ID');
assert.match(html, /function accountRequests\(/, 'el expediente debe reunir solicitudes vinculadas');
assert.match(html, /window\.SENDWAYO_REQUESTS/, 'el expediente debe usar solicitudes sincronizadas');
assert.match(html, /function bankRows\(/, 'el expediente debe reunir cuentas bancarias vinculadas');
assert.match(html, /role\(a\)!=='ADMIN'/, 'la búsqueda del expediente debe limitarse a remitentes y agentes');
assert.match(html, /translateInterface\(node, languageValue\(\)\)/, 'la traducción debe procesar solo nodos añadidos');
assert.match(html, /setInterval\(refresh,30000\)/, 'el resumen diario no debe recalcularse cada cuatro segundos');
assert.match(html, /setInterval\(syncStorage,15000\)/, 'la cola local debe usar un respaldo menos frecuente');
assert.doesNotMatch(html, /setInterval\(refresh,4000\)/, 'no debe quedar el temporizador de cuatro segundos');
assert.doesNotMatch(html, /setInterval\(syncStorage,2500\)/, 'no debe quedar el temporizador de 2,5 segundos');

console.log('SENDWAYO expediente/performance: comprobaciones estáticas correctas.');
