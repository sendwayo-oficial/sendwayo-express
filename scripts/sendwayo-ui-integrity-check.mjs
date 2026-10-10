#!/usr/bin/env node
import fs from 'node:fs';

const file = 'index.html';
const html = fs.readFileSync(file, 'utf8');
const errors = [];

function count(re) { return (html.match(re) || []).length; }

// Reject rapid recurring timers that repeatedly scan/change the DOM.
// Legitimate, low-frequency clock/session and day-close timers are allowed.
function timerDelays(source) {
  const delays = [];
  let from = 0;
  while (true) {
    const marker = source.indexOf('setInterval(', from);
    if (marker < 0) break;
    let i = marker + 'setInterval('.length;
    let paren = 0, brace = 0, bracket = 0;
    let quote = '';
    let escaped = false;
    let lineComment = false, blockComment = false;
    let comma = -1, end = -1;
    for (; i < source.length; i++) {
      const c = source[i], next = source[i + 1];
      if (lineComment) { if (c === '\n') lineComment = false; continue; }
      if (blockComment) { if (c === '*' && next === '/') { blockComment = false; i++; } continue; }
      if (quote) {
        if (escaped) { escaped = false; continue; }
        if (c === '\\') { escaped = true; continue; }
        if (c === quote) quote = '';
        continue;
      }
      if ((c === "'" || c === '"' || c === '`')) { quote = c; continue; }
      if (c === '/' && next === '/') { lineComment = true; i++; continue; }
      if (c === '/' && next === '*') { blockComment = true; i++; continue; }
      if (c === '(') paren++;
      else if (c === ')') {
        if (paren === 0 && brace === 0 && bracket === 0) { end = i; break; }
        paren--;
      } else if (c === '{') brace++;
      else if (c === '}') brace--;
      else if (c === '[') bracket++;
      else if (c === ']') bracket--;
      else if (c === ',' && paren === 0 && brace === 0 && bracket === 0 && comma < 0) comma = i;
    }
    if (comma >= 0 && end > comma) {
      const raw = source.slice(comma + 1, end).trim();
      const match = raw.match(/^(\d+(?:\.\d+)?)(?:\s*[,)]|$)/);
      if (match) delays.push({ at: marker, ms: Number(match[1]) });
    }
    from = end > marker ? end + 1 : marker + 12;
  }
  return delays;
}
const fastTimers = timerDelays(html).filter(x => x.ms > 0 && x.ms < 5000);
if (fastTimers.length) {
  errors.push('Temporizador repetitivo de alta frecuencia (' + fastTimers.map(x => x.ms + ' ms').join(', ') + '): sustituir sondeo frecuente por eventos/estado.');
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

// Duplicate script IDs make later maintenance and DOM targeting unsafe.
const scriptIds = [...html.matchAll(/<script\b[^>]*\bid=["']([^"']+)["']/gi)].map(m => m[1]);
const seenScript = new Map();
for (const id of scriptIds) seenScript.set(id, (seenScript.get(id) || 0) + 1);
for (const [id, n] of seenScript) if (n > 1) errors.push(`ID de script duplicado: ${id} (${n}).`);

// Count actual element markup, not id="..." text inside JS template strings used to build modals.
const markupForIds = html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>');
const htmlIds = [...markupForIds.matchAll(/\bid=["']([^"']+)["']/gi)].map(m => m[1]);
const seenId = new Map();
for (const id of htmlIds) seenId.set(id, (seenId.get(id) || 0) + 1);
for (const [id, n] of seenId) if (n > 1) errors.push(`ID HTML duplicado: ${id} (${n}).`);

// Keep obsolete patch-block ids out; equivalent behavior belongs in the consolidated controllers.
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
