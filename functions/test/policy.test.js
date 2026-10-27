const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../lib/policy');

test('normaliza decisiones en español e inglés', () => {
  assert.equal(policy.normalizeAction('approve'), 'Aprobado');
  assert.equal(policy.normalizeAction('Rechazado'), 'Rechazado');
  assert.equal(policy.normalizeAction('no_match'), 'No Coincide');
  assert.equal(policy.normalizeAction('otro'), null);
});

test('usa DOP como moneda general y HTG solo para NatCash/MonCash local', () => {
  assert.equal(policy.currencyFor({ route: 'RD->HT', method: 'NatCash' }, 'envios'), 'DOP');
  assert.equal(policy.currencyFor({ route: 'HT->HT', method: 'NatCash' }, 'envios'), 'HTG');
  assert.equal(policy.currencyFor({ route: 'HT->HT', method: 'Banco' }, 'envios'), 'DOP');
  assert.equal(policy.currencyFor({ currency: 'HTG' }, 'deposits'), 'HTG');
  assert.equal(policy.currencyFor({ currency: 'DOP' }, 'deposits'), 'DOP');
});

test('aplica 5% a servicios, 8% general y tabla local', () => {
  assert.equal(policy.commissionFor({ type: 'Recarga' }, 'recargas', 100), 5);
  assert.equal(policy.commissionFor({ type: 'Envío', route: 'RD->RD' }, 'envios', 100), 8);
  assert.equal(policy.commissionFor({ type: 'Envío', route: 'HT->HT', method: 'NatCash' }, 'envios', 1500), 18);
  assert.equal(policy.commissionFor({ type: 'Retiro', route: 'HT->HT', method: 'MonCash' }, 'accountWithdrawals', 1500), 46);
  const haitiWithdrawal = { type: 'Retiro', route: 'HT->HT', method: 'MonCash', currency: 'HTG' };
  const feeFor2000 = policy.commissionFor(haitiWithdrawal, 'accountWithdrawals', 2000);
  assert.equal(policy.currencyFor(haitiWithdrawal, 'accountWithdrawals'), 'HTG');
  assert.equal(feeFor2000, 25);
  assert.equal(2000 - feeFor2000, 1975);
  assert.equal(policy.commissionFor({ type: 'Depósito' }, 'deposits', 100), 0);
});

test('el retiro de comisión usa la moneda seleccionada y no genera otra comisión', () => {
  assert.equal(policy.isCommissionWithdrawal('commissions', { accountingType: 'COMISION_RETIRO' }), true);
  assert.equal(policy.currencyFor({ accountingType: 'COMISION_RETIRO', currency: 'HTG' }, 'commissions'), 'HTG');
  assert.equal(policy.currencyFor({ accountingType: 'COMISION_RETIRO', currency: 'DOP' }, 'commissions'), 'DOP');
  assert.equal(policy.commissionFor({ accountingType: 'COMISION_RETIRO', type: 'Retiro de comisión' }, 'commissions', 50), 0);
});

test('un agente no puede auto-revisarse ni aprobar depósitos', () => {
  const base = { actorRole: 'agente', actorUid: 'uid-a', actorKey: 'AG-01', action: 'Aprobado' };
  assert.equal(policy.canReview({ ...base, operation: { createdByAuthUid: 'uid-a' }, collection: 'envios' }).allowed, false);
  assert.equal(policy.canReview({ ...base, operation: { createdByAuthUid: 'uid-b' }, collection: 'deposits' }).allowed, false);
  assert.equal(policy.canReview({ ...base, operation: { createdByAuthUid: 'uid-b' }, collection: 'envios' }).allowed, true);
});

test('solo un remitente inicia la división 50/50; rol del revisor no la cambia', () => {
  assert.equal(policy.normalizeRole('Remitente'), 'remitente');
  assert.equal(policy.normalizeRole('Agente'), 'agent');
});
