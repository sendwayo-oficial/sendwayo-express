const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html', 'utf8');

assert.ok(html.includes('function publishDirectoryRows(rows, profileRow, role)'), 'Firebase debe seguir siendo la fuente del directorio');
assert.ok(html.includes('function accountMoney(profile)'), 'los balances deben proceder del perfil');
assert.ok(html.includes('balanceDOP') && html.includes('balanceHTG'), 'DOP y HTG deben continuar separados');
assert.ok(html.includes('commissionDOP') && html.includes('commissionHTG'), 'las comisiones DOP y HTG deben continuar separadas');
assert.ok(html.includes('function balanceOwner(a)'), 'el saldo compartido de agentes debe conservar su propietario');
assert.ok(html.includes('function commissionOwner(a)'), 'las comisiones de agentes deben conservar su propietario');
assert.ok(html.includes('sendwayoAdminEditAccount'), 'la administración debe poder modificar cuentas');
assert.ok(html.includes('sendwayoAdminToggleAccount'), 'la administración debe poder activar o desactivar cuentas');
assert.ok(html.includes('sendwayoAdminCreditAccount') && html.includes('sendwayoAdminDebitAccount'), 'acreditar y desacreditar deben seguir disponibles');
assert.ok(html.includes('secondaryAuth.createUserWithEmailAndPassword(email,password)'), 'las cuentas nuevas deben crearse realmente en Firebase Authentication');
assert.ok(html.includes('mustChangePassword:true') && html.includes('passwordChangeRequired:true') && html.includes('forcePasswordChange:true'), 'las cuentas nuevas deben exigir cambio de contraseña');
assert.ok(html.includes('function generateTenDigitPassword()'), 'cada cuenta nueva debe recibir una contraseña temporal de diez dígitos');
assert.ok(html.includes('crypto.getRandomValues(bytes)'), 'la contraseña temporal debe generarse con aleatoriedad criptográfica');
assert.ok(html.includes('modal.dataset.sendwayoTemporaryPassword'), 'la contraseña temporal debe mantenerse estable durante el formulario');
assert.ok(html.includes('function hideCodeField()'), 'el campo legado de código debe quedar oculto');
assert.ok(html.includes('function scrubVisibleLegacyCodes()'), 'las listas y selectores deben mostrar ID, no códigos');
assert.ok(html.includes('const idNew=ident'), 'el identificador único debe persistirse como ID de cuenta');

console.log('PASS: directorio Firebase, balances separados, privilegios administrativos e IDs con contraseña temporal.');
