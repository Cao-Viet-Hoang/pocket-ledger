/**
 * Lending page — money others owe the user.
 * Shares rendering helpers with the borrowing page via `LoanView`.
 */
(function (global) {
  'use strict';

  const filterState = { status: 'all', historyView: 'recent' };

  function render(container) {
    LoanView.render(container, {
      collection: Store.getLending(),
      kind: 'lending',
      filterState,
      totalLabel: I18n.t('dash.receivable'),
      totalIcon: 'hand-coin',
      totalTone: 'info',
      newButtonLabel: I18n.t('loan.newLoan'),
      remainingLabel: I18n.t('loan.remaining'),
      paidLabel: I18n.t('loan.collected'),
      historyLabel: I18n.t('loan.history')
    });
  }

  global.Pages = global.Pages || {};
  global.Pages.lending = { render };
})(window);
