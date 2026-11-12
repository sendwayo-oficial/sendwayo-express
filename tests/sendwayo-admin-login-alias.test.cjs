const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(
  'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html',
  'utf8'
);

// El correo configurado por el archivo V7 para Authentication no es el correo de GitHub.
const adminEmail = 'sendwayoexpress@gmail.com';
assert.ok(html.includes("email:'" + adminEmail + "'"), 'el perfil ADMIN debe conservar su correo Firebase');
assert.ok(html.includes("const ADMIN_EMAIL = '" + adminEmail + "';"), 'el correo de Authentication y el perfil ADMIN deben coincidir');
assert.ok(html.includes("username:'sendwayoexpress@gmail.com'"), 'el usuario de acceso SENDWAYO debe seguir disponible como alias');
assert.ok(html.includes('auth.signInWithEmailAndPassword(email, password)') ||
  html.includes('auth.signInWithEmailAndPassword(email,\\n'), 'Firebase debe autenticar con el correo resuelto y la contraseña');
assert.ok(html.includes('if(email===ADMIN_EMAIL)'), 'la lectura del perfil debe reconocer al administrador por su correo Firebase');

const match = html.match(/function resolveEmail\(identifier\)\s*\{([\s\S]*?)\n  \}\n  async function queryOne/);
assert.ok(match, 'debe existir el conversor de ID/correo a correo Firebase');
const normalize = value => String(value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const resolver = new Function('identifier', 'txt', 'norm', 'collectAliases', match[1]);
const collectAliases = () => [{
  email: adminEmail,
  aliases: ['ADMIN-ADMINISTRADOR', 'ADMINADMIN', 'ADMIN-000', 'sendwayoexpress@gmail.com', adminEmail]
}];

for (const identifier of [adminEmail, 'sendwayoexpress@gmail.com', 'ADMIN-ADMINISTRADOR', 'ADMINADMIN']) {
  assert.equal(
    resolver(identifier, value => String(value ?? '').trim(), normalize, collectAliases),
    adminEmail,
    'el correo y los IDs históricos del administrador deben resolver a la misma cuenta Firebase'
  );
}
console.log('PASS: V7 admin Firebase identity, email and ID resolver are consistent.');
