'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const StoryService = require('../services/StoryService');

function serviceWithDao(dao) {
  const service = Object.create(StoryService.prototype);
  service.dao = dao;
  return service;
}

test('normalizes a cited brief before replacing it', async () => {
  let received;
  const service = serviceWithDao({
    async replaceStoryBrief(storyId, brief) {
      received = { storyId, ...brief };
      return brief;
    },
  });

  await service.replaceBrief(42, {
    expected_revision: 0,
    introduction: '  Additional context  ',
    facts: [{
      heading: '  What changed  ',
      text: '  The pilot remains limited.  ',
      article_ids: ['7', 7, 9],
    }],
  });

  assert.deepEqual(received, {
    storyId: 42,
    expectedRevision: 0,
    introduction: 'Additional context',
    facts: [{
      heading: 'What changed',
      text: 'The pilot remains limited.',
      articleIds: [7, 9],
    }],
  });
});

test('rejects findings without citations', async () => {
  const service = serviceWithDao({});
  await assert.rejects(
    service.replaceBrief(42, {
      expected_revision: 0,
      introduction: 'Additional context',
      facts: [{ text: 'Unsupported finding', article_ids: [] }],
    }),
    error => error.status === 400 && error.code === 'brief_fact_uncited'
  );
});

test('normalizes research sources and groups a publisher by host', async () => {
  const received = [];
  const service = serviceWithDao({
    async registerResearchSource(storyId, source) {
      received.push({ storyId, ...source });
      return source;
    },
  });

  await service.registerResearchSource(42, {
    title: 'First filing',
    publisher_name: 'Example Agency',
    url: 'https://example.gov/reports/first#section',
  });
  await service.registerResearchSource(42, {
    title: 'Second filing',
    publisher_name: 'Example Agency',
    url: 'https://example.gov/reports/second',
  });

  assert.equal(received[0].sourceSlug, received[1].sourceSlug);
  assert.notEqual(received[0].externalId, received[1].externalId);
  assert.equal(received[0].url, 'https://example.gov/reports/first');
});

test('rejects non-HTTP research source URLs', async () => {
  const service = serviceWithDao({});
  await assert.rejects(
    service.registerResearchSource(42, {
      title: 'Local file',
      publisher_name: 'Example',
      url: 'file:///tmp/source.txt',
    }),
    error => error.status === 400 && error.code === 'research_source_url_invalid'
  );
});
