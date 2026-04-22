/**
 * App bootstrap.
 * - Loads locale
 * - If Firebase credentials are stored, connects; otherwise shows the setup modal.
 * - Renders icons + topbar listeners
 * - Initializes router
 * - Wires language switch, quick-add, configure button
 * - Re-renders current page whenever Store data changes
 */
(function (global) {
  'use strict';

  let routerStarted = false;

  async function boot() {
    try {
      await I18n.init();
    } catch (err) {
      console.error('Failed to load locales', err);
    }

    Icons.render(document);
    setupLanguageSwitcher();
    setupQuickAdd();
    setupConfigureButton();
    setupSidebarToggle();
    setupRoutingFromClicks();

    I18n.onChange(() => {
      I18n.applyTranslations(document);
      if (routerStarted) Router.renderCurrent();
      updateLangButtons();
    });

    Store.onChange(() => {
      if (!Store.isConfigured()) {
        updateUserBadge();
        return;
      }
      if (!routerStarted) {
        Router.init();
        routerStarted = true;
      } else {
        Router.renderCurrent();
      }
      updateUserBadge();
    });

    updateLangButtons();
    updateUserBadge();

    const stored = Store.getStoredCredentials();
    if (stored) {
      showLoading();
      try {
        await Store.configure({ config: stored.config, username: stored.username, seedSample: false });
      } catch (err) {
        console.error('Auto-connect failed', err);
        showSetup(err.message);
      }
    } else {
      showSetup();
    }
  }

  function showLoading() {
    const content = document.getElementById('content');
    if (!content) return;
    content.innerHTML = `
      <div class="empty">
        <div class="empty-icon" data-icon="clock"></div>
        <h3>${I18n.t('app.connecting')}</h3>
        <p class="text-muted">${I18n.t('app.connectingHint')}</p>
      </div>`;
    Icons.render(content);
  }

  function showSetup(errorMsg) {
    const content = document.getElementById('content');
    if (content) {
      content.innerHTML = `
        <div class="empty">
          <div class="empty-icon" data-icon="wallet"></div>
          <h3>${I18n.t('setup.welcome')}</h3>
          <p class="text-muted" style="max-width: 420px">${I18n.t('setup.welcomeHint')}</p>
          ${errorMsg ? `<p class="text-expense" style="font-size: var(--fs-sm); margin-top: var(--space-3)">${errorMsg}</p>` : ''}
          <button type="button" class="btn btn-primary" id="openSetupBtn" style="margin-top: var(--space-4)">
            <span data-icon="plus"></span>
            <span>${I18n.t('setup.connect')}</span>
          </button>
        </div>`;
      Icons.render(content);
      const btn = content.querySelector('#openSetupBtn');
      if (btn) btn.addEventListener('click', () => Setup.open());
    }
    // Also immediately open the modal so user doesn't have to click.
    Setup.open();
  }

  function setupLanguageSwitcher() {
    document.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lang = btn.dataset.lang;
        if (lang && lang !== I18n.getLang()) I18n.setLang(lang);
      });
    });
  }

  function updateLangButtons() {
    const lang = I18n.getLang();
    document.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.lang === lang);
    });
  }

  function updateUserBadge() {
    const el = document.getElementById('userBadge');
    if (!el) return;
    const name = Store.getUsername();
    if (name) {
      el.style.display = '';
      el.querySelector('.user-name').textContent = name;
    } else {
      el.style.display = 'none';
    }
  }

  function setupConfigureButton() {
    const btn = document.getElementById('configureBtn');
    if (btn) btn.addEventListener('click', () => Setup.open());

    const dc = document.getElementById('disconnectBtn');
    if (dc) dc.addEventListener('click', () => {
      Forms.confirm({
        title: I18n.t('setup.disconnectTitle'),
        message: I18n.t('setup.disconnectHint'),
        confirmLabel: I18n.t('setup.disconnect'),
        variant: 'danger',
        onConfirm: async () => {
          routerStarted = false;
          Store.disconnect();
          showSetup();
        }
      });
    });
  }

  function setupSidebarToggle() {
    const toggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (!toggle || !sidebar || !backdrop) return;

    const open = () => {
      sidebar.classList.add('is-open');
      backdrop.classList.add('is-open');
    };
    const close = () => {
      sidebar.classList.remove('is-open');
      backdrop.classList.remove('is-open');
    };

    toggle.addEventListener('click', () => {
      if (sidebar.classList.contains('is-open')) close(); else open();
    });
    backdrop.addEventListener('click', close);
    sidebar.querySelectorAll('[data-route]').forEach((link) => {
      link.addEventListener('click', close);
    });
  }

  function setupRoutingFromClicks() {
    document.addEventListener('click', (e) => {
      const tabAdd = e.target.closest('[data-action="quick-add"]');
      if (tabAdd) {
        e.preventDefault();
        openQuickAdd();
      }
    });
  }

  function setupQuickAdd() {
    const btn = document.getElementById('quickAddBtn');
    if (btn) btn.addEventListener('click', openQuickAdd);
  }

  function openQuickAdd() {
    if (!Store.isConfigured()) {
      Setup.open();
      return;
    }
    Forms.transactionForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
