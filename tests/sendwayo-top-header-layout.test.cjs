const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoFile = path.join(__dirname, '..', 'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html');
const publicFile = path.join(__dirname, '..', 'SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html');
const html = fs.readFileSync(repoFile, 'utf8');
const publicHtml = fs.readFileSync(publicFile, 'utf8');

for (const source of [html, publicHtml]) {
  const landingStart = source.indexOf('<div id="welcome-landing"');
  const landingEnd = source.indexOf('<style id="sendwayo-v7-welcome-actions">', landingStart);
  assert.ok(landingStart >= 0 && landingEnd > landingStart, 'la portada pública debe existir');
  const landing = source.slice(landingStart, landingEnd);
  assert.equal((landing.match(/<img\\b/g) || []).length, 1, 'la portada debe tener una sola fotografía');
  assert.equal((landing.match(/<button\\b/g) || []).length, 2, 'la portada debe tener solo Ingresar y Registrarse');
  assert.ok(landing.includes('assets/sendwayo-bienvenida.jpg'), 'debe usar la fotografía de bienvenida confirmada');
  assert.ok(landing.includes('>INGRESAR</button>') && landing.includes('>REGISTRARSE</button>'));
  assert.ok(!landing.includes('v162-car-main') && !landing.includes('carouselImgs'), 'no debe quedar carrusel');
  assert.ok(!/<video\\b/i.test(landing), 'no debe haber video de bienvenida');

  const brandAt = source.indexOf('<div id="sendwayo-brand-bar"');
  const identityAt = source.indexOf('<section id="sendwayo-v7-user-strip"');
  const shellAt = source.indexOf('<div id="sendwayo-workspace-shell"');
  assert.ok(brandAt >= 0 && identityAt > brandAt && shellAt > identityAt, 'marca e identidad deben quedar encima del módulo');
  for (const id of ['sendwayo-v7-business-name','sendwayo-mobile-menu','sendwayo-v7-id','sendwayo-v7-name','sendwayo-v7-username','sendwayo-v7-phone','sendwayo-v7-date','sendwayo-v7-clock','sendwayo-v7-duration']) {
    assert.ok(source.includes('id="' + id + '"') || source.includes(id), 'falta el control superior ' + id);
  }
  assert.ok(source.includes("left.insertBefore(btn,title.nextSibling)"), 'las tres rayas deben ir inmediatamente después del nombre del negocio');
  assert.ok(source.includes('#sendwayo-main-sidebar.sendwayo-menu-open{display:flex!important;flex-direction:column!important;transform:translateX(0)!important;'), 'el menú debe deslizarse desde la izquierda en vertical');
  assert.ok(source.includes('#sendwayo-mobile-menu{order:3!important;'), 'logo, nombre y menú deben conservar ese orden');
  assert.ok(source.includes('function scrubVisibleLegacyCodes()'), 'no deben quedar códigos antiguos en las listas visibles');
  assert.ok(source.includes('#sendwayo-v7-code{display:none!important}'), 'el campo de código debe permanecer oculto');
  assert.ok(source.includes('function installCountrySearch(select)'), 'las rutas deben permitir buscar países por nombre');
  assert.ok(source.includes('assets/sendwayo-logo-real.jpg'), 'el logo debe conservarse para las marcas de agua');
  assert.ok(source.includes('body.sendwayo-authenticated #sendwayo-main-content::before'), 'las páginas interiores deben llevar marca de agua');
  assert.ok(source.includes('function setupReceiptWatermark()'), 'el comprobante debe conservar su marca de agua');
  for (const id of ['sendwayo-v7-bal-dop','sendwayo-v7-bal-htg','sendwayo-v7-com-dop','sendwayo-v7-com-htg']) {
    assert.ok(source.includes('id="' + id + '"'), 'debe permanecer el campo financiero ' + id);
  }
  assert.ok(source.includes('CLOUD_SYNC_INTERVAL_MS=15000'), 'la sincronización no debe ejecutar una lectura completa cada segundo');
}

console.log('PASS: portada de una foto, encabezado por ID, menú lateral, reloj, países y marcas de agua.');
