const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(
  'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html',
  'utf8'
);
const match = html.match(/function resolveEmail\(identifier\)\s*\{([\s\S]*?)\n  \}\n  async function queryOne/);
assert.ok(match, 'Firebase login must expose the identifier-to-email resolver');

const adminEmail = 'ideletteismorin@gmail.com';
const sendwayoUsername = 'sendwayoexpress@gmail.com';
const normalize = value => String(value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const resolver = new Function(
  'identifier', 'txt', 'norm', 'collectAliases',
  match[1]
);
const collectAliases = () => [{
  email: adminEmail,
  aliases: ['ADMINADMIN', 'ADMIN-000', sendwayoUsername, adminEmail]
}];

assert.equal(
  resolver(sendwayoUsername, value => String(value ?? '').trim(), normalize, collectAliases),
  adminEmail,
  'The public SENDWAYO administrator username must resolve to the existing Firebase Authentication email'
);
assert.equal(
  resolver(adminEmail, value => String(value ?? '').trim(), normalize, collectAliases),
  adminEmail,
  'The existing Firebase Authentication email must continue to work'
);
console.log('PASS: SENDWAYO admin username maps to the existing Firebase administrator email.');
