'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function categoryToSlug(category = '') {
  return String(category)
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function findCategoryBySlug(categories = [], slug = '', indexableCategories = []) {
  const target = String(slug || '').trim().toLowerCase();
  if (!target) return null;

  for (const row of indexableCategories) {
    if (categoryToSlug(row.category) === target) return { category: row.category };
  }

  const activeMatch = categories.find(c => categoryToSlug(c.category) === target);
  if (activeMatch) return { category: activeMatch.category };

  return null;
}

test('findCategoryBySlug resolves indexable categories even when not active in 48h list', () => {
  const categories = [{ category: 'World' }, { category: 'AI' }];
  const indexable = [{ category: 'Business' }, { category: 'Politics' }];

  const match = findCategoryBySlug(categories, 'business', indexable);
  assert.deepEqual(match, { category: 'Business' });
});

test('findCategoryBySlug rejects non-indexable and non-active slugs', () => {
  const categories = [{ category: 'World' }, { category: 'AI' }];
  const indexable = [{ category: 'Business' }, { category: 'Politics' }];

  const match = findCategoryBySlug(categories, 'not-a-real-cat', indexable);
  assert.equal(match, null);
});

test('indexability gate should require both in SEO list and in published category set', () => {
  const category = 'Business';
  const allPublishedCategories = [{ category: 'World' }, { category: 'AI' }];
  const indexableCategories = [{ category: 'Business' }, { category: 'Politics' }];

  const hasAnyPublished = allPublishedCategories.some((c) => c.category === category);
  const indexable = hasAnyPublished && indexableCategories.some((c) => c.category === category);

  assert.equal(indexable, false);
});
