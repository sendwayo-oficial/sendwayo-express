'use strict';

const ROLES = new Set(['admin', 'remitente', 'agent']);
const CURRENCIES = new Set(['DOP', 'HTG']);

function normalizeRole(value) {
  const v = String(value || '').trim().toLowerCase();
  const aliases = {
    administrador: 'admin', admin: 'admin',
    remitente: 'remitente', remitter: 'remitente',
    agente: 'agent', agent: 'agent'
  };
  const role = aliases[v] || '';
  return ROLES.has(role) ? role : null;
}

function normalizeCurrency(value) {
  const v = String(value || '').trim().toUpperCase().replace(/[.$\s]/g, '');
  if (['DOP', 'RD', 'RD$', 'PESO', 'PESOS'].includes(v)) return 'DOP';
  if (['HTG', 'GDES', 'GOURDE', 'GOURDES', 'HT'].includes(v)) return 'HTG';
  return null;
}

function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? round2(value) : null;
  let s = String(value ?? '').trim().replace(/\s/g, '');
  if (!s) return null;
  // Accept decimal comma and decimal point; remove obvious grouping separators.
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) s = parts[0].replace(/,/g, '') + '.' + parts[1];
    else s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function domainAmount(value) { return parseAmount(value); }

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function textOf(operation) {
  return [operation.type, operation.kind, operation.category, operation.serviceType,
    operation.route, operation.routeFull, operation.method, operation.provider,
    operation.destinationCountry, operation.originCountry, operation.origin, operation.destination]
    .filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isDominicanToHaiti(operation) {
  const origin = normalizeText(operation.originCountry || operation.origin);
  const destination = normalizeText(operation.destinationCountry || operation.destination);
  if (origin && destination) {
    const fromDop = /^(rd|rd\$|dominicana|republica dominicana|dominican republic|republica dominicana \(rd\))$/.test(origin);
    const toHaiti = /^(ht|haiti|haitian republic|republica de haiti)$/.test(destination);
    if (fromDop && toHaiti) return true;
  }
  const route = normalizeText(`${operation.route || ''} ${operation.routeFull || ''}`);
  return /(?:\brd\b|republica dominicana|dominican republic)\s*(?:-+|→|>|->|\ba\b|\bto\b)\s*(?:\bht\b|haiti|haitian republic)/.test(route);
}


function isUSAToHaiti(operation) {
  const origin = normalizeText(operation.originCountry || operation.origin);
  const destination = normalizeText(operation.destinationCountry || operation.destination);
  if (origin && destination) {
    const fromUS = /^(usa|us|estados unidos|united states|united states of america)$/.test(origin);
    const toHaiti = /^(ht|haiti|haitian republic|republica de haiti)$/.test(destination);
    if (fromUS && toHaiti) return true;
  }
  const route = normalizeText(`${operation.route || ''} ${operation.routeFull || ''}`);
  return /(?:\busa\b|\bus\b|estados unidos|united states)\s*(?:-+|→|>|->|\ba\b|\bto\b)\s*(?:\bht\b|haiti|haitian republic)/.test(route);
}

function isHaitiToDominican(operation) {
  const origin = normalizeText(operation.originCountry || operation.origin);
  const destination = normalizeText(operation.destinationCountry || operation.destination);
  if (origin && destination) {
    const fromHaiti = /^(ht|htg|haiti|haitian republic|republica de haiti|gdes|gourde|gourdes)$/.test(origin);
    const toDop = /^(rd|rd\$|dop|dop\$|dominicana|republica dominicana|dominican republic)$/.test(destination);
    if (fromHaiti && toDop) return true;
  }
  const route = normalizeText(`${operation.route || ''} ${operation.routeFull || ''}`);
  return /(?:\bht\b|\bhtg\b|haiti|haitian republic)\s*(?:->|→|>|-+|\ba\b|\bto\b)\s*(?:\brd\b|republica dominicana|dominican republic)/.test(route);
}

function countryBucket(value) {
  const v = normalizeText(value).replace(/\$/g, '');
  if (/^(rd|dop|peso|pesos|dominicana|republica dominicana|dominican republic|republica dominicana \(rd\))$/.test(v)) return 'DOP';
  if (/^(ht|htg|gdes|gourde|gourdes|haiti|haitian republic|republica de haiti)$/.test(v)) return 'HTG';
  if (/^(us|usa|usd|estados unidos|united states|united states of america)$/.test(v)) return 'USD';
  return null;
}

function routeCountryPair(operation) {
  const fromFields = countryBucket(operation.originCountry || operation.origin);
  const toFields = countryBucket(operation.destinationCountry || operation.destination);
  if (fromFields && toFields) return { from: fromFields, to: toFields };
  const route = normalizeText(`${operation.route || ''} ${operation.routeFull || ''}`);
  const pairs = [
    { from: 'DOP', to: 'HTG', re: /(?:^|[^a-z])(?:rd\$?|dop|dominicana|republica dominicana|dominican republic)\s*(?:->|→|>|-+|\bto\b|\ba\b)\s*(?:ht|htg|haiti|haitian republic|republica de haiti)(?:$|[^a-z])/ },
    { from: 'USD', to: 'HTG', re: /(?:^|[^a-z])(?:usa|us|usd|estados unidos|united states|united states of america)\s*(?:->|→|>|-+|\bto\b|\ba\b)\s*(?:ht|htg|haiti|haitian republic|republica de haiti)(?:$|[^a-z])/ },
    { from: 'HTG', to: 'DOP', re: /(?:^|[^a-z])(?:ht|htg|gdes|haiti|haitian republic|republica de haiti)\s*(?:->|→|>|-+|\bto\b|\ba\b)\s*(?:rd\$?|dop|dominicana|republica dominicana|dominican republic)(?:$|[^a-z])/ },
    { from: 'DOP', to: 'USD', re: /(?:^|[^a-z])(?:rd\$?|dop|dominicana|republica dominicana|dominican republic)\s*(?:->|→|>|-+|\bto\b|\ba\b)\s*(?:usa|us|usd|estados unidos|united states|united states of america)(?:$|[^a-z])/ },
    { from: 'USD', to: 'DOP', re: /(?:^|[^a-z])(?:usa|us|usd|estados unidos|united states|united states of america)\s*(?:->|→|>|-+|\bto\b|\ba\b)\s*(?:rd\$?|dop|dominicana|republica dominicana|dominican republic)(?:$|[^a-z])/ },
    { from: 'HTG', to: 'USD', re: /(?:^|[^a-z])(?:ht|htg|gdes|haiti|haitian republic|republica de haiti)\s*(?:->|→|>|-+|\bto\b|\ba\b)\s*(?:usa|us|usd|estados unidos|united states|united states of america)(?:$|[^a-z])/ }
  ];
  return pairs.find(pair => pair.re.test(route)) || null;
}

function isInternationalRoute(operation) {
  if (/international|internacional|envio internacional|envío internacional/.test(textOf(operation))) return true;
  const pair = routeCountryPair(operation);
  return !!pair && pair.from !== pair.to;
}

function receivedCurrencyForOperation(operation) {
  const pair = routeCountryPair(operation);
  if (pair) return pair.to;
  const explicit = String(operation.receivedCurrency || '').trim().toUpperCase();
  return explicit || null;
}

function isDeposit(operation) {
  return /deposit|deposito|dep[oó]sito/.test(textOf(operation));
}

function isHaitiToHaiti(operation) {
  const text = textOf(operation);
  const explicit = /ht\s*[-→>]+\s*ht|hait[iy]\s*(?:a|to|[-→>])\s*hait[iy]/.test(text);
  const countryFields = String(operation.originCountry || '').toLowerCase().includes('hait') && String(operation.destinationCountry || '').toLowerCase().includes('hait');
  const method = /nat.?cash|mon.?cash/.test(text);
  return (explicit || countryFields) && method;
}

function haitiWalletFee(amount) {
  const a = parseAmount(amount);
  if (a === null) throw new Error('Monto no válido.');
  if (a < 100) return 0;
  if (a < 250) return 5;
  if (a < 500) return 10;
  if (a < 1000) return 15;
  if (a < 2000) return 20;
  if (a === 2000) return 25;
  if (a <= 5000) return 50;
  if (a <= 9999) return 75;
  if (a <= 14999) return 90;
  if (a <= 19999) return 100;
  if (a <= 29999) return 105;
  if (a <= 49999) return 110;
  if (a <= 99999) return 115;
  return Math.round(a * 0.025);
}

function commissionRate(operation) {
  if (isDeposit(operation)) return 0;
  const text = textOf(operation);
  if (/recarga|paquetik|paquetico|factura|servicio|pago de servicio|top.?up/.test(text)) return 0.05;
  if (isHaitiToHaiti(operation)) return null; // Tarifa fija por tramos.
  if (isInternationalRoute(operation)) return 0.10;
  if (/\brd\b\s*(?:->|→|>|-+|\ba\b|\bto\b)\s*\brd\b/.test(text)) return 0.08;
  return 0.08;
}

function calculateCommission(operation) {
  const amount = parseAmount(operation.amount ?? operation.monto);
  if (amount === null) throw new Error('El monto debe ser un número finito mayor que cero.');
  if (isDeposit(operation)) return 0;
  if (isHaitiToHaiti(operation)) return haitiWalletFee(amount);
  const rate = commissionRate(operation);
  return round2(amount * rate);
}

function validateOperation(operation, actorRole) {
  const role = normalizeRole(actorRole);
  if (!role) throw new Error('Rol no autorizado.');
  const amount = parseAmount(operation.amount ?? operation.monto);
  if (amount === null) throw new Error('El monto debe ser un número finito mayor que cero.');
  const currency = normalizeCurrency(operation.currency ?? operation.moneda);
  if (!currency) throw new Error('Debe indicarse la moneda DOP o HTG.');
  if (role === 'agent') {
    if (!isHaitiToHaiti(operation)) throw new Error('El agente solo puede registrar operaciones Haití a Haití.');
    if (currency !== 'HTG') throw new Error('El agente debe registrar operaciones en HTG/GDES.');
  }
  if (isInternationalRoute(operation) && !isHaitiToHaiti(operation)) {
    const receiveCurrency = receivedCurrencyForOperation(operation);
    const legacyReceived = receiveCurrency === 'HTG' ? operation.htg : (receiveCurrency === 'DOP' ? operation.rd : null);
    if ((domainAmount(operation.receivedAmount) || domainAmount(legacyReceived)) === null) {
      const label = receiveCurrency === 'HTG' ? 'HTG/GDES' : receiveCurrency === 'DOP' ? 'RD$' : receiveCurrency === 'USD' ? 'USD' : 'la moneda de destino';
      throw new Error(`Indica el importe exacto que recibirá la persona en ${label}; no se inventará una tasa de cambio.`);
    }
  }
  return { amount, currency, isDeposit: isDeposit(operation), fee: calculateCommission({ ...operation, amount }) };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('009') && digits.length > 10) digits = digits.slice(2);
  if (digits.startsWith('509') && digits.length === 11) return digits.slice(3);
  if (digits.startsWith('1') && digits.length === 11) return digits.slice(1);
  return digits;
}

function legacySourceRank(row) {
  const explicit = Number(row?.sourcePriority);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const source = normalizeText(row?.source || row?.sourceSystem || row?.sourceLabel || row?.origin);
  if (['a', 'punto a', 'firebase a', 'sendwayo-express-app-101', 'app-101', 'primary'].includes(source)) return 2;
  if (['b', 'punto b', 'github pages', 'sendwayo-oficial', 'legacy', 'old'].includes(source)) return 1;
  return 0;
}

function firstDefined(rows, keys) {
  for (const row of rows) {
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
      const value = row[key];
      if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) continue;
      return { present: true, value };
    }
  }
  return { present: false, value: undefined };
}

function readNonNegativeAmount(rows, keys) {
  for (const row of rows) {
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
      const raw = row[key];
      if (raw === undefined || raw === null || raw === '') continue;
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) return { present: true, value: round2(n), field: key, source: row.source || row.sourceSystem || '' };
      return { present: false, value: undefined, invalid: true, field: key };
    }
  }
  return { present: false, value: undefined };
}

/**
 * Merge account rows exported from Point A and Point B without adding balances.
 * Point A has field priority. Missing fields can be filled from Point B; an
 * explicit zero remains a real value. Conflicting roles are withheld for review.
 */
function mergeLegacyAccounts(inputRows) {
  const rows = (Array.isArray(inputRows) ? inputRows : []).map((raw, index) => {
    const row = raw && typeof raw === 'object' ? { ...raw } : {};
    const email = normalizeEmail(row.email || row.authEmail || row.usernameEmail);
    const phone = normalizePhone(row.phone || row.telefono || row.celular || row.whatsapp);
    const role = normalizeRole(row.role || row.rol || row.tipoCuenta || row.accountRole);
    const legacyId = String(row.legacyId || row.accountId || row.id || row.code || row.codigo || '').trim();
    return { ...row, __index: index, __email: email, __phone: phone, __role: role, __legacyId: legacyId, __rank: legacySourceRank(row) };
  }).filter(row => row.__role && (row.__legacyId || row.__email || row.__phone));

  const parent = rows.map((_, i) => i);
  const root = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a, b) => { const ra = root(a), rb = root(b); if (ra !== rb) parent[rb] = ra; };
  const emailMap = new Map(), idMap = new Map();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (const [key, map] of [[row.__email, emailMap], [row.__legacyId.toLowerCase(), idMap]]) {
      if (!key) continue;
      if (map.has(key)) join(i, map.get(key)); else map.set(key, i);
    }
  }
  const phoneBuckets = new Map();
  rows.forEach((row, i) => {
    if (!row.__phone) return;
    if (!phoneBuckets.has(row.__phone)) phoneBuckets.set(row.__phone, []);
    phoneBuckets.get(row.__phone).push(i);
  });
  const ambiguousPhones = [];
  for (const [phone, indices] of phoneBuckets) {
    const distinctEmails = [...new Set(indices.map(i => rows[i].__email).filter(Boolean))];
    if (distinctEmails.length <= 1) {
      for (let j = 1; j < indices.length; j++) join(indices[0], indices[j]);
    } else {
      // Never merge two accounts that have different explicit e-mails just
      // because a family or office may share a telephone number.
      const noEmail = indices.filter(i => !rows[i].__email);
      if (noEmail.length) ambiguousPhones.push({ phone, rowIds: indices.map(i => rows[i].__legacyId).filter(Boolean) });
    }
  }
  const groups = new Map();
  rows.forEach((row, i) => { const r = root(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(row); });
  const accounts = [], conflicts = [];
  let duplicatesRemoved = 0;
  for (const group of groups.values()) {
    group.sort((a, b) => b.__rank - a.__rank || a.__index - b.__index);
    const roles = [...new Set(group.map(row => row.__role))];
    const emailSet = [...new Set(group.map(row => row.__email).filter(Boolean))];
    if (roles.length > 1 || emailSet.length > 1) {
      conflicts.push({
        legacyIds: [...new Set(group.map(row => row.__legacyId).filter(Boolean))],
        emails: emailSet, roles,
        reason: roles.length > 1 ? 'role_conflict' : 'email_conflict'
      });
      continue;
    }
    duplicatesRemoved += Math.max(0, group.length - 1);
    const merged = {};
    // Lower priority first, Point A last. Fill only missing fields; A wins on conflicts.
    for (const row of [...group].reverse()) {
      for (const [key, value] of Object.entries(row)) {
        if (key.startsWith('__') || ['balance', 'saldo', 'commission', 'comision', 'capital'].includes(normalizeText(key))) continue;
        if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) continue;
        merged[key] = value;
      }
    }
    const chosen = group[0];
    const ids = [...new Set(group.map(row => row.__legacyId).filter(Boolean))];
    const email = chosen.__email || firstDefined(group, ['email', 'authEmail', 'usernameEmail']).value || '';
    const phone = firstDefined(group, ['phone', 'telefono', 'celular', 'whatsapp']);
    const normalizedPhone = normalizePhone(phone.value || chosen.__phone);
    const currency = normalizeCurrency(firstDefined(group, ['balanceCurrency', 'currency', 'moneda']).value);
    const balanceDOP = readNonNegativeAmount(group, ['balanceDOP', 'balanceRD', 'saldoDOP', 'saldoRD', 'balancePesos']);
    const balanceHTG = readNonNegativeAmount(group, ['balanceHTG', 'balanceGDES', 'saldoHTG', 'saldoGDES']);
    const commissionDOP = readNonNegativeAmount(group, ['commissionDOP', 'comisionDOP', 'commissionRD', 'comisionRD']);
    const commissionHTG = readNonNegativeAmount(group, ['commissionHTG', 'comisionHTG', 'commissionGDES', 'comisionGDES']);
    const genericBalance = readNonNegativeAmount(group, ['balance', 'saldo']);
    const genericCommission = readNonNegativeAmount(group, ['commission', 'comision']);
    if (!balanceDOP.present && !balanceHTG.present && genericBalance.present && currency) {
      (currency === 'HTG' ? balanceHTG : balanceDOP).present = true;
      (currency === 'HTG' ? balanceHTG : balanceDOP).value = genericBalance.value;
      (currency === 'HTG' ? balanceHTG : balanceDOP).field = genericBalance.field;
    }
    if (!commissionDOP.present && !commissionHTG.present && genericCommission.present && currency) {
      (currency === 'HTG' ? commissionHTG : commissionDOP).present = true;
      (currency === 'HTG' ? commissionHTG : commissionDOP).value = genericCommission.value;
      (currency === 'HTG' ? commissionHTG : commissionDOP).field = genericCommission.field;
    }
    const role = chosen.__role;
    const needsBalanceReview = (genericBalance.present && !currency && !balanceDOP.present && !balanceHTG.present)
      || genericBalance.invalid || genericCommission.invalid;
    const proposedBalances = {};
    if (balanceDOP.present) proposedBalances.balanceDOP = balanceDOP.value;
    if (balanceHTG.present) proposedBalances.balanceHTG = balanceHTG.value;
    if (commissionDOP.present) proposedBalances.commissionDOP = commissionDOP.value;
    if (commissionHTG.present) proposedBalances.commissionHTG = commissionHTG.value;
    // Per policy, agents never carry personal balance/commission. Imported legacy
    // values are not transferred to an agent wallet; surface a review warning only.
    const agentAmountsIgnored = role === 'agent' && Object.values(proposedBalances).some(v => Number(v) !== 0);
    if (role === 'agent') Object.keys(proposedBalances).forEach(k => { proposedBalances[k] = 0; });
    const canonicalId = String(chosen.__legacyId || email || normalizedPhone).trim();
    const activeState = firstDefined(group, ['status', 'accountStatus', 'active']);
    accounts.push({
      legacyId: canonicalId,
      legacyIds: ids,
      role,
      displayName: String(firstDefined(group, ['displayName', 'name', 'nombre', 'fullName']).value || email || canonicalId).trim(),
      email: String(email || '').trim().toLowerCase(),
      emailNormalized: normalizeEmail(email),
      phone: String(phone.value || '').trim(),
      phoneNormalized: normalizedPhone,
      username: String(firstDefined(group, ['username', 'usuario']).value || '').trim().toLowerCase(),
      status: activeState.present ? activeState.value : null,
      sourcePriority: chosen.__rank,
      sourceIds: [...new Set(group.map(row => String(row.source || row.sourceSystem || '').trim()).filter(Boolean))],
      proposedBalances,
      needsBalanceReview,
      agentAmountsIgnored,
      duplicateCount: Math.max(0, group.length - 1)
    });
  }
  return { accounts, duplicatesRemoved, conflicts, ambiguousPhones };
}

function splitCommission(fee, ownerRole) {
  const value = round2(Math.max(0, Number(fee) || 0));
  if (normalizeRole(ownerRole) === 'remitente') {
    const remitter = round2(value / 2);
    return { remitter, admin: round2(value - remitter) };
  }
  // Agents receive no personal commission; administration receives the applicable fee.
  return { remitter: 0, admin: value };
}

module.exports = {
  ROLES, CURRENCIES, normalizeRole, normalizeCurrency, parseAmount, round2,
  isDeposit, isHaitiToHaiti, isDominicanToHaiti, isUSAToHaiti, isHaitiToDominican, haitiWalletFee, commissionRate,
  calculateCommission, validateOperation, splitCommission, normalizeEmail, normalizePhone, legacySourceRank, mergeLegacyAccounts,
  isInternationalRoute, routeCountryPair, receivedCurrencyForOperation
};