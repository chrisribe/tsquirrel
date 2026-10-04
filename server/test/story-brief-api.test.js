'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const baseUrl = process.env.TSQ_TEST_BASE_URL;

test('a contributor researches and submits a brief through the real API', {
  skip: !baseUrl && 'Set TSQ_TEST_BASE_URL to run against a local server',
}, async (t) => {
  const base = new URL(baseUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname),
    'This test creates content and must only run against a local server');
  assert.ok(process.env.TSQ_TEST_ADMIN_EMAIL, 'Set TSQ_TEST_ADMIN_EMAIL');
  assert.ok(process.env.TSQ_TEST_ADMIN_PASSWORD, 'Set TSQ_TEST_ADMIN_PASSWORD');

  const login = await fetch(new URL('/auth/login', base), {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({
      email: process.env.TSQ_TEST_ADMIN_EMAIL,
      password: process.env.TSQ_TEST_ADMIN_PASSWORD,
    }),
  });
  assert.equal(login.status, 302, 'Admin login must succeed');
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie, 'Admin session cookie is required');

  const createdToken = await fetch(new URL('/admin/tokens', base), {
    method: 'POST',
    headers: { Cookie: cookie },
    body: new URLSearchParams({ label: `brief-api-test-${randomUUID()}` }),
  });
  assert.equal(createdToken.status, 200);
  const token = (await createdToken.text()).match(/<code>(tsq_[A-Za-z0-9_-]+)<\/code>/)?.[1];
  assert.ok(token, 'Admin token creation must return a token');

  async function api(path, method = 'GET', body) {
    const response = await fetch(new URL(`/api/v1${path}`, base), {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.ok(response.headers.get('content-type')?.includes('application/json'),
      `${method} ${path}: expected JSON, received HTTP ${response.status}`);
    return { status: response.status, body: await response.json(), headers: response.headers };
  }

  function admin(path, body = {}) {
    return fetch(new URL(path, base), {
      method: 'POST',
      redirect: 'manual',
      headers: { Cookie: cookie },
      body: new URLSearchParams(body),
    });
  }

  let storyId;
  let tokenId;
  try {
    const me = await api('/me');
    assert.equal(me.status, 200);
    tokenId = me.body.token.id;
    const created = await api('/stories', 'POST', {
      title: `Research context fixture ${randomUUID()}`,
      summary: 'Researchers published a report describing a controlled local trial. The evidence records the study conditions and limitations so that editors can assess the findings before publication.',
      squirrel_take: 'The report separates the observed trial result from the broader claims that still need independent replication.',
      why_it_matters: 'Editors can distinguish a controlled observation from an untested claim before presenting the research to readers.',
      category: 'Science',
    });
    assert.equal(created.status, 201);
    storyId = created.body.story.id;

    const context = await api(`/stories/${created.body.story.slug}/research-context`);
    assert.equal(context.status, 200);
    assert.equal(context.body.story.id, storyId);
    assert.equal(context.body.story.summary, created.body.story.summary);
    assert.equal(context.body.brief, null);
    assert.deepEqual(context.body.sources, []);
    assert.deepEqual(context.body.suggestions, []);
    assert.equal(context.body.submission.expected_revision, 0);
    assert.equal(context.body.submission.method, 'PUT');
    assert.equal(context.body.submission.path, `/api/v1/stories/${storyId}/brief`);
    assert.ok(context.body.research_checklist.some(item => item.id === 'verify-originals'));
    assert.ok(context.body.research_checklist.some(item => item.id === 'add-value'));
    assert.equal(context.body.links.editor, `/admin/stories/${storyId}/edit#story-brief-panel`);
    assert.equal(context.headers.get('cache-control'), 'no-store');

    await t.test('requires API auth and resolves both IDs and slugs', async () => {
      const anonymous = await fetch(new URL(`/api/v1/stories/${storyId}/research-context`, base));
      assert.equal(anonymous.status, 401);
      const byId = await api(`/stories/${storyId}/research-context`);
      assert.equal(byId.body.story.slug, created.body.story.slug);
      assert.equal((await api('/stories/nonexistent-context-fixture/research-context')).status, 404);
      assert.equal((await api('/stories/2147483648/research-context')).status, 400);
      assert.equal((await api('/stories/0/research-context')).status, 400);
      assert.equal((await api('/stories/bad%20slug/research-context')).status, 400);
    });

    let articleId;
    await t.test('registers source metadata and reuses an existing URL', async () => {
      const input = {
        title: 'Researchers publish controlled local trial report',
        publisher_name: 'Local Research Fixture',
        url: 'https://research-context.example.test/report',
      };
      const source = await api(`/stories/${storyId}/research-sources`, 'POST', input);
      assert.equal(source.status, 201);
      articleId = source.body.article.id;
      assert.equal(source.body.article.published_at, null);
      const retry = await api(`/stories/${storyId}/research-sources`, 'POST', {
        ...input, url: `${input.url}#findings`,
      });
      assert.equal(retry.status, 201);
      assert.equal(retry.body.article.id, articleId);
      const refreshed = await api(`/stories/${storyId}/research-context`);
      assert.equal(refreshed.body.sources.length, 1);
      assert.equal(refreshed.body.sources[0].article_id, articleId);
      assert.equal(refreshed.body.sources[0].url, input.url);
      assert.equal(refreshed.body.sources[0].publisher_name, input.publisher_name);
      assert.equal(refreshed.body.sources[0].published_at, null);
    });

    const briefInput = {
      expected_revision: 0,
      introduction: 'This brief distinguishes the observed trial result from what remains untested.',
      facts: [{
        heading: 'A limited trial is not a general result',
        text: 'The report describes controlled conditions. Broader claims would require independent replication under other conditions.',
        article_ids: [articleId],
      }],
    };
    await t.test('rejects unsupported findings and API approval fields without saving', async () => {
      const forbidden = await api(`/stories/${storyId}/brief`, 'PUT', { ...briefInput, status: 'published' });
      assert.equal(forbidden.status, 400);
      assert.equal(forbidden.body.code, 'brief_review_fields_forbidden');
      const uncited = await api(`/stories/${storyId}/brief`, 'PUT', {
        ...briefInput, facts: [{ ...briefInput.facts[0], article_ids: [] }],
      });
      assert.equal(uncited.status, 400);
      assert.equal(uncited.body.code, 'brief_fact_uncited');
      const unattached = await api(`/stories/${storyId}/brief`, 'PUT', {
        ...briefInput, facts: [{ ...briefInput.facts[0], article_ids: [2147483647] }],
      });
      assert.equal(unattached.status, 400);
      assert.equal((await api(`/stories/${storyId}/brief`)).body.brief, null);
    });

    await t.test('saves a draft and rejects a stale replacement without losing it', async () => {
      const submitted = await api(`/stories/${storyId}/brief`, 'PUT', briefInput);
      assert.equal(submitted.status, 200);
      assert.equal(submitted.body.brief.status, 'draft');
      assert.equal(submitted.body.brief.revision, 1);
      assert.equal(submitted.body.brief.reviewed_at, null);
      const stale = await api(`/stories/${storyId}/brief`, 'PUT', briefInput);
      assert.equal(stale.status, 409);
      assert.equal(stale.body.current_revision, 1);
      const refreshed = await api(`/stories/${storyId}/research-context`);
      assert.equal(refreshed.body.submission.expected_revision, 1);
      assert.equal(refreshed.body.brief.introduction, briefInput.introduction);
      assert.equal(refreshed.body.brief.facts[0].sources[0].article_id, articleId);
    });

    await t.test('publishes only through admin review and hides later edits until reapproved', async () => {
      const preflight = await api(`/stories/${storyId}/publish-preflight`);
      assert.equal(preflight.body.can_publish, true, JSON.stringify(preflight.body.blockers));
      const storyPublish = await admin(`/admin/stories/${storyId}/publish`);
      assert.ok([302, 303].includes(storyPublish.status));
      const publicUrl = new URL(context.body.links.story, base);
      let publicPage = await fetch(publicUrl);
      assert.equal(publicPage.status, 200);
      assert.ok(!(await publicPage.text()).includes(briefInput.introduction));
      assert.equal((await admin(`/admin/stories/${storyId}/brief/publish`, { expected_revision: '0' })).status, 400);
      assert.equal((await admin(`/admin/stories/${storyId}/brief/publish`, { expected_revision: '1' })).status, 303);
      let current = (await api(`/stories/${storyId}/brief`)).body.brief;
      assert.equal(current.status, 'published');
      assert.ok(current.reviewed_by);
      assert.ok(current.reviewed_at);
      const publishedHtml = await (await fetch(publicUrl)).text();
      assert.ok(publishedHtml.includes(briefInput.introduction));
      assert.ok(publishedHtml.includes(`href="#source-${articleId}"`));
      assert.ok(publishedHtml.includes(`id="source-${articleId}"`));
      assert.ok(publishedHtml.includes('href="https://research-context.example.test/report"'));

      const detached = await api(`/stories/${storyId}/sources/${articleId}`, 'DELETE');
      assert.equal(detached.status, 409, 'Cited sources must not be detached');
      const update = await api(`/stories/${storyId}/brief`, 'PUT', { ...briefInput, expected_revision: 1 });
      assert.equal(update.body.brief.status, 'draft');
      assert.equal(update.body.brief.revision, 2);
      assert.equal(update.body.brief.reviewed_at, null);
      publicPage = await fetch(publicUrl);
      assert.equal(publicPage.status, 200, 'The story remains public while the brief is a draft');
      assert.ok(!(await publicPage.text()).includes(briefInput.introduction));
      assert.equal((await admin(`/admin/stories/${storyId}/brief/publish`, { expected_revision: '1' })).status, 409);
      assert.equal((await admin(`/admin/stories/${storyId}/brief/publish`, { expected_revision: '2' })).status, 303);
      assert.ok((await (await fetch(publicUrl)).text()).includes(briefInput.introduction));
      current = (await api(`/stories/${storyId}/research-context`)).body;
      assert.equal(current.brief.status, 'published');
      assert.equal(current.submission.expected_revision, 2);
      assert.ok((await api('/me')).body.token.monthly_used > me.body.token.monthly_used);
    });
  } finally {
    try {
      if (storyId) {
        const removed = await api(`/stories/${storyId}`, 'DELETE');
        assert.equal(removed.status, 200, 'Test story cleanup must succeed');
      }
    } finally {
      if (tokenId) {
        const revoked = await admin(`/admin/tokens/${tokenId}/revoke`);
        assert.equal(revoked.status, 303, 'Test token must be revoked');
      }
    }
  }
});
