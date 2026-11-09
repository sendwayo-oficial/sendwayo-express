const fs=require('fs');
const vm=require('node:vm');
const html=fs.readFileSync('SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
let failures=0;
scripts.forEach((code,i)=>{try{new vm.Script(code,{filename:'V7-inline-'+(i+1)+'.js'});}catch(e){failures++;console.error(e.stack||e);}});
console.log('Inline script syntax failures:',failures,'of',scripts.length);
