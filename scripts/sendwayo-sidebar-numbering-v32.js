/* SENDWAYO V32 — sequential numbering for every visible sidebar module.
   Recalculates after role-based filtering and dynamic admin links are inserted. */
(function () {
  'use strict';
  function numberNav(nav) {
    const buttons = [...nav.querySelectorAll('button')].filter(button => {
      if (button.style.display === 'none' || button.disabled) return false;
      const label = (button.innerText || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');
      if (!label || /^(mi perfil|cerrar sesi[oó]n)$/.test(label)) return false;
      return true;
    });
    buttons.forEach((button, index) => {
      let number = button.querySelector(':scope > [data-sw-sidebar-number]');
      if (!number) {
        number = document.createElement('span');
        number.setAttribute('data-sw-sidebar-number', '');
        number.style.cssText = 'display:inline-flex;align-items:center;justify-content:flex-end;flex:0 0 24px;width:24px;min-width:24px;margin-right:1px;font-size:10px;font-weight:900;font-variant-numeric:tabular-nums;opacity:.82';
        button.insertBefore(number, button.firstChild);
      }
      const value = String(index + 1).padStart(2, '0') + '.';
      if (number.textContent !== value) number.textContent = value;
    });
  }
  function renumberAll() {
    document.querySelectorAll('#sidebar .overflow-y-auto, [class~="md:hidden"] .overflow-y-auto').forEach(numberNav);
  }
  function boot() {
    renumberAll();
    if (!window.__sendwayoSidebarNumberObserver && document.documentElement) {
      window.__sendwayoSidebarNumberObserver = new MutationObserver(() => renumberAll());
      window.__sendwayoSidebarNumberObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.addEventListener('sendwayo-data-sync', renumberAll);
  window.addEventListener('sendwayo-sync', renumberAll);
})();