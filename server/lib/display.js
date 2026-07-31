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

module.exports = { CATEGORY_META, catMeta, catLabel, displaySourceName };
