'use strict';

// Ejecutado solo con Firebase Emulator Suite. No usa el proyecto de producción.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

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
  // Asegurar que las pruebas evalúan las reglas reales del proyecto y no reglas
  // abiertas de otro namespace del emulador.
  const namespace = PROJECT_ID;
  const rulesPath = path.resolve(__dirname, '../../database.rules.json');
  const rulesText = fs.readFileSync(rulesPath, 'utf8');
  const rulesUrl = 'http://' + host + '/.settings/rules.json?ns=' + encodeURIComponent(namespace);
  const rulesPut = await fetch(rulesUrl, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'authorization': 'Bearer owner'
    },
    body: rulesText
  });
  const rulesPutBody = await rulesPut.text();
  assert.equal(rulesPut.ok, true, 'El emulador debe aceptar las reglas del repositorio: ' + rulesPutBody);
  const rulesGet = await fetch(rulesUrl, {
    headers: { authorization: 'Bearer owner' }
  });
  assert.equal(rulesGet.ok, true, 'El emulador debe permitir verificar las reglas cargadas.');
  const loadedRules = await rulesGet.json();
  const loadedUsersRead = String(loadedRules?.rules?.sendwayo_express_v2?.users?.['.read'] || '');
  assert.ok(
    loadedUsersRead.includes("auth.token.email === 'sendwayoexpress@gmail.com'") &&
    !loadedUsersRead.includes('query.orderByChild'),
    'El namespace de prueba debe tener la regla privada de usuarios del repositorio.'
  );

  const app = admin.initializeApp({
    projectId: PROJECT_ID,
    databaseURL: 'http://' + host + '/?ns=' + PROJECT_ID
  }, 'sendwayo-emulator-test-' + process.pid);
  const rtdb = app.database().ref(ROOT);
  const createdUsers = [];
  const ids = [];
  const reconciliationRunIds = [];
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
    await rtdb.set({
      users,
      // Las reglas de acceso a la cola compartida exigen una vinculación
      // de agente activa asociada al mismo UID autenticado.
      agentAuth: {
        [agent.uid]: {
          authUid: agent.uid, userId: 'agent-1', role: 'agente', active: true
        },
        [otherAgent.uid]: {
          authUid: otherAgent.uid, userId: 'agent-2', role: 'agente', active: true
        }
      }
    });
    const adminToken = await signIn(adminIdentity.email);
    const senderToken = await signIn(sender.email);
    const agentToken = await signIn(agent.email);
    const otherAgentToken = await signIn(otherAgent.email);

    await t.test('privacidad de perfiles: el agente ve su ficha, no el árbol de usuarios', async () => {
      const rootUrl = 'http://' + host + '/' + ROOT + '/users.json?ns=' + encodeURIComponent(PROJECT_ID) + '&auth=';
      const listResp = await fetch(rootUrl + encodeURIComponent(agentToken));
      assert.equal(listResp.ok, false, 'el agente no puede leer todos los perfiles directamente');
      const ownResp = await fetch('http://' + host + '/' + ROOT + '/users/agent-1.json?ns=' + encodeURIComponent(PROJECT_ID) + '&auth=' + encodeURIComponent(agentToken));
      assert.equal(ownResp.ok, true, 'el agente puede leer su propia ficha');
      const otherResp = await fetch('http://' + host + '/' + ROOT + '/users/sender-1.json?ns=' + encodeURIComponent(PROJECT_ID) + '&auth=' + encodeURIComponent(agentToken));
      assert.equal(otherResp.ok, false, 'el agente no puede leer directamente el perfil financiero de un remitente');
      const directory = await callFunction(agentToken, 'listDirectory', {});
      assert.equal(directory.ok, true, JSON.stringify(directory.body));
      const profiles = directory.result.profiles;
      assert.ok(profiles.some(row => row.id === 'sender-1' && row.role === 'remitente'), 'el agente puede elegir remitentes para atender operaciones');
      assert.ok(profiles.some(row => row.id === 'agent-2' && row.role === 'agente'), 'el agente puede ver el directorio de agentes para seguimiento');
      assert.ok(!profiles.some(row => row.id === 'admin'), 'el directorio de agentes no revela el perfil administrativo');
      for (const row of profiles) {
        for (const privateField of ['balance','balanceDOP','balanceHTG','commission','commissionDOP','commissionHTG','balanceReservations','commissionWithdrawalReservations','password','contrasena']) {
          assert.equal(Object.hasOwn(row, privateField), false, 'el directorio no devuelve ' + privateField);
        }
      }
    });

    await t.test('el cliente no puede escribir directamente operaciones financieras para saltarse el servidor', async () => {
      const base = 'http://' + host + '/' + ROOT + '/';
      const query = '?ns=' + encodeURIComponent(PROJECT_ID) + '&auth=';
      const payload = {
        id: 'CLIENT-DIRECT-BYPASS', userId: 'sender-1', amount: 100,
        currency: 'DOP', commission: 0, status: 'Pendiente',
        createdByAuthUid: sender.uid, createdByUserId: 'sender-1'
      };
      const envios = await fetch(base + 'envios/CLIENT-DIRECT-BYPASS.json' + query + encodeURIComponent(senderToken), {
        method: 'PUT', headers: {'content-type':'application/json'}, body: JSON.stringify(payload)
      });
      assert.equal(envios.ok, false, 'el remitente no puede crear un envío omitiendo reserva y validación del servidor');
      const deposit = await fetch(base + 'deposits/CLIENT-DIRECT-DEPOSIT.json' + query + encodeURIComponent(agentToken), {
        method: 'PUT', headers: {'content-type':'application/json'},
        body: JSON.stringify({ ...payload, id: 'CLIENT-DIRECT-DEPOSIT', userId:'sender-1', accountingType:'DEPOSITO_CAPITAL' })
      });
      assert.equal(deposit.ok, false, 'un agente no puede escribir directamente un depósito; usa la callable y solo el administrador puede aprobarlo');
      const withdrawal = await fetch(base + 'accountWithdrawals/CLIENT-DIRECT-WITHDRAWAL.json' + query + encodeURIComponent(senderToken), {
        method: 'PUT', headers: {'content-type':'application/json'}, body: JSON.stringify({...payload,id:'CLIENT-DIRECT-WITHDRAWAL'})
      });
      assert.equal(withdrawal.ok, false, 'un remitente no puede escribir directamente un retiro que salte la reserva del balance');

      const directBalanceEdit = await fetch(base + 'users/agent-1.json' + query + encodeURIComponent(agentToken), {
        method: 'PUT',
        headers: {'content-type':'application/json'},
        body: JSON.stringify({
          id: 'agent-1', authUid: agent.uid, authEmail: agent.email, email: agent.email,
          role: 'agente', active: true, status: 'active',
          balance: 999999, balanceDOP: 999999, balanceHTG: 1000,
          commission: 0, commissionDOP: 0, commissionHTG: 0
        })
      });
      assert.equal(directBalanceEdit.ok, false, 'un agente no puede modificar directamente su propio balance ni comisión');
    });

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

      const baseUrl = 'http://' + host + '/' + ROOT + '/';
      const unrestrictedParams = new URLSearchParams({ ns: PROJECT_ID, auth: agentToken });
      const unrestrictedRead = await fetch(baseUrl + 'envios.json?' + unrestrictedParams.toString());
      assert.equal(unrestrictedRead.ok, false, 'el agente no puede leer todo el historial de envíos');
      const pendingParams = new URLSearchParams({
        ns: PROJECT_ID, orderBy: '"status"', equalTo: '"Pendiente"', auth: agentToken
      });
      const pendingRead = await fetch(baseUrl + 'envios.json?' + pendingParams.toString());
      assert.equal(pendingRead.ok, true, 'el agente sí puede consultar la cola de revisión pendiente');
      const pendingRows = await pendingRead.json();
      assert.ok(pendingRows && pendingRows[opId], 'la cola compartida incluye el envío pendiente');
      const itemReadBefore = await fetch(baseUrl + 'envios/' + encodeURIComponent(opId) + '.json?' + unrestrictedParams.toString());
      assert.equal(itemReadBefore.ok, false, 'el agente no puede leer directamente el registro privado de otro creador');

      const approved = await callFunction(otherAgentToken, 'reviewOperation', { operationId: opId, action: 'approve' });
      assert.equal(approved.ok, true, JSON.stringify(approved.body));
      assert.equal(approved.result.status, 'Aprobado');
      const pendingAfterParams = new URLSearchParams({
        ns: PROJECT_ID, orderBy: '"status"', equalTo: '"Pendiente"', auth: agentToken
      });
      const pendingAfter = await fetch(baseUrl + 'envios.json?' + pendingAfterParams.toString());
      assert.equal(pendingAfter.ok, true, 'la cola de revisión sigue disponible');
      const pendingAfterRows = await pendingAfter.json();
      assert.equal(pendingAfterRows && pendingAfterRows[opId], undefined, 'el envío sale de la cola tras aprobarse');
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
      assert.equal((await rtdb.child('commissions').child(opId).child('receipt').once('value')).exists(), false,
        'el comprobante del retiro no aparece antes de aprobar');

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
      assert.equal((await rtdb.child('commissions').child(opId).child('receipt').once('value')).exists(), true,
        'el comprobante se genera al aprobar el retiro de comisión');
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

      const depositQueueParams = new URLSearchParams({
        ns: PROJECT_ID, orderBy: '"status"', equalTo: '"Pendiente"', auth: agentToken
      });
      const agentDepositQueue = await fetch('http://' + host + '/' + ROOT + '/deposits.json?' + depositQueueParams.toString());
      assert.equal(agentDepositQueue.ok, false, 'los agentes no pueden consultar la cola de depósitos');

      const agentDepositItem = await fetch('http://' + host + '/' + ROOT + '/deposits/' + encodeURIComponent(opId) + '.json?ns=' + encodeURIComponent(PROJECT_ID) + '&auth=' + encodeURIComponent(agentToken));
      assert.equal(agentDepositItem.ok, false, 'los agentes no pueden leer directamente un depósito');

      const agentNotices = (await rtdb.child('notifications').orderByChild('targetUserId').equalTo('agent-2').once('value')).val() || {};
      assert.equal(Object.values(agentNotices).some(row => row && row.operationId === opId), false,
        'el depósito no debe generar notificación en la bandeja de otro agente');

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
    await t.test('conciliación financiera escanea las operaciones y solo la ejecuta el administrador', async () => {
      const opId = 'EMUTEST-RECON-' + crypto.randomBytes(4).toString('hex');
      ids.push(opId);
      const created = await callFunction(senderToken, 'submitOperation', {
        id: opId, type: 'Envío', category: 'Envío', route: 'RD->RD', method: 'Banco', amount: 15
      });
      assert.equal(created.ok, true, JSON.stringify(created.body));
      assert.equal(created.result.status, 'Pendiente');

      const agentDenied = await callFunction(agentToken, 'runFinancialReconciliation', {});
      assert.equal(agentDenied.ok, false, 'un agente no puede ejecutar la conciliación completa');

      const report = await callFunction(adminToken, 'runFinancialReconciliation', {});
      assert.equal(report.ok, true, JSON.stringify(report.body));
      assert.equal(report.result.status, 'Completada');
      assert.ok(report.result.summary.totalOperations >= 1);
      assert.ok(report.result.summary.transactionRows >= 1);
      assert.ok(report.result.summary.pendingCount >= 1);
      reconciliationRunIds.push(report.result.id);

      const current = (await rtdb.child('reconciliationDetails/current').once('value')).val();
      assert.equal(current.runId, report.result.id);
      const detailRows = Object.values(current.rows || {});
      const detail = detailRows.find(row => row && row.transactionId === opId);
      assert.ok(detail, 'el detalle en tiempo real incluye la operación pendiente creada');
      assert.equal(detail.statusOriginal, 'Pendiente');
      assert.equal(detail.generatedByAudit, true, 'el renglón de conciliación se marca como solo lectura');

      const archived = (await rtdb.child('reconciliations').child(report.result.id).once('value')).val();
      assert.equal(archived.status, 'Completada', 'se conserva un resumen histórico de cada ejecución');

      const notices = (await rtdb.child('notifications').orderByChild('targetUserId').equalTo('admin').once('value')).val() || {};
      assert.ok(Object.values(notices).some(row => row && row.operationId === report.result.id),
        'la conciliación genera una notificación en tiempo real para el administrador');
    });

  } finally {
    for (const id of ids) {
      for (const collection of ['envios','recargas','paqueticos','pagos','paquetes','deposits','accountWithdrawals','commissions','credits','ledger','audit','notifications']) {
        await rtdb.child(collection).child(id).remove().catch(() => {});
      }
    }
    for (const runId of reconciliationRunIds) {
      await rtdb.child('reconciliations').child(runId).remove().catch(() => {});
    }
    await rtdb.child('reconciliationDetails/current').remove().catch(() => {});
    for (const identity of createdUsers) {
      await app.auth().deleteUser(identity.uid).catch(() => {});
    }
    await rtdb.remove().catch(() => {});
    await app.delete().catch(() => {});
  }
});
