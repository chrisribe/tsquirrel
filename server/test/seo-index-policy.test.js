const test = require('node:test');
const assert = require('node:assert');
const { isStoryIndexable, keepIndexed } = require('../services/SeoIndexPolicy');
const old = '2026-01-01T00:00:00Z';
test('deep dive keeps index', () => assert.equal(isStoryIndexable({ slug: 'x', published_at: old }, { hasPublishedBrief: true }), true));
test('old thin story noindexed', () => assert.equal(isStoryIndexable({ slug: 'zz-none', published_at: old }), false));
test('fresh story indexed during grace', () => assert.equal(isStoryIndexable({ slug: 'zz', published_at: new Date().toISOString() }), true));
test('GSC impression slug kept', () => {
  const slug = [...keepIndexed][0];
  assert.equal(isStoryIndexable({ slug, published_at: old }), true);
});
