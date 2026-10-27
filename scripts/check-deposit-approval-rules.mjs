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
  'deposits', 'accountWithdrawals', 'commissions'
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
