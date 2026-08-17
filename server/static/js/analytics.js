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

  function emit(eventName, params) {
    try {
      window.gtag('event', eventName, params || {});
    } catch (_) {
      // no-op
    }
  }

  function mapToGa4(eventName, params) {
    const p = params || {};

    switch (eventName) {
      case 'story_view':
      case 'legacy_story_view':
        return {
          event: 'view_item',
          params: {
            item_id: p.story_slug || p.story_id || undefined,
            item_name: p.story_slug || undefined,
            item_category: p.category || (eventName === 'legacy_story_view' ? 'legacy' : undefined),
            source_count: p.source_count,
            tsq_origin_event: eventName,
          },
        };

      case 'story_open':
      case 'related_story_open':
      case 'legacy_story_open':
        return {
          event: 'select_item',
          params: {
            item_id: p.story_slug || p.story_id || undefined,
            item_name: p.story_slug || undefined,
            item_category: p.category || (eventName === 'legacy_story_open' ? 'legacy' : undefined),
            item_list_name: p.location || undefined,
            tsq_origin_event: eventName,
          },
        };

      case 'category_select':
      case 'tag_select':
      case 'tag_clear':
        return {
          event: 'select_content',
          params: {
            content_type: 'filter',
            item_category: p.category || undefined,
            item_variant: p.tag || undefined,
            method: eventName,
            location: p.location || undefined,
            tsq_origin_event: eventName,
          },
        };

      case 'source_open':
      case 'legacy_source_open':
      case 'outbound_click':
        return {
          event: 'select_content',
          params: {
            content_type: 'outbound_link',
            item_id: p.link_url || p.story_slug || undefined,
            item_name: p.source_name || p.link_domain || undefined,
            link_url: p.link_url || undefined,
            link_domain: p.link_domain || undefined,
            link_text: p.link_text || undefined,
            tsq_origin_event: eventName,
          },
        };

      case 'back_to_feed':
        return {
          event: 'select_content',
          params: {
            content_type: 'navigation',
            item_name: 'back_to_feed',
            location: p.location || undefined,
            tsq_origin_event: eventName,
          },
        };

      case 'feed_load_more':
        return {
          event: 'view_item_list',
          params: {
            item_list_name: 'story_feed',
            item_list_id: 'home_feed',
            stories_loaded: p.stories_loaded || 0,
            request_path: p.request_path || undefined,
            tsq_origin_event: eventName,
          },
        };

      default:
        return { event: eventName, params: p };
    }
  }

  function track(eventName, params) {
    const mapped = mapToGa4(eventName, params);
    emit(mapped.event, mapped.params);
  }

  function trackPageView(extra) {
    emit('page_view', {
      page_location: window.location.href,
      page_path: `${window.location.pathname}${window.location.search}`,
      page_title: document.title,
      page_type: pageTypeFromPath(window.location.pathname),
      ...(extra || {}),
    });
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
