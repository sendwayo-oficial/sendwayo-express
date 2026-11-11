const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync(
  'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html',
  'utf8'
);
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match=>match[1]).filter(Boolean);
assert.ok(scripts.length>0,'V7 contiene JavaScript');
for(let index=0;index<scripts.length;index++){
  assert.doesNotThrow(
    ()=>new Function(scripts[index]),
    'el script inline #'+(index+1)+' debe analizarse sin errores'
  );
}
const finalStart=html.lastIndexOf('<script id="sendwayo-v7-final-id-only-controller">');
const finalOpen=html.indexOf('>',finalStart)+1;
const finalEnd=html.indexOf('</script>',finalOpen);
assert.ok(finalStart>=0&&finalEnd>finalOpen,'el controlador final de V7 debe estar cerrado correctamente');
const finalScript=html.slice(finalOpen,finalEnd);
for(const marker of ['function installCountrySearch(select)','function moveMenuButton()','function tickSession()','function scrubVisibleLegacyCodes()']){
  assert.ok(finalScript.includes(marker),'falta el controlador esperado: '+marker);
}
console.log('PASS: todos los scripts V7 y el controlador final tienen sintaxis válida.');
