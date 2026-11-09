const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html'), 'utf8');
assert.match(html, /Expediente por ID/);
assert.match(html, /sendwayoOpenIdFile/);
assert.match(html, /sendwayoOpenCardPayments/);
assert.match(html, /function attachCountrySearch\(select\)/);
assert.match(html, /sendwayo-country-datalist/);
assert.match(html, /var fallbackCountriesData=\[/);
const data = html.match(/var fallbackCountriesData=(\[[\s\S]*?\]);/);
assert.ok(data);
const countries = JSON.parse(data[1]);
assert.equal(countries.length, 250);
assert.equal(new Set(countries.map(c => c.alpha2)).size, 250);
assert.match(html, /if\(c\.alpha2==='DO'\)return \['\+1-809','\+1-829','\+1-849'\]/);
assert.match(html, /País de origen<select/);
assert.match(html, /País de destino<select/);
assert.match(html, /SENDWAYO_CUSTOM_ROUTE/);

assert.match(html, /auth\.setPersistence\(firebase\.auth\.Auth\.Persistence\.SESSION\)/);
assert.match(html, /LIMIT=40\*60\*1000/);
assert.match(html, /IDLE_LIMIT=40\*60\*1000/);
assert.match(html, /setInterval\(syncStorage,15000\)/);
assert.doesNotMatch(html, /setInterval\(refresh,4000\)/);
assert.doesNotMatch(html, /setInterval\(syncStorage,2500\)/);
assert.doesNotMatch(html, /2200/);
assert.doesNotMatch(html, /renderPrincipal\(\);\s*\},500/);

const routeCalcSource = html.match(/function updateRouteCalc\(kind\)\{[\s\S]*?\n \}\n function mountRouteControls/)?.[0] || '';
assert.ok(routeCalcSource);
const field = () => ({ textContent: '', dataset: {} });
const fields = {
  'v162-envio-monto': { value: '2000', dataset: {} },
  'v162-envio-neto': field(),
  'v162-envio-com': field(),
  'v162-envio-rec': field(),
  'v162-envio-tasa': field()
};
const routeCalc = new Function('$','window','routeData',routeCalcSource.replace(/\n function mountRouteControls[\s\S]*$/, '\n return updateRouteCalc;'))(
  id => fields[id] || null,
  {},
  () => ({from:{alpha2:'HT'},to:{alpha2:'DO'},currency:'HTG'})
);
routeCalc('envio');
assert.equal(fields['v162-envio-neto'].textContent, '1,840.00 HTG');
assert.equal(fields['v162-envio-com'].textContent, '160.00 HTG');
assert.equal(fields['v162-envio-rec'].textContent, '0.00 DOP', 'no debe inventarse un tipo de cambio si la fuente no está cargada');
assert.equal(fields['v162-envio-monto'].dataset.fxReady, '0', 'la operación internacional queda bloqueada hasta disponer de tasa');
assert.equal(fields['v162-envio-monto'].dataset.esHT, '1');

assert.match(html, /open\.er-api\.com\/v6\/latest\/USD/);
assert.match(html, /restcountries\.com\/v3\.1\/all\?fields=cca2,currencies/);
assert.match(html, /source:'ExchangeRate-API'/);
assert.doesNotMatch(routeCalcSource, /received=net\*2\.1/);
assert.doesNotMatch(html, /received=net\/2\.30/);
assert.match(html, /sendwayo-v7-final-integrity/);
assert.match(html, /sendwayo-v7-header-one-line-runtime/);
assert.doesNotMatch(html, /Código:|Cód\.:|id="sendwayo-v7-code"/);
assert.match(html, /sendwayo:local-data-changed/);
assert.match(html, /CLOUD_SYNC_INTERVAL_MS=15000/);
console.log('SENDWAYO V7: expediente, catálogo 250 países, selector escribible, sesión, FX seguro y cabecera verificados.');
