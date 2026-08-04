(function () {
  'use strict';

  if (typeof window.gtag !== 'function') return;

  function normalizeValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value !== '' && !Number.isNaN(Number(value))) return Number(value);
    return value;
  }

  function pageTypeFromPath(pathname) {
    if (pathname === '/') return 'home';
    if (pathname === '/archive') return 'archive';
    if (pathname.startsWith('/story/')) return 'story';
    if (pathname.startsWith('/admin')) return 'admin';
    if (/^\/[a-z0-9][a-z0-9-]+-\d+$/.test(pathname)) return 'legacy_story';
    return 'other';
  }

  function track(eventName, params) {
    try {
      window.gtag('event', eventName, params || {});
    } catch (_) {
      // no-op
    }
  }

  function trackPageView(extra) {
    const params = {
      page_location: window.location.href,
      page_path: `${window.location.pathname}${window.location.search}`,
      page_title: document.title,
      page_type: pageTypeFromPath(window.location.pathname),
      ...(extra || {}),
    };
    track('page_view', params);
  }

  window.tsqTrack = track;
  window.tsqTrackPageView = trackPageView;

  document.addEventListener('DOMContentLoaded', function () {
    trackPageView();
  });

  document.body.addEventListener('click', function (event) {
    const tracked = event.target.closest('[data-ga-event]');
    if (tracked) {
      const params = {};
      Object.entries(tracked.dataset).forEach(([key, value]) => {
        if (!key.startsWith('ga') || key === 'gaEvent') return;
        const snakeCaseKey = key
          .slice(2)
          .replace(/^[A-Z]/, m => m.toLowerCase())
          .replace(/[A-Z]/g, m => `_${m.toLowerCase()}`);
        params[snakeCaseKey] = normalizeValue(value);
      });
      track(tracked.dataset.gaEvent, params);
    }

    const anchor = event.target.closest('a[href]');
    if (!anchor) return;

    try {
      const url = new URL(anchor.href, window.location.origin);
      if (url.origin !== window.location.origin) {
        track('outbound_click', {
          link_url: url.href,
          link_domain: url.hostname,
          link_text: (anchor.textContent || '').trim().slice(0, 140),
          page_path: `${window.location.pathname}${window.location.search}`,
        });
      }
    } catch (_) {
      // ignore malformed URLs
    }
  }, true);

  document.body.addEventListener('htmx:afterRequest', function (event) {
    const path = event?.detail?.pathInfo?.requestPath || '';
    if (!path.startsWith('/api/stories')) return;

    const count = event?.detail?.xhr?.responseText
      ? (event.detail.xhr.responseText.match(/class=\"story-card\"/g) || []).length
      : 0;

    track('feed_load_more', {
      request_path: path,
      stories_loaded: count,
      page_path: `${window.location.pathname}${window.location.search}`,
    });
  });
})();
