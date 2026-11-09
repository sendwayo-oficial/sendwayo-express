const fs = require('fs');
const assert = require('assert');
const path = 'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html';
const html = fs.readFileSync(path, 'utf8');
assert(html.includes('ADMIN-ADMINISTRADOR'), 'Administrator ID must be fixed');
assert(html.includes('function humanAccountId'), 'Firebase profile ID generator must use the human ID format');
assert(html.includes('sendwayoOpenIdFile'), 'ID dossier lookup must be present');
assert(html.includes('sendwayoOpenCardPayments'), 'PayPal/card onboarding must be present');
assert(html.includes('sendwayoNormalizeUserIds'), 'Existing account IDs must be normalized');
assert(html.includes('legacyId:oldId'), 'Previous IDs must remain as history aliases');
assert(!html.includes('Código:'), 'Visible code labels must be removed');
assert(html.includes('Correo electrónico o ID'), 'Login must identify accounts by email or ID');
assert(html.includes('Pagos con tarjeta / PayPal'), 'Card payment module must be available in the menu');
const brand = html.slice(html.indexOf('id="sendwayo-brand-bar"'), html.indexOf('id="sendwayo-brand-bar"') + 1200);
assert(brand.indexOf('sendwayo-brand-logo') < brand.indexOf('sendwayo-mobile-menu'), 'Logo and business name must precede the hamburger');
assert((html.match(/id="sendwayo-mobile-menu"/g) || []).length === 1, 'Only one hamburger control should exist');
const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(Boolean);
let checked = 0;
for (const code of blocks) {
  checked++;
  try { new Function(code); }
  catch (error) { console.error('Invalid inline script #' + checked + ':', error.message); process.exit(1); }
}
console.log('V7 ID-only and PayPal onboarding checks passed; inline scripts checked:', checked);
