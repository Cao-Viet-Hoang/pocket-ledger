/**
 * Reports page — analytics and breakdowns.
 * - Summary stat cards (income / expense / net) for the selected range
 * - Monthly income vs expense bar chart (fixed last-12-months view)
 * - Income vs Expense grouped bar chart (daily, range-filtered)
 * - Spending by category donut + legend (range-filtered)
 * - Net cashflow trend line chart (range-filtered)
 * - Income by category donut + legend (range-filtered)
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

  // Build monthly income/expense series for the last N months, independent of the range filter.
  function monthlySeries(numMonths) {
    const today = Fmt.today();
    const allTxns = Store.getTransactions();
    const lang = I18n.getLang();
    const result = [];
    for (let i = numMonths - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const txns = Store.filterByMonth(allTxns, d.getFullYear(), d.getMonth());
      const label = d.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', { month: 'short' });
      result.push({
        income: Store.totalIncome(txns),
        expense: Store.totalExpense(txns),
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
        label
      });
    }
    return result;
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

  function categoryLegendHTML(items, totalValue) {
    if (!items.length) return `<p class="text-muted">${I18n.t('reports.noData')}</p>`;
    return items
      .map((c, i) => {
        const pct = totalValue ? Math.round((c.value / totalValue) * 100) : 0;
        return `
          <div class="legend-item">
            <span class="dot" style="background:${Charts.COLORS[i % Charts.COLORS.length]}"></span>
            <span class="legend-label">${I18n.t(c.category.nameKey)}</span>
            <span class="legend-value">${Fmt.formatCompact(c.value)}</span>
            <span class="text-muted" style="min-width:36px;text-align:right">${pct}%</span>
          </div>`;
      })
      .join('');
  }

  function render(container) {
    const txns = filteredTransactions();
    const income = Store.totalIncome(txns);
    const expense = Store.totalExpense(txns);
    const net = income - expense;

    // Daily series for range-filtered charts (capped at 30 days)
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

    const step = series.length > 14 ? 5 : (series.length > 7 ? 3 : 1);
    const labels = series.map((d, i) => (i % step === 0 || i === series.length - 1) ? Fmt.formatDateShort(d.date, I18n.getLang()) : null);

    const netSeries = series.map((d) => ({ date: d.date, value: d.income - d.expense }));

    // Monthly 12-month series — always fixed, not affected by range filter
    const monthly = monthlySeries(12);
    const monthlyLabels = monthly.map((d) => d.label);

    // Spending by category (expense)
    const byExpCat = Store.spendingByCategory(txns).filter((c) => c.category);
    const totalExpenseCat = byExpCat.reduce((s, c) => s + c.value, 0);
    const expDonutSlices = byExpCat.map((c, i) => ({
      value: c.value,
      label: I18n.t(c.category.nameKey),
      color: Charts.COLORS[i % Charts.COLORS.length]
    }));

    // Income by category
    const byIncCat = Store.incomeByCategory(txns).filter((c) => c.category);
    const totalIncomeCat = byIncCat.reduce((s, c) => s + c.value, 0);
    const incDonutSlices = byIncCat.map((c, i) => ({
      value: c.value,
      label: I18n.t(c.category.nameKey),
      color: Charts.COLORS[i % Charts.COLORS.length]
    }));

    container.innerHTML = `
      <div class="page">
        <section class="section-header">
          <div>
            <h2>${I18n.t('nav.reports')}</h2>
            <p class="text-muted" style="font-size: var(--fs-sm); margin-top: 2px">${I18n.t('page.reports.subtitle')}</p>
          </div>
          <div class="actions" id="reportRange">${renderRangeSelect()}</div>
        </section>

        <!-- Summary stat cards -->
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

        <!-- Monthly 12-month overview (independent of range filter) -->
        <section class="chart-card">
          <div class="card-header">
            <div>
              <div class="card-title">${I18n.t('reports.monthlyTrend')}</div>
              <div class="card-subtitle">${I18n.t('reports.last12Months')}</div>
            </div>
            <div class="flex items-center gap-3" style="font-size: var(--fs-sm)">
              <span class="flex items-center gap-2"><span class="dot" style="background:#10b981"></span>${I18n.t('txn.income')}</span>
              <span class="flex items-center gap-2"><span class="dot" style="background:#ef4444"></span>${I18n.t('txn.expense')}</span>
            </div>
          </div>
          ${Charts.bars(monthly, { width: 900, height: 260, labels: monthlyLabels })}
        </section>

        <!-- Daily breakdown + Spending by category -->
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
                <div class="card-subtitle">${Fmt.formatAmount(totalExpenseCat, { absolute: true })}</div>
              </div>
            </div>
            ${Charts.donut(expDonutSlices, { centerLabel: Fmt.formatCompact(totalExpenseCat) })}
            <div class="chart-legend">${categoryLegendHTML(byExpCat, totalExpenseCat)}</div>
          </div>
        </section>

        <!-- Net cashflow trend + Income by category -->
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

          <div class="chart-card">
            <div class="card-header">
              <div>
                <div class="card-title">${I18n.t('reports.incomeByCategory')}</div>
                <div class="card-subtitle">${Fmt.formatAmount(totalIncomeCat, { absolute: true })}</div>
              </div>
            </div>
            ${Charts.donut(incDonutSlices, { centerLabel: Fmt.formatCompact(totalIncomeCat) })}
            <div class="chart-legend">${categoryLegendHTML(byIncCat, totalIncomeCat)}</div>
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
