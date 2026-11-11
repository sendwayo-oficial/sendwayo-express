const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(
  'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html',
  'utf8'
);
const adminEmail = 'sendwayoexpress@gmail.com';

assert.match(html, /email:'sendwayoexpress@gmail\.com'/,
  'the V7 administrator profile must use the confirmed SENDWAYO email');
assert.match(html, /username:'sendwayoexpress@gmail\.com', login:'sendwayoexpress@gmail\.com'/,
  'the visible administrator username and Firebase email must agree');
assert.match(html, /const ADMIN_EMAIL = 'sendwayoexpress@gmail\.com';/,
  'Firebase admin identity must use the confirmed SENDWAYO email');
assert.doesNotMatch(html, /ideletteismorin@gmail\.com/,
  'the GitHub account email must not be substituted for the SENDWAYO login');
assert.match(html, /auth\.signInWithEmailAndPassword\(email,\s*password\)/,
  'Firebase must receive the email resolved from the login field');
assert.match(html, /if\(email===ADMIN_EMAIL\)/,
  'the confirmed Firebase administrator must resolve to the admin profile');

const match = html.match(/function resolveEmail\(identifier\)\s*\{([\s\S]*?)\n  \}\n  async function queryOne/);
assert.ok(match, 'Firebase login must expose the identifier-to-email resolver');
const normalize = value => String(value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const resolver = new Function(
  'identifier', 'txt', 'norm', 'collectAliases',
  match[1]
);
const collectAliases = () => [{
  email: adminEmail,
  aliases: ['ADMINADMIN', 'ADMIN-000', 'Sendwayoexpress', adminEmail]
}];

for (const identifier of [adminEmail, 'Sendwayoexpress']) {
  assert.equal(
    resolver(identifier, value => String(value ?? '').trim(), normalize, collectAliases),
    adminEmail,
    'all confirmed administrator identifiers must resolve to the same Firebase email'
  );
}
console.log('PASS: V7 administrator email, username, profile and Firebase login mapping agree.');
