const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html'), 'utf8');
const tag = '<script id="sendwayo-v7-final-id-only-controller">';
const at = html.lastIndexOf(tag);
const open = html.indexOf('>', at) + 1;
const end = html.indexOf('</script>', open);
assert.ok(at >= 0 && end > open, 'debe existir el controlador final');
const controller = html.slice(open, end);
assert.doesNotThrow(() => new Function(controller), 'el controlador de cabecera debe ser JavaScript válido');

for (const id of ['sendwayo-brand-bar','sendwayo-v7-business-name','sendwayo-mobile-menu','sendwayo-v7-user-strip','sendwayo-v7-name','sendwayo-v7-role','sendwayo-v7-id','sendwayo-v7-username','sendwayo-v7-phone','sendwayo-v7-date','sendwayo-v7-clock','sendwayo-v7-duration']) {
  assert.ok(html.includes('id="' + id + '"'), 'falta elemento ' + id);
}
for (const term of ['function ensureIdentityMarkup()','function updateIdentity()','function tickSession()','window.setInterval(tickSession,5000)','function moveMenuButton()','left.insertBefore(btn,title.nextSibling)','function fixSidebar()','function installAllCountrySearch()','function scrubVisibleLegacyCodes()']) {
  assert.ok(controller.includes(term), 'falta controlador ' + term);
}
const cssStart=html.lastIndexOf('<style id="sendwayo-v7-final-user-experience">');
const cssEnd=html.indexOf('</style>',cssStart);
const css=html.slice(cssStart,cssEnd);
assert.ok(css.includes('#sendwayo-main-sidebar{')&&css.includes('left:0!important')&&css.includes('width:260px!important'));
assert.ok(css.includes('#sendwayo-main-sidebar.sendwayo-menu-open{display:flex!important;flex-direction:column!important;transform:translateX(0)!important;'));
assert.ok(css.includes('#sendwayo-brand-bar #sendwayo-mobile-menu{order:3!important;'));
assert.ok(css.includes('#sendwayo-v7-code{display:none!important}'));
assert.ok(css.includes('body.sendwayo-authenticated #sendwayo-main-content::before'));
console.log('PASS: cabecera, panel lateral izquierdo, reloj de sesión e identidad por ID.');
