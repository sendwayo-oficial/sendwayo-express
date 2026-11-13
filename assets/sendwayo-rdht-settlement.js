(function(){
'use strict';
const API='https://sendwayo-express-backend.ideletteismorin.workers.dev';
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const rows=()=>Array.isArray(window.TRANSACCIONES)?window.TRANSACCIONES:[];
const find=id=>rows().find(x=>String(x.id)===String(id)||String(x.firebaseKey)===String(id));
const isAdmin=()=>{const u=window.currentUser||{};return String(u.role||u.rol||'').toUpperCase().includes('ADMIN')||['ADMINADMIN','ADMIN-000'].includes(String(u.id||''));};
const isRdHt=t=>{
 const r=norm([t&&t.ruta,t&&t.route,t&&t.rutaExacta,t&&t.routeExact,t&&t._cloudRaw&&t._cloudRaw.route].filter(Boolean).join(' '));
 return norm(t&&t.tipo).includes('envio')&&/(^|[^a-z0-9])(rd|republica dominicana)([^a-z0-9]|$)/.test(r)&&/(^|[^a-z0-9])(ht|haiti|hati)([^a-z0-9]|$)/.test(r)&&/(natcash|moncash)/.test(r);
};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function getToken(){
 const auth=window.sendwayoFirebase&&window.sendwayoFirebase.auth;
 if(!auth||!auth.currentUser)throw new Error('La sesión de Firebase no está activa.');
 return auth.currentUser.getIdToken();
}
async function call(path,t){
 const token=await getToken();
 const response=await fetch(API+path,{method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({transactionId:String(t.firebaseKey||t.id)})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||'El backend no pudo confirmar la operación ('+response.status+').');
 return data;
}
async function refresh(t,result){
 const bridge=window.sendwayoFirebase&&window.sendwayoFirebase.refreshSettlement;
 if(typeof bridge!=='function')throw new Error('La actualización segura de la pantalla no está disponible. Recargue el portal.');
 await bridge(String(t.firebaseKey||t.id),String(result.settlementId||t.internalSettlementId||''));
}
const oldApprove=window.aprobar;
window.aprobar=async function(id){
 const t=find(id);
 if(!t||!isRdHt(t))return typeof oldApprove==='function'?oldApprove.apply(this,arguments):false;
 if(String(t.estado||'').toLowerCase()!=='pendiente'){window.alert('Esta operación no está Pendiente. No se hará otro débito.');return false;}
 if(!t.firebaseKey||!t._cloudRaw){
   window.alert('La operación aún no terminó de sincronizarse con Firebase. Actualice la lista y vuelva a aprobarla cuando aparezca guardada.');
   return false;
 }
 try{
   const result=await call('/api/settle-rd-ht',t);
   await refresh(t,result);
   const a=result.accounting||{};
   window.alert('Operación aprobada y liquidación HTG registrada en Firebase.\nRecibido bruto: '+Number(a.grossHtg||0).toFixed(2)+' HTG\nComisión Administración 3%: '+Number(a.adminCommissionHtg||0).toFixed(2)+' HTG\nPago interno 97%: '+Number(a.adminPayoutHtg||0).toFixed(2)+' HTG');
   return true;
 }catch(error){
   window.alert('No se aprobó ni se movió el dinero.\n'+(error&&error.message||'Error del backend.'));
   return false;
 }
};
const oldDelete=window.borrar;
window.borrar=async function(id){
 const t=find(id);
 if(t&&String(t.firebaseCategory||'')==='internalSettlements'){
   window.alert('Este asiento es interno y forma parte de la auditoría. No se puede borrar.');
   return false;
 }
 if(t&&isRdHt(t)&&t.internalSettlementId&&String(t.financialSettlementStatus||'').toUpperCase()==='SETTLED'){
   if(!isAdmin()){window.alert('Solo Administración puede revertir esta liquidación.');return false;}
   if(!window.confirm('Esta operación ya fue liquidada. Se revertirá el pago HTG, la comisión y el débito DOP si los fondos de comisión siguen disponibles. El registro quedará como REVERTIDO para conservar la auditoría. ¿Continuar?'))return false;
   try{
     const result=await call('/api/reverse-rd-ht',t);
     await refresh(t,result);
     window.alert('La operación fue revertida y quedó registrada en la auditoría.');
     return true;
   }catch(error){
     window.alert('No se realizó la reversión.\n'+(error&&error.message||'Error del backend.'));
     return false;
   }
 }
 return typeof oldDelete==='function'?oldDelete.apply(this,arguments):false;
};
const oldModify=window.modificar;
window.modificar=function(id){
 const t=find(id);
 if(t&&(String(t.firebaseCategory||'')==='internalSettlements'||(isRdHt(t)&&t.internalSettlementId))){
   window.alert('Una liquidación interna o una operación ya liquidada no se modifica directamente. Use la reversión administrativa para conservar la auditoría.');
   return false;
 }
 return typeof oldModify==='function'?oldModify.apply(this,arguments):false;
};
const oldGeneric=window.sendwayoActionGeneric;
if(typeof oldGeneric==='function')window.sendwayoActionGeneric=function(view,action,id){
 const t=find(id),a=norm(action).replace(/[^a-z]/g,'');
 const protectedInternal=t&&String(t.firebaseCategory||'')==='internalSettlements';
 const settledParent=t&&isRdHt(t)&&!!t.internalSettlementId;
 if(protectedInternal&&/(borrar|eliminar|delete|modificar|editar|modify|edit)/.test(a)){
   window.alert('El asiento interno forma parte de la auditoría y no se puede modificar ni borrar.');
   return false;
 }
 if(settledParent&&/(modificar|editar|modify|edit)/.test(a)){
   window.alert('La operación ya está liquidada. Use la reversión administrativa antes de cualquier cambio.');
   return false;
 }
 if(settledParent&&/(borrar|eliminar|delete)/.test(a))return window.borrar(id);
 return oldGeneric.apply(this,arguments);
};
})();