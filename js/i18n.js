/**
 * Minimal i18n.
 * Loads JSON dictionaries from /locales/{lang}.json.
 * Translates elements that have `data-i18n` attribute.
 * Persists language in localStorage.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'pl.lang';
  const SUPPORTED = ['en', 'vi'];
  const DEFAULT_LANG = 'en';

  const state = {
    lang: DEFAULT_LANG,
    dictionaries: {}
  };

  const listeners = new Set();

  async function loadLocale(lang) {
    if (state.dictionaries[lang]) return state.dictionaries[lang];
    const res = await fetch(`locales/${lang}.json`);
    if (!res.ok) throw new Error('Failed to load locale ' + lang);
    const data = await res.json();
    state.dictionaries[lang] = data;
    return data;
  }

  function interpolate(template, vars) {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] != null ? vars[key] : `{${key}}`));
  }

  function t(key, vars) {
    const dict = state.dictionaries[state.lang] || {};
    const fallback = state.dictionaries[DEFAULT_LANG] || {};
    const raw = dict[key] != null ? dict[key] : (fallback[key] != null ? fallback[key] : key);
    return interpolate(raw, vars);
  }

  function applyTranslations(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', t(key));
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria');
      el.setAttribute('aria-label', t(key));
    });
    document.documentElement.setAttribute('lang', state.lang);
  }

  async function setLang(lang) {
    if (!SUPPORTED.includes(lang)) lang = DEFAULT_LANG;
    await loadLocale(lang);
    state.lang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
    applyTranslations();
    listeners.forEach((cb) => {
      try { cb(lang); } catch (err) { console.error(err); }
    });
  }

  function getLang() {
    return state.lang;
  }

  function onChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  async function init() {
    const saved = (() => {
      try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
    })();
    const initial = SUPPORTED.includes(saved) ? saved : DEFAULT_LANG;
    await loadLocale(DEFAULT_LANG); // fallback dictionary
    await setLang(initial);
  }

  global.I18n = { init, t, setLang, getLang, onChange, applyTranslations };
})(window);
