import test from "node:test";
import assert from "node:assert/strict";
import {
  amountToMinor, validatePaymentInput, validatePayoutInput,
  hmacSha256Hex, verifyHmacSha256, verifyStripeSignature
} from "../src/index.js";

test("convierte monedas con dos decimales a unidades menores", () => {
  assert.equal(amountToMinor(25.00,"USD"),2500);
  assert.equal(amountToMinor(1250.5,"DOP"),125050);
});
test("admite monedas de cero decimales sin inventar centavos", () => {
  assert.equal(amountToMinor(1500,"JPY"),1500);
  assert.throws(()=>amountToMinor(1500.5,"JPY"),/demasiados decimales/);
});
test("rechaza importes o códigos de moneda incorrectos", () => {
  assert.throws(()=>amountToMinor(-2,"USD"),/no válidos/);
  assert.throws(()=>amountToMinor(10,"US"),/no válidos/);
});
test("exige países y entrega expresos y no convierte monedas", () => {
  const valid=validatePaymentInput({
    sourceAmount:25,totalCharged:26.5,sourceCurrency:"USD",targetCurrency:"HTG",targetAmount:3312.5,
    countryFrom:"DO",countryTo:"HT",
    senderInfo:{fullName:"Remitente",phone:"+18095550199"},
    recipientInfo:{fullName:"Beneficiario",phoneOrAccount:"+50937000000",provider:"MonCash"}
  });
  assert.equal(valid.targetAmount,3312.5);
  assert.equal(valid.targetCurrency,"HTG");
  assert.equal(valid.countryFrom,"DO");
  assert.throws(()=>validatePaymentInput({
    sourceAmount:25,totalCharged:25,sourceCurrency:"USD",targetCurrency:"HTG",
    countryFrom:"DO",countryTo:"HT",
    senderInfo:{fullName:"R",phone:"1"},recipientInfo:{fullName:"B",phoneOrAccount:"2"}
  }),/entrega en otra moneda debe indicarse explícitamente/);
});
test("normaliza los datos y rechaza códigos ISO incompletos",()=>{
  assert.throws(()=>validatePaymentInput({
    sourceAmount:10,totalCharged:10,targetAmount:10,sourceCurrency:"USD",targetCurrency:"USD",
    countryFrom:"USA",countryTo:"HT",senderInfo:{fullName:"R",phone:"1"},recipientInfo:{fullName:"B",phoneOrAccount:"2"}
  }),/códigos ISO de dos letras/);
});
test("valida payout MonCash/NatCash solo en HTG entero y teléfono haitiano",()=>{
  assert.deepEqual(validatePayoutInput({network:"moncash",targetAmount:1000,targetCurrency:"HTG",receiver:"+509 3700-0000"}),{network:"moncash",amount:1000,currency:"HTG",receiver:"50937000000"});
  assert.throws(()=>validatePayoutInput({network:"moncash",targetAmount:1000.25,targetCurrency:"HTG",receiver:"50937000000"}),/entero en HTG/);
  assert.throws(()=>validatePayoutInput({network:"wire",targetAmount:1000,targetCurrency:"USD",receiver:"123"}),/no compatible/);
});
test("valida HMAC Tranzak sobre el cuerpo sin modificar",async()=>{
  const raw='{"event":"payment.success","data":{"transaction_id":"123"}}';
  const sig=await hmacSha256Hex("test-secret",raw);
  assert.equal(await verifyHmacSha256("test-secret",raw,sig),true);
  assert.equal(await verifyHmacSha256("test-secret",raw+" ",sig),false);
});
test("valida firma Stripe sobre timestamp y cuerpo raw",async()=>{
  const timestamp=Math.floor(Date.now()/1000);
  const raw='{"id":"evt_test","type":"checkout.session.completed"}';
  const sig=await hmacSha256Hex("whsec_test",timestamp+"."+raw);
  assert.equal(await verifyStripeSignature(raw,"t="+timestamp+",v1="+sig,"whsec_test"),true);
  assert.equal(await verifyStripeSignature(raw+" ","t="+timestamp+",v1="+sig,"whsec_test"),false);
});
