/* SENDWAYO V7 — Liquidación administrativa automática RD→HT NatCash/MonCash.
   La factura del remitente conserva el bruto convertido; el asiento HTG es interno y solo admin.
   La operación secundaria y su auditoría se sincronizan junto con el cambio de balance. */
(function(){
 'use strict';
 const round2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
 const norm=s=>String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const money=n=>Number(n||0).toLocaleString('es-DO',{minimumFractionDigits:2,maximumFractionDigits:2});
 function isEligible(t){
   if(!t||!/^env[ií]o$/.test(norm(t.tipo||t.type)))return false;
   const route=norm(t.ruta||'');
   const toHT=/^(?:rd\b|republica dominicana\b)\s*(?:→|->|a|to|[-–—])\s*(?:ht\b|haiti\b|hati\b)/.test(route);
   const provider=/nat\s*cash|narcash|mon\s*cash/.test(route);
   return toHT&&provider&&String(t.moneda||t.currency||'DOP').toUpperCase()==='DOP';
 }
 function calculate(amountDOP){
   const amount=Number(amountDOP);
   if(!Number.isFinite(amount)||amount<=0)throw new Error('El monto en pesos debe ser mayor que cero.');
   const commissionDOP=round2(amount*0.08);
   const netDOP=round2(amount-commissionDOP);
   const exchangeRate=2.10;
   const grossHTG=round2(netDOP*exchangeRate);
   const localCommissionHTG=round2(grossHTG*0.03);
   const payoutHTG=round2(grossHTG-localCommissionHTG);
   return {amountDOP:round2(amount),commissionDOP,netDOP,exchangeRate,grossHTG,localCommissionHTG,payoutHTG};
 }
 window.SENDWAYO_RD_HT_SETTLEMENT={matches:isEligible,calculate};
 const previousApprove=window.aprobar;
 if(typeof previousApprove!=='function')return;
 const txList=()=>typeof window.sendwayoGetTransactions==='function'?window.sendwayoGetTransactions():(Array.isArray(window.TRANSACCIONES)?window.TRANSACCIONES:[]);
 const accountById=id=>typeof window.sendwayoAccountById==='function'?window.sendwayoAccountById(id):null;
 const balance=a=>typeof window.sendwayoBalanceObject==='function'?window.sendwayoBalanceObject(a):((a.balances=a.balances||{DOP:0,HTG:0}));
 const commission=a=>typeof window.sendwayoCommissionObject==='function'?window.sendwayoCommissionObject(a):((a.commissions=a.commissions||{DOP:0,HTG:0}));
 const isAdmin=()=>typeof window.sendwayoIsAdmin==='function'&&window.sendwayoIsAdmin();
 const currencyFor=t=>typeof window.sendwayoCurrencyFor==='function'?window.sendwayoCurrencyFor(t):String(t.moneda||'DOP').toUpperCase();
 const roleOf=a=>norm(a&&a.role).toUpperCase();
 function heldAdminHTG(rows){
   return rows.filter(x=>x&&norm(x.estado||x.status)==='pendiente'&&x.reservaAplicada===true&&currencyFor(x)==='HTG')
     .filter(x=>{const owner=accountById(x.remitenteId||x.creadorId);const role=roleOf(owner);return role==='ADMIN'||role==='ADMINISTRADOR'||role==='AGENTE';})
     .reduce((sum,x)=>sum+(Number(x.montoValue)||0),0);
 }
 function fail(message){window.alert(message);return false;}
 window.aprobar=function(id){
   const rows=txList();
   const t=rows.find(x=>String(x.id)===String(id));
   if(!t||!isEligible(t))return previousApprove.apply(this,arguments);
   if(!isAdmin())return fail('Esta ruta RD→Haití requiere aprobación de Administración porque genera automáticamente el pago y la comisión en gourdes. El agente puede registrar la operación; Administración la aprueba una sola vez.');
   if(norm(t.estado||t.status)==='aprobado')return previousApprove.apply(this,arguments);
   if(t.autoSettlementId||t.autoSettlementAuditId||rows.some(x=>x&&String(x.parentTransactionId||'')===String(t.id)&&x.autoSettlement===true))
     return fail('Esta operación ya tiene una liquidación interna relacionada. No se volverá a ejecutar para evitar un doble pago.');
   const admin=typeof window.sendwayoGetAdminAccount==='function'?window.sendwayoGetAdminAccount():null;
   if(!admin)return fail('No se encontró la cuenta de Administración. La operación sigue pendiente.');
   const amount=Number(t.montoValue);
   let calc;
   try{calc=calculate(amount);}catch(e){return fail(e.message);}
   if(Math.abs((Number(t.fee)||0)-calc.commissionDOP)>0.011||Math.abs((Number(t.neto)||0)-calc.netDOP)>0.011)
     return fail('El desglose de RD$ y la comisión del 8% no coincide. No se aprobó ni se movió dinero.');
   const sender=accountById(t.remitenteId||t.creadorId);
   if(!sender)return fail('No se encontró la cuenta que inició el envío. La operación sigue pendiente.');
   const senderRole=roleOf(sender);
   if(!['REMITENTE','AGENTE','ADMIN','ADMINISTRADOR'].includes(senderRole))
     return fail('No se pudo verificar el rol de la cuenta que inició el envío. La operación sigue pendiente.');
   const adminBalances=balance(admin),adminCommissions=commission(admin);
   const availableHTG=round2((Number(adminBalances.HTG)||0)-heldAdminHTG(rows));
   if(availableHTG+0.001<calc.payoutHTG)
     return fail('Balance HTG insuficiente en Administración. Disponible: '+money(availableHTG)+' HTG; pago requerido: '+money(calc.payoutHTG)+' HTG. No se aprobó el envío.');
   const adminId=String(admin.id||'ADMINADMIN');
   const originalSenderId=t.remitenteId;
   const cloudReservation=!!(t.balanceReservationId||(t._cloudRaw&&t._cloudRaw.balanceReservationId));
   if(senderRole==='AGENTE')t.remitenteId=adminId; // Los agentes utilizan los fondos DOP de Administración.
   if(senderRole==='REMITENTE'&&cloudReservation){t.fondosDebitados=true;t.reservaAplicada=false;} // Firebase ya descontó la reserva DOP al crear el pendiente.
   let result;
   try{result=previousApprove.apply(this,arguments);}
   catch(error){t.remitenteId=originalSenderId;throw error;}
   finally{t.remitenteId=originalSenderId;}
   if(norm(t.estado||t.status)!=='aprobado')return result;
   const approvedBy=String(t.aprobadoPor||window.currentUser?.id||adminId);
   const approvedName=String(window.currentUser?.nombre||window.currentUser?.name||admin.nombre||admin.name||approvedBy);
   const approvedAt=Date.now();
   if(senderRole==='REMITENTE'&&cloudReservation){
     adminCommissions.DOP=round2((Number(adminCommissions.DOP)||0)+calc.commissionDOP);
     admin.comisiones=adminCommissions;
   }
   adminBalances.HTG=round2((Number(adminBalances.HTG)||0)-calc.payoutHTG);
   adminCommissions.HTG=round2((Number(adminCommissions.HTG)||0)+calc.localCommissionHTG);
   admin.comisiones=adminCommissions;
   const service=/mon\s*cash/.test(norm(t.ruta))?'MonCash':'NatCash';
   const safeParent=String(t.id).replace(/[^A-Za-z0-9_-]/g,'_');
   const childId='SW-HTHT-AUTO-'+safeParent;
   const auditId='AUD-HTHT-AUTO-'+safeParent;
   const child={
     id:childId,fecha:new Date(approvedAt).toLocaleString('es-DO'),timestamp:approvedAt,
     tipo:'Envío',type:'Envío',ruta:'HT → HT '+service+' (3%)',
     rutaExacta:'Liquidación interna automática vinculada a '+t.id+'; RD → Haití '+service,
     monto:money(calc.grossHTG)+' HTG',montoValue:calc.grossHTG,fee:calc.localCommissionHTG,
     neto:calc.payoutHTG,feeText:'Comisión Haití → Haití 3%: '+money(calc.localCommissionHTG)+' HTG',
     moneda:'HTG',esHT:true,beneficiario:t.beneficiario||'',beneficiarioTel:t.beneficiarioTel||'',
     montoRecibido:money(calc.payoutHTG)+' HTG',estado:'Aprobado',status:'Aprobado',
     creadorId:adminId,remitenteId:adminId,remitenteNombre:approvedName,
     aprobadoPor:approvedBy,aprobadoPorNombre:approvedName,fechaAprobacion:new Date(approvedAt).toLocaleString('es-DO'),
     approvedAtMs:approvedAt,parentTransactionId:String(t.id),autoSettlement:true,
     autoSettlementAuditId:auditId,settlementExchangeRate:calc.exchangeRate,
     originalAmountDOP:calc.amountDOP,originalCommissionDOP:calc.commissionDOP,
     netAmountDOP:calc.netDOP,grossAmountHTG:calc.grossHTG,
     localCommissionHTG:calc.localCommissionHTG,payoutAmountHTG:calc.payoutHTG,
     proveedorDestino:service,detalleTipo:'LIQUIDACION_ADMINISTRATIVA',
     reservaAplicada:false,fondosDebitados:true
   };
   t.montoRecibido=money(calc.grossHTG)+' HTG';
   t.autoSettlementId=childId;t.autoSettlementAuditId=auditId;t.autoSettlementStatus='LIQUIDADO';
   t.settlementExchangeRate=calc.exchangeRate;t.originalAmountDOP=calc.amountDOP;
   t.originalCommissionDOP=calc.commissionDOP;t.netAmountDOP=calc.netDOP;
   t.grossAmountHTG=calc.grossHTG;t.localCommissionHTG=calc.localCommissionHTG;
   t.payoutAmountHTG=calc.payoutHTG;t.aprobadoPorNombre=approvedName;t.approvedAtMs=approvedAt;
   rows.unshift(child);
   if(typeof window.sendwayoPersistFinancialState==='function')window.sendwayoPersistFinancialState();
   else {try{window.sendwayoPersistTx?.();window.sendwayoUpdateViews?.();}catch(e){}}
   return result;
 };
})();