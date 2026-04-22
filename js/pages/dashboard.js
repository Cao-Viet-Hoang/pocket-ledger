/**
 * Dashboard page.
 * High-level snapshot: balance, income/expense, receivables/payables,
 * recent transactions and upcoming due loans.
 */
(function (global) {
  'use strict';

  function statCard({ label, hint, value, icon, tone = 'primary', delta, deltaTone = 'up' }) {
    const deltaHTML = delta
      ? `<span class="delta ${deltaTone}"><span data-icon="${deltaTone === 'up' ? 'trending-up' : 'trending-down'}"></span>${delta}</span>`
      : '';
    const hintHTML = hint ? `<span class="text-muted">${hint}</span>` : '';
    return `
      <div class="stat-card">
        <div class="stat-card-head">
          <span class="circle-icon ${tone}" data-icon="${icon}"></span>
          ${deltaHTML}
        </div>
        <div>
          <div class="stat-label">${label}</div>
          <div class="stat-value small">${value}</div>
          ${hintHTML ? `<div class="stat-meta">${hintHTML}</div>` : ''}
        </div>
      </div>`;
  }

  function recentTransactionRow(t) {
    const category = Store.getCategoryById(t.category);
    const person = t.personId ? Store.getPersonById(t.personId) : null;
    const amountClass = t.type === 'income' ? 'income' : 'expense';
    const sign = t.type === 'income' ? '+' : '-';
    const personLabel = person ? ` • ${person.name}` : '';
    const title = t.note || (category ? I18n.t(category.nameKey) : '');
    return `
      <div class="txn-row">
        <span class="circle-icon ${category ? category.tone : ''}" data-icon="${category ? category.icon : 'exchange'}"></span>
        <div>
          <div class="txn-title">${title}</div>
          <div class="txn-sub">
            <span>${category ? I18n.t(category.nameKey) : ''}</span>
            <span>•</span>
            <span>${Fmt.formatRelative(t.date, I18n.getLang())}</span>
            ${personLabel ? `<span class="text-subtle">${personLabel}</span>` : ''}
          </div>
        </div>
        <div class="txn-amount ${amountClass}">${sign}${Fmt.formatAmount(t.amount, { absolute: true })}</div>
      </div>`;
  }

  function dueRow({ loan, kind, diff, remaining }) {
    const person = Store.getPersonById(loan.personId);
    const hint = Fmt.formatDueHint(loan.dueDate, I18n.getLang());
    const avatarClass = person ? `avatar-p${person.color || 1}` : '';
    const kindLabel =
      kind === 'lending'
        ? I18n.t('dash.receivable.hint')
        : I18n.t('dash.payable.hint');
    const badgeClass = hint.tone === 'expense' ? 'badge-expense' : (hint.tone === 'warning' ? 'badge-warning' : '');
    return `
      <div class="due-item">
        <span class="avatar sm ${avatarClass}">${Fmt.initials(person ? person.name : '?')}</span>
        <div class="due-main">
          <div class="due-title">${person ? person.name : '—'}</div>
          <div class="due-sub">${kindLabel} • <span class="badge ${badgeClass}">${hint.text}</span></div>
        </div>
        <div class="due-amount ${kind === 'lending' ? 'text-income' : 'text-expense'}">${Fmt.formatAmount(remaining, { absolute: true })}</div>
      </div>`;
  }

  function render(container) {
    const today = Fmt.today();
    const y = today.getFullYear();
    const m = today.getMonth();

    const thisMonthTxns = Store.filterByMonth(Store.getTransactions(), y, m);
    const prevDate = new Date(y, m - 1, 1);
    const prevMonthTxns = Store.filterByMonth(Store.getTransactions(), prevDate.getFullYear(), prevDate.getMonth());

    const incomeMonth = Store.totalIncome(thisMonthTxns);
    const expenseMonth = Store.totalExpense(thisMonthTxns);
    const net = incomeMonth - expenseMonth;
    const prevIncome = Store.totalIncome(prevMonthTxns);
    const prevExpense = Store.totalExpense(prevMonthTxns);

    const deltaPct = (curr, prev) => {
      if (!prev) return null;
      const pct = ((curr - prev) / prev) * 100;
      return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
    };
    const incomeDelta = deltaPct(incomeMonth, prevIncome);
    const expenseDelta = deltaPct(expenseMonth, prevExpense);

    const receivable = Store.totalReceivable();
    const payable = Store.totalPayable();
    const balance = Store.currentBalance();

    const recentTxns = Store.getTransactions()
      .slice()
      .sort((a, b) => Fmt.parseDate(b.date) - Fmt.parseDate(a.date))
      .slice(0, 6);

    const upcoming = Store.upcomingDueLoans(14).slice(0, 5);

    const accounts = Store.getAccounts();
    const activeSavings = Store.getSavings().filter((s) => Store.savingsStatus(s) !== 'withdrawn');

    container.innerHTML = `
      <div class="page">
        <section class="hero-balance">
          <span class="hero-label">
            <span data-icon="wallet"></span>
            <span data-i18n="dash.currentBalance">Current balance</span>
          </span>
          <div class="hero-amount">${Fmt.formatAmount(balance)}</div>
          <div class="hero-meta">
            <div class="hero-meta-item">
              <span class="hero-meta-label" data-i18n="dash.incomeThisMonth">Income this month</span>
              <span class="hero-meta-value">+${Fmt.formatAmount(incomeMonth, { absolute: true })}</span>
            </div>
            <div class="hero-meta-item">
              <span class="hero-meta-label" data-i18n="dash.expenseThisMonth">Expenses this month</span>
              <span class="hero-meta-value">-${Fmt.formatAmount(expenseMonth, { absolute: true })}</span>
            </div>
            <div class="hero-meta-item">
              <span class="hero-meta-label" data-i18n="dash.net">Net this month</span>
              <span class="hero-meta-value">${net >= 0 ? '+' : '-'}${Fmt.formatAmount(Math.abs(net), { absolute: true })}</span>
            </div>
          </div>
        </section>

        <section class="grid grid-4">
          ${statCard({
            label: I18n.t('dash.incomeThisMonth'),
            value: Fmt.formatAmount(incomeMonth, { absolute: true }),
            icon: 'trending-up',
            tone: 'income',
            delta: incomeDelta,
            deltaTone: incomeDelta && incomeDelta.startsWith('-') ? 'down' : 'up'
          })}
          ${statCard({
            label: I18n.t('dash.expenseThisMonth'),
            value: Fmt.formatAmount(expenseMonth, { absolute: true }),
            icon: 'trending-down',
            tone: 'expense',
            delta: expenseDelta,
            deltaTone: expenseDelta && expenseDelta.startsWith('-') ? 'up' : 'down'
          })}
          ${statCard({
            label: I18n.t('dash.receivable'),
            hint: I18n.t('dash.receivable.hint'),
            value: Fmt.formatAmount(receivable, { absolute: true }),
            icon: 'hand-coin',
            tone: 'info'
          })}
          ${statCard({
            label: I18n.t('dash.payable'),
            hint: I18n.t('dash.payable.hint'),
            value: Fmt.formatAmount(payable, { absolute: true }),
            icon: 'hand-receive',
            tone: 'warning'
          })}
        </section>

        <section class="grid grid-4">
          ${statCard({
            label: I18n.t('account.totalBalance'),
            hint: I18n.t('account.totalBalance.hint'),
            value: Fmt.formatAmount(Store.totalAccountsBalance(), { absolute: true }),
            icon: 'bank',
            tone: 'info'
          })}
          ${statCard({
            label: I18n.t('savings.totalSavings'),
            hint: I18n.t('savings.totalSavings.hint'),
            value: Fmt.formatAmount(Store.totalSavingsPrincipal() + Store.totalSavingsInterest(), { absolute: true }),
            icon: 'vault',
            tone: 'purple'
          })}
          ${statCard({
            label: I18n.t('savings.totalPrincipal'),
            value: Fmt.formatAmount(Store.totalSavingsPrincipal(), { absolute: true }),
            icon: 'piggy-bank',
            tone: 'primary'
          })}
          ${statCard({
            label: I18n.t('savings.totalInterest'),
            value: Fmt.formatAmount(Store.totalSavingsInterest(), { absolute: true }),
            icon: 'percent',
            tone: 'income'
          })}
        </section>

        <section class="grid grid-2-1">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title" data-i18n="dash.recentTxns">Recent transactions</div>
                <div class="card-subtitle" data-i18n="page.transactions.subtitle">All income and expenses in one place</div>
              </div>
              <a class="btn btn-ghost btn-sm" href="#/transactions">
                <span data-i18n="action.viewAll">View all</span>
                <span data-icon="chevronRight"></span>
              </a>
            </div>
            <div class="list">
              ${recentTxns.length
                ? recentTxns.map(recentTransactionRow).join('')
                : '<div class="empty"><div class="empty-icon" data-icon="exchange"></div><h3>No transactions</h3></div>'}
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title" data-i18n="dash.upcomingDue">Upcoming & overdue</div>
                <div class="card-subtitle">Next 14 days</div>
              </div>
              <span class="badge badge-warning">${upcoming.length}</span>
            </div>
            <div class="list">
              ${upcoming.length
                ? upcoming.map(dueRow).join('')
                : `<div class="empty"><div class="empty-icon" data-icon="check"></div><p data-i18n="dash.upcoming.empty">No upcoming due loans.</p></div>`}
            </div>
          </div>
        </section>

        <section class="grid grid-2">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title" data-i18n="dash.accounts">${I18n.t('dash.accounts')}</div>
              </div>
              <a class="btn btn-ghost btn-sm" href="#/accounts">
                <span data-i18n="action.viewAll">View all</span>
                <span data-icon="chevronRight"></span>
              </a>
            </div>
            <div class="list">
              ${accounts.length ? accounts.slice(0, 5).map((acc) => {
                const icon = acc.type === 'bank' ? 'bank' : acc.type === 'ewallet' ? 'smartphone' : 'wallet';
                const tone = acc.type === 'bank' ? 'info' : acc.type === 'ewallet' ? 'purple' : 'income';
                return `
                <div class="txn-row">
                  <span class="circle-icon ${tone}" data-icon="${icon}"></span>
                  <div>
                    <div class="txn-title">${acc.name}</div>
                    <div class="txn-sub"><span>${I18n.t('account.type.' + acc.type)}</span></div>
                  </div>
                  <div class="txn-amount" style="color:var(--color-info)">${Fmt.formatAmount(acc.balance)}</div>
                </div>`;
              }).join('') : '<div class="empty"><div class="empty-icon" data-icon="bank"></div><p>No accounts</p></div>'}
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title" data-i18n="dash.savings">${I18n.t('dash.savings')}</div>
              </div>
              <a class="btn btn-ghost btn-sm" href="#/savings">
                <span data-i18n="action.viewAll">View all</span>
                <span data-icon="chevronRight"></span>
              </a>
            </div>
            <div class="list">
              ${activeSavings.length ? activeSavings.slice(0, 5).map((sav) => {
                const status = Store.savingsStatus(sav);
                const interest = Store.savingsInterestEarned(sav);
                const total = Number(sav.principal || 0) + interest;
                const badgeCls = status === 'matured' ? 'badge-warning' : status === 'withdrawn' ? 'badge-expense' : 'badge-income';
                const statusKey = 'savings.status.' + status;
                return `
                <div class="txn-row">
                  <span class="circle-icon primary" data-icon="vault"></span>
                  <div>
                    <div class="txn-title">${sav.name}</div>
                    <div class="txn-sub">
                      <span class="badge ${badgeCls}">${I18n.t(statusKey)}</span>
                      <span>•</span>
                      <span>${Number(Number(sav.interestRate || 0).toFixed(2))}%</span>
                    </div>
                  </div>
                  <div class="txn-amount text-income">${Fmt.formatAmount(total, { absolute: true })}</div>
                </div>`;
              }).join('') : '<div class="empty"><div class="empty-icon" data-icon="vault"></div><p>No savings</p></div>'}
            </div>
          </div>
        </section>
      </div>
    `;
  }

  global.Pages = global.Pages || {};
  global.Pages.dashboard = { render };
})(window);
