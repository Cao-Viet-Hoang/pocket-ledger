/**
 * Lightweight modal helper.
 * Usage:
 *   Modal.open({ title, subtitle, bodyHTML, size, actions: [{ label, variant, onClick }] })
 *   Modal.close()
 */
(function (global) {
  'use strict';

  const root = () => document.getElementById('modalRoot');

  function close() {
    const el = root();
    if (!el) return;
    el.classList.remove('is-open');
    el.innerHTML = '';
    el.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function open({ title = '', subtitle = '', bodyHTML = '', size = '', actions = [] } = {}) {
    const el = root();
    if (!el) return;

    const actionsHTML = actions
      .map(
        (a, i) =>
          `<button type="button" class="btn btn-${a.variant || 'secondary'}" data-modal-action="${i}">${a.label}</button>`
      )
      .join('');

    el.innerHTML = `
      <div class="modal-backdrop" data-modal-close></div>
      <div class="modal-dialog ${size}" role="dialog" aria-modal="true">
        <header class="modal-header">
          <div>
            <h2>${title}</h2>
            ${subtitle ? `<p>${subtitle}</p>` : ''}
          </div>
          <button class="icon-btn ghost" type="button" aria-label="Close" data-modal-close>
            <span data-icon="close"></span>
          </button>
        </header>
        <div class="modal-body">${bodyHTML}</div>
        ${actions.length ? `<footer class="modal-footer">${actionsHTML}</footer>` : ''}
      </div>
    `;

    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    el.querySelectorAll('[data-modal-close]').forEach((n) => n.addEventListener('click', close));
    el.querySelectorAll('[data-modal-action]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        const idx = Number(btn.dataset.modalAction);
        const act = actions[idx];
        if (act && typeof act.onClick === 'function') act.onClick(ev);
        if (!act || act.keepOpen !== true) close();
      });
    });

    Icons.render(el);
    I18n.applyTranslations(el);
  }

  function toast(message, { duration = 2200 } = {}) {
    const r = document.getElementById('toastRoot');
    if (!r) return;
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    r.appendChild(node);
    setTimeout(() => {
      node.style.transition = 'opacity 180ms';
      node.style.opacity = '0';
      setTimeout(() => node.remove(), 220);
    }, duration);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  global.Modal = { open, close };
  global.Toast = { show: toast };
})(window);
