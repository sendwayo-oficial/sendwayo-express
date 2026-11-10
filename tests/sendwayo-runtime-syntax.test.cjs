const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync(
  'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html',
  'utf8'
);
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match=>match[1]).filter(Boolean);
assert.ok(scripts.length>0,'V7 contains inline JavaScript');
for(let index=0;index<scripts.length;index++){
  assert.doesNotThrow(
    ()=>new Function(scripts[index]),
    'V7 inline script #'+(index+1)+' must parse without SyntaxError'
  );
}
assert.match(
  html,
  /right\.insertBefore\(wrap,\s*bell\s*&&\s*bell\.parentElement\s*===\s*right\s*\?\s*bell\s*:\s*right\.lastElementChild\)/,
  'language control must only use a reference child of its insertion container'
);
console.log('PASS: V7 inline scripts parse and language controls use a valid insertion target.');
