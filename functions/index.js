/* SENDWAYO EXPRESS: seguridad y liquidación financiera en Firebase Functions.
 * Toda autorización de operación se valida con el perfil almacenado y el UID autenticado.
 */
'use strict';

const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const P = require('./lib/policy');

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'sendwayo-express';
const DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '';
const DATABASE_URL = process.env.SENDWAYO_DATABASE_URL ||
  (DATABASE_EMULATOR_HOST ? 'http://' + DATABASE_EMULATOR_HOST + '/?ns=' + PROJECT_ID : undefined);
admin.initializeApp({
  projectId: PROJECT_ID,
  ...(DATABASE_URL ? { databaseURL: DATABASE_URL } : {})
});
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const ROOT = 'sendwayo_express_v2';
const ADMIN_EMAIL = 'sendwayoexpress@gmail.com';
const COLLECTIONS = [
  'envios', 'recargas', 'paqueticos', 'pagos', 'paquetes',
  'deposits', 'accountWithdrawals', 'commissions', 'credits'
];
const db = admin.database();
const root = () => db.ref(ROOT);
function hasInvalidRtdbKey(value) {
  const text = String(value || '');
  return ['.', '#', '$', '[', ']', '/'].some(character => text.includes(character));
}
async function safeTransaction(ref, updateFunction) {
  // Seed the first client-side transaction callback with a fresh snapshot when
  // the SDK's local cache is initially null. RTDB still validates the update
  // against the server and reruns the callback if another writer changed it.
  const initial = await ref.once('value');
  let attempts = 0;
  return ref.transaction(current => {
    attempts += 1;
    if ((current === null || current === undefined) && attempts === 1 && initial.exists()) {
      return updateFunction(initial.val());
    }
    return updateFunction(current);
  }, undefined, false);
}
const now = () => Date.now();
const roleOf = row => P.normalizeRole(row && (row.role || row.rol));
const activeProfile = row => {
  if (!row || typeof row !== 'object' || row.disabled === true || row.active === false) return false;
  const status = P.normalizeText(row.status || '');
  return !status || ['active', 'approved', 'aprobado', 'activo'].includes(status);
};
const asHttpsError = (error, fallback = 'No se pudo completar la operación con seguridad.') => {
  if (error instanceof HttpsError) return error;
  console.error('[SENDWAYO] Error de operación financiera:', error);
  return new HttpsError('internal', fallback);
};
function requireAuth(request) {
  if (!request || !request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'Inicia sesión para continuar.');
  }
  return request.auth;
}
async function loadActor(request) {
  const auth = requireAuth(request);
  const email = P.normalizeText(auth.token.email || '');
  const usersSnap = await root().child('users').once('value');
  const users = usersSnap.val() || {};
  let entry = Object.entries(users).find(([key, value]) =>
    value && (
      String(value.authUid || value.uid || '') === auth.uid ||
      (email && [value.authEmail, value.email, value.username].some(v => P.normalizeText(v) === email))
    )
  );
  if (!entry && email === ADMIN_EMAIL) {
    const adminRow = users.admin || {};
    entry = ['admin', { ...adminRow, role: 'admin', email: ADMIN_EMAIL, active: adminRow.active !== false }];
  }
  if (!entry) throw new HttpsError('permission-denied', 'Tu cuenta no está vinculada a un perfil autorizado de SENDWAYO EXPRESS.');
  const [key, profile] = entry;
  const role = (auth.token.admin === true || email === ADMIN_EMAIL || roleOf(profile) === 'admin') ? 'admin' : roleOf(profile);
  if (!['admin', 'agent', 'remitente'].includes(role)) {
    throw new HttpsError('permission-denied', 'El perfil no tiene un rol autorizado.');
  }
  if (role !== 'admin' && !activeProfile(profile)) {
    throw new HttpsError('permission-denied', 'La cuenta está desactivada o pendiente de aprobación.');
  }
  if (role === 'admin' && email !== ADMIN_EMAIL && auth.token.admin !== true && roleOf(profile) !== 'admin') {
    throw new HttpsError('permission-denied', 'La cuenta no tiene privilegios de administración.');
  }
  return { uid: auth.uid, email, key, role, profile, users };
}
function canonicalRole(role) {
  if (role === 'admin') return 'administrador';
  if (role === 'agent') return 'agente';
  if (role === 'remitente') return 'remitente';
  return String(role || '');
}
function getCollection(record) {
  const type = P.normalizeText(record && (record.type || record.category || record.routeFull));
  if (/deposito|deposit/.test(type)) return 'deposits';
  if (/retiro|withdraw/.test(type)) return 'accountWithdrawals';
  if (/recarga|top.?up/.test(type)) return 'recargas';
  if (/paquetico|paquetito/.test(type)) return 'paqueticos';
  if (/factura|servicio|pago/.test(type)) return 'pagos';
  if (/paquete/.test(type)) return 'paquetes';
  return 'envios';
}
function keyForTarget(users, value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw === 'admin') return 'admin';
  if (users[raw]) return raw;
  const found = Object.entries(users).find(([key, profile]) => profile && [
    key, profile.id, profile.legacyId, profile.accountId, profile.code, profile.staffId,
    profile.authUid, profile.uid, profile.authEmail, profile.email, profile.username
  ].some(v => String(v || '') === raw));
  return found ? found[0] : null;
}
function balanceState(user, currency) {
  const htg = currency === 'HTG';
  return P.money(htg ? user.balanceHTG : (user.balanceDOP !== undefined ? user.balanceDOP : user.balance));
}
function setBalance(user, currency, value) {
  const next = { ...user };
  if (currency === 'HTG') next.balanceHTG = value;
  else {
    next.balanceDOP = value;
    next.balance = value;
  }
  return next;
}
function setCommission(user, currency, value) {
  const next = { ...user };
  if (currency === 'HTG') {
    next.commissionHTG = value;
    next.commissionAccruedHTG = value;
  } else {
    next.commission = value;
    next.commissionDOP = value;
    next.commissionAccrued = value;
  }
  return next;
}
function amountFrom(data) {
  const amount = P.money(data && (data.amount ?? data.monto));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
    throw new HttpsError('invalid-argument', 'El importe debe ser mayor que cero y tener un valor válido.');
  }
  return amount;
}
async function getOperation(id) {
  const opId = String(id || '').trim();
  if (!opId || opId.length > 180 || /[.#$\[\]/]/.test(opId)) {
    throw new HttpsError('invalid-argument', 'El identificador de la operación no es válido.');
  }
  for (const collection of COLLECTIONS) {
    const snap = await root().child(collection).child(opId).once('value');
    if (snap.exists()) return { collection, id: opId, ref: snap.ref, record: snap.val() || {} };
  }
  throw new HttpsError('not-found', 'No se encontró la operación en Firebase.');
}
async function appendNotification(targetUserId, title, message, collection, operationId) {
  const target = String(targetUserId || 'admin');
  const ref = root().child('notifications').push();
  await ref.set({
    id: ref.key,
    targetUserId: target,
    title: String(title || 'SENDWAYO EXPRESS'),
    message: String(message || ''),
    msg: String(message || ''),
    collection: String(collection || 'dashboard'),
    section: String(collection || 'dashboard'),
    recordId: String(operationId || ''),
    operationId: String(operationId || ''),
    createdAt: now(),
    createdAtMs: now(),
    createdByAuthUid: 'server',
    read: false
  });
}
async function notifyReviewers(users, actor, operation, collection, id) {
  const recipients = new Set(['admin']);
  for (const [key, profile] of Object.entries(users || {})) {
    if (profile && roleOf(profile) === 'agent' && activeProfile(profile) && key !== actor.key) recipients.add(key);
  }
  recipients.delete(actor.key);
  const title = 'Operación pendiente de revisión';
  const message = 'Nueva operación pendiente: ' + String(operation.type || operation.category || collection) + ' · ' + String(operation.amount || 0) + ' ' + String(operation.currency || 'DOP') + '.';
  await Promise.all([...recipients].map(key => appendNotification(key, title, message, collection, id)));
}
async function addOwnerNotification(operation, collection, id, message) {
  const owner = String(operation.userId || operation.targetUserId || operation.createdByUserId || 'admin');
  await appendNotification(owner, 'SENDWAYO EXPRESS', message, collection, id);
}
async function reserveBalance(accountKey, operationId, amount, currency, collection) {
  let insufficient = false;
  let mismatch = false;
  let callbackCount = 0;
  let callbackReason = 'callback-not-run';
  let callbackUserExists = false;
  let callbackUserType = 'unknown';
  let callbackUserKeys = [];
  let callbackBalance = null;
  const ref = root().child('users').child(accountKey);

  const tx = await safeTransaction(ref, user => {
    callbackCount += 1;
    callbackUserExists = Boolean(user);
    callbackUserType = user === null ? 'null' : typeof user;
    callbackUserKeys = user && typeof user === 'object' ? Object.keys(user).slice(0, 30) : [];
    if (!user || typeof user !== 'object') { callbackReason = 'missing-or-non-object'; return; }
    const reservations = { ...(user.balanceReservations || {}) };
    const existing = reservations[operationId];
    if (existing) {
      if (P.money(existing.amount) === amount && existing.currency === currency && existing.status === 'RESERVED') { callbackReason = 'existing-reservation'; return user; }
      mismatch = true;
      callbackReason = 'reservation-mismatch';
      return;
    }
    const before = balanceState(user, currency);
    callbackBalance = before;
    if (!Number.isFinite(before) || before < amount) {
      insufficient = true;
      callbackReason = 'insufficient-or-invalid-balance';
      return;
    }
    const after = P.money(before - amount);
    callbackReason = 'reservation-created';
    reservations[operationId] = {
      id: operationId, operationId, collection, currency, amount,
      before, after, status: 'RESERVED', reservedAt: now()
    };
    let next = setBalance(user, currency, after);
    next.balanceReservations = reservations;
    next.lastBalanceReservationId = operationId;
    next.lastBalanceReservationCollection = collection;
    next.lastBalanceReservationCurrency = currency;
    return next;
  });
  const fresh = tx && tx.snapshot && tx.snapshot.val();
  const reservation = fresh && fresh.balanceReservations && fresh.balanceReservations[operationId];
  if (reservation && reservation.status === 'RESERVED' && reservation.currency === currency && P.money(reservation.amount) === amount) return;
  if (insufficient) throw new HttpsError('failed-precondition', 'Balance insuficiente en ' + currency + '. No se creó la operación.');
  if (mismatch) throw new HttpsError('already-exists', 'El identificador de la operación ya tiene una reserva diferente.');
  console.error('[SENDWAYO] reserva no confirmada', {
    projectId: PROJECT_ID,
    emulatorHost: process.env.FIREBASE_DATABASE_EMULATOR_HOST || null,
    accountKey,
    operationId,
    committed: Boolean(tx && tx.committed),
    snapshotExists: Boolean(tx && tx.snapshot && tx.snapshot.exists()),
    snapshotBalanceDOP: fresh && (fresh.balanceDOP ?? fresh.balance) !== undefined ? (fresh.balanceDOP ?? fresh.balance) : null,
    snapshotBalanceHTG: fresh && fresh.balanceHTG !== undefined ? fresh.balanceHTG : null,
    hasReservation: Boolean(reservation),
    reservationStatus: reservation && reservation.status || null,
    reservationCurrency: reservation && reservation.currency || null,
    reservationAmount: reservation && reservation.amount !== undefined ? reservation.amount : null,
    expectedCurrency: currency,
    expectedAmount: amount,
    insufficient,
    mismatch,
    callbackCount,
    callbackReason,
    callbackUserExists,
    callbackUserType,
    callbackUserKeys,
    callbackBalance
  });
  throw new HttpsError('failed-precondition', 'Firebase no confirmó la reserva del balance. No se debe repetir con otro importe.');
}
async function debitLegacyBalance(accountKey, operationId, amount, currency) {
  const ref = root().child('users').child(accountKey);
  let insufficient = false;
  let alreadyDone = false;
  const tx = await safeTransaction(ref, user => {
    if (!user || typeof user !== 'object') return;
    const settlements = { ...(user.transactionSettlements || {}) };
    if (settlements[operationId]) { alreadyDone = true; return user; }
    const before = balanceState(user, currency);
    if (!Number.isFinite(before) || before < amount) { insufficient = true; return; }
    const after = P.money(before - amount);
    const next = setBalance(user, currency, after);
    next.transactionSettlements = { ...settlements, [operationId]: { id: operationId, amount, currency, before, after, at: now(), kind: 'DEBIT' } };
    return next;
  });
  const fresh = tx && tx.snapshot && tx.snapshot.val();
  if (fresh && fresh.transactionSettlements && fresh.transactionSettlements[operationId]) return;
  if (insufficient) throw new HttpsError('failed-precondition', 'Balance insuficiente en ' + currency + '. La operación no se aprobó.');
  if (!tx || !tx.committed) throw new HttpsError('failed-precondition', 'No se confirmó el descuento del balance.');
}
async function updateReservationStatus(accountKey, operationId, newStatus) {
  const ref = root().child('users').child(accountKey);
  let changed = false;
  const tx = await safeTransaction(ref, user => {
    if (!user || typeof user !== 'object') return;
    const reservations = { ...(user.balanceReservations || {}) };
    const reservation = reservations[operationId];
    if (!reservation) return user;
    if (reservation.status === newStatus || reservation.status === 'SETTLED' || reservation.status === 'REFUNDED') return user;
    if (reservation.status !== 'RESERVED') return user;
    reservations[operationId] = { ...reservation, status: newStatus, [newStatus === 'SETTLED' ? 'settledAt' : 'releasedAt']: now() };
    changed = true;
    return { ...user, balanceReservations: reservations };
  });
  if (!tx || !tx.snapshot || !tx.snapshot.exists()) throw new HttpsError('failed-precondition', 'No se confirmó el estado de la reserva.');
  return changed;
}
async function refundBalance(accountKey, operationId, amount, currency, allowLegacyFallback = false) {
  const ref = root().child('users').child(accountKey);
  let refunded = false;
  const tx = await safeTransaction(ref, user => {
    if (!user || typeof user !== 'object') return;
    const reservations = { ...(user.balanceReservations || {}) };
    const reservation = reservations[operationId];
    if (reservation && reservation.status === 'REFUNDED') return user;
    if (reservation && reservation.status === 'SETTLED') return user;
    if (reservation && reservation.status === 'RESERVED') {
      const before = balanceState(user, currency);
      const after = P.money(before + P.money(reservation.amount));
      reservations[operationId] = { ...reservation, status: 'REFUNDED', releasedAt: now(), refundBefore: before, refundAfter: after };
      const next = setBalance(user, currency, after);
      next.balanceReservations = reservations;
      refunded = true;
      return next;
    }
    // Compatibilidad solo cuando el registro histórico confirma que ya hubo descuento.
    // No crear dinero al cancelar una reserva que nunca se llegó a realizar.
    if (!allowLegacyFallback) return user;
    const settlements = { ...(user.transactionSettlements || {}) };
    const refundId = operationId + '-refund';
    if (settlements[refundId]) return user;
    const before = balanceState(user, currency);
    const after = P.money(before + amount);
    const next = setBalance(user, currency, after);
    next.transactionSettlements = { ...settlements, [refundId]: { id: refundId, operationId, amount, currency, before, after, at: now(), kind: 'REFUND' } };
    refunded = true;
    return next;
  });
  if (!tx || !tx.snapshot || !tx.snapshot.exists()) throw new HttpsError('failed-precondition', 'No se confirmó la devolución del balance.');
  return refunded;
}
async function creditDeposit(operationId, accountKey, amount, currency) {
  const ref = root().child('users').child(accountKey);
  const tx = await safeTransaction(ref, user => {
    if (!user || typeof user !== 'object') return;
    const credits = { ...(user.depositCredits || {}) };
    if (credits[operationId] !== undefined) return user;
    const before = balanceState(user, currency);
    const after = P.money(before + amount);
    let next = setBalance(user, currency, after);
    next.depositCredits = { ...credits, [operationId]: amount };
    next.depositCurrencies = { ...(user.depositCurrencies || {}), [operationId]: currency };
    next.depositCreditedAt = now();
    return next;
  });
  const fresh = tx && tx.snapshot && tx.snapshot.val();
  if (!fresh || !fresh.depositCredits || P.money(fresh.depositCredits[operationId]) !== amount) {
    throw new HttpsError('failed-precondition', 'Firebase no confirmó el crédito del depósito.');
  }
}
async function creditCommission(accountKey, operationId, amount, currency, alsoBalance) {
  if (!(amount > 0)) return;
  const key = operationId + (alsoBalance ? '-admin-commission' : '-sender-commission');
  const ref = root().child('users').child(accountKey);
  const tx = await safeTransaction(ref, user => {
    if (!user || typeof user !== 'object') return;
    const credits = { ...(user.transactionCommissionCredits || {}) };
    if (credits[key]) return user;
    const commissionBefore = P.money(currency === 'HTG' ? user.commissionHTG : (user.commissionDOP ?? user.commission));
    const commissionAfter = P.money(commissionBefore + amount);
    let next = setCommission(user, currency, commissionAfter);
    if (alsoBalance) {
      const before = balanceState(user, currency);
      next = setBalance(next, currency, P.money(before + amount));
    }
    next.transactionCommissionCredits = { ...credits, [key]: { id: key, operationId, amount, currency, creditedAt: now(), alsoBalance } };
    return next;
  });
  const fresh = tx && tx.snapshot && tx.snapshot.val();
  if (!fresh || !fresh.transactionCommissionCredits || !fresh.transactionCommissionCredits[key]) {
    throw new HttpsError('failed-precondition', 'Firebase no confirmó la comisión.');
  }
}
async function reserveAgentCommission(accountKey, operationId, amount, currency) {
  const ref = root().child('users').child(accountKey);
  let insufficient = false;
  let mismatch = false;
  const tx = await safeTransaction(ref, user => {
    if (!user || typeof user !== 'object') return;
    const reservations = { ...(user.commissionWithdrawalReservations || {}) };
    const existing = reservations[operationId];
    if (existing) {
      if (existing.status === 'RESERVED' && existing.currency === currency && P.money(existing.amount) === amount) return user;
      mismatch = true;
      return;
    }
    const before = P.money(currency === 'HTG'
      ? (user.commissionHTG ?? user.commissionAccruedHTG ?? 0)
      : (user.commissionDOP ?? user.commission ?? user.commissionAccrued ?? 0));
    if (!Number.isFinite(before) || before < amount) {
      insufficient = true;
      return;
    }
    const after = P.money(before - amount);
    reservations[operationId] = {
      id: operationId, operationId, amount, currency, before, after,
      status: 'RESERVED', reservedAt: now()
    };
    const next = setCommission(user, currency, after);
    next.commissionWithdrawalReservations = reservations;
    return next;
  });
  const fresh = tx && tx.snapshot && tx.snapshot.val();
  const reservation = fresh && fresh.commissionWithdrawalReservations && fresh.commissionWithdrawalReservations[operationId];
  if (reservation && reservation.status === 'RESERVED' && reservation.currency === currency && P.money(reservation.amount) === amount) return reservation;
  if (insufficient) throw new HttpsError('failed-precondition', 'La comisión disponible es insuficiente en ' + currency + '.');
  if (mismatch) throw new HttpsError('already-exists', 'El identificador ya tiene otra reserva de comisión.');
  throw new HttpsError('failed-precondition', 'Firebase no confirmó la reserva de comisión del agente.');
}

async function updateAgentCommissionReservation(accountKey, operationId, status) {
  const ref = root().child('users').child(accountKey);
  let missing = false;
  let invalid = false;
  const tx = await safeTransaction(ref, user => {
    if (!user || typeof user !== 'object') { missing = true; return; }
    const reservations = { ...(user.commissionWithdrawalReservations || {}) };
    const reservation = reservations[operationId];
    if (!reservation) { missing = true; return; }
    if (reservation.status === status) return user;
    if (reservation.status !== 'RESERVED') {
      invalid = true;
      return;
    }
    if (status === 'RELEASED') {
      const before = P.money(reservation.currency === 'HTG'
        ? (user.commissionHTG ?? user.commissionAccruedHTG ?? 0)
        : (user.commissionDOP ?? user.commission ?? user.commissionAccrued ?? 0));
      const after = P.money(before + P.money(reservation.amount));
      const next = setCommission(user, reservation.currency, after);
      next.commissionWithdrawalReservations = {
        ...reservations,
        [operationId]: { ...reservation, status, releasedAt: now(), releaseBefore: before, releaseAfter: after }
      };
      return next;
    }
    if (status === 'SETTLED') {
      return {
        ...user,
        commissionWithdrawalReservations: {
          ...reservations,
          [operationId]: { ...reservation, status, settledAt: now() }
        }
      };
    }
    throw new HttpsError('invalid-argument', 'El estado de reserva de comisión no es válido.');
  });
  const fresh = tx && tx.snapshot && tx.snapshot.val();
  const reservation = fresh && fresh.commissionWithdrawalReservations && fresh.commissionWithdrawalReservations[operationId];
  if (reservation && reservation.status === status) return reservation;
  if (missing) throw new HttpsError('not-found', 'No se encontró la reserva de comisión del agente.');
  if (invalid) throw new HttpsError('failed-precondition', 'La reserva de comisión ya fue finalizada y no se puede volver a cambiar.');
  throw new HttpsError('failed-precondition', 'Firebase no confirmó el cierre de la reserva de comisión.');
}

async function requestCommissionWithdrawal(request) {
  const actor = await loadActor(request);
  if (actor.role !== 'agent') {
    throw new HttpsError('permission-denied', 'Solo un agente puede solicitar un retiro de comisión desde este módulo.');
  }
  const payload = request.data && request.data.operation && typeof request.data.operation === 'object'
    ? request.data.operation : (request.data || {});
  const amount = amountFrom(payload);
  const currencyValue = String(payload.currency || payload.balanceCurrency || 'DOP').toUpperCase();
  const currency = ['HTG', 'GDES'].includes(currencyValue) ? 'HTG' :
    ['DOP', 'RD$', 'RD', 'PESO', 'PESOS'].includes(currencyValue) ? 'DOP' : null;
  if (!currency) throw new HttpsError('invalid-argument', 'La moneda debe ser DOP o HTG.');
  const id = String(payload.idempotencyKey || payload.id || ('COM-' + now() + '-' + Math.random().toString(36).slice(2, 9)));
  if (!id || id.length > 180 || hasInvalidRtdbKey(id)) throw new HttpsError('invalid-argument', 'El identificador del retiro de comisión no es válido.');
  const opRef = root().child('commissions').child(id);
  const existing = await opRef.once('value');
  if (existing.exists()) {
    const old = existing.val() || {};
    if (old.accountingType === 'COMISION_RETIRO' && old.createdByAuthUid === actor.uid &&
        P.money(old.amount) === amount && old.currency === currency) {
      return { id, status: old.status || 'Pendiente', alreadyExists: true, amount, currency };
    }
    throw new HttpsError('already-exists', 'El identificador ya se utilizó para otra operación.');
  }
  const profile = actor.profile;
  const record = {
    id, operationId: id, type: 'Retiro de comisión', category: 'Retiro de comisión',
    route: 'Retiro de comisión', routeFull: 'Retiro de comisión', method: 'Comisión',
    amount, currency, balanceCurrency: currency, commission: 0, commissionTotal: 0, commissionRate: 0,
    commissionSplit: 'SIN REPARTO', commissionBeneficiary: 'AGENTE',
    userId: actor.key, ownerId: actor.key, ownerLegacyId: actor.key, targetUserId: actor.key,
    ownerUid: actor.uid, ownerRole: 'agente', ownerName: String(profile.displayName || profile.name || profile.nombre || actor.email),
    ownerPhone: String(profile.phone || profile.telefono || ''),
    balanceAccountUserId: 'admin', balanceDebitAmount: amount,
    createdByRole: 'agente', createdByUserId: actor.key, createdByAuthUid: actor.uid,
    createdByName: String(profile.displayName || profile.name || actor.email),
    createdAt: now(), createdAtMs: now(), timestamp: now(),
    status: 'RESERVANDO', estado: 'reservando',
    balanceDebited: false, balanceSettled: false, balanceRefunded: false,
    commissionReserved: true, commissionReservationId: id, accountingType: 'COMISION_RETIRO',
    adminVisible: true, adminInbox: true
  };
  const createTx = await safeTransaction(opRef, current => current || record);
  const created = createTx && createTx.snapshot && createTx.snapshot.val();
  if (!created) throw new HttpsError('internal', 'No se pudo crear la solicitud de retiro de comisión.');
  if (!createTx.committed && (created.createdByAuthUid !== actor.uid || created.accountingType !== 'COMISION_RETIRO')) {
    throw new HttpsError('already-exists', 'El identificador ya pertenece a otra operación.');
  }
  try {
    await reserveAgentCommission(actor.key, id, amount, currency);
    await opRef.update({ status: 'Pendiente', estado: 'pendiente', commissionReserved: true, reservedAt: now() });
  } catch (error) {
    await updateAgentCommissionReservation(actor.key, id, 'RELEASED').catch(() => {});
    await opRef.remove().catch(() => {});
    throw error;
  }
  await notifyReviewers(actor.users, actor, record, 'commissions', id).catch(error => console.error('Notificación de retiro de comisión falló', error));
  await appendNotification(actor.key, 'Retiro de comisión pendiente', 'Tu solicitud de retiro de comisión quedó pendiente de revisión. No tienes un balance separado; el pago se procesará contra el balance compartido de la administración al aprobar.', 'commissions', id).catch(error => console.error('Notificación al agente falló', error));
  await writeAuditOnce(id, 'RETIRO_COMISION_CREADO', actor, record, 'commissions', { amount, currency, balanceAccountUserId: 'admin' }).catch(error => console.error('Auditoría de retiro de comisión falló', error));
  return { id, status: 'Pendiente', collection: 'commissions', amount, currency, commissionReserved: true };
}

async function writeAuditOnce(id, action, actor, operation, collection, extras = {}) {
  const auditId = String(id) + '-' + String(action).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const record = {
    id: auditId, operationId: String(id), sourceCollection: String(collection),
    action, targetUserId: String(operation.userId || ''), createdByAuthUid: actor.uid,
    createdByUserId: actor.key, createdByRole: actor.role, createdAt: now(), ...extras
  };
  const ref = root().child('audit').child(auditId);
  await safeTransaction(ref, current => current || record);
}
async function buildReceipt(id, record, collection, amount, currency, commission, actor) {
  const receiptId = String(record.receiptId || ('SW-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '-' + id.slice(-5)));
  const date = new Date().toLocaleDateString('es-DO');
  const time = new Date().toLocaleTimeString('es-DO');
  return {
    id: receiptId, date, time, business: 'SENDWAYO EXPRESS',
    concept: record.type || record.category || collection,
    type: record.type || record.category || collection,
    route: record.routeFull || record.route || '',
    amount, net: P.money(amount - commission), currency,
    remitente: record.ownerName || record.remitente || '',
    remitentePhone: record.ownerPhone || record.telefono || '',
    beneficiario: record.beneficiary || record.beneficiario || '',
    beneficiarioPhone: record.beneficiaryPhone || '',
    collection, status: 'Aprobado', authorizedByUid: actor.uid,
    authorizedByCode: actor.profile.code || actor.profile.staffId || actor.key
  };
}
async function createOperation(request) {
  const actor = await loadActor(request);
  const source = request.data && request.data.operation && typeof request.data.operation === 'object'
    ? request.data.operation : (request.data || {});
  const amount = amountFrom(source);
  const collection = getCollection(source);
  const deposit = P.isDeposit(collection);
  const requestedKey = source.targetUserId || source.ownerId || source.remitenteId || source.userId || '';
  let ownerKey;
  if (actor.role === 'remitente') ownerKey = actor.key;
  else if (deposit && !requestedKey) ownerKey = 'admin';
  else ownerKey = keyForTarget(actor.users, requestedKey) || (requestedKey ? null : actor.key);
  if (!ownerKey || !actor.users[ownerKey] && ownerKey !== 'admin') throw new HttpsError('not-found', 'No se encontró el destinatario de la operación.');
  let ownerProfile = actor.users[ownerKey] || (ownerKey === 'admin' ? { role: 'admin', name: 'ADMIN', active: true } : null);
  if (!ownerProfile) throw new HttpsError('not-found', 'El destinatario no tiene perfil.');
  if (actor.role === 'agent' && ownerKey !== actor.key && roleOf(ownerProfile) !== 'remitente') {
    throw new HttpsError('permission-denied', 'Un agente solo puede operar para un remitente o registrar una operación propia.');
  }
  if (actor.role === 'remitente' && ownerKey !== actor.key) throw new HttpsError('permission-denied', 'Un remitente solo puede operar sobre su propia cuenta.');
  if (ownerKey !== 'admin' && !activeProfile(ownerProfile)) throw new HttpsError('failed-precondition', 'El destinatario no está activo.');
  const currency = P.currencyFor(source, collection);
  const fee = P.commissionFor({ ...source, type: source.type || source.category || (collection === 'accountWithdrawals' ? 'Retiro' : '') }, collection, amount);
  const grossDebit = deposit ? 0 : P.money(amount + fee);
  const financialAccountKey = actor.role === 'remitente' ? actor.key : 'admin';
  const financialAccount = actor.users[financialAccountKey];
  if (!deposit && !financialAccount) throw new HttpsError('failed-precondition', 'No existe el balance operativo de la administración o del remitente.');
  const id = String(source.idempotencyKey || source.id || ('SW-' + now() + '-' + Math.random().toString(36).slice(2, 9)));
  if (!id || id.length > 180 || /[.#$\[\]/]/.test(id)) throw new HttpsError('invalid-argument', 'El identificador de la operación no es válido.');
  const saved = await root().child(collection).child(id).once('value');
  if (saved.exists()) {
    const old = saved.val() || {};
    if (old.createdByAuthUid === actor.uid && P.money(old.amount) === amount && String(old.userId) === ownerKey) {
      return { id, status: old.status || 'Pendiente', alreadyExists: true };
    }
    throw new HttpsError('already-exists', 'El identificador ya se utilizó para otra operación.');
  }
  const record = {
    id, operationId: id, type: String(source.type || source.category || (deposit ? 'Depósito' : collection === 'accountWithdrawals' ? 'Retiro' : 'Envío')),
    category: String(source.category || source.type || (deposit ? 'Depósito' : collection === 'accountWithdrawals' ? 'Retiro' : 'Envío')),
    route: String(source.route || source.routeFull || ''), routeFull: String(source.routeFull || source.route || ''),
    method: String(source.method || source.provider || ''), provider: String(source.provider || source.method || ''),
    amount, currency, balanceCurrency: currency, commission: fee, commissionTotal: fee,
    commissionRate: deposit ? 0 : (P.isService(source) ? 0.05 : P.usesHaitiWalletTable(source) ? null : 0.08),
    commissionSplit: deposit ? 'NINGUNO' : actor.role === 'remitente' ? '50/50' : '100% PLATAFORMA',
    commissionBeneficiary: deposit ? 'NINGUNO' : actor.role === 'remitente' ? 'REMITENTE_Y_ADMIN' : 'PLATAFORMA',
    userId: ownerKey, ownerId: ownerKey, ownerLegacyId: ownerKey,
    ownerUid: String(ownerProfile.authUid || ownerProfile.uid || (ownerKey === actor.key ? actor.uid : '')),
    ownerRole: canonicalRole(ownerKey === 'admin' ? 'admin' : roleOf(ownerProfile)), ownerName: String(ownerProfile.displayName || ownerProfile.name || ownerProfile.nombre || source.ownerName || source.remitente || (ownerKey === 'admin' ? 'ADMIN' : '')),
    ownerPhone: String(ownerProfile.phone || ownerProfile.telefono || source.ownerPhone || ''),
    targetUserId: ownerKey,
    balanceAccountUserId: financialAccountKey,
    balanceDebitAmount: grossDebit,
    createdByRole: canonicalRole(actor.role), createdByUserId: actor.key,
    createdByAuthUid: actor.uid, createdByName: String(actor.profile.displayName || actor.profile.name || actor.email || ''),
    createdAt: now(), createdAtMs: now(), timestamp: now(),
    status: 'RESERVANDO', estado: 'reservando', balanceDebited: false,
    balanceSettled: false, balanceRefunded: false, adminVisible: true, adminInbox: true,
    accountingType: deposit ? 'DEPOSITO_CAPITAL' : 'COMERCIAL',
    beneficiary: String(source.beneficiary || source.beneficiario || ''),
    beneficiaryPhone: String(source.beneficiaryPhone || source.beneficiarioPhone || ''),
    accountId: String(source.accountId || source.bankAccountId || ''),
    bankAccountId: String(source.bankAccountId || source.accountId || ''),
    originalReference: String(source.reference || source.referencia || '')
  };
  const opRef = root().child(collection).child(id);
  const createTx = await safeTransaction(opRef, current => current || record);
  const created = createTx && createTx.snapshot && createTx.snapshot.val();
  if (!created) throw new HttpsError('internal', 'No se pudo crear la operación.');
  if (!createTx.committed && created.createdByAuthUid !== actor.uid) throw new HttpsError('already-exists', 'El identificador ya pertenece a otra operación.');
  if (!deposit && !created.balanceDebited) {
    try {
      await reserveBalance(financialAccountKey, id, grossDebit, currency, collection);
      await opRef.update({ balanceDebited: true, balanceReservationId: id, balanceDebitAmount: grossDebit, status: 'Pendiente', estado: 'pendiente', reservedAt: now() });
    } catch (error) {
      await refundBalance(financialAccountKey, id, grossDebit, currency).catch(refundError => console.error('[SENDWAYO] No se pudo revertir una reserva fallida:', refundError));
      await opRef.remove().catch(() => {});
      throw error;
    }
  } else if (deposit) {
    await opRef.update({ status: 'Pendiente', estado: 'pendiente', commission: 0, commissionTotal: 0, commissionRate: 0 });
  }
  await notifyReviewers(actor.users, actor, record, collection, id).catch(error => console.error('Notificación de revisión falló', error));
  if (actor.role === 'remitente') await addOwnerNotification(record, collection, id, 'Tu operación quedó pendiente de revisión. Los fondos están reservados si la operación requiere balance.').catch(error => console.error('Notificación al remitente falló', error));
  await writeAuditOnce(id, 'CREADA_PENDIENTE', actor, record, collection, { amount, currency, balanceAccountUserId: financialAccountKey }).catch(error => console.error('Auditoría de creación falló', error));
  return { id, status: 'Pendiente', collection, amount, currency, commission: fee, balanceDebited: !deposit };
}
async function reviewOperation(request) {
  const actor = await loadActor(request);
  const id = String((request.data && (request.data.operationId || request.data.id)) || '').trim();
  const action = P.normalizeAction(request.data && (request.data.action || request.data.status));
  if (!action) throw new HttpsError('invalid-argument', 'Selecciona Aprobado, Rechazado o No coincide.');
  const found = await getOperation(id);
  const { collection } = found;
  const commissionWithdrawal = P.isCommissionWithdrawal(collection, found.record);
  const initialStatus = P.normalizeText(found.record.status || found.record.estado || 'Pendiente');
  if (!['pendiente', 'reserving', 'reservando'].includes(initialStatus)) {
    if (initialStatus === P.normalizeText(action)) {
      return { id, status: action, alreadyProcessed: true };
    }
    throw new HttpsError('failed-precondition', 'Esta operación ya fue procesada. Actualiza la lista antes de intentarlo otra vez.');
  }
  if (!['envios', 'recargas', 'paqueticos', 'pagos', 'paquetes', 'deposits', 'accountWithdrawals'].includes(collection) && !commissionWithdrawal) {
    throw new HttpsError('failed-precondition', 'Este tipo de registro requiere un procedimiento administrativo específico y no se puede liquidar desde la cola general.');
  }
  const decision = P.canReview({ actorRole: actor.role, actorUid: actor.uid, actorKey: actor.key, operation: found.record, collection, action });
  if (!decision.allowed) throw new HttpsError('permission-denied', decision.reason);
  const reason = String(request.data.reason || '').trim() || (action === 'Rechazado' ? 'Rechazado tras revisión' : action === 'No Coincide' ? 'Requiere corrección' : '');
  const opRef = found.ref;
  let alreadyFinal = false;
  let lockedRecord = null;
  const lockTx = await safeTransaction(opRef, current => {
    if (!current) return;
    const status = P.normalizeText(current.status || current.estado || 'Pendiente');
    const retryingSameAction = status === 'procesando' &&
      current.recoveryRequired === true &&
      P.normalizeAction(current.recoveryAction) === action;
    if (retryingSameAction) {
      lockedRecord = {
        ...current, status: 'Procesando', estado: 'procesando',
        processingReviewByAuthUid: actor.uid, processingReviewByUserId: actor.key,
        processingReviewAt: now(), processingReviewAction: action,
        recoveryRequired: false, recoveryStartedAt: now()
      };
      return lockedRecord;
    }
    if (!['pendiente', 'reserving', 'reservando'].includes(status)) {
      if (status === P.normalizeText(action)) alreadyFinal = true;
      return;
    }
    lockedRecord = {
      ...current, status: 'Procesando', estado: 'procesando',
      processingReviewByAuthUid: actor.uid, processingReviewByUserId: actor.key,
      processingReviewAt: now(), processingReviewAction: action, recoveryRequired: false
    };
    return lockedRecord;
  });
  if (!lockTx) throw new HttpsError('failed-precondition', 'No se pudo bloquear la operación para su revisión.');
  if (!lockTx.committed && alreadyFinal) return { id, status: action, alreadyProcessed: true };
  if (!lockTx.snapshot || !lockTx.snapshot.exists()) throw new HttpsError('not-found', 'La operación desapareció antes de revisarla.');
  if (!lockTx.committed) {
    const fresh = lockTx.snapshot.val() || {};
    if (P.normalizeText(fresh.status || fresh.estado) === P.normalizeText(action)) return { id, status: action, alreadyProcessed: true };
    throw new HttpsError('failed-precondition', 'La operación ya se está procesando o ya fue revisada.');
  }
  const record = lockTx.snapshot.val() || lockedRecord || found.record;
  const amount = amountFrom(record);
  const currency = P.currencyFor(record, collection);
  const fee = (P.isDeposit(collection) || commissionWithdrawal) ? 0 : P.commissionFor(record, collection, amount);
  const financialAccountKey = commissionWithdrawal ? 'admin' : String(record.balanceAccountUserId || ((P.normalizeRole(record.createdByRole) === 'agent' || P.normalizeRole(record.createdByRole) === 'admin') ? 'admin' : (record.userId || '')));
  let financialCommitStarted = false;
  let balanceDebitedFinal = !!record.balanceDebited;
  let balanceWasRefunded = !!record.balanceRefunded;
  try {
    if (action === 'Aprobado') {
      if (P.isDeposit(collection)) {
        if (actor.role !== 'admin') throw new HttpsError('permission-denied', 'Solo el administrador puede aprobar depósitos.');
        const ownerKey = String(record.userId || record.targetUserId || '');
        if (!ownerKey) throw new HttpsError('failed-precondition', 'El depósito no tiene destinatario.');
        financialCommitStarted = true;
        await creditDeposit(id, ownerKey, amount, currency);
      } else if (commissionWithdrawal) {
        const ownerKey = String(record.createdByUserId || record.userId || '');
        if (!ownerKey) throw new HttpsError('failed-precondition', 'El retiro de comisión no tiene agente titular.');
        const adminSnap = await root().child('users').child('admin').once('value');
        const adminProfile = adminSnap.val() || actor.users.admin || {};
        const available = balanceState(adminProfile, currency);
        if (!Number.isFinite(available) || available < amount) {
          throw new HttpsError('failed-precondition', 'Balance insuficiente de la administración en ' + currency + '. El retiro sigue pendiente; no se descontó nada.');
        }
        financialCommitStarted = true;
        try {
          await debitLegacyBalance('admin', id, amount, currency);
        } catch (error) {
          // La función de débito revierte sin escribir cuando el balance resulta
          // insuficiente por una operación concurrente; eso no requiere recuperación.
          if (String(error.message || '').includes('Balance insuficiente en ')) financialCommitStarted = false;
          throw error;
        }
        await updateAgentCommissionReservation(ownerKey, id, 'SETTLED');
        balanceDebitedFinal = true;
      } else {
        const reservation = financialAccountKey ? await root().child('users').child(financialAccountKey).child('balanceReservations').child(id).once('value') : null;
        const reservationData = reservation && reservation.val();
        if (reservationData && reservationData.status === 'RESERVED') {
          financialCommitStarted = true;
          await updateReservationStatus(financialAccountKey, id, 'SETTLED');
          balanceDebitedFinal = true;
        } else if (!record.balanceDebited || (reservationData && reservationData.status === 'REFUNDED')) {
          financialCommitStarted = true;
          const settlementId = reservationData && reservationData.status === 'REFUNDED' ? id + '-reapproved' : id;
          await debitLegacyBalance(financialAccountKey, settlementId, P.money(amount + fee), currency);
          balanceDebitedFinal = true;
        } else {
          balanceDebitedFinal = true;
        }
      }
      const creatorRole = P.normalizeRole(record.createdByRole);
      const senderKey = String(record.createdByUserId || '');
      const senderShare = creatorRole === 'remitente' ? P.money(fee / 2) : 0;
      const adminShare = P.money(fee - senderShare);
      if (senderShare > 0 && senderKey && actor.users[senderKey]) await creditCommission(senderKey, id, senderShare, currency, false);
      if (adminShare > 0) await creditCommission('admin', id, adminShare, currency, true);
    } else {
      if (commissionWithdrawal) {
        const ownerKey = String(record.createdByUserId || record.userId || '');
        if (!ownerKey) throw new HttpsError('failed-precondition', 'El retiro de comisión no tiene agente titular.');
        financialCommitStarted = true;
        await updateAgentCommissionReservation(ownerKey, id, 'RELEASED');
      } else if (!P.isDeposit(collection) && record.balanceDebited) {
        financialCommitStarted = true;
        const returned = await refundBalance(financialAccountKey, id, P.money(record.balanceDebitAmount || (amount + fee)), currency, true);
        if (returned) {
          balanceWasRefunded = true;
          balanceDebitedFinal = false;
          await opRef.update({ balanceDebited: false, balanceRefunded: true, balanceRefundedAt: now() });
        }
      }
    }
    const reviewedAt = now();
    const finalPatch = {
      status: action, estado: action.toLowerCase(), reviewedAt, approvedAt: action === 'Aprobado' ? reviewedAt : null,
      reviewedBy: actor.profile.username || actor.profile.name || actor.email || actor.key,
      reviewedByName: actor.profile.displayName || actor.profile.name || actor.email || actor.key,
      reviewedByAuthUid: actor.uid, reviewedByUserId: actor.key, reviewReason: reason,
      commissionTotal: action === 'Aprobado' ? fee : 0, commissionUser: action === 'Aprobado' && P.normalizeRole(record.createdByRole) === 'remitente' ? P.money(fee / 2) : 0,
      commissionAdmin: action === 'Aprobado' ? P.money(fee - (P.normalizeRole(record.createdByRole) === 'remitente' ? P.money(fee / 2) : 0)) : 0,
      balanceSettled: action === 'Aprobado', balanceSettledAt: action === 'Aprobado' ? reviewedAt : null,
      balanceDebited: action === 'Aprobado' ? balanceDebitedFinal : false,
      balanceRefunded: action !== 'Aprobado' && (balanceWasRefunded || !!record.balanceDebited),
      balanceRefundedAt: action === 'Aprobado' ? (record.balanceRefundedAt || null) : (balanceWasRefunded ? (record.balanceRefundedAt || reviewedAt) : null),
      ...(commissionWithdrawal ? {
        commissionReserved: false,
        commissionPaid: action === 'Aprobado',
        commissionReleased: action !== 'Aprobado',
        commissionReservationFinalizedAt: reviewedAt
      } : {}),
      manualReview: true
    };
    if (action === 'Aprobado') {
      finalPatch.receiptId = record.receiptId || ('SW-' + new Date(reviewedAt).toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '-' + id.slice(-5));
      finalPatch.receipt = await buildReceipt(id, { ...record, receiptId: finalPatch.receiptId }, collection, amount, currency, fee, actor);
    }
    // Escribir primero el apunte contable idempotente. Si el siguiente update de la
    // operación falla, el estado quedará en recuperación y podrá reintentarse la
    // misma acción sin crear otro débito ni un segundo asiento.
    if (action === 'Aprobado') {
      const ledgerRef = root().child('ledger').child(id);
      await safeTransaction(ledgerRef, current => current || ({
        id, recordId: id, sourceCollection: collection, sourceId: id, ledgerLocked: true,
        ledgerEvent: 'APROBACION', userId: record.userId || '', balanceAccountUserId: financialAccountKey,
        amount, currency, commission: fee, commissionUser: finalPatch.commissionUser, commissionAdmin: finalPatch.commissionAdmin,
        balanceDebit: record.balanceDebitAmount || P.money(amount + fee), reviewedByAuthUid: actor.uid, createdAt: reviewedAt
      }));
    }
    await opRef.update(finalPatch);
    await writeAuditOnce(id, action.toUpperCase(), actor, record, collection, { amount, currency, commission: fee, reason }).catch(error => console.error('Auditoría de revisión falló', error));
    const note = action === 'Aprobado' ? 'Tu operación fue aprobada. El comprobante ya está disponible.' : action === 'Rechazado' ? 'Tu operación fue rechazada. Los fondos reservados se devolvieron si correspondía.' : 'Tu operación quedó No coincide. Los fondos reservados se liberaron para que puedas corregirla y reenviarla.';
    await addOwnerNotification(record, collection, id, note).catch(error => console.error('Notificación de revisión falló', error));
    if (record.createdByUserId && record.createdByUserId !== record.userId) {
      await appendNotification(record.createdByUserId, 'Estado de operación actualizado', 'La operación ' + id + ' quedó ' + action + '.', collection, id).catch(error => console.error('Notificación al creador falló', error));
    }
    return { id, status: action, receiptId: finalPatch.receiptId || null };
  } catch (error) {
    // Si cualquier marcador de saldo ya pudo haberse aplicado, no volver a
    // Pendiente con otra decisión posible. Guardar la acción y requerir un
    // reintento de la MISMA acción para que los marcadores idempotentes reparen.
    await safeTransaction(opRef, current => {
      if (!current || current.status !== 'Procesando' || current.processingReviewByAuthUid !== actor.uid) return;
      const next = { ...current, lastReviewError: String(error.message || 'Error de revisión'), lastReviewErrorAt: now() };
      if (financialCommitStarted) {
        next.status = 'Procesando';
        next.estado = 'procesando';
        next.recoveryRequired = true;
        next.recoveryAction = action;
      } else {
        next.status = 'Pendiente';
        next.estado = 'pendiente';
        delete next.processingReviewByAuthUid;
        delete next.processingReviewByUserId;
        delete next.processingReviewAt;
        delete next.processingReviewAction;
        delete next.recoveryRequired;
        delete next.recoveryAction;
      }
      return next;
    }).catch(() => {});
    throw asHttpsError(error, financialCommitStarted
      ? 'La revisión requiere recuperación segura. Repite la misma decisión; no elijas otra acción mientras esté en Procesando.'
      : 'No se confirmó la revisión. La operación volvió a Pendiente.');
  }
}

async function listDirectory(request) {
  const actor = await loadActor(request);
  if (!['admin', 'agent'].includes(actor.role)) {
    throw new HttpsError('permission-denied', 'Solo administración y agentes pueden consultar el directorio de trabajo.');
  }
  const profiles = Object.entries(actor.users || {}).map(([key, row]) => {
    row = row && typeof row === 'object' ? row : {};
    const role = roleOf(row);
    const name = String(row.displayName || row.name || row.nombre || row.username || row.email || key);
    return {
      id: String(row.id || row.legacyId || key),
      legacyId: String(row.legacyId || row.id || key),
      accountId: String(row.accountId || row.id || key),
      uid: String(row.authUid || row.uid || ''),
      code: String(row.code || ''),
      staffId: String(row.staffId || ''),
      name,
      displayName: name,
      firstName: String(row.firstName || row.nombre || name.split(/\s+/)[0] || name),
      lastName: String(row.lastName || name.split(/\s+/).slice(1).join(' ')),
      email: String(row.email || row.authEmail || ''),
      phone: String(row.phone || row.telefono || row.cellphone || ''),
      country: String(row.country || row.pais || ''),
      role: String(row.role || row.rol || ''),
      status: String(row.status || 'active'),
      active: activeProfile(row)
    };
  }).filter(row => row.active && ['agent', 'remitente'].includes(roleOf(row)));
  return { profiles };
}

async function deleteRejectedOperation(request) {
  const actor = await loadActor(request);
  if (actor.role !== 'admin') throw new HttpsError('permission-denied', 'Solo el administrador puede eliminar operaciones rechazadas.');
  const id = String((request.data && (request.data.operationId || request.data.id)) || '').trim();
  const found = await getOperation(id);
  if (!['envios', 'recargas', 'paqueticos', 'pagos', 'paquetes', 'deposits', 'accountWithdrawals'].includes(found.collection)) {
    throw new HttpsError('failed-precondition', 'Este registro no puede eliminarse desde la cola general.');
  }
  if (!['rechazado', 'rejected'].includes(P.normalizeText(found.record.status || found.record.estado))) {
    throw new HttpsError('failed-precondition', 'Solo se pueden eliminar operaciones rechazadas. Las pendientes, aprobadas o No coincide se conservan.');
  }
  await writeAuditOnce(id, 'ELIMINADA_OPERACION_RECHAZADA', actor, found.record, found.collection, {
    amount: P.money(found.record.amount || found.record.monto || 0),
    currency: String(found.record.currency || found.record.balanceCurrency || 'DOP')
  });
  await found.ref.remove();
  return { id, collection: found.collection, deleted: true };
}

exports.listDirectory = onCall(async request => {
  try { return await listDirectory(request); }
  catch (error) { throw asHttpsError(error, 'No se pudo consultar el directorio de trabajo.'); }
});
exports.deleteRejectedOperation = onCall(async request => {
  try { return await deleteRejectedOperation(request); }
  catch (error) { throw asHttpsError(error, 'No se pudo eliminar la operación rechazada.'); }
});
exports.requestCommissionWithdrawal = onCall(async request => {
  try { return await requestCommissionWithdrawal(request); }
  catch (error) { throw asHttpsError(error, 'No se pudo registrar la solicitud de retiro de comisión.'); }
});

exports.submitOperation = onCall(async request => {
  try { return await createOperation(request); }
  catch (error) { throw asHttpsError(error, 'No se pudo registrar la operación. No se confirmó ninguna acción que no aparezca guardada en Firebase.'); }
});
async function resubmitOperation(request) {
  const actor = await loadActor(request);
  const payload = request.data || {};
  const oldId = String(payload.operationId || payload.id || '').trim();
  const found = await getOperation(oldId);
  if (P.normalizeText(found.record.status || found.record.estado) !== 'no coincide') {
    throw new HttpsError('failed-precondition', 'Solo se puede corregir una operación marcada No coincide.');
  }
  const isAdmin = actor.role === 'admin';
  if (!isAdmin && actor.key !== String(found.record.userId || '') && actor.key !== String(found.record.createdByUserId || '')) {
    throw new HttpsError('permission-denied', 'No tienes permiso para corregir esta operación.');
  }
  const changes = payload.operation && typeof payload.operation === 'object' ? payload.operation : (payload.changes || {});
  const nextId = String(payload.newOperationId || ('SW-' + now() + '-' + Math.random().toString(36).slice(2, 9)));
  const nextData = {
    ...changes,
    id: nextId,
    idempotencyKey: nextId,
    type: changes.type || found.record.type || found.record.category,
    category: changes.category || found.record.category || found.record.type,
    targetUserId: isAdmin ? (changes.targetUserId || found.record.userId) : found.record.userId,
    userId: found.record.userId,
    resubmittedFrom: oldId
  };
  const result = await createOperation({ auth: request.auth, data: { operation: nextData } });
  await found.ref.update({ resubmittedTo: result.id, resubmittedAt: now() });
  await writeAuditOnce(oldId, 'REENVIADA_CORREGIDA', actor, found.record, found.collection, { resubmittedTo: result.id });
  return { ...result, resubmittedFrom: oldId };
}

exports.reviewOperation = onCall(async request => {
  try { return await reviewOperation(request); }
  catch (error) { throw asHttpsError(error, 'No se pudo revisar la operación. Comprueba el estado actualizado antes de volver a intentarlo.'); }
});
exports.resubmitOperation = onCall(async request => {
  try { return await resubmitOperation(request); }
  catch (error) { throw asHttpsError(error, 'No se pudo reenviar la operación corregida.'); }
});
