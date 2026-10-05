(function () {
  'use strict';

  document.addEventListener('htmx:beforeSwap', function (event) {
    if (event.detail.target?.id === 'research-interest' &&
        event.detail.xhr.getResponseHeader('X-Research-Feedback') === 'true') {
      event.detail.shouldSwap = true;
    }
  });

  document.addEventListener('htmx:afterSwap', function (event) {
    if (event.detail.target?.id === 'research-interest') {
      document.getElementById('research-interest')?.focus({ preventScroll: true });
    }
  });

  function showFailure(event) {
    if (!event.detail.elt?.closest('#research-interest')) return;
    if (event.detail.xhr?.getResponseHeader('X-Research-Feedback') === 'true') return;
    const feedback = document.querySelector('[data-research-error]');
    if (feedback) feedback.textContent = 'We could not confirm your request. Check your connection and try again.';
  }
  document.addEventListener('htmx:sendError', showFailure);
  document.addEventListener('htmx:timeout', showFailure);
  document.addEventListener('htmx:responseError', showFailure);
})();
