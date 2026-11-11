const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync(
  'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html',
  'utf8'
);
const start=html.indexOf('async function attemptLogin()');
const end=html.indexOf('window.intentarLogin=attemptLogin',start);
assert.ok(start>=0&&end>start,'debe existir el manejador Firebase del formulario de ingreso');
const handler=html.slice(start,end);
const catchAt=handler.lastIndexOf('} catch (error) {');
const finallyAt=handler.indexOf('} finally {',catchAt);
assert.ok(catchAt>=0&&finallyAt>catchAt,'el ingreso debe tener tratamiento de error y finally');
const catchBlock=handler.slice(catchAt,finallyAt);

// The sign-out cleanup is intentionally fire-and-forget. The auth observer ignores
// its signed-out event while loginBusy is true, leaving the user on the login form.
assert.ok(catchBlock.includes('auth.signOut().catch('),'la limpieza de sesión no debe bloquear el finally');
assert.ok(!catchBlock.includes('await auth.signOut()'),'no se debe esperar una limpieza de sesión antes de liberar el formulario');
assert.ok(catchBlock.includes('loginError(message)'),'el error de Firebase debe mostrarse al usuario');
assert.ok(catchBlock.includes('state.loginBusy') || handler.includes('state.loginBusy = true'),'el intento debe marcar su estado ocupado');

const finallyBlock=handler.slice(finallyAt);
assert.ok(finallyBlock.includes('state.loginBusy = false'),'el finally debe liberar el estado ocupado');
assert.ok(finallyBlock.includes('button.disabled = false') || finallyBlock.includes("button.textContent = button.dataset.oldText"),
  'el finally debe restaurar el botón de ingreso');

const observerStart=html.indexOf('auth.onAuthStateChanged(async user=>{');
const observerEnd=html.indexOf('  });\n  }).catch(error=>',observerStart);
assert.ok(observerStart>=0&&observerEnd>observerStart);
const observer=html.slice(observerStart,observerEnd);
assert.ok(observer.includes('if(state.loginBusy||state.sessionEstablished)return;'),
  'el evento de cierre Firebase no debe devolver a bienvenida durante el intento de ingreso');
assert.ok(html.includes('function showLoginFormError(message)'),
  'la restauración de sesión también debe tener una función para volver a abrir el formulario');

console.log('PASS: fallos Firebase muestran el error, liberan el botón y no rebotan a bienvenida.');
