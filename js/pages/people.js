/**
 * People page — contacts involved in transactions, loans and debts.
 * Each card shows: avatar, name, note, quick stats (owes you / you owe), txn count.
 * Add / edit / delete via the Forms module.
 */
(function (global) {
  'use strict';

  function escapeHTML(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function personCard(person) {
    const owed = Store.personOwedToUser(person.id);
    const owe = Store.personUserOwes(person.id);
    const txns = Store.personTransactions(person.id);

    return `
      <article class="person-card" data-person-id="${person.id}">
        <header class="person-head">
          <span class="avatar lg avatar-p${person.color || 1}">${Fmt.initials(person.name)}</span>
          <div style="flex:1;min-width:0">
            <div class="person-name">${escapeHTML(person.name)}</div>
            <div class="person-sub">${escapeHTML(person.phone || person.note || '')}</div>
          </div>
          <div class="person-actions">
            <button class="icon-btn ghost" data-action="edit" aria-label="${I18n.t('action.edit')}"><span data-icon="edit"></span></button>
            <button class="icon-btn ghost" data-action="delete" aria-label="${I18n.t('action.delete')}"><span data-icon="trash"></span></button>
          </div>
        </header>

        <div class="person-stats">
          <div>
            <div class="person-stat-label">${I18n.t('people.totalOwed')}</div>
            <div class="person-stat-value text-income">${Fmt.formatAmount(owed, { absolute: true })}</div>
          </div>
          <div>
            <div class="person-stat-label">${I18n.t('people.totalOwe')}</div>
            <div class="person-stat-value text-expense">${Fmt.formatAmount(owe, { absolute: true })}</div>
          </div>
        </div>

        <div class="flex items-center justify-between" style="font-size: var(--fs-sm); color: var(--color-text-muted)">
          <span><span data-icon="exchange" style="vertical-align:-2px;display:inline-block;width:14px;height:14px"></span> ${txns.length} ${I18n.t('people.transactions')}</span>
          <span class="badge">${Fmt.formatDate(person.createdAt, I18n.getLang())}</span>
        </div>
      </article>`;
  }

  function renderGrid(container, list) {
    const grid = container.querySelector('#peopleGrid');
    if (!grid) return;
    grid.innerHTML = list.length
      ? list.map(personCard).join('')
      : `<div class="empty" style="grid-column:1/-1"><div class="empty-icon" data-icon="people"></div><h3>${I18n.t('people.empty')}</h3></div>`;
    Icons.render(grid);
    wireCardActions(container, list);
  }

  function wireCardActions(container, list) {
    container.querySelectorAll('.person-card').forEach((card) => {
      const id = card.dataset.personId;
      const person = list.find((p) => p.id === id);
      if (!person) return;
      card.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
        e.stopPropagation();
        Forms.personForm(person);
      });
      card.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
        e.stopPropagation();
        Forms.confirm({
          title: I18n.t('action.delete.person'),
          message: I18n.t('confirm.deletePerson'),
          confirmLabel: I18n.t('action.delete'),
          onConfirm: () => Store.deletePerson(id)
        });
      });
    });
  }

  function render(container) {
    const people = Store.getPeople();
    const totalOwed = people.reduce((s, p) => s + Store.personOwedToUser(p.id), 0);
    const totalOwe = people.reduce((s, p) => s + Store.personUserOwes(p.id), 0);

    container.innerHTML = `
      <div class="page">
        <section class="grid grid-3">
          <div class="stat-card">
            <div class="stat-card-head">
              <span class="circle-icon info" data-icon="people"></span>
              <span class="badge badge-primary">${people.length}</span>
            </div>
            <div>
              <div class="stat-label">${I18n.t('nav.people')}</div>
              <div class="stat-value small">${people.length}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card-head">
              <span class="circle-icon income" data-icon="hand-coin"></span>
            </div>
            <div>
              <div class="stat-label">${I18n.t('dash.receivable')}</div>
              <div class="stat-value small text-income">${Fmt.formatAmount(totalOwed, { absolute: true })}</div>
              <div class="stat-meta text-muted">${I18n.t('dash.receivable.hint')}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-card-head">
              <span class="circle-icon warning" data-icon="hand-receive"></span>
            </div>
            <div>
              <div class="stat-label">${I18n.t('dash.payable')}</div>
              <div class="stat-value small text-expense">${Fmt.formatAmount(totalOwe, { absolute: true })}</div>
              <div class="stat-meta text-muted">${I18n.t('dash.payable.hint')}</div>
            </div>
          </div>
        </section>

        <section class="section-header">
          <div>
            <h2>${I18n.t('nav.people')}</h2>
            <p class="text-muted" style="font-size: var(--fs-sm); margin-top: 2px">${I18n.t('page.people.subtitle')}</p>
          </div>
          <div class="actions">
            <div class="input-with-icon">
              <span data-icon="search"></span>
              <input id="peopleSearch" class="input" placeholder="${I18n.t('action.search')}" style="min-width:240px"/>
            </div>
            <button class="btn btn-primary" id="addPersonBtn">
              <span data-icon="plus"></span>
              <span>${I18n.t('action.add.person')}</span>
            </button>
          </div>
        </section>

        <section class="grid grid-3" id="peopleGrid"></section>
      </div>
    `;

    renderGrid(container, people);

    container.querySelector('#addPersonBtn').addEventListener('click', () => Forms.personForm());

    const search = container.querySelector('#peopleSearch');
    if (search) {
      search.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        const filtered = people.filter((p) =>
          p.name.toLowerCase().includes(q) || (p.note || '').toLowerCase().includes(q)
        );
        renderGrid(container, filtered);
      });
    }
  }

  global.Pages = global.Pages || {};
  global.Pages.people = { render };
})(window);
