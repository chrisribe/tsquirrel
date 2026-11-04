'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const StoryService = require('../services/StoryService');

const svc = Object.create(StoryService.prototype);
const ok = { heading: 'Background: X', text: 'X is a politician.', refs: [{ title: 'X', url: 'https://en.wikipedia.org/wiki/X' }] };

test('null background allowed', () => assert.equal(svc._normalizeBriefBackground(null), null));
test('valid wikipedia + worldbank refs pass', () => {
  const out = svc._normalizeBriefBackground({ ...ok, refs: [...ok.refs, { title: 'WB', url: 'https://data.worldbank.org/country/gbr' }] });
  assert.equal(out.refs.length, 2);
});
test('non-allowlisted host rejected', () => assert.throws(() => svc._normalizeBriefBackground({ ...ok, refs: [{ title: 'e', url: 'https://evil.example/wiki' }] })));
test('http rejected', () => assert.throws(() => svc._normalizeBriefBackground({ ...ok, refs: [{ title: 'X', url: 'http://en.wikipedia.org/wiki/X' }] })));
test('lookalike host rejected', () => assert.throws(() => svc._normalizeBriefBackground({ ...ok, refs: [{ title: 'X', url: 'https://notwikipedia.org/x' }] })));
test('uncited rejected', () => assert.throws(() => svc._normalizeBriefBackground({ ...ok, refs: [] })));
