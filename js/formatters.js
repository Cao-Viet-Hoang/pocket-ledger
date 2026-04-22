/**
 * Currency, date and number formatting helpers.
 * Currency config is provided by Store (from settings.json).
 */
(function (global) {
  'use strict';

  function formatAmount(value, options = {}) {
    const currency = (global.Store && global.Store.currency) || {
      code: 'VND',
      symbol: '₫',
      position: 'suffix',
      decimals: 0
    };
    const { signed = false, withSymbol = true, absolute = false } = options;

    const num = Number(value) || 0;
    const abs = Math.abs(num);
    const formatted = abs.toLocaleString('en-US', {
      minimumFractionDigits: currency.decimals,
      maximumFractionDigits: currency.decimals
    });

    let body = formatted;
    if (withSymbol) {
      body = currency.position === 'prefix'
        ? `${currency.symbol}${formatted}`
        : `${formatted} ${currency.symbol}`;
    }

    if (absolute) return body;
    if (signed) {
      if (num > 0) return `+${body}`;
      if (num < 0) return `-${body}`;
      return body;
    }
    return num < 0 ? `-${body}` : body;
  }

  function formatCompact(value) {
    const currency = (global.Store && global.Store.currency) || { symbol: '₫', position: 'suffix' };
    const num = Math.abs(Number(value) || 0);
    let out;
    if (num >= 1_000_000_000) out = (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
    else if (num >= 1_000_000) out = (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    else if (num >= 1_000) out = (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    else out = String(num);
    return currency.position === 'prefix' ? `${currency.symbol}${out}` : `${out} ${currency.symbol}`;
  }

  const MONTH_NAMES = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    vi: ['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12']
  };
  const MONTH_LONG = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    vi: ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']
  };

  function parseDate(value) {
    if (value instanceof Date) return value;
    if (typeof value !== 'string') return new Date(value);
    // Accept yyyy-mm-dd strings; treat as local date
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return new Date(value);
  }

  function today() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function startOfDay(date) {
    const d = parseDate(date);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function daysBetween(a, b) {
    const A = startOfDay(a).getTime();
    const B = startOfDay(b).getTime();
    return Math.round((B - A) / 86_400_000);
  }

  function formatDate(value, lang = 'en') {
    const d = parseDate(value);
    const day = String(d.getDate()).padStart(2, '0');
    const mon = MONTH_NAMES[lang] ? MONTH_NAMES[lang][d.getMonth()] : d.getMonth() + 1;
    const year = d.getFullYear();
    return lang === 'vi' ? `${day} ${mon} ${year}` : `${mon} ${day}, ${year}`;
  }

  function formatDateShort(value, lang = 'en') {
    const d = parseDate(value);
    const day = String(d.getDate()).padStart(2, '0');
    const mon = MONTH_NAMES[lang] ? MONTH_NAMES[lang][d.getMonth()] : d.getMonth() + 1;
    return lang === 'vi' ? `${day} ${mon}` : `${mon} ${day}`;
  }

  function formatMonth(value, lang = 'en') {
    const d = parseDate(value);
    return MONTH_LONG[lang][d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatRelative(value, lang = 'en') {
    const diff = daysBetween(today(), value);
    const t = global.I18n ? global.I18n.t : (k) => k;
    if (diff === 0) return t('time.today');
    if (diff === -1) return t('time.yesterday');
    if (diff < 0) return t('time.daysAgo', { n: Math.abs(diff) });
    if (diff === 0) return t('time.today');
    return formatDateShort(value, lang);
  }

  function formatDueHint(dueDate, lang = 'en') {
    const diff = daysBetween(today(), dueDate);
    const t = global.I18n ? global.I18n.t : (k) => k;
    if (diff === 0) return { text: t('time.dueToday'), tone: 'warning' };
    if (diff < 0) return { text: t('time.overdueBy', { n: Math.abs(diff) }), tone: 'expense' };
    if (diff <= 7) return { text: t('time.dueIn', { n: diff }), tone: 'warning' };
    return { text: formatDate(dueDate, lang), tone: 'muted' };
  }

  function initials(name) {
    if (!name) return '?';
    const parts = String(name).trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  global.Fmt = {
    formatAmount,
    formatCompact,
    formatDate,
    formatDateShort,
    formatMonth,
    formatRelative,
    formatDueHint,
    parseDate,
    daysBetween,
    today,
    initials
  };
})(window);
