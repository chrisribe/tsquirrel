'use strict';

// Category display metadata — maps stored categories to squirrel-themed
// emoji labels + thumbnail treatments used across the views (matches mockups).

const CATEGORY_META = {
  Technology:    { emoji: '💻', thumb: '🤖', cls: 'thumb-nuts',  badge: 'badge-cat-nuts'  },
  World:         { emoji: '🌍', thumb: '🕊️', cls: 'thumb-world', badge: 'badge-cat-world' },
  Business:      { emoji: '💰', thumb: '💰', cls: 'thumb-acorn', badge: 'badge-cat-acorn' },
  Science:       { emoji: '🔭', thumb: '🚀', cls: 'thumb-sci',   badge: 'badge-cat-sci'   },
  Politics:      { emoji: '🏛️', thumb: '🏛️', cls: 'thumb-world', badge: 'badge-cat-world' },
  Sports:        { emoji: '⚽', thumb: '🏆', cls: 'thumb-nuts',  badge: 'badge-cat-nuts'  },
  Entertainment: { emoji: '🎤', thumb: '🎬', cls: 'thumb-fire',  badge: 'badge-cat-fire'  },
  Other:         { emoji: '🌰', thumb: '📰', cls: 'thumb-acorn', badge: 'badge-cat-acorn' },
};

function catMeta(category) {
  return CATEGORY_META[category] || CATEGORY_META.Other;
}

// "💻 Technology" style label for pills and badges
function catLabel(category) {
  return `${catMeta(category).emoji} ${category || 'News'}`;
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

const TAKE_BANNED_RE = /(multiple outlets are converging on the same facts|reinforcing the direction of this story|delivery and governance risk|review cadence|signal changes|staffing and legal controls|operational and legal risk)/i;

function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function isTitleParrot(take, title) {
  const t = String(take || '').trim().toLowerCase();
  const s = String(title || '').trim().toLowerCase();
  return t && s && t.startsWith(s);
}

function hasStrongTake(item) {
  const take = String((item && item.squirrel_take) || '').trim();
  const title = String((item && item.title) || '').trim();
  if (!take) return false;
  if (wordCount(take) < 8) return false;
  if (TAKE_BANNED_RE.test(take)) return false;
  if (isTitleParrot(take, title)) return false;
  return true;
}

function secureUrl(url) {
  if (!url || typeof url !== 'string') return url;
  return url.replace(/^http:\/\//i, 'https://');
}

module.exports = { CATEGORY_META, catMeta, catLabel, displaySourceName, hasStrongTake, secureUrl };
