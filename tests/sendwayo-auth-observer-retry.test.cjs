const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html','utf8');

const start=html.indexOf('auth.onAuthStateChanged(async user=>{');
const end=html.indexOf('  });\n  }).catch(error=>',start);
assert.ok(start>=0&&end>start,'debe existir el observador de estado Firebase');
const observer=html.slice(start,end);
assert.ok(observer.includes('if(state.loginBusy||state.sessionEstablished)return;'),
  'un evento tardío de cierre no debe interrumpir el intento de ingreso ni una sesión activa');
assert.ok(observer.includes('state.sessionEstablished=true'),'la sesión validada debe marcarse como establecida');
assert.ok(observer.includes('setVisibleAfterLogin(appUser)'),'un usuario Firebase válido debe llegar al panel');

const helperStart=html.indexOf('function showLoginFormError(message)');
const helperEnd=html.indexOf('\n  }',helperStart);
assert.ok(helperStart>=0&&helperEnd>helperStart,'debe existir una función específica para reintentar el ingreso');
const helper=html.slice(helperStart,helperEnd);
assert.ok(helper.includes("welcome.classList.add('hidden')"),'un error de ingreso debe ocultar la bienvenida');
assert.ok(helper.includes("login.classList.remove('hidden')"),'un error de ingreso debe mostrar el formulario');
assert.ok(helper.includes("visibility','visible'"),'el formulario debe quedar visible');

assert.ok(html.includes('showLoginFormError(message)'), 'los errores de Firebase deben abrir el formulario de ingreso nuevamente');
assert.ok(html.includes('window.__sendwayoFirebaseSecureLoginReady = false'));
assert.ok(html.includes('window.__sendwayoLoginPending = false'));
assert.ok(html.includes('window.__sendwayoLoginPending=true'),'el primer clic debe esperar a que el login seguro esté preparado');
console.log('PASS: eventos Firebase tardíos e intentos de ingreso no devuelven al usuario a bienvenida.');
