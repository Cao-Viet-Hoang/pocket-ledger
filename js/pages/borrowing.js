/**
 * Borrowing page — money the user owes others.
 */
(function (global) {
  'use strict';

  const filterState = { status: 'all', historyView: 'recent' };

  function render(container) {
    LoanView.render(container, {
      collection: Store.getBorrowing(),
      kind: 'borrowing',
      filterState,
      totalLabel: I18n.t('dash.payable'),
      totalIcon: 'hand-receive',
      totalTone: 'warning',
      newButtonLabel: I18n.t('loan.newDebt'),
      remainingLabel: I18n.t('loan.remaining'),
      paidLabel: I18n.t('loan.paid'),
      historyLabel: I18n.t('loan.history')
    });
  }

  global.Pages = global.Pages || {};
  global.Pages.borrowing = { render };
})(window);
