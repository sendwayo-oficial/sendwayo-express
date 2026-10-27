// Reglas financieras puras de SENDWAYO EXPRESS. Sin acceso a Firebase ni al navegador.
'use strict';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeRole(value) {
  const role = normalizeText(value);
  if (['admin', 'administrador', 'administrator'].includes(role)) return 'admin';
  if (['agent', 'agente'].includes(role)) return 'agent';
  if (['remitente', 'remittente', 'sender', 'remitter', 'expedidor'].includes(role)) return 'remitente';
  return role;
}

function normalizeAction(value) {
  const action = normalizeText(value).replace(/[ _-]+/g, '');
  if (['approve', 'approved', 'aprobar', 'aprobado'].includes(action)) return 'Aprobado';
  if (['reject', 'rejected', 'rechazar', 'rechazado'].includes(action)) return 'Rechazado';
  if (['nomatch', 'nocoincide', 'noencaja', 'mismatch'].includes(action)) return 'No Coincide';
  return null;
}

function money(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function isDeposit(collection) {
  return normalizeText(collection) === 'deposits';
}

function isCommissionWithdrawal(collection, record = {}) {
  return normalizeText(collection) === 'commissions' &&
    normalizeText(record.accountingType || '') === 'comision_retiro';
}

function isWithdrawal(collection, record = {}) {
  return normalizeText(collection) === 'accountwithdrawals' ||
    /retiro|withdraw/.test(normalizeText(record.type || record.category));
}

function isService(record = {}) {
  return /recarga|paquetico|paquetito|factura|servicio/.test(
    normalizeText(record.type || record.category || record.routeFull)
  );
}

function isHaitiToHaiti(record = {}) {
  const route = normalizeText([
    record.route, record.routeFull, record.originCountry, record.destinationCountry
  ].filter(Boolean).join(' '));
  const explicitCountries = normalizeText(record.originCountry) === 'ht' &&
    normalizeText(record.destinationCountry) === 'ht';
  return explicitCountries ||
    /ht\s*(?:->|→|a|to|-)\s*ht/.test(route) ||
    /haiti\s*(?:->|→|a|to|-)\s*haiti/.test(route);
}

function usesHaitiWalletTable(record = {}) {
  const method = normalizeText([
    record.method, record.provider, record.route, record.routeFull
  ].filter(Boolean).join(' '));
  return isHaitiToHaiti(record) && /(natcash|moncash)/.test(method);
}

// Tabla local HT -> HT del proyecto existente. Debe mantenerse alineada con
// la tabla aprobada por administración antes de habilitar dinero real.
function localSendFee(amount) {
  if (amount < 20 || amount > 99999) return 0;
  if (amount < 500) return 0;
  if (amount < 1000) return 6;
  if (amount < 2000) return 18;
  if (amount < 4000) return 25;
  if (amount < 8000) return 35;
  if (amount < 12000) return 54;
  if (amount < 20000) return 63;
  if (amount < 40000) return 68;
  if (amount < 60000) return 90;
  if (amount < 75000) return 108;
  return 115;
}

function localWithdrawalFee(amount) {
  if (amount < 20 || amount > 99999) return 0;
  if (amount < 100) return 6;
  if (amount < 250) return 12;
  if (amount < 500) return 15;
  if (amount < 1000) return 28;
  if (amount < 2000) return 46;
  if (amount < 4000) return 25;
  if (amount < 8000) return 130;
  if (amount < 12000) return 248;
  if (amount < 20000) return 342;
  if (amount < 40000) return 576;
  if (amount < 60000) return 945;
  if (amount < 75000) return 1260;
  return 1440;
}

function currencyFor(record = {}, collection = '') {
  if (isCommissionWithdrawal(collection, record) || isDeposit(collection)) {
    const requested = String(record.currency || record.balanceCurrency || 'DOP').toUpperCase();
    if (['HTG', 'GDES'].includes(requested)) return 'HTG';
    if (['DOP', 'RD$', 'RD', 'PESO', 'PESOS'].includes(requested)) return 'DOP';
    throw new Error('La moneda debe ser DOP o HTG.');
  }
  return usesHaitiWalletTable(record) ? 'HTG' : 'DOP';
}

function commissionFor(record = {}, collection = '', amount) {
  if (isDeposit(collection) || isCommissionWithdrawal(collection, record)) return 0;
  if (usesHaitiWalletTable(record)) {
    return money(isWithdrawal(collection, record) ? localWithdrawalFee(amount) : localSendFee(amount));
  }
  return money(amount * (isService(record) ? 0.05 : 0.08));
}

function canReview({ actorRole, actorUid, actorKey, operation, collection, action }) {
  const role = normalizeRole(actorRole);
  if (!['admin', 'agent'].includes(role)) {
    return { allowed: false, reason: 'Solo un agente o el administrador puede revisar operaciones.' };
  }
  if (isDeposit(collection) && role !== 'admin') {
    return { allowed: false, reason: 'Solo el administrador puede revisar depósitos.' };
  }
  if (role === 'agent') {
    const creatorUid = String(operation.createdByAuthUid || '');
    const creatorKey = String(operation.createdByUserId || operation.createdById || '');
    if ((creatorUid && creatorUid === String(actorUid || '')) ||
        (creatorKey && actorKey && creatorKey === String(actorKey))) {
      return { allowed: false, reason: 'No puedes revisar ni aprobar una operación que tú mismo registraste.' };
    }
  }
  if (!action) return { allowed: false, reason: 'La decisión no es válida.' };
  return { allowed: true };
}

module.exports = {
  normalizeText,
  normalizeRole,
  normalizeAction,
  money,
  isDeposit,
  isCommissionWithdrawal,
  isWithdrawal,
  isService,
  isHaitiToHaiti,
  usesHaitiWalletTable,
  localSendFee,
  localWithdrawalFee,
  currencyFor,
  commissionFor,
  canReview
};
