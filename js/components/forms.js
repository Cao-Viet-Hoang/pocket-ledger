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

  // ---- Date range picker dialog -----------------------------------------

  function dateRangeDialog({ title, from, to, onConfirm, onCancel }) {
    const bodyHTML = `
      <div class="grid grid-2" style="gap: var(--space-3)">
        <div class="form-group">
          <label class="form-label">${I18n.t('txn.range.from')}</label>
          <input type="date" class="input" id="rangeFromInput" value="${from || ''}"/>
        </div>
        <div class="form-group">
          <label class="form-label">${I18n.t('txn.range.to')}</label>
          <input type="date" class="input" id="rangeToInput" value="${to || ''}"/>
        </div>
      </div>
    `;
    Modal.open({
      title: title || I18n.t('txn.range.custom'),
      bodyHTML,
      actions: [
        {
          label: I18n.t('action.cancel'),
          variant: 'secondary',
          onClick: () => { if (typeof onCancel === 'function') onCancel(); }
        },
        {
          label: I18n.t('action.confirm'),
          variant: 'primary',
          keepOpen: true,
          onClick: () => {
            const root = document.getElementById('modalRoot');
            const fromVal = root.querySelector('#rangeFromInput').value;
            const toVal = root.querySelector('#rangeToInput').value;
            if (!fromVal || !toVal) { Toast.show(I18n.t('form.dateRequired')); return; }
            if (Fmt.parseDate(fromVal) > Fmt.parseDate(toVal)) {
              Toast.show(I18n.t('txn.range.invalid'));
              return;
            }
            Modal.close();
            if (typeof onConfirm === 'function') onConfirm({ from: fromVal, to: toVal });
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
    confirm,
    dateRangeDialog,
    accountForm,
    savingsForm,
    transferForm
  };

  // ---- Account form -----------------------------------------------------

  function accountForm(existing) {
    const isEdit = Boolean(existing);
    const initial = existing || { name: '', type: 'bank', bankName: '', accountNumber: '', balance: 0, note: '' };

    const bodyHTML = `
      <div class="form-group" style="margin-bottom: var(--space-3)">
        <label class="form-label">${I18n.t('account.name')}</label>
        <input type="text" class="input" id="accName" value="${escapeHTML(initial.name)}" placeholder="${I18n.t('account.namePlaceholder')}" autocomplete="off"/>
      </div>
      <div class="form-group" style="margin-bottom: var(--space-3)">
        <label class="form-label">${I18n.t('account.type')}</label>
        <select class="select" id="accType">
          <option value="cash" ${initial.type === 'cash' ? 'selected' : ''}>${I18n.t('account.type.cash')}</option>
          <option value="bank" ${initial.type === 'bank' ? 'selected' : ''}>${I18n.t('account.type.bank')}</option>
          <option value="ewallet" ${initial.type === 'ewallet' ? 'selected' : ''}>${I18n.t('account.type.ewallet')}</option>
        </select>
      </div>
      <div class="grid grid-2" style="gap: var(--space-3); margin-bottom: var(--space-3)">
        <div class="form-group">
          <label class="form-label">${I18n.t('account.bankName')}</label>
          <input type="text" class="input" id="accBankName" value="${escapeHTML(initial.bankName || '')}" autocomplete="off"/>
        </div>
        <div class="form-group">
          <label class="form-label">${I18n.t('account.accountNumber')}</label>
          <input type="text" class="input" id="accNumber" value="${escapeHTML(initial.accountNumber || '')}" autocomplete="off"/>
        </div>
      </div>

      <div class="amount-input">
        <span class="currency">${Store.currency.symbol}</span>
        <input type="text" placeholder="0" id="accBalance" autocomplete="off" value="${initial.balance ? Number(initial.balance).toLocaleString('en-US') : ''}"/>
      </div>

      <div class="form-group">
        <label class="form-label">${I18n.t('txn.note')}</label>
        <textarea class="textarea" id="accNote" placeholder="${I18n.t('txn.description')}">${escapeHTML(initial.note || '')}</textarea>
      </div>
    `;

    Modal.open({
      title: isEdit ? I18n.t('action.edit.account') : I18n.t('action.add.account'),
      subtitle: I18n.t('page.accounts.subtitle'),
      bodyHTML,
      actions: [
        { label: I18n.t('action.cancel'), variant: 'secondary' },
        {
          label: isEdit ? I18n.t('action.save') : I18n.t('action.add'),
          variant: 'primary',
          keepOpen: true,
          onClick: async () => {
            const root = document.getElementById('modalRoot');
            const name = root.querySelector('#accName').value.trim();
            const type = root.querySelector('#accType').value;
            const bankName = root.querySelector('#accBankName').value.trim();
            const accountNumber = root.querySelector('#accNumber').value.trim();
            const balance = parseAmountInput(root.querySelector('#accBalance').value);
            const note = root.querySelector('#accNote').value.trim();
            if (!name) { Toast.show(I18n.t('form.nameRequired')); return; }
            try {
              if (isEdit) await Store.updateAccount(existing.id, { name, type, bankName, accountNumber, balance, note });
              else await Store.addAccount({ name, type, bankName, accountNumber, balance, note });
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

    wireAmountInput(document.getElementById('modalRoot').querySelector('#accBalance'));
  }

  // ---- Savings form -----------------------------------------------------

  function savingsForm(existing) {
    const accounts = Store.getAccounts();
    const isEdit = Boolean(existing);
    const initial = existing || {
      name: '', accountId: accounts[0] ? accounts[0].id : '',
      principal: 0, interestRate: 0, termMonths: 6,
      startDate: todayISO(), maturityDate: '', note: ''
    };

    function accountsHTML(accs) {
      return accs.map((a) => `<option value="${a.id}">${escapeHTML(a.name)}</option>`).join('');
    }

    const bodyHTML = `
      <div class="form-group" style="margin-bottom: var(--space-3)">
        <label class="form-label">${I18n.t('savings.name')}</label>
        <input type="text" class="input" id="savName" value="${escapeHTML(initial.name)}" placeholder="${I18n.t('savings.namePlaceholder')}" autocomplete="off"/>
      </div>
      <div class="form-group" style="margin-bottom: var(--space-3)">
        <label class="form-label">${I18n.t('savings.account')}</label>
        <select class="select" id="savAccount">${accountsHTML(accounts)}</select>
      </div>

      <div class="amount-input">
        <span class="currency">${Store.currency.symbol}</span>
        <input type="text" placeholder="0" id="savPrincipal" autocomplete="off" value="${initial.principal ? Number(initial.principal).toLocaleString('en-US') : ''}"/>
      </div>

      <div class="grid grid-2" style="gap: var(--space-3); margin-bottom: var(--space-3)">
        <div class="form-group">
          <label class="form-label">${I18n.t('savings.interestRate')}</label>
          <input type="number" class="input" id="savRate" step="0.1" min="0" max="100" value="${initial.interestRate || ''}"/>
        </div>
        <div class="form-group">
          <label class="form-label">${I18n.t('savings.termMonths')}</label>
          <input type="number" class="input" id="savTerm" min="1" max="360" value="${initial.termMonths || ''}"/>
        </div>
      </div>

      <div class="grid grid-2" style="gap: var(--space-3); margin-bottom: var(--space-3)">
        <div class="form-group">
          <label class="form-label">${I18n.t('savings.startDate')}</label>
          <input type="date" class="input" id="savStart" value="${initial.startDate}"/>
        </div>
        <div class="form-group">
          <label class="form-label">${I18n.t('savings.maturityDate')}</label>
          <input type="date" class="input" id="savMaturity" value="${initial.maturityDate}" readonly style="background:var(--color-surface-2)"/>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">${I18n.t('txn.note')}</label>
        <textarea class="textarea" id="savNote" placeholder="${I18n.t('txn.description')}">${escapeHTML(initial.note || '')}</textarea>
      </div>
    `;

    Modal.open({
      title: isEdit ? I18n.t('action.edit.savings') : I18n.t('action.add.savings'),
      subtitle: I18n.t('page.savings.subtitle'),
      bodyHTML,
      actions: [
        { label: I18n.t('action.cancel'), variant: 'secondary' },
        {
          label: isEdit ? I18n.t('action.save') : I18n.t('action.add'),
          variant: 'primary',
          keepOpen: true,
          onClick: async () => {
            const root = document.getElementById('modalRoot');
            const name = root.querySelector('#savName').value.trim();
            const accountId = root.querySelector('#savAccount').value;
            const principal = parseAmountInput(root.querySelector('#savPrincipal').value);
            const interestRate = parseFloat(root.querySelector('#savRate').value) || 0;
            const termMonths = parseInt(root.querySelector('#savTerm').value, 10) || 0;
            const startDate = root.querySelector('#savStart').value;
            const maturityDate = root.querySelector('#savMaturity').value;
            const note = root.querySelector('#savNote').value.trim();

            if (!name) { Toast.show(I18n.t('form.nameRequired')); return; }
            if (!principal) { Toast.show(I18n.t('form.amountRequired')); return; }
            if (!interestRate) { Toast.show(I18n.t('form.interestRequired')); return; }
            if (!termMonths) { Toast.show(I18n.t('form.termRequired')); return; }
            if (!startDate) { Toast.show(I18n.t('form.dateRequired')); return; }

            try {
              const data = { name, accountId, principal, interestRate, termMonths, startDate, maturityDate, note };
              if (isEdit) await Store.updateSavings(existing.id, data);
              else await Store.addSavings(data);
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
    if (initial.accountId) root.querySelector('#savAccount').value = initial.accountId;
    wireAmountInput(root.querySelector('#savPrincipal'));

    // Auto-calc maturity date
    function calcMaturity() {
      const start = root.querySelector('#savStart').value;
      const months = parseInt(root.querySelector('#savTerm').value, 10) || 0;
      if (start && months > 0) {
        const d = new Date(start);
        d.setMonth(d.getMonth() + months);
        root.querySelector('#savMaturity').value = d.toISOString().slice(0, 10);
      }
    }
    root.querySelector('#savStart').addEventListener('change', calcMaturity);
    root.querySelector('#savTerm').addEventListener('input', calcMaturity);
    if (!initial.maturityDate) calcMaturity();
  }

  // ---- Transfer form ----------------------------------------------------

  function transferForm() {
    const accounts = Store.getAccounts();
    if (accounts.length < 2) {
      Toast.show(I18n.t('transfer.sameAccount'));
      return;
    }

    function accountsHTML(accs) {
      return accs.map((a) => `<option value="${a.id}">${escapeHTML(a.name)} (${Fmt.formatAmount(a.balance, { absolute: true })})</option>`).join('');
    }

    const bodyHTML = `
      <div class="form-group" style="margin-bottom: var(--space-3)">
        <label class="form-label">${I18n.t('transfer.from')}</label>
        <select class="select" id="tfFrom">${accountsHTML(accounts)}</select>
      </div>
      <div class="form-group" style="margin-bottom: var(--space-3)">
        <label class="form-label">${I18n.t('transfer.to')}</label>
        <select class="select" id="tfTo">${accountsHTML(accounts)}</select>
      </div>

      <div class="amount-input">
        <span class="currency">${Store.currency.symbol}</span>
        <input type="text" placeholder="0" id="tfAmount" autocomplete="off"/>
      </div>

      <div class="form-group" style="margin-bottom: var(--space-3)">
        <label class="form-label">${I18n.t('txn.date')}</label>
        <input type="date" class="input" id="tfDate" value="${todayISO()}"/>
      </div>
      <div class="form-group">
        <label class="form-label">${I18n.t('txn.note')}</label>
        <textarea class="textarea" id="tfNote" placeholder="${I18n.t('txn.description')}"></textarea>
      </div>
    `;

    Modal.open({
      title: I18n.t('transfer.title'),
      bodyHTML,
      actions: [
        { label: I18n.t('action.cancel'), variant: 'secondary' },
        {
          label: I18n.t('action.add.transfer'),
          variant: 'primary',
          keepOpen: true,
          onClick: async () => {
            const root = document.getElementById('modalRoot');
            const fromAccountId = root.querySelector('#tfFrom').value;
            const toAccountId = root.querySelector('#tfTo').value;
            const amount = parseAmountInput(root.querySelector('#tfAmount').value);
            const date = root.querySelector('#tfDate').value;
            const note = root.querySelector('#tfNote').value.trim();

            if (fromAccountId === toAccountId) { Toast.show(I18n.t('transfer.sameAccount')); return; }
            if (!amount) { Toast.show(I18n.t('form.amountRequired')); return; }
            if (!date) { Toast.show(I18n.t('form.dateRequired')); return; }

            const fromAcc = Store.getAccountById(fromAccountId);
            if (fromAcc && Number(fromAcc.balance || 0) < amount) {
              Toast.show(I18n.t('transfer.insufficientBalance'));
              return;
            }

            try {
              await Store.addTransfer({ fromAccountId, toAccountId, amount, date, note });
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

    // Pre-select second account for "to"
    const root = document.getElementById('modalRoot');
    if (accounts.length > 1) root.querySelector('#tfTo').value = accounts[1].id;
    wireAmountInput(root.querySelector('#tfAmount'));
  }
})(window);
