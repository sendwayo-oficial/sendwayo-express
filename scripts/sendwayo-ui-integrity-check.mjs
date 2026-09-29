#!/usr/bin/env node
import fs from 'node:fs';

const file = 'index.html';
const html = fs.readFileSync(file, 'utf8');
const errors = [];

function count(re) { return (html.match(re) || []).length; }

// Permanent DOM polling is prohibited: it is a common source of freezes and patch-on-patch behavior.
if (count(/setInterval\s*\(/g) > 0) {
  errors.push('No se permite setInterval() en index.html: usar eventos/estado en lugar de polling permanente.');
}

// Critical singleton handlers must have one source of truth.
for (const [label, re] of [
  ['SENDWAYO_OPEN_BENEFICIARIO_SAFE', /window\.SENDWAYO_OPEN_BENEFICIARIO_SAFE\s*=/g],
  ['openBeneficiarioModal', /window\.openBeneficiarioModal\s*=/g],
  ['updateAgentBeneficiarySuggestions', /window\.updateAgentBeneficiarySuggestions\s*=/g],
  ['chooseAgentBeneficiary', /window\.chooseAgentBeneficiary\s*=/g],
]) {
  const n = count(re);
  if (n > 1) errors.push(`Controlador duplicado ${label}: ${n} definiciones.`);
}

// Duplicate script ids make later maintenance and DOM targeting unsafe.
const scriptIds = [...html.matchAll(/<script\b[^>]*\bid=["']([^"']+)["']/gi)].map(m => m[1]);
const seenScript = new Map();
for (const id of scriptIds) seenScript.set(id, (seenScript.get(id) || 0) + 1);
for (const [id, n] of seenScript) if (n > 1) errors.push(`ID de script duplicado: ${id} (${n}).`);

// Duplicate HTML ids can make getElementById() hit the wrong form/control.
const htmlIds = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(m => m[1]);
const seenId = new Map();
for (const id of htmlIds) seenId.set(id, (seenId.get(id) || 0) + 1);
for (const [id, n] of seenId) if (n > 1) errors.push(`ID HTML duplicado: ${id} (${n}).`);

// Known obsolete repair blocks must never be reintroduced.
for (const marker of [
  'sendwayo-agent-fields-interaction-repair-v1',
  'sendwayo-beneficiary-add-final-repair-v2',
  'sendwayo-agent-single-screen-final-v1',
]) {
  if (html.includes(`id="${marker}"`) || html.includes(`id='${marker}'`)) {
    errors.push(`Bloque obsoleto reintroducido: ${marker}.`);
  }
}

if (errors.length) {
  console.error('SENDWAYO UI INTEGRITY CHECK — FALLÓ');
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}

console.log('SENDWAYO UI INTEGRITY CHECK — OK');
