const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html'), 'utf8');
const fast = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-V7-FAST-ENTRY.html'), 'utf8');

assert.match(fast, /<img class="brand-logo" src="assets\/sendwayo-logo-real\.jpg"/, 'la pantalla pública debe usar el logo oficial JPG');
assert.equal((fast.match(/<img\b/g) || []).length, 1, 'la pantalla pública debe mostrar un solo logo');
assert.equal((fast.match(/id="forgot-password"/g) || []).length, 1, 'debe existir una sola recuperación de contraseña');
for (const id of ['login-email','login-password','show-password','forgot-password','remember-me','login-button','register-button','register-name','register-phone','register-email','register-password','register-password-confirm']) {
  assert.ok(fast.includes('id="' + id + '"'), 'falta ' + id + ' en la pantalla pública');
}
assert.ok(fast.includes('value="sendwayoexpress@gmail.com"'), 'el usuario administrativo debe estar precargado');
assert.ok(fast.includes('sendPasswordResetEmail(email)'), 'la recuperación debe usar Firebase');
assert.ok(fast.includes('password!==confirmPassword'), 'el registro debe confirmar que ambas contraseñas coincidan');
assert.ok(fast.includes("database.ref(ROOT+'/requests/'+id).set(row)"), 'el registro debe enviar la solicitud a Firebase');
assert.ok(fast.includes("targetUserId:'admin',targetRole:'ADMIN',targetView:'bienvenida'"), 'el aviso debe dirigirse al administrador');

const brandAt = app.indexOf('<div id="sendwayo-brand-bar"');
const identityAt = app.indexOf('<section id="sendwayo-v7-user-strip"');
const shellAt = app.indexOf('<div id="sendwayo-workspace-shell"');
assert.ok(brandAt >= 0 && identityAt > brandAt && shellAt > identityAt, 'marca e identidad deben quedar arriba del área de trabajo');
for (const id of ['sendwayo-v7-business-name','sendwayo-mobile-menu','sendwayo-v7-id','sendwayo-v7-name','sendwayo-v7-role','sendwayo-v7-date','sendwayo-v7-clock','sendwayo-v7-duration']) {
  assert.ok(app.includes('id="' + id + '"'), 'falta ' + id + ' en el encabezado superior');
}
assert.ok(app.includes('id="sendwayo-main-sidebar"'), 'debe conservarse el menú lateral con los módulos');
assert.ok(app.includes('left.insertBefore(btn,title.nextSibling)'), 'el botón de tres líneas debe estar junto al encabezado');
assert.ok(app.includes("document.addEventListener('click',ev=>{const b=ev.target?.closest?.('#sendwayo-mobile-menu')"), 'el menú de tres líneas debe responder al clic');
assert.ok(app.includes('#sendwayo-main-sidebar.sendwayo-menu-open'), 'el menú desplegado debe tener estado visible');
assert.ok(app.includes('translateX(0)!important'), 'el menú móvil debe desplazarse a la pantalla');
assert.ok(app.includes('function scrubVisibleLegacyCodes()'));
assert.ok(app.includes('function installCountrySearch(select)'));
assert.ok(app.includes('function setupReceiptWatermark()'));
assert.ok(app.includes('sendwayo-logo-real.jpg'), 'el panel V7 debe usar el logo oficial');
assert.ok(app.includes('const ADMIN_EMAIL = \'ideletteismorin@gmail.com\';'), 'V7 debe reconocer la identidad Firebase real del administrador');
assert.ok(app.includes("username:'sendwayoexpress@gmail.com'"), 'el usuario público del administrador debe seguir disponible');
assert.ok(app.includes('CLOUD_SYNC_INTERVAL_MS=15000'));

console.log('PASS: logo oficial, formulario rápido, usuario administrador, identidad/hora/fecha arriba, menú móvil y módulos laterales.');

