import test from "node:test";
import assert from "node:assert/strict";
import { cents, getTransactionAmounts, isRdHtNatcashRoute, moneyOf, roleOf, writeMoney } from "../src/index.mjs";

test("identifica las rutas RD a HT NatCash y MonCash", () => {
  assert.equal(isRdHtNatcashRoute({ route: "RD → HT NatCash (8%)" }), true);
  assert.equal(isRdHtNatcashRoute({ route: "RD → HT MonCash (8%)" }), true);
  assert.equal(isRdHtNatcashRoute({ route: "HT → HT NatCash (3%)" }), false);
  assert.equal(isRdHtNatcashRoute({ route: "RD → HT banco (8%)" }), false);
});

test("calcula 8% DOP, conversión 2.10 y reparto HTG 3% / 97%", () => {
  assert.deepEqual(getTransactionAmounts({ amount: 2000, commission: 160, currency: "DOP", net: 1840 }), {
    amountDop: 2000, feeDop: 160, netDop: 1840, grossHtg: 3864, commissionHtg: 115.92, payoutHtg: 3748.08
  });
});

test("rechaza una comisión DOP distinta del 8%", () => {
  assert.throws(() => getTransactionAmounts({ amount: 2000, commission: 100, currency: "DOP" }), /8%/);
});

test("mantiene separados los saldos DOP y HTG", () => {
  const account = { balanceDOP: 500, balanceHTG: 700, commissionDOP: 30, commissionHTG: 40 };
  const m = moneyOf(account);
  m.balances.HTG = cents(m.balances.HTG - 100);
  m.commissions.HTG = cents(m.commissions.HTG + 3);
  writeMoney(account, m);
  assert.equal(account.balanceDOP, 500);
  assert.equal(account.balanceHTG, 600);
  assert.equal(account.commissionDOP, 30);
  assert.equal(account.commissionHTG, 43);
});

test("reconoce los roles del directorio", () => {
  assert.equal(roleOf({ role: "admin" }), "ADMIN");
  assert.equal(roleOf({ role: "Agente" }), "AGENTE");
  assert.equal(roleOf({ role: "Remitente" }), "REMITENTE");
});
