const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Expediente de consulta por ID (solo remitentes/agentes; sin secretos).
assert.match(html, /Expediente por ID/);
assert.match(html, /function subjects\(\)/);
assert.match(html, /role\(a\)!=='ADMIN'/);
assert.match(html, /function identity\(a\)\{return \[a\.id,a\.idAnterior,a\.legacyId,a\.accountId,a\.staffId/);
const identityHelper = html.match(/function identity\(a\)\{[^}]+\}/)?.[0] || '';
assert.ok(identityHelper);
assert.doesNotMatch(identityHelper, /email|phone|a\.aliases/);
assert.match(html, /matches\.length!==1/);
assert.match(html, /Solicitudes y revisiones relacionadas/);
assert.match(html, /Cuentas bancarias vinculadas/);
assert.match(html, /password\|contrasena\|clave\|secret\|token/);
assert.match(html, /Este agente opera con fondos de Administración/);

// Catálogo internacional local: todos los ISO alpha-2, prefijos y rutas.
const countryDataMatch = html.match(/var fallbackCountriesData=(\[[\s\S]*?\]);/);
assert.ok(countryDataMatch, 'el catálogo de países debe estar integrado en el HTML');
const countries = JSON.parse(countryDataMatch[1]);
assert.equal(countries.length, 250, 'debe incluir los 250 países/territorios del catálogo ISO alpha-2');
assert.equal(new Set(countries.map(x => x.alpha2)).size, 250, 'no debe repetir códigos ISO');
assert.match(html, /if\(c\.alpha2==='DO'\)return \['\+1-809','\+1-829','\+1-849'\]/);
assert.match(html, /País de origen<select/);
assert.match(html, /País de destino<select/);
assert.match(html, /SENDWAYO_CUSTOM_ROUTE/);
assert.match(html, /t\.countryFrom=\{/);
assert.match(html, /t\.countryTo=\{/);

// Sesión y rendimiento: conservar inicio hasta 40 minutos de inactividad.
assert.match(html, /auth\.setPersistence\(firebase\.auth\.Auth\.Persistence\.SESSION\)/);
assert.match(html, /LIMIT=40\*60\*1000/);
assert.match(html, /IDLE_LIMIT=40\*60\*1000/);
assert.match(html, /translationPendingRoots/);
assert.match(html, /translateInterface\(node,languageValue\(\)\)/);
assert.match(html, /roots\.forEach\(root=>scanTables\(root\)\)/);
assert.match(html, /setInterval\(refresh,30000\)/);
assert.match(html, /setInterval\(syncStorage,15000\)/);
assert.doesNotMatch(html, /setInterval\(refresh,4000\)/);
assert.doesNotMatch(html, /setInterval\(syncStorage,2500\)/);

// Encabezado y navegación: todo arriba; ninguna columna lateral permanente.
assert.match(html, /sendwayo-v7-canonical-top-workspace-style/);
assert.match(html, /sendwayo-v7-workspace-layout-controller/);
assert.match(html, /sendwayo-v7-user-strip/);
assert.match(html, /insertAdjacentElement\('afterend',strip\)/);
assert.match(html, /#sendwayo-main-sidebar\{[\s\S]*?left:0!important;right:0!important;/);
assert.match(html, /#sendwayo-main-sidebar\.sendwayo-menu-open\{[^}]*transform:translateY\(0\)/);
assert.match(html, /grid-template-columns:repeat\(auto-fit,minmax\(/);
assert.match(html, /#sendwayo-main-content\{display:block!important;flex:none!important;width:100%!important/);
assert.match(html, /sendwayo-brand-actions\.insertBefore\(btn/);
assert.match(html, /window\.sendwayoRefreshIdentityHeader=refreshIdentity/);

// Comprobante auténtico en imagen PNG.
assert.match(html, /if\(!t\)\{alert\('No se encontró la transacción para generar el comprobante\.'\);return;\}/);
assert.doesNotMatch(html, /if\(!t\) t=\{id:id, fecha:'20\/10\/2026'/);
assert.match(html, /sendwayoShareReceipt=async function\(\)/);
assert.match(html, /image\/png/);

console.log('SENDWAYO: expediente, catálogo internacional, sesión, rendimiento y cabecera superior verificados.');
