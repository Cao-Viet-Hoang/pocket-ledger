/**
 * Very small hash-based router.
 * Routes map to page modules registered on `window.Pages`.
 */
(function (global) {
  'use strict';

  const DEFAULT_ROUTE = 'dashboard';
  const ROUTES = ['dashboard', 'transactions', 'lending', 'borrowing', 'people', 'reports'];

  const listeners = new Set();

  function parseHash() {
    const hash = window.location.hash || '';
    const match = hash.match(/^#\/([a-z-]+)/i);
    const route = match ? match[1].toLowerCase() : DEFAULT_ROUTE;
    return ROUTES.includes(route) ? route : DEFAULT_ROUTE;
  }

  function navigate(route) {
    if (!ROUTES.includes(route)) route = DEFAULT_ROUTE;
    if (parseHash() === route) return renderCurrent();
    window.location.hash = '#/' + route;
  }

  function renderCurrent() {
    const route = parseHash();
    const container = document.getElementById('content');
    const page = global.Pages && global.Pages[route];
    if (!page || typeof page.render !== 'function') {
      container.innerHTML = `<div class="empty"><h3>Unknown page</h3></div>`;
      return;
    }
    page.render(container);
    updateActiveNav(route);
    updatePageHeader(route);
    Icons.render(container);
    I18n.applyTranslations(container);
    listeners.forEach((cb) => cb(route));
    window.scrollTo({ top: 0 });
  }

  function updateActiveNav(route) {
    document.querySelectorAll('[data-route]').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.route === route);
    });
  }

  function updatePageHeader(route) {
    const title = document.getElementById('pageTitle');
    const subtitle = document.getElementById('pageSubtitle');
    if (title) {
      title.setAttribute('data-i18n', `nav.${route}`);
      title.textContent = I18n.t(`nav.${route}`);
    }
    if (subtitle) {
      subtitle.setAttribute('data-i18n', `page.${route}.subtitle`);
      subtitle.textContent = I18n.t(`page.${route}.subtitle`);
    }
  }

  function onChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function init() {
    window.addEventListener('hashchange', renderCurrent);
    renderCurrent();
  }

  global.Router = { init, navigate, parseHash, onChange, renderCurrent };
})(window);
