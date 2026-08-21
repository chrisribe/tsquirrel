'use strict';

const crypto = require('crypto');

function tokenize(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// URL-safe slug from a title, with a short random suffix to guarantee uniqueness.
// Supports optional enrichment terms so short titles can still produce SEO-friendly slugs.
function slugify(text, { maxLength = 120, minWords = 0, extraTerms = [], suffixBytes = 3 } = {}) {
  const dedupe = new Set();
  const words = [];

  const pushWords = (raw) => {
    for (const token of tokenize(raw)) {
      if (dedupe.has(token)) continue;
      dedupe.add(token);
      words.push(token);
    }
  };

  pushWords(text);

  if (words.length < minWords) {
    for (const term of Array.isArray(extraTerms) ? extraTerms : [extraTerms]) {
      pushWords(term);
      if (words.length >= minWords) break;
    }
  }

  let base = words.join('-');
  if (!base) base = 'story';

  if (Number.isFinite(maxLength) && maxLength > 0) {
    base = base.slice(0, maxLength).replace(/-+$/g, '');
    if (!base) base = 'story';
  }

  return `${base}-${crypto.randomBytes(suffixBytes).toString('hex')}`;
}

module.exports = { slugify };
