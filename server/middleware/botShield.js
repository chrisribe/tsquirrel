'use strict';

// Anonymous traffic shield (single-instance in-memory)
// - Fast-fails known junk probe paths aggressively
// - Rate-limits ONLY repeated odd-access patterns (not normal browsing)

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
  if (pathname.includes('/wp-admin') || pathname.includes('/wp-login')) return true;
  if (pathname.startsWith('/xmlrpc')) return true;
  if (pathname.startsWith('/cgi-bin/')) return true;
  if (pathname.startsWith('/.env')) return true;
  if (pathname.includes('/phpmyadmin')) return true;
  return false;
}

function looksOddHomepageQuery(query) {
  const tag = String(query?.tag || '').trim().toLowerCase();
  const q = String(query?.q || '').trim().toLowerCase();

  if (!tag && !q) return false;

  const v = tag || q;
  // keep this intentionally conservative: only unusual/noisy query shapes.
  if (v.length > 40) return true;
  if (/[%<>{}\\]/.test(v)) return true;
  if (/\b(?:free\s+live\s+stream|watch\s*live|xxx|casino|viagra|hack|crack)\b/i.test(v)) return true;
  return false;
}

function isOddAccess(pathname, query) {
  // Normal user paths: never treated as odd.
  if (pathname === '/') {
    return looksOddHomepageQuery(query);
  }
  if (pathname.startsWith('/story/')) return false;
  if (pathname.startsWith('/section/')) return false;
  if (pathname === '/archive' || pathname === '/about' || pathname === '/contact' || pathname === '/privacy-policy' || pathname === '/terms-of-service') {
    return false;
  }

  // Public paths outside normal browsing surfaces are treated as odd.
  // (admin/auth/api excluded earlier in middleware flow)
  return true;
}

function oddRule() {
  return {
    windowSec: envInt('TS_ODD_WINDOW_SEC', 60),
    max: envInt('TS_ODD_MAX', 20),
    uniqueMax: envInt('TS_ODD_UNIQUE_MAX', 12),
  };
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

  // Only limit repeated ODD accesses.
  if (!isOddAccess(pathname, req.query || {})) {
    return next();
  }

  const ip = getClientIp(req);
  const rule = oddRule();
  const key = `odd:${ip}`;
  const now = Date.now();
  const fingerprint = `${pathname}?tag=${String(req.query?.tag || '')}&q=${String(req.query?.q || '')}`;

  let row = buckets.get(key);
  if (!row || now > row.resetAt) {
    row = { count: 0, resetAt: now + (rule.windowSec * 1000), unique: new Set() };
  }

  row.count += 1;
  row.unique.add(fingerprint);
  buckets.set(key, row);

  const overCount = row.count > rule.max;
  const overUnique = row.unique.size > rule.uniqueMax;

  if (overCount || overUnique) {
    const retryAfter = Math.max(1, Math.ceil((row.resetAt - now) / 1000));
    res.set('Retry-After', String(retryAfter));
    res.set('Cache-Control', 'private, no-store');
    return res.status(429).json({ error: 'rate_limited', retryAfter });
  }

  return next();
}

module.exports = { botShield };
