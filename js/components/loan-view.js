/**
 * Shared rendering for Lending and Borrowing pages.
 * Renders summary stats, filter chips, grid of loan cards, and a detail modal.
 *
 * Options (passed to render):
 *   collection       -> array of loans
 *   kind             -> 'lending' | 'borrowing'
 *   filterState      -> object with `status`
 *   totalLabel, totalIcon, totalTone   -> hero stat
 *   newButtonLabel   -> create-new button label
 *   remainingLabel, paidLabel, historyLabel
 */
(function (global) {
  'use strict';

  const STATUS_BADGE = {
    unpaid:  { cls: 'badge-warning', key: 'loan.status.unpaid' },
    partial: { cls: 'badge-info',    key: 'loan.status.partial' },
    paid:    { cls: 'badge-income',  key: 'loan.status.paid' },
    overdue: { cls: 'badge-expense', key: 'loan.status.overdue' }
  };

  function summary(collection) {
    let total = 0, paid = 0, remaining = 0, overdueCount = 0, activeCount = 0, paidCount = 0;
    const today = Fmt.today();
    for (const l of collection) {
      total += Number(l.principal || 0);
      const p = Store.totalPaid(l);
      paid += p;
      const rem = Math.max(0, l.principal - p);
      remaining += rem;
      const status = Store.loanStatus(l);
      if (status === 'paid') paidCount++;
      else activeCount++;
      if (status === 'overdue') overdueCount++;
    }
    return { total, paid, remaining, overdueCount, activeCount, paidCount };
  }

  function loanCard(loan, opts) {
    const person = Store.getPersonById(loan.personId);
    const paid = Store.totalPaid(loan);
    const remaining = Math.max(0, loan.principal - paid);
    const progress = loan.principal > 0 ? Math.min(100, (paid / loan.principal) * 100) : 0;
    const status = Store.loanStatus(loan);
    const badge = STATUS_BADGE[status] || STATUS_BADGE.unpaid;
    const due = Fmt.formatDueHint(loan.dueDate, I18n.getLang());

    const progressTone = status === 'paid' ? 'income' : (status === 'overdue' ? 'expense' : '');

    const amountTone = opts.kind === 'lending' ? 'text-income' : 'text-expense';

    return `
      <article class="loan-card" data-loan-id="${loan.id}">
        <header class="loan-head">
          <div class="loan-person">
            <span class="avatar lg avatar-p${person ? person.color : 1}">${Fmt.initials(person ? person.name : '?')}</span>
            <div>
              <div class="loan-person-name">${person ? person.name : '—'}</div>
              <div class="loan-person-note">${loan.note || ''}</div>
            </div>
          </div>
          <span class="badge ${badge.cls}">${I18n.t(badge.key)}</span>
        </header>

        <div class="flex justify-between items-center">
          <span class="text-muted">${I18n.t('loan.principal')}</span>
          <span class="loan-amount-big ${amountTone}">${Fmt.formatAmount(loan.principal, { absolute: true })}</span>
        </div>

        <dl class="loan-details">
          <div>
            <dt>${opts.paidLabel}</dt>
            <dd>${Fmt.formatAmount(paid, { absolute: true })}</dd>
          </div>
          <div>
            <dt>${opts.remainingLabel}</dt>
            <dd>${Fmt.formatAmount(remaining, { absolute: true })}</dd>
          </div>
          <div>
            <dt>${I18n.t('loan.dueDate')}</dt>
            <dd>${Fmt.formatDateShort(loan.dueDate, I18n.getLang())}</dd>
          </div>
        </dl>

        <footer class="loan-footer">
          <div class="loan-progress-wrap">
            <div class="loan-progress-meta">
              <span>${Math.round(progress)}%</span>
              <span class="${due.tone === 'expense' ? 'text-expense' : (due.tone === 'warning' ? 'text-muted' : 'text-muted')}">${due.text}</span>
            </div>
            <div class="progress"><div class="progress-bar ${progressTone}" style="width:${progress}%"></div></div>
          </div>
        </footer>
      </article>`;
  }

  function statusChips(filterState) {
    const chips = [
      { id: 'all',     label: I18n.t('loan.filter.all') },
      { id: 'active',  label: I18n.t('loan.filter.active') },
      { id: 'overdue', label: I18n.t('loan.filter.overdue') },
      { id: 'paid',    label: I18n.t('loan.filter.paid') }
    ];
    return chips
      .map((c) => `<button class="chip ${filterState.status === c.id ? 'is-active' : ''}" data-status="${c.id}">${c.label}</button>`)
      .join('');
  }

  function applyFilter(collection, filterState) {
    if (filterState.status === 'all') return collection.slice();
    return collection.filter((l) => {
      const s = Store.loanStatus(l);
      if (filterState.status === 'active') return s !== 'paid';
      if (filterState.status === 'overdue') return s === 'overdue';
      if (filterState.status === 'paid') return s === 'paid';
      return true;
    });
  }

  function collectPayments(collection) {
    const all = [];
    for (const loan of collection) {
      const payments = loan.payments || [];
      for (const p of payments) {
        all.push({ payment: p, loan });
      }
    }
    all.sort((a, b) => {
      const byDate = Fmt.parseDate(b.payment.date) - Fmt.parseDate(a.payment.date);
      if (byDate) return byDate;
      const ca = a.payment.createdAt || a.payment.id || '';
      const cb = b.payment.createdAt || b.payment.id || '';
      return ca < cb ? 1 : ca > cb ? -1 : 0;
    });
    return all;
  }

  function paymentRow(entry, opts) {
    const { payment, loan } = entry;
    const person = Store.getPersonById(loan.personId);
    const account = Store.getAccountById(payment.accountId);
    const accountLabel = account ? account.name : '?';
    const personLabel = person ? person.name : '—';
    const isLending = opts.kind === 'lending';
    const tone = isLending ? 'income' : 'expense';
    const icon = isLending ? 'trending-up' : 'trending-down';
    const sign = isLending ? '+' : '−';
    return `
      <div class="txn-row" data-loan-id="${loan.id}" style="cursor:pointer">
        <span class="circle-icon ${tone}" data-icon="${icon}"></span>
        <div>
          <div class="txn-title">${Fmt.escapeHTML(personLabel)}</div>
          <div class="txn-sub">
            <span>${Fmt.formatRelative(payment.date, I18n.getLang())}</span>
            <span>•</span><span>${Fmt.escapeHTML(accountLabel)}</span>
            ${payment.note ? `<span>•</span><span>${Fmt.escapeHTML(payment.note)}</span>` : ''}
          </div>
        </div>
        <div class="txn-amount ${tone}">${sign}${Fmt.formatAmount(payment.amount, { absolute: true })}</div>
      </div>`;
  }

  function render(container, opts) {
    const list = applyFilter(opts.collection, opts.filterState);
    const s = summary(opts.collection);
    if (!opts.filterState.historyView) opts.filterState.historyView = 'recent';
    const allPayments = collectPayments(opts.collection);
    const showAll = opts.filterState.historyView === 'all';
    const visiblePayments = showAll ? allPayments : allPayments.slice(0, 10);

    container.innerHTML = `
      <div class="page">
        <section class="grid grid-4">
          <div class="stat-card">
            <div class="stat-card-head">
              <span class="circle-icon ${opts.totalTone}" data-icon="${opts.totalIcon}"></span>
              <span class="badge badge-primary">${opts.collection.length}</span>
            </div>
            <div>
              <div class="stat-label">${opts.totalLabel}</div>
              <div class="stat-value small">${Fmt.formatAmount(s.remaining, { absolute: true })}</div>
              <div class="stat-meta text-muted">${opts.remainingLabel}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card-head">
              <span class="circle-icon primary" data-icon="coins"></span>
              <span class="badge badge-primary">${s.paidCount}/${opts.collection.length}</span>
            </div>
            <div>
              <div class="stat-label">${opts.paidLabel}</div>
              <div class="stat-value small">${Fmt.formatAmount(s.paid, { absolute: true })}</div>
              <div class="stat-meta text-muted">${Fmt.formatAmount(s.total, { absolute: true })} ${I18n.t('loan.principal').toLowerCase()}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card-head">
              <span class="circle-icon expense" data-icon="alert"></span>
              <span class="badge ${s.overdueCount ? 'badge-expense' : ''}">${s.overdueCount}</span>
            </div>
            <div>
              <div class="stat-label">${I18n.t('reports.overdue')}</div>
              <div class="stat-value small">${s.overdueCount}</div>
              <div class="stat-meta text-muted">${I18n.t('loan.status.overdue')}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card-head">
              <span class="circle-icon warning" data-icon="clock"></span>
              <span class="badge">${s.activeCount}</span>
            </div>
            <div>
              <div class="stat-label">${I18n.t('loan.filter.active')}</div>
              <div class="stat-value small">${s.activeCount}</div>
              <div class="stat-meta text-muted">${I18n.t('loan.filter.active')}</div>
            </div>
          </div>
        </section>

        <section class="section-header">
          <div class="chip-group" id="loanFilterChips">${statusChips(opts.filterState)}</div>
          <div class="actions">
            <button class="btn btn-primary" id="loanNewBtn">
              <span data-icon="plus"></span>
              <span>${opts.newButtonLabel}</span>
            </button>
          </div>
        </section>

        <section class="grid grid-3" id="loanGrid">
          ${list.length
            ? list.map((l) => loanCard(l, opts)).join('')
            : `<div class="empty" style="grid-column:1/-1"><div class="empty-icon" data-icon="coins"></div><h3>${I18n.t('loan.empty')}</h3></div>`}
        </section>

        <section class="card">
          <div class="card-header">
            <div>
              <div class="card-title">${I18n.t('loan.history')}</div>
            </div>
            <div class="chip-group" id="paymentHistoryToggle">
              <button class="chip ${showAll ? '' : 'is-active'}" data-history-view="recent">${I18n.t('loan.history.recent')}</button>
              <button class="chip ${showAll ? 'is-active' : ''}" data-history-view="all">${I18n.t('loan.history.all')}</button>
            </div>
          </div>
          ${visiblePayments.length
            ? `<div class="list" id="paymentHistoryList">${visiblePayments.map((entry) => paymentRow(entry, opts)).join('')}</div>`
            : `<div class="empty"><div class="empty-icon" data-icon="receipt"></div><p class="text-muted">${I18n.t('loan.noPayments')}</p></div>`}
        </section>
      </div>
    `;

    // Filter events
    container.querySelectorAll('#loanFilterChips .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        opts.filterState.status = chip.dataset.status;
        render(container, opts);
        Icons.render(container);
        I18n.applyTranslations(container);
      });
    });

    const newBtn = container.querySelector('#loanNewBtn');
    if (newBtn) newBtn.addEventListener('click', () => Forms.loanForm(opts.kind));

    // Card click -> detail modal
    container.querySelectorAll('.loan-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.dataset.loanId;
        const loan = opts.collection.find((l) => l.id === id);
        if (loan) openDetail(loan, opts);
      });
    });

    // Payment history toggle
    container.querySelectorAll('#paymentHistoryToggle .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        opts.filterState.historyView = chip.dataset.historyView;
        render(container, opts);
        Icons.render(container);
        I18n.applyTranslations(container);
      });
    });

    // Payment row click -> open the loan detail modal
    container.querySelectorAll('#paymentHistoryList .txn-row').forEach((row) => {
      row.addEventListener('click', () => {
        const id = row.dataset.loanId;
        const loan = opts.collection.find((l) => l.id === id);
        if (loan) openDetail(loan, opts);
      });
    });
  }

  function openDetail(loan, opts) {
    const person = Store.getPersonById(loan.personId);
    const paid = Store.totalPaid(loan);
    const remaining = Math.max(0, loan.principal - paid);
    const status = Store.loanStatus(loan);
    const badge = STATUS_BADGE[status] || STATUS_BADGE.unpaid;
    const payments = (loan.payments || []).slice().sort((a, b) => {
      const byDate = Fmt.parseDate(b.date) - Fmt.parseDate(a.date);
      if (byDate) return byDate;
      const ca = a.createdAt || a.id || '';
      const cb = b.createdAt || b.id || '';
      return ca < cb ? 1 : ca > cb ? -1 : 0;
    });

    const historyHTML = payments.length
      ? payments.map((p) => `
          <div class="payment-item" data-payment-id="${p.id}">
            <div>
              <div class="payment-date">${Fmt.formatDate(p.date, I18n.getLang())}</div>
              ${p.note ? `<div class="payment-note">${p.note}</div>` : ''}
            </div>
            <div class="payment-amount ${opts.kind === 'lending' ? 'text-income' : 'text-expense'}">${Fmt.formatAmount(p.amount, { absolute: true })}</div>
            <button type="button" class="icon-btn ghost" data-payment-delete aria-label="${I18n.t('action.delete')}"><span data-icon="trash"></span></button>
          </div>`).join('')
      : `<div class="empty"><div class="empty-icon" data-icon="receipt"></div><p class="text-muted">${I18n.t('loan.noPayments')}</p></div>`;

    const bodyHTML = `
      <div class="flex items-center gap-3" style="margin-bottom: var(--space-4)">
        <span class="avatar lg avatar-p${person ? person.color : 1}">${Fmt.initials(person ? person.name : '?')}</span>
        <div>
          <div class="loan-person-name" style="font-size: var(--fs-lg)">${person ? person.name : '—'}</div>
          <div class="text-muted" style="font-size: var(--fs-sm)">${loan.note || ''}</div>
        </div>
        <span class="badge ${badge.cls}" style="margin-left:auto">${I18n.t(badge.key)}</span>
      </div>

      <dl class="detail-grid">
        <div class="detail-item">
          <dt>${I18n.t('loan.principal')}</dt>
          <dd>${Fmt.formatAmount(loan.principal, { absolute: true })}</dd>
        </div>
        <div class="detail-item">
          <dt>${opts.paidLabel}</dt>
          <dd class="${opts.kind === 'lending' ? 'text-income' : 'text-expense'}">${Fmt.formatAmount(paid, { absolute: true })}</dd>
        </div>
        <div class="detail-item">
          <dt>${I18n.t('loan.remaining')}</dt>
          <dd>${Fmt.formatAmount(remaining, { absolute: true })}</dd>
        </div>
        <div class="detail-item">
          <dt>${I18n.t('loan.dueDate')}</dt>
          <dd>${Fmt.formatDate(loan.dueDate, I18n.getLang())}</dd>
        </div>
      </dl>

      <div class="progress" style="margin-bottom: var(--space-4)"><div class="progress-bar ${status === 'paid' ? 'income' : ''}" style="width:${(paid / loan.principal) * 100}%"></div></div>

      <div class="section-header" style="margin-bottom: var(--space-3)">
        <h3 style="font-size: var(--fs-md)">${opts.historyLabel}</h3>
        <span class="badge">${payments.length}</span>
      </div>
      <div class="payment-history">${historyHTML}</div>
    `;

    const editLabel = opts.kind === 'lending' ? I18n.t('action.edit.loan') : I18n.t('action.edit.debt');
    const deleteLabel = opts.kind === 'lending' ? I18n.t('action.delete.loan') : I18n.t('action.delete.debt');

    Modal.open({
      title: opts.kind === 'lending' ? I18n.t('nav.lending') : I18n.t('nav.borrowing'),
      subtitle: `${I18n.t('loan.startDate')}: ${Fmt.formatDate(loan.startDate, I18n.getLang())}`,
      size: 'lg',
      bodyHTML,
      actions: [
        {
          label: I18n.t('action.add.payment'),
          variant: 'primary',
          keepOpen: true,
          onClick: () => Forms.paymentForm(opts.kind, loan)
        },
        {
          label: editLabel,
          variant: 'secondary',
          keepOpen: true,
          onClick: () => Forms.loanForm(opts.kind, loan)
        },
        {
          label: deleteLabel,
          variant: 'secondary',
          keepOpen: true,
          onClick: () => Forms.confirm({
            title: deleteLabel,
            message: I18n.t('confirm.deleteLoan'),
            confirmLabel: I18n.t('action.delete'),
            onConfirm: () => Store.deleteLoan(opts.kind, loan.id)
          })
        },
        { label: I18n.t('action.close'), variant: 'secondary' }
      ]
    });

    // Wire payment delete buttons
    const root = document.getElementById('modalRoot');
    root.querySelectorAll('[data-payment-delete]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.payment-item');
        const pid = item && item.dataset.paymentId;
        const payment = (loan.payments || []).find((p) => p.id === pid);
        if (!payment) return;
        Forms.confirm({
          title: I18n.t('action.delete'),
          message: I18n.t('confirm.deleteTransaction'),
          confirmLabel: I18n.t('action.delete'),
          onConfirm: async () => {
            await Store.removeLoanPayment(opts.kind, loan.id, payment);
            Modal.close();
          }
        });
      });
    });
  }

  global.LoanView = { render };
})(window);
