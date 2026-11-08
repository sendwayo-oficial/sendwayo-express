const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Expediente de consulta por ID (solo remitentes/agentes; sin secretos).
assert.match(html, /Expediente por ID/);
assert.match(html, /function subjects\(\)/);
assert.match(html, /role\(a\)!=='ADMIN'/);
assert.match(html, /function identity\(a\)\{return \[a\.id,a\.idAnterior,a\.legacyId,a\.accountId,a\.staffId/);
const identityHelper = html.match(/function identity\(a\)\{[^}]+\}/)?.[0] || '';
assert.ok(identityHelper);
assert.doesNotMatch(identityHelper, /email|phone|a\.aliases/);
assert.match(html, /matches\.length!==1/);
assert.match(html, /Solicitudes y revisiones relacionadas/);
assert.match(html, /Cuentas bancarias vinculadas/);
assert.match(html, /password\|contrasena\|clave\|secret\|token/);
assert.match(html, /Este agente opera con fondos de Administración/);

// Catálogo internacional local: todos los ISO alpha-2, prefijos y rutas.
const countryDataMatch = html.match(/var fallbackCountriesData=(\[[\s\S]*?\]);/);
assert.ok(countryDataMatch, 'el catálogo de países debe estar integrado en el HTML');
const countries = JSON.parse(countryDataMatch[1]);
assert.equal(countries.length, 250, 'debe incluir los 250 países/territorios del catálogo ISO alpha-2');
assert.equal(new Set(countries.map(x => x.alpha2)).size, 250, 'no debe repetir códigos ISO');
assert.match(html, /if\(c\.alpha2==='DO'\)return \['\+1-809','\+1-829','\+1-849'\]/);
assert.match(html, /País de origen<select/);
assert.match(html, /País de destino<select/);
assert.match(html, /SENDWAYO_CUSTOM_ROUTE/);
assert.match(html, /t\.countryFrom=\{/);
assert.match(html, /t\.countryTo=\{/);

// Sesión y rendimiento: conservar inicio hasta 40 minutos de inactividad.
assert.match(html, /auth\.setPersistence\(firebase\.auth\.Auth\.Persistence\.SESSION\)/);
assert.match(html, /LIMIT=40\*60\*1000/);
assert.match(html, /IDLE_LIMIT=40\*60\*1000/);
assert.match(html, /translationPendingRoots/);
assert.match(html, /translateInterface\(node,languageValue\(\)\)/);
assert.match(html, /roots\.forEach\(root=>scanTables\(root\)\)/);
assert.match(html, /setInterval\(refresh,30000\)/);
assert.match(html, /setInterval\(syncStorage,15000\)/);
assert.doesNotMatch(html, /setInterval\(refresh,4000\)/);
assert.doesNotMatch(html, /setInterval\(syncStorage,2500\)/);

// Moneda: HTG y DOP no se convierten automáticamente en rutas HT → RD.
const routeCalcSource = html.match(/function updateRouteCalc\(kind\)\{[\s\S]*?\n \}\n function mountRouteControls/)?.[0] || '';
assert.ok(routeCalcSource, 'debe existir el cálculo de la ruta');
const field = () => ({ textContent: '', dataset: {} });
const fields = {
  'v162-envio-monto': { value: '2000', dataset: {} },
  'v162-envio-neto': field(),
  'v162-envio-com': field(),
  'v162-envio-rec': field(),
  'v162-envio-tasa': field()
};
const routeEnvironment = {
  $: id => fields[id] || null,
  window: {},
  routeData: () => ({ from: {alpha2:'HT'}, to: {alpha2:'DO'}, currency:'HTG' })
};
const routeCalc = new Function('$','window','routeData', routeCalcSource.replace(/\n function mountRouteControls[\s\S]*$/, '\n return updateRouteCalc;'))(
  routeEnvironment.$, routeEnvironment.window, routeEnvironment.routeData
);
routeCalc('envio');
assert.equal(fields['v162-envio-neto'].textContent, '1,840.00 HTG', 'HT → RD mantiene el neto en HTG, descontando solo el 8%');
assert.equal(fields['v162-envio-com'].textContent, '160.00 HTG', 'la comisión de la ruta HT → RD se expresa en HTG');
assert.equal(fields['v162-envio-rec'].textContent, '1,840.00 HTG', 'no se inventa un importe recibido convertido a DOP');
assert.equal(fields['v162-envio-tasa'].textContent, 'Sin conversión automática', 'la ruta HT → RD no aplica una tasa supuesta');
assert.equal(fields['v162-envio-monto'].dataset.esHT, '1', 'el débito conserva la moneda HTG');

// Ningún módulo heredado ni calculadora secundaria debe reintroducir HTG→DOP automático.
assert.doesNotMatch(html, /received=net\/2\.30/, 'el cálculo de ruta no debe dividir HTG por una tasa fija no acordada');
assert.doesNotMatch(html, /rec=formatMoney\(net\/2\.3\)\s*\+\s*' DOP'/, 'el registro de transacciones no debe convertir automáticamente HTG en DOP');
assert.doesNotMatch(html, /rate='Tasa HT→RD 2\.30'/, 'la calculadora heredada no debe presentar 2.30 como tasa automática');
assert.doesNotMatch(html, /Tasa HT→RD:\s*2\.30/, 'el tablero no debe anunciar una tasa HT→RD no autorizada');
// Encabezado y navegación: todo arriba; ninguna columna lateral permanente.
assert.match(html, /sendwayo-v7-canonical-top-workspace-style/);
assert.match(html, /sendwayo-v7-workspace-layout-controller/);
assert.match(html, /sendwayo-v7-user-strip/);
assert.match(html, /insertAdjacentElement\('afterend',strip\)/);
assert.match(html, /#sendwayo-main-sidebar\{[\s\S]*?left:0!important;right:0!important;/);
assert.match(html, /#sendwayo-main-sidebar\.sendwayo-menu-open\{[^}]*transform:translateY\(0\)/);
assert.match(html, /grid-template-columns:repeat\(auto-fit,minmax\(/);
assert.match(html, /#sendwayo-main-content\{display:block!important;flex:none!important;width:100%!important/);
assert.match(html, /const actions=bar\.querySelector\('\.sendwayo-brand-actions'\)/);
assert.match(html, /actions\.insertBefore\(btn,actions\.firstChild\)/);
assert.match(html, /window\.sendwayoRefreshIdentityHeader=refreshIdentity/);

// Comprobante auténtico en imagen PNG.
assert.match(html, /if\(!t\)\{alert\('No se encontró la transacción para generar el comprobante\.'\);return;\}/);
assert.doesNotMatch(html, /if\(!t\) t=\{id:id, fecha:'20\/10\/2026'/);
assert.match(html, /sendwayoShareReceipt=async function\(\)/);
assert.match(html, /image\/png/);


const toolbarFunction = html.match(/function alignToolbars\(root\)\{[\s\S]*?\n  function wrapModuleLauncher/)?.[0] || '';
assert.ok(toolbarFunction, 'la rutina de barras de herramientas debe estar presente');
assert.match(toolbarFunction, /sendwayo-authenticated/, 'no debe formatear controles antes del acceso');
assert.match(toolbarFunction, /\.view:not\(\.hidden\)/, 'debe limitarse a la pantalla activa');
assert.doesNotMatch(toolbarFunction, /document\.querySelectorAll\('input\[type="search"\]'\)/, 'no debe escanear todas las búsquedas de la plataforma');
assert.match(html, /function queueToolbar\(\)/, 'los cambios del DOM deben pasar por una cola con demora');

console.log('SENDWAYO: expediente, catálogo internacional, sesión, rendimiento y cabecera superior verificados.');
