const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const fast=fs.readFileSync(path.join(__dirname,'..','SENDWAYO-V7-FAST-ENTRY.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'..','SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html'),'utf8');

assert.match(fast,/<img class="brand-logo" src="assets\/sendwayo-logo-real\.jpg"/,'la portada debe usar el único logo oficial JPG original');
assert.equal((fast.match(/<img\b/g)||[]).length,1,'la portada no debe tener fotos ni logos duplicados');
assert.match(fast,/value="sendwayoexpress@gmail\.com"/,'el usuario del administrador debe aparecer en el campo de acceso');
for(const id of ['login-email','login-password','show-password','remember-me','forgot-password','login-button','register-button','register-name','register-phone','register-email','register-password','register-password-confirm']){
  assert.ok(fast.includes('id="'+id+'"'),'falta el control de acceso: '+id);
}
assert.equal((fast.match(/id="forgot-password"/g)||[]).length,1,'debe haber un solo control para recuperar la contraseña');
assert.match(fast,/sendPasswordResetEmail\(email\)/,'la recuperación debe enviar el enlace usando el correo Firebase resuelto');
assert.match(fast,/password!==confirmPassword/,'el registro debe confirmar la contraseña');
assert.match(fast,/createUserWithEmailAndPassword\(email,password\)/,'el registro debe crear la cuenta con la contraseña del solicitante');
assert.ok(fast.includes("database.ref(ROOT+'/requests/'+id).set(row)"),'la solicitud debe enviarse al administrador en Firebase');
assert.ok(fast.includes("targetUserId:'admin',targetRole:'ADMIN',targetView:'bienvenida'"),'la solicitud debe generar una notificación al administrador');

assert.match(app,/const ADMIN_EMAIL = 'ideletteismorin@gmail\.com';/,'V7 debe reconocer el correo real de Firebase');
assert.match(app,/username:'sendwayoexpress@gmail\.com'/,'V7 debe mantener el alias de acceso solicitado');
assert.match(app,/let requestQuery=db\.ref\(ROOT\+'\/requests'\)/,'el panel debe escuchar las solicitudes nuevas');
assert.match(app,/window\.SENDWAYO_REQUESTS=rows/,'el panel debe conservar las solicitudes recibidas');
assert.match(app,/sendwayo-v7-self-registration-approval/,'el administrador debe poder aprobar o rechazar la solicitud');
console.log('PASS: página pública y V7 con logo oficial, acceso administrativo, recuperación, registro y entrega de solicitudes.');
