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
  const rule = root[collection]?.['$id']?.['.write'];
  if (rule !== false) {
    throw new Error('La escritura del cliente sigue abierta en ' + collection + '/$id.');
  }
  console.log('PASS: escritura financiera solo por servidor en ' + collection);
}

// Los agentes usan una callable que devuelve solo datos mínimos de identidad.
// No deben leer el árbol completo de usuarios ni las notificaciones de otros.
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
