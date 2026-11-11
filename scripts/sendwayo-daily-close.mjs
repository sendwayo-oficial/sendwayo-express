#!/usr/bin/env node
import fs from 'node:fs';
const rawInput=fs.readFileSync(0,'utf8').trim();
function parseJsonStream(raw){
  let start=0;while(/\s/.test(raw[start]||''))start++;
  const opening=raw[start];if(opening!=='{'&&opening!=='[')throw new Error('Snapshot Firebase no inicia con JSON');
  let depth=0,inString=false,escaped=false,end=-1;
  for(let i=start;i<raw.length;i++){
    const ch=raw[i];
    if(inString){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')inString=false;continue;}
    if(ch==='"'){inString=true;continue;}
    if(ch==='{'||ch==='[')depth++;
    else if(ch==='}'||ch===']'){depth--;if(depth===0){end=i+1;break;}}
  }
  if(end<0)throw new Error('Snapshot Firebase contiene JSON incompleto');
  const first=JSON.parse(raw.slice(start,end));
  const tail=raw.slice(end).trim();
  if(tail){const trailer=JSON.parse(tail);if(!trailer||trailer.status!=='success')throw new Error('Respuesta final de Firebase no confirma success');}
  return first;
}
const payload=parseJsonStream(rawInput);
const data=payload&&payload.status==='success'&&Object.prototype.hasOwnProperty.call(payload,'result')
  ? (typeof payload.result==='string'?JSON.parse(payload.result):payload.result)
  : payload;
const root=data.sendwayo_express_v2||data||{};
if(!root||typeof root!=='object'||Array.isArray(root))throw new Error('Snapshot de Realtime Database inválido');
const cols=['envios','recargas','paqueticos','pagos','paquetes'];
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const dayKey=v=>{
  if(v==null||v==='')return '';
  let n=Number(v);
  if(Number.isFinite(n)&&n>0){if(n<1e12)n*=1000;const d=new Date(n);if(!isNaN(d))return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
  const d=new Date(v);if(!isNaN(d))return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  return '';
};
const localToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const closeDate=process.env.CLOSE_DATE||localToday();
const approved=[],missingLedger=[];
for(const col of cols){
  const live=root[col]||{},ledger=(root.ledger&&root.ledger[col])||{};
  for(const [id,r] of Object.entries(live)){
    if(!r||String(r.status||'').toLowerCase()!=='aprobado')continue;
    const date=['reviewedAt','approvedAt','balanceSettledAt','createdAt','updatedAt','date','timestamp'].map(k=>dayKey(r[k])).find(Boolean)||'';
    if(date===closeDate){approved.push({col,id,r});if(!ledger[id])missingLedger.push(col+':'+id)}
  }
}
let gross=0,admin=0,remitter=0,agentCommission=0,amount=0;
const byCollection={};
for(const x of approved){
  const r=x.r;
  const g=num(r.commissionTotal??r.commission??r.commissionAmount??r.fee);
  const isAgent=Boolean(r.isAgent||r.agentId||r.agentUserId||String(r.operationChannel||r.channel||'').toLowerCase()==='agent'||String(r.role||'').toLowerCase()==='agent'||String(r.currency||r.currencyCode||'').toUpperCase()==='GDES'&&Boolean(r.agent));
  const isDeposit=String(r.accountingType||'').toUpperCase()==='DEPOSITO_CAPITAL' || String(r.type||'').toLowerCase()==='deposito';
  const agentGdes=isAgent && ['GDES','HTG'].includes(String(r.currency||r.currencyCode||'').toUpperCase());
  gross+=g;
  if(isDeposit){ admin+=0; remitter+=0; }
  else if(agentGdes){ admin+=g; agentCommission+=g; }
  else { admin+=num(r.commissionAdmin??g*.5); remitter+=num(r.commissionUser??g*.5); }
  amount+=num(r.amount);
  if(!byCollection[x.col])byCollection[x.col]={operations:0,amount:0,commission:0,adminCommission:0,remitterCommission:0,agentCommission:0};
  const b=byCollection[x.col];b.operations++;b.amount+=num(r.amount);b.commission+=g;
  b.adminCommission+=isDeposit?0:(isAgent?g:num(r.commissionAdmin??g*.5));
  b.remitterCommission+=isDeposit?0:(isAgent?0:num(r.commissionUser??g*.5));
  b.agentCommission+=isDeposit?0:(isAgent?g:0);
}
const issues=missingLedger.map(x=>'OPERACION_SIN_LIBRO:'+x);
for(const [id,u] of Object.entries(root.users||{})){
  if(!u)continue;
  if(num(u.balance)<-0.009)issues.push('BALANCE_NEGATIVO:'+id);
  if(num(u.commission)<-0.009||num(u.commissionAccrued)<-0.009)issues.push('COMISION_NEGATIVA:'+id);
}
const report={closeDate,closedAt:new Date().toISOString(),timezone:'America/Santo_Domingo',closingHour:'22:00',status:issues.length?'REVISAR':'CERRADO',operationsApproved:approved.length,totalAmount:Number(amount.toFixed(2)),grossCommission:Number(gross.toFixed(2)),adminCommission:Number(admin.toFixed(2)),remitterCommission:Number(remitter.toFixed(2)),agentCommission:Number(agentCommission.toFixed(2)),agentCapitalCurrency:'GDES',byCollection,issues};
process.stdout.write(JSON.stringify(report));
