'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const crypto = require('node:crypto');
const domain = require('./domain');

admin.initializeApp();
const db = admin.firestore();
const FV = admin.firestore.FieldValue;
const REGION = 'us-central1';
const SYSTEM_OPERATIONS_ID = 'operations';
const SYSTEM_ADMIN_ID = 'admin';
const BOOTSTRAP_ADMIN_EMAILS = new Set(['sendwayoexpress@gmail.com']);

function fail(code, message) { throw new functions.https.HttpsError(code, message); }
function cleanId(value) {
  const id = String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 120);
  return id || '';
}
function text(value, max = 240) { return String(value ?? '').trim().slice(0, max); }
function moneyField(currencyCode, type) {
  const prefix = type === 'commission' ? 'commission' : 'balance';
  return `${prefix}${currencyCode}`;
}
function currencyLabel(code) { return code === 'HTG' ? 'HTG' : 'RD$'; }
function operationStatus(doc) { return String(doc.status || doc.estado || '').toLowerCase(); }
function isApproved(doc) { return ['approved', 'aprobado', 'pagado'].includes(operationStatus(doc)); }
function mapAction(value) {
  const s = String(value || '').trim().toLowerCase();
  if (['approve', 'approved', 'aprobar', 'aprobado'].includes(s)) return 'Aprobado';
  if (['reject', 'rejected', 'rechazar', 'rechazado'].includes(s)) return 'Rechazado';
  if (['no_match', 'nomatch', 'no coincide', 'no_coincide'].includes(s)) return 'No Coincide';
  fail('invalid-argument', 'La decisión debe ser Aprobar, Rechazar o No Coincide.');
}
function requireAuth(context) {
  const uid = context?.auth?.uid;
  if (!uid) fail('unauthenticated', 'Inicia sesión con Firebase Authentication.');
  return uid;
}
async function getProfile(uid) {
  const snap = await db.collection('profiles').doc(uid).get();
  if (!snap.exists) fail('permission-denied', 'La cuenta no tiene perfil SENDWAYO. Solicita la vinculación o aprobación del administrador.');
  return { ...snap.data(), uid };
}
async function requireProfile(context) {
  const uid = requireAuth(context);
  const profile = await getProfile(uid);
  const role = domain.normalizeRole(profile.role);
  if (!role || !['active', 'approved', 'aprobado', 'activo'].includes(String(profile.status || '').toLowerCase())) {
    fail('permission-denied', 'El perfil SENDWAYO todavía no está aprobado o activo.');
  }
  return { ...profile, uid, role };
}
async function requireAdmin(context) {
  const profile = await requireProfile(context);
  if (profile.role !== 'admin') fail('permission-denied', 'Solo el administrador puede realizar esta acción.');
  return profile;
}
async function listAdminUids() {
  const roleVariants = ['admin', 'Administrador', 'administrador'];
  const results = await Promise.all(roleVariants.map(role => db.collection('profiles').where('role', '==', role).get()));
  const docs = results.flatMap(snap => snap.docs);
  return [...new Set(docs.filter(d => domain.normalizeRole(d.data().role) === 'admin'
    && ['active', 'approved', 'aprobado', 'activo'].includes(String(d.data().status || '').toLowerCase())).map(d => d.id))];
}
async function listAgentUids() {
  const roleVariants = ['agent', 'Agente', 'agente'];
  const results = await Promise.all(roleVariants.map(role => db.collection('profiles').where('role', '==', role).get()));
  const docs = results.flatMap(snap => snap.docs);
  return [...new Set(docs.filter(d => domain.normalizeRole(d.data().role) === 'agent'
    && ['active', 'approved', 'aprobado', 'activo'].includes(String(d.data().status || '').toLowerCase())).map(d => d.id))];
}
async function resolveProfile(identifier) {
  const key = text(identifier, 140);
  if (!key) return null;
  const direct = await db.collection('profiles').doc(key).get();
  if (direct.exists) return { uid: direct.id, ...direct.data() };
  for (const field of ['legacyId', 'accountId', 'code', 'phone', 'email', 'username']) {
    const snap = await db.collection('profiles').where(field, '==', key).limit(1).get();
    if (!snap.empty) return { uid: snap.docs[0].id, ...snap.docs[0].data() };
  }
  return null;
}
function notifyRef(uid, id) {
  return db.collection('notifications').doc(uid).collection('items').doc(cleanId(id));
}
function addNotices(transaction, uids, id, values) {
  const unique = [...new Set((uids || []).filter(Boolean))];
  for (const uid of unique) {
    transaction.set(notifyRef(uid, `${id}-${uid}`), {
      id: `${id}-${uid}`,
      ...values,
      read: false,
      createdAt: FV.serverTimestamp(),
      createdAtMs: Date.now()
    }, { merge: true });
  }
}
function standardOperationFields(operation, validation, actor, owner, id) {
  const type = text(operation.type || operation.kind || operation.category || 'Envío', 80);
  const route = text(operation.route, 160);
  const routeFull = text(operation.routeFull || operation.route, 220);
  const method = text(operation.method || operation.provider, 100);
  const amount = validation.amount;
  const isDeposit = validation.isDeposit;
  const fee = validation.fee;
  const net = isDeposit ? amount : domain.round2(amount - fee);
  let receivedCurrency = validation.currency;
  let receivedAmount = isDeposit ? amount : net;
  if (domain.isDominicanToHaiti(operation) || domain.isUSAToHaiti(operation)) {
    receivedCurrency = 'HTG';
    receivedAmount = (domain.parseAmount(operation.receivedAmount) || domain.parseAmount(operation.htg));
  } else if (domain.isHaitiToDominican(operation)) {
    receivedCurrency = 'DOP';
    receivedAmount = (domain.parseAmount(operation.receivedAmount) || domain.parseAmount(operation.rd));
  } else if (domain.isHaitiToHaiti(operation)) {
    receivedCurrency = 'HTG';
    receivedAmount = net;
  } else if (operation.receivedAmount != null) {
    receivedAmount = domain.parseAmount(operation.receivedAmount);
  }
  return {
    id,
    type,
    category: text(operation.category || operation.serviceType || type, 80),
    route, routeFull, method,
    amount,
    currency: currencyLabel(validation.currency),
    currencyCode: validation.currency,
    fee,
    net,
    receivedAmount,
    receivedCurrency,
    rate: isDeposit ? 0 : (domain.isHaitiToHaiti(operation) ? null : domain.commissionRate(operation)),
    beneficiary: text(operation.beneficiary || operation.beneficiaryName, 180),
    beneficiaryPhone: text(operation.beneficiaryPhone || operation.phoneBeneficiary, 60),
    cuenta: text(operation.cuenta, 180),
    comprobante: text(operation.comprobante, 300),
    ownerUid: owner.uid,
    ownerRole: owner.role,
    ownerLegacyId: text(owner.legacyId || owner.accountId || owner.code || owner.uid, 140),
    ownerCode: text(owner.code || owner.legacyId || owner.accountId || owner.uid, 140),
    ownerName: text(owner.displayName || owner.name || operation.ownerName || operation.remitente, 180),
    actorUid: actor.uid,
    actorLegacyId: text(actor.legacyId || actor.accountId || actor.code || actor.uid, 140),
    actorCode: text(actor.code || actor.legacyId || actor.accountId || actor.uid, 140),
    sourceUid: owner.role === 'remitente' ? owner.uid : (actor.role === 'agent' ? actor.uid : actor.uid),
    targetUid: owner.role === 'remitente' ? owner.uid : null,
    createdByUid: actor.uid,
    createdByRole: actor.role,
    createdByName: text(actor.displayName || actor.name || actor.email, 180),
    createdAt: FV.serverTimestamp(),
    createdAtMs: Date.now(),
    status: 'Pendiente',
    estado: 'Pendiente',
    reservedAmount: 0,
    settledAt: null,
    receiptId: null,
    idempotencyKey: id
  };
}
function accountDoc(uid) { return db.collection('accounts').doc(uid); }
function systemDoc(id = SYSTEM_OPERATIONS_ID) { return db.collection('systemBalances').doc(id); }
function ledgerDoc(id) { return db.collection('ledger').doc(cleanId(id)); }
function requireOperationId(data) {
  const id = cleanId(data.operationId || data.id || data.transactionId);
  if (!id) fail('invalid-argument', 'Falta el identificador de operación.');
  return id;
}
function safeError(err) {
  if (err instanceof functions.https.HttpsError) return err;
  console.error('[SENDWAYO backend]', err);
  return new functions.https.HttpsError('internal', 'No se pudo completar la operación en el servidor. No se confirmó ningún cambio; vuelve a cargar y verifica su estado.');
}
function callable(handler) {
  return functions.region(REGION).https.onCall(async (data, context) => {
    try { return await handler(data || {}, context); }
    catch (err) { throw safeError(err); }
  });
}

exports.submitRegistration = callable(async (data, context) => {
  const uid = requireAuth(context);
  const email = domain.normalizeEmail(context.auth.token.email || data.email);
  const emailNormalized = email;
  const displayName = text(data.displayName, 180);
  const phone = text(data.phone, 60);
  const phoneNormalized = domain.normalizePhone(phone);
  const username = text(data.username, 60).trim().toLowerCase();
  const requestedRole = domain.normalizeRole(data.requestedRole);
  if (!email || !displayName || !phone || !phoneNormalized || !username) fail('invalid-argument', 'Completa nombre, celular, correo y nombre de usuario.');
  if (!['remitente', 'agent'].includes(requestedRole)) fail('invalid-argument', 'El registro solo permite solicitar rol remitente o agente.');
  const requestRef = db.collection('registrationRequests').doc(uid);
  const profileRef = db.collection('profiles').doc(uid);
  const admins = await listAdminUids();
  await db.runTransaction(async tx => {
    // Complete every read before any writes; Firestore transactions require this ordering.
    const [reqSnap, profileSnap, usernameSnap, emailSnap, oldEmailSnap, phoneSnap, requestEmailSnap, requestPhoneSnap] = await Promise.all([
      tx.get(requestRef), tx.get(profileRef),
      tx.get(db.collection('profiles').where('username', '==', username).limit(10)),
      tx.get(db.collection('profiles').where('emailNormalized', '==', emailNormalized).limit(10)),
      tx.get(db.collection('profiles').where('email', '==', email).limit(10)),
      tx.get(db.collection('profiles').where('phoneNormalized', '==', phoneNormalized).limit(10)),
      tx.get(db.collection('registrationRequests').where('emailNormalized', '==', emailNormalized).limit(10)),
      tx.get(db.collection('registrationRequests').where('phoneNormalized', '==', phoneNormalized).limit(10))
    ]);
    const duplicate = [...usernameSnap.docs, ...emailSnap.docs, ...oldEmailSnap.docs, ...phoneSnap.docs,
      ...requestEmailSnap.docs, ...requestPhoneSnap.docs].find(d => d.id !== uid);
    if (duplicate) fail('already-exists', 'El correo, teléfono o nombre de usuario ya aparece registrado. El administrador debe reconciliar la cuenta antes de crear otra.');
    if (reqSnap.exists && ['Pendiente', 'Aprobado'].includes(String(reqSnap.data().status))) {
      fail('already-exists', 'Ya existe una solicitud de registro para esta cuenta.');
    }
    if (profileSnap.exists && ['active', 'approved', 'aprobado', 'activo'].includes(String(profileSnap.data().status || '').toLowerCase())) {
      fail('already-exists', 'Esta cuenta ya tiene acceso SENDWAYO.');
    }
    const request = { uid, email, emailNormalized, displayName, phone, phoneNormalized, username, requestedRole, status: 'Pendiente', createdAt: FV.serverTimestamp(), createdAtMs: Date.now() };
    tx.set(requestRef, request);
    tx.set(profileRef, { uid, email, emailNormalized, displayName, phone, phoneNormalized, username, role: null, requestedRole, status: 'Pendiente', updatedAt: FV.serverTimestamp() }, { merge: true });
    addNotices(tx, admins, `registration-${uid}`, { type: 'registration', title: 'Nueva solicitud de bienvenida', message: `${displayName} solicita acceso como ${requestedRole}.`, section: 'solicitudes', requestUid: uid });
  });
  return { ok: true, status: 'Pendiente', message: 'Solicitud recibida. Espera la aprobación del administrador.' };
});

exports.resolveOrBootstrapProfile = callable(async (_data, context) => {
  const uid = requireAuth(context);
  const email = domain.normalizeEmail(context.auth.token.email || '');
  if (!email) fail('failed-precondition', 'La cuenta autenticada no tiene un correo disponible.');
  const profileRef = db.collection('profiles').doc(uid);
  const existingSnap = await profileRef.get();
  if (existingSnap.exists) return { ok: true, profile: { uid, ...existingSnap.data() }, created: false };

  const [sameEmailProfiles, exactLegacy, normalizedLegacy] = await Promise.all([
    db.collection('profiles').where('emailNormalized', '==', email).limit(4).get(),
    db.collection('legacyAccounts').where('email', '==', email).limit(10).get(),
    db.collection('legacyAccounts').where('emailNormalized', '==', email).limit(10).get()
  ]);
  const otherProfiles = [...new Map([...sameEmailProfiles.docs].map(d => [d.id, d])).values()].filter(d => d.id !== uid);
  if (otherProfiles.length) {
    fail('already-exists', 'Este correo ya está vinculado a otro perfil SENDWAYO. El administrador debe reconciliarlo para evitar duplicados.');
  }

  if (BOOTSTRAP_ADMIN_EMAILS.has(email)) {
    const legacyAdmins = [...new Map([...exactLegacy.docs, ...normalizedLegacy.docs].map(d => [d.id, d])).values()]
      .filter(d => !d.data().duplicateOf && domain.normalizeRole(d.data().role) === 'admin');
    if (legacyAdmins.length > 1) fail('failed-precondition', 'Hay registros administrativos duplicados; se necesita conciliarlos antes de activar el acceso.');
    const authRecord = await admin.auth().getUser(uid);
    const displayName = text(authRecord.displayName || context.auth.token.name || 'Administración SENDWAYO EXPRESS', 180);
    let created = false;
    await db.runTransaction(async tx => {
      const [fresh, dupEmail, adminSystem] = await Promise.all([
        tx.get(profileRef),
        tx.get(db.collection('profiles').where('emailNormalized', '==', email).limit(4)),
        tx.get(systemDoc(SYSTEM_ADMIN_ID))
      ]);
      if (fresh.exists) return;
      if (dupEmail.docs.some(d => d.id !== uid)) fail('already-exists', 'El correo administrativo ya tiene otro perfil vinculado.');
      tx.create(profileRef, {
        uid, email, emailNormalized: email, displayName,
        username: 'sendwayoexpress', role: 'admin', status: 'active',
        profileOrigin: 'allowlisted_admin_bootstrap', createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp()
      });
      if (!adminSystem.exists) tx.create(systemDoc(SYSTEM_ADMIN_ID), {
        uid: 'admin', role: 'admin', balanceDOP: 0, balanceHTG: 0,
        commissionDOP: 0, commissionHTG: 0, createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp()
      });
      tx.set(ledgerDoc(`bootstrap-admin-${uid}`), {
        id: `bootstrap-admin-${uid}`, kind: 'admin_profile_bootstrap', actorUid: uid,
        email, createdAt: FV.serverTimestamp(), createdAtMs: Date.now()
      }, { merge: true });
      created = true;
    });
    const final = await profileRef.get();
    return { ok: true, profile: final.exists ? { uid, ...final.data() } : null, created };
  }

  const legacyRows = [...new Map([...exactLegacy.docs, ...normalizedLegacy.docs].map(d => [d.id, d])).values()]
    .filter(d => !d.data().duplicateOf && (d.data().emailNormalized === email || domain.normalizeEmail(d.data().email) === email));
  if (legacyRows.length !== 1) {
    fail(legacyRows.length ? 'failed-precondition' : 'not-found', legacyRows.length
      ? 'Hay varias cuentas antiguas con este correo. No se creará un duplicado; el administrador debe conciliarlas.'
      : 'Esta cuenta todavía no está vinculada a un perfil SENDWAYO. El administrador debe importar y reconciliar la lista de remitentes/agentes.');
  }
  const legacyDoc = legacyRows[0], legacy = legacyDoc.data();
  const role = domain.normalizeRole(legacy.role);
  if (!['remitente', 'agent'].includes(role)) fail('permission-denied', 'El rol importado no se puede activar automáticamente.');
  const status = String(legacy.status || (legacy.active === true ? 'active' : '')).trim().toLowerCase();
  if (legacy.active === false || !['active', 'approved', 'aprobado', 'activo'].includes(status)) {
    fail('permission-denied', 'La cuenta antigua no está marcada como activa/aprobada; debe revisarla el administrador.');
  }
  const username = text(legacy.username || email, 80).trim().toLowerCase();
  const phone = text(legacy.phone, 60);
  const phoneNormalized = domain.normalizePhone(legacy.phoneNormalized || phone);
  let created = false;
  const accountRef = accountDoc(uid);
  await db.runTransaction(async tx => {
    // Include the remitente account in the initial read set to avoid a read-after-write error.
    const [fresh, sameEmail, sameUsername, samePhone, accountSnap] = await Promise.all([
      tx.get(profileRef),
      tx.get(db.collection('profiles').where('emailNormalized', '==', email).limit(4)),
      username ? tx.get(db.collection('profiles').where('username', '==', username).limit(4)) : Promise.resolve({ docs: [] }),
      phoneNormalized ? tx.get(db.collection('profiles').where('phoneNormalized', '==', phoneNormalized).limit(4)) : Promise.resolve({ docs: [] }),
      role === 'remitente' ? tx.get(accountRef) : Promise.resolve({ exists: false })
    ]);
    if (fresh.exists) return;
    if (sameEmail.docs.some(d => d.id !== uid) || sameUsername.docs.some(d => d.id !== uid) || samePhone.docs.some(d => d.id !== uid)) {
      fail('already-exists', 'El correo, usuario o teléfono ya pertenece a otro perfil. No se creó una cuenta duplicada.');
    }
    tx.create(profileRef, {
      uid, email, emailNormalized: email, displayName: text(legacy.displayName, 180),
      phone, phoneNormalized, username, role, status: 'active',
      legacyId: text(legacy.legacyId || legacyDoc.id, 140), legacyIds: Array.isArray(legacy.legacyIds) ? legacy.legacyIds : [legacyDoc.id],
      linkedAt: FV.serverTimestamp(), profileOrigin: 'legacy_account_link', updatedAt: FV.serverTimestamp()
    });
    if (role === 'remitente' && !accountSnap.exists) tx.create(accountRef, {
      uid, role, legacyId: text(legacy.legacyId || legacyDoc.id, 140), displayName: text(legacy.displayName, 180),
      phone, phoneNormalized, email,
      balanceDOP: legacy.balanceMigrationApproved ? Number(legacy.approvedBalances?.balanceDOP ?? legacy.proposedBalances?.balanceDOP ?? 0) : 0,
      balanceHTG: legacy.balanceMigrationApproved ? Number(legacy.approvedBalances?.balanceHTG ?? legacy.proposedBalances?.balanceHTG ?? 0) : 0,
      commissionDOP: legacy.balanceMigrationApproved ? Number(legacy.approvedBalances?.commissionDOP ?? legacy.proposedBalances?.commissionDOP ?? 0) : 0,
      commissionHTG: legacy.balanceMigrationApproved ? Number(legacy.approvedBalances?.commissionHTG ?? legacy.proposedBalances?.commissionHTG ?? 0) : 0,
      balanceMigrationApproved: Boolean(legacy.balanceMigrationApproved),
      createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp()
    });
    tx.update(legacyDoc.ref, { needsAuthLink: false, linkedUid: uid, linkedAt: FV.serverTimestamp(),
      ...(legacy.balanceMigrationApproved ? { balanceMigrationAppliedAt: FV.serverTimestamp(), balanceMigrationPendingLink: false } : {}) });
    tx.set(ledgerDoc(`legacy-link-${uid}`), { id: `legacy-link-${uid}`, kind: 'legacy_account_link', actorUid: uid, targetUid: uid, legacyId: legacyDoc.id, createdAt: FV.serverTimestamp(), createdAtMs: Date.now() }, { merge: true });
    if (legacy.balanceMigrationApproved) tx.set(ledgerDoc(`migration-${legacyDoc.id}`), {
      id: `migration-${legacyDoc.id}`, kind: 'legacy_balance_migration', legacyId: legacyDoc.id, actorUid: 'admin', targetUid: uid,
      role, applied: role === 'remitente', approvedBalances: legacy.approvedBalances || legacy.proposedBalances || {},
      createdAt: FV.serverTimestamp(), createdAtMs: Date.now()
    }, { merge: true });
    created = true;
  });
  const final = await profileRef.get();
  return { ok: true, profile: final.exists ? { uid, ...final.data() } : null, created };
});

exports.submitOperation = callable(async (data, context) => {
  const actor = await requireProfile(context);
  const operation = data.operation && typeof data.operation === 'object' ? data.operation : data;
  const id = cleanId(operation.idempotencyKey || operation.id);
  if (!id) fail('invalid-argument', 'La operación necesita un identificador único para evitar duplicados.');
  let owner = { uid: actor.uid, role: actor.role, displayName: actor.displayName || actor.name, email: actor.email };
  if (actor.role === 'admin') {
    const requestedOwnerRole = domain.normalizeRole(operation.ownerRole || operation.targetRole || 'admin') || 'admin';
    if (requestedOwnerRole !== 'admin') {
      const identifier = operation.targetUserId || operation.ownerId || operation.remitenteId || operation.accountId;
      const resolved = await resolveProfile(identifier);
      if (!resolved) fail('not-found', 'No se encontró el perfil de la cuenta seleccionada. Vincula el usuario antes de registrar operaciones a su nombre.');
      const resolvedRole = domain.normalizeRole(resolved.role);
      if (resolvedRole !== requestedOwnerRole) fail('failed-precondition', 'El rol de la cuenta seleccionada no coincide con la operación.');
      if (!['active', 'approved', 'aprobado', 'activo'].includes(String(resolved.status || '').toLowerCase())) {
        fail('failed-precondition', 'La cuenta seleccionada todavía no está activa.');
      }
      owner = { ...resolved, uid: resolved.uid, role: resolvedRole };
    }
  }
  if (actor.role !== 'admin' && owner.role !== actor.role) fail('permission-denied', 'No puedes registrar operaciones a nombre de otra cuenta.');
  const validation = domain.validateOperation(operation, actor.role === 'admin' ? owner.role : actor.role);
  const idRef = db.collection('transactions').doc(id);
  const isDeposit = validation.isDeposit;
  const ownerAccountRef = owner.role === 'remitente' ? accountDoc(owner.uid) : null;
  const systemRef = owner.role === 'admin' && actor.role === 'admin'
    ? systemDoc(SYSTEM_ADMIN_ID)
    : ((owner.role === 'agent' || actor.role === 'agent') ? systemDoc(SYSTEM_OPERATIONS_ID) : null);
  const admins = await listAdminUids();
  const operationDoc = standardOperationFields(operation, validation, actor, owner, id);
  let repeatedOperation = null;
  operationDoc.targetUid = owner.role !== 'admin' ? owner.uid : (isDeposit && owner.role === 'remitente' ? owner.uid : null);
  operationDoc.fundingSource = !isDeposit && owner.role === 'remitente' ? 'account'
    : (!isDeposit && owner.role === 'admin' && actor.role === 'admin' ? 'admin'
      : (!isDeposit && (owner.role === 'agent' || actor.role === 'agent') ? 'system' : 'none'));
  operationDoc.fundingUid = operationDoc.fundingSource === 'account' ? owner.uid
    : (operationDoc.fundingSource === 'admin' ? SYSTEM_ADMIN_ID
      : (operationDoc.fundingSource === 'system' ? SYSTEM_OPERATIONS_ID : null));
  operationDoc.reservedAmount = operationDoc.fundingSource === 'none' ? 0 : validation.amount;
  operationDoc.depositTarget = isDeposit ? (owner.role === 'remitente' ? 'account' : 'system') : null;
  operationDoc.depositTargetUid = isDeposit && owner.role === 'remitente' ? owner.uid : (isDeposit ? SYSTEM_OPERATIONS_ID : null);
  operationDoc.depositCurrency = validation.currency;
  operationDoc.depositAmount = isDeposit ? validation.amount : 0;

  await db.runTransaction(async tx => {
    const existingSnap = await tx.get(idRef);
    if (existingSnap.exists) {
      const existing = existingSnap.data();
      if (existing.createdByUid === actor.uid && existing.idempotencyKey === id) {
        const sameCore = Number(existing.amount) === Number(operationDoc.amount)
          && domain.normalizeCurrency(existing.currencyCode || existing.currency) === validation.currency
          && existing.ownerUid === operationDoc.ownerUid;
        if (!sameCore) fail('already-exists', 'La clave de idempotencia ya existe con datos diferentes. No se creó un duplicado.');
        repeatedOperation = existing; return;
      }
      fail('already-exists', 'Este identificador ya pertenece a otra operación. No se creó un duplicado.');
    }
    let fundingSnap = null;
    if (!isDeposit && operationDoc.fundingSource === 'account') fundingSnap = await tx.get(ownerAccountRef);
    if (!isDeposit && ['system', 'admin'].includes(operationDoc.fundingSource)) fundingSnap = await tx.get(systemRef);
    if (fundingSnap) {
      const account = fundingSnap.exists ? fundingSnap.data() : {};
      const field = moneyField(validation.currency, 'balance');
      const available = Number(account[field] || 0);
      if (available < validation.amount) {
        if (actor.role === 'admin' && ['system', 'admin'].includes(operationDoc.fundingSource)) {
          operationDoc.fundingOverride = true;
          operationDoc.reservedAmount = 0;
          tx.set(db.collection('auditLogs').doc(`funding-override-${id}`), {
            kind: 'admin_save_without_funds', actorUid: actor.uid, operationId: id,
            currencyCode: validation.currency, requestedAmount: validation.amount,
            availableAtCreation: available, reason: text(operation.overrideReason || operation.reason, 300) || 'Autorización administrativa explícita',
            createdAt: FV.serverTimestamp(), createdAtMs: Date.now()
          });
        } else {
          fail('failed-precondition', `Fondos insuficientes. Disponible: ${available} ${currencyLabel(validation.currency)}.`);
        }
      } else {
        tx.set(fundingSnap.ref, { [field]: domain.round2(available - validation.amount), updatedAt: FV.serverTimestamp() }, { merge: true });
      }
    }
    tx.set(idRef, operationDoc);
    if (operationDoc.fundingSource !== 'none' && !operationDoc.fundingOverride) {
      tx.set(ledgerDoc(`reserve-${id}`), {
        id: `reserve-${id}`, operationId: id, kind: 'reserve', actorUid: actor.uid,
        ownerUid: owner.uid, fundingSource: operationDoc.fundingSource,
        currencyCode: validation.currency, amount: validation.amount,
        before: fundingSnap?.exists ? Number(fundingSnap.data()[moneyField(validation.currency, 'balance')] || 0) : 0,
        after: fundingSnap?.exists ? domain.round2(Number(fundingSnap.data()[moneyField(validation.currency, 'balance')] || 0) - validation.amount) : 0,
        createdAt: FV.serverTimestamp(), createdAtMs: Date.now()
      });
    }
    addNotices(tx, admins, `tx-created-${id}`, { type: 'operation', title: operationDoc.fundingOverride ? 'Operación pendiente: fondos no reservados' : 'Nueva operación pendiente', message: `${operationDoc.type} ${id}: ${validation.amount} ${currencyLabel(validation.currency)}.${operationDoc.fundingOverride ? ' Se guardó por autorización administrativa sin reserva; debe tener fondos antes de aprobar.' : ''}`, section: isDeposit ? 'cuentas' : 'envios', operationId: id, status: 'Pendiente', fundingOverride: Boolean(operationDoc.fundingOverride) });
    if (owner.uid !== actor.uid) {
      addNotices(tx, [owner.uid], `tx-created-owner-${id}`, { type: 'operation', title: 'Operación registrada a tu nombre', message: `${operationDoc.type} ${id} está pendiente de aprobación.`, section: isDeposit ? 'cuentas' : 'envios', operationId: id, status: 'Pendiente' });
    }
  });
  if (repeatedOperation) return { ok: true, operationId: id, status: repeatedOperation.status || repeatedOperation.estado || 'Pendiente', receiptId: repeatedOperation.receiptId || null, repeated: true };
  return { ok: true, operationId: id, status: 'Pendiente', operation: { ...operationDoc, createdAt: undefined } };
});

exports.reviewOperation = callable(async (data, context) => {
  const reviewer = await requireAdmin(context);
  const id = requireOperationId(data);
  const decision = mapAction(data.action || data.decision || data.status);
  const txRef = db.collection('transactions').doc(id);
  const admins = await listAdminUids();
  let result = null;
  await db.runTransaction(async tx => {
    const snap = await tx.get(txRef);
    if (!snap.exists) fail('not-found', 'No se encontró la operación.');
    const op = snap.data();
    if (isApproved(op) || op.settledAt) {
      result = { ok: true, operationId: id, status: 'Aprobado', receiptId: op.receiptId || null, alreadySettled: true };
      return;
    }
    if (!['pendiente', 'no coincide'].includes(operationStatus(op))) {
      fail('failed-precondition', 'La operación ya fue decidida y no se puede aprobar de nuevo.');
    }

    if (decision !== 'Aprobado') {
      tx.update(txRef, {
        status: decision, estado: decision, needsCorrection: decision === 'No Coincide',
        reviewedAt: FV.serverTimestamp(), reviewedAtMs: Date.now(),
        reviewedByUid: reviewer.uid,
        reviewedByName: text(reviewer.displayName || reviewer.name || reviewer.email, 180),
        reviewReason: text(data.reason, 400)
      });
      addNotices(tx, [op.ownerUid, op.createdByUid].filter(Boolean), `tx-review-${id}-${decision}`, {
        type: 'decision', title: `Operación ${decision}`,
        message: `${op.type || 'Operación'} ${id}: ${decision}.`,
        section: op.depositTarget ? 'cuentas' : 'envios', operationId: id, status: decision,
        reason: text(data.reason, 300)
      });
      result = { ok: true, operationId: id, status: decision };
      return;
    }

    const currencyCode = domain.normalizeCurrency(op.currencyCode || op.currency) || 'DOP';
    const amount = domain.parseAmount(op.amount) || 0;
    const fee = domain.round2(Math.max(0, Number(op.fee || 0)));
    const split = domain.splitCommission(fee, op.ownerRole);
    const ownerAccountRef = op.ownerUid && op.ownerRole === 'remitente' ? accountDoc(op.ownerUid) : null;
    const depositRef = op.depositTarget === 'account' && op.depositTargetUid
      ? accountDoc(op.depositTargetUid)
      : (op.depositTarget === 'system' ? systemDoc() : null);
    const receiptId = op.receiptId || `CMP-${id.replace(/[^A-Za-z0-9]/g, '').slice(-28)}`;
    const receiptRef = db.collection('receipts').doc(receiptId);
    const settleRef = ledgerDoc(`settle-${id}`);
    const adminBalanceRef = systemDoc(SYSTEM_ADMIN_ID);
    const overrideFundingRef = op.fundingOverride && ['system', 'admin'].includes(op.fundingSource)
      ? systemDoc(op.fundingUid || (op.fundingSource === 'admin' ? SYSTEM_ADMIN_ID : SYSTEM_OPERATIONS_ID)) : null;
    const readRefs = [];
    const addReadRef = ref => { if (ref && !readRefs.some(x => x.path === ref.path)) readRefs.push(ref); };
    addReadRef(ownerAccountRef);
    addReadRef(depositRef);
    if (fee > 0) addReadRef(adminBalanceRef);
    addReadRef(overrideFundingRef);
    addReadRef(receiptRef);
    addReadRef(settleRef);
    const snapshots = await Promise.all(readRefs.map(ref => tx.get(ref)));
    const snapByPath = new Map(readRefs.map((ref, index) => [ref.path, snapshots[index]]));
    const receiptSnap = snapByPath.get(receiptRef.path);
    const settlementSnap = snapByPath.get(settleRef.path);

    if (settlementSnap?.exists) {
      tx.update(txRef, {
        status: 'Aprobado', estado: 'Aprobado', settledAt: op.settledAt || FV.serverTimestamp(),
        settledAtMs: op.settledAtMs || Date.now(), receiptId,
        reviewedAt: FV.serverTimestamp(), reviewedByUid: reviewer.uid, reviewedByName: text(reviewer.displayName || reviewer.name || reviewer.email, 180)
      });
      result = { ok: true, operationId: id, status: 'Aprobado', receiptId, alreadySettled: true };
      return;
    }

    if (overrideFundingRef) {
      const fundingSnap = snapByPath.get(overrideFundingRef.path);
      const funding = fundingSnap?.exists ? fundingSnap.data() : {};
      const field = moneyField(currencyCode, 'balance');
      const available = Number(funding[field] || 0);
      const unreservedAmount = domain.round2(Math.max(0, amount - Number(op.reservedAmount || 0)));
      if (available < unreservedAmount) fail('failed-precondition', `No se puede aprobar: faltan fondos operativos para completar la reserva. Disponible: ${available} ${currencyLabel(currencyCode)}; pendiente de reservar: ${unreservedAmount}.`);
      if (unreservedAmount > 0) {
        tx.set(overrideFundingRef, { [field]: domain.round2(available - unreservedAmount), updatedAt: FV.serverTimestamp() }, { merge: true });
        tx.create(ledgerDoc(`reserve-${id}`), { id: `reserve-${id}`, operationId: id, kind: 'admin_override_reserve_on_approval', actorUid: reviewer.uid, ownerUid: op.ownerUid || null, fundingSource: op.fundingSource, currencyCode, amount: unreservedAmount, before: available, after: domain.round2(available - unreservedAmount), createdAt: FV.serverTimestamp(), createdAtMs: Date.now() });
      }
    }

    if (op.depositTarget) {
      if (!depositRef) fail('failed-precondition', 'Falta la cuenta destino del depósito.');
      const oldSnap = snapByPath.get(depositRef.path);
      const old = oldSnap?.exists ? oldSnap.data() : {};
      const field = moneyField(currencyCode, 'balance');
      const before = Number(old[field] || 0);
      const after = domain.round2(before + amount);
      tx.set(depositRef, { uid: op.depositTargetUid || null, [field]: after, updatedAt: FV.serverTimestamp() }, { merge: true });
      tx.set(ledgerDoc(`deposit-${id}`), {
        id: `deposit-${id}`, operationId: id, kind: 'deposit_credit', actorUid: reviewer.uid,
        targetUid: op.depositTargetUid || null, currencyCode, amount, before, after,
        createdAt: FV.serverTimestamp(), createdAtMs: Date.now()
      });
    }

    if (fee > 0 && split.remitter > 0 && ownerAccountRef) {
      const ownerSnap = snapByPath.get(ownerAccountRef.path);
      const ownerData = ownerSnap?.exists ? ownerSnap.data() : {};
      const field = moneyField(currencyCode, 'commission');
      tx.set(ownerAccountRef, { [field]: domain.round2(Number(ownerData[field] || 0) + split.remitter), updatedAt: FV.serverTimestamp() }, { merge: true });
    }
    if (fee > 0) {
      const adminSnap = snapByPath.get(adminBalanceRef.path);
      const adminData = adminSnap?.exists ? adminSnap.data() : {};
      const field = moneyField(currencyCode, 'commission');
      tx.set(adminBalanceRef, { [field]: domain.round2(Number(adminData[field] || 0) + split.admin), updatedAt: FV.serverTimestamp() }, { merge: true });
    }

    const now = Date.now();
    const finalReceipt = {
      id: receiptId,
      operationId: id,
      recipientUids: [...new Set([op.ownerUid, op.targetUid, op.createdByUid].filter(Boolean))],
      ownerUid: op.ownerUid || null,
      ownerRole: op.ownerRole || null,
      ownerLegacyId: op.ownerLegacyId || null,
      ownerName: text(op.ownerName, 180),
      createdByUid: op.createdByUid || null,
      createdByRole: op.createdByRole || null,
      actorLegacyId: op.actorLegacyId || null,
      beneficiary: text(op.beneficiary, 180),
      beneficiaryPhone: text(op.beneficiaryPhone, 60),
      type: text(op.type, 80),
      route: text(op.routeFull || op.route, 220),
      method: text(op.method, 100),
      amount,
      currency: text(op.currency || currencyLabel(currencyCode), 12),
      receivedAmount: domain.parseAmount(op.receivedAmount) || domain.parseAmount(op.net) || amount,
      receivedCurrency: text(op.receivedCurrency || currencyCode, 12),
      approvedByName: text(reviewer.displayName || reviewer.name || reviewer.email, 180),
      approvedAt: FV.serverTimestamp(), approvedAtMs: now,
      createdAtMs: Number(op.createdAtMs || now),
      status: 'Aprobado'
    };
    if (!receiptSnap?.exists) tx.create(receiptRef, finalReceipt);
    tx.create(settleRef, {
      id: `settle-${id}`, operationId: id, kind: 'settlement', actorUid: reviewer.uid,
      ownerUid: op.ownerUid || null, currencyCode, principal: amount, fee,
      remitterCommission: split.remitter, adminCommission: split.admin,
      createdAt: FV.serverTimestamp(), createdAtMs: now
    });
    tx.update(txRef, {
      status: 'Aprobado', estado: 'Aprobado', settledAt: FV.serverTimestamp(), settledAtMs: now,
      reviewedAt: FV.serverTimestamp(), reviewedAtMs: now, reviewedByUid: reviewer.uid,
      reviewedByName: finalReceipt.approvedByName, receiptId, needsCorrection: false
    });
    addNotices(tx, [op.ownerUid, op.createdByUid].filter(Boolean), `tx-approved-${id}`, {
      type: 'decision', title: 'Operación aprobada',
      message: `${op.type || 'Operación'} ${id} fue aprobada. Comprobante disponible.`,
      section: op.depositTarget ? 'cuentas' : 'envios', operationId: id, status: 'Aprobado', receiptId
    });
    result = { ok: true, operationId: id, status: 'Aprobado', receiptId };
  });
  return result;
});

exports.resubmitOperation = callable(async (data, context) => {
  const actor = await requireProfile(context);
  const id = requireOperationId(data);
  const operation = data.operation && typeof data.operation === 'object' ? data.operation : data;
  const ref = db.collection('transactions').doc(id);
  const admins = await listAdminUids();
  let result;
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail('not-found', 'No se encontró la operación.');
    const old = snap.data();
    if (!['no coincide', 'no_coincide'].includes(operationStatus(old))) fail('failed-precondition', 'Solo una operación marcada No Coincide puede corregirse y reenviarse.');
    if (![old.createdByUid, old.ownerUid].includes(actor.uid) && actor.role !== 'admin') fail('permission-denied', 'Solo quien creó la operación o su titular puede corregirla.');
    const ownerRole = domain.normalizeRole(old.ownerRole) || actor.role;
    const validation = domain.validateOperation({ ...old, ...operation, type: old.type, kind: old.kind, category: old.category, route: old.route, routeFull: old.routeFull, method: old.method, provider: old.provider, originCountry: old.originCountry, destinationCountry: old.destinationCountry, origin: old.origin, destination: old.destination }, ownerRole);
    const oldCurrency = domain.normalizeCurrency(old.currencyCode || old.currency);
    if (validation.currency !== oldCurrency) fail('failed-precondition', 'No se puede cambiar la moneda al corregir una operación marcada No Coincide. Crea una operación nueva si la moneda original era incorrecta.');
    if (validation.isDeposit !== domain.isDeposit(old)) fail('failed-precondition', 'No se puede cambiar el tipo de operación entre depósito y otra operación durante una corrección.');
    const correctionAmount = domain.parseAmount(operation.amount ?? operation.monto);
    const amountChanged = correctionAmount !== null && correctionAmount !== Number(old.amount);
    if (amountChanged && (domain.isDominicanToHaiti(old) || domain.isUSAToHaiti(old) || domain.isHaitiToDominican(old)) && operation.receivedAmount == null && operation.htg == null && operation.rd == null) {
      fail('invalid-argument', 'Al cambiar el monto de una transferencia entre monedas, indica también el nuevo importe recibido en destino.');
    }
    const currencyCode = validation.currency;
    const fundingRef = old.fundingSource === 'account' ? accountDoc(old.fundingUid || old.ownerUid)
      : (['system', 'admin'].includes(old.fundingSource) ? systemDoc(old.fundingUid || (old.fundingSource === 'admin' ? SYSTEM_ADMIN_ID : SYSTEM_OPERATIONS_ID)) : null);
    let fundingSnap = null;
    if (fundingRef) fundingSnap = await tx.get(fundingRef);
    const oldReserved = Number(old.reservedAmount || 0);
    let newReserved = old.fundingSource === 'none' || validation.isDeposit ? 0 : validation.amount;
    const delta = domain.round2(newReserved - oldReserved);
    let fundingOverride = Boolean(old.fundingOverride);
    if (fundingRef && delta !== 0) {
      const account = fundingSnap?.exists ? fundingSnap.data() : {};
      const field = moneyField(currencyCode, 'balance');
      const available = Number(account[field] || 0);
      if (delta > available) {
        if (actor.role === 'admin' && ['system', 'admin'].includes(old.fundingSource)) {
          fundingOverride = true;
          newReserved = oldReserved; // Keep previously reserved funds; only the increase remains unreserved.
          tx.set(db.collection('auditLogs').doc(`funding-override-resubmit-${id}-${crypto.randomUUID()}`), {
            kind: 'admin_resubmit_without_funds', actorUid: actor.uid, operationId: id,
            currencyCode, requestedAmount: validation.amount, availableAtResubmit: available,
            reason: text(operation.overrideReason || operation.reason, 300) || 'Autorización administrativa explícita',
            createdAt: FV.serverTimestamp(), createdAtMs: Date.now()
          });
        } else {
          fail('failed-precondition', `Fondos insuficientes para la diferencia. Disponible: ${available} ${currencyLabel(currencyCode)}.`);
        }
      } else {
        tx.set(fundingRef, { [field]: domain.round2(available - delta), updatedAt: FV.serverTimestamp() }, { merge: true });
        tx.set(ledgerDoc(`resubmit-${id}-${crypto.randomUUID()}`), { operationId: id, kind: 'resubmit_adjustment', actorUid: actor.uid, currencyCode, amount: -delta, before: available, after: domain.round2(available - delta), createdAt: FV.serverTimestamp(), createdAtMs: Date.now() });
        fundingOverride = false;
      }
    }
    const patch = {
      type: old.type, category: old.category, route: old.route, routeFull: old.routeFull,
      method: old.method, amount: validation.amount, currency: currencyLabel(currencyCode), currencyCode,
      fee: validation.fee, net: validation.isDeposit ? validation.amount : domain.round2(validation.amount - validation.fee),
      receivedAmount: domain.parseAmount(operation.receivedAmount ?? operation.htg ?? operation.rd) ?? old.receivedAmount ?? domain.round2(validation.amount - validation.fee),
      receivedCurrency: old.receivedCurrency || currencyCode, rate: validation.isDeposit ? 0 : domain.commissionRate({ ...old, amount: validation.amount }),
      beneficiary: text(operation.beneficiary || old.beneficiary, 180), beneficiaryPhone: text(operation.beneficiaryPhone || old.beneficiaryPhone, 60),
      status: 'Pendiente', estado: 'Pendiente', reservedAmount: newReserved, fundingOverride,
      needsCorrection: false, correctedAt: FV.serverTimestamp(), correctedAtMs: Date.now(),
      submittedAt: FV.serverTimestamp(), submittedAtMs: Date.now(), updatedAt: FV.serverTimestamp()
    };
    tx.update(ref, patch);
    addNotices(tx, admins, `tx-resubmitted-${id}`, { type: 'operation', title: 'Operación corregida y reenviada', message: `${old.type || 'Operación'} ${id} está nuevamente pendiente.`, section: 'envios', operationId: id, status: 'Pendiente' });
    result = { ok: true, operationId: id, status: 'Pendiente' };
  });
  return result;
});

exports.deleteRejectedOperation = callable(async (data, context) => {
  const actor = await requireProfile(context);
  const id = requireOperationId(data);
  const ref = db.collection('transactions').doc(id);
  let result;
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail('not-found', 'La operación ya no existe o ya fue eliminada.');
    const op = snap.data();
    if (!['rechazado', 'rejected'].includes(operationStatus(op))) fail('failed-precondition', 'Solo puedes borrar una operación rechazada; No Coincide debe corregirse y reenviarse.');
    if (![op.createdByUid, op.ownerUid].includes(actor.uid) && actor.role !== 'admin') fail('permission-denied', 'No puedes borrar una operación que pertenece a otra cuenta.');
    const refundId = `refund-${id}`;
    const refundRef = ledgerDoc(refundId);
    const refundSnap = await tx.get(refundRef);
    const fundingRef = op.fundingSource === 'account' ? accountDoc(op.fundingUid || op.ownerUid)
      : (['system', 'admin'].includes(op.fundingSource) ? systemDoc(op.fundingUid || (op.fundingSource === 'admin' ? SYSTEM_ADMIN_ID : SYSTEM_OPERATIONS_ID)) : null);
    const fundingSnap = fundingRef ? await tx.get(fundingRef) : null;
    if (!refundSnap.exists && fundingRef && Number(op.reservedAmount || 0) > 0) {
      const currency = domain.normalizeCurrency(op.currencyCode || op.currency) || 'DOP';
      const field = moneyField(currency, 'balance');
      const before = Number(fundingSnap?.data()?.[field] || 0);
      const amount = Number(op.reservedAmount || 0);
      tx.set(fundingRef, { [field]: domain.round2(before + amount), updatedAt: FV.serverTimestamp() }, { merge: true });
      tx.create(refundRef, { id: refundId, operationId: id, kind: 'rejected_refund', actorUid: actor.uid, ownerUid: op.ownerUid || null, currencyCode: currency, amount, before, after: domain.round2(before + amount), createdAt: FV.serverTimestamp(), createdAtMs: Date.now() });
    }
    tx.delete(ref);
    addNotices(tx, [op.ownerUid].filter(Boolean), `tx-deleted-${id}`, { type: 'operation', title: 'Operación rechazada eliminada', message: `${op.type || 'Operación'} ${id} fue eliminada; si tenía un importe reservado, la devolución se registró una sola vez.`, section: 'envios', operationId: id, status: 'Eliminado' });
    result = { ok: true, operationId: id, deleted: true, refunded: !refundSnap.exists && Number(op.reservedAmount || 0) > 0 };
  });
  return result;
});

exports.reviewRegistration = callable(async (data, context) => {
  const adminProfile = await requireAdmin(context);
  const uid = text(data.uid || data.requestUid, 140);
  const action = String(data.action || data.status || '').trim().toLowerCase();
  if (!uid) fail('invalid-argument', 'Falta el usuario de la solicitud.');
  if (!['approve', 'approved', 'aprobar', 'aprobado', 'reject', 'rejected', 'rechazar', 'rechazado'].includes(action)) fail('invalid-argument', 'Indica aprobar o rechazar.');
  const approve = ['approve', 'approved', 'aprobar', 'aprobado'].includes(action);
  const requestRef = db.collection('registrationRequests').doc(uid);
  const profileRef = db.collection('profiles').doc(uid);
  let output;
  await db.runTransaction(async tx => {
    const [reqSnap, profileSnap] = await Promise.all([tx.get(requestRef), tx.get(profileRef)]);
    if (!reqSnap.exists || !profileSnap.exists) fail('not-found', 'No se encontró la solicitud o su perfil.');
    const req = reqSnap.data();
    if (req.status !== 'Pendiente') fail('failed-precondition', 'La solicitud ya fue revisada.');
    const role = domain.normalizeRole(req.requestedRole);
    if (approve && !['remitente', 'agent'].includes(role)) fail('failed-precondition', 'La solicitud contiene un rol no permitido.');
    const status = approve ? 'active' : 'rejected';
    tx.update(requestRef, { status: approve ? 'Aprobado' : 'Rechazado', reviewedAt: FV.serverTimestamp(), reviewedByUid: adminProfile.uid, reviewReason: text(data.reason, 300) });
    tx.set(profileRef, { role: approve ? role : null, status, reviewedAt: FV.serverTimestamp(), reviewedByUid: adminProfile.uid }, { merge: true });
    if (approve && role === 'remitente') {
      tx.set(accountDoc(uid), { uid, role, displayName: req.displayName, phone: req.phone, email: req.email, balanceDOP: 0, balanceHTG: 0, commissionDOP: 0, commissionHTG: 0, createdAt: FV.serverTimestamp() }, { merge: true });
    }
    addNotices(tx, [uid], `registration-review-${uid}-${approve ? 'approved' : 'rejected'}`, { type: 'registration', title: approve ? 'Registro aprobado' : 'Registro rechazado', message: approve ? 'Tu acceso a SENDWAYO EXPRESS fue aprobado.' : 'Tu solicitud de acceso no fue aprobada.', section: 'dashboard', status: approve ? 'Aprobado' : 'Rechazado' });
    output = { ok: true, uid, status: approve ? 'Aprobado' : 'Rechazado', role: approve ? role : null };
  });
  return output;
});

exports.linkUserToAccount = callable(async (data, context) => {
  const adminProfile = await requireAdmin(context);
  const uid = text(data.uid || data.targetUid, 140);
  const legacyId = text(data.legacyId || data.accountId || data.id, 140);
  if (!uid || !legacyId) fail('invalid-argument', 'Indica UID y código de cuenta.');
  const legacyRef = db.collection('legacyAccounts').doc(cleanId(legacyId));
  const profileRef = db.collection('profiles').doc(uid);
  let result;
  const linkedAccountRef = db.collection('accounts').doc(uid);
  await db.runTransaction(async tx => {
    const [legacySnap, profileSnap, accountSnap] = await Promise.all([tx.get(legacyRef), tx.get(profileRef), tx.get(linkedAccountRef)]);
    if (!legacySnap.exists) fail('not-found', 'Primero importa la cuenta antigua al registro de vinculación.');
    if (!profileSnap.exists) fail('not-found', 'El usuario no tiene una cuenta Firebase Authentication vinculada.');
    const legacy = legacySnap.data(), profile = profileSnap.data();
    const profileRole = domain.normalizeRole(profile.role);
    const legacyRole = domain.normalizeRole(legacy.role);
    if (!profileRole || profileRole !== legacyRole) fail('failed-precondition', 'Los roles no coinciden; no se vinculó la cuenta.');
    if (!['active', 'approved', 'aprobado', 'activo'].includes(String(profile.status || '').toLowerCase())) fail('failed-precondition', 'El perfil Firebase no está aprobado.');
    tx.update(profileRef, { legacyId, accountId: legacyId, linkedAt: FV.serverTimestamp(), linkedByUid: adminProfile.uid });
    if (profileRole === 'remitente') {
      tx.set(linkedAccountRef, { uid, role: profileRole, legacyId, displayName: text(profile.displayName || profile.name || legacy.displayName, 180), phone: text(profile.phone || legacy.phone, 60), email: text(profile.email || legacy.email, 180).toLowerCase(), updatedAt: FV.serverTimestamp() }, { merge: true });
    }
    result = { ok: true, uid, legacyId, role: profileRole };
  });
  return result;
});

exports.importLegacyAccounts = callable(async (data, context) => {
  const adminProfile = await requireAdmin(context);
  const sourceRows = Array.isArray(data.accounts) ? data.accounts : [];
  if (!sourceRows.length) fail('invalid-argument', 'No se recibieron cuentas para importar.');
  if (sourceRows.length > 350) fail('invalid-argument', 'Importa como máximo 350 registros por lote.');
  const merged = domain.mergeLegacyAccounts(sourceRows);
  if (!merged.accounts.length && !merged.conflicts.length) fail('invalid-argument', 'No hay registros válidos con ID, correo o teléfono y rol.');
  const batch = db.batch();
  let accepted = 0, aliases = 0, balanceReviewCount = 0, agentAmountsIgnored = 0;
  for (const row of merged.accounts) {
    const legacyId = cleanId(row.legacyId || row.emailNormalized || row.phoneNormalized);
    if (!legacyId) continue;
    const role = domain.normalizeRole(row.role);
    if (!role) continue;
    const ref = db.collection('legacyAccounts').doc(legacyId);
    const active = row.status === true || String(row.status || '').trim().toLowerCase() === 'true'
      || ['active', 'approved', 'aprobado', 'activo'].includes(String(row.status || '').trim().toLowerCase());
    const pending = ['pendiente', 'pending', 'needs_review', 'inactivo', 'inactive', 'rejected', 'rechazado'].includes(String(row.status || '').trim().toLowerCase());
    const status = active ? 'active' : (pending ? String(row.status).trim() : 'needs_review');
    const legacyData = {
      legacyId, legacyIds: row.legacyIds || [legacyId], role,
      displayName: text(row.displayName, 180), phone: text(row.phone, 60), phoneNormalized: text(row.phoneNormalized, 40),
      email: text(row.email, 180).toLowerCase(), emailNormalized: text(row.emailNormalized, 180),
      username: text(row.username, 80).toLowerCase(), status, active,
      sourcePriority: Number(row.sourcePriority || 0), sourceIds: row.sourceIds || [],
      proposedBalances: row.proposedBalances || {}, needsBalanceReview: Boolean(row.needsBalanceReview),
      agentAmountsIgnored: Boolean(row.agentAmountsIgnored), duplicateCount: Number(row.duplicateCount || 0),
      importedAt: FV.serverTimestamp(), importedByUid: adminProfile.uid, needsAuthLink: true,
      // Balances remain a proposal for review; import never changes a live account balance.
      balanceMigrationApproved: false
    };
    balanceReviewCount += legacyData.needsBalanceReview ? 1 : 0;
    agentAmountsIgnored += legacyData.agentAmountsIgnored ? 1 : 0;
    batch.set(ref, legacyData, { merge: true });
    accepted++;
    for (const alias of (row.legacyIds || []).map(cleanId).filter(id => id && id !== legacyId)) {
      batch.set(db.collection('legacyAccounts').doc(alias), {
        legacyId: alias, duplicateOf: legacyId, role, email: legacyData.email, emailNormalized: legacyData.emailNormalized,
        phone: legacyData.phone, phoneNormalized: legacyData.phoneNormalized, needsAuthLink: false,
        importedAt: FV.serverTimestamp(), importedByUid: adminProfile.uid
      }, { merge: true });
      aliases++;
    }
  }
  if (accepted + merged.conflicts.length === 0) fail('invalid-argument', 'No se encontraron cuentas importables.');
  if (accepted) await batch.commit();
  await db.collection('auditLogs').add({
    kind: 'legacy_accounts_import', actorUid: adminProfile.uid, accepted,
    duplicateRecordsMerged: merged.duplicatesRemoved, aliases, conflicts: merged.conflicts,
    ambiguousPhones: merged.ambiguousPhones, balanceReviewCount, agentAmountsIgnored,
    createdAt: FV.serverTimestamp(), createdAtMs: Date.now()
  });
  return { ok: true, accepted, duplicatesRemoved: merged.duplicatesRemoved, aliases, conflicts: merged.conflicts,
    ambiguousPhones: merged.ambiguousPhones, balanceReviewCount, agentAmountsIgnored,
    migrationCandidates: merged.accounts.map(row => ({ legacyId: cleanId(row.legacyId || row.emailNormalized || row.phoneNormalized),
      displayName: row.displayName, email: row.email, role: row.role, duplicateCount: row.duplicateCount,
      proposedBalances: row.proposedBalances || {}, needsBalanceReview: Boolean(row.needsBalanceReview),
      agentAmountsIgnored: Boolean(row.agentAmountsIgnored) })),
    needsAuthLink: true, balancesApplied: false };
});

/**
 * Applies an imported balance snapshot only after an explicit admin confirmation.
 * This is a one-time SET, never an additive credit, and only for accounts without history.
 */
exports.approveLegacyBalanceMigration = callable(async (data, context) => {
  const adminProfile = await requireAdmin(context);
  const legacyId = cleanId(data.legacyId || data.accountId || data.id);
  if (!legacyId) fail('invalid-argument', 'Indica el identificador de la cuenta antigua.');
  if (data.confirm !== true) fail('failed-precondition', 'Confirma expresamente la migración de balances revisados.');
  const legacyRef = db.collection('legacyAccounts').doc(legacyId);
  const output = {};
  await db.runTransaction(async tx => {
    const legacySnap = await tx.get(legacyRef);
    if (!legacySnap.exists) fail('not-found', 'No existe esa cuenta importada.');
    const legacy = legacySnap.data();
    if (legacy.duplicateOf) fail('failed-precondition', 'Este registro es un duplicado; aprueba la cuenta principal indicada por duplicateOf.');
    if (legacy.needsBalanceReview) fail('failed-precondition', 'La cuenta tiene importes sin moneda o inválidos; primero concilia RD$ y HTG/GDES.');
    if (legacy.balanceMigrationAppliedAt) { output.status = 'already_applied'; output.legacyId = legacyId; return; }
    const role = domain.normalizeRole(legacy.role);
    const proposals = legacy.proposedBalances && typeof legacy.proposedBalances === 'object' ? legacy.proposedBalances : {};
    const amountKeys = ['balanceDOP', 'balanceHTG', 'commissionDOP', 'commissionHTG'];
    for (const key of amountKeys) if (Object.prototype.hasOwnProperty.call(proposals, key) && (!Number.isFinite(Number(proposals[key])) || Number(proposals[key]) < 0)) {
      fail('failed-precondition', `El importe propuesto ${key} no es válido.`);
    }
    const approved = {};
    for (const key of amountKeys) if (Object.prototype.hasOwnProperty.call(proposals, key)) approved[key] = Number(proposals[key]);
    if (role === 'agent') {
      // Policy: agents have no personal balance or commission wallet.
      const zeros = { balanceDOP: 0, balanceHTG: 0, commissionDOP: 0, commissionHTG: 0 };
      tx.update(legacyRef, { balanceMigrationApproved: true, balanceMigrationAppliedAt: FV.serverTimestamp(), balanceMigrationApprovedBy: adminProfile.uid, approvedBalances: zeros });
      tx.set(ledgerDoc(`migration-${legacyId}`), { id: `migration-${legacyId}`, kind: 'legacy_balance_migration', legacyId, role, actorUid: adminProfile.uid, applied: false, reason: 'agent_wallet_forbidden', createdAt: FV.serverTimestamp(), createdAtMs: Date.now() }, { merge: true });
      output.status = 'agent_wallet_ignored'; output.legacyId = legacyId; return;
    }
    if (!['admin', 'remitente'].includes(role)) fail('failed-precondition', 'Rol no válido para migración financiera.');
    if (!Object.keys(approved).length) fail('failed-precondition', 'No hay importes DOP/HTG identificados para aplicar.');
    if (role === 'admin') {
      const balanceRef = systemDoc(SYSTEM_ADMIN_ID);
      const [balanceSnap, actorLedger, targetLedger] = await Promise.all([
        tx.get(balanceRef), tx.get(db.collection('ledger').where('actorUid', '==', 'admin').limit(1)), tx.get(db.collection('ledger').where('targetUid', '==', 'admin').limit(1))
      ]);
      const current = balanceSnap.exists ? balanceSnap.data() : {};
      if (Number(current.balanceDOP || 0) !== 0 || Number(current.balanceHTG || 0) !== 0 || !actorLedger.empty || !targetLedger.empty) {
        fail('failed-precondition', 'El balance administrativo ya tiene valor o historial. No se sobrescribió; requiere conciliación manual.');
      }
      tx.set(balanceRef, { uid: 'admin', role: 'admin', ...approved, balanceMigrationApproved: true, updatedAt: FV.serverTimestamp(), balanceMigrationApprovedBy: adminProfile.uid }, { merge: true });
      tx.update(legacyRef, { balanceMigrationApproved: true, balanceMigrationAppliedAt: FV.serverTimestamp(), balanceMigrationApprovedBy: adminProfile.uid, approvedBalances: approved });
      tx.set(ledgerDoc(`migration-${legacyId}`), { id: `migration-${legacyId}`, kind: 'legacy_balance_migration', legacyId, role, actorUid: adminProfile.uid, applied: true, approvedBalances: approved, createdAt: FV.serverTimestamp(), createdAtMs: Date.now() }, { merge: true });
      output.status = 'applied'; output.legacyId = legacyId; output.approvedBalances = approved; return;
    }
    const [byLegacy, byEmail] = await Promise.all([
      tx.get(db.collection('profiles').where('legacyId', '==', legacyId).limit(3)),
      legacy.emailNormalized ? tx.get(db.collection('profiles').where('emailNormalized', '==', legacy.emailNormalized).limit(3)) : Promise.resolve({ docs: [] })
    ]);
    const profiles = [...new Map([...byLegacy.docs, ...byEmail.docs].map(d => [d.id, d])).values()]
      .filter(d => domain.normalizeRole(d.data().role) === 'remitente' && ['active', 'approved', 'aprobado', 'activo'].includes(String(d.data().status || '').toLowerCase()));
    if (profiles.length > 1) fail('already-exists', 'Hay varios perfiles asociados a esta cuenta; concilia los duplicados antes de migrar balances.');
    if (!profiles.length) {
      tx.update(legacyRef, { balanceMigrationApproved: true, balanceMigrationApprovedBy: adminProfile.uid, approvedBalances: approved, balanceMigrationPendingLink: true, balanceMigrationReviewedAt: FV.serverTimestamp() });
      tx.set(ledgerDoc(`migration-${legacyId}`), { id: `migration-${legacyId}`, kind: 'legacy_balance_migration_review', legacyId, role, actorUid: adminProfile.uid, applied: false, reason: 'waiting_for_auth_link', approvedBalances: approved, createdAt: FV.serverTimestamp(), createdAtMs: Date.now() }, { merge: true });
      output.status = 'approved_waiting_for_link'; output.legacyId = legacyId; output.approvedBalances = approved; return;
    }
    const targetUid = profiles[0].id, accountRef = accountDoc(targetUid);
    const [accountSnap, ownerTransactions, actorTransactions] = await Promise.all([
      tx.get(accountRef), tx.get(db.collection('transactions').where('ownerUid', '==', targetUid).limit(1)), tx.get(db.collection('transactions').where('actorUid', '==', targetUid).limit(1))
    ]);
    const current = accountSnap.exists ? accountSnap.data() : {};
    if (Number(current.balanceDOP || 0) !== 0 || Number(current.balanceHTG || 0) !== 0 || Number(current.commissionDOP || 0) !== 0 || Number(current.commissionHTG || 0) !== 0 || !ownerTransactions.empty || !actorTransactions.empty) {
      fail('failed-precondition', 'La cuenta ya tiene balances o historial de operaciones. No se sobrescribió; requiere conciliación manual.');
    }
    const accountData = { uid: targetUid, role: 'remitente', legacyId, balanceMigrationApproved: true, balanceMigrationApprovedBy: adminProfile.uid, updatedAt: FV.serverTimestamp() };
    for (const key of amountKeys) if (Object.prototype.hasOwnProperty.call(approved, key)) accountData[key] = approved[key];
    for (const key of amountKeys) if (!Object.prototype.hasOwnProperty.call(accountData, key)) accountData[key] = 0;
    tx.set(accountRef, accountData, { merge: true });
    tx.update(legacyRef, { balanceMigrationApproved: true, balanceMigrationAppliedAt: FV.serverTimestamp(), balanceMigrationApprovedBy: adminProfile.uid, approvedBalances: approved, balanceMigrationPendingLink: false });
    tx.set(ledgerDoc(`migration-${legacyId}`), { id: `migration-${legacyId}`, kind: 'legacy_balance_migration', legacyId, actorUid: adminProfile.uid, targetUid, role, applied: true, approvedBalances: approved, createdAt: FV.serverTimestamp(), createdAtMs: Date.now() }, { merge: true });
    addNotices(tx, [targetUid], `balance-migration-${legacyId}`, { type: 'balance', title: 'Balances reconciliados', message: 'Administración ha conciliado los saldos RD$ y HTG/GDES según los registros aprobados.', section: 'dashboard', targetUid });
    output.status = 'applied'; output.legacyId = legacyId; output.targetUid = targetUid; output.approvedBalances = approved;
  });
  return { ok: true, ...output };
});

exports.adjustAccount = callable(async (data, context) => {
  const actor = await requireAdmin(context);
  let uid = text(data.uid || data.targetUid, 140);
  // Allow admin-facing controls to pass a legacy account ID; always resolve to
  // the canonical Firebase UID before reading/writing financial documents.
  if (uid && !['admin', 'operations'].includes(uid)) {
    const resolvedTarget = await resolveProfile(uid);
    if (!resolvedTarget) fail('not-found', 'No se encontró el perfil de la cuenta a ajustar. Vincula la cuenta antes de modificar sus importes.');
    uid = resolvedTarget.uid;
  }
  const currency = domain.normalizeCurrency(data.currency || data.currencyCode);
  const kind = String(data.kind || '').trim().toLowerCase();
  const reason = text(data.reason, 400);
  const supplied = Number(data.value ?? data.amount);
  const requestId = cleanId(data.idempotencyKey || data.id);
  if (!uid || !currency || !['balance', 'commission'].includes(kind) || !reason || !Number.isFinite(supplied) || !requestId) fail('invalid-argument', 'Completa cuenta, moneda, tipo, importe, motivo y clave de idempotencia.');
  if (uid === 'operations' && (kind !== 'balance' || currency !== 'HTG')) {
    fail('invalid-argument', 'El fondo operativo compartido de los agentes solo admite ajustes de balance en HTG/GDES.');
  }
  const ref = uid === 'admin' ? systemDoc(SYSTEM_ADMIN_ID) : (uid === 'operations' ? systemDoc(SYSTEM_OPERATIONS_ID) : accountDoc(uid));
  const field = moneyField(currency, kind);
  const auditRef = db.collection('auditLogs').doc(`adjust-${requestId}`);
  const agentsForNotice = uid === 'operations' ? await listAgentUids() : [];
  let result;
  await db.runTransaction(async tx => {
    let profileSnap = null;
    const readTasks = [tx.get(auditRef), tx.get(ref)];
    if (uid !== 'admin' && uid !== 'operations') readTasks.push(tx.get(db.collection('profiles').doc(uid)));
    const readResults = await Promise.all(readTasks);
    const auditSnap = readResults[0];
    const snap = readResults[1];
    if (readResults.length > 2) profileSnap = readResults[2];
    if (auditSnap.exists) {
      const saved = auditSnap.data();
      if (saved.actorUid !== actor.uid || saved.targetUid !== uid || saved.balanceKind !== kind || saved.currencyCode !== currency || Number(saved.requestValue) !== supplied || saved.requestMode !== (data.mode === 'set' ? 'set' : 'increment')) {
        fail('already-exists', 'La clave de ajuste ya se utilizó con datos distintos.');
      }
      result = { ok: true, uid, field, before: saved.before, after: saved.after, amount: saved.amount, currency, repeated: true };
      return;
    }
    if (uid !== 'admin' && uid !== 'operations') {
      if (!profileSnap?.exists) fail('not-found', 'No se encontró el perfil de la cuenta a ajustar.');
      const targetProfile = profileSnap.data();
      if (domain.normalizeRole(targetProfile.role) !== 'remitente') fail('failed-precondition', 'Los agentes no tienen balance ni comisión personal. Solo se puede ajustar una cuenta de remitente o la cuenta administrativa.');
      if (!['active', 'approved', 'aprobado', 'activo'].includes(String(targetProfile.status || '').toLowerCase())) fail('failed-precondition', 'El perfil no está activo.');
    }
    const old = snap.exists ? snap.data() : {};
    const before = Number(old[field] || 0);
    const after = data.mode === 'set' ? domain.round2(supplied) : domain.round2(before + supplied);
    if (after < 0) fail('failed-precondition', 'El ajuste no puede dejar el balance o la comisión por debajo de cero.');
    tx.set(ref, { [field]: after, updatedAt: FV.serverTimestamp() }, { merge: true });
    tx.create(auditRef, { kind: 'account_adjustment', actorUid: actor.uid, targetUid: uid, balanceKind: kind, currencyCode: currency, field, before, after, amount: domain.round2(after - before), requestValue: supplied, requestMode: data.mode === 'set' ? 'set' : 'increment', reason, createdAt: FV.serverTimestamp(), createdAtMs: Date.now() });
    if (uid === 'operations') {
      addNotices(tx, agentsForNotice, auditRef.id, { type: 'account_adjustment', title: 'Fondo operativo actualizado', message: `Administración ajustó el fondo compartido de operaciones en HTG/GDES.`, section: 'dashboard', currencyCode: currency, amount: domain.round2(after - before) });
    } else if (uid !== 'admin') {
      addNotices(tx, [uid], auditRef.id, { type: 'account_adjustment', title: 'Balance actualizado por Administración', message: `${kind === 'commission' ? 'Comisión' : 'Balance'} ${currencyLabel(currency)} actualizado. Motivo: ${reason}`, section: 'dashboard' });
    }
    result = { ok: true, uid, field, before, after, amount: domain.round2(after - before), currency };
  });
  return result;
});

exports.payCommission = callable(async (data, context) => {
  const actor = await requireProfile(context);
  if (!['remitente', 'admin'].includes(actor.role)) fail('permission-denied', 'Solo un remitente o el administrador puede mover comisión a balance.');
  const amount = domain.parseAmount(data.amount ?? data.monto);
  const currency = domain.normalizeCurrency(data.currency || data.currencyCode);
  if (amount === null || !currency) fail('invalid-argument', 'Indica un importe válido y la moneda de la comisión.');
  const id = cleanId(data.idempotencyKey || data.id);
  if (!id) fail('invalid-argument', 'Falta la clave de idempotencia del movimiento para impedir descuentos duplicados.');

  let target = actor;
  if (actor.role === 'admin') {
    const requestedTarget = text(data.targetUid || data.accountId || data.targetId, 140);
    if (requestedTarget && requestedTarget.toLowerCase() !== 'admin' && requestedTarget !== actor.uid) {
      target = await resolveProfile(requestedTarget);
      if (!target) fail('not-found', 'No se encontró el remitente destinatario del movimiento de comisión.');
      if (domain.normalizeRole(target.role) !== 'remitente') fail('failed-precondition', 'Los agentes no tienen comisión ni wallet personal; seleccione un remitente.');
      if (!['active', 'approved', 'aprobado', 'activo'].includes(String(target.status || '').toLowerCase())) fail('failed-precondition', 'El remitente no está activo.');
    }
  }
  if (target.role === 'agent') fail('failed-precondition', 'Los agentes no reciben comisión personal.');
  const targetUid = target.uid || actor.uid;
  const accountRef = target.role === 'admin' ? systemDoc(SYSTEM_ADMIN_ID) : accountDoc(targetUid);
  const ledgerRef = ledgerDoc(`commission-payout-${actor.uid}-${id}`);
  const receiptId = `CMP-COM-${cleanId(targetUid).slice(-40)}-${id}`;
  const receiptRef = db.collection('receipts').doc(receiptId);
  const admins = await listAdminUids();
  let result;
  await db.runTransaction(async tx => {
    const [accountSnap, existingLedger, receiptSnap] = await Promise.all([
      tx.get(accountRef), tx.get(ledgerRef), tx.get(receiptRef)
    ]);
    if (existingLedger.exists) {
      const oldPayment = existingLedger.data();      if (oldPayment.actorUid !== actor.uid || oldPayment.targetUid !== targetUid || Number(oldPayment.amount) !== amount || oldPayment.currencyCode !== currency) {
        fail('already-exists', 'La clave del movimiento ya se utilizó con datos distintos.');
      }
      result = { ok: true, id, repeated: true, targetUid, remaining: oldPayment.commissionAfter, balance: oldPayment.balanceAfter, receiptId: oldPayment.receiptId || receiptId, amount, currency };
      return;
    }
    const account = accountSnap.exists ? accountSnap.data() : {};
    const commissionField = moneyField(currency, 'commission');
    const balanceField = moneyField(currency, 'balance');
    const commissionBefore = Number(account[commissionField] || 0);
    const balanceBefore = Number(account[balanceField] || 0);
    if (commissionBefore < amount) fail('failed-precondition', `Comisión insuficiente. Disponible: ${commissionBefore} ${currencyLabel(currency)}.`);
    const commissionAfter = domain.round2(commissionBefore - amount);
    const balanceAfter = domain.round2(balanceBefore + amount);
    const now = Date.now();
    const targetRole = target.role === 'admin' ? 'admin' : 'remitente';
    const receipt = {
      id: receiptId, receiptId, operationId: id, type: 'Movimiento de comisión', route: 'Comisión transferida al balance',
      amount, currency: currencyLabel(currency), currencyCode: currency,
      receivedAmount: amount, receivedCurrency: currencyLabel(currency),
      beneficiary: text(target.displayName || target.name || actor.displayName || actor.name || target.email, 180),
      beneficiaryPhone: text(target.phone, 60), ownerUid: targetUid, ownerRole: targetRole,
      ownerLegacyId: text(target.legacyId || target.accountId || target.code || targetUid, 140),
      ownerName: text(target.displayName || target.name || target.email, 180),
      createdByUid: actor.uid, createdByRole: actor.role,
      actorLegacyId: text(actor.legacyId || actor.accountId || actor.code || actor.uid, 140),
      recipientUids: [...new Set([targetUid, actor.uid, ...admins])],
      approvedByName: text(actor.displayName || actor.name || actor.email, 180),
      approvedAt: FV.serverTimestamp(), approvedAtMs: now, createdAtMs: now, status: 'Aprobado'
    };
    tx.set(accountRef, { [commissionField]: commissionAfter, [balanceField]: balanceAfter, updatedAt: FV.serverTimestamp() }, { merge: true });
    tx.create(ledgerRef, {
      id: `commission-payout-${id}`, operationId: id, kind: 'commission_payout', actorUid: actor.uid,
      ownerUid: targetUid, targetUid, targetRole, amount, currencyCode: currency,
      commissionBefore, commissionAfter, balanceBefore, balanceAfter, receiptId,
      createdAt: FV.serverTimestamp(), createdAtMs: now
    });
    if (!receiptSnap.exists) tx.create(receiptRef, receipt);
    addNotices(tx, [...admins, targetUid], `commission-payout-notice-${actor.uid}-${id}`, {
      type: 'commission_payout', title: 'Movimiento de comisión completado',
      message: `${text(target.displayName || target.name || target.email, 160)} movió ${amount} ${currencyLabel(currency)} de comisión a su balance. Comprobante disponible.`,
      section: 'comisiones', amount, currencyCode: currency, receiptId
    });
    result = { ok: true, id, targetUid, targetRole, amount, currency, remaining: commissionAfter, balance: balanceAfter, receiptId };
  });
  return result;
});


// Official bank accounts: shared reference data, management strictly by administration.
exports.saveBankAccount = callable(async (data, context) => {
  const actor = await requireAdmin(context);
  const bank = text(data.bank || data.banco, 100);
  const number = text(data.number || data.numero, 100);
  const holder = text(data.holder || data.titular || '', 180);
  if (!bank || !number) fail('invalid-argument', 'Banco y número de cuenta son obligatorios.');
  let id = text(data.id, 120);
  const requestKey = cleanId(data.idempotencyKey);
  if (!id && !requestKey) fail('invalid-argument', 'Falta clave de solicitud para guardar la cuenta de forma segura.');
  if (!id) id = `bank-${cleanId(actor.uid)}-${requestKey}`.slice(0, 140);
  const ref = db.collection('bankAccounts').doc(cleanId(id));
  const auditRef = db.collection('auditLogs').doc(`bank-save-${cleanId(actor.uid)}-${cleanId(requestKey || id)}`);
  let result;
  await db.runTransaction(async tx => {
    const [currentSnap, auditSnap] = await Promise.all([tx.get(ref), tx.get(auditRef)]);
    if (auditSnap.exists && currentSnap.exists) {
      const old = currentSnap.data();
      if (old.bank !== bank || old.number !== number || old.holder !== holder) fail('already-exists', 'La clave de esta solicitud ya se usó con otros datos.');
      result = { ok: true, id: ref.id, repeated: true };
      return;
    }
    const now = Date.now();
    const value = { bank, number, holder, label: `${bank} - ${number}`, value: `${bank} ${number}`, active: true, createdByUid: currentSnap.exists ? (currentSnap.data().createdByUid || actor.uid) : actor.uid, createdAt: currentSnap.exists ? (currentSnap.data().createdAt || FV.serverTimestamp()) : FV.serverTimestamp(), updatedAt: FV.serverTimestamp(), updatedAtMs: now };
    tx.set(ref, value, { merge: true });
    tx.set(auditRef, { kind: 'bank_account_saved', actorUid: actor.uid, bankAccountId: ref.id, action: currentSnap.exists ? 'update' : 'create', createdAt: FV.serverTimestamp(), createdAtMs: now });
    result = { ok: true, id: ref.id, repeated: false };
  });
  return result;
});

exports.deleteBankAccount = callable(async (data, context) => {
  const actor = await requireAdmin(context);
  const id = cleanId(data.id);
  if (!id) fail('invalid-argument', 'Falta la cuenta bancaria.');
  const ref = db.collection('bankAccounts').doc(id);
  const requestKey = cleanId(data.idempotencyKey || `${id}-${Date.now()}`);
  const auditRef = db.collection('auditLogs').doc(`bank-disable-${cleanId(actor.uid)}-${requestKey}`);
  await db.runTransaction(async tx => {
    const [snap, audit] = await Promise.all([tx.get(ref), tx.get(auditRef)]);
    if (audit.exists) return;
    if (!snap.exists) fail('not-found', 'La cuenta bancaria ya no existe.');
    tx.update(ref, { active: false, updatedAt: FV.serverTimestamp(), updatedAtMs: Date.now(), disabledByUid: actor.uid });
    tx.create(auditRef, { kind: 'bank_account_disabled', actorUid: actor.uid, bankAccountId: id, createdAt: FV.serverTimestamp(), createdAtMs: Date.now() });
  });
  return { ok: true, id };
});

// Logistics/tracking records only. The declared cost is not a balance movement;
// any payable amount must be registered as a separate approved financial operation.
exports.savePackage = callable(async (data, context) => {
  const actor = await requireProfile(context);
  const sender = text(data.sender || data.remitente, 180);
  const weight = domain.parseAmount(data.weight ?? data.peso);
  const origin = text(data.origin || data.origen, 220);
  const destination = text(data.destination || data.destino, 220);
  const packageType = text(data.packageType || data.tipo || 'Envio', 40);
  const declaredCost = data.cost == null || data.cost === '' ? 0 : domain.parseAmount(data.cost);
  const tracking = text(data.tracking || '', 120);
  const requestKey = cleanId(data.idempotencyKey);
  if (!sender || !Number.isFinite(weight) || weight <= 0 || !origin || !destination) {
    fail('invalid-argument', 'Remitente, peso mayor que cero, origen y destino son obligatorios.');
  }
  if (!Number.isFinite(declaredCost) || declaredCost < 0) fail('invalid-argument', 'El costo informado no es válido.');
  if (!tracking || !requestKey) fail('invalid-argument', 'Falta tracking o clave de solicitud.');
  const id = `pkg-${cleanId(actor.uid)}-${requestKey}`.slice(0, 140);
  const ref = db.collection('packages').doc(id);
  const signature = crypto.createHash('sha256').update(JSON.stringify({ sender, weight, origin, destination, packageType, declaredCost, tracking })).digest('hex');
  const admins = await listAdminUids();
  let result;
  await db.runTransaction(async tx => {
    const oldSnap = await tx.get(ref);
    if (oldSnap.exists) {
      const old = oldSnap.data();
      if (old.requestSignature !== signature) fail('already-exists', 'La clave de esta solicitud ya fue usada con datos diferentes.');
      result = { ok: true, id: ref.id, tracking: old.tracking, repeated: true };
      return;
    }
    const now = Date.now();
    tx.create(ref, { id: ref.id, tracking, sender, weight, origin, destination, packageType, declaredCost, status: 'Pendiente', ownerUid: actor.uid, ownerRole: actor.role, ownerName: text(actor.displayName || actor.name || actor.email, 180), createdByUid: actor.uid, createdByRole: actor.role, createdAt: FV.serverTimestamp(), createdAtMs: now, requestSignature: signature, updatedAt: FV.serverTimestamp(), updatedAtMs: now });
    addNotices(tx, admins, `package-created-${ref.id}`, { type: 'package', title: 'Nuevo paquete registrado', message: `Se registró el paquete ${tracking} para seguimiento.`, section: 'paquetes', packageId: ref.id });
    tx.set(db.collection('auditLogs').doc(`package-create-${ref.id}`), { kind: 'package_created', actorUid: actor.uid, packageId: ref.id, tracking, createdAt: FV.serverTimestamp(), createdAtMs: now });
    result = { ok: true, id: ref.id, tracking, repeated: false };
  });
  return result;
});

exports.updatePackageStatus = callable(async (data, context) => {
  const actor = await requireAdmin(context);
  const id = cleanId(data.id);
  const status = text(data.status, 40);
  const allowed = ['Pendiente', 'Recibido', 'En tránsito', 'En reparto', 'Entregado', 'Incidencia', 'Cancelado'];
  if (!id || !allowed.includes(status)) fail('invalid-argument', 'ID o estado de paquete inválido.');
  const ref = db.collection('packages').doc(id);
  const requestKey = cleanId(data.idempotencyKey || `${id}-${status}-${Date.now()}`);
  const auditRef = db.collection('auditLogs').doc(`package-status-${cleanId(actor.uid)}-${requestKey}`);
  await db.runTransaction(async tx => {
    const [snap, auditSnap] = await Promise.all([tx.get(ref), tx.get(auditRef)]);
    if (auditSnap.exists) return;
    if (!snap.exists) fail('not-found', 'No se encontró el paquete.');
    const old = snap.data();
    tx.update(ref, { status, updatedAt: FV.serverTimestamp(), updatedAtMs: Date.now(), updatedByUid: actor.uid });
    tx.create(auditRef, { kind: 'package_status_changed', actorUid: actor.uid, packageId: id, oldStatus: old.status || '', newStatus: status, createdAt: FV.serverTimestamp(), createdAtMs: Date.now() });
    if (old.ownerUid) addNotices(tx, [old.ownerUid], `package-status-${id}-${requestKey}`, { type: 'package_status', title: 'Actualización de paquete', message: `El paquete ${old.tracking} cambió a: ${status}.`, section: 'paquetes', packageId: id });
  });
  return { ok: true, id, status };
});


exports.updatePackageDetails = callable(async (data, context) => {
  const actor = await requireAdmin(context);
  const id = cleanId(data.id);
  if (!id) fail('invalid-argument', 'Falta el ID del paquete.');
  const sender = text(data.sender || data.remitente, 180);
  const weight = domain.parseAmount(data.weight ?? data.peso);
  const origin = text(data.origin || data.origen, 220);
  const destination = text(data.destination || data.destino, 220);
  const packageType = text(data.packageType || data.tipo || 'Envio', 40);
  const declaredCost = data.cost == null || data.cost === '' ? 0 : domain.parseAmount(data.cost);
  const tracking = text(data.tracking || '', 120);
  const requestKey = cleanId(data.idempotencyKey);
  if (!sender || !Number.isFinite(weight) || weight <= 0 || !origin || !destination || !tracking || !requestKey) fail('invalid-argument', 'Remitente, peso, origen, destino, tracking y clave de solicitud son obligatorios.');
  if (!Number.isFinite(declaredCost) || declaredCost < 0) fail('invalid-argument', 'El costo informado no es válido.');
  const ref = db.collection('packages').doc(id);
  const auditRef = db.collection('auditLogs').doc(`package-edit-${cleanId(actor.uid)}-${requestKey}`);
  await db.runTransaction(async tx => {
    const [snap, auditSnap] = await Promise.all([tx.get(ref), tx.get(auditRef)]);
    if (auditSnap.exists) return;
    if (!snap.exists) fail('not-found', 'No se encontró el paquete.');
    const old = snap.data();
    if (['Entregado', 'Cancelado'].includes(String(old.status || ''))) fail('failed-precondition', 'Un paquete entregado o cancelado no se puede modificar.');
    const now = Date.now();
    const changed = { sender, weight, origin, destination, packageType, declaredCost, tracking, updatedByUid: actor.uid, updatedAt: FV.serverTimestamp(), updatedAtMs: now };
    tx.update(ref, changed);
    tx.create(auditRef, { kind: 'package_details_updated', actorUid: actor.uid, packageId: id, before: { sender: old.sender || '', weight: old.weight || 0, origin: old.origin || '', destination: old.destination || '', packageType: old.packageType || '', declaredCost: old.declaredCost || 0, tracking: old.tracking || '' }, after: { sender, weight, origin, destination, packageType, declaredCost, tracking }, createdAt: FV.serverTimestamp(), createdAtMs: now });
    if (old.ownerUid) addNotices(tx, [old.ownerUid], `package-edit-notice-${id}-${requestKey}`, { type: 'package_updated', title: 'Datos del paquete actualizados', message: `Se actualizaron los datos del paquete ${tracking}.`, section: 'paquetes', packageId: id });
  });
  return { ok: true, id };
});


exports.saveReconciliation = callable(async (data, context) => {
  const actor = await requireAdmin(context);
  const concept = text(data.concept || data.concepto, 240);
  const amount = domain.parseAmount(data.amount ?? data.monto);
  const rawCurrency = String(data.currency || data.moneda || 'DOP').trim().toUpperCase();
  const currency = ['HTG', 'GDES'].includes(rawCurrency) ? 'HTG' : ['DOP', 'RD$', 'RD'].includes(rawCurrency) ? 'DOP' : '';
  const requestKey = cleanId(data.idempotencyKey);
  const editId = cleanId(data.id);
  if (!concept || !Number.isFinite(amount) || amount <= 0 || !currency || !requestKey) fail('invalid-argument', 'Concepto, monto mayor que cero, moneda y clave de solicitud son obligatorios.');
  const ref = editId ? db.collection('reconciliations').doc(editId) : db.collection('reconciliations').doc(`rec-${cleanId(actor.uid)}-${requestKey}`.slice(0, 140));
  const auditRef = db.collection('auditLogs').doc(`reconciliation-${editId ? 'edit' : 'create'}-${cleanId(actor.uid)}-${requestKey}`);
  const signature = crypto.createHash('sha256').update(JSON.stringify({ concept, amount: domain.round2(amount), currency })).digest('hex');
  let result;
  await db.runTransaction(async tx => {
    const [snap, auditSnap] = await Promise.all([tx.get(ref), tx.get(auditRef)]);
    if (!editId && snap.exists) {
      if (snap.data().requestSignature !== signature) fail('already-exists', 'La clave de esta solicitud ya se usó con otros datos.');
      result = { ok: true, id: ref.id, repeated: true };
      return;
    }
    if (auditSnap.exists) { result = { ok: true, id: ref.id, repeated: true }; return; }
    const now = Date.now();
    if (editId) {
      if (!snap.exists) fail('not-found', 'No se encontró la conciliación.');
      if (String(snap.data().status || 'Pendiente') !== 'Pendiente') fail('failed-precondition', 'Sólo se puede modificar una conciliación pendiente.');
      tx.update(ref, { concept, amount: domain.round2(amount), currencyCode: currency, moneda: currency === 'HTG' ? 'HTG' : 'RD$', updatedAt: FV.serverTimestamp(), updatedAtMs: now });
    } else {
      tx.create(ref, { id: ref.id, concept, amount: domain.round2(amount), currencyCode: currency, moneda: currency === 'HTG' ? 'HTG' : 'RD$', status: 'Pendiente', estado: 'Pendiente', createdByUid: actor.uid, createdByName: text(actor.displayName || actor.name || actor.email, 180), createdAt: FV.serverTimestamp(), createdAtMs: now, updatedAt: FV.serverTimestamp(), updatedAtMs: now, requestSignature: signature });
    }
    tx.create(auditRef, { kind: editId ? 'reconciliation_updated' : 'reconciliation_created', actorUid: actor.uid, reconciliationId: ref.id, concept, amount: domain.round2(amount), currencyCode: currency, createdAt: FV.serverTimestamp(), createdAtMs: now });
    result = { ok: true, id: ref.id, repeated: false };
  });
  return result;
});

exports.cancelReconciliation = callable(async (data, context) => {
  const actor = await requireAdmin(context);
  const id = cleanId(data.id);
  const requestKey = cleanId(data.idempotencyKey);
  if (!id || !requestKey) fail('invalid-argument', 'Falta ID o clave de solicitud.');
  const ref = db.collection('reconciliations').doc(id);
  const auditRef = db.collection('auditLogs').doc(`reconciliation-cancel-${cleanId(actor.uid)}-${requestKey}`);
  await db.runTransaction(async tx => {
    const [snap, auditSnap] = await Promise.all([tx.get(ref), tx.get(auditRef)]);
    if (auditSnap.exists) return;
    if (!snap.exists) fail('not-found', 'No se encontró la conciliación.');
    tx.update(ref, { status: 'Cancelado', estado: 'Cancelado', updatedAt: FV.serverTimestamp(), updatedAtMs: Date.now(), cancelledByUid: actor.uid });
    tx.create(auditRef, { kind: 'reconciliation_cancelled', actorUid: actor.uid, reconciliationId: id, createdAt: FV.serverTimestamp(), createdAtMs: Date.now() });
  });
  return { ok: true, id, status: 'Cancelado' };
});


exports.saveBeneficiary = callable(async (data, context) => {
  const actor = await requireProfile(context);
  const first = text(data.firstName || data.nombre, 100);
  const last = text(data.lastName || data.apellido, 100);
  const phone = text(data.phone, 60);
  const code = text(data.code || '', 20);
  const country = text(data.country || data.pais, 50);
  const requestKey = cleanId(data.idempotencyKey);
  const editId = cleanId(data.id);
  if (!first || !phone || !country || !requestKey) fail('invalid-argument', 'Nombre, celular, país y clave de solicitud son obligatorios.');
  const ref = editId ? db.collection('beneficiaries').doc(editId) : db.collection('beneficiaries').doc(`ben-${cleanId(actor.uid)}-${requestKey}`.slice(0, 140));
  const auditRef = db.collection('auditLogs').doc(`beneficiary-${editId ? 'edit' : 'create'}-${cleanId(actor.uid)}-${requestKey}`);
  const signature = crypto.createHash('sha256').update(JSON.stringify({ first, last, phone, code, country })).digest('hex');
  let result;
  await db.runTransaction(async tx => {
    const [snap, auditSnap] = await Promise.all([tx.get(ref), tx.get(auditRef)]);
    if (!editId && snap.exists) {
      if (snap.data().requestSignature !== signature) fail('already-exists', 'La clave ya se utilizó con otro beneficiario.');
      result = { ok: true, id: ref.id, repeated: true }; return;
    }
    if (auditSnap.exists) { result = { ok: true, id: ref.id, repeated: true }; return; }
    if (editId && !snap.exists) fail('not-found', 'No se encontró el beneficiario.');
    if (editId && snap.data().createdByUid !== actor.uid && actor.role !== 'admin') fail('permission-denied', 'Sólo el administrador o quien registró el beneficiario puede modificarlo.');
    const now = Date.now();
    const value = { firstName:first, lastName:last, name:`${first} ${last}`.trim(), phone, code, country, active:true, updatedAt:FV.serverTimestamp(), updatedAtMs:now };
    if (!editId) Object.assign(value,{ createdByUid:actor.uid, createdByRole:actor.role, createdAt:FV.serverTimestamp(), createdAtMs:now, requestSignature:signature });
    tx.set(ref,value,{merge:true});
    tx.create(auditRef,{kind:editId?'beneficiary_updated':'beneficiary_created',actorUid:actor.uid,beneficiaryId:ref.id,createdAt:FV.serverTimestamp(),createdAtMs:now});
    result={ok:true,id:ref.id,repeated:false};
  });
  return result;
});

exports.deleteBeneficiary = callable(async (data, context) => {
  const actor = await requireProfile(context);
  const id = cleanId(data.id), requestKey = cleanId(data.idempotencyKey);
  if (!id || !requestKey) fail('invalid-argument', 'Falta ID o clave de solicitud.');
  const ref = db.collection('beneficiaries').doc(id);
  const auditRef = db.collection('auditLogs').doc(`beneficiary-disable-${cleanId(actor.uid)}-${requestKey}`);
  await db.runTransaction(async tx=>{
    const [snap,auditSnap]=await Promise.all([tx.get(ref),tx.get(auditRef)]);
    if(auditSnap.exists)return;
    if(!snap.exists)fail('not-found','No se encontró el beneficiario.');
    if(snap.data().createdByUid!==actor.uid&&actor.role!=='admin')fail('permission-denied','Sólo el administrador o quien registró el beneficiario puede desactivarlo.');
    tx.update(ref,{active:false,updatedAt:FV.serverTimestamp(),updatedAtMs:Date.now(),disabledByUid:actor.uid});
    tx.create(auditRef,{kind:'beneficiary_disabled',actorUid:actor.uid,beneficiaryId:id,createdAt:FV.serverTimestamp(),createdAtMs:Date.now()});
  });
  return {ok:true,id};
});