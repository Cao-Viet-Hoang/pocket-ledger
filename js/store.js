/**
 * Data store.
 *
 * Responsibility in UI-preview stage:
 *   - Load mock JSON data from /data.
 *   - Expose computed selectors (totals, balances, lookups).
 *
 * All mutations (add/edit/delete) are intentionally NOT implemented here yet —
 * this file is a read-only facade so the UI can be reviewed with realistic data
 * before we wire up persistence.
 */
(function (global) {
  'use strict';

  const state = {
    loaded: false,
    categories: [],
    people: [],
    transactions: [],
    lending: [],
    borrowing: [],
    settings: {}
  };

  // ---- Loading -----------------------------------------------------------

  async function loadJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error('Failed to load ' + path);
    return res.json();
  }

  async function load() {
    const [categories, people, transactions, lending, borrowing, settings] = await Promise.all([
      loadJSON('data/categories.json'),
      loadJSON('data/people.json'),
      loadJSON('data/transactions.json'),
      loadJSON('data/lending.json'),
      loadJSON('data/borrowing.json'),
      loadJSON('data/settings.json')
    ]);
    state.categories = categories;
    state.people = people;
    state.transactions = transactions;
    state.lending = lending;
    state.borrowing = borrowing;
    state.settings = settings;
    state.loaded = true;
  }

  // ---- Selectors ---------------------------------------------------------

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
      // include overdue (< 0) and within limitDays
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

  // Grouped spending by category
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

  // Daily income/expense series
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

  // ---- Facade ------------------------------------------------------------

  const Store = {
    load,
    get currency() { return state.settings.currency || { code: 'VND', symbol: '₫', position: 'suffix', decimals: 0 }; },
    get openingBalance() { return Number(state.settings.openingBalance || 0); },

    getCategories,
    getCategoryById,
    getPeople,
    getPersonById,
    getTransactions,
    getLending,
    getBorrowing,

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
    dailySeries
  };

  global.Store = Store;
})(window);
