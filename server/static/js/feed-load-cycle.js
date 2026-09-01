(function () {
  'use strict';

  const AUTO_LOADS_PER_CYCLE = 2;
  let autoLoadsRemaining = AUTO_LOADS_PER_CYCLE;
  let io = null;

  function currentLoadMore() {
    return document.getElementById('load-more');
  }

  function setButtonIdle(node) {
    const button = node && node.querySelector('button');
    if (!button) return;
    button.disabled = false;
    button.style.display = '';
    button.textContent = 'Load more stories';
  }

  function setButtonLoading(node) {
    const button = node && node.querySelector('button');
    if (!button) return;
    button.disabled = true;
    button.style.display = '';
    button.textContent = 'Loading more…';
  }

  function triggerLoad(node, mode) {
    if (!node || node.dataset.loading === '1') return;
    node.dataset.loading = '1';
    node.dataset.autoFired = '1';
    node.dataset.loadMode = mode;
    setButtonLoading(node);

    if (window.htmx && typeof window.htmx.trigger === 'function') {
      window.htmx.trigger(node, 'click');
      return;
    }

    node.dispatchEvent(new Event('click', { bubbles: true }));
  }

  function disconnectObserver() {
    if (io) {
      io.disconnect();
      io = null;
    }
  }

  function armObserver(node) {
    disconnectObserver();
    if (!node) return;

    node.dataset.loading = '0';
    node.dataset.loadMode = autoLoadsRemaining > 0 ? 'auto' : 'manual';
    setButtonIdle(node);

    if (autoLoadsRemaining <= 0 || typeof IntersectionObserver !== 'function') return;

    io = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry || !entry.isIntersecting) return;
      const target = entry.target;
      if (!target || target.dataset.autoFired === '1' || target.dataset.loading === '1') return;

      autoLoadsRemaining -= 1;
      triggerLoad(target, 'auto');
      disconnectObserver();
    }, { root: null, rootMargin: '220px 0px', threshold: 0.01 });

    io.observe(node);
  }

  document.addEventListener('DOMContentLoaded', function () {
    armObserver(currentLoadMore());
  });

  document.addEventListener('click', function (event) {
    const button = event.target.closest('#load-more button');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    const wrap = button.closest('#load-more');
    if (!wrap) return;

    wrap.dataset.autoFired = '1';
    autoLoadsRemaining = AUTO_LOADS_PER_CYCLE;
    triggerLoad(wrap, 'manual');
  }, true);

  document.body.addEventListener('htmx:afterRequest', function (event) {
    const path = event && event.detail && event.detail.pathInfo && event.detail.pathInfo.requestPath;
    if (!String(path || '').startsWith('/api/stories')) return;

    const node = currentLoadMore();
    if (node) node.dataset.loading = '0';
  });

  document.body.addEventListener('htmx:afterSwap', function () {
    armObserver(currentLoadMore());
  });
})();
