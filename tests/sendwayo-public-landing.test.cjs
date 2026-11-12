const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fast = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-V7-FAST-ENTRY.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html'), 'utf8');
const deploy = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/deploy-pages.yml'), 'utf8');

assert.match(fast, /<img class="brand-logo" src="assets\/sendwayo-logo-real\.jpg"/, 'la portada debe usar el logo oficial original JPG');
assert.equal((fast.match(/<img\b/g) || []).length, 1, 'la portada debe mostrar un solo logo y ninguna foto decorativa');
assert.match(fast, /value="sendwayoexpress@gmail\.com"/, 'el usuario administrativo debe aparecer precargado');
for (const id of ['login-email','login-password','show-password','forgot-password','remember-me','login-button','register-button','register-modal','register-form']) {
  assert.ok(fast.includes('id="' + id + '"'), 'falta el control de acceso: ' + id);
}
assert.equal((fast.match(/id="forgot-password"/g) || []).length, 1, 'debe existir un solo control de recuperación');
assert.match(fast, /sendPasswordResetEmail\(email\)/, 'la recuperación debe enviar el enlace a la cuenta real que resuelve el alias');

for (const id of ['register-name','register-phone','register-email','register-password','register-password-confirm']) {
  assert.ok(fast.includes('id="' + id + '"'), 'falta el campo obligatorio de registro: ' + id);
}
assert.match(fast, /if\(password!==confirmPassword\)/, 'el registro debe impedir contraseñas diferentes');
assert.match(fast, /createUserWithEmailAndPassword\(email,password\)/, 'el registro debe crear la autenticación con la contraseña elegida');
assert.ok(fast.includes("database.ref(ROOT+'/requests/'+id).set(row)"), 'la solicitud debe guardarse en Firebase para Administración');
assert.match(fast, /targetUserId:'admin',targetRole:'ADMIN',targetView:'bienvenida'/, 'la solicitud debe generar un aviso dirigido al administrador');

assert.match(app, /const ADMIN_EMAIL = 'ideletteismorin@gmail\.com';/, 'V7 debe reconocer el correo real de Firebase');
const admin = app.match(/let ADMIN = \{[\s\S]*?\n\};/);
assert.ok(admin, 'el perfil ADMIN debe existir');
assert.match(admin[0], /email:'ideletteismorin@gmail\.com'/, 'el perfil ADMIN debe conservar el correo de Firebase');
assert.match(admin[0], /username:'sendwayoexpress@gmail\.com'/, 'el usuario visible de ADMIN debe ser el alias solicitado');
assert.match(app, /function resolveEmail\(identifier\)/, 'V7 debe resolver el alias antes de iniciar sesión');
assert.match(app, /let requestQuery=db\.ref\(ROOT\+'\/requests'\)/, 'V7 debe escuchar las solicitudes de registro en Firebase');
assert.match(app, /window\.SENDWAYO_REQUESTS=rows/, 'las solicitudes deben quedar disponibles para el panel administrativo');
assert.match(app, /sendwayo-v7-self-registration-approval/, 'el administrador debe poder aprobar o rechazar los registros');

const bar = app.indexOf('id="sendwayo-brand-bar"');
const identity = app.indexOf('id="sendwayo-v7-user-strip"');
const workspace = app.indexOf('id="sendwayo-workspace-shell"');
assert.ok(bar >= 0 && identity > bar && workspace > identity, 'logo, identidad, hora y fecha deben estar arriba del contenido');
assert.match(app, /id="sendwayo-v7-date"/, 'la fecha debe estar visible arriba');
assert.match(app, /id="sendwayo-v7-clock"/, 'la hora debe estar visible arriba');
assert.match(app, /id="sendwayo-mobile-menu"/, 'el encabezado debe tener el menú de tres líneas');
assert.match(app, /id="sendwayo-main-sidebar"/, 'el menú debe conservar los módulos laterales');
assert.match(app, /function toggle\(\).*sendwayo-menu-open/, 'el menú móvil debe desplegarse');
assert.match(app, /#sendwayo-main-sidebar\.sendwayo-menu-open/, 'el menú desplegado debe tener estilo visible');
assert.match(app, /sendwayo-brand-logo[\s\S]*?sendwayo-logo-real\.jpg/, 'el encabezado del panel debe usar el logo oficial');

assert.match(deploy, /cp SENDWAYO-V7-FAST-ENTRY\.html site\/index\.html/, 'Pages debe publicar la pantalla de acceso funcional');
assert.match(deploy, /cp -R assets\/. site\/assets\//, 'Pages debe copiar el logo original junto con los recursos');
assert.match(deploy, /assets\/sendwayo-logo-real\.jpg/, 'Pages debe verificar el logo oficial');

console.log('PASS: logo oficial, acceso de ADMIN vinculado a Firebase, recuperación, registro con contraseña y confirmación, solicitudes y aviso al administrador, encabezado superior y menú móvil.');
