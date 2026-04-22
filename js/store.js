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
    settings: Object.assign({}, DEFAULT_SETTINGS)
  };

  const listeners = new Set();
  function emit() {
    listeners.forEach((cb) => { try { cb(); } catch (err) { console.error(err); } });
  }
  function onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }

  // ---- Credentials persistence ------------------------------------------

  function getStoredCredentials() {
    try {
      const raw = localStorage.getItem(LS_CONFIG);
      const user = localStorage.getItem(LS_USER);
      if (!raw || !user) return null;
      const config = JSON.parse(raw);
      if (!config || typeof config !== 'object') return null;
      return { config, username: user };
    } catch (_) {
      return null;
    }
  }

  function saveStoredCredentials(config, username) {
    try {
      localStorage.setItem(LS_CONFIG, JSON.stringify(config));
      localStorage.setItem(LS_USER, username);
    } catch (_) {}
  }

  function clearStoredCredentials() {
    try {
      localStorage.removeItem(LS_CONFIG);
      localStorage.removeItem(LS_USER);
    } catch (_) {}
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
      const [people, txns, lending, borrowing] = await Promise.all([
        FirebaseClient.getAll('people'),
        FirebaseClient.getAll('transactions'),
        FirebaseClient.getAll('lending'),
        FirebaseClient.getAll('borrowing')
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
    }

    if (tasks.length) {
      await Promise.all(tasks);
      await FirebaseClient.setUserMeta({ seededAt: new Date().toISOString() });
    }
  }

  async function fetchAll() {
    const [meta, cats, people, txns, lend, borr] = await Promise.all([
      FirebaseClient.getUserMeta(),
      FirebaseClient.getAll('categories'),
      FirebaseClient.getAll('people'),
      FirebaseClient.getAll('transactions'),
      FirebaseClient.getAll('lending'),
      FirebaseClient.getAll('borrowing')
    ]);
    state.settings = Object.assign({}, DEFAULT_SETTINGS, (meta && meta.settings) || {});
    state.categories = cats;
    state.people = people;
    state.transactions = txns;
    state.lending = lend;
    state.borrowing = borr;
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
    state.settings = Object.assign({}, DEFAULT_SETTINGS);
    clearStoredCredentials();
    emit();
  }

  // ---- Mutations --------------------------------------------------------

  function genId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  async function addTransaction(data) {
    const id = data.id || genId('t');
    const rec = Object.assign({ personId: null, note: '' }, data, { id });
    await FirebaseClient.setItem('transactions', id, rec);
    state.transactions.push(rec);
    emit();
    return rec;
  }

  async function updateTransaction(id, data) {
    const patch = Object.assign({}, data);
    delete patch.id;
    await FirebaseClient.updateItem('transactions', id, patch);
    const i = state.transactions.findIndex((t) => t.id === id);
    if (i >= 0) state.transactions[i] = Object.assign({}, state.transactions[i], patch);
    emit();
  }

  async function deleteTransaction(id) {
    await FirebaseClient.deleteItem('transactions', id);
    state.transactions = state.transactions.filter((t) => t.id !== id);
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

  // ---- Selectors --------------------------------------------------------

  function getCategories() { return state.categories.slice(); }
  function getCategoryById(id) { return state.categories.find((c) => c.id === id) || null; }

  function getPeople() { return state.people.slice(); }
  function getPersonById(id) { return state.people.find((p) => p.id === id) || null; }

  function getTransactions() { return state.transactions.slice(); }
  function getLending() { return state.lending.slice(); }
  function getBorrowing() { return state.borrowing.slice(); }

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
    const opening = Number(state.settings.openingBalance || 0);
    return opening + totalIncome() - totalExpense();
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

  function dailySeries(transactions, days = 30) {
    const arr = [];
    const end = Fmt.today();
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
    personTransactions,
    personOwedToUser,
    personUserOwes,
    spendingByCategory,
    dailySeries,

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
    removeLoanPayment
  };

  global.Store = Store;
})(window);
