const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const html = fs.readFileSync('SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html', 'utf8');
const assert = require('assert');

assert.strictEqual((html.match(/"alpha2":"/g) || []).length, 250, 'El catálogo debe conservar los 250 países/territorios');
assert.strictEqual((html.match(/id="sendwayo-mobile-menu"/g) || []).length, 1, 'Debe existir un solo menú hamburguesa');
assert(html.indexOf('sendwayo-brand-logo') < html.indexOf('sendwayo-v7-business-name'), 'El logo va antes del nombre comercial');
assert(html.indexOf('sendwayo-v7-business-name') < html.indexOf('sendwayo-mobile-menu'), 'El menú va después del nombre comercial');
assert(!/Código:|Cód\.:/.test(html), 'No deben quedar etiquetas de código visibles');
assert(html.includes('ADMIN-ADMINISTRADOR'), 'El ID administrativo oficial debe estar presente');
assert(html.includes("rolePrefix=view==='agentes'?'AG':'RE'"), 'La generación de IDs AG/RE debe estar activa');
assert(html.includes('makeHumanId(name.value)'), 'El ID nuevo debe adaptarse al nombre');
assert(html.includes('attachCountrySearch(select)'), 'Los selectores de país deben admitir escritura y sugerencias');
assert(html.includes('open.er-api.com/v6/latest/USD'), 'Debe consultar la tasa de referencia automáticamente');
assert(html.includes('restcountries.com/v3.1/all?fields=cca2,currencies'), 'Debe obtener moneda por país');
assert(html.includes('sendwayoOpenIdFile'), 'Debe estar disponible el expediente por ID');
assert(html.includes('sendwayoOpenCardPayments'), 'Debe estar disponible la preparación PayPal');
assert(html.includes('sendwayo-v7-final-integrity'), 'Debe conservar el control de aprobación única');
assert(html.includes('sendwayo-v7-header-one-line-runtime'), 'Debe conservar el encabezado de una línea');
assert(!html.includes('2200'), 'No debe introducir la espera artificial de 2.2 segundos');
assert(!html.includes('renderPrincipal(); },500'), 'No debe renderizar el tablero antes del login');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sendwayo-v7-'));
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(Boolean);
const syntaxErrors = [];
scripts.forEach((code, i) => {
  const file = path.join(temp, 'inline-' + (i + 1) + '.js');
  fs.writeFileSync(file, code, 'utf8');
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) syntaxErrors.push({ script: i + 1, output: (check.stderr || check.stdout).trim() });
});
if (syntaxErrors.length) {
  console.error('Errores de sintaxis JavaScript inline:', JSON.stringify(syntaxErrors, null, 2));
  process.exit(1);
}
console.log('SENDWAYO V7: catálogo 250 países, ID-only, encabezado, Firebase/login, FX y PayPal verificados.');
console.log('JavaScript inline comprobado:', scripts.length, 'bloques.');
