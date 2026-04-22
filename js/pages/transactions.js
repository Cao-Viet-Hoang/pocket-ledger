/**
 * Transactions page.
 * - Search, type filter (all/income/expense), category filter
 * - Date range, sort
 * - Table of transactions with actions
 */
(function (global) {
  'use strict';

  const filterState = {
    query: '',
    type: 'all',         // all | income | expense
    category: 'all',
    range: '30d',        // 7d | 30d | thisMonth | lastMonth | all
    sort: 'dateDesc'     // dateDesc | dateAsc | amountDesc | amountAsc
  };

  function rangeFilter(date, range) {
    const d = Fmt.parseDate(date);
    const today = Fmt.today();
    if (range === 'all') return true;
    if (range === '7d') return Fmt.daysBetween(d, today) <= 7;
    if (range === '30d') return Fmt.daysBetween(d, today) <= 30;
    if (range === 'thisMonth')
      return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
    if (range === 'lastMonth') {
      const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth();
    }
    return true;
  }

  function applyFilters() {
    const q = filterState.query.trim().toLowerCase();
    let list = Store.getTransactions().filter((t) => {
      if (filterState.type !== 'all' && t.type !== filterState.type) return false;
      if (filterState.category !== 'all' && t.category !== filterState.category) return false;
      if (!rangeFilter(t.date, filterState.range)) return false;
      if (q) {
        const cat = Store.getCategoryById(t.category);
        const person = t.personId ? Store.getPersonById(t.personId) : null;
        const hay = [
          t.note || '',
          cat ? I18n.t(cat.nameKey) : '',
          person ? person.name : ''
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      const da = Fmt.parseDate(a.date).getTime();
      const db = Fmt.parseDate(b.date).getTime();
      if (filterState.sort === 'dateAsc') return da - db;
      if (filterState.sort === 'dateDesc') return db - da;
      if (filterState.sort === 'amountAsc') return a.amount - b.amount;
      if (filterState.sort === 'amountDesc') return b.amount - a.amount;
      return 0;
    });

    return list;
  }

  function renderRows(list) {
    if (!list.length) {
      return `<tr><td colspan="5"><div class="empty"><div class="empty-icon" data-icon="search"></div><h3>No transactions</h3><p class="text-muted">Try adjusting your filters.</p></div></td></tr>`;
    }
    return list
      .map((t) => {
        const cat = Store.getCategoryById(t.category);
        const person = t.personId ? Store.getPersonById(t.personId) : null;
        const sign = t.type === 'income' ? '+' : '-';
        const amountCls = t.type === 'income' ? 'text-income' : 'text-expense';
        return `
          <tr>
            <td>
              <div class="list-item" style="gap:12px;padding:0;border:0">
                <span class="circle-icon ${cat ? cat.tone : ''}" data-icon="${cat ? cat.icon : 'exchange'}"></span>
                <div class="list-item-main">
                  <div class="list-item-title">${t.note || (cat ? I18n.t(cat.nameKey) : '')}</div>
                  <div class="list-item-sub">${cat ? I18n.t(cat.nameKey) : ''}</div>
                </div>
              </div>
            </td>
            <td class="nowrap">
              <span class="badge ${t.type === 'income' ? 'badge-income' : 'badge-expense'}">
                <span data-icon="${t.type === 'income' ? 'arrow-down-left' : 'arrow-up-right'}"></span>
                ${I18n.t('txn.' + t.type)}
              </span>
            </td>
            <td>${person
              ? `<span class="flex items-center gap-2"><span class="avatar sm avatar-p${person.color || 1}">${Fmt.initials(person.name)}</span><span>${person.name}</span></span>`
              : '<span class="text-subtle">—</span>'}</td>
            <td class="text-muted nowrap">${Fmt.formatDate(t.date, I18n.getLang())}</td>
            <td class="text-right nowrap amount ${amountCls}">${sign}${Fmt.formatAmount(t.amount, { absolute: true })}</td>
          </tr>`;
      })
      .join('');
  }

  function categoryOptions() {
    const cats = Store.getCategories();
    const opts = [`<option value="all">${I18n.t('txn.all')}</option>`];
    for (const c of cats) opts.push(`<option value="${c.id}">${I18n.t(c.nameKey)}</option>`);
    return opts.join('');
  }

  function render(container) {
    const list = applyFilters();
    const totalIn = Store.totalIncome(list);
    const totalOut = Store.totalExpense(list);

    container.innerHTML = `
      <div class="page">
        <section class="grid grid-3">
          <div class="stat-card">
            <div class="stat-card-head">
              <span class="circle-icon income" data-icon="trending-up"></span>
              <span class="badge badge-income">${I18n.t('txn.income')}</span>
            </div>
            <div>
              <div class="stat-label">${I18n.t('txn.income')}</div>
              <div class="stat-value small">${Fmt.formatAmount(totalIn, { absolute: true })}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card-head">
              <span class="circle-icon expense" data-icon="trending-down"></span>
              <span class="badge badge-expense">${I18n.t('txn.expense')}</span>
            </div>
            <div>
              <div class="stat-label">${I18n.t('txn.expense')}</div>
              <div class="stat-value small">${Fmt.formatAmount(totalOut, { absolute: true })}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card-head">
              <span class="circle-icon primary" data-icon="scale"></span>
              <span class="badge badge-primary">Net</span>
            </div>
            <div>
              <div class="stat-label">Balance</div>
              <div class="stat-value small">${(totalIn - totalOut) >= 0 ? '+' : '-'}${Fmt.formatAmount(Math.abs(totalIn - totalOut), { absolute: true })}</div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="toolbar">
            <div class="input-with-icon search">
              <span data-icon="search"></span>
              <input id="txnSearch" class="input" type="search" value="${filterState.query}" placeholder="${I18n.t('action.search')}"/>
            </div>
            <div class="segmented" id="txnType" role="tablist">
              <button data-type="all"     class="${filterState.type === 'all' ? 'is-active' : ''}">${I18n.t('txn.all')}</button>
              <button data-type="income"  class="${filterState.type === 'income' ? 'is-active' : ''}">${I18n.t('txn.income')}</button>
              <button data-type="expense" class="${filterState.type === 'expense' ? 'is-active' : ''}">${I18n.t('txn.expense')}</button>
            </div>
            <select id="txnCategory" class="select" style="max-width:180px">
              ${categoryOptions()}
            </select>
            <select id="txnRange" class="select" style="max-width:180px">
              <option value="7d"          ${filterState.range === '7d' ? 'selected' : ''}>${I18n.t('txn.range.7d')}</option>
              <option value="30d"         ${filterState.range === '30d' ? 'selected' : ''}>${I18n.t('txn.range.30d')}</option>
              <option value="thisMonth"   ${filterState.range === 'thisMonth' ? 'selected' : ''}>${I18n.t('txn.range.thisMonth')}</option>
              <option value="lastMonth"   ${filterState.range === 'lastMonth' ? 'selected' : ''}>${I18n.t('txn.range.lastMonth')}</option>
              <option value="all"         ${filterState.range === 'all' ? 'selected' : ''}>${I18n.t('txn.range.all')}</option>
            </select>
            <select id="txnSort" class="select" style="max-width:200px">
              <option value="dateDesc"   ${filterState.sort === 'dateDesc' ? 'selected' : ''}>${I18n.t('txn.sort.dateDesc')}</option>
              <option value="dateAsc"    ${filterState.sort === 'dateAsc' ? 'selected' : ''}>${I18n.t('txn.sort.dateAsc')}</option>
              <option value="amountDesc" ${filterState.sort === 'amountDesc' ? 'selected' : ''}>${I18n.t('txn.sort.amountDesc')}</option>
              <option value="amountAsc"  ${filterState.sort === 'amountAsc' ? 'selected' : ''}>${I18n.t('txn.sort.amountAsc')}</option>
            </select>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>${I18n.t('txn.description')}</th>
                  <th>${I18n.t('txn.type')}</th>
                  <th>${I18n.t('txn.person')}</th>
                  <th>${I18n.t('txn.date')}</th>
                  <th class="text-right">${I18n.t('txn.amount')}</th>
                </tr>
              </thead>
              <tbody id="txnRows">${renderRows(list)}</tbody>
            </table>
          </div>
        </section>
      </div>
    `;

    // Set selected value on category select (since 'selected' attr template-injection above)
    const catSelect = container.querySelector('#txnCategory');
    if (catSelect) catSelect.value = filterState.category;

    // Wire events
    const searchInput = container.querySelector('#txnSearch');
    searchInput.addEventListener('input', (e) => {
      filterState.query = e.target.value;
      updateRows(container);
    });
    container.querySelectorAll('#txnType button').forEach((btn) => {
      btn.addEventListener('click', () => {
        filterState.type = btn.dataset.type;
        container.querySelectorAll('#txnType button').forEach((b) => b.classList.toggle('is-active', b === btn));
        updateRows(container);
      });
    });
    container.querySelector('#txnCategory').addEventListener('change', (e) => {
      filterState.category = e.target.value;
      updateRows(container);
    });
    container.querySelector('#txnRange').addEventListener('change', (e) => {
      filterState.range = e.target.value;
      updateRows(container);
    });
    container.querySelector('#txnSort').addEventListener('change', (e) => {
      filterState.sort = e.target.value;
      updateRows(container);
    });
  }

  function updateRows(container) {
    const list = applyFilters();
    const tbody = container.querySelector('#txnRows');
    if (tbody) {
      tbody.innerHTML = renderRows(list);
      Icons.render(tbody);
    }
  }

  global.Pages = global.Pages || {};
  global.Pages.transactions = { render };
})(window);
