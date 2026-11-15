const assert = require('node:assert/strict');
const fs = require('node:fs');

const rules = JSON.parse(fs.readFileSync('database.rules.json', 'utf8')).rules;
const entry = fs.readFileSync('SENDWAYO-V7-FAST-ENTRY.html', 'utf8');
const root = rules.sendwayo_express_v2;
const requestRule = root.requests;
const requestItemWrite = requestRule['$id']['.write'];
const requestCollectionWrite = requestRule['.write'];

assert.equal(rules['.read'], false, 'la raíz de Firebase no debe ser legible públicamente');
assert.equal(rules['.write'], false, 'la raíz de Firebase no debe ser escribible públicamente');
assert.equal(root['.read'], false, 'el espacio SENDWAYO no debe ser legible por defecto');
assert.equal(root['.write'], false, 'el espacio SENDWAYO no debe ser escribible por defecto');
assert.ok(requestItemWrite.includes('auth != null'), 'la escritura directa de una solicitud debe requerir autenticación');
assert.ok(!requestItemWrite.includes('!data.exists() && newData.child(\'type\').exists()'), 'no debe existir el permiso genérico anónimo para crear solicitudes');
assert.ok(requestItemWrite.includes('newData.child(\'type\').val() === \'REGISTRO\''), 'el alta de registro debe estar limitada al tipo REGISTRO');
assert.ok(requestItemWrite.includes('newData.child(\'createdByAuthUid\').val() === auth.uid'), 'la solicitud debe pertenecer al usuario autenticado que la creó');
assert.ok(requestItemWrite.includes('newData.child(\'email\').val() === auth.token.email'), 'el correo de la solicitud debe coincidir con el correo autenticado');
assert.ok(requestItemWrite.includes('newData.child(\'status\').val() === \'Pendiente\''), 'la solicitud de alta debe comenzar Pendiente');
assert.ok(!requestItemWrite.includes('data.child(\'createdByAuthUid\').val() === auth.uid'), 'el usuario no puede modificar ni aprobar su propia solicitud');
assert.ok(!requestCollectionWrite.includes('$id'), 'las reglas de colección no deben usar variables de ruta hijas');
assert.ok(entry.includes('createUserWithEmailAndPassword(email,password)'), 'el formulario debe crear la identidad en Firebase Authentication');
assert.ok(entry.includes('database.ref(ROOT+\'/requests/\'+id).set(row)'), 'el formulario debe guardar la solicitud en Realtime Database');
assert.ok(entry.includes('createdByAuthUid:createdUser.uid'), 'la solicitud debe guardar el UID creador');
assert.ok(entry.includes('await a.signOut()'), 'el formulario debe cerrar la sesión temporal después de enviar');
assert.ok(!/password\s*:\s*password/.test(entry), 'la contraseña no debe guardarse en el registro de solicitud');

console.log('PASS: Firebase root closed; authenticated registration ownership; no generic anonymous request writes; no plaintext password in request payload.');
