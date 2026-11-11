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

// Identidad administrativa: el correo de Firebase debe coincidir con el usuario SENDWAYO confirmado.
assert.match(html, /username:'sendwayoexpress@gmail\.com', login:'sendwayoexpress@gmail\.com'/);
assert.match(html, /email:'sendwayoexpress@gmail\.com'/);
assert.match(html, /const ADMIN_EMAIL = 'sendwayoexpress@gmail\.com';/);
assert.doesNotMatch(html, /ideletteismorin@gmail\.com/, 'la cuenta GitHub no debe sustituir al correo de acceso de SENDWAYO');
assert.match(html, /function resolveEmail\(identifier\)[\s\S]{0,700}if\(match\) return match\.email;/, 'el usuario público debe resolverse al correo de Firebase confirmado');

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
assert.match(html, /window\.setInterval\(\(\)=>\{const active=document\.querySelector\('\.view:not\(\.hidden\)'\);if\(active&&active\.id==='view-tablero'\)refresh\(\);\},60000\)/);
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
// Encabezado horizontal y navegación vertical desde el borde izquierdo.
assert.match(html, /sendwayo-v7-canonical-top-workspace-style/);
assert.match(html, /sendwayo-v7-approved-desktop-left-sidebar/);
assert.match(html, /sendwayo-v7-user-strip/);
assert.match(html, /insertAdjacentElement\('afterend',strip\)/);
assert.match(html, /#sendwayo-main-sidebar\{[\s\S]*?position:fixed!important;left:0!important;right:auto!important;top:118px!important;bottom:0!important;/);
assert.match(html, /#sendwayo-main-sidebar\{[\s\S]*?grid-template-columns:1fr!important/);
assert.match(html, /#sendwayo-main-sidebar\.sendwayo-menu-open\{[\s\S]*?transform:translateX\(0\)!important/);
assert.match(html, /actions\.insertBefore\(btn,actions\.firstChild\)/);
assert.match(html, /#sendwayo-main-content\{[\s\S]*?width:calc\(100% - 250px\)!important/);
for (const id of ['sendwayo-v7-bal-dop','sendwayo-v7-bal-htg','sendwayo-v7-com-dop','sendwayo-v7-com-htg']) {
 assert.ok(html.includes('id="' + id + '"'), 'falta el indicador financiero superior ' + id);
}
assert.match(html, /pairs\.forEach/);
assert.match(html, /window\.sendwayoRefreshIdentityHeader=buildIdentityStrip/);

// Comprobante auténtico en imagen PNG.
assert.match(html, /if\(!t\)\{alert\('No se encontró la transacción para generar el comprobante\.'\);return;\}/);
assert.doesNotMatch(html, /if\(!t\) t=\{id:id, fecha:'20\/10\/2026'/);
assert.match(html, /sendwayoShareReceipt=async function\(\)/);
assert.match(html, /image\/png/);


const toolbarFunction = html.match(/function alignToolbars\(root\)\{[\s\S]*?\n  function wrapModuleLauncher/)?.[0] || '';
assert.ok(toolbarFunction, 'la rutina de barras de herramientas debe estar presente');

const legacyToolbarStart = html.lastIndexOf('function alignToolbars(scope){');
assert.ok(legacyToolbarStart >= 0, 'debe localizarse el segundo formateador heredado');
const legacyToolbar = html.slice(legacyToolbarStart, html.indexOf('function queueToolbar(root)', legacyToolbarStart));
assert.match(legacyToolbar, /sendwayo-authenticated/, 'el formateador heredado no debe ejecutarse antes del login');
assert.match(legacyToolbar, /view:not\(\.hidden\)/, 'el formateador heredado debe limitarse a la vista activa');
assert.doesNotMatch(legacyToolbar, /document\.querySelectorAll\('\.view'\)/, 'no debe recorrer módulos ocultos');
const legacyToolbarObserver = html.slice(legacyToolbarStart, html.indexOf('})();', legacyToolbarStart));
assert.match(legacyToolbarObserver, /observer\.observe\(document\.body/, 'el observador de barras se debe limitar al body');
assert.doesNotMatch(legacyToolbarObserver, /observe\(document\.documentElement/, 'el observador de barras no debe vigilar todo documentElement');
assert.match(toolbarFunction, /sendwayo-authenticated/, 'no debe formatear controles antes del acceso');
assert.match(toolbarFunction, /\.view:not\(\.hidden\)/, 'debe limitarse a la pantalla activa');
assert.doesNotMatch(toolbarFunction, /document\.querySelectorAll\('input\[type="search"\]'\)/, 'no debe escanear todas las búsquedas de la plataforma');
assert.match(html, /function queueToolbar\(\)/, 'los cambios del DOM deben pasar por una cola con demora');

console.log('SENDWAYO: expediente, catálogo internacional, sesión, rendimiento y cabecera superior verificados.');

assert.match(html, /function restoreSessionWithoutResettingActivity\(\)\{try\{sessionStorage\.removeItem\('sendwayo_express_oficial_20261029_auth_snapshot_v1'\)\}catch\(_\)\{\}\}/, 'la recarga no debe borrar el último momento de actividad');
assert.match(html, /function restoreAuth\(\)\{try\{sessionStorage\.removeItem\(AUTH_KEY\)\}catch\(_\)\{\}\}/, 'la restauración no debe reiniciar el reloj de inactividad');
assert.match(html, /var prefix=view==='agentes'\?'AGE400I':'REM',num=1/, 'el formulario complementario debe comenzar la serie de agentes en AGE400I1');
assert.match(html, /const prefix=role==='AGENTE'\?'AGE400I':'REM'/, 'el formulario heredado debe comenzar la serie de agentes en AGE400I1');
assert.match(html, /const idPrefix=ag\?'AGE400I':'REM'/, 'el formulario conectado a Firebase debe sugerir AGE400I1');
assert.match(html, /El ID de un agente nuevo debe seguir la serie AGE400I1–AGE400I9/, 'Firebase debe validar la serie de agente indicada');
assert.match(html, /El ID de un remitente nuevo debe tener el formato REM seguido de cinco dígitos/, 'Firebase debe mantener el formato REM + cinco dígitos para remitentes');
const legacyExpStart = html.indexOf('<script id="sendwayo-account-investigation-v2">');
const legacyExpEnd = html.indexOf('</script>', legacyExpStart);
const legacyExpBlock = html.slice(legacyExpStart, legacyExpEnd);
const legacyFind = legacyExpBlock.match(/function findAccount\(q\)\{[^}]+\}/)?.[0] || '';
assert.ok(legacyFind, 'debe existir la búsqueda original del expediente');
assert.doesNotMatch(legacyFind, /codigo|codeAliases|email|phone|telefono|celular/, 'el expediente heredado tampoco debe buscar por código, correo o teléfono');
assert.match(html, /#sendwayo-menu-shade/, 'el menú móvil debe incluir una capa de cierre');
assert.match(html, /@media\(max-width:1024px\)[\s\S]*?#sendwayo-main-sidebar\{[\s\S]*?width:min\(290px,88vw\)!important/, 'el menú móvil debe desplegarse en un panel lateral adaptable');
assert.match(html, /function identity\(a\)\{return \[a\.id,a\.idAnterior,a\.legacyId,a\.accountId,a\.staffId\]/, 'Expediente por ID debe buscar identificadores de cuenta');
const expedienteIdentity = html.match(/function identity\(a\)\{[^}]+\}/)?.[0] || '';
assert.doesNotMatch(expedienteIdentity, /codigo|codeAliases|email|phone|telefono/, 'Expediente por ID no debe aceptar códigos, correo ni teléfonos');
const restoreStart = html.indexOf('auth.onAuthStateChanged(async user=>{', html.indexOf('state.authReadyPromise = auth.setPersistence'));
const restoreEnd = html.indexOf('  });\n  }).catch(error=>', restoreStart);
assert.ok(restoreStart >= 0 && restoreEnd > restoreStart, 'debe existir el callback específico de restauración Firebase');
const restoreBlock = html.slice(restoreStart, restoreEnd);
assert.match(restoreBlock, /setVisibleAfterLogin\(appUser\)[\s\S]*loadRestoredDashboardData/, 'al restaurar, el panel debe abrirse antes de las lecturas secundarias');
assert.doesNotMatch(restoreBlock, /await loadCloudTransactions\(/, 'la restauración no debe esperar los movimientos para mostrar el panel');
assert.match(html, /const IDLE_LIMIT=40\*60\*1000/, 'se debe conservar el cierre por 40 minutos');
assert.match(html, /fallbackCountriesData=\[/, 'el catálogo internacional completo debe estar integrado localmente');

assert.doesNotMatch(html, /AGE40001/, 'no debe sustituir la letra I del ID por el número uno');

// Contrato de preservación: estas pantallas y entradas existentes no pueden desaparecer durante una optimización.
const preservedViews = ['tablero','envios','retiros','beneficiarios','remitentes','agentes','recargas','paquetikos','recepcion','facturas','mibanco','cuentas','ajustes','comisiones','conciliacion','reportes','informes','secretas','perfil'];
for (const view of preservedViews) assert.ok(html.includes('id="view-' + view + '"'), 'no se debe eliminar el módulo ' + view);
// Depósitos se crea como vista independiente al abrirla; debe permanecer su fábrica y renderizado.
assert.match(html, /el\.id='view-depositos'/, 'no se debe quitar la vista dinámica de depósitos');
assert.match(html, /renderModuloSeparado\('depositos'\)/, 'no se debe quitar el renderizado de depósitos');
assert.match(html, /el.id='view-tarifas'/, 'la vista de tarifas se debe seguir creando al abrir el módulo');
assert.match(html, /function renderTariffPage\(/, 'no se debe quitar el módulo de tarifas locales');

const preservedFields = ['login-usuario','login-password','v162-envio-monto','v162-retiro-monto','v162-dep-monto','v162-ben-nom','v162-ben-tel','v162-rem-nom','v162-rec-num','v162-pkt-rec','v162-fac-num','aj171-cantidad','sendwayo-wallet-method','sendwayo-wallet-amount','sw-rate-min','sw-rate-max','sw-rate-envio','sw-rate-retiro'];
for (const field of preservedFields) assert.ok(html.includes('id="' + field + '"'), 'no se debe eliminar el campo ' + field);
assert.match(html, /panel\.id='sendwayo-v7-daily-gains'/, 'debe conservarse la ganancia diaria por moneda');
assert.match(html, /Balance en Gourdes Haitianos \(HTG\)/);
assert.match(html, /Balance en Pesos Dominicanos \(DOP\)/);
assert.match(html, /Comisión en Gourdes Haitianos \(HTG\)/);
assert.match(html, /Comisión en Pesos Dominicanos \(DOP\)/);

