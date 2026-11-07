const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html');
const html = fs.readFileSync(htmlPath, 'utf8');

assert.match(html, /Expediente por ID/, 'el menú y la pantalla deben llamarse Expediente por ID');
assert.match(html, /function subjects\(\)/, 'la consulta debe resolver remitentes y agentes');
assert.match(html, /window\.SENDWAYO_REQUESTS/, 'el expediente debe reunir solicitudes sincronizadas');
assert.match(html, /Solicitudes y revisiones relacionadas/, 'el expediente debe mostrar solicitudes');
assert.match(html, /window\.SENDWAYO_BANKS/, 'el expediente debe reunir cuentas bancarias sincronizadas');
assert.match(html, /Cuentas bancarias vinculadas/, 'el expediente debe mostrar cuentas bancarias');
assert.match(html, /function validate\(event\)/, 'el formulario debe validar que el ID corresponda a remitente o agente');
assert.match(html, /translateInterface\(node,languageValue\(\)\)/, 'la traducción debe procesar solo nodos añadidos');
assert.match(html, /setInterval\(refresh,30000\)/, 'el resumen diario no debe recalcularse cada cuatro segundos');
assert.match(html, /setInterval\(syncStorage,15000\)/, 'la cola local debe usar un respaldo menos frecuente');
assert.doesNotMatch(html, /setInterval\(refresh,4000\)/, 'no debe quedar el temporizador de cuatro segundos');
assert.doesNotMatch(html, /setInterval\(syncStorage,2500\)/, 'no debe quedar el temporizador de 2,5 segundos');

console.log('SENDWAYO expediente/performance: comprobaciones estáticas correctas.');
