import fs from 'node:fs';

const rules = JSON.parse(fs.readFileSync('database.rules.json', 'utf8'));
const root = rules?.rules?.sendwayo_express_v2;

if (!root) throw new Error('Falta sendwayo_express_v2 en database.rules.json.');

// Las operaciones financieras las escriben las Functions con Admin SDK.
// El navegador no puede crear transacciones pendientes ni cambiar sus estados
// directamente; esto fuerza a pasar por reserva de balance y auditoría central.
const serverOnlyCollections = [
  'envios', 'recargas', 'paqueticos', 'pagos',
  'deposits', 'accountWithdrawals', 'commissions'
];
for (const collection of serverOnlyCollections) {
  const parentRule = root[collection]?.['.write'];
  const itemRule = root[collection]?.['$id']?.['.write'];
  if (parentRule !== false || itemRule !== false) {
    throw new Error('La escritura del cliente sigue abierta en ' + collection + ' (padre o registro).');
  }
  console.log('PASS: escritura financiera solo por servidor en ' + collection);
}

const reviewableCollections = [
  'envios', 'recargas', 'paqueticos', 'pagos',
  'accountWithdrawals', 'commissions'
];
for (const collection of reviewableCollections) {
  const parentRead = String(root[collection]?.['.read'] || '');
  const itemRead = String(root[collection]?.['$id']?.['.read'] || '');
  if (!parentRead.includes("query.orderByChild === 'status'") ||
      !parentRead.includes("query.equalTo === 'Pendiente'")) {
    throw new Error('Falta el permiso limitado a cola Pendiente para agentes en ' + collection + '.');
  }
  if (itemRead.includes("root.child('sendwayo_express_v2/agentAuth')") || itemRead.includes("child('active').val() === true")) {
    throw new Error('La lectura individual de ' + collection + ' sigue abierta para agentes.');
  }
  console.log('PASS: cola de revisión Pendiente y lectura individual restringida en ' + collection);
}

// Los depósitos son exclusivos de administración: ningún agente puede
// consultar la cola ni abrir el registro individual, aunque haya creado el depósito.
const depositRootRead = String(root.deposits?.['.read'] || '');
const depositItemRead = String(root.deposits?.['$id']?.['.read'] || '');
if (depositRootRead.includes("root.child('sendwayo_express_v2/agentAuth')") ||
    depositRootRead.includes("query.orderByChild === 'status'") ||
    depositItemRead.includes("root.child('sendwayo_express_v2/agentAuth')") ||
    depositItemRead.includes("data.child('createdByAuthUid').val() === auth.uid")) {
  throw new Error('Los agentes todavía pueden consultar depósitos; solo administración debe verlos.');
}
if (!depositRootRead.includes("sendwayoexpress@gmail.com") ||
    !depositItemRead.includes("sendwayoexpress@gmail.com")) {
  throw new Error('La lectura de depósitos debe conservar el permiso administrativo.');
}
console.log('PASS: los depósitos son privados para administración y el titular autorizado.');

// Las solicitudes administrativas (incluidas conciliaciones y solicitudes de bienvenida)
// deben limitarse al administrador o al creador de cada registro.
const requestsRootRead = String(root.requests?.['.read'] || '');
const requestsItemRead = String(root.requests?.['$id']?.['.read'] || '');
if (requestsRootRead.includes("root.child('sendwayo_express_v2/agentAuth')") ||
    requestsItemRead.includes("root.child('sendwayo_express_v2/agentAuth')") ||
    requestsItemRead.includes("child('active').val() === true")) {
  throw new Error('Las solicitudes permiten lectura general a agentes; revisar aislamiento por creador.');
}
if (!requestsRootRead.includes("sendwayoexpress@gmail.com") ||
    !requestsItemRead.includes("sendwayoexpress@gmail.com")) {
  throw new Error('Solo administración debe poder consultar el conjunto completo de solicitudes.');
}
console.log('PASS: solicitudes privadas; el conjunto completo queda reservado a administración.');

// Los detalles y el histórico de conciliación solo pueden leerlos los administradores.
// Las escrituras se hacen desde Cloud Functions con Admin SDK, no desde el navegador.
for (const [name, rule] of [
  ['reconciliationDetails', root.reconciliationDetails],
  ['reconciliations', root.reconciliations]
]) {
  if (!rule || rule['.write'] !== false || typeof rule['.read'] !== 'string' ||
      !rule['.read'].includes("sendwayoexpress@gmail.com")) {
    throw new Error(name + ' debe ser de lectura administrativa y escritura solo desde servidor.');
  }
  if (rule['$id'] && (rule['$id']['.write'] !== false ||
      typeof rule['$id']['.read'] !== 'string' ||
      !rule['$id']['.read'].includes("sendwayoexpress@gmail.com"))) {
    throw new Error(name + '/$id debe ser privado y solo escribible desde servidor.');
  }
  console.log('PASS: ' + name + ' solo es accesible para administración.');
}
const currentDetails = root.reconciliationDetails?.current;
if (!currentDetails || currentDetails['.write'] !== false ||
    typeof currentDetails['.read'] !== 'string' ||
    !currentDetails['.read'].includes("sendwayoexpress@gmail.com")) {
  throw new Error('El detalle en tiempo real de conciliación debe ser privado y de solo lectura para el cliente.');
}
console.log('PASS: el detalle en tiempo real de conciliación queda protegido.');

// Los agentes usan una callable que devuelve solo datos mínimos de identidad.
// No deben leer el árbol completo de usuarios ni las notificaciones de otros.
const usersRootRead = String(root.users?.['.read'] || '');
if (usersRootRead.includes('query.orderByChild') || usersRootRead.includes("root.child('sendwayo_express_v2/agentAuth')")) {
  throw new Error('La lectura del directorio completo de usuarios no está reservada a administración.');
}
const usersItemWrite = String(root.users?.['$uid']?.['.write'] || '');
if (usersItemWrite.includes('data.child(\'authUid\')') || usersItemWrite.includes('newData.child(\'balance\')')) {
  throw new Error('La regla todavía permite escrituras directas de un usuario sobre su propia ficha financiera.');
}
if (!usersItemWrite.includes("auth.token.email === 'sendwayoexpress@gmail.com'")) {
  throw new Error('La administración debe conservar el permiso de mantenimiento de perfiles.');
}
for (const [path, rule] of [
  ['users', root.users?.['.read']],
  ['users/$uid', root.users?.['$uid']?.['.read']],
  ['notifications', root.notifications?.['.read']],
  ['notifications/$id', root.notifications?.['$id']?.['.read']]
]) {
  if (typeof rule !== 'string' || rule.includes("root.child('sendwayo_express_v2/agentAuth').child(auth.uid).child('active').val() === true")) {
    throw new Error('La lectura de ' + path + ' permite acceso general a agentes.');
  }
  console.log('PASS: acceso privado a ' + path);
}
console.log('PASS: las operaciones financieras deben pasar por las Firebase Functions.');
