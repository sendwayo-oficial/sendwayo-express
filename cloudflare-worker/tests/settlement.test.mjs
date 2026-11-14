import test from "node:test";
import assert from "node:assert/strict";
import { __test } from "../src/index.mjs";

test("RD to Haiti NatCash is recognized from ISO country codes", () => {
  assert.equal(__test.isRdHtNatcashMoncash({
    type: "Envío", currency: "DOP", originCountry: "DO",
    destinationCountry: "HT", destinationProvider: "NatCash"
  }), true);
});

test("RD to Haiti MonCash is recognized from route text", () => {
  assert.equal(__test.isRdHtNatcashMoncash({
    type: "Envío", currency: "DOP",
    route: "República Dominicana → Haití • MonCash"
  }), true);
});

test("reverse direction and unsupported provider are rejected", () => {
  assert.equal(__test.isRdHtNatcashMoncash({
    type: "Envío", currency: "DOP", originCountry: "HT",
    destinationCountry: "DO", destinationProvider: "NatCash"
  }), false);
  assert.equal(__test.isRdHtNatcashMoncash({
    type: "Envío", currency: "DOP", originCountry: "DO",
    destinationCountry: "HT", destinationProvider: "Banco"
  }), false);
});

test("calculates 8 percent DOP fee, 2.10 conversion and 3 percent HTG commission", () => {
  assert.deepEqual(
    __test.calculateSettlement({ amountDOP: 2000, feeDOP: 160, netDOP: 1840 }),
    {
      amountDOP: 2000, feeDOP: 160, netDOP: 1840, rate: 2.1,
      grossHTG: 3864, commissionHTG: 115.92, payoutHTG: 3748.08
    }
  );
});

test("rejects DOP fee that is not 8 percent", () => {
  assert.throws(
    () => __test.calculateSettlement({ amountDOP: 2000, feeDOP: 100, netDOP: 1900 }),
    /INVALID_DOP_FEE/
  );
});

test("uses two-decimal currency rounding", () => {
  assert.equal(__test.round2(3864 * 0.03), 115.92);
  assert.equal(__test.money("RD$ 2,000.00"), 2000);
});


test("refunds a remittee DOP reservation exactly once", () => {
  const account = {
    balance: 100,
    balanceDOP: 100,
    balanceHTG: 5,
    balances: { DOP: 100, HTG: 5 },
    balanceReservations: {
      "send-123": {
        id: "send-123", transactionId: "send-123",
        status: "RESERVED", amount: 2000, currency: "DOP"
      }
    }
  };
  const refund = __test.applyBalanceRefund(
    account, "remitente-123", "send-123", 2000, "DOP", "admin-uid", 12345
  );
  assert.deepEqual(refund, {
    accountKey: "remitente-123",
    reservationId: "send-123",
    currency: "DOP",
    amount: 2000,
    balanceBefore: 100,
    balanceAfter: 2100
  });
  assert.equal(account.balance, 2100);
  assert.equal(account.balanceDOP, 2100);
  assert.equal(account.balances.DOP, 2100);
  assert.equal(account.balanceHTG, 5);
  assert.equal(account.balanceReservations["send-123"].status, "REVERSED");
  assert.equal(account.balanceReservations["send-123"].reversedByAuthUid, "admin-uid");
  assert.throws(
    () => __test.applyBalanceRefund(account, "remitente-123", "send-123", 2000, "DOP", "admin-uid", 12346),
    /SOURCE_BALANCE_RESERVATION_NOT_ACTIVE/
  );
});

test("refunds the admin-funded DOP balance without a remittee reservation", () => {
  const admin = {
    balance: 500,
    balanceDOP: 500,
    balances: { DOP: 500, HTG: 0 }
  };
  const refund = __test.applyBalanceRefund(admin, "admin", "admin-send-9", 2000, "DOP", "admin-uid", 900);
  assert.equal(refund.balanceAfter, 2500);
  assert.equal(admin.balance, 2500);
  assert.equal(admin.balanceDOP, 2500);
  assert.equal(admin.balances.DOP, 2500);
});

test("rejects a source refund if the remittee reservation is missing or mismatched", () => {
  assert.throws(
    () => __test.applyBalanceRefund(
      { balances: { DOP: 0, HTG: 0 } }, "remitente-1", "missing", 100, "DOP", "admin-uid", 1
    ),
    /SOURCE_BALANCE_RESERVATION_NOT_ACTIVE/
  );
  assert.throws(
    () => __test.applyBalanceRefund({
      balanceDOP: 0, balances: { DOP: 0, HTG: 0 },
      balanceReservations: { "send-1": { status: "RESERVED", amount: 99, currency: "DOP" } }
    }, "remitente-1", "send-1", 100, "DOP", "admin-uid", 1),
    /SOURCE_BALANCE_RESERVATION_MISMATCH/
  );
});
