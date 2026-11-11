const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html'), 'utf8');
const finalScriptAt = html.lastIndexOf('<script id="sendwayo-v7-final-id-only-controller">');
const finalScriptOpen = html.indexOf('>', finalScriptAt) + 1;
const finalScriptEnd = html.indexOf('</script>', finalScriptOpen);
assert.ok(finalScriptAt >= 0 && finalScriptEnd > finalScriptOpen, 'debe existir un único controlador final de la cabecera');

const finalScript = html.slice(finalScriptOpen, finalScriptEnd);
assert.doesNotThrow(() => new Function(finalScript), 'el controlador final no debe contener errores de sintaxis');

for (const id of ['sendwayo-brand-bar','sendwayo-v7-business-name','sendwayo-mobile-menu','sendwayo-v7-user-strip','sendwayo-v7-name','sendwayo-v7-role','sendwayo-v7-id','sendwayo-v7-username','sendwayo-v7-phone','sendwayo-v7-date','sendwayo-v7-clock','sendwayo-v7-duration']) {
  assert.ok(html.includes('id="' + id + '"'), 'falta el elemento de cabecera ' + id);
}
assert.match(finalScript, /function ensureIdentityMarkup\(\)/);
assert.match(finalScript, /function updateIdentity\(\)/);
assert.match(finalScript, /sendwayo-v7-username/);
assert.match(finalScript, /sendwayo-v7-phone/);
assert.match(finalScript, /function tickSession\(\)/);
assert.match(finalScript, /window\.setInterval\(tickSession,1000\)/);
assert.match(finalScript, /function moveMenuButton\(\)/);
assert.match(finalScript, /left\.insertBefore\(btn,title\.nextSibling\)/);
assert.match(finalScript, /function fixSidebar\(\)/);
assert.match(finalScript, /function installAllCountrySearch\(\)/);
assert.match(finalScript, /function scrubVisibleLegacyCodes\(\)/);

const css = html.slice(html.lastIndexOf('<style id="sendwayo-v7-final-user-experience">'), html.lastIndexOf('</style>'));
assert.match(css, /#sendwayo-main-sidebar\{[^}]*left:0!important[^}]*width:260px!important/s);
assert.match(css, /#sendwayo-main-sidebar\.sendwayo-menu-open\{display:flex!important;flex-direction:column!important;transform:translateX\(0\)!important;/);
assert.match(css, /#sendwayo-brand-bar #sendwayo-mobile-menu\{order:3!important;/);
assert.match(css, /#sendwayo-v7-code\{display:none!important\}/);
assert.match(css, /body\.sendwayo-authenticated #sendwayo-main-content::before/);

console.log('PASS: V7 header fields, left slide-out navigation, session timer and ID-only view.');
