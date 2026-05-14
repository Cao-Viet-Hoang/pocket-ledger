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

  function dueRow({ loan, kind, diff, remaining, installment, installmentIndex, installmentTotal }) {
    const person = Store.getPersonById(loan.personId);
    const dueDate = installment ? installment.dueDate : loan.dueDate;
    const hint = Fmt.formatDueHint(dueDate, I18n.getLang());
    const avatarClass = person ? `avatar-p${person.color || 1}` : '';
    // Show installment context (e.g. "Trả góp 3/12") instead of the generic
    // payable hint when this row represents a single schedule slot.
    const kindLabel = installment
      ? I18n.t('dash.installmentOf', { n: installmentIndex + 1, total: installmentTotal })
      : (kind === 'lending' ? I18n.t('dash.receivable.hint') : I18n.t('dash.payable.hint'));
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

  function openDayDetail(y, m, day) {
    var lang = I18n.getLang();
    var date = new Date(y, m, day);
    var dateStr = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    var fullDate = date.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    var txns = Store.getTransactions()
      .filter(function (t) { return t.date === dateStr && t.type === 'expense'; })
      .sort(function (a, b) {
        var ca = a.createdAt || a.id || '';
        var cb = b.createdAt || b.id || '';
        return ca < cb ? 1 : ca > cb ? -1 : 0;
      });

    var total = txns.reduce(function (s, t) { return s + (t.amount || 0); }, 0);

    var rowsHTML = txns.map(function (t) {
      var cat = Store.getCategoryById(t.category);
      var person = t.personId ? Store.getPersonById(t.personId) : null;
      var label = t.note ? Fmt.escapeHTML(t.note) : (cat ? I18n.t(cat.nameKey) : '—');
      var sub = cat ? I18n.t(cat.nameKey) : '—';
      var personChip = person
        ? '<span class="badge" style="background:var(--avatar-p' + (person.color || 1) + '-bg,#e2e8f0);color:var(--color-text)">' + Fmt.escapeHTML(person.name) + '</span>'
        : '';
      return '<div class="txn-row">' +
        '<span class="circle-icon ' + (cat ? cat.tone : 'expense') + '" data-icon="' + (cat ? cat.icon : 'exchange') + '"></span>' +
        '<div style="flex:1;min-width:0">' +
          '<div class="txn-title">' + label + '</div>' +
          '<div class="txn-sub"><span>' + sub + '</span>' + (personChip ? '<span>•</span>' + personChip : '') + '</div>' +
        '</div>' +
        '<div class="txn-amount expense">-' + Fmt.formatAmount(t.amount, { absolute: true }) + '</div>' +
      '</div>';
    }).join('');

    var totalRow = txns.length > 1
      ? '<div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-3) 0 0;border-top:1px solid var(--color-border);margin-top:var(--space-2)">' +
          '<span class="text-muted" style="font-size:var(--fs-sm)">' + I18n.t('dash.dayDetail.total') + '</span>' +
          '<span class="txn-amount expense" style="font-size:var(--fs-lg)">-' + Fmt.formatAmount(total, { absolute: true }) + '</span>' +
        '</div>'
      : '';

    var emptyHTML = '<div class="empty"><div class="empty-icon" data-icon="check"></div>' +
      '<p class="text-muted" data-i18n="dash.dayDetail.empty"></p></div>';

    Modal.open({
      title: fullDate,
      subtitle: total > 0 ? '-' + Fmt.formatAmount(total, { absolute: true }) : '',
      bodyHTML: txns.length
        ? '<div class="list">' + rowsHTML + '</div>' + totalRow
        : emptyHTML,
      actions: [{ label: I18n.t('action.close'), variant: 'secondary' }]
    });
  }

  function wireExpenseChart(container, y, m) {
    var svg = container.querySelector('.expense-day-bars');
    if (!svg) return;
    var wrap = svg.closest('.expense-chart-wrap');
    if (!wrap) return;
    var tip = wrap.querySelector('.exp-day-tooltip');
    if (!tip) return;

    svg.querySelectorAll('.bar-hit').forEach(function (rect) {
      rect.addEventListener('mouseenter', function () {
        var day = parseInt(rect.dataset.day, 10);
        var val = parseInt(rect.dataset.val, 10);
        var date = new Date(y, m, day);
        var lang = I18n.getLang();
        var dateLabel = date.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', { day: 'numeric', month: 'short' });
        tip.innerHTML =
          '<span class="tip-amount">' + Fmt.formatAmount(val, { absolute: true }) + '</span>' +
          '<span class="tip-day">' + dateLabel + '</span>';
        tip.style.display = 'flex';
        rect.style.cursor = val > 0 ? 'pointer' : 'default';

        var hl = svg.querySelector('.bar-col-hl[data-day="' + rect.dataset.day + '"]');
        if (hl) hl.setAttribute('opacity', '0.1');
        var vis = svg.querySelector('.bar-vis[data-day="' + rect.dataset.day + '"]');
        if (vis) {
          vis.setAttribute('opacity', '1');
          vis.setAttribute('stroke', '#fff');
          vis.setAttribute('stroke-width', '1.5');
        }
      });
      rect.addEventListener('mousemove', function (e) {
        var wrapRect = wrap.getBoundingClientRect();
        var x = e.clientX - wrapRect.left;
        var y2 = e.clientY - wrapRect.top;
        var tipW = tip.offsetWidth || 120;
        tip.style.left = (x + tipW + 20 > wrapRect.width ? x - tipW - 8 : x + 12) + 'px';
        tip.style.top = Math.max(4, y2 - 52) + 'px';
      });
      rect.addEventListener('mouseleave', function () {
        tip.style.display = 'none';
        rect.style.cursor = 'default';

        var hl = svg.querySelector('.bar-col-hl[data-day="' + rect.dataset.day + '"]');
        if (hl) hl.setAttribute('opacity', '0');
        var vis = svg.querySelector('.bar-vis[data-day="' + rect.dataset.day + '"]');
        if (vis) {
          vis.setAttribute('opacity', vis.getAttribute('data-base-opacity') || '0.72');
          vis.removeAttribute('stroke');
          vis.removeAttribute('stroke-width');
        }
      });
      rect.addEventListener('click', function () {
        if (parseInt(rect.dataset.val, 10) === 0) return;
        tip.style.display = 'none';
        openDayDetail(y, m, parseInt(rect.dataset.day, 10));
      });
    });
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
    const netWorth = Store.netWorth();

    const recentTxns = Store.getTransactions()
      .slice()
      .sort((a, b) => {
        const byDate = Fmt.parseDate(b.date) - Fmt.parseDate(a.date);
        if (byDate) return byDate;
        const ca = a.createdAt || a.id || '';
        const cb = b.createdAt || b.id || '';
        return ca < cb ? 1 : ca > cb ? -1 : 0;
      })
      .slice(0, 6);

    const upcoming = Store.upcomingDueLoans(14).slice(0, 5);

    const accounts = Store.getAccounts();
    const activeSavings = Store.getSavings().filter((s) => Store.savingsStatus(s) !== 'withdrawn');

    // Build daily expense series for current month
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayDay = today.getDate();
    const dailySeries = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayExpense = thisMonthTxns
        .filter((t) => t.date === dateStr && t.type === 'expense')
        .reduce((sum, t) => sum + (t.amount || 0), 0);
      const showLabel = d === 1 || d % 5 === 0 || d === daysInMonth;
      dailySeries.push({ value: dayExpense, label: showLabel ? String(d) : null });
    }
    const todayIndex = todayDay - 1;

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
            <div class="hero-meta-item">
              <span class="hero-meta-label" data-i18n="dash.netWorth">Net worth</span>
              <span class="hero-meta-value">${Fmt.formatAmount(netWorth, { absolute: true })}</span>
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

        <section class="chart-card">
          <div class="card-header">
            <div>
              <div class="card-title" data-i18n="dash.dailyExpense"></div>
              <div class="card-subtitle">${today.toLocaleString(I18n.getLang() === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' })}</div>
            </div>
            <div class="txn-amount expense">${expenseMonth > 0 ? Fmt.formatAmount(expenseMonth, { absolute: true }) : ''}</div>
          </div>
          <div class="expense-chart-wrap">
            ${expenseMonth > 0
              ? Charts.expenseBars(dailySeries, { todayIndex })
              : `<div class="empty" style="padding:var(--space-6) 0">
                  <div class="empty-icon" data-icon="trending-down"></div>
                  <p class="text-muted" data-i18n="dash.dailyExpense.empty"></p>
                 </div>`}
            <div class="exp-day-tooltip" style="display:none"></div>
          </div>
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

    wireExpenseChart(container, y, m);
  }

  global.Pages = global.Pages || {};
  global.Pages.dashboard = { render };
})(window);
