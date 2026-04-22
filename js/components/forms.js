/**
 * Shared form helpers — modal-based create/edit forms for all entities.
 *
 * Each function opens a modal, wires inputs, and calls `Store.*` mutations on save.
 * On success, a toast is shown; pages auto-refresh through `Store.onChange`.
 */
(function (global) {
  'use strict';

  // ---- Small shared utilities ------------------------------------------

  function parseAmountInput(value) {
    const raw = String(value == null ? '' : value).replace(/[^\d]/g, '');
    return raw ? Number(raw) : 0;
  }

  function wireAmountInput(input) {
    if (!input) return;
    input.addEventListener('input', () => {
      const num = parseAmountInput(input.value);
      input.value = num ? num.toLocaleString('en-US') : '';
    });
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function categoryOptionsHTML(cats) {
    return cats.map((c) => `<option value="${c.id}">${I18n.t(c.nameKey)}</option>`).join('');
  }

  function peopleOptionsHTML(people, { includeBlank = true } = {}) {
    const blank = includeBlank ? `<option value="">—</option>` : '';
    return blank + people.map((p) => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');
  }

  function escapeHTML(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---- Transaction form -------------------------------------------------

  function transactionForm(existing) {
    const cats = Store.getCategories();
    const people = Store.getPeople();
    const isEdit = Boolean(existing);
    const initial = existing || {
      type: 'expense',
      amount: 0,
      category: (cats.find((c) => c.type === 'expense') || {}).id,
      date: todayISO(),
      personId: null,
      note: ''
    };

    const filteredCats = cats.filter((c) => c.type === initial.type);

    const bodyHTML = `
      <div class="type-toggle" id="typeToggle">
        <button type="button" class="${initial.type === 'expense' ? 'is-active expense' : ''}" data-type="expense">${I18n.t('txn.expense')}</button>
        <button type="button" class="${initial.type === 'income' ? 'is-active income' : ''}" data-type="income">${I18n.t('txn.income')}</button>
      </div>

      <div class="amount-input">
        <span class="currency">${Store.currency.symbol}</span>
        <input type="text" placeholder="0" id="amountValue" autocomplete="off" value="${initial.amount ? Number(initial.amount).toLocaleString('en-US') : ''}"/>
      </div>

      <div class="grid grid-2" style="gap: var(--space-3); margin-bottom: var(--space-3)">
        <div class="form-group">
          <label class="form-label">${I18n.t('txn.category')}</label>
          <select class="select" id="txnCat">${categoryOptionsHTML(filteredCats)}</select>
        </div>
        <div class="form-group">
          <label class="form-label">${I18n.t('txn.date')}</label>
          <input type="date" class="input" id="txnDate" value="${initial.date}"/>
        </div>
      </div>
      <div class="form-group" style="margin-bottom: var(--space-3)">
        <label class="form-label">${I18n.t('txn.person')}</label>
        <select class="select" id="txnPerson">${peopleOptionsHTML(people)}</select>
      </div>
      <div class="form-group">
        <label class="form-label">${I18n.t('txn.note')}</label>
        <textarea class="textarea" id="txnNote" placeholder="${I18n.t('txn.description')}">${escapeHTML(initial.note || '')}</textarea>
      </div>
    `;

    let selectedType = initial.type;

    Modal.open({
      title: isEdit ? I18n.t('action.edit.transaction') : I18n.t('action.add.transaction'),
      subtitle: I18n.t('page.transactions.subtitle'),
      bodyHTML,
      actions: [
        { label: I18n.t('action.cancel'), variant: 'secondary' },
        {
          label: isEdit ? I18n.t('action.save') : I18n.t('action.add'),
          variant: 'primary',
          keepOpen: true,
          onClick: async () => {
            const root = document.getElementById('modalRoot');
            const amount = parseAmountInput(root.querySelector('#amountValue').value);
            const category = root.querySelector('#txnCat').value;
            const date = root.querySelector('#txnDate').value;
            const personId = root.querySelector('#txnPerson').value || null;
            const note = root.querySelector('#txnNote').value.trim();

            if (!amount) { Toast.show(I18n.t('form.amountRequired')); return; }
            if (!category) { Toast.show(I18n.t('form.categoryRequired')); return; }
            if (!date) { Toast.show(I18n.t('form.dateRequired')); return; }

            const data = { type: selectedType, amount, category, date, personId, note };
            try {
              if (isEdit) await Store.updateTransaction(existing.id, data);
              else await Store.addTransaction(data);
              Modal.close();
              Toast.show(I18n.t('toast.saved'));
            } catch (err) {
              console.error(err);
              Toast.show(err && err.message ? err.message : 'Error');
            }
          }
        }
      ]
    });

    // Wire type toggle
    const root = document.getElementById('modalRoot');
    const toggle = root.querySelector('#typeToggle');
    const catSelect = root.querySelector('#txnCat');
    toggle.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        toggle.querySelectorAll('button').forEach((x) => x.classList.remove('is-active', 'income', 'expense'));
        b.classList.add('is-active', b.dataset.type);
        selectedType = b.dataset.type;
        const filtered = cats.filter((c) => c.type === selectedType);
        catSelect.innerHTML = categoryOptionsHTML(filtered);
      });
    });

    // Pre-select current category/person after inner markup is rendered
    if (initial.category) catSelect.value = initial.category;
    if (initial.personId) root.querySelector('#txnPerson').value = initial.personId;

    wireAmountInput(root.querySelector('#amountValue'));
  }

  // ---- Person form ------------------------------------------------------

  function personForm(existing) {
    const isEdit = Boolean(existing);
    const initial = existing || { name: '', phone: '', note: '' };

    const bodyHTML = `
      <div class="form-group" style="margin-bottom: var(--space-3)">
        <label class="form-label">${I18n.t('person.name')}</label>
        <input type="text" class="input" id="personName" value="${escapeHTML(initial.name)}" placeholder="${I18n.t('person.namePlaceholder')}" autocomplete="off"/>
      </div>
      <div class="form-group" style="margin-bottom: var(--space-3)">
        <label class="form-label">${I18n.t('person.phone')}</label>
        <input type="text" class="input" id="personPhone" value="${escapeHTML(initial.phone || '')}" placeholder="+84 ..." autocomplete="off"/>
      </div>
      <div class="form-group">
        <label class="form-label">${I18n.t('txn.note')}</label>
        <textarea class="textarea" id="personNote" placeholder="${I18n.t('txn.description')}">${escapeHTML(initial.note || '')}</textarea>
      </div>
    `;

    Modal.open({
      title: isEdit ? I18n.t('action.edit.person') : I18n.t('action.add.person'),
      bodyHTML,
      actions: [
        { label: I18n.t('action.cancel'), variant: 'secondary' },
        {
          label: isEdit ? I18n.t('action.save') : I18n.t('action.add'),
          variant: 'primary',
          keepOpen: true,
          onClick: async () => {
            const root = document.getElementById('modalRoot');
            const name = root.querySelector('#personName').value.trim();
            const phone = root.querySelector('#personPhone').value.trim();
            const note = root.querySelector('#personNote').value.trim();
            if (!name) { Toast.show(I18n.t('form.nameRequired')); return; }
            try {
              if (isEdit) await Store.updatePerson(existing.id, { name, phone, note });
              else await Store.addPerson({ name, phone, note });
              Modal.close();
              Toast.show(I18n.t('toast.saved'));
            } catch (err) {
              console.error(err);
              Toast.show(err && err.message ? err.message : 'Error');
            }
          }
        }
      ]
    });
  }

  // ---- Loan form --------------------------------------------------------

  function loanForm(kind, existing) {
    const people = Store.getPeople();
    const isEdit = Boolean(existing);
    const initial = existing || {
      personId: people[0] ? people[0].id : '',
      principal: 0,
      startDate: todayISO(),
      dueDate: todayISO(),
      note: ''
    };

    if (!people.length) {
      Toast.show(I18n.t('loan.needPerson'));
      return;
    }

    const titleKey = kind === 'lending'
      ? (isEdit ? 'action.edit.loan' : 'action.add.loan')
      : (isEdit ? 'action.edit.debt' : 'action.add.debt');

    const bodyHTML = `
      <div class="form-group" style="margin-bottom: var(--space-3)">
        <label class="form-label">${I18n.t('txn.person')}</label>
        <select class="select" id="loanPerson">${peopleOptionsHTML(people, { includeBlank: false })}</select>
      </div>

      <div class="amount-input">
        <span class="currency">${Store.currency.symbol}</span>
        <input type="text" placeholder="0" id="loanPrincipal" autocomplete="off" value="${initial.principal ? Number(initial.principal).toLocaleString('en-US') : ''}"/>
      </div>

      <div class="grid grid-2" style="gap: var(--space-3); margin-bottom: var(--space-3)">
        <div class="form-group">
          <label class="form-label">${I18n.t('loan.startDate')}</label>
          <input type="date" class="input" id="loanStart" value="${initial.startDate}"/>
        </div>
        <div class="form-group">
          <label class="form-label">${I18n.t('loan.dueDate')}</label>
          <input type="date" class="input" id="loanDue" value="${initial.dueDate}"/>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">${I18n.t('txn.note')}</label>
        <textarea class="textarea" id="loanNote" placeholder="${I18n.t('txn.description')}">${escapeHTML(initial.note || '')}</textarea>
      </div>
    `;

    Modal.open({
      title: I18n.t(titleKey),
      bodyHTML,
      actions: [
        { label: I18n.t('action.cancel'), variant: 'secondary' },
        {
          label: isEdit ? I18n.t('action.save') : I18n.t('action.add'),
          variant: 'primary',
          keepOpen: true,
          onClick: async () => {
            const root = document.getElementById('modalRoot');
            const personId = root.querySelector('#loanPerson').value;
            const principal = parseAmountInput(root.querySelector('#loanPrincipal').value);
            const startDate = root.querySelector('#loanStart').value;
            const dueDate = root.querySelector('#loanDue').value;
            const note = root.querySelector('#loanNote').value.trim();

            if (!personId) { Toast.show(I18n.t('form.personRequired')); return; }
            if (!principal) { Toast.show(I18n.t('form.amountRequired')); return; }
            if (!startDate || !dueDate) { Toast.show(I18n.t('form.dateRequired')); return; }

            try {
              if (isEdit) {
                await Store.updateLoan(kind, existing.id, { personId, principal, startDate, dueDate, note });
              } else {
                await Store.addLoan(kind, { personId, principal, startDate, dueDate, note, payments: [] });
              }
              Modal.close();
              Toast.show(I18n.t('toast.saved'));
            } catch (err) {
              console.error(err);
              Toast.show(err && err.message ? err.message : 'Error');
            }
          }
        }
      ]
    });

    const root = document.getElementById('modalRoot');
    root.querySelector('#loanPerson').value = initial.personId || '';
    wireAmountInput(root.querySelector('#loanPrincipal'));
  }

  // ---- Record payment ---------------------------------------------------

  function paymentForm(kind, loan) {
    const remaining = Store.loanRemaining(loan);
    const bodyHTML = `
      <div class="text-muted" style="margin-bottom: var(--space-3); font-size: var(--fs-sm)">
        ${I18n.t('loan.remaining')}: <strong>${Fmt.formatAmount(remaining, { absolute: true })}</strong>
      </div>

      <div class="amount-input">
        <span class="currency">${Store.currency.symbol}</span>
        <input type="text" placeholder="0" id="payAmount" autocomplete="off"/>
      </div>

      <div class="form-group" style="margin-bottom: var(--space-3)">
        <label class="form-label">${I18n.t('txn.date')}</label>
        <input type="date" class="input" id="payDate" value="${todayISO()}"/>
      </div>
      <div class="form-group">
        <label class="form-label">${I18n.t('txn.note')}</label>
        <textarea class="textarea" id="payNote" placeholder="${I18n.t('txn.description')}"></textarea>
      </div>
    `;

    Modal.open({
      title: I18n.t('action.add.payment'),
      bodyHTML,
      actions: [
        { label: I18n.t('action.cancel'), variant: 'secondary' },
        {
          label: I18n.t('action.save'),
          variant: 'primary',
          keepOpen: true,
          onClick: async () => {
            const root = document.getElementById('modalRoot');
            const amount = parseAmountInput(root.querySelector('#payAmount').value);
            const date = root.querySelector('#payDate').value;
            const note = root.querySelector('#payNote').value.trim();
            if (!amount) { Toast.show(I18n.t('form.amountRequired')); return; }
            if (!date) { Toast.show(I18n.t('form.dateRequired')); return; }
            try {
              await Store.addLoanPayment(kind, loan.id, { amount, date, note });
              Modal.close();
              Toast.show(I18n.t('toast.saved'));
            } catch (err) {
              console.error(err);
              Toast.show(err && err.message ? err.message : 'Error');
            }
          }
        }
      ]
    });

    wireAmountInput(document.getElementById('modalRoot').querySelector('#payAmount'));
  }

  // ---- Confirm dialog ---------------------------------------------------

  function confirm({ title, message, confirmLabel, variant = 'danger', onConfirm }) {
    Modal.open({
      title: title || I18n.t('action.confirm'),
      bodyHTML: `<p style="color: var(--color-text-muted)">${escapeHTML(message || '')}</p>`,
      actions: [
        { label: I18n.t('action.cancel'), variant: 'secondary' },
        {
          label: confirmLabel || I18n.t('action.delete'),
          variant,
          keepOpen: true,
          onClick: async () => {
            try {
              await onConfirm();
              Modal.close();
              Toast.show(I18n.t('toast.deleted'));
            } catch (err) {
              console.error(err);
              Toast.show(err && err.message ? err.message : 'Error');
            }
          }
        }
      ]
    });
  }

  global.Forms = {
    transactionForm,
    personForm,
    loanForm,
    paymentForm,
    confirm
  };
})(window);
