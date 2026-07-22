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

module.exports = { CATEGORY_META, catMeta, catLabel };
