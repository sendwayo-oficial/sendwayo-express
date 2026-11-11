const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-EXPRESS-V7-CORREGIDO-DOP-BALANCES-COMISIONES-AVISOS.html'), 'utf8');
const match = html.match(/var fallbackCountriesData=(\[[\s\S]*?\]);\s*var fallbackCountries/);
assert.ok(match, 'el HTML debe incluir el catálogo completo integrado, no solo una lista de 43 países');
const countries = JSON.parse(match[1]);
assert.ok(countries.length >= 249, 'el catálogo debe tener 249 o más países/territorios');
assert.equal(new Set(countries.map(c => c.alpha2)).size, countries.length, 'los códigos ISO alpha-2 no deben repetirse');
assert.ok(countries.every(c => /^[A-Z]{2}$/.test(c.alpha2) && c.name), 'cada registro debe tener ISO alpha-2 y nombre');
assert.ok(countries.some(c => c.alpha2 === 'DO' && c.callingCode === '+1-809'), 'República Dominicana debe conservar un prefijo local real');
assert.ok(countries.every(c => typeof c.callingCode === 'string'), 'los territorios sin servicio telefónico deben quedar explícitos, no eliminarse');
assert.match(html, /if\(!c\|\|!c\.alpha2\|\|!c\.name\)return null/, 'el normalizador debe conservar territorios sin prefijo telefónico');
assert.match(html, /Sin prefijo telefónico asignado/, 'los territorios sin prefijo deben informarlo en el selector');
assert.match(html, /no tiene prefijo telefónico asignado/, 'no se debe formar ni guardar un E.164 falso');
assert.match(html, /window\.SENDWAYO_V7_COUNTRIES_READY=Promise\.resolve\(countries\)/, 'el catálogo local debe estar disponible sin descargarlo');
assert.doesNotMatch(html, /fetch\('https:\/\/staticdata\.dev/, 'la pantalla no debe depender de una descarga externa del catálogo');
assert.match(html, /new Intl\.DisplayNames\(\['es'\]/, 'los nombres deben localizarse en español cuando el navegador lo permita');

assert.match(html, /function installAllCountrySearch\(\)/, 'el buscador debe instalarse en los selectores de país de los formularios');
assert.match(html, /sendwayo-v7-envio-from[\s\S]*sendwayo-v7-retiro-to/, 'el buscador debe cubrir origen y destino de envíos y retiros');
assert.match(html, /select\[id\*="pais" i\],select\[name\*="pais" i\],select\[id\*="country" i\],select\[name\*="country" i\]/, 'los nuevos campos de país también deben recibir búsqueda');
assert.match(html, /input\.placeholder='Escriba el nombre del país para buscar…'/, 'el campo debe invitar a escribir el nombre del país');
assert.match(html, /input\.addEventListener\('input',show\)/, 'las coincidencias deben aparecer mientras el usuario escribe');
assert.match(html, /allCountries\(\)\.filter\(c=>!query\|\|norm\(countryLabel\(c\)\+' '\+c\.name\+' '\+c\.alpha2\+' '\+c\.callingCode\)\.includes\(query\)\)/, 'la búsqueda debe filtrar por nombre, ISO y prefijo');
assert.match(html, /select\.dispatchEvent\(new Event\('change',\{bubbles:true\}\)\)/, 'elegir una coincidencia debe actualizar el selector original');

console.log('SENDWAYO countries: catálogo global integrado, búsqueda interactiva y validaciones correctas.');
