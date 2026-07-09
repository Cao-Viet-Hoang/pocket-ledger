/**
 * Data store (Firebase-backed).
 *
 * Lifecycle:
 *   1. `getStoredCredentials()`  — returns cached { config, username } from localStorage
 *   2. `configure({config, username})` — init Firebase, seed defaults if empty,
 *      fetch all, backfill `createdAt` timestamps, seed the system cash account
 *      if missing.
 *   3. `disconnect()`            — clear credentials and reset state
 *
 * Mutations push to Firestore and update local cache, then emit change events.
 * Pages can subscribe via `onChange(cb)` and re-render.
 *
 * Account coupling: every transaction / savings / transfer / loan / loan
 * payment is linked to an account via `accountId` (or `fromAccountId` /
 * `toAccountId`). The system-managed cash account (id `acc-cash`) is always
 * present and acts as the default when the caller leaves the field unset.
 *
 * Borrowing installments: a borrowing record can carry `installmentMonths`,
 * `installmentDay`, and an `installments[]` schedule. `addLoan` generates
 * the schedule on create; `updateLoan` regenerates it when principal /
 * months / day / startDate change (resetting all `paymentId` links).
 * `addLoanPayment(kind, loanId, payment, installmentId?)` accepts an optional
 * installment id to mark a slot as paid; `removeLoanPayment` un-links
 * automatically when the linked payment is removed.
 */
(function (global) {
  'use strict';

  const LS_CONFIG = 'pl.fb.config';
  const LS_USER = 'pl.fb.user';
  // Preserved across disconnect so the setup modal can prefill the last values.
  const LS_LAST_CONFIG = 'pl.fb.lastConfig';
  const LS_LAST_USER = 'pl.fb.lastUser';

  // Fixed id of the system-managed cash account. Always present, locked from
  // deletion. Acts as the default for any form that doesn't specify an
  // accountId (transactions, savings, loans, loan payments).
  const CASH_ACCOUNT_ID = 'acc-cash';

  const DEFAULT_SETTINGS = {
    currency: { code: 'VND', symbol: '₫', position: 'suffix', decimals: 0 },
    defaultLanguage: 'en'
  };

  const state = {
    configured: false,
    loaded: false,
    username: null,
    config: null,
    categories: [],
    people: [],
    transactions: [],
    lending: [],
    borrowing: [],
    accounts: [],
    savings: [],
    transfers: [],
    settings: Object.assign({}, DEFAULT_SETTINGS)
  };

  const listeners = new Set();
  function emit() {
    listeners.forEach((cb) => { try { cb(); } catch (err) { console.error(err); } });
  }
  function onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }

  // ---- Credentials persistence ------------------------------------------

  function readCredentials(configKey, userKey) {
    try {
      const raw = localStorage.getItem(configKey);
      const user = localStorage.getItem(userKey);
      if (!raw || !user) return null;
      const config = JSON.parse(raw);
      if (!config || typeof config !== 'object') return null;
      return { config, username: user };
    } catch (_) {
      return null;
    }
  }

  function writeCredentials(configKey, userKey, config, username) {
    try {
      localStorage.setItem(configKey, JSON.stringify(config));
      localStorage.setItem(userKey, username);
    } catch (_) {}
  }

  function clearCredentials(configKey, userKey) {
    try {
      localStorage.removeItem(configKey);
      localStorage.removeItem(userKey);
    } catch (_) {}
  }

  function getStoredCredentials() {
    return readCredentials(LS_CONFIG, LS_USER);
  }

  function getLastUsedCredentials() {
    return readCredentials(LS_LAST_CONFIG, LS_LAST_USER);
  }

  function saveStoredCredentials(config, username) {
    writeCredentials(LS_CONFIG, LS_USER, config, username);
  }

  function saveLastUsedCredentials(config, username) {
    writeCredentials(LS_LAST_CONFIG, LS_LAST_USER, config, username);
  }

  function clearStoredCredentials() {
    clearCredentials(LS_CONFIG, LS_USER);
  }

  // ---- Bootstrap --------------------------------------------------------

  async function loadJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error('Failed to load ' + path);
    return res.json();
  }

  async function seedDefaults() {
    // Categories + settings are the only baked-in defaults. Everything else
    // (accounts, people, transactions, loans, savings, transfers) is created
    // by the user through the app.
    const cats = await FirebaseClient.getAll('categories');
    const meta = await FirebaseClient.getUserMeta();
    const tasks = [];

    const categoryDefs = await loadJSON('defaults/categories.json').catch(() => []);
    if (cats.length === 0) {
      for (const c of categoryDefs) tasks.push(FirebaseClient.setItem('categories', c.id, c));
    } else {
      // Upsert any categories added to the defaults file since this user first
      // seeded, so existing users pick up new built-in categories without re-seeding.
      const existingIds = new Set(cats.map((c) => c.id));
      for (const c of categoryDefs) {
        if (!existingIds.has(c.id)) tasks.push(FirebaseClient.setItem('categories', c.id, c));
      }
    }

    if (!meta || !meta.settings) {
      const settings = await loadJSON('defaults/settings.json').catch(() => DEFAULT_SETTINGS);
      tasks.push(FirebaseClient.setUserMeta({ settings }));
    }

    if (tasks.length) {
      await Promise.all(tasks);
      await FirebaseClient.setUserMeta({ seededAt: new Date().toISOString() });
    }
  }

  async function fetchAll() {
    const [meta, cats, people, txns, lend, borr, accs, savs, tfs] = await Promise.all([
      FirebaseClient.getUserMeta(),
      FirebaseClient.getAll('categories'),
      FirebaseClient.getAll('people'),
      FirebaseClient.getAll('transactions'),
      FirebaseClient.getAll('lending'),
      FirebaseClient.getAll('borrowing'),
      FirebaseClient.getAll('accounts'),
      FirebaseClient.getAll('savings'),
      FirebaseClient.getAll('transfers')
    ]);
    state.settings = Object.assign({}, DEFAULT_SETTINGS, (meta && meta.settings) || {});
    state.categories = cats;
    state.people = people;
    state.transactions = txns;
    state.lending = lend;
    state.borrowing = borr;
    state.accounts = accs;
    state.savings = savs;
    state.transfers = tfs;
    state.loaded = true;
  }

  // Derive an ISO timestamp from a genId-style id, or fall back to the record's
  // date at local midnight. Safe no-op for ids that don't fit the pattern.
  function deriveCreatedAt(id, fallbackDate) {
    const parts = String(id || '').split('-');
    if (parts.length === 3) {
      const ms = parseInt(parts[1], 36);
      // Sanity-bound: 2020-01-01 ≤ ms < 2100-01-01 — rejects non-timestamp
      // base36 strings like "001" that happen to parse to a small number.
      if (!Number.isNaN(ms) && ms >= 1577836800000 && ms < 4102444800000) {
        return new Date(ms).toISOString();
      }
    }
    if (fallbackDate) {
      const d = new Date(fallbackDate + 'T00:00:00');
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    return new Date().toISOString();
  }

  // One-shot migration: stamp `createdAt` onto any transaction / transfer /
  // loan / loan-payment that doesn't have one yet. Idempotent — re-running
  // after a successful run is a no-op because every record already has the
  // field. Runs automatically after `fetchAll` during `configure`.
  async function backfillTimestamps() {
    const tasks = [];

    for (const t of state.transactions) {
      if (!t.createdAt) {
        t.createdAt = deriveCreatedAt(t.id, t.date);
        tasks.push(FirebaseClient.updateItem('transactions', t.id, { createdAt: t.createdAt }));
      }
    }

    for (const tf of state.transfers) {
      if (!tf.createdAt) {
        tf.createdAt = deriveCreatedAt(tf.id, tf.date);
        tasks.push(FirebaseClient.updateItem('transfers', tf.id, { createdAt: tf.createdAt }));
      }
    }

    for (const kind of ['lending', 'borrowing']) {
      for (const l of state[kind]) {
        const patch = {};
        if (!l.createdAt) {
          l.createdAt = deriveCreatedAt(l.id, l.startDate);
          patch.createdAt = l.createdAt;
        }
        const payments = l.payments || [];
        let paymentsChanged = false;
        const nextPayments = payments.map((p) => {
          if (p.createdAt) return p;
          paymentsChanged = true;
          return Object.assign({}, p, { createdAt: deriveCreatedAt(p.id, p.date) });
        });
        if (paymentsChanged) {
          l.payments = nextPayments;
          patch.payments = nextPayments;
        }
        if (Object.keys(patch).length) {
          tasks.push(FirebaseClient.updateItem(kind, l.id, patch));
        }
      }
    }

    if (tasks.length) await Promise.all(tasks);
  }

  // Ensures the system-managed cash account (`acc-cash`) exists in Firestore
  // and the local cache. Idempotent: returns early when the account already
  // exists. Created with `balance: 0` for new ledgers. The account name is
  // localized at seed time but freely renameable afterwards.
  async function seedCashAccount() {
    if (state.accounts.some((a) => a.id === CASH_ACCOUNT_ID)) return;

    const accountDefs = await loadJSON('defaults/accounts.json').catch(() => []);
    const template = accountDefs.find((a) => a.id === CASH_ACCOUNT_ID) || {};
    const cash = Object.assign(
      { id: CASH_ACCOUNT_ID, type: 'cash', bankName: '', accountNumber: '',
        balance: 0, icon: 'wallet', color: 1, note: '' },
      template,
      {
        name: I18n.t('account.type.cash'),
        createdAt: new Date().toISOString().slice(0, 10)
      }
    );
    await FirebaseClient.setItem('accounts', cash.id, cash);
    state.accounts.unshift(cash);
  }

  async function configure({ config, username }) {
    await FirebaseClient.init(config, username);
    state.config = config;
    state.username = String(username).trim();
    await seedDefaults();
    await fetchAll();
    await backfillTimestamps();
    await seedCashAccount();
    state.configured = true;
    saveStoredCredentials(config, state.username);
    saveLastUsedCredentials(config, state.username);
    emit();
  }

  function disconnect() {
    state.configured = false;
    state.loaded = false;
    state.config = null;
    state.username = null;
    state.categories = [];
    state.people = [];
    state.transactions = [];
    state.lending = [];
    state.borrowing = [];
    state.accounts = [];
    state.savings = [];
    state.transfers = [];
    state.settings = Object.assign({}, DEFAULT_SETTINGS);
    clearStoredCredentials();
    emit();
  }

  // ---- Mutations --------------------------------------------------------

  function genId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  // Signed delta that a transaction contributes to its account's balance:
  // +amount for income, -amount for expense.
  function txnAccountDelta(txn) {
    const amount = Number(txn.amount || 0);
    return txn.type === 'income' ? amount : -amount;
  }

  // Signed delta that a loan payment contributes to its account's balance:
  // lending payment = money received (+amount), borrowing payment = money paid (-amount).
  function paymentAccountDelta(kind, payment) {
    const amount = Number(payment.amount || 0);
    return kind === 'lending' ? amount : -amount;
  }

  // Signed delta that a loan's principal contributes to its account's balance:
  // lending = money given out (-principal), borrowing = money received (+principal).
  function loanAccountDelta(kind, loan) {
    const principal = Number(loan.principal || 0);
    return kind === 'lending' ? -principal : principal;
  }

  async function applyAccountDelta(accountId, delta) {
    if (!delta) return;
    const acc = state.accounts.find((a) => a.id === accountId);
    if (!acc) return;
    acc.balance = Number(acc.balance || 0) + delta;
    await FirebaseClient.updateItem('accounts', acc.id, { balance: acc.balance });
  }

  // Build an installment schedule for a borrowing. Each of the first
  // (months − 1) slots gets `base` = principal/months rounded UP to the
  // nearest 1,000 — so users see clean numbers (e.g. 25,108,000 / 12 →
  // 11 × 2,093,000 + 1 × 2,085,000). The last slot absorbs the remainder so
  // the sum still equals `principal` exactly. Falls back to a plain floor
  // split when the principal is too small to round up meaningfully (would
  // make the last slot ≤ 0). The first due date is the next occurrence of
  // `day` on or after `startDate` (so startDate=2026-05-04 with day=4 places
  // the first slot on 2026-05-04 itself); subsequent slots step monthly,
  // capped to the last day of months that don't have `day` (e.g. Feb 28).
  function generateInstallments(principal, months, day, startDate) {
    const p = Number(principal) || 0;
    const m = Number(months) || 0;
    const d = Number(day) || 1;
    if (p <= 0 || m <= 0 || !startDate) return [];
    const start = Fmt.parseDate(startDate);
    if (Number.isNaN(start.getTime())) return [];
    let base = Math.ceil(p / m / 1000) * 1000;
    let lastAmount = p - base * (m - 1);
    if (lastAmount <= 0) {
      base = Math.floor(p / m);
      lastAmount = p - base * (m - 1);
    }
    // Anchor the first installment in the start month (clamped to last day
    // when day=31 → Feb 28); if it lands before startDate, push to next month.
    let firstDue = new Date(start.getFullYear(), start.getMonth(), 1);
    let lastDayOfMonth = new Date(firstDue.getFullYear(), firstDue.getMonth() + 1, 0).getDate();
    firstDue.setDate(Math.min(d, lastDayOfMonth));
    if (firstDue < start) {
      firstDue = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      lastDayOfMonth = new Date(firstDue.getFullYear(), firstDue.getMonth() + 1, 0).getDate();
      firstDue.setDate(Math.min(d, lastDayOfMonth));
    }
    const out = [];
    for (let i = 0; i < m; i++) {
      const due = new Date(firstDue.getFullYear(), firstDue.getMonth() + i, 1);
      const lastDay = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
      due.setDate(Math.min(d, lastDay));
      const yyyy = due.getFullYear();
      const mm = String(due.getMonth() + 1).padStart(2, '0');
      const dd = String(due.getDate()).padStart(2, '0');
      out.push({
        id: genId('ins'),
        dueDate: `${yyyy}-${mm}-${dd}`,
        expectedAmount: i === m - 1 ? lastAmount : base,
        paymentId: null
      });
    }
    return out;
  }

  // Whether two installment configs would produce the same schedule. Used to
  // decide if `updateLoan` needs to regenerate.
  function installmentConfigChanged(prev, next) {
    return (Number(prev.principal || 0) !== Number(next.principal || 0))
      || (Number(prev.installmentMonths || 0) !== Number(next.installmentMonths || 0))
      || (Number(prev.installmentDay || 0) !== Number(next.installmentDay || 0))
      || (String(prev.startDate || '') !== String(next.startDate || ''));
  }

  async function addTransaction(data) {
    const id = data.id || genId('t');
    const rec = Object.assign(
      { personId: null, accountId: CASH_ACCOUNT_ID, note: '', createdAt: new Date().toISOString() },
      data,
      { id }
    );
    if (!rec.accountId) rec.accountId = CASH_ACCOUNT_ID;
    await FirebaseClient.setItem('transactions', id, rec);
    state.transactions.push(rec);
    await applyAccountDelta(rec.accountId, txnAccountDelta(rec));
    emit();
    return rec;
  }

  async function updateTransaction(id, data) {
    const prev = state.transactions.find((t) => t.id === id);
    const patch = Object.assign({}, data);
    delete patch.id;
    if ('accountId' in patch && !patch.accountId) patch.accountId = CASH_ACCOUNT_ID;
    await FirebaseClient.updateItem('transactions', id, patch);
    const i = state.transactions.findIndex((t) => t.id === id);
    if (i >= 0) state.transactions[i] = Object.assign({}, state.transactions[i], patch);
    // Rollback previous account effect, then apply new effect based on merged record.
    if (prev) {
      await applyAccountDelta(prev.accountId, -txnAccountDelta(prev));
      const next = state.transactions[i];
      await applyAccountDelta(next.accountId, txnAccountDelta(next));
    }
    emit();
  }

  async function deleteTransaction(id) {
    const prev = state.transactions.find((t) => t.id === id);
    await FirebaseClient.deleteItem('transactions', id);
    state.transactions = state.transactions.filter((t) => t.id !== id);
    if (prev) await applyAccountDelta(prev.accountId, -txnAccountDelta(prev));
    emit();
  }

  async function addPerson(data) {
    const id = data.id || genId('p');
    const rec = Object.assign({
      phone: '',
      note: '',
      color: ((state.people.length) % 6) + 1,
      createdAt: new Date().toISOString().slice(0, 10)
    }, data, { id });
    await FirebaseClient.setItem('people', id, rec);
    state.people.push(rec);
    emit();
    return rec;
  }

  async function updatePerson(id, data) {
    const patch = Object.assign({}, data);
    delete patch.id;
    await FirebaseClient.updateItem('people', id, patch);
    const i = state.people.findIndex((p) => p.id === id);
    if (i >= 0) state.people[i] = Object.assign({}, state.people[i], patch);
    emit();
  }

  async function deletePerson(id) {
    await FirebaseClient.deleteItem('people', id);
    state.people = state.people.filter((p) => p.id !== id);
    emit();
  }

  async function addLoan(kind, data) {
    if (kind !== 'lending' && kind !== 'borrowing') throw new Error('Invalid kind: ' + kind);
    const id = data.id || genId(kind === 'lending' ? 'l' : 'b');
    const rec = Object.assign(
      { note: '', payments: [], accountId: CASH_ACCOUNT_ID, createdAt: new Date().toISOString() },
      data,
      { id }
    );
    if (!rec.accountId) rec.accountId = CASH_ACCOUNT_ID;
    // Borrowing-only: auto-generate the installment schedule when both
    // `installmentMonths` and `installmentDay` are provided. Lending ignores
    // these fields.
    if (kind === 'borrowing' && Number(rec.installmentMonths) > 0 && Number(rec.installmentDay) > 0) {
      rec.installments = generateInstallments(rec.principal, rec.installmentMonths, rec.installmentDay, rec.startDate);
    }
    await FirebaseClient.setItem(kind, id, rec);
    state[kind].push(rec);
    // Principal leaves (lending) or enters (borrowing) the source account so
    // the money-in/money-out invariant holds.
    await applyAccountDelta(rec.accountId, loanAccountDelta(kind, rec));
    emit();
    return rec;
  }

  async function updateLoan(kind, id, data) {
    const prev = state[kind].find((l) => l.id === id);
    const patch = Object.assign({}, data);
    delete patch.id;
    if ('accountId' in patch && !patch.accountId) patch.accountId = CASH_ACCOUNT_ID;
    // Borrowing-only: regenerate the installment schedule when principal,
    // installmentMonths, installmentDay, or startDate changes. Payment links
    // (`paymentId`) on entries are reset because the new schedule is a fresh
    // structure — payments still exist in `payments[]`, just unlinked.
    if (kind === 'borrowing' && prev) {
      const merged = Object.assign({}, prev, patch);
      const wantsInstallments = Number(merged.installmentMonths) > 0 && Number(merged.installmentDay) > 0;
      if (!wantsInstallments) {
        // User toggled installments off — drop the schedule entirely.
        if (prev.installments) patch.installments = null;
      } else if (!prev.installments || installmentConfigChanged(prev, merged)) {
        patch.installments = generateInstallments(
          merged.principal, merged.installmentMonths, merged.installmentDay, merged.startDate
        );
      }
    }
    await FirebaseClient.updateItem(kind, id, patch);
    const i = state[kind].findIndex((l) => l.id === id);
    if (i >= 0) state[kind][i] = Object.assign({}, state[kind][i], patch);
    // Rebalance when principal or accountId changed — rollback prior principal
    // effect on the old source, apply the new one. Payment-level deltas are
    // unaffected since payments own their own accountId.
    if (prev) {
      const next = state[kind][i];
      const prevPrincipal = Number(prev.principal || 0);
      const nextPrincipal = Number(next.principal || 0);
      if (prev.accountId !== next.accountId || prevPrincipal !== nextPrincipal) {
        await applyAccountDelta(prev.accountId, -loanAccountDelta(kind, prev));
        await applyAccountDelta(next.accountId, loanAccountDelta(kind, next));
      }
    }
    emit();
  }

  async function deleteLoan(kind, id) {
    const loan = state[kind].find((l) => l.id === id);
    // Unwind every linked payment's account effect, then refund/return the
    // principal itself — symmetric with addLoan + addLoanPayment so balances
    // end up as if the loan had never been created.
    if (loan) {
      for (const p of (loan.payments || [])) {
        await applyAccountDelta(p.accountId, -paymentAccountDelta(kind, p));
      }
      await applyAccountDelta(loan.accountId, -loanAccountDelta(kind, loan));
    }
    await FirebaseClient.deleteItem(kind, id);
    state[kind] = state[kind].filter((l) => l.id !== id);
    emit();
  }

  async function addLoanPayment(kind, loanId, payment, installmentId) {
    const prefix = kind === 'lending' ? 'lp' : 'bp';
    const p = Object.assign(
      { id: genId(prefix), note: '', accountId: CASH_ACCOUNT_ID, createdAt: new Date().toISOString() },
      payment
    );
    if (!p.accountId) p.accountId = CASH_ACCOUNT_ID;
    await FirebaseClient.arrayUnion(kind, loanId, 'payments', [p]);
    const loan = state[kind].find((l) => l.id === loanId);
    if (loan) loan.payments = (loan.payments || []).concat([p]);
    // If this payment is fulfilling an installment, write the link back so the
    // schedule shows the entry as paid. Borrowing-only — `installments` only
    // exists on borrowing records.
    if (installmentId && loan && loan.installments) {
      const next = loan.installments.map((ins) =>
        ins.id === installmentId ? Object.assign({}, ins, { paymentId: p.id }) : ins
      );
      loan.installments = next;
      await FirebaseClient.updateItem(kind, loanId, { installments: next });
    }
    await applyAccountDelta(p.accountId, paymentAccountDelta(kind, p));
    emit();
    return p;
  }

  async function removeLoanPayment(kind, loanId, payment) {
    await FirebaseClient.arrayRemove(kind, loanId, 'payments', [payment]);
    const loan = state[kind].find((l) => l.id === loanId);
    if (loan) loan.payments = (loan.payments || []).filter((p) => p.id !== payment.id);
    // Unlink the schedule entry that pointed at this payment so the slot
    // becomes available again. No-op for lending (no installments).
    if (loan && loan.installments && loan.installments.some((ins) => ins.paymentId === payment.id)) {
      const next = loan.installments.map((ins) =>
        ins.paymentId === payment.id ? Object.assign({}, ins, { paymentId: null }) : ins
      );
      loan.installments = next;
      await FirebaseClient.updateItem(kind, loanId, { installments: next });
    }
    await applyAccountDelta(payment.accountId, -paymentAccountDelta(kind, payment));
    emit();
  }

  async function updateSettings(patch) {
    const next = Object.assign({}, state.settings, patch);
    await FirebaseClient.setUserMeta({ settings: next });
    state.settings = next;
    emit();
  }

  // ---- Accounts ---------------------------------------------------------

  async function addAccount(data) {
    const id = data.id || genId('acc');
    const rec = Object.assign({
      type: 'cash', bankName: '', accountNumber: '', balance: 0,
      icon: 'wallet', color: 1, note: '',
      createdAt: new Date().toISOString().slice(0, 10)
    }, data, { id });
    await FirebaseClient.setItem('accounts', id, rec);
    state.accounts.push(rec);
    emit();
    return rec;
  }

  async function updateAccount(id, data) {
    const patch = Object.assign({}, data);
    delete patch.id;
    await FirebaseClient.updateItem('accounts', id, patch);
    const i = state.accounts.findIndex((a) => a.id === id);
    if (i >= 0) state.accounts[i] = Object.assign({}, state.accounts[i], patch);
    emit();
  }

  async function deleteAccount(id) {
    // Cash account is system-managed and acts as the default fallback for
    // every entity — refuse to delete it. Defense in depth; the UI also
    // hides the delete button for this id.
    if (id === CASH_ACCOUNT_ID) {
      throw new Error('Cash account cannot be deleted');
    }
    await FirebaseClient.deleteItem('accounts', id);
    state.accounts = state.accounts.filter((a) => a.id !== id);
    emit();
  }

  // ---- Savings ----------------------------------------------------------

  async function addSavings(data) {
    const id = data.id || genId('sav');
    const rec = Object.assign({
      accountId: CASH_ACCOUNT_ID, principal: 0, interestRate: 0, termMonths: 0,
      startDate: '', maturityDate: '', note: '', status: 'active',
      withdrawals: [],
      createdAt: new Date().toISOString().slice(0, 10)
    }, data, { id });
    if (!rec.accountId) rec.accountId = CASH_ACCOUNT_ID;
    await FirebaseClient.setItem('savings', id, rec);
    state.savings.push(rec);
    // Deduct principal from the source account so accounts + savings don't double-count.
    await applyAccountDelta(rec.accountId, -Number(rec.principal || 0));
    emit();
    return rec;
  }

  async function updateSavings(id, data) {
    const prev = state.savings.find((s) => s.id === id);
    const patch = Object.assign({}, data);
    delete patch.id;
    if ('accountId' in patch && !patch.accountId) patch.accountId = CASH_ACCOUNT_ID;
    await FirebaseClient.updateItem('savings', id, patch);
    const i = state.savings.findIndex((s) => s.id === id);
    if (i >= 0) state.savings[i] = Object.assign({}, state.savings[i], patch);
    // Rebalance the source account(s) when principal or accountId changed on an
    // active/matured savings. Withdrawn savings are frozen and skipped.
    if (prev && prev.status !== 'withdrawn') {
      const next = state.savings[i];
      const prevPrincipal = Number(prev.principal || 0);
      const nextPrincipal = Number(next.principal || 0);
      if (prev.accountId !== next.accountId || prevPrincipal !== nextPrincipal) {
        await applyAccountDelta(prev.accountId, prevPrincipal);   // refund old
        await applyAccountDelta(next.accountId, -nextPrincipal);  // deduct new
      }
    }
    emit();
  }

  async function withdrawSavings(id) {
    const sav = state.savings.find((s) => s.id === id);
    if (!sav || sav.status === 'withdrawn') return;
    const interest = savingsInterestEarned(sav);
    const payout = Number(sav.principal || 0) + interest;
    const patch = {
      status: 'withdrawn',
      withdrawnAt: new Date().toISOString().slice(0, 10),
      finalAmount: payout,
      finalInterest: interest
    };
    await FirebaseClient.updateItem('savings', id, patch);
    Object.assign(sav, patch);
    // Return principal + interest to the source account.
    await applyAccountDelta(sav.accountId, payout);
    emit();
    return sav;
  }

  async function deleteSavings(id) {
    const sav = state.savings.find((s) => s.id === id);
    // If the savings is still active/matured (not yet withdrawn), refund principal
    // to the source account — otherwise deleting would silently lose that money.
    if (sav && sav.status !== 'withdrawn') {
      await applyAccountDelta(sav.accountId, Number(sav.principal || 0));
    }
    await FirebaseClient.deleteItem('savings', id);
    state.savings = state.savings.filter((s) => s.id !== id);
    emit();
  }

  // ---- Transfers --------------------------------------------------------

  async function addTransfer(data) {
    const id = data.id || genId('tf');
    const rec = Object.assign({ note: '', createdAt: new Date().toISOString() }, data, { id });
    if (!rec.fromAccountId) rec.fromAccountId = CASH_ACCOUNT_ID;
    if (!rec.toAccountId) rec.toAccountId = CASH_ACCOUNT_ID;
    await FirebaseClient.setItem('transfers', id, rec);
    state.transfers.push(rec);
    const amount = Number(rec.amount || 0);
    await applyAccountDelta(rec.fromAccountId, -amount);
    await applyAccountDelta(rec.toAccountId, amount);
    emit();
    return rec;
  }

  async function deleteTransfer(id) {
    const tf = state.transfers.find((t) => t.id === id);
    if (tf) {
      const amount = Number(tf.amount || 0);
      await applyAccountDelta(tf.fromAccountId, amount);
      await applyAccountDelta(tf.toAccountId, -amount);
    }
    await FirebaseClient.deleteItem('transfers', id);
    state.transfers = state.transfers.filter((t) => t.id !== id);
    emit();
  }

  // ---- Selectors --------------------------------------------------------

  function getCategories() { return state.categories.slice(); }
  function getCategoryById(id) { return state.categories.find((c) => c.id === id) || null; }

  function getPeople() { return state.people.slice(); }
  function getPersonById(id) { return state.people.find((p) => p.id === id) || null; }

  function getTransactions() { return state.transactions.slice(); }
  function getLending() { return state.lending.slice(); }
  function getBorrowing() { return state.borrowing.slice(); }

  function getAccounts() { return state.accounts.slice(); }
  function getAccountById(id) { return state.accounts.find((a) => a.id === id) || null; }
  function getSavings() { return state.savings.slice(); }
  function getSavingsById(id) { return state.savings.find((s) => s.id === id) || null; }
  function getTransfers() { return state.transfers.slice(); }

  function totalAccountsBalance() {
    return state.accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
  }

  function savingsInterestEarned(sav) {
    // Once withdrawn, the interest is locked in — use the stored value.
    if (sav.status === 'withdrawn' && sav.finalInterest != null) {
      return Number(sav.finalInterest) || 0;
    }
    // Vietnamese term-deposit convention: interest is the projected amount
    // paid at maturity for the full locked term — not daily accrual. Formula:
    //   interest = principal × rate × termDays / 365
    const principal = Number(sav.principal || 0);
    const rate = Number(sav.interestRate || 0) / 100;
    const start = Fmt.parseDate(sav.startDate);
    const maturity = Fmt.parseDate(sav.maturityDate);
    const termDays = Math.max(0, Fmt.daysBetween(start, maturity));
    return Math.round(principal * rate * termDays / 365);
  }

  function savingsStatus(sav) {
    if (sav.status === 'withdrawn') return 'withdrawn';
    const today = Fmt.today();
    const maturity = Fmt.parseDate(sav.maturityDate);
    if (today >= maturity) return 'matured';
    return 'active';
  }

  function totalSavingsPrincipal() {
    return state.savings
      .filter((s) => savingsStatus(s) !== 'withdrawn')
      .reduce((sum, s) => sum + Number(s.principal || 0), 0);
  }

  function totalSavingsInterest() {
    return state.savings
      .filter((s) => savingsStatus(s) !== 'withdrawn')
      .reduce((sum, s) => sum + savingsInterestEarned(s), 0);
  }

  function totalPaid(loan) {
    return (loan.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }
  function loanRemaining(loan) {
    return Math.max(0, Number(loan.principal || 0) - totalPaid(loan));
  }
  function loanStatus(loan) {
    const remaining = loanRemaining(loan);
    const paid = totalPaid(loan);
    const today = Fmt.today();
    const due = Fmt.parseDate(loan.dueDate);
    if (remaining <= 0) return 'paid';
    if (due < today) return 'overdue';
    if (paid > 0) return 'partial';
    return 'unpaid';
  }

  function totalIncome(transactions) {
    return (transactions || state.transactions)
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }
  function totalExpense(transactions) {
    return (transactions || state.transactions)
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }

  function filterByMonth(items, year, month, key = 'date') {
    return items.filter((t) => {
      const d = Fmt.parseDate(t[key]);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }

  function currentBalance() {
    // Authoritative spendable money — every entity is account-coupled, so the
    // sum of account balances is the full picture. Cash sits inside the
    // system-managed cash account like any other.
    return totalAccountsBalance();
  }

  function netWorth() {
    // Total accessible wealth: current balance + money locked in active
    // savings (principal + projected interest) + receivables - payables.
    const savingsValue = state.savings
      .filter((s) => savingsStatus(s) !== 'withdrawn')
      .reduce((sum, s) => sum + Number(s.principal || 0) + savingsInterestEarned(s), 0);
    return currentBalance() + savingsValue + totalReceivable() - totalPayable();
  }

  function totalReceivable() {
    return state.lending.reduce((sum, l) => sum + loanRemaining(l), 0);
  }
  function totalPayable() {
    return state.borrowing.reduce((sum, l) => sum + loanRemaining(l), 0);
  }

  function upcomingDueLoans(limitDays = 14) {
    const today = Fmt.today();
    const items = [];
    // Lending has no installment concept — emit at loan level using the
    // loan's overall dueDate.
    state.lending.forEach((loan) => {
      const remaining = loanRemaining(loan);
      if (remaining <= 0) return;
      const diff = Fmt.daysBetween(today, Fmt.parseDate(loan.dueDate));
      if (diff <= limitDays) items.push({ loan, kind: 'lending', diff, remaining });
    });
    // Borrowing: when a schedule exists, emit one row per unpaid installment
    // (each with its own dueDate / expectedAmount) so the dashboard nudges
    // about each upcoming payment, not the loan as a whole. Without a
    // schedule, fall back to loan-level like lending.
    state.borrowing.forEach((loan) => {
      const schedule = Array.isArray(loan.installments) ? loan.installments : null;
      if (schedule && schedule.length) {
        schedule.forEach((ins, idx) => {
          if (ins.paymentId) return;
          const diff = Fmt.daysBetween(today, Fmt.parseDate(ins.dueDate));
          if (diff > limitDays) return;
          items.push({
            loan,
            kind: 'borrowing',
            diff,
            remaining: Number(ins.expectedAmount) || 0,
            installment: ins,
            installmentIndex: idx,
            installmentTotal: schedule.length
          });
        });
        return;
      }
      const remaining = loanRemaining(loan);
      if (remaining <= 0) return;
      const diff = Fmt.daysBetween(today, Fmt.parseDate(loan.dueDate));
      if (diff <= limitDays) items.push({ loan, kind: 'borrowing', diff, remaining });
    });
    items.sort((a, b) => a.diff - b.diff);
    return items;
  }

  function upcomingMaturingSavings(limitDays = 14) {
    const today = Fmt.today();
    const items = [];
    state.savings.forEach((sav) => {
      if (savingsStatus(sav) !== 'active') return;
      const diff = Fmt.daysBetween(today, Fmt.parseDate(sav.maturityDate));
      if (diff <= limitDays) items.push({ savings: sav, kind: 'savings', diff });
    });
    items.sort((a, b) => a.diff - b.diff);
    return items;
  }

  function personTransactions(personId) {
    return state.transactions.filter((t) => t.personId === personId);
  }
  function personOwedToUser(personId) {
    return state.lending.filter((l) => l.personId === personId).reduce((s, l) => s + loanRemaining(l), 0);
  }
  function personUserOwes(personId) {
    return state.borrowing.filter((l) => l.personId === personId).reduce((s, l) => s + loanRemaining(l), 0);
  }

  function spendingByCategory(transactions) {
    const txns = (transactions || state.transactions).filter((t) => t.type === 'expense');
    const byCat = new Map();
    for (const t of txns) {
      byCat.set(t.category, (byCat.get(t.category) || 0) + Number(t.amount || 0));
    }
    return Array.from(byCat.entries())
      .map(([id, value]) => ({ category: getCategoryById(id), value }))
      .sort((a, b) => b.value - a.value);
  }

  function incomeByCategory(transactions) {
    const txns = (transactions || state.transactions).filter((t) => t.type === 'income');
    const byCat = new Map();
    for (const t of txns) {
      byCat.set(t.category, (byCat.get(t.category) || 0) + Number(t.amount || 0));
    }
    return Array.from(byCat.entries())
      .map(([id, value]) => ({ category: getCategoryById(id), value }))
      .sort((a, b) => b.value - a.value);
  }

  function dailySeries(transactions, daysOrOptions = 30) {
    let days, end;
    if (typeof daysOrOptions === 'number') {
      days = daysOrOptions;
      end = Fmt.today();
    } else {
      end = daysOrOptions.end ? Fmt.parseDate(daysOrOptions.end) : Fmt.today();
      if (daysOrOptions.start) {
        const start = Fmt.parseDate(daysOrOptions.start);
        days = Math.max(1, Fmt.daysBetween(start, end) + 1);
      } else {
        days = daysOrOptions.days || 30;
      }
    }
    const arr = [];
    const txns = transactions || state.transactions;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      let income = 0, expense = 0;
      for (const t of txns) {
        const td = Fmt.parseDate(t.date);
        if (td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth() && td.getDate() === d.getDate()) {
          if (t.type === 'income') income += Number(t.amount || 0);
          else expense += Number(t.amount || 0);
        }
      }
      arr.push({ date: new Date(d), key, income, expense });
    }
    return arr;
  }

  // ---- Facade -----------------------------------------------------------

  const Store = {
    // Constants
    CASH_ACCOUNT_ID,

    // Lifecycle
    configure,
    disconnect,
    onChange,
    getStoredCredentials,
    getLastUsedCredentials,
    isConfigured() { return state.configured; },
    isLoaded() { return state.loaded; },
    getUsername() { return state.username; },
    getConfig() { return state.config; },

    // Settings
    get currency() { return state.settings.currency || DEFAULT_SETTINGS.currency; },
    get settings() { return Object.assign({}, state.settings); },
    updateSettings,

    // Read
    getCategories,
    getCategoryById,
    getPeople,
    getPersonById,
    getTransactions,
    getLending,
    getBorrowing,
    getAccounts,
    getAccountById,
    getSavings,
    getSavingsById,
    getTransfers,

    // Computed
    totalPaid,
    loanRemaining,
    loanStatus,
    totalIncome,
    totalExpense,
    filterByMonth,
    currentBalance,
    totalReceivable,
    totalPayable,
    upcomingDueLoans,
    upcomingMaturingSavings,
    personTransactions,
    personOwedToUser,
    personUserOwes,
    spendingByCategory,
    incomeByCategory,
    dailySeries,
    totalAccountsBalance,
    netWorth,
    savingsInterestEarned,
    savingsStatus,
    totalSavingsPrincipal,
    totalSavingsInterest,

    // Mutations
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addPerson,
    updatePerson,
    deletePerson,
    addLoan,
    updateLoan,
    deleteLoan,
    addLoanPayment,
    removeLoanPayment,
    addAccount,
    updateAccount,
    deleteAccount,
    addSavings,
    updateSavings,
    withdrawSavings,
    deleteSavings,
    addTransfer,
    deleteTransfer,

    // Migration — safe to re-run; only writes records that still lack createdAt.
    backfillTimestamps
  };

  global.Store = Store;
})(window);
