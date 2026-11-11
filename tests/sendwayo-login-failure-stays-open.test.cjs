const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync(
  'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html',
  'utf8'
);
const match=html.match(/async function attemptLogin\(\)\s*\{([\s\S]*?)\n  \}\n  window\.intentarLogin=attemptLogin/);
assert.ok(match,'Firebase login handler must exist');
const source=match[1];
const catchAt=source.lastIndexOf('} catch (error) {');
assert.ok(catchAt>=0,'login handler must expose its failure path');
const finallyAt=source.indexOf('} finally {',catchAt);
assert.ok(finallyAt>catchAt,'login handler must always release the busy state');
const catchBlock=source.slice(catchAt,finallyAt);
assert.match(catchBlock,/if\s*\(auth\.currentUser\)\s*\{\s*await\s+auth\.signOut\(\)\s*;?\s*\}/,
  'only clean up Firebase when a real user session exists; never sign out after invalid credentials');
assert.doesNotMatch(catchBlock,/auth\.signOut\(\)\.catch/,
  'unconditional signOut must not trigger the unauthenticated redirect after a failed login');
assert.match(catchBlock,/showLoginFormForRetry\(\)/,
  'a failed attempt must leave the login form visible');
assert.match(catchBlock,/loginError\(message\)/,
  'the exact Firebase/profile failure must remain visible to the user');
const helper=html.match(/function showLoginFormForRetry\(\)\s*\{([\s\S]*?)\n  \}/);
assert.ok(helper,'retry form helper must exist');
assert.match(helper[1],/sendwayo-login-open/);
assert.match(helper[1],/sendwayo-login-visible/);
assert.match(helper[1],/welcome\.classList\.add\('hidden'\)/);
console.log('PASS: failed SENDWAYO login stays on the login form and displays its error.');
