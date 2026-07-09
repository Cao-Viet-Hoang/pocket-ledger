/**
 * Savings page.
 * Track savings deposits, interest rates, terms, and maturity.
 */
(function (global) {
  'use strict';

  let currentFilter = 'active';

  const escapeHTML = Fmt.escapeHTML;

  function statusBadge(status) {
    if (status === 'matured') return `<span class="badge badge-warning">${I18n.t('savings.status.matured')}</span>`;
    if (status === 'withdrawn') return `<span class="badge badge-expense">${I18n.t('savings.status.withdrawn')}</span>`;
    return `<span class="badge badge-income">${I18n.t('savings.status.active')}</span>`;
  }

  function daysRemaining(sav) {
    if (Store.savingsStatus(sav) !== 'active') return '';
    const days = Fmt.daysBetween(Fmt.today(), Fmt.parseDate(sav.maturityDate));
    if (days <= 0) return '';
    return I18n.t('savings.daysRemaining', { n: days });
  }

  function savingsCard(sav) {
    const status = Store.savingsStatus(sav);
    const interest = Store.savingsInterestEarned(sav);
    const account = Store.getAccountById(sav.accountId);
    const remaining = daysRemaining(sav);
    const total = Number(sav.principal || 0) + interest;
    const progressPct = status === 'active'
      ? Math.min(100, Math.round(
          (Fmt.daysBetween(Fmt.parseDate(sav.startDate), Fmt.today()) /
           Math.max(1, Fmt.daysBetween(Fmt.parseDate(sav.startDate), Fmt.parseDate(sav.maturityDate)))) * 100
        ))
      : 100;

    return `
      <div class="loan-card" data-id="${sav.id}">
        <div class="loan-head">
          <div class="loan-person">
            <span class="circle-icon lg primary" data-icon="vault"></span>
            <div>
              <div class="loan-person-name">${escapeHTML(sav.name)}</div>
              <div class="loan-person-note">
                ${account ? escapeHTML(account.name) : ''}
                ${remaining ? ` • ${remaining}` : ''}
              </div>
            </div>
          </div>
          ${statusBadge(status)}
        </div>

        <div class="loan-amount-big text-income">${Fmt.formatAmount(total, { absolute: true })}</div>

        <dl class="loan-details">
          <div>
            <dt>${I18n.t('savings.principal')}</dt>
            <dd>${Fmt.formatAmount(sav.principal, { absolute: true })}</dd>
          </div>
          <div>
            <dt>${I18n.t('savings.interestRate')}</dt>
            <dd>${Number(Number(sav.interestRate || 0).toFixed(2))}%</dd>
          </div>
          <div>
            <dt>${I18n.t('savings.interestEarned')}</dt>
            <dd class="text-income">+${Fmt.formatAmount(interest, { absolute: true })}</dd>
          </div>
        </dl>

        <dl class="loan-details">
          <div>
            <dt>${I18n.t('savings.termMonths')}</dt>
            <dd>${sav.termMonths} ${I18n.getLang() === 'vi' ? 'tháng' : 'months'}</dd>
          </div>
          <div>
            <dt>${I18n.t('savings.startDate')}</dt>
            <dd>${Fmt.formatDate(sav.startDate, I18n.getLang())}</dd>
          </div>
          <div>
            <dt>${I18n.t('savings.maturityDate')}</dt>
            <dd>${Fmt.formatDate(sav.maturityDate, I18n.getLang())}</dd>
          </div>
        </dl>

        <div class="loan-footer">
          <div class="loan-progress-wrap">
            <div class="loan-progress-meta">
              <span>${progressPct}%</span>
            </div>
            <div class="progress">
              <div class="progress-fill income" style="width:${progressPct}%"></div>
            </div>
          </div>
          <div class="person-actions">
            ${status === 'matured' ? `
            <button class="btn btn-sm btn-primary" data-withdraw="${sav.id}" title="${I18n.t('savings.withdraw')}">
              <span data-icon="download"></span>
              <span>${I18n.t('savings.withdraw')}</span>
            </button>` : ''}
            <button class="icon-btn ghost" data-edit="${sav.id}" title="${I18n.t('action.edit')}">
              <span data-icon="edit"></span>
            </button>
            <button class="icon-btn ghost" data-delete="${sav.id}" title="${I18n.t('action.delete')}">
              <span data-icon="trash"></span>
            </button>
          </div>
        </div>

        ${sav.note ? `<div class="text-muted" style="font-size:var(--fs-sm)">${escapeHTML(sav.note)}</div>` : ''}
      </div>`;
  }

  function render(container) {
    const allSavings = Store.getSavings();
    const filtered = currentFilter === 'all'
      ? allSavings
      : allSavings.filter((s) => Store.savingsStatus(s) === currentFilter);

    const totalPrincipal = Store.totalSavingsPrincipal();
    const totalInterest = Store.totalSavingsInterest();
    const total = totalPrincipal + totalInterest;

    const filters = ['all', 'active', 'matured', 'withdrawn'];

    container.innerHTML = `
      <div class="page">
        <section class="hero-balance" style="background:linear-gradient(135deg,#6d28d9 0%,#8b5cf6 45%,#a78bfa 100%)">
          <span class="hero-label">
            <span data-icon="vault"></span>
            <span data-i18n="savings.totalSavings">${I18n.t('savings.totalSavings')}</span>
          </span>
          <div class="hero-amount">${Fmt.formatAmount(total)}</div>
          <div class="hero-meta">
            <div class="hero-meta-item">
              <span class="hero-meta-label">${I18n.t('savings.totalPrincipal')}</span>
              <span class="hero-meta-value">${Fmt.formatAmount(totalPrincipal, { absolute: true })}</span>
            </div>
            <div class="hero-meta-item">
              <span class="hero-meta-label">${I18n.t('savings.totalInterest')}</span>
              <span class="hero-meta-value">+${Fmt.formatAmount(totalInterest, { absolute: true })}</span>
            </div>
          </div>
        </section>

        <div class="toolbar">
          <button class="btn btn-primary" id="addSavingsBtn">
            <span data-icon="plus"></span>
            <span>${I18n.t('action.add.savings')}</span>
          </button>
          <div class="chip-group" id="savingsFilter">
            ${filters.map((f) => `
              <button class="btn btn-sm ${f === currentFilter ? 'btn-primary' : 'btn-secondary'}" data-filter="${f}">
                ${I18n.t('savings.filter.' + f)}
              </button>`).join('')}
          </div>
        </div>

        <section class="grid grid-2">
          ${filtered.length
            ? filtered.map(savingsCard).join('')
            : `<div class="empty" style="grid-column:1/-1">
                <div class="empty-icon" data-icon="vault"></div>
                <h3>${I18n.t('savings.empty')}</h3>
                <p class="text-muted">${I18n.t('savings.emptyHint')}</p>
              </div>`}
        </section>
      </div>
    `;

    // Wire events
    container.querySelector('#addSavingsBtn').addEventListener('click', () => Forms.savingsForm());

    container.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentFilter = btn.dataset.filter;
        render(container);
        Icons.render(container);
        I18n.applyTranslations(container);
      });
    });

    container.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sav = Store.getSavingsById(btn.dataset.edit);
        if (sav) Forms.savingsForm(sav);
      });
    });

    container.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.delete;
        Forms.confirm({
          title: I18n.t('action.delete.savings'),
          message: I18n.t('confirm.deleteSavings'),
          onConfirm: () => Store.deleteSavings(id)
        });
      });
    });

    container.querySelectorAll('[data-withdraw]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.withdraw;
        Forms.confirm({
          title: I18n.t('savings.withdraw'),
          message: I18n.t('savings.withdrawConfirm'),
          confirmLabel: I18n.t('savings.withdraw'),
          variant: 'primary',
          onConfirm: () => Store.withdrawSavings(id)
        });
      });
    });
  }

  global.Pages = global.Pages || {};
  global.Pages.savings = { render };
})(window);
