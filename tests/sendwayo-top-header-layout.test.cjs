const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html'), 'utf8');
const publicHtml = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html'), 'utf8');

for (const source of [html, publicHtml]) {
  const start = source.indexOf('<div id="welcome-landing"');
  const end = source.indexOf('<style id="sendwayo-v7-welcome-actions">', start);
  assert.ok(start >= 0 && end > start, 'la portada pública debe existir');
  const landing = source.slice(start, end);
  assert.equal(landing.split('<img').length - 1, 1, 'la portada debe tener solo el logo corporativo');
  assert.equal(landing.split('<button').length - 1, 1, 'la portada debe tener solo el botón Ingresar');
  assert.ok(landing.includes('assets/sendwayo-logo-real.jpg'));
  assert.ok(!landing.includes('assets/sendwayo-bienvenida.jpg'));
  assert.ok(landing.includes('>INGRESAR</button>') && !landing.includes('>REGISTRAR</button>'));
  assert.ok(!landing.includes('sendwayo-landing-photo-panel') && !landing.includes('v162-car-main') && !landing.includes('carouselImgs'));
  assert.ok(!landing.toLowerCase().includes('<video'));

  const brandAt = source.indexOf('<div id="sendwayo-brand-bar"');
  const identityAt = source.indexOf('<section id="sendwayo-v7-user-strip"');
  const shellAt = source.indexOf('<div id="sendwayo-workspace-shell"');
  assert.ok(brandAt >= 0 && identityAt > brandAt && shellAt > identityAt);
  for (const id of ['sendwayo-v7-business-name','sendwayo-mobile-menu','sendwayo-v7-id','sendwayo-v7-name','sendwayo-v7-username','sendwayo-v7-phone','sendwayo-v7-date','sendwayo-v7-clock','sendwayo-v7-duration']) {
    assert.ok(source.includes('id="' + id + '"') || source.includes(id), 'falta ' + id);
  }
  assert.ok(source.includes('left.insertBefore(btn,title.nextSibling)'));
  assert.ok(source.includes('#sendwayo-main-sidebar.sendwayo-menu-open{display:flex!important;flex-direction:column!important;transform:translateX(0)!important;'));
  assert.ok(source.includes('#sendwayo-brand-bar #sendwayo-mobile-menu{order:3!important;'));
  assert.ok(source.includes('function scrubVisibleLegacyCodes()'));
  assert.ok(source.includes('#sendwayo-v7-code{display:none!important}'));
  assert.ok(source.includes('function installCountrySearch(select)'));
  assert.ok(source.includes('body.sendwayo-authenticated #sendwayo-main-content::before'));
  assert.ok(source.includes('function setupReceiptWatermark()'));
  for (const id of ['sendwayo-v7-bal-dop','sendwayo-v7-bal-htg','sendwayo-v7-com-dop','sendwayo-v7-com-htg']) assert.ok(source.includes('id="' + id + '"'));
  assert.ok(source.includes('CLOUD_SYNC_INTERVAL_MS=15000'));
}
console.log('PASS: portada de ingreso único, ID, cabecera, menú lateral, reloj, búsqueda de países y marcas de agua.');
