(function () {
  'use strict';

  const AUTO_LOADS_PER_CYCLE = 2;
  let autoLoadsRemaining = AUTO_LOADS_PER_CYCLE;

  function configureLoadMore(node) {
    if (!node) return;

    const button = node.querySelector('button');
    const isAutoMode = autoLoadsRemaining > 0;

    if (isAutoMode) {
      node.setAttribute('hx-trigger', 'revealed once');
      node.dataset.loadMode = 'auto';
      autoLoadsRemaining -= 1;

      if (button) {
        button.disabled = true;
        button.textContent = 'Loading more…';
        button.style.display = 'none';
      }
    } else {
      node.setAttribute('hx-trigger', 'click');
      node.dataset.loadMode = 'manual';

      if (button) {
        button.disabled = false;
        button.textContent = 'Load more stories';
        button.style.display = '';
      }
    }

    if (window.htmx && typeof window.htmx.process === 'function') {
      window.htmx.process(node);
    }
  }

  function currentLoadMore() {
    return document.getElementById('load-more');
  }

  document.addEventListener('DOMContentLoaded', function () {
    configureLoadMore(currentLoadMore());
  });

  document.addEventListener('click', function (event) {
    const button = event.target.closest('#load-more button');
    if (!button) return;

    const wrap = button.closest('#load-more');
    if (wrap && wrap.dataset.loadMode === 'manual') {
      autoLoadsRemaining = AUTO_LOADS_PER_CYCLE;
    }
  }, true);

  document.body.addEventListener('htmx:afterSwap', function () {
    configureLoadMore(currentLoadMore());
  });
})();
