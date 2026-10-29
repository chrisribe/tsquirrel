const keepIndexed = new Set(require('../config/seo-keep-indexed.json').slugs || []);

// Thin-content pruning: stories without a published Deep Dive are noindexed once
// they are older than the grace window, unless Search Console shows impressions.
// Publishing a Deep Dive automatically restores indexing.
const GRACE_DAYS = 14;

function isStoryIndexable(story, { hasPublishedBrief = false, now = Date.now() } = {}) {
  if (!story || !story.slug) return false;
  if (hasPublishedBrief) return true;
  if (keepIndexed.has(story.slug)) return true;
  const ts = new Date(story.published_at || story.created_at || 0).getTime();
  return now - ts < GRACE_DAYS * 86400000;
}

module.exports = { isStoryIndexable, GRACE_DAYS, keepIndexed };
