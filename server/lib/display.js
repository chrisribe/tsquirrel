'use strict';

// Category display metadata — maps stored categories to squirrel-themed
// emoji labels + thumbnail treatments used across the views (matches mockups).

const CATEGORY_META = {
  AI:            { emoji: '🤖', thumb: '🧠', cls: 'thumb-nuts',  badge: 'badge-cat-nuts'  },
  Technology:    { emoji: '💻', thumb: '🤖', cls: 'thumb-nuts',  badge: 'badge-cat-nuts'  },
  World:         { emoji: '🌍', thumb: '🕊️', cls: 'thumb-world', badge: 'badge-cat-world' },
  Business:      { emoji: '💰', thumb: '💰', cls: 'thumb-acorn', badge: 'badge-cat-acorn' },
  Science:       { emoji: '🔭', thumb: '🚀', cls: 'thumb-sci',   badge: 'badge-cat-sci'   },
  Politics:      { emoji: '🏛️', thumb: '🏛️', cls: 'thumb-world', badge: 'badge-cat-world' },
  Sports:        { emoji: '⚽', thumb: '🏆', cls: 'thumb-nuts',  badge: 'badge-cat-nuts'  },
  Entertainment: { emoji: '🎤', thumb: '🎬', cls: 'thumb-fire',  badge: 'badge-cat-fire'  },
  Other:         { emoji: '🥜', thumb: '📰', cls: 'thumb-acorn', badge: 'badge-cat-acorn' },
};

function catMeta(category) {
  return CATEGORY_META[category] || CATEGORY_META.Other;
}

// "💻 Technology" style label for pills and badges
function catLabel(category) {
  const label = String(category || '').trim() || 'Other';
  return `${catMeta(label).emoji} ${label}`;
}

// Aggregator sources (Google Trends, etc.) don't publish the article — they
// just link to it. Showing "Google Trends (Canada)" as the source is
// misleading, since the actual outlet (bbc.com, cnn.com, ...) is right there
// in the URL. For aggregator-type sources, display the article's real
// publisher domain instead of the aggregator's name.
function displaySourceName(article) {
  if (article.source_type !== 'trends') return article.source_name;
  try {
    return new URL(article.url).hostname.replace(/^www\./, '');
  } catch (_) {
    return article.source_name;
  }
}

function secureUrl(url) {
  if (!url || typeof url !== 'string') return url;
  return url.replace(/^http:\/\//i, 'https://');
}

const HTML_ENTITIES = {
  amp: '&',
  apos: "'",
  gt: '>',
  hellip: '…',
  ldquo: '“',
  lsquo: '‘',
  mdash: '—',
  nbsp: ' ',
  ndash: '–',
  quot: '"',
  rdquo: '”',
  rsquo: '’',
  lt: '<',
};

function decodeHtmlEntities(value) {
  return String(value || '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (code[0] !== '#') return HTML_ENTITIES[code.toLowerCase()] ?? entity;
    const numeric = code[1].toLowerCase() === 'x'
      ? Number.parseInt(code.slice(2), 16)
      : Number.parseInt(code.slice(1), 10);
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 0x10FFFF) return entity;
    try {
      return String.fromCodePoint(numeric);
    } catch (_) {
      return entity;
    }
  });
}

function plainText(value) {
  let text = String(value || '');
  for (let pass = 0; pass < 2; pass += 1) {
    const decoded = decodeHtmlEntities(text);
    if (decoded === text) break;
    text = decoded;
  }
  return text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  CATEGORY_META,
  catMeta,
  catLabel,
  decodeHtmlEntities,
  displaySourceName,
  plainText,
  secureUrl,
};
