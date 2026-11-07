const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'SENDWAYO-V118-SIN-SELLO-4000-GOURDES.html'), 'utf8');
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
console.log('SENDWAYO countries: catálogo global integrado y validaciones correctas.');
