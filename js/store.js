/**
 * Data store (Firebase-backed).
 *
 * Lifecycle:
 *   1. `getStoredCredentials()`  — returns cached { config, username } from localStorage
 *   2. `configure({config, username, seedSample})` — init Firebase, seed if empty, fetch all
 *   3. `disconnect()`            — clear credentials and reset state
 *
 * Mutations push to Firestore and update local cache, then emit change events.
 * Pages can subscribe via `onChange(cb)` and re-render.
 */
(function (global) {
  'use strict';

  const LS_CONFIG = 'pl.fb.config';
  const LS_USER = 'pl.fb.user';
  // Preserved across disconnect so the setup modal can prefill the last values.
  const LS_LAST_CONFIG = 'pl.fb.lastConfig';
  const LS_LAST_USER = 'pl.fb.lastUser';

  const DEFAULT_SETTINGS = {
    currency: { code: 'VND', symbol: '₫', position: 'suffix', decimals: 0 },
    openingBalance: 0,
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

  async function seedIfEmpty({ seedSample }) {
    // Categories are always required for the app to function.
    const cats = await FirebaseClient.getAll('categories');
    const meta = await FirebaseClient.getUserMeta();

    const tasks = [];

    if (cats.length === 0) {
      const categories = await loadJSON('data/categories.json');
      for (const c of categories) tasks.push(FirebaseClient.setItem('categories', c.id, c));
    }

    if (!meta || !meta.settings) {
      const settings = await loadJSON('data/settings.json').catch(() => DEFAULT_SETTINGS);
      tasks.push(FirebaseClient.setUserMeta({ settings }));
    }

    if (seedSample) {
      // Only seed sample tx/people/loans if these collections are empty.
      const [people, txns, lending, borrowing, accounts, savings, transfers] = await Promise.all([
        FirebaseClient.getAll('people'),
        FirebaseClient.getAll('transactions'),
        FirebaseClient.getAll('lending'),
        FirebaseClient.getAll('borrowing'),
        FirebaseClient.getAll('accounts'),
        FirebaseClient.getAll('savings'),
        FirebaseClient.getAll('transfers')
      ]);
      if (people.length === 0 && txns.length === 0 && lending.length === 0 && borrowing.length === 0) {
        const [mockPeople, mockTxns, mockLending, mockBorrowing] = await Promise.all([
          loadJSON('data/people.json'),
          loadJSON('data/transactions.json'),
          loadJSON('data/lending.json'),
          loadJSON('data/borrowing.json')
        ]);
        for (const p of mockPeople) tasks.push(FirebaseClient.setItem('people', p.id, p));
        for (const t of mockTxns) tasks.push(FirebaseClient.setItem('transactions', t.id, t));
        for (const l of mockLending) tasks.push(FirebaseClient.setItem('lending', l.id, l));
        for (const b of mockBorrowing) tasks.push(FirebaseClient.setItem('borrowing', b.id, b));
      }
      if (accounts.length === 0) {
        const mockAccounts = await loadJSON('data/accounts.json').catch(() => []);
        for (const a of mockAccounts) tasks.push(FirebaseClient.setItem('accounts', a.id, a));
      }
      if (savings.length === 0) {
        const mockSavings = await loadJSON('data/savings.json').catch(() => []);
        for (const s of mockSavings) tasks.push(FirebaseClient.setItem('savings', s.id, s));
      }
      if (transfers.length === 0) {
        const mockTransfers = await loadJSON('data/transfers.json').catch(() => []);
        for (const tf of mockTransfers) tasks.push(FirebaseClient.setItem('transfers', tf.id, tf));
      }
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

  async function configure({ config, username, seedSample = true }) {
    await FirebaseClient.init(config, username);
    state.config = config;
    state.username = String(username).trim();
    await seedIfEmpty({ seedSample });
    await fetchAll();
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

  // Signed delta that a transaction contributes to its linked account's balance:
  // +amount for income, -amount for expense. Returns 0 if unlinked.
  function txnAccountDelta(txn) {
    if (!txn || !txn.accountId) return 0;
    const amount = Number(txn.amount || 0);
    return txn.type === 'income' ? amount : -amount;
  }

  async function applyAccountDelta(accountId, delta) {
    if (!accountId || !delta) return;
    const acc = state.accounts.find((a) => a.id === accountId);
    if (!acc) return;
    acc.balance = Number(acc.balance || 0) + delta;
    await FirebaseClient.updateItem('accounts', acc.id, { balance: acc.balance });
  }

  async function addTransaction(data) {
    const id = data.id || genId('t');
    const rec = Object.assign({ personId: null, accountId: null, note: '' }, data, { id });
    if (!rec.accountId) rec.accountId = null;
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
    if ('accountId' in patch && !patch.accountId) patch.accountId = null;
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
    const rec = Object.assign({ note: '', payments: [] }, data, { id });
    await FirebaseClient.setItem(kind, id, rec);
    state[kind].push(rec);
    emit();
    return rec;
  }

  async function updateLoan(kind, id, data) {
    const patch = Object.assign({}, data);
    delete patch.id;
    await FirebaseClient.updateItem(kind, id, patch);
    const i = state[kind].findIndex((l) => l.id === id);
    if (i >= 0) state[kind][i] = Object.assign({}, state[kind][i], patch);
    emit();
  }

  async function deleteLoan(kind, id) {
    await FirebaseClient.deleteItem(kind, id);
    state[kind] = state[kind].filter((l) => l.id !== id);
    emit();
  }

  async function addLoanPayment(kind, loanId, payment) {
    const prefix = kind === 'lending' ? 'lp' : 'bp';
    const p = Object.assign({ id: genId(prefix), note: '' }, payment);
    await FirebaseClient.arrayUnion(kind, loanId, 'payments', [p]);
    const loan = state[kind].find((l) => l.id === loanId);
    if (loan) loan.payments = (loan.payments || []).concat([p]);
    emit();
    return p;
  }

  async function removeLoanPayment(kind, loanId, payment) {
    await FirebaseClient.arrayRemove(kind, loanId, 'payments', [payment]);
    const loan = state[kind].find((l) => l.id === loanId);
    if (loan) loan.payments = (loan.payments || []).filter((p) => p.id !== payment.id);
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
    await FirebaseClient.deleteItem('accounts', id);
    state.accounts = state.accounts.filter((a) => a.id !== id);
    emit();
  }

  // ---- Savings ----------------------------------------------------------

  async function addSavings(data) {
    const id = data.id || genId('sav');
    const rec = Object.assign({
      accountId: '', principal: 0, interestRate: 0, termMonths: 0,
      startDate: '', maturityDate: '', note: '', status: 'active',
      withdrawals: [],
      createdAt: new Date().toISOString().slice(0, 10)
    }, data, { id });
    await FirebaseClient.setItem('savings', id, rec);
    state.savings.push(rec);
    // Deduct principal from the source account so accounts + savings don't double-count.
    const acc = rec.accountId ? state.accounts.find((a) => a.id === rec.accountId) : null;
    if (acc) {
      acc.balance = Number(acc.balance || 0) - Number(rec.principal || 0);
      await FirebaseClient.updateItem('accounts', acc.id, { balance: acc.balance });
    }
    emit();
    return rec;
  }

  async function updateSavings(id, data) {
    const patch = Object.assign({}, data);
    delete patch.id;
    await FirebaseClient.updateItem('savings', id, patch);
    const i = state.savings.findIndex((s) => s.id === id);
    if (i >= 0) state.savings[i] = Object.assign({}, state.savings[i], patch);
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
    const acc = sav.accountId ? state.accounts.find((a) => a.id === sav.accountId) : null;
    if (acc) {
      acc.balance = Number(acc.balance || 0) + payout;
      await FirebaseClient.updateItem('accounts', acc.id, { balance: acc.balance });
    }
    emit();
    return sav;
  }

  async function deleteSavings(id) {
    const sav = state.savings.find((s) => s.id === id);
    // If the savings is still active/matured (not yet withdrawn), refund principal
    // to the source account — otherwise deleting would silently lose that money.
    if (sav && sav.status !== 'withdrawn') {
      const acc = sav.accountId ? state.accounts.find((a) => a.id === sav.accountId) : null;
      if (acc) {
        acc.balance = Number(acc.balance || 0) + Number(sav.principal || 0);
        await FirebaseClient.updateItem('accounts', acc.id, { balance: acc.balance });
      }
    }
    await FirebaseClient.deleteItem('savings', id);
    state.savings = state.savings.filter((s) => s.id !== id);
    emit();
  }

  // ---- Transfers --------------------------------------------------------

  async function addTransfer(data) {
    const id = data.id || genId('tf');
    const rec = Object.assign({ note: '' }, data, { id });
    await FirebaseClient.setItem('transfers', id, rec);
    state.transfers.push(rec);
    // Update account balances
    const fromAcc = state.accounts.find((a) => a.id === rec.fromAccountId);
    const toAcc = state.accounts.find((a) => a.id === rec.toAccountId);
    const amount = Number(rec.amount || 0);
    if (fromAcc) {
      fromAcc.balance = Number(fromAcc.balance || 0) - amount;
      await FirebaseClient.updateItem('accounts', fromAcc.id, { balance: fromAcc.balance });
    }
    if (toAcc) {
      toAcc.balance = Number(toAcc.balance || 0) + amount;
      await FirebaseClient.updateItem('accounts', toAcc.id, { balance: toAcc.balance });
    }
    emit();
    return rec;
  }

  async function deleteTransfer(id) {
    const tf = state.transfers.find((t) => t.id === id);
    if (tf) {
      const amount = Number(tf.amount || 0);
      const fromAcc = state.accounts.find((a) => a.id === tf.fromAccountId);
      const toAcc = state.accounts.find((a) => a.id === tf.toAccountId);
      if (fromAcc) {
        fromAcc.balance = Number(fromAcc.balance || 0) + amount;
        await FirebaseClient.updateItem('accounts', fromAcc.id, { balance: fromAcc.balance });
      }
      if (toAcc) {
        toAcc.balance = Number(toAcc.balance || 0) - amount;
        await FirebaseClient.updateItem('accounts', toAcc.id, { balance: toAcc.balance });
      }
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
    const principal = Number(sav.principal || 0);
    const rate = Number(sav.interestRate || 0) / 100;
    const start = Fmt.parseDate(sav.startDate);
    const today = Fmt.today();
    const maturity = Fmt.parseDate(sav.maturityDate);
    // Interest accrues day-by-day up to (but not past) the maturity date.
    const end = today < maturity ? today : maturity;
    const daysElapsed = Math.max(0, Fmt.daysBetween(start, end));
    return Math.round(principal * rate * daysElapsed / 365);
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

  // Cash not held in any tracked account: opening balance + signed sum of
  // transactions with accountId == null. Transactions that mutate an account
  // are already reflected in totalAccountsBalance() and are excluded here.
  function cashBalance() {
    const unlinked = state.transactions.filter((t) => !t.accountId);
    const opening = Number(state.settings.openingBalance || 0);
    return opening + totalIncome(unlinked) - totalExpense(unlinked);
  }

  function currentBalance() {
    // Authoritative spendable money = accounts + free-floating cash.
    return totalAccountsBalance() + cashBalance();
  }

  function netWorth() {
    // Total accessible wealth: current balance (accounts + cash) + money locked
    // in active savings (principal + accrued interest) + receivables - payables.
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
    const push = (loan, kind) => {
      const remaining = loanRemaining(loan);
      if (remaining <= 0) return;
      const due = Fmt.parseDate(loan.dueDate);
      const diff = Fmt.daysBetween(today, due);
      if (diff <= limitDays) items.push({ loan, kind, diff, remaining });
    };
    state.lending.forEach((l) => push(l, 'lending'));
    state.borrowing.forEach((l) => push(l, 'borrowing'));
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
    get openingBalance() { return Number(state.settings.openingBalance || 0); },
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
    cashBalance,
    totalReceivable,
    totalPayable,
    upcomingDueLoans,
    personTransactions,
    personOwedToUser,
    personUserOwes,
    spendingByCategory,
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
    deleteTransfer
  };

  global.Store = Store;
})(window);
