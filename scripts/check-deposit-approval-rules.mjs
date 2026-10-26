import fs from 'node:fs';

const rules = JSON.parse(fs.readFileSync('database.rules.json', 'utf8'));
const depositWrite = rules?.rules?.sendwayo_express_v2?.deposits?.['$id']?.['.write'];

if (typeof depositWrite !== 'string' || !depositWrite.length) {
  throw new Error('Falta la regla .write de sendwayo_express_v2/deposits/$id.');
}

// Un agente puede crear una solicitud de depósito pendiente,
// pero no puede aprobarla ni cambiar su estado después.
const required = [
  'auth.token.admin === true',
  "auth.token.email === 'sendwayoexpress@gmail.com'",
  "newData.child('status').val() === 'Pendiente'",
  "newData.child('createdByUserId').val() === root.child('sendwayo_express_v2/agentAuth').child(auth.uid).child('userId').val()"
];
for (const phrase of required) {
  if (!depositWrite.includes(phrase)) {
    throw new Error('La regla de depósitos perdió una condición necesaria: ' + phrase);
  }
}

for (const forbidden of [
  "newData.child('reviewedByAuthUid')",
  "newData.child('reviewedByUserId')",
  "newData.child('processingApprovalAuthUid')",
  "newData.child('processingApprovalByUserId')"
]) {
  if (depositWrite.includes(forbidden)) {
    throw new Error('Un agente podría todavía intentar procesar/aprobar depósitos por esta regla: ' + forbidden);
  }
}

console.log('PASS: la regla permite al administrador gestionar depósitos.');
console.log('PASS: los agentes pueden crear depósitos pendientes autorizados.');
console.log('PASS: la regla .write no concede a agentes iniciar ni finalizar una aprobación de depósito.');
