/**
 * App bootstrap.
 * - Loads data + locale
 * - Renders icons + topbar listeners
 * - Initializes router
 * - Handles language switch + quick-add modal
 */
(function (global) {
  'use strict';

  async function boot() {
    try {
      await Promise.all([I18n.init(), Store.load()]);
    } catch (err) {
      console.error('Failed to bootstrap app', err);
      document.getElementById('content').innerHTML = `
        <div class="empty">
          <div class="empty-icon" data-icon="alert"></div>
          <h3>Failed to load data</h3>
          <p class="text-muted">${err && err.message ? err.message : 'Unknown error'}</p>
        </div>`;
      Icons.render(document);
      return;
    }

    Icons.render(document);
    setupLanguageSwitcher();
    setupQuickAdd();
    setupRoutingFromClicks();

    I18n.onChange(() => {
      I18n.applyTranslations(document);
      Router.renderCurrent();
      updateLangButtons();
    });

    Router.init();
    updateLangButtons();
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
    // Simple preview modal that showcases the add-transaction flow.
    const cats = Store.getCategories();
    const expenseCats = cats.filter((c) => c.type === 'expense');
    const today = new Date().toISOString().slice(0, 10);

    const bodyHTML = `
      <div class="type-toggle" id="typeToggle">
        <button type="button" class="is-active expense" data-type="expense">${I18n.t('txn.expense')}</button>
        <button type="button" data-type="income">${I18n.t('txn.income')}</button>
      </div>

      <div class="amount-input">
        <span class="currency">${Store.currency.symbol}</span>
        <input type="text" placeholder="0" id="amountValue" autocomplete="off"/>
      </div>

      <div class="grid grid-2" style="gap: var(--space-3); margin-bottom: var(--space-3)">
        <div class="form-group">
          <label class="form-label">${I18n.t('txn.category')}</label>
          <select class="select" id="txnCat">
            ${expenseCats.map((c) => `<option value="${c.id}">${I18n.t(c.nameKey)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">${I18n.t('txn.date')}</label>
          <input type="date" class="input" value="${today}"/>
        </div>
      </div>
      <div class="form-group" style="margin-bottom: var(--space-3)">
        <label class="form-label">${I18n.t('txn.person')}</label>
        <select class="select">
          <option value="">—</option>
          ${Store.getPeople().map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">${I18n.t('txn.note')}</label>
        <textarea class="textarea" placeholder="${I18n.t('txn.description')}"></textarea>
      </div>
    `;

    Modal.open({
      title: I18n.t('action.add.transaction'),
      subtitle: I18n.t('page.transactions.subtitle'),
      bodyHTML,
      actions: [
        { label: I18n.t('action.cancel'), variant: 'secondary' },
        { label: I18n.t('action.save'), variant: 'primary', onClick: () => Toast.show('UI preview — logic comes next phase') }
      ]
    });

    // Wire the type toggle so the category list switches between income/expense
    const root = document.getElementById('modalRoot');
    const toggle = root.querySelector('#typeToggle');
    const catSelect = root.querySelector('#txnCat');
    toggle.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        toggle.querySelectorAll('button').forEach((x) => x.classList.remove('is-active', 'income', 'expense'));
        b.classList.add('is-active', b.dataset.type);
        const filtered = cats.filter((c) => c.type === b.dataset.type);
        catSelect.innerHTML = filtered.map((c) => `<option value="${c.id}">${I18n.t(c.nameKey)}</option>`).join('');
      });
    });

    // Live format amount input
    const amountInput = root.querySelector('#amountValue');
    amountInput.addEventListener('input', () => {
      const raw = amountInput.value.replace(/[^\d]/g, '');
      const num = Number(raw) || 0;
      amountInput.value = num ? num.toLocaleString('en-US') : '';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
