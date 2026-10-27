'use strict';

// Ejecutado solo con Firebase Emulator Suite. No usa el proyecto de producción.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const enabled = process.env.SENDWAYO_RUN_EMULATOR_TESTS === '1';
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = host;
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

// El test de producción habitual no debe necesitar node_modules. Cargamos
// Firebase Admin únicamente cuando se ejecuta explícitamente el emulador.
const admin = enabled ? require('firebase-admin') : null;
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'sendwayo-express';
const ROOT = 'sendwayo_express_v2';
const PASSWORD = 'Swayo-test-2026!';

function uniqueEmail(role) {
  return 'emutest-' + role + '-' + crypto.randomBytes(5).toString('hex') + '@example.test';
}

async function createIdentity(app, role, extras = {}) {
  const email = uniqueEmail(role);
  const user = await app.auth().createUser({ email, password: PASSWORD, displayName: 'Test ' + role });
  const profile = {
    authUid: user.uid,
    uid: user.uid,
    email,
    authEmail: email,
    username: email,
    role,
    active: true,
    status: 'active',
    balance: 1000,
    balanceDOP: 1000,
    balanceHTG: 1000,
    commission: 0,
    commissionDOP: 0,
    commissionHTG: 0,
    ...extras
  };
  return { uid: user.uid, email, key: extras.testKey || user.uid, profile };
}

async function signIn(email) {
  const response = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true })
    }
  );
  const body = await response.json();
  assert.equal(response.ok, true, 'Auth Emulator debe iniciar sesión: ' + JSON.stringify(body));
  return body.idToken;
}

async function callFunction(token, name, data) {
  const response = await fetch(
    'http://127.0.0.1:5001/' + PROJECT_ID + '/us-central1/' + name,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ data })
    }
  );
  const body = await response.json();
  return { ok: response.ok, status: response.status, body, result: body.result || body.data };
}

async function balanceFor(ref, key, currency = 'DOP') {
  const snap = await ref.child('users').child(key).once('value');
  const row = snap.val() || {};
  return Number(currency === 'HTG' ? row.balanceHTG : (row.balanceDOP ?? row.balance) || 0);
}

test('Firebase Emulator: operaciones, reservas, aprobación y depósitos (pruebas aisladas)', { skip: !enabled }, async t => {
  const app = admin.initializeApp({
    projectId: PROJECT_ID,
    databaseURL: 'http://' + host + '/?ns=' + PROJECT_ID
  }, 'sendwayo-emulator-test-' + process.pid);
  const rtdb = app.database().ref(ROOT);
  const createdUsers = [];
  const ids = [];
  try {
    const adminIdentity = await createIdentity(app, 'admin', { testKey: 'admin', role: 'admin', balance: 10000, balanceDOP: 10000, balanceHTG: 10000 });
    const sender = await createIdentity(app, 'sender', { testKey: 'sender-1', role: 'remitente' });
    const agent = await createIdentity(app, 'agent', {
      testKey: 'agent-1', role: 'agente',
      commission: 200, commissionDOP: 200, commissionHTG: 300
    });
    const otherAgent = await createIdentity(app, 'agent2', { testKey: 'agent-2', role: 'agente' });
    createdUsers.push(adminIdentity, sender, agent, otherAgent);

    const users = {
      admin: adminIdentity.profile,
      'sender-1': sender.profile,
      'agent-1': agent.profile,
      'agent-2': otherAgent.profile
    };
    await rtdb.set({ users });
    const adminToken = await signIn(adminIdentity.email);
    const senderToken = await signIn(sender.email);
    const agentToken = await signIn(agent.email);
    const otherAgentToken = await signIn(otherAgent.email);

    await t.test('sender reserves amount + 8%, agent #2 approves once and commissions are ledgered', async () => {
      const opId = 'EMUTEST-ENVIO-' + crypto.randomBytes(4).toString('hex');
      ids.push(opId);
      const before = await balanceFor(rtdb, 'sender-1');
      const created = await callFunction(senderToken, 'submitOperation', {
        id: opId, type: 'Envío', category: 'Envío', route: 'RD->RD', method: 'Banco', amount: 100
      });
      assert.equal(created.ok, true, JSON.stringify(created.body));
      assert.equal(created.result.status, 'Pendiente');
      assert.equal(created.result.currency, 'DOP');
      assert.equal(created.result.commission, 8);
      assert.equal(await balanceFor(rtdb, 'sender-1'), before - 108, 'se reserva importe más comisión');
      const approved = await callFunction(otherAgentToken, 'reviewOperation', { operationId: opId, action: 'approve' });
      assert.equal(approved.ok, true, JSON.stringify(approved.body));
      assert.equal(approved.result.status, 'Aprobado');
      const senderRow = (await rtdb.child('users/sender-1').once('value')).val();
      assert.equal(Number(senderRow.commissionDOP), 4, 'remitente recibe 50% de la comisión');
      assert.equal(Number(senderRow.balanceDOP), before - 108, 'la reserva no se descuenta dos veces');
      const adminRow = (await rtdb.child('users/admin').once('value')).val();
      assert.equal(Number(adminRow.commissionDOP), 4, 'administración recibe la otra mitad');
      assert.equal(Number(adminRow.balanceDOP), 10004, 'comisión de administración también suma al balance');
      const receipt = await rtdb.child('envios').child(opId).child('receipt').once('value');
      assert.equal(receipt.exists(), true, 'el comprobante solo aparece tras aprobar');
      const secondReview = await callFunction(adminToken, 'reviewOperation', { operationId: opId, action: 'approve' });
      assert.equal(secondReview.ok, true, JSON.stringify(secondReview.body));
      assert.equal(secondReview.result.alreadyProcessed, true);
      assert.equal(Number((await rtdb.child('users/sender-1').once('value')).val().commissionDOP), 4, 'no se duplica la comisión al reintentar');
    });

    await t.test('un agente no puede autoaprobar su propia operación', async () => {
      const opId = 'EMUTEST-SELF-' + crypto.randomBytes(4).toString('hex');
      ids.push(opId);
      const created = await callFunction(agentToken, 'submitOperation', {
        id: opId, type: 'Envío', category: 'Envío', route: 'RD->RD', method: 'Banco', amount: 50
      });
      assert.equal(created.ok, true, JSON.stringify(created.body));
      const denied = await callFunction(agentToken, 'reviewOperation', { operationId: opId, action: 'approve' });
      assert.equal(denied.ok, false, 'la autoaprobación debe denegarse');
      assert.match(JSON.stringify(denied.body), /No puedes revisar|permission-denied|PERMISSION_DENIED/i);
      const stillPending = (await rtdb.child('envios').child(opId).once('value')).val();
      assert.equal(stillPending.status, 'Pendiente');
      const returned = await callFunction(adminToken, 'reviewOperation', { operationId: opId, action: 'reject', reason: 'Limpieza de prueba' });
      assert.equal(returned.ok, true, JSON.stringify(returned.body));
    });

    await t.test('retiro de comisión del agente queda pendiente, lo aprueba otro agente y descuenta balance compartido', async () => {
      const opId = 'EMUTEST-COM-WD-' + crypto.randomBytes(4).toString('hex');
      ids.push(opId);
      const adminBefore = await balanceFor(rtdb, 'admin', 'DOP');
      const agentBefore = Number((await rtdb.child('users/agent-1').once('value')).val().commissionDOP);
      const agentBalanceBefore = await balanceFor(rtdb, 'agent-1', 'DOP');

      const created = await callFunction(agentToken, 'requestCommissionWithdrawal', {
        id: opId, amount: 50, currency: 'DOP'
      });
      assert.equal(created.ok, true, JSON.stringify(created.body));
      assert.equal(created.result.status, 'Pendiente');
      assert.equal(created.result.amount, 50);
      assert.equal(Number((await rtdb.child('users/agent-1').once('value')).val().commissionDOP), agentBefore - 50,
        'se reserva la comisión disponible al solicitar el retiro');
      assert.equal(await balanceFor(rtdb, 'agent-1', 'DOP'), agentBalanceBefore,
        'el agente no recibe un balance operativo propio');
      assert.equal(await balanceFor(rtdb, 'admin', 'DOP'), adminBefore,
        'el balance compartido solo cambia al aprobar el retiro');

      const selfReview = await callFunction(agentToken, 'reviewOperation', { operationId: opId, action: 'approve' });
      assert.equal(selfReview.ok, false, 'el agente no puede autoaprobar su retiro de comisión');
      assert.equal((await rtdb.child('commissions').child(opId).once('value')).val().status, 'Pendiente');

      const approved = await callFunction(otherAgentToken, 'reviewOperation', { operationId: opId, action: 'approve' });
      assert.equal(approved.ok, true, JSON.stringify(approved.body));
      assert.equal(approved.result.status, 'Aprobado');
      assert.equal(await balanceFor(rtdb, 'admin', 'DOP'), adminBefore - 50,
        'el pago sale del balance compartido de administración');
      assert.equal(Number((await rtdb.child('users/agent-1').once('value')).val().commissionDOP), agentBefore - 50,
        'la comisión reservada no vuelve a descontarse');
      assert.equal((await rtdb.child('commissions').child(opId).child('receipt').once('value')).exists(), false,
        'no se inventa un comprobante dentro de la solicitud antes de aprobación');
      const repeated = await callFunction(adminToken, 'reviewOperation', { operationId: opId, action: 'approve' });
      assert.equal(repeated.ok, true, JSON.stringify(repeated.body));
      assert.equal(repeated.result.alreadyProcessed, true);
      assert.equal(await balanceFor(rtdb, 'admin', 'DOP'), adminBefore - 50,
        'un segundo intento no duplica el pago');
    });

    await t.test('rechazar retiro de comisión libera la comisión reservada una sola vez', async () => {
      const opId = 'EMUTEST-COM-REJECT-' + crypto.randomBytes(4).toString('hex');
      ids.push(opId);
      const agentBefore = Number((await rtdb.child('users/agent-1').once('value')).val().commissionDOP);
      const created = await callFunction(agentToken, 'requestCommissionWithdrawal', {
        id: opId, amount: 25, currency: 'DOP'
      });
      assert.equal(created.ok, true, JSON.stringify(created.body));
      assert.equal(Number((await rtdb.child('users/agent-1').once('value')).val().commissionDOP), agentBefore - 25);
      const rejected = await callFunction(otherAgentToken, 'reviewOperation', {
        operationId: opId, action: 'reject', reason: 'Prueba de rechazo'
      });
      assert.equal(rejected.ok, true, JSON.stringify(rejected.body));
      assert.equal(Number((await rtdb.child('users/agent-1').once('value')).val().commissionDOP), agentBefore,
        'el rechazo devuelve la comisión reservada');
      const repeated = await callFunction(otherAgentToken, 'reviewOperation', {
        operationId: opId, action: 'reject', reason: 'Segundo intento'
      });
      assert.equal(repeated.ok, true, JSON.stringify(repeated.body));
      assert.equal(Number((await rtdb.child('users/agent-1').once('value')).val().commissionDOP), agentBefore,
        'la devolución de comisión no ocurre dos veces');
    });

    await t.test('los agentes no pueden aprobar depósitos; el administrador sí y solo una vez', async () => {
      const opId = 'EMUTEST-DEPOSIT-' + crypto.randomBytes(4).toString('hex');
      ids.push(opId);
      const before = await balanceFor(rtdb, 'sender-1', 'HTG');
      const created = await callFunction(agentToken, 'submitOperation', {
        id: opId, type: 'Depósito', category: 'Depósito', targetUserId: 'sender-1', userId: 'sender-1', currency: 'HTG', amount: 250, accountId: 'TEST-BANK'
      });
      assert.equal(created.ok, true, JSON.stringify(created.body));
      assert.equal(created.result.currency, 'HTG');
      assert.equal(created.result.commission, 0);
      const denied = await callFunction(otherAgentToken, 'reviewOperation', { operationId: opId, action: 'approve' });
      assert.equal(denied.ok, false);
      assert.match(JSON.stringify(denied.body), /Solo el administrador|permission-denied|PERMISSION_DENIED/i);
      assert.equal(await balanceFor(rtdb, 'sender-1', 'HTG'), before, 'el depósito no se acredita antes de aprobar');
      const approved = await callFunction(adminToken, 'reviewOperation', { operationId: opId, action: 'approve' });
      assert.equal(approved.ok, true, JSON.stringify(approved.body));
      assert.equal(await balanceFor(rtdb, 'sender-1', 'HTG'), before + 250);
      const repeated = await callFunction(adminToken, 'reviewOperation', { operationId: opId, action: 'approve' });
      assert.equal(repeated.ok, true);
      assert.equal(await balanceFor(rtdb, 'sender-1', 'HTG'), before + 250, 'no se acredita por duplicado');
    });

    await t.test('balance insuficiente impide crear una operación y no deja registro', async () => {
      const opId = 'EMUTEST-INSUFFICIENT-' + crypto.randomBytes(4).toString('hex');
      ids.push(opId);
      const before = await balanceFor(rtdb, 'sender-1');
      const created = await callFunction(senderToken, 'submitOperation', {
        id: opId, type: 'Envío', route: 'RD->RD', method: 'Banco', amount: 500000
      });
      assert.equal(created.ok, false);
      assert.match(JSON.stringify(created.body), /Balance insuficiente|FAILED_PRECONDITION/i);
      assert.equal(await balanceFor(rtdb, 'sender-1'), before);
      assert.equal((await rtdb.child('envios').child(opId).once('value')).exists(), false);
    });

    await t.test('Rechazado devuelve la reserva una sola vez', async () => {
      const opId = 'EMUTEST-REFUND-' + crypto.randomBytes(4).toString('hex');
      ids.push(opId);
      const before = await balanceFor(rtdb, 'sender-1');
      const created = await callFunction(senderToken, 'submitOperation', {
        id: opId, type: 'Envío', route: 'RD->RD', method: 'Banco', amount: 40
      });
      assert.equal(created.ok, true, JSON.stringify(created.body));
      assert.equal(await balanceFor(rtdb, 'sender-1'), before - 43.2);
      const rejected = await callFunction(agentToken, 'reviewOperation', { operationId: opId, action: 'reject', reason: 'Prueba de devolución' });
      assert.equal(rejected.ok, true, JSON.stringify(rejected.body));
      assert.equal(await balanceFor(rtdb, 'sender-1'), before);
      const repeated = await callFunction(agentToken, 'reviewOperation', { operationId: opId, action: 'reject', reason: 'Segundo intento' });
      assert.equal(repeated.ok, true);
      assert.equal(await balanceFor(rtdb, 'sender-1'), before, 'no devuelve los fondos dos veces');
    });
  } finally {
    for (const id of ids) {
      for (const collection of ['envios','recargas','paqueticos','pagos','paquetes','deposits','accountWithdrawals','commissions','credits','ledger','audit','notifications']) {
        await rtdb.child(collection).child(id).remove().catch(() => {});
      }
    }
    for (const identity of createdUsers) {
      await app.auth().deleteUser(identity.uid).catch(() => {});
    }
    await rtdb.remove().catch(() => {});
    await app.delete().catch(() => {});
  }
});
