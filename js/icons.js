/**
 * SVG icon registry.
 * All icons use `currentColor` stroke so they inherit from the parent's text color.
 * Usage:
 *   <span data-icon="wallet"></span>
 *   Icons.render(element);            // render all descendants
 *   Icons.get('wallet');              // returns SVG string
 */
(function (global) {
  'use strict';

  const svg = (path, { viewBox = '0 0 24 24', fill = 'none', strokeWidth = 1.75 } = {}) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="${fill}" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

  const ICONS = {
    // Brand
    wallet: svg('<path d="M3 7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v2"/><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5"/><circle cx="16" cy="14" r="1.2" fill="currentColor" stroke="none"/>'),

    // Navigation
    dashboard: svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
    exchange: svg('<path d="M7 7h13"/><path d="m16 3 4 4-4 4"/><path d="M17 17H4"/><path d="m8 21-4-4 4-4"/>'),
    'hand-coin': svg('<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/>'),
    'hand-receive': svg('<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/><path d="M7 15h.01"/><path d="M11 15h2"/>'),
    people: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.2 2.7-5.5 6-5.5s6 2.3 6 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M15 14.5c2.5.2 5 1.9 5 4.5"/>'),
    chart: svg('<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/><circle cx="7" cy="15" r="1.3" fill="currentColor" stroke="none"/><circle cx="11" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="14" cy="13" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="6" r="1.3" fill="currentColor" stroke="none"/>'),

    // UI
    menu: svg('<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h10"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.3-3.3"/>'),
    bell: svg('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/>'),
    plus: svg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
    minus: svg('<path d="M5 12h14"/>'),
    close: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    check: svg('<path d="M20 6 9 17l-5-5"/>'),
    edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
    trash: svg('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/>'),
    filter: svg('<path d="M4 5h16l-6 8v6l-4-2v-4Z"/>'),
    chevronRight: svg('<path d="m9 6 6 6-6 6"/>'),
    chevronDown: svg('<path d="m6 9 6 6 6-6"/>'),
    chevronUp: svg('<path d="m6 15 6-6 6 6"/>'),
    'arrow-up-right': svg('<path d="M7 17 17 7"/><path d="M8 7h9v9"/>'),
    'arrow-down-left': svg('<path d="M17 7 7 17"/><path d="M16 17H7V8"/>'),
    'arrow-up': svg('<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>'),
    'arrow-down': svg('<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>'),
    calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3 10h18"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    alert: svg('<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.7 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v5h1"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    phone: svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6A2 2 0 0 1 22 16.9Z"/>'),
    note: svg('<path d="M4 4h12l4 4v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M14 4v4h4"/><path d="M8 13h8"/><path d="M8 17h5"/>'),

    // Categories
    briefcase: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>'),
    gift: svg('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5c1.7 0 4.5 2 4.5 5"/><path d="M16.5 8a2.5 2.5 0 0 0 0-5c-1.7 0-4.5 2-4.5 5"/>'),
    bowl: svg('<path d="M3 11h18"/><path d="M4 11a8 8 0 0 0 16 0"/><path d="M9 7c.5-1 2-2 3-2"/><path d="M13 7c.5-1 2-2 3-2"/>'),
    car: svg('<path d="M5 17h14l-1.5-6.5A3 3 0 0 0 14.6 8H9.4a3 3 0 0 0-2.9 2.5L5 17Z"/><circle cx="8" cy="18" r="2"/><circle cx="16" cy="18" r="2"/>'),
    fuel: svg('<path d="M3 22h12"/><path d="M4 9h10"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>'),
    bag: svg('<path d="M5 8h14l-1 12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
    receipt: svg('<path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h4"/>'),
    music: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
    heart: svg('<path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 22l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/>'),
    'trending-up': svg('<path d="M3 17 9 11l4 4 8-8"/><path d="M14 7h7v7"/>'),
    'trending-down': svg('<path d="M3 7 9 13l4-4 8 8"/><path d="M14 17h7v-7"/>'),
    coins: svg('<circle cx="8" cy="8" r="5.5"/><path d="M15.5 5.5A5.5 5.5 0 1 1 16 16.5"/><path d="M11.5 13.5A5.5 5.5 0 1 1 16 21"/>'),
    scale: svg('<path d="M12 3v18"/><path d="M5 21h14"/><path d="M6 8h12"/><path d="M6 8 3 14a3 3 0 0 0 6 0Z"/><path d="m18 8-3 6a3 3 0 0 0 6 0Z"/>'),
    'piggy-bank': svg('<path d="M10 5a1 1 0 0 1 1-1h2a1 1 0 0 1 0 2h-2a1 1 0 0 1-1-1Z"/><path d="M7.5 8C4.5 8 2 10.7 2 14s2.5 6 5.5 6h9c3 0 5.5-2.7 5.5-6 0-1.7-.7-3.2-1.8-4.3"/><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/><path d="M2 12H1"/><path d="M22 12h-1"/><path d="M7 20v2"/><path d="M17 20v2"/>'),
    download: svg('<path d="M12 3v12"/><path d="m6 11 6 6 6-6"/><path d="M4 19h16"/>'),
    upload: svg('<path d="M12 21V9"/><path d="m6 13 6-6 6 6"/><path d="M4 5h16"/>'),
    'more-horizontal': svg('<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>'),

    // Accounts & Savings
    bank: svg('<path d="M3 21h18"/><path d="M3 10h18"/><path d="M12 3 2 10h20Z"/><path d="M5 10v8"/><path d="M9 10v8"/><path d="M15 10v8"/><path d="M19 10v8"/>'),
    smartphone: svg('<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M12 18h.01"/>'),
    vault: svg('<rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5v7"/><path d="M8.5 12h7"/><path d="M22 8h-1"/><path d="M22 16h-1"/><path d="M6 20v1"/><path d="M18 20v1"/>'),
    'arrow-left-right': svg('<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>'),
    percent: svg('<circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M20 4 4 20"/>')
  };

  function get(name) {
    return ICONS[name] || '';
  }

  function render(root) {
    const scope = root || document;
    const nodes = scope.querySelectorAll('[data-icon]');
    nodes.forEach((node) => {
      const name = node.getAttribute('data-icon');
      const already = node.firstElementChild && node.firstElementChild.tagName === 'svg';
      if (!name || already) return;
      const markup = get(name);
      if (markup) node.innerHTML = markup;
    });
  }

  global.Icons = { get, render };
})(window);
