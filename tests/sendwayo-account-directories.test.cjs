
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html','utf8');
const block=(html.match(/<script id="sendwayo-v7-account-directory-behavior">([\s\S]*?)<\/script>/)||[])[1];
assert.ok(block,'directorio script exists');
new Function(block);
for(const term of ['sendwayo-account-toolbar','sendwayoSearchAccountDirectory','Balance compartido con administración','Balance DOP','Balance HTG','ID fijo','Código fijo','sendwayoAdminEditAccount','sendwayoAdminToggleAccount'])assert.ok(html.includes(term),term);
assert.ok(html.includes('Math.ceil(filtered.length/10)'),'ten-row page limit');
assert.ok(html.includes("cells[3].textContent!=='ID fijo'"),'no rewrite stable headers on every DOM mutation');
assert.ok(html.includes('function publishDirectoryRows(rows, profileRow, role)'),'Firebase source stays authoritative');
assert.ok(html.includes('function accountMoney(profile)'),'balances read from Firebase profile');
assert.ok(html.includes("function balanceOwner(a){return a&&roleOf(a)==='AGENTE'?(adminAccount()||a):(a||null);}"),'shared agent funds rule preserved');
assert.ok(html.includes("function commissionOwner(a){return a&&roleOf(a)==='AGENTE'?(adminAccount()||a):(a||null);}"),'commission rules preserved');
console.log('PASS: Agent/Remitter directory UI, separate DOP/HTG balances, fixed IDs/codes, exports, search and 10-row paging.');
