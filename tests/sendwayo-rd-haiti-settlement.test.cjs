const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const js=fs.readFileSync('assets/sendwayo-v7-rd-haiti-auto-settlement.js','utf8');
assert.doesNotThrow(()=>new Function(js),'el módulo de liquidación debe tener sintaxis válida');

const calculationContext={window:{},Intl,Math,Number,String};
vm.runInNewContext(js,calculationContext);
const api=calculationContext.window.SENDWAYO_RD_HT_SETTLEMENT;
assert.ok(api,'el módulo expone el cálculo RD→HT');
assert.equal(api.matches({tipo:'Envío',ruta:'RD → HT NatCash (8%)',moneda:'DOP'}),true);
assert.equal(api.matches({tipo:'Envío',ruta:'RD → HT MonCash (8%)',moneda:'DOP'}),true);
assert.equal(api.matches({tipo:'Envío',ruta:'RD → HT Narcash (8%)',moneda:'DOP'}),true);
assert.equal(api.matches({tipo:'Envío',ruta:'RD → USA NatCash (8%)',moneda:'DOP'}),false);
assert.equal(api.matches({tipo:'Envío',ruta:'RD → HT Transferencia',moneda:'DOP'}),false);
assert.equal(api.matches({tipo:'Envío',ruta:'HT → HT NatCash (3%)',moneda:'HTG'}),false);
assert.equal(api.matches({tipo:'Retiro',ruta:'RD → HT NatCash (8%)',moneda:'DOP'}),false);

const expected=api.calculate(1000);
assert.deepEqual(JSON.parse(JSON.stringify(expected)),{
  amountDOP:1000,commissionDOP:80,netDOP:920,exchangeRate:2.10,
  grossHTG:1932,localCommissionHTG:57.96,payoutHTG:1874.04
});

function runApproval({role='REMITENTE',service='NatCash',availableHTG=5000}={}){
  const admin={id:'ADMINADMIN',role:'ADMIN',nombre:'Administración',
    balances:{DOP:5000,HTG:availableHTG},commissions:{DOP:0,HTG:0}};
  const sender={id:role==='AGENTE'?'AG-00001':'REM-00001',role,nombre:'Cuenta de prueba',
    balances:{DOP:role==='REMITENTE'?0:0,HTG:0},commissions:{DOP:0,HTG:0}};
  const parent={
    id:'TX-TEST-001',tipo:'Envío',ruta:'RD → HT '+service+' (8%)',moneda:'DOP',
    montoValue:1000,fee:80,neto:920,remitenteId:sender.id,creadorId:sender.id,
    beneficiario:'Beneficiario de prueba',estado:'Pendiente',reservaAplicada:role==='REMITENTE',
    balanceReservationId:role==='REMITENTE'?'RES-001':'',
    _cloudRaw:role==='REMITENTE'?{balanceReservationId:'RES-001'}:{}
  };
  const rows=[parent],alerts=[];
  const window={
    TRANSACCIONES:rows,currentUser:{id:'ADMINADMIN',nombre:'Administrador de prueba',role:'ADMIN'},
    alert:message=>alerts.push(String(message)),
    sendwayoGetTransactions:()=>rows,
    sendwayoGetAdminAccount:()=>admin,
    sendwayoAccountById:id=>[admin,sender].find(a=>a.id===String(id))||null,
    sendwayoBalanceObject:a=>a.balances,
    sendwayoCommissionObject:a=>a.commissions,
    sendwayoIsAdmin:()=>true,
    sendwayoCurrencyFor:t=>String(t.moneda||'DOP').toUpperCase(),
    sendwayoPersistFinancialState:()=>{}
  };
  window.aprobar=function(id){
    const t=rows.find(x=>x.id===id);
    const owner=[admin,sender].find(a=>a.id===t.remitenteId);
    if(!t.fondosDebitados){
      owner.balances.DOP-=t.montoValue;
      owner.commissions.DOP+=t.fee;
      t.fondosDebitados=true;t.reservaAplicada=false;
    }
    t.estado='Aprobado';t.aprobadoPor='ADMINADMIN';t.fechaAprobacion='13/11/2026';
    return true;
  };
  vm.runInNewContext(js,{window,Intl,Math,Number,String,Date});
  const result=window.aprobar(parent.id);
  return {admin,sender,parent,rows,alerts,result,window};
}

for(const role of ['REMITENTE','AGENTE']){
  const run=runApproval({role});
  const child=run.rows.find(t=>t.autoSettlement===true);
  assert.equal(run.parent.estado,'Aprobado',role+' parent is approved');
  assert.equal(run.parent.montoRecibido,'1,932.00 HTG',role+' invoice retains gross HTG');
  assert.ok(child,role+' creates one internal Haiti-side transaction');
  assert.equal(child.ruta,'HT → HT NatCash (3%)');
  assert.equal(child.montoValue,1932);
  assert.equal(child.fee,57.96);
  assert.equal(child.neto,1874.04);
  assert.equal(child.montoRecibido,'1,874.04 HTG');
  assert.equal(child.estado,'Aprobado','internal operation is immediately settled, not pending');
  assert.equal(child.parentTransactionId,run.parent.id);
  assert.equal(child.aprobadoPor,'ADMINADMIN');
  assert.equal(child.aprobadoPorNombre,'Administrador de prueba');
  assert.equal(run.admin.balances.HTG,3125.96);
  assert.equal(run.admin.commissions.HTG,57.96);
  assert.equal(run.admin.commissions.DOP,80);
  assert.equal(run.rows.filter(t=>t.autoSettlement===true).length,1);
  run.window.aprobar(run.parent.id);
  assert.equal(run.rows.filter(t=>t.autoSettlement===true).length,1,'repeat approval cannot create a second payment');
}
const moncash=runApproval({role:'REMITENTE',service:'MonCash'});
assert.ok(moncash.rows.some(t=>t.autoSettlement===true&&t.ruta==='HT → HT MonCash (3%)'),'MonCash creates the corresponding Haiti-side route');
const insufficient=runApproval({role:'REMITENTE',availableHTG:100});
assert.equal(insufficient.parent.estado,'Pendiente','insufficient HTG must leave the original request pending');
assert.equal(insufficient.admin.balances.HTG,100);
assert.equal(insufficient.rows.length,1,'insufficient HTG must not create the internal transaction');
assert.ok(insufficient.alerts.some(x=>x.includes('Balance HTG insuficiente')));

const html=fs.readFileSync('SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html','utf8');
assert.ok(html.includes('assets/sendwayo-v7-rd-haiti-auto-settlement.js'));
assert.ok(html.includes('autoSettlementAuditId'));
assert.ok(html.includes("updates[ROOT+'/audit/'+auditKey]"));
assert.ok(html.includes('sendwayoGetAdminAccount'));
assert.ok(html.includes('if(t.autoSettlementId){Object.assign(patch'));
console.log('PASS: DOP 8%, HTG ×2.10, HTG 3%, admin balance/commissions, remitter/agent approval accounting, linked auto-approved operation, no duplicate and insufficient-funds guard.');
