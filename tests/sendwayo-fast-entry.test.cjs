const assert = require('node:assert/strict');
const fs = require('node:fs');

const fast = fs.readFileSync('SENDWAYO-V7-FAST-ENTRY.html', 'utf8');
const publicV118 = fs.readFileSync('site/SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html', 'utf8');
const siteIndex = fs.readFileSync('site/index.html', 'utf8');
const rootV118 = fs.readFileSync('SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html', 'utf8');
const fullApp = fs.readFileSync('site/SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html', 'utf8');

assert.ok(Buffer.byteLength(fast, 'utf8') < 30000, 'la pantalla pública debe ser ligera (menos de 30 KB)');
assert.equal(publicV118, fast, 'el enlace V118 debe servir exactamente la pantalla rápida');
assert.equal(siteIndex, fast, 'la portada principal debe ser la misma pantalla rápida');
assert.equal(rootV118, fast, 'la copia raíz V118 debe permanecer sincronizada');

for (const id of ['login-email','login-password','show-password','forgot-password','remember-me','login-button','register-button','register-modal','register-form']) {
  assert.ok(fast.includes('id="' + id + '"'), 'falta el control funcional: ' + id);
}
for (const marker of [
  'assets/sendwayo-logo-transparent.webp',
  'addEventListener(\'click\'', 
  'addEventListener(\'submit\'',
  'signInWithEmailAndPassword',
  'sendPasswordResetEmail',
  'sendwayo_express_v2/requests',
  'sendwayo_remember',
  'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html',
  'sendwayoexpress@gmail.com',
  'ideletteismorin@gmail.com'
]) assert.ok(fast.includes(marker), 'falta la función de acceso: ' + marker);

assert.equal((fast.match(/<img\b/gi)||[]).length, 1, 'la portada debe mostrar únicamente el logo, sin imágenes decorativas');
assert.ok(!fast.includes('sendwayo-logo-real.jpg'), 'el logo con fondo no debe aparecer en la portada');
assert.ok(!fast.includes('cdn.tailwindcss.com'), 'la portada no debe esperar a una librería visual externa');
assert.ok(fullApp.length > 500000, 'el panel completo V7 debe seguir presente detrás del acceso');
assert.ok(fullApp.includes("const ADMIN_EMAIL = 'ideletteismorin@gmail.com';"), 'se debe conservar el correo real de Firebase');
assert.ok(fullApp.includes('sendwayoRememberedPersistence'), 'el panel debe respetar la preferencia Recordarme');
assert.ok(fullApp.includes('sendwayo-logo-transparent.webp'), 'el panel también debe utilizar el logo transparente');

console.log('PASS: V118 ligero; correo, contraseña, Ver, recuperación, Ingresar y Registrar; logo transparente; panel V7 conservado.');
