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
    proposedSummary: null,
    expectedSummary: null,
    editorNote: null,
    facts: [{
      heading: 'What changed',
      text: 'The pilot remains limited.',
      articleIds: [7, 9],
    }],
  });
});

test('validates optional private editorial handoff fields', async () => {
  const service = serviceWithDao({ async replaceStoryBrief(_id, input) { return input; } });
  const base = {
    expected_revision: 0, introduction: 'Context',
    facts: [{ text: 'A finding', article_ids: [1] }],
  };
  const proposedSummary = 'Researchers suspended the trial after identifying an equipment problem. They are reviewing the recorded evidence before deciding whether further testing can safely resume.';
  const saved = await service.replaceBrief(1, {
    ...base, proposed_summary: ` ${proposedSummary} `, expected_summary: 'Original',
    editor_note: ' Explain the changed status. ',
  });
  assert.equal(saved.proposedSummary, proposedSummary);
  assert.equal(saved.expectedSummary, 'Original');
  assert.equal(saved.editorNote, 'Explain the changed status.');
  await assert.rejects(service.replaceBrief(1, { ...base, proposed_summary: proposedSummary }),
    error => error.code === 'brief_summary_base_required');
  for (const proposed_summary of ['Too short.', 'x'.repeat(281), 'x'.repeat(150)]) {
    await assert.rejects(service.replaceBrief(1, { ...base, proposed_summary, expected_summary: null }),
      error => error.code === 'brief_proposed_summary_invalid');
  }
  await assert.rejects(service.replaceBrief(1, { ...base, editor_note: 'x'.repeat(2001) }),
    error => error.code === 'brief_editor_note_invalid');
  await assert.rejects(service.replaceBrief(1, { ...base, proposed_summary: { text: proposedSummary } }),
    error => error.code === 'brief_review_text_invalid');
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
