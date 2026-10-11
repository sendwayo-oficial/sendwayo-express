'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../domain');

test('normaliza roles sin elevar permisos', () => {
  assert.equal(d.normalizeRole('Administrador'), 'admin');
  assert.equal(d.normalizeRole('Agente'), 'agent');
  assert.equal(d.normalizeRole('Remitente'), 'remitente');
  assert.equal(d.normalizeRole('superadmin'), null);
});

test('parsea importes con formatos numéricos comunes', () => {
  assert.equal(d.parseAmount('1 250'), 1250);
  assert.equal(d.parseAmount('1.250,50'), 1250.5);
  assert.equal(d.parseAmount('1250,5'), 1250.5);
  assert.equal(d.parseAmount('0'), null);
  assert.equal(d.parseAmount('NaN'), null);
  assert.equal(d.parseAmount('-20'), null);
});

test('depósito no genera comisión', () => {
  assert.equal(d.calculateCommission({type:'Deposito', amount:20000, currency:'DOP'}), 0);
});

test('rutas internacionales y RD a Haití NatCash calculan 10%', () => {
  assert.equal(d.calculateCommission({type:'Envío', route:'USA->HT', method:'NatCash', amount:1000, currency:'DOP'}), 100);
  assert.equal(d.calculateCommission({type:'Envío', route:'RD->HT', method:'MonCash', amount:1000, currency:'DOP'}), 100);
  assert.equal(d.calculateCommission({type:'Envío', route:'USA->HT', method:'NatCash', amount:1000, currency:'DOP'}), 100);
  assert.equal(d.isDominicanToHaiti({route:'República Dominicana → Haití'}), true);
  assert.equal(d.isUSAToHaiti({route:'USA->HT'}), true);
});

test('servicios, recargas y paqueticos calculan 5%', () => {
  assert.equal(d.calculateCommission({type:'Recarga', amount:1000, currency:'DOP'}), 50);
  assert.equal(d.calculateCommission({type:'Factura/servicio', amount:1000, currency:'DOP'}), 50);
  assert.equal(d.calculateCommission({type:'Paquetico', amount:1000, currency:'DOP'}), 50);
});

test('ruta doméstica mantiene 8%', () => {
  assert.equal(d.calculateCommission({type:'Envío', route:'RD->RD', amount:1000, currency:'DOP'}), 80);
});

test('tarifa Haití a Haití usa tabla fija por tramos', () => {
  assert.equal(d.calculateCommission({type:'Envío', route:'HT->HT', method:'NatCash', amount:80, currency:'HTG'}), 0);
  assert.equal(d.calculateCommission({type:'Envío', route:'HT->HT', method:'NatCash', amount:150, currency:'HTG'}), 5);
  assert.equal(d.calculateCommission({type:'Envío', route:'HT->HT', method:'MonCash', amount:600, currency:'HTG'}), 15);
});

test('bloquea agente fuera Haití a Haití o en moneda incorrecta', () => {
  assert.throws(() => d.validateOperation({type:'Envío',route:'RD->HT',method:'NatCash',amount:500,currency:'DOP'}, 'agent'), /solo puede registrar/);
  assert.throws(() => d.validateOperation({type:'Envío',route:'HT->HT',method:'NatCash',amount:500,currency:'DOP'}, 'agent'), /HTG\/GDES/);
  assert.doesNotThrow(() => d.validateOperation({type:'Envío',route:'HT->HT',method:'NatCash',amount:500,currency:'HTG'}, 'agent'));
});

test('transferencias entre monedas exigen el importe recibido y no inventan tasa de cambio', () => {
  assert.throws(() => d.validateOperation({type:'Envío',route:'RD->HT',method:'NatCash',amount:500,currency:'DOP'}, 'remitente'), /importe exacto.*HTG/);
  assert.doesNotThrow(() => d.validateOperation({type:'Envío',route:'RD->HT',method:'NatCash',amount:500,currency:'DOP',htg:900}, 'remitente'));
});

test('comisión de remitente se divide 50/50 y agente no recibe comisión personal', () => {
  assert.deepEqual(d.splitCommission(101, 'remitente'), {remitter:50.5, admin:50.5});
  assert.deepEqual(d.splitCommission(101, 'agent'), {remitter:0, admin:101});
});

test('fusión de remitentes da prioridad a Punto A, completa campos faltantes con Punto B y no suma balances', () => {
  const result = d.mergeLegacyAccounts([
    {source:'Punto B', id:'B-01', role:'Remitente', email:'remitente@example.com', name:'Nombre Punto B', phone:'+1-829-555-0101', balance:5000, currency:'DOP'},
    {source:'Punto A', id:'A-01', role:'Remitente', email:'REMITENTE@example.com', name:'Nombre Punto A', phone:'8295550101', balanceDOP:0, balanceHTG:250, username:'remitente.a'}
  ]);
  assert.equal(result.accounts.length, 1);
  assert.equal(result.duplicatesRemoved, 1);
  const account = result.accounts[0];
  assert.equal(account.displayName, 'Nombre Punto A');
  assert.equal(account.username, 'remitente.a');
  assert.deepEqual(account.proposedBalances, {balanceDOP: 0, balanceHTG: 250});
});

test('fusión no une teléfonos compartidos con correos distintos', () => {
  const result = d.mergeLegacyAccounts([
    {source:'Punto A', id:'A-1', role:'Remitente', email:'a@example.com', phone:'8295550101'},
    {source:'Punto B', id:'B-2', role:'Remitente', email:'b@example.com', phone:'+1-829-555-0101'}
  ]);
  assert.equal(result.accounts.length, 2);
  assert.equal(result.duplicatesRemoved, 0);
});

test('fusión bloquea el mismo identificador con roles contradictorios', () => {
  const result = d.mergeLegacyAccounts([
    {source:'Punto A', id:'ID-44', role:'Remitente', email:'same@example.com', phone:'8295550144'},
    {source:'Punto B', id:'ID-44', role:'Agente', email:'same@example.com', phone:'8295550144'}
  ]);
  assert.equal(result.accounts.length, 0);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].reason, 'role_conflict');
});

test('fusión no asigna un balance sin moneda y nunca crea balances personales para agentes', () => {
  const ambiguous = d.mergeLegacyAccounts([{source:'Punto B',id:'R-1',role:'Remitente',email:'r@example.com',balance:900}]);
  assert.equal(ambiguous.accounts[0].needsBalanceReview, true);
  assert.deepEqual(ambiguous.accounts[0].proposedBalances, {});
  const agent = d.mergeLegacyAccounts([{source:'Punto A',id:'AG-1',role:'Agente',email:'a@example.com',balanceDOP:600,balanceHTG:100,commissionDOP:50}]);
  assert.deepEqual(agent.accounts[0].proposedBalances, {balanceDOP:0,balanceHTG:0,commissionDOP:0});
  assert.equal(agent.accounts[0].agentAmountsIgnored, true);
});

test('todas las rutas transfronterizas identificadas usan 10%', () => {
  for (const [route, currency] of [
    ['RD->HT','DOP'], ['USA->HT','DOP'], ['HT->RD','HTG'],
    ['HT->USA','HTG'], ['RD->USA','DOP'], ['USA->RD','DOP']
  ]) {
    assert.equal(d.calculateCommission({ type:'Envío', route, amount:1000, currency }), 100, route);
  }
  assert.equal(d.isInternationalRoute({ route:'RD->USA' }), true);
  assert.equal(d.receivedCurrencyForOperation({ route:'RD->USA' }), 'USD');
  assert.equal(d.receivedCurrencyForOperation({ route:'USA->RD' }), 'DOP');
  assert.equal(d.receivedCurrencyForOperation({ route:'HT->USA' }), 'USD');
});

test('una ruta transfronteriza debe indicar el importe recibido y no inventar conversiones', () => {
  assert.throws(() => d.validateOperation({type:'Envío',route:'HT->USA',method:'NatCash',amount:500,currency:'HTG'}, 'remitente'), /importe exacto.*USD/);
  assert.throws(() => d.validateOperation({type:'Envío',route:'RD->USA',amount:500,currency:'DOP'}, 'remitente'), /importe exacto.*USD/);
  assert.doesNotThrow(() => d.validateOperation({type:'Envío',route:'HT->USA',method:'NatCash',amount:500,currency:'HTG',receivedAmount:80}, 'remitente'));
});
