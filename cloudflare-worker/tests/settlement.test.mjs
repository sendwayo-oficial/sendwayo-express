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
