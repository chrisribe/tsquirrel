'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeExtraContext, renderCitedBody } = require('../lib/extraContext');

test('normalizes a cited extra-context draft', () => {
  const content = normalizeExtraContext({
    title: 'The charge at your hotel is separate',
    body: 'The accommodation tax and day-visitor access fee are different charges. [S1]',
    researched_on: '2026-09-08',
    ai_assisted: true,
    sources: [{
      id: 'S1',
      title: 'Venice access-fee FAQ',
      url: 'https://cda.veneziaunica.it/en/faq',
      accessed_on: '2026-09-08',
      evidence_excerpt: 'The access fee is separate from the accommodation tax.',
    }],
  });

  assert.equal(content.sources[0].id, 'S1');
  assert.equal(content.ai_assisted, true);
});

test('rejects a citation without a matching source', () => {
  assert.throws(() => normalizeExtraContext({
    title: 'A useful clarification',
    body: 'This needs a real source. [S2]',
    researched_on: '2026-09-08',
    ai_assisted: true,
    sources: [{ id: 'S1', title: 'Source', url: 'https://example.com', accessed_on: '2026-09-08' }],
  }), /citation \[S2\]/i);
});

test('escapes prose while rendering only validated citation links', () => {
  const rendered = renderCitedBody('<img src=x onerror=alert(1)> [S1]', [{ id: 'S1', title: 'Source', url: 'https://example.com' }]);
  assert.match(rendered, /&lt;img/);
  assert.match(rendered, /href="https:\/\/example\.com"/);
  assert.doesNotMatch(rendered, /<img/);
});
