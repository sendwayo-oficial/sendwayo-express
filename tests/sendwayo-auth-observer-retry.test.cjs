const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync(
  'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html',
  'utf8'
);

const observerStart=html.indexOf('auth.onAuthStateChanged(async user=>{');
const observerEnd=html.indexOf('  });\n  }).catch(error=>',observerStart);
assert.ok(observerStart>=0&&observerEnd>observerStart,'Firebase auth state observer must exist');
const observer=html.slice(observerStart,observerEnd);
assert.match(observer,/if\\(state\\.loginBusy\\|\\|state\\.sessionEstablished\\)return;/,
  'a late signed-out Firebase event must not interrupt an active login attempt or established session');
assert.match(observer,/state\\.sessionEstablished=true/,
  'a restored account session must be marked as established before dashboard rendering');
assert.match(observer,/setVisibleAfterLogin\\(appUser\\)/,
  'a valid restored Firebase account must enter the workspace');

const helper=html.match(/function showLoginFormError\\(message\\)\\s*\\{([\\s\\S]*?)\\n  \\}/);
assert.ok(helper,'Firebase login errors must have a dedicated retry-screen helper');
assert.match(helper[1],/welcome\\.classList\\.add\\('hidden'\\)/,
  'a failed login must hide the welcome page');
assert.match(helper[1],/login\\.classList\\.remove\\('hidden'\\)/,
  'a failed login must reopen the login form');
assert.match(helper[1],/visibility','visible'/,
  'a failed login must keep the login form visible');

const loginCatch=html.match(/async function attemptLogin\\(\\)\\s*\\{([\\s\\S]*?)\\n  \\}\\n  window\\.intentarLogin=attemptLogin/);
assert.ok(loginCatch,'the Firebase login handler must exist');
assert.match(loginCatch[1],/showLoginFormError\\(message\\)/,
  'the exact Firebase error must leave the user on the login form');
assert.match(html,/window\\.__sendwayoFirebaseSecureLoginReady = false/);
assert.match(html,/window\\.__sendwayoLoginPending = false/);
assert.match(html,/window\\.__sendwayoLoginPending=true/,
  'the first login click must be held safely until the secure Firebase handler is ready');

console.log('PASS: delayed Firebase auth events cannot interrupt login, and errors keep the form open.');
