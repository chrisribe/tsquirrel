'use strict';

// Lightweight anonymous traffic shield (single-instance in-memory)
// - Fast-fails common junk probe paths
// - Applies per-IP throttles with stricter limits on bot-heavy paths

const buckets = new Map();

function envInt(name, fallback) {
  const raw = process.env[name];
  const n = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const CLEANUP_MS = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of buckets) {
    if (now > value.resetAt) buckets.delete(key);
  }
}, CLEANUP_MS).unref?.();

function getClientIp(req) {
  const cfip = String(req.headers['cf-connecting-ip'] || '').trim();
  if (cfip) return cfip;
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (xff) return xff;
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

function isAnonymous(req) {
  const uid = req.session?.userId || req.session?.user?.id || req.user?.id || null;
  return !uid;
}

function isJunkPath(pathname) {
  if (pathname === '/null') return true;
  if (pathname.startsWith('/_data/')) return true;
  if (pathname.startsWith('/wp-') || pathname.startsWith('/wp/')) return true;
  if (pathname.startsWith('/xmlrpc')) return true;
  if (pathname.startsWith('/cgi-bin/')) return true;
  if (pathname.startsWith('/.env')) return true;
  if (pathname.includes('/phpmyadmin')) return true;
  return false;
}

function decideLimit(pathname, query) {
  // Defaults tuned for anonymous read traffic.
  const defaultMax = envInt('TS_ANON_DEFAULT_MAX', 60);
  const defaultWindowSec = envInt('TS_ANON_DEFAULT_WINDOW_SEC', 60);

  const homepageMax = envInt('TS_ANON_HOME_MAX', 10);
  const homepageWindowSec = envInt('TS_ANON_HOME_WINDOW_SEC', 30);

  const storyMax = envInt('TS_ANON_STORY_MAX', 24);
  const storyWindowSec = envInt('TS_ANON_STORY_WINDOW_SEC', 60);

  const sectionMax = envInt('TS_ANON_SECTION_MAX', 20);
  const sectionWindowSec = envInt('TS_ANON_SECTION_WINDOW_SEC', 60);

  if (pathname === '/' && (Object.prototype.hasOwnProperty.call(query || {}, 'tag') || Object.prototype.hasOwnProperty.call(query || {}, 'q'))) {
    return { max: homepageMax, windowSec: homepageWindowSec, scope: 'home-query' };
  }
  if (pathname === '/') {
    return { max: homepageMax * 2, windowSec: homepageWindowSec, scope: 'home' };
  }
  if (pathname.startsWith('/story/')) {
    return { max: storyMax, windowSec: storyWindowSec, scope: 'story' };
  }
  if (pathname.startsWith('/section/')) {
    return { max: sectionMax, windowSec: sectionWindowSec, scope: 'section' };
  }

  return { max: defaultMax, windowSec: defaultWindowSec, scope: 'default' };
}

function botShield(req, res, next) {
  const method = String(req.method || '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return next();

  const pathname = String(req.path || '/').toLowerCase();

  // Fast-fail obvious junk probes before route/DB work.
  if (isJunkPath(pathname)) {
    res.set('Cache-Control', 'public, max-age=120');
    return res.status(410).type('text/plain').send('Gone');
  }

  // Focus on anonymous/public traffic only.
  if (!isAnonymous(req)) return next();

  // Skip auth/admin/api so legitimate workflows are unaffected.
  if (pathname.startsWith('/admin') || pathname.startsWith('/auth') || pathname.startsWith('/api/')) {
    return next();
  }

  const ip = getClientIp(req);
  const rule = decideLimit(pathname, req.query || {});
  const key = `${rule.scope}:${ip}`;
  const now = Date.now();

  let row = buckets.get(key);
  if (!row || now > row.resetAt) {
    row = { count: 0, resetAt: now + (rule.windowSec * 1000) };
  }

  row.count += 1;
  buckets.set(key, row);

  if (row.count > rule.max) {
    const retryAfter = Math.max(1, Math.ceil((row.resetAt - now) / 1000));
    res.set('Retry-After', String(retryAfter));
    res.set('Cache-Control', 'private, no-store');
    return res.status(429).json({ error: 'rate_limited', retryAfter });
  }

  return next();
}

module.exports = { botShield };
