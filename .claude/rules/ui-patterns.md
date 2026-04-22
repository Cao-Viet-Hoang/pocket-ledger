# UI patterns — Pocket Ledger

Reusable shapes. When you add a new page, prefer composing these over introducing a new layout.

## Page scaffold

```js
/**
 * Short description of this page.
 */
(function (global) {
  'use strict';

  function render(container) {
    container.innerHTML = `
      <div class="page">
        <!-- sections -->
      </div>
    `;

    // 1. read values from Store selectors
    // 2. wire event listeners
    // 3. do NOT call Icons.render / I18n.applyTranslations — the router does it
  }

  global.Pages = global.Pages || {};
  global.Pages.myRoute = { render };
})(window);
```

Registering the route: add `'myRoute'` to `ROUTES` in `router.js`, add the sidebar `<a data-route>` in `index.html`, add `nav.myRoute` + `page.myRoute.subtitle` to both locale files.

## Hero balance (top of page)

```html
<section class="hero-balance">
  <span class="hero-label">
    <span data-icon="wallet"></span>
    <span data-i18n="dash.currentBalance">Current balance</span>
  </span>
  <div class="hero-amount">₫…</div>
  <div class="hero-meta">
    <div class="hero-meta-item">
      <span class="hero-meta-label">…</span>
      <span class="hero-meta-value">…</span>
    </div>
  </div>
</section>
```

Override gradient with an inline `style="background:linear-gradient(…)"` only when the page needs a distinct accent (Accounts uses blue, Savings uses purple).

## Stat cards row

```html
<section class="grid grid-4">
  <div class="stat-card">
    <div class="stat-card-head">
      <span class="circle-icon income" data-icon="trending-up"></span>
      <span class="badge badge-income">…</span>
    </div>
    <div>
      <div class="stat-label">…</div>
      <div class="stat-value small">…</div>
      <div class="stat-meta text-muted">…</div>
    </div>
  </div>
</section>
```

`grid grid-3`, `grid grid-4`, `grid grid-2`, `grid grid-2-1` are available. Pick the closest — don't invent grid sizes.

## Toolbar + filter chips

```html
<section class="section-header">
  <div class="chip-group">
    <button class="chip is-active" data-filter="all">All</button>
    <button class="chip" data-filter="active">Active</button>
  </div>
  <div class="actions">
    <button class="btn btn-primary">…</button>
  </div>
</section>
```

Filter state is a **module-local mutable object** (see `lending.js`, `transactions.js`, `savings.js`). It persists across renders within the session and resets on reload.

## Modal / form (in `components/forms.js`)

All create/edit flows go through `Forms.*`:

```js
Modal.open({
  title: …,
  subtitle: …,
  bodyHTML: `<div class="form-group">…</div>`,
  actions: [
    { label: I18n.t('action.cancel'), variant: 'secondary' },
    { label: I18n.t('action.save'), variant: 'primary', keepOpen: true, onClick: async () => { … } }
  ]
});
```

`keepOpen: true` is required on the primary action so the modal stays open for validation errors. Call `Modal.close()` manually after a successful save.

Money inputs use:

```html
<div class="amount-input">
  <span class="currency">${Store.currency.symbol}</span>
  <input type="text" placeholder="0" id="…" autocomplete="off"/>
</div>
```

Then call `wireAmountInput(input)` inside `forms.js` (it's not exported — keep it local). The handler formats on every keystroke using `toLocaleString('en-US')` and strips non-digits.

## Confirm dialog

```js
Forms.confirm({
  title: I18n.t('action.delete.foo'),
  message: I18n.t('confirm.deleteFoo'),
  confirmLabel: I18n.t('action.delete'),
  variant: 'danger',
  onConfirm: () => Store.deleteFoo(id)
});
```

Use for every destructive action. Don't prompt with `window.confirm`.

## Toasts

```js
Toast.show(I18n.t('toast.saved'));
```

Two keys cover almost every case: `toast.saved` and `toast.deleted`. Add a new one only if neither fits.

## Icons & translations inside dynamic content

After you replace inner HTML of a container that contains dynamic `data-icon` / `data-i18n`, call:

```js
Icons.render(container);
I18n.applyTranslations(container);
```

The `transactions.js` row updater and the savings filter re-render show the pattern. If you're re-rendering the **whole page** via `Router.renderCurrent()`, the router handles it for you.

## Empty states

```html
<div class="empty">
  <div class="empty-icon" data-icon="…"></div>
  <h3>${I18n.t('…empty')}</h3>
  <p class="text-muted">${I18n.t('…emptyHint')}</p>
</div>
```

Use `grid-column: 1/-1` (inline style) when placing an empty state inside a grid.
