/**
 * Accounts page.
 * Manage cash, bank accounts and e-wallets.
 * Supports transfers between accounts.
 */
(function (global) {
  'use strict';

  function accountTypeIcon(type) {
    if (type === 'bank') return 'bank';
    if (type === 'ewallet') return 'smartphone';
    return 'wallet';
  }

  function accountTypeTone(type) {
    if (type === 'bank') return 'info';
    if (type === 'ewallet') return 'purple';
    return 'income';
  }

  function accountCard(acc) {
    const icon = accountTypeIcon(acc.type);
    const tone = accountTypeTone(acc.type);
    const typeKey = 'account.type.' + acc.type;
    const balance = Number(acc.balance || 0);
    const balanceClass = balance >= 0 ? 'text-income' : 'text-expense';
    return `
      <div class="account-card" data-id="${acc.id}">
        <div class="person-head">
          <span class="circle-icon lg ${tone}" data-icon="${icon}"></span>
          <div style="flex:1;min-width:0">
            <div class="person-name">${escapeHTML(acc.name)}</div>
            <div class="person-sub" style="margin-top:4px">
              <span class="badge badge-${tone}">${I18n.t(typeKey)}</span>
              ${acc.bankName ? `<span> • ${escapeHTML(acc.bankName)}</span>` : ''}
            </div>
          </div>
          <div class="person-actions">
            <button class="icon-btn ghost" data-edit="${acc.id}" title="${I18n.t('action.edit')}">
              <span data-icon="edit"></span>
            </button>
            <button class="icon-btn ghost" data-delete="${acc.id}" title="${I18n.t('action.delete')}">
              <span data-icon="trash"></span>
            </button>
          </div>
        </div>
        <div class="person-stats" style="grid-template-columns:1fr">
          <div>
            <div class="person-stat-label">${I18n.t('account.balance')}</div>
            <div class="person-stat-value ${balanceClass}">${Fmt.formatAmount(balance)}</div>
          </div>
        </div>
        ${acc.accountNumber || acc.note ? `
        <div class="account-meta">
          ${acc.accountNumber ? `<span><span data-icon="note"></span> ${escapeHTML(acc.accountNumber)}</span>` : ''}
          ${acc.note ? `<span>${escapeHTML(acc.note)}</span>` : ''}
        </div>` : ''}
      </div>`;
  }

  function transferRow(tf) {
    const from = Store.getAccountById(tf.fromAccountId);
    const to = Store.getAccountById(tf.toAccountId);
    return `
      <div class="txn-row">
        <span class="circle-icon info" data-icon="arrow-left-right"></span>
        <div>
          <div class="txn-title">${from ? escapeHTML(from.name) : '?'} → ${to ? escapeHTML(to.name) : '?'}</div>
          <div class="txn-sub">
            <span>${Fmt.formatRelative(tf.date, I18n.getLang())}</span>
            ${tf.note ? `<span>•</span><span>${escapeHTML(tf.note)}</span>` : ''}
          </div>
        </div>
        <div class="txn-amount" style="color:var(--color-info)">${Fmt.formatAmount(tf.amount, { absolute: true })}</div>
      </div>`;
  }

  function escapeHTML(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function render(container) {
    const accounts = Store.getAccounts();
    const totalBalance = Store.totalAccountsBalance();
    const transfers = Store.getTransfers()
      .slice()
      .sort((a, b) => Fmt.parseDate(b.date) - Fmt.parseDate(a.date))
      .slice(0, 10);

    container.innerHTML = `
      <div class="page">
        <section class="hero-balance" style="background:linear-gradient(135deg,#1d4ed8 0%,#3b82f6 45%,#60a5fa 100%)">
          <span class="hero-label">
            <span data-icon="bank"></span>
            <span data-i18n="account.totalBalance">${I18n.t('account.totalBalance')}</span>
          </span>
          <div class="hero-amount">${Fmt.formatAmount(totalBalance)}</div>
          <div class="hero-meta">
            <div class="hero-meta-item">
              <span class="hero-meta-label">${I18n.t('account.totalBalance.hint')}</span>
              <span class="hero-meta-value">${accounts.length} ${I18n.t('nav.accounts').toLowerCase()}</span>
            </div>
          </div>
        </section>

        <div class="toolbar">
          <button class="btn btn-primary" id="addAccountBtn">
            <span data-icon="plus"></span>
            <span>${I18n.t('action.add.account')}</span>
          </button>
          <button class="btn btn-secondary" id="transferBtn" ${accounts.length < 2 ? 'disabled' : ''}>
            <span data-icon="arrow-left-right"></span>
            <span>${I18n.t('action.add.transfer')}</span>
          </button>
        </div>

        <section class="grid grid-3">
          ${accounts.length
            ? accounts.map(accountCard).join('')
            : `<div class="empty" style="grid-column:1/-1">
                <div class="empty-icon" data-icon="bank"></div>
                <h3>${I18n.t('account.empty')}</h3>
                <p class="text-muted">${I18n.t('account.emptyHint')}</p>
              </div>`}
        </section>

        ${transfers.length ? `
        <section class="card">
          <div class="card-header">
            <div>
              <div class="card-title">${I18n.t('transfer.history')}</div>
            </div>
          </div>
          <div class="list">
            ${transfers.map(transferRow).join('')}
          </div>
        </section>` : ''}
      </div>
    `;

    // Wire events
    const addBtn = container.querySelector('#addAccountBtn');
    if (addBtn) addBtn.addEventListener('click', () => Forms.accountForm());

    const tfBtn = container.querySelector('#transferBtn');
    if (tfBtn) tfBtn.addEventListener('click', () => Forms.transferForm());

    container.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const acc = Store.getAccountById(btn.dataset.edit);
        if (acc) Forms.accountForm(acc);
      });
    });

    container.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.delete;
        Forms.confirm({
          title: I18n.t('action.delete.account'),
          message: I18n.t('confirm.deleteAccount'),
          onConfirm: () => Store.deleteAccount(id)
        });
      });
    });
  }

  global.Pages = global.Pages || {};
  global.Pages.accounts = { render };
})(window);
