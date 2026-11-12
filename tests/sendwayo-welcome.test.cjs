const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html'),'utf8');
const start=html.indexOf('<div id="welcome-landing"');
assert.ok(start>=0,'la versión V7 debe tener bienvenida');
const login=html.indexOf('<div id="login-screen"',start);
const end=html.indexOf('</section>',login);
assert.ok(login>start&&end>login,'el formulario completo debe estar dentro de la bienvenida');
const welcome=html.slice(start,end+'</section>'.length);
assert.match(welcome,/<img class="sendwayo-entry-logo" src="assets\/sendwayo-logo-transparent\.webp"/,'debe utilizar el logo oficial transparente');
assert.match(welcome,/<h1 id="sendwayo-entry-title">SENDWAYO EXPRESS<\/h1>/,'debe mostrar el nombre del negocio debajo del logo');
assert.ok(welcome.indexOf('class="sendwayo-entry-logo"')<welcome.indexOf('<h1 id="sendwayo-entry-title"'),'el logo debe aparecer antes del nombre');
for(const marker of ['id="login-usuario"','id="login-password"','id="sendwayo-toggle-password"','id="sendwayo-remember-credentials"','id="sendwayo-recover-button"']){
  assert.ok(welcome.includes(marker),'falta el control de acceso: '+marker);
}
assert.match(welcome,/id="sendwayo-entry-login-button"[^>]*onclick="intentarLogin\(\)"[^>]*>INGRESAR/,'INGRESAR debe llamar al acceso Firebase existente');
assert.match(welcome,/id="sendwayo-entry-register-button"[^>]*onclick="sendwayoOpenPublicRequest\('Quiero ser remitente'\)"[^>]*>REGISTRAR/,'REGISTRAR debe abrir la solicitud pública');
assert.doesNotMatch(welcome,/sendwayo-welcome-only-photo|sendwayo-home-main-photo|sendwayo-home-gallery|<video/i,'la bienvenida no debe mostrar fotografías ni vídeos');
assert.ok(html.includes('sendwayo-v7-welcome-centered-logo-login-register-final'),'debe aplicar el diseño centrado de la bienvenida');
assert.ok(html.includes('sendPasswordResetEmail(resetEmail)'),'la recuperación debe conservar Firebase Authentication');
console.log('PASS: bienvenida centrada con logo oficial, nombre, acceso, recordar, recuperación y registro.');
