const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Expediente por ID: solo administración puede consultar la identidad y sus registros.
assert.ok(html.includes('Expediente por ID'));
assert.ok(html.includes('function showAccountInvestigation'));
assert.ok(html.includes('function accountTransactions'));
assert.ok(html.includes('Solicitudes y revisiones relacionadas'));
assert.ok(html.includes('Cuentas bancarias vinculadas'));
assert.ok(html.includes('Este agente opera con fondos de Administración'));
assert.ok(html.includes('sendwayoRenderAccountInvestigation'));

// Catálogo internacional: países completos y búsqueda escrita en las ventanillas.
assert.ok(html.includes('fallbackCountriesData=[') || html.includes('SENDWAYO_V7_COUNTRIES'));
assert.ok(html.includes('function installCountrySearch(select)'));
assert.ok(html.includes('Escriba el nombre del país para buscar'));
assert.ok(html.includes('País de origen'));
assert.ok(html.includes('País de destino'));
assert.ok(html.includes('sendwayo-v7-envio-from'));
assert.ok(html.includes('sendwayo-v7-retiro-to'));
assert.ok(html.includes("if(c.alpha2==='DO')return ['+1-809','+1-829','+1-849']"));

// Moneda: DOP y HTG permanecen separadas y la ruta HT→RD no usa una tasa automática.
assert.ok(html.includes('function updateRouteCalc(kind)'));
assert.ok(html.includes('Sin conversión automática'));
assert.ok(html.includes('HTG'));
assert.ok(html.includes('balanceDOP') && html.includes('balanceHTG'));
assert.ok(html.includes('commissionDOP') && html.includes('commissionHTG'));
assert.ok(!html.includes('received=net/2.30'));
assert.ok(!html.includes("rec=formatMoney(net/2.3)+' DOP'"));

// Sesión y rendimiento: conservar la duración por inactividad y sincronización con un intervalo moderado.
assert.ok(html.includes('auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)'));
assert.ok(html.includes('IDLE_LIMIT=40*60*1000'));
assert.ok(html.includes('CLOUD_SYNC_INTERVAL_MS=15000'));
assert.ok(!html.includes('setInterval(syncStorage,2500)'));
assert.ok(!html.includes('setInterval(refresh,4000)'));

// Encabezado y navegación con marca a la izquierda y menú lateral vertical.
assert.ok(html.includes('sendwayo-v7-canonical-top-workspace-style'));
assert.ok(html.includes('sendwayo-v7-final-user-experience'));
assert.ok(html.includes('left.insertBefore(btn,title.nextSibling)'));
assert.ok(html.includes('#sendwayo-main-sidebar.sendwayo-menu-open{display:flex!important;flex-direction:column!important;transform:translateX(0)!important;'));
assert.ok(html.includes('sendwayo-v7-username') && html.includes('sendwayo-v7-phone'));
assert.ok(html.includes('function tickSession()'));

// Comprobante PNG con logo y marca de agua.
assert.ok(html.includes('function setupReceiptWatermark()'));
assert.ok(html.includes('sendwayoShareReceipt=async function()'));
assert.ok(html.includes('image/png'));
assert.ok(html.includes('sendwayo-logo-real.jpg'));

// No se deben perder módulos existentes ni campos de transacción.
const preservedViews = ['tablero','envios','retiros','beneficiarios','remitentes','agentes','recargas','paquetikos','recepcion','facturas','mibanco','cuentas','ajustes','comisiones','conciliacion','reportes','informes','secretas','perfil'];
for (const view of preservedViews) assert.ok(html.includes('id="view-' + view + '"'), 'no debe desaparecer el módulo ' + view);
for (const field of ['login-usuario','login-password','v162-envio-monto','v162-retiro-monto','v162-ben-nom','v162-ben-tel','v162-rem-nom','v162-rec-num','v162-pkt-rec','v162-fac-num','aj171-cantidad']) {
  assert.ok(html.includes('id="' + field + '"'), 'no debe desaparecer el campo ' + field);
}
assert.ok(html.includes("panel.id='sendwayo-v7-daily-gains'"));
assert.ok(html.includes('Balance en Gourdes Haitianos (HTG)'));
assert.ok(html.includes('Balance en Pesos Dominicanos (DOP)'));
assert.ok(html.includes('Comisión en Gourdes Haitianos (HTG)'));
assert.ok(html.includes('Comisión en Pesos Dominicanos (DOP)'));

console.log('PASS: expediente por ID, países, moneda, sesión, comprobante PNG y módulos conservados.');
