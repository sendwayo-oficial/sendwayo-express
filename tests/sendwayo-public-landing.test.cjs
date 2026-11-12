const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html'), 'utf8');
const start = html.indexOf('<div id="welcome-landing"');
assert.ok(start >= 0, 'la portada pública debe existir');
const end = html.indexOf('</section>', start);
assert.ok(end > start, 'la tarjeta pública debe estar completa');
const welcome = html.slice(start, end + '</section>'.length);

assert.match(welcome, /<img class="sendwayo-entry-logo" src="assets\/sendwayo-logo-real\.jpg"/, 'el logo oficial debe aparecer en la portada');
assert.match(welcome, /<h1 id="sendwayo-entry-title">SENDWAYO EXPRESS<\/h1>/, 'el nombre del negocio debe aparecer debajo del logo');
assert.ok(welcome.indexOf('class="sendwayo-entry-logo"') < welcome.indexOf('<h1 id="sendwayo-entry-title"'), 'el logo debe aparecer antes del nombre');
assert.match(welcome, /id="login-screen"/, 'el formulario de acceso debe mostrarse directamente en la portada');
assert.match(welcome, /id="login-usuario"/, 'debe existir el campo de usuario o correo');
assert.match(welcome, /id="login-password"/, 'debe existir el campo de contraseña');
assert.match(welcome, /id="sendwayo-toggle-password"/, 'debe existir el control para mostrar u ocultar la contraseña');
assert.match(welcome, /id="sendwayo-remember-credentials"/, 'debe existir Recordarme');
assert.match(welcome, /id="sendwayo-recover-button"/, 'debe existir Recuperar contraseña');
assert.match(welcome, /id="sendwayo-entry-login-button"[^>]*onclick="intentarLogin\(\)"[^>]*>INGRESAR/, 'Ingresar debe llamar al acceso real');
assert.match(welcome, /id="sendwayo-entry-register-button"[^>]*onclick="sendwayoOpenPublicRequest\('Quiero ser remitente'\)"[^>]*>REGISTRAR/, 'Registrar debe abrir la solicitud pública de alta');
assert.doesNotMatch(welcome, /sendwayo-welcome-only-photo|sendwayo-home-main-photo|sendwayo-home-gallery/, 'la portada no debe mostrar fotografías');

assert.match(html, /sendwayo-v7-welcome-centered-logo-login-register-final/, 'debe aplicarse el diseño centrado definitivo');
assert.match(html, /width:68px!important;height:56px!important/, 'el logo debe ser discreto');
assert.match(html, /font-size:clamp\(25px,5vw,30px\)!important/, 'el nombre del negocio debe destacar más que el logo');
assert.match(html, /#welcome-landing>main\.sendwayo-home-minimal[\s\S]*?align-items:center!important;justify-content:center!important/, 'el contenido principal debe quedar centrado');
assert.match(html, /option \$\{service==='Quiero ser remitente'\?'selected':''\}>Quiero ser remitente/, 'el registro debe abrir con la solicitud de remitente seleccionada');
assert.match(html, /window\.sendwayoFirebaseLoginReady=attemptLogin/, 'Ingresar debe conservar el inicio de sesión Firebase');
assert.match(html, /const recoverButton=document\\.getElementById\\('sendwayo-recover-button'\\);[\\s\\S]*?recoverButton\\.onclick=async/, 'la recuperación debe conservar el envío de enlace por Firebase');
assert.doesNotMatch(html, /https:\/\/cdn\.tailwindcss\.com/, 'la página no debe depender del CDN externo');

console.log('PASS: bienvenida centrada con logo oficial, nombre del negocio, acceso directo, recuperación y registro.');
