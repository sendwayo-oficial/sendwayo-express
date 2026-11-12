const assert=require('node:assert/strict');
const fs=require('node:fs');

const entry=fs.readFileSync('SENDWAYO-V7-FAST-ENTRY.html','utf8');
const app=fs.readFileSync('SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html','utf8');
const workflow=fs.readFileSync('.github/workflows/deploy-pages.yml','utf8');

assert.ok(Buffer.byteLength(entry,'utf8')<30000,'la bienvenida debe pesar menos de 30 KB');
assert.equal(entry.split('<script').length-1,1,'la bienvenida solo debe tener un script');
const scriptStart=entry.indexOf('<script>');
const scriptEnd=entry.indexOf('</script>',scriptStart);
assert.ok(scriptStart>=0&&scriptEnd>scriptStart,'debe existir el script de entrada');
assert.doesNotThrow(()=>new Function(entry.slice(scriptStart+8,scriptEnd)),'el JavaScript de la bienvenida debe ser válido');

for(const id of ['login-email','login-password','show-password','forgot-password','remember-me','login-button','register-button','register-modal','register-form']){
  assert.ok(entry.includes('id="'+id+'"'),'falta el control '+id);
}
for(const text of [
 'assets/sendwayo-logo-transparent.webp',
 'sendwayoExpressOfficialV7',
 'signInWithEmailAndPassword',
 'sendPasswordResetEmail',
 'sendwayo_remember',
 'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html'
]){
  assert.ok(entry.includes(text),'falta integración '+text);
}
assert.equal(entry.split('<img').length-1,1,'la bienvenida solo debe mostrar el logo');
assert.ok(!entry.includes('sendwayo-logo-real.jpg'),'la bienvenida no debe usar el logo con fondo blanco');
assert.ok(!entry.includes('cdn.tailwindcss.com'),'la bienvenida no debe depender de un CDN de estilos');
assert.ok(entry.includes('mix-blend-mode:normal'),'el logo transparente no debe recibir una mezcla que altere sus colores');

assert.ok(app.length>500000,'la aplicación V7 completa debe conservarse detrás del inicio de sesión');
assert.ok(app.includes("const ADMIN_EMAIL = 'ideletteismorin@gmail.com';"),'conservar el correo real de Firebase');
assert.ok(app.includes("username:'sendwayoexpress@gmail.com'"),'conservar el alias de acceso SENDWAYO');
assert.ok(app.includes('function balanceOwner('),'conservar las reglas financieras del panel');
assert.ok(app.includes('function commissionOwner('),'conservar las reglas de comisiones del panel');

assert.ok(workflow.includes("'SENDWAYO-V7-FAST-ENTRY.html'"),'el cambio de portada debe activar la publicación');
assert.ok(workflow.includes("app_path = Path('site/SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html')"),'el panel completo debe publicarse aparte');
assert.ok(workflow.includes("landing_source = Path('SENDWAYO-V7-FAST-ENTRY.html')"),'la URL pública debe tomar la portada ligera');
assert.ok(workflow.includes('sendwayoRememberedPersistence'),'el panel debe conservar la opción Recordarme');

assert.ok(entry.includes("const ROOT='sendwayo_express_v2';"),'Registrar debe usar la raíz oficial de Firebase');
assert.ok(entry.includes("database.ref(ROOT+'/requests/'+id).set(row)"),'Registrar debe guardar solicitudes en sendwayo_express_v2/requests');
console.log('PASS: portada rápida e interactiva; panel V7 completo e independiente.');
