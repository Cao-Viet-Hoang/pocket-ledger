/**
 * Reports page — analytics and breakdowns.
 * - Income vs Expense (grouped bar chart, daily series)
 * - Net cashflow trend (line chart)
 * - Spending by category (donut + legend)
 * - Top categories list
 * - Receivables / Payables overview
 */
(function (global) {
  'use strict';

  function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function defaultFrom() {
    const d = Fmt.today();
    return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  const filterState = {
    range: '30d',
    customFrom: defaultFrom(),
    customTo: isoDate(Fmt.today())
  };

  function customBounds() {
    const from = Fmt.parseDate(filterState.customFrom);
    const to = Fmt.parseDate(filterState.customTo);
    return { from, to, valid: from <= to };
  }

  function filteredTransactions() {
    const today = Fmt.today();
    const all = Store.getTransactions();
    if (filterState.range === 'all') return all;
    if (filterState.range === 'today') {
      const iso = isoDate(today);
      return all.filter((t) => t.date === iso);
    }
    if (filterState.range === 'thisMonth') {
      return all.filter((t) => {
        const d = Fmt.parseDate(t.date);
        return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
      });
    }
    if (filterState.range === 'lastMonth') {
      const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return all.filter((t) => {
        const d = Fmt.parseDate(t.date);
        return d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth();
      });
    }
    if (filterState.range === 'custom') {
      const { from, to, valid } = customBounds();
      if (!valid) return [];
      return all.filter((t) => {
        const d = Fmt.parseDate(t.date);
        return d >= from && d <= to;
      });
    }
    const days = filterState.range === '7d' ? 7 : 30;
    return all.filter((t) => Fmt.daysBetween(Fmt.parseDate(t.date), today) <= days);
  }

  function rangeLabel() {
    if (filterState.range === 'custom') {
      const lang = I18n.getLang();
      return `${Fmt.formatDateShort(filterState.customFrom, lang)} – ${Fmt.formatDateShort(filterState.customTo, lang)}`;
    }
    return I18n.t('txn.range.' + filterState.range);
  }

  function renderRangeSelect() {
    return `
      <div class="segmented">
        <button data-range="today"     class="${filterState.range === 'today' ? 'is-active' : ''}">${I18n.t('txn.range.today')}</button>
        <button data-range="7d"        class="${filterState.range === '7d' ? 'is-active' : ''}">${I18n.t('txn.range.7d')}</button>
        <button data-range="30d"       class="${filterState.range === '30d' ? 'is-active' : ''}">${I18n.t('txn.range.30d')}</button>
        <button data-range="thisMonth" class="${filterState.range === 'thisMonth' ? 'is-active' : ''}">${I18n.t('txn.range.thisMonth')}</button>
        <button data-range="lastMonth" class="${filterState.range === 'lastMonth' ? 'is-active' : ''}">${I18n.t('txn.range.lastMonth')}</button>
        <button data-range="all"       class="${filterState.range === 'all' ? 'is-active' : ''}">${I18n.t('txn.range.all')}</button>
        <button data-range="custom"    class="${filterState.range === 'custom' ? 'is-active' : ''}">${I18n.t('txn.range.custom')}</button>
      </div>
    `;
  }

  function render(container) {
    const txns = filteredTransactions();
    const income = Store.totalIncome(txns);
    const expense = Store.totalExpense(txns);
    const net = income - expense;

    let series;
    if (filterState.range === 'custom') {
      const { from, to, valid } = customBounds();
      if (valid) {
        const span = Math.min(Fmt.daysBetween(from, to) + 1, 30);
        series = Store.dailySeries(txns, { end: filterState.customTo, days: span });
      } else {
        series = [];
      }
    } else {
      const days = filterState.range === 'today' ? 1 : filterState.range === '7d' ? 7 : 30;
      series = Store.dailySeries(txns, Math.min(days, 30));
    }

    // Labels: show a label every few days
    const step = series.length > 14 ? 5 : (series.length > 7 ? 3 : 1);
    const labels = series.map((d, i) => (i % step === 0 || i === series.length - 1) ? Fmt.formatDateShort(d.date, I18n.getLang()) : null);

    const netSeries = series.map((d) => ({ date: d.date, value: d.income - d.expense }));

    // Spending by category
    const byCategory = Store.spendingByCategory(txns).filter((c) => c.category);
    const totalExpense = byCategory.reduce((s, c) => s + c.value, 0);

    const donutSlices = byCategory.map((c, i) => ({
      value: c.value,
      label: I18n.t(c.category.nameKey),
      color: Charts.COLORS[i % Charts.COLORS.length]
    }));
    const donutLegendHTML = byCategory.length
      ? byCategory
          .map((c, i) => {
            const pct = totalExpense ? Math.round((c.value / totalExpense) * 100) : 0;
            return `
              <div class="legend-item">
                <span class="dot" style="background:${Charts.COLORS[i % Charts.COLORS.length]}"></span>
                <span class="legend-label">${I18n.t(c.category.nameKey)}</span>
                <span class="legend-value">${Fmt.formatCompact(c.value)}</span>
                <span class="text-muted" style="min-width:36px;text-align:right">${pct}%</span>
              </div>`;
          })
          .join('')
      : `<p class="text-muted">${I18n.t('reports.noData')}</p>`;

    // Top categories (breakdown rows with progress)
    const topCats = byCategory.slice(0, 5);
    const topCatsHTML = topCats.length
      ? topCats
          .map((c) => {
            const pct = totalExpense ? (c.value / totalExpense) * 100 : 0;
            return `
              <div class="breakdown-row">
                <span class="circle-icon ${c.category.tone}" data-icon="${c.category.icon}"></span>
                <div class="breakdown-body">
                  <div class="breakdown-title">
                    <span>${I18n.t(c.category.nameKey)}</span>
                    <span><strong>${Fmt.formatCompact(c.value)}</strong> <span class="percent">${Math.round(pct)}%</span></span>
                  </div>
                  <div class="progress"><div class="progress-bar expense" style="width:${pct}%"></div></div>
                </div>
              </div>`;
          })
          .join('')
      : `<p class="text-muted">${I18n.t('reports.noData')}</p>`;

    // Receivables/payables overview
    const lending = Store.getLending();
    const borrowing = Store.getBorrowing();
    const overdueLending = lending.filter((l) => Store.loanStatus(l) === 'overdue');
    const overdueBorrowing = borrowing.filter((l) => Store.loanStatus(l) === 'overdue');
    const dueSoon = Store.upcomingDueLoans(7);

    container.innerHTML = `
      <div class="page">
        <section class="section-header">
          <div>
            <h2>${I18n.t('nav.reports')}</h2>
            <p class="text-muted" style="font-size: var(--fs-sm); margin-top: 2px">${I18n.t('page.reports.subtitle')}</p>
          </div>
          <div class="actions" id="reportRange">${renderRangeSelect()}</div>
        </section>

        <section class="grid grid-3">
          <div class="stat-card">
            <div class="stat-card-head">
              <span class="circle-icon income" data-icon="trending-up"></span>
            </div>
            <div>
              <div class="stat-label">${I18n.t('txn.income')}</div>
              <div class="stat-value small text-income">${Fmt.formatAmount(income, { absolute: true })}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card-head">
              <span class="circle-icon expense" data-icon="trending-down"></span>
            </div>
            <div>
              <div class="stat-label">${I18n.t('txn.expense')}</div>
              <div class="stat-value small text-expense">${Fmt.formatAmount(expense, { absolute: true })}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card-head">
              <span class="circle-icon primary" data-icon="scale"></span>
            </div>
            <div>
              <div class="stat-label">${I18n.t('dash.net')}</div>
              <div class="stat-value small ${net >= 0 ? 'text-income' : 'text-expense'}">${net >= 0 ? '+' : '-'}${Fmt.formatAmount(Math.abs(net), { absolute: true })}</div>
            </div>
          </div>
        </section>

        <section class="grid grid-2-1">
          <div class="chart-card">
            <div class="card-header">
              <div>
                <div class="card-title">${I18n.t('reports.incomeVsExpense')}</div>
                <div class="card-subtitle">${rangeLabel()}</div>
              </div>
              <div class="flex items-center gap-3" style="font-size: var(--fs-sm)">
                <span class="flex items-center gap-2"><span class="dot" style="background:#10b981"></span>${I18n.t('txn.income')}</span>
                <span class="flex items-center gap-2"><span class="dot" style="background:#ef4444"></span>${I18n.t('txn.expense')}</span>
              </div>
            </div>
            ${Charts.bars(series, { width: 720, height: 280, labels })}
          </div>

          <div class="chart-card">
            <div class="card-header">
              <div>
                <div class="card-title">${I18n.t('reports.byCategory')}</div>
                <div class="card-subtitle">${Fmt.formatAmount(totalExpense, { absolute: true })}</div>
              </div>
            </div>
            ${Charts.donut(donutSlices, { centerLabel: Fmt.formatCompact(totalExpense) })}
            <div class="chart-legend">${donutLegendHTML}</div>
          </div>
        </section>

        <section class="grid grid-2-1">
          <div class="chart-card">
            <div class="card-header">
              <div>
                <div class="card-title">${I18n.t('reports.netTrend')}</div>
                <div class="card-subtitle">${I18n.t('dash.net')}</div>
              </div>
            </div>
            ${Charts.line(netSeries, { width: 720, height: 240 })}
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title">${I18n.t('reports.topCategories')}</div>
            </div>
            <div class="breakdown-list">${topCatsHTML}</div>
          </div>
        </section>

        <section class="grid grid-2">
          <div class="card">
            <div class="card-header">
              <div class="card-title">${I18n.t('reports.receivables')}</div>
              <span class="badge badge-income">${I18n.t('dash.receivable')}</span>
            </div>
            <div class="grid grid-2" style="gap: var(--space-4)">
              <div>
                <div class="stat-label">${I18n.t('dash.receivable')}</div>
                <div class="stat-value small text-income">${Fmt.formatAmount(Store.totalReceivable(), { absolute: true })}</div>
              </div>
              <div>
                <div class="stat-label">${I18n.t('reports.overdue')}</div>
                <div class="stat-value small text-expense">${overdueLending.length}</div>
              </div>
            </div>
            <hr/>
            <div class="list">
              ${overdueLending.slice(0, 4).map((l) => {
                const p = Store.getPersonById(l.personId);
                const hint = Fmt.formatDueHint(l.dueDate, I18n.getLang());
                return `
                  <div class="due-item">
                    <span class="avatar sm avatar-p${p ? p.color : 1}">${Fmt.initials(p ? p.name : '?')}</span>
                    <div class="due-main">
                      <div class="due-title">${p ? p.name : '—'}</div>
                      <div class="due-sub"><span class="badge badge-expense">${hint.text}</span></div>
                    </div>
                    <div class="due-amount text-income">${Fmt.formatAmount(Store.loanRemaining(l), { absolute: true })}</div>
                  </div>`;
              }).join('') || `<p class="text-muted">${I18n.t('reports.noData')}</p>`}
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title">${I18n.t('reports.payables')}</div>
              <span class="badge badge-expense">${I18n.t('dash.payable')}</span>
            </div>
            <div class="grid grid-2" style="gap: var(--space-4)">
              <div>
                <div class="stat-label">${I18n.t('dash.payable')}</div>
                <div class="stat-value small text-expense">${Fmt.formatAmount(Store.totalPayable(), { absolute: true })}</div>
              </div>
              <div>
                <div class="stat-label">${I18n.t('reports.dueSoon')}</div>
                <div class="stat-value small">${dueSoon.filter((d) => d.kind === 'borrowing').length}</div>
              </div>
            </div>
            <hr/>
            <div class="list">
              ${overdueBorrowing.slice(0, 4).map((l) => {
                const p = Store.getPersonById(l.personId);
                const hint = Fmt.formatDueHint(l.dueDate, I18n.getLang());
                return `
                  <div class="due-item">
                    <span class="avatar sm avatar-p${p ? p.color : 1}">${Fmt.initials(p ? p.name : '?')}</span>
                    <div class="due-main">
                      <div class="due-title">${p ? p.name : '—'}</div>
                      <div class="due-sub"><span class="badge badge-expense">${hint.text}</span></div>
                    </div>
                    <div class="due-amount text-expense">${Fmt.formatAmount(Store.loanRemaining(l), { absolute: true })}</div>
                  </div>`;
              }).join('') || `<p class="text-muted">${I18n.t('reports.noData')}</p>`}
            </div>
          </div>
        </section>
      </div>
    `;

    container.querySelectorAll('#reportRange [data-range]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.range;
        if (next === 'custom') {
          Forms.dateRangeDialog({
            from: filterState.customFrom,
            to: filterState.customTo,
            onConfirm: ({ from, to }) => {
              filterState.range = 'custom';
              filterState.customFrom = from;
              filterState.customTo = to;
              render(container);
              Icons.render(container);
              I18n.applyTranslations(container);
            }
          });
          return;
        }
        filterState.range = next;
        render(container);
        Icons.render(container);
        I18n.applyTranslations(container);
      });
    });
  }

  global.Pages = global.Pages || {};
  global.Pages.reports = { render };
})(window);
