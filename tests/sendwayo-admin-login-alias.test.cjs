const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(
  'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html',
  'utf8'
);

// La cuenta Firebase del administrador y la cuenta local de GitHub son identidades distintas.
// El correo de Authentication se comprueba en la constante y en el perfil inicial de ADMIN.
const adminEmail = 'ideletteismorin@gmail.com';
assert.match(html, /email:'ideletteismorin@gmail\\.com'/,
  'el perfil ADMIN debe conservar el correo de acceso Firebase confirmado en V7');
assert.match(html, /const ADMIN_EMAIL = 'ideletteismorin@gmail\\.com';/,
  'Firebase Authentication debe resolver el perfil ADMIN con el mismo correo');
assert.match(html, /auth\\.signInWithEmailAndPassword\\(email,\\s*password\\)/,
  'Firebase debe autenticar con el correo resuelto y la contraseña escrita');
assert.match(html, /if\\(email===ADMIN_EMAIL\\)/,
  'la lectura del perfil debe reconocer al administrador por su correo Firebase');

const match = html.match(/function resolveEmail\\(identifier\\)\\s*\\{([\\s\\S]*?)\\n  \\}\\n  async function queryOne/);
assert.ok(match, 'debe existir el conversor de ID/correo a correo Firebase');
const normalize = value => String(value ?? '').normalize('NFD')
  .replace(/[\\u0300-\\u036f]/g, '').trim().toLowerCase().replace(/\\s+/g, ' ');
const resolver = new Function('identifier', 'txt', 'norm', 'collectAliases', match[1]);
const collectAliases = () => [{
  email: adminEmail,
  aliases: ['ADMIN-ADMINISTRADOR', 'ADMINADMIN', 'ADMIN-000', adminEmail]
}];

for (const identifier of [adminEmail, 'ADMIN-ADMINISTRADOR', 'ADMINADMIN']) {
  assert.equal(
    resolver(identifier, value => String(value ?? '').trim(), normalize, collectAliases),
    adminEmail,
    'el correo y los IDs históricos del administrador deben resolver a la misma cuenta Firebase'
  );
}
console.log('PASS: V7 admin Firebase identity, email and ID resolver are consistent.');
