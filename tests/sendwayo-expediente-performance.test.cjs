const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html');
const html = fs.readFileSync(htmlPath, 'utf8');

assert.match(html, /Expediente por ID/, 'el menú y la pantalla deben llamarse Expediente por ID');
assert.match(html, /function subjects\(\)/, 'la consulta debe resolver remitentes y agentes');
const legacyFinder = html.match(/function findAccount\(q\)\{[^}]+\}/)?.[0] || '';
assert.ok(legacyFinder, 'el buscador que alimenta el expediente debe estar presente');
assert.match(legacyFinder, /role\(a\)!=='ADMIN'/, 'el buscador real nunca debe devolver la cuenta administrativa');
assert.doesNotMatch(legacyFinder, /email|phone|telefono|celular|username|a\.aliases/, 'el buscador real debe consultar solo ID y códigos, nunca datos de contacto');
assert.match(html, /typeof AGENTES!=='undefined'/, 'el directorio debe usar el arreglo global real de agentes');
assert.match(html, /typeof REMITENTES!=='undefined'/, 'el directorio debe usar el arreglo global real de remitentes');
assert.match(html, /function identity\(a\)\{return \[a\.id,a\.idAnterior,a\.legacyId,a\.accountId,a\.staffId/, 'la búsqueda debe usar identificadores visibles y alias, no correo o UID');
const identityHelper = html.match(/function identity\(a\)\{[^}]+\}/)?.[0] || '';
assert.ok(identityHelper, 'debe existir el normalizador de IDs');
assert.doesNotMatch(identityHelper, /email|phone|a\.aliases/, 'la búsqueda no debe aceptar correo, teléfono ni alias genéricos');
assert.match(html, /placeholder="Introduzca ID del remitente o agente"/, 'el campo debe solicitar el ID');
assert.match(html, /window\.SENDWAYO_REQUESTS/, 'el expediente debe reunir solicitudes sincronizadas');
assert.match(html, /Solicitudes y revisiones relacionadas/, 'el expediente debe mostrar solicitudes');
assert.match(html, /window\.SENDWAYO_BANKS/, 'el expediente debe reunir cuentas bancarias sincronizadas');
assert.match(html, /Cuentas bancarias vinculadas/, 'el expediente debe mostrar cuentas bancarias');
assert.match(html, /Este agente opera con fondos de Administración/, 'el expediente debe aclarar el uso de fondos compartidos por agentes');
assert.match(html, /function validate\(event\)/, 'el formulario debe validar remitente/agente');
assert.match(html, /matches\.length!==1/, 'no debe abrir expedientes cuando un ID sea inexistente o ambiguo');
assert.match(html, /password\|contrasena\|clave\|secret\|token/, 'los detalles deben omitir credenciales y secretos');
assert.match(html, /sendwayo:transactions-updated/, 'los datos del expediente y los avisos deben refrescarse con los cambios en tiempo real');
assert.match(html, /translateInterface\(node,languageValue\(\)\)/, 'la traducción debe procesar solo nodos añadidos');
assert.match(html, /translationPendingRoots/, 'la traducción debe conservar nodos nuevos durante el debounce');
assert.match(html, /roots\.forEach\(root=>scanTables\(root\)\)/, 'la paginación debe revisar solo vistas/tablas insertadas');
assert.match(html, /table,tbody,\.view/, 'la paginación debe volver a observar un tbody reemplazado');
assert.match(html, /setInterval\(refresh,30000\)/, 'el resumen diario no debe recalcularse cada cuatro segundos');
assert.match(html, /setInterval\(syncStorage,15000\)/, 'la cola local debe usar un respaldo menos frecuente');
assert.doesNotMatch(html, /setInterval\(refresh,4000\)/, 'no debe quedar el temporizador de cuatro segundos');
assert.doesNotMatch(html, /setInterval\(syncStorage,2500\)/, 'no debe quedar el temporizador de 2,5 segundos');
assert.doesNotMatch(html, /if\(scan\) scanTables\(document\)/, 'no debe quedar el escaneo completo de tablas');

console.log('SENDWAYO expediente/performance: comprobaciones estáticas correctas.');

assert.match(html, /sendwayo-v7-canonical-top-workspace-style/, 'la cabecera unificada debe estar instalada como un solo diseño');
assert.match(html, /sendwayo-top-menu-toggle/, 'el acceso al menú debe vivir en la cabecera superior');
const canonicalLayoutCss = html.slice(html.indexOf('<style id="sendwayo-v7-canonical-top-workspace-style">'));
assert.match(canonicalLayoutCss, /#sendwayo-main-sidebar\{[^}]*position:fixed/i, 'el menú no debe reservar una columna lateral permanente');
assert.match(canonicalLayoutCss, /#sendwayo-main-sidebar\.sendwayo-menu-open\{[^}]*transform:translateX\(0\)/i, 'el menú lateral debe abrirse como panel y cerrarse fuera del contenido');
assert.match(html, /#sendwayo-main-sidebar[^}]*\.sidebar-brand/i, 'la marca antigua del menú lateral debe ocultarse');
assert.match(canonicalLayoutCss, /#sendwayo-v7-user-strip\{/, 'la identidad debe estar en la franja superior del espacio de trabajo');
assert.match(html, /window\.sendwayoRefreshIdentityHeader/, 'la cabecera debe refrescar ID, código, hora y usuario tras iniciar sesión');

assert.match(html, /if\(!t\)\{alert\('No se encontró la transacción para generar el comprobante\.'\);return;\}/, 'un comprobante no debe inventar una transacción si su ID no existe');
assert.doesNotMatch(html, /if\(!t\) t=\{id:id, fecha:'20\/10\/2026'/, 'no debe existir un comprobante de ejemplo con datos ficticios');
assert.match(html, /sendwayoShareReceipt=async function\(\)/, 'el comprobante debe compartir imagen PNG');
assert.match(html, /image\/png/, 'el comprobante debe generarse como imagen PNG');

assert.match(html, /sendwayo-v7-workspace-layout-controller/, 'debe existir un controlador único del encabezado y el espacio de trabajo');
assert.match(html, /sendwayo-v7-user-strip/, 'la identidad activa debe mostrarse en una franja superior');
assert.match(html, /insertAdjacentElement\('afterend',strip\)/, 'la franja de identidad debe colocarse inmediatamente debajo de la marca superior');
assert.match(html, /#sendwayo-main-sidebar\{[\s\S]*?left:0!important;right:0!important;/, 'el menú debe abrirse como panel superior de ancho completo, no como columna lateral');
assert.match(html, /grid-template-columns:repeat\(auto-fit,minmax\(/, 'los módulos deben aparecer en un menú superior adaptable');
assert.match(html, /#sendwayo-main-content\{display:block!important;flex:none!important;width:100%!important/, 'el contenido de cada módulo debe ocupar el ancho completo');
assert.match(html, /sendwayo-brand-actions\.insertBefore\(btn/, 'el botón del menú debe vivir en los controles superiores, junto a las notificaciones');
assert.match(html, /window\.sendwayoRefreshIdentityHeader=refreshIdentity/, 'el controlador debe actualizar el encabezado utilizado por el resto de la plataforma');
