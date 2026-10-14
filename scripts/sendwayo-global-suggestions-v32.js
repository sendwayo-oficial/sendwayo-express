/* SENDWAYO EXPRESS V32 — sugerencias globales de nombres y teléfonos.
   La fuente prioritaria son las listas vivas de la API conectada a Firebase.
   No se leen ni exponen campos secretos. */
(function () {
  'use strict';
  const DATASETS = ['remitentes','agentes','beneficiarios','transacciones','envios','paquetes','recargas','paquetikos','facturas'];
  const safeArray = v => Array.isArray(v) ? v : [];
  const text = v => String(v == null ? '' : v).trim();
  const digits = v => text(v).replace(/\D/g, '');
  const lower = v => text(v).toLocaleLowerCase('es');
  function normalize(row, fallbackRole) {
    if (!row || typeof row !== 'object') return null;
    const name = text(row.name || row.nombreCompleto || row.fullName ||
      [row.first || row.nombre || row.nombres, row.last || row.apellido || row.apellidos].filter(Boolean).join(' ') ||
      row.beneficiarioNombre || row.beneficiario || row.remitenteNombre || row.remitente || row.target || row.cliente);
    const phone = text(row.phone || row.telefono || row.celular || row.whatsapp ||
      row.remitentePhone || row.beneficiaryPhone || row.beneficiarioTelefono || row.numero);
    const id = text(row.id || row.uid || row.userId || row.remitenteId || row.beneficiarioId || row.ownerId);
    const code = text(row.code || row.codigo || row.legacyId || row.accountId || row.referenceCode);
    const email = text(row.email || row.authEmail);
    if (!name && !phone && !id && !code && !email) return null;
    return { id, code, name, phone, email, role: text(row.role || row.rol || fallbackRole), raw: row };
  }
  function collect() {
    const out = [];
    const api = window.__sendwayoApi;
    if (api && typeof api.dataFor === 'function') {
      for (const key of DATASETS) {
        try { safeArray(api.dataFor(key)).forEach(row => { const p = normalize(row, key); if (p) out.push(p); }); }
        catch (err) { console.warn('SENDWAYO suggestions: dataset unavailable', key, err); }
      }
    }
    // Compatibilidad con registros históricos; la lista viva de Firebase tiene prioridad.
    for (const key of ['sendwayo_users','sendwayo_beneficiaries','sendwayo_transactions','sendwayo_remitters','sendwayo_agents']) {
      try {
        const rows = JSON.parse(localStorage.getItem(key) || '[]');
        safeArray(rows).forEach(row => { const p = normalize(row, key); if (p) out.push(p); });
      } catch (_) {}
    }
    const seen = new Set();
    return out.filter(p => {
      const key = (digits(p.phone) || lower(p.code) || lower(p.id) || lower(p.email) || lower(p.name)) + '|' + lower(p.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 10000);
  }
  function matches(person, query) {
    const q = lower(query);
    if (!q) return false;
    const fields = [person.name, person.phone, person.code, person.id, person.email];
    if (fields.some(v => lower(v).includes(q))) return true;
    const qDigits = digits(q);
    return qDigits.length >= 2 && [person.phone, person.code, person.id].some(v => {
      const d = digits(v);
      return d && d.includes(qDigits);
    });
  }
  function valueFor(input, person) {
    const meta = lower([input.placeholder, input.name, input.id, input.getAttribute('aria-label')].filter(Boolean).join(' '));
    if (/(tel[eé]fono|phone|celular|whatsapp|n[uú]mero|number)/i.test(meta) && !/(buscar|search|b[uú]squeda)/i.test(meta)) {
      return person.phone || person.code || person.id || person.name;
    }
    if (/(nombre|name|beneficiario|remitente|destinatario|cliente)/i.test(meta) && !/(buscar|search|b[uú]squeda)/i.test(meta)) {
      return person.name || person.phone || person.code || person.id;
    }
    return [person.phone || person.code || person.id, person.name ? '(' + person.name + ')' : ''].filter(Boolean).join(' ');
  }
  function apply(input, person) {
    if (!input || !person) return;
    const value = valueFor(input, person);
    input.dataset.selectedId = person.id || person.code || person.phone || '';
    input.dataset.selectedName = person.name || '';
    input.dataset.selectedPhone = person.phone || '';
    input.dataset.swSuggestionApplying = '1';
    try {
      const setter = Object.getOwnPropertyDescriptor(
        input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value'
      )?.set;
      if (setter) setter.call(input, value); else input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } finally {
      delete input.dataset.swSuggestionApplying;
    }
  }
  window.__sendwayoGlobalPeople = collect;
  window.__sendwayoSuggestionMatches = matches;
  window.__sendwayoSuggestionValue = valueFor;
  window.__sendwayoApplySuggestion = apply;
  window.__sendwayoNormalizePhone = digits;
})();