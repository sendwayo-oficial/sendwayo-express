const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync(
  'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html',
  'utf8'
);
const helper=html.match(/function loginFormIsOpen\(\)\{([\s\S]*?)\n  \}\n  state\.authReadyPromise/);
assert.ok(helper,'Firebase must have a guard that detects an already-open login form');
const isOpen=new Function('document','window',helper[1]);
const body={classList:{contains:()=>true}};
const hiddenLogin={classList:{contains:()=>true}};
assert.equal(isOpen({body,getElementById:()=>hiddenLogin},{}),true,
  'an explicitly opened login form must be preserved');
const visibleLogin={classList:{contains:()=>false}};
assert.equal(isOpen(
  {body:{classList:{contains:()=>false}},getElementById:()=>visibleLogin},
  {getComputedStyle:()=>({display:'flex',visibility:'visible',pointerEvents:'auto'})}
),true,'a visible login form must be preserved');
const closedLogin={classList:{contains:()=>true}};
assert.equal(isOpen(
  {body:{classList:{contains:()=>false}},getElementById:()=>closedLogin},
  {getComputedStyle:()=>({display:'none',visibility:'hidden',pointerEvents:'none'})}
),false,'a closed login form must not block the public welcome page');

const start=html.indexOf('auth.onAuthStateChanged(async user=>{');
const end=html.indexOf('  });\n  }).catch(error=>',start);
assert.ok(start>=0&&end>start,'Firebase auth state observer must exist');
const observer=html.slice(start,end);
assert.match(observer,/state\.loginBusy\|\|state\.sessionEstablished\|\|loginFormIsOpen\(\)/,
  'a late signed-out Firebase event must not replace an open login form with the welcome page');
assert.match(observer,/showLoginFormForRetry\(\);loginError\(message\);/,
  'failed session restoration must leave the login form open and show the reason');
console.log('PASS: delayed Firebase signed-out events cannot send an open SENDWAYO login form back to welcome.');
