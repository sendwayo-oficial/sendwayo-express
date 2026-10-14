/* SENDWAYO EXPRESS V32 — sugerencias globales de nombres y teléfonos.
   La fuente prioritaria son las listas vivas de la API conectada a Firebase.
   No se leen ni exponen campos secretos. */
(function () {
  'use strict';
  const DATASETS = ['remitentes','agentes','beneficiarios','transacciones','envios','paquetes','recargas','paquetikos','facturas'];
  let sharedContacts = [];
  let attachedCloud = null;
  let stopSharedContacts = null;
  let backfillRunning = false;
  const safeArray = v => Array.isArray(v) ? v : [];
  const text = v => String(v == null ? '' : v).trim();
  const digits = v => text(v).replace(/\D/g, '');
  const canonicalPhone = v => {
    let d = digits(v);
    if (d.startsWith('009') && d.length > 10) d = d.slice(2);
    if (d.startsWith('1') && d.length === 11) d = d.slice(1);
    if (d.startsWith('509') && d.length === 11) d = d.slice(3);
    return d;
  };
  const lower = v => text(v).toLocaleLowerCase('es');
  function normalize(row, fallbackRole) {
    if (!row || typeof row !== 'object') return null;
    const name = text(row.name || row.displayName || row.nombreCompleto || row.fullName ||
      [row.firstName || row.first || row.nombre || row.nombres, row.lastName || row.last || row.apellido || row.apellidos].filter(Boolean).join(' ') ||
      row.beneficiarioNombre || row.beneficiario || row.remitenteNombre || row.remitente || row.target || row.cliente);
    const phone = text(row.phone || row.telefono || row.celular || row.whatsapp ||
      row.remitentePhone || row.beneficiaryPhone || row.beneficiarioTelefono || row.numero);
    const id = text(row.id || row.uid || row.userId || row.remitenteId || row.beneficiarioId || row.ownerId);
    const code = text(row.code || row.codigo || row.legacyId || row.accountId || row.referenceCode);
    const email = text(row.email || row.authEmail);
    const aliases = safeArray(row.aliases).map(text).filter(Boolean);
    if (!name && !phone && !id && !code && !email && !aliases.length) return null;
    return { id, code, name, phone, email, aliases, role: text(row.role || row.rol || fallbackRole), raw: row };
  }
  function collect() {
    // Fuente oficial única: el directorio compartido que escucha Firebase.
    // No usar listas de demostración, arrays iniciales ni localStorage para sugerencias globales.
    const seen = new Set();
    return safeArray(sharedContacts).filter(p => {
      const key = (canonicalPhone(p.phone) || lower(p.code) || lower(p.id) || lower(p.name)) + '|' + lower(p.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 10000);
  }
  function matches(person, query) {
    const q = lower(query);
    if (!q) return false;
    const fields = [person.name, person.phone, person.code, person.id, person.email, ...safeArray(person.aliases)];
    if (fields.some(v => lower(v).includes(q))) return true;
    const qDigits = canonicalPhone(q);
    return qDigits.length >= 2 && [person.phone, person.code, person.id].some(v => {
      const d = canonicalPhone(v);
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
  function announceContactsChanged() {
    window.dispatchEvent(new CustomEvent('sendwayo:shared-contacts-updated', { detail: { count: sharedContacts.length } }));
    try { window.__sendwayoRefreshLegacyDatalist?.(); } catch (err) { console.warn('[SENDWAYO] No se pudo actualizar el datalist compartido.', err); }
  }
  function bindCloud() {
    const cloud = window.sendwayoCloud;
    if (!cloud || !cloud.ready || !cloud.auth || typeof cloud.auth.onAuthStateChanged !== 'function' || attachedCloud === cloud) return;
    attachedCloud = cloud;
    cloud.auth.onAuthStateChanged(async user => {
      if (stopSharedContacts) { try { stopSharedContacts(); } catch (_) {} stopSharedContacts = null; }
      if (!user) { sharedContacts = []; announceContactsChanged(); return; }
      if (typeof cloud.listenSharedContacts === 'function') {
        try {
          stopSharedContacts = cloud.listenSharedContacts(rows => {
            sharedContacts = safeArray(rows).map(row => normalize(row, 'contacto compartido')).filter(p => p && p.phone);
            announceContactsChanged();
          });
        } catch (err) {
          console.error('[SENDWAYO] No se pudieron cargar las sugerencias globales de Firebase.', err);
        }
      } else {
        console.error('[SENDWAYO] Falta listenSharedContacts en la API Firebase; no se afirmará que el directorio global está sincronizado.');
      }
      if (backfillRunning || typeof cloud.syncContactDirectory !== 'function') return;
      backfillRunning = true;
      try {
        const profile = await cloud.getProfile();
        const role = String(profile?.role || '').trim().toLowerCase();
        const status = String(profile?.status || '').trim().toLowerCase();
        if (['admin','administrador'].includes(role) && ['active','approved','aprobado','activo'].includes(status)) {
          const key = 'sendwayo_contact_directory_backfill_' + user.uid;
          if (localStorage.getItem(key) !== 'done') {
            await cloud.syncContactDirectory();
            localStorage.setItem(key, 'done');
            console.info('[SENDWAYO] Directorio compartido de contactos sincronizado.');
          }
        }
      } catch (err) {
        console.warn('[SENDWAYO] No se pudo completar la sincronización inicial del directorio de contactos.', err);
      } finally {
        backfillRunning = false;
      }
    });
  }
  window.addEventListener('sendwayo:cloud-ready', bindCloud);
  window.addEventListener('sendwayo:duplicate-contact', e => {
    const name = text(e.detail?.name);
    const message = name
      ? 'Este número ya está registrado en el sistema como ' + name + '. La relación de beneficiario se guardó; comprueba el nombre, ya que este número existe en el directorio compartido.'
      : 'Este número ya está registrado en el sistema. Revisa y selecciona la sugerencia existente antes de guardar.';
    let box = document.getElementById('sw-v32-duplicate-contact');
    if (!box) {
      box = document.createElement('div');
      box.id = 'sw-v32-duplicate-contact';
      box.setAttribute('role', 'status');
      box.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:120005;max-width:min(92vw,580px);padding:12px 16px;border-radius:12px;background:#fff7ed;border:2px solid #f97316;color:#9a3412;font:800 12px/1.45 Arial;box-shadow:0 12px 35px #0003';
      document.body.appendChild(box);
    }
    box.textContent = message;
    box.style.display = 'block';
    clearTimeout(box._timer);
    box._timer = setTimeout(() => { box.style.display = 'none'; }, 6500);
  });
  function exactPhoneMatch(query, people) {
    const q = canonicalPhone(query);
    if (q.length < 7) return null;
    return safeArray(people).find(p => {
      const pDigits = canonicalPhone(p.phone);
      return pDigits.length >= 7 && pDigits === q;
    }) || null;
  }
  window.__sendwayoExactPhoneMatch = exactPhoneMatch;
  bindCloud();
  window.__sendwayoGlobalPeople = collect;
  window.__sendwayoSuggestionMatches = matches;
  window.__sendwayoSuggestionValue = valueFor;
  window.__sendwayoApplySuggestion = apply;
  window.__sendwayoNormalizePhone = digits;
})();