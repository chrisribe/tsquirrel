'use strict';

function serviceFor(req) {
  return req.app.get('storyAdminService');
}

function parseIds(value) {
  return String(value || '').split(',').map(id => parseInt(id, 10)).filter(Number.isFinite);
}

function notFound(res) {
  return res.status(404).render('layout-main', {
    template: 'errors/404',
    pageTitle: '404 — TSquirrel',
    noIndex: true,
    pageData: {},
  });
}

function parsePositiveInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function safeAdminStoriesReturnTo(value) {
  const s = String(value || '');
  return s.startsWith('/admin/stories') ? s : '/admin/stories';
}

function parseStoryIdList(value) {
  const raw = Array.isArray(value) ? value : [value];
  const parts = [];
  for (const entry of raw) {
    const s = String(entry || '').trim();
    if (!s) continue;
    if (s.includes(',')) parts.push(...s.split(','));
    else parts.push(s);
  }

  return Array.from(new Set(parts.map(id => parseInt(id, 10)).filter(Number.isFinite)));
}

function parseBriefInput(body = {}) {
  const facts = [];
  for (let index = 0; index < 8; index += 1) {
    const text = String(body[`fact_${index}_text`] || '').trim();
    if (!text) continue;
    facts.push({
      heading: String(body[`fact_${index}_heading`] || '').trim() || null,
      text,
      articleIds: [].concat(body[`fact_${index}_article_ids`] || [])
        .map(value => parseInt(value, 10))
        .filter(Number.isFinite),
    });
  }
  return {
    expectedRevision: parseInt(body.expected_revision, 10),
    introduction: String(body.introduction || '').trim(),
    proposed_summary: body.proposed_summary,
    expected_summary: body.expected_summary,
    editor_note: body.editor_note,
    facts,
  };
}

const StoryAdminController = {
  async list(req, res, next) {
    try {
      const activeStatus = req.query.status || null;
      const page = parsePositiveInt(req.query.page, 1);
      const perPage = 50;
      const pageData = await serviceFor(req).listStories({ status: activeStatus, page, perPage });
      pageData.activeStatus = activeStatus;
      pageData.returnTo = safeAdminStoriesReturnTo(req.originalUrl);
      return res.renderPage('admin/stories', pageData, {
        pageTitle: 'Stories — Admin — TSquirrel',
      });
    } catch (error) { return next(error); }
  },

  async newForm(req, res, next) {
    try {
      const pageData = await serviceFor(req).getNewStoryModel(parseIds(req.query.articleIds));
      return res.renderPage('admin/story-edit', pageData, {
        pageTitle: 'New Story — Admin — TSquirrel',
      });
    } catch (error) { return next(error); }
  },

  async create(req, res, next) {
    try {
      const draft = await serviceFor(req).createDraft(req.body, req.session.user.id);
      const pageData = await serviceFor(req).getEditorModel(draft.id);
      const url = `/admin/stories/${draft.id}/edit`;
      return res.renderFragmentOrRedirect(
        'admin/story-edit',
        { ...pageData, message: 'Draft created.' },
        url,
        { replaceUrl: url }
      );
    } catch (error) {
      if (error.status !== 400) return next(error);
      const pageData = await serviceFor(req).getNewStoryModel(
        [].concat(req.body.articleIds || []).map(id => parseInt(id, 10)).filter(Number.isFinite)
      );
      return res.renderPage('admin/story-edit', { ...pageData, error: error.message }, {
        pageTitle: 'New Story — Admin — TSquirrel',
        status: req.isHtmx ? 200 : 400,
      });
    }
  },

  async edit(req, res, next) {
    try {
      const returnTo = safeAdminStoriesReturnTo(req.query.returnTo || '/admin/stories');
      const pageData = await serviceFor(req).getEditorModel(req.params.id, { returnTo });
      if (!pageData) return notFound(res);
      if (req.query.brief === 'saved') pageData.message = 'Dig deeper draft saved.';
      if (req.query.brief === 'published') pageData.message = 'Dig deeper brief published.';
      if (req.query.brief === 'withdrawn') pageData.message = 'Dig deeper marked for more research. Any published brief was withdrawn.';
      return res.renderPage('admin/story-edit', pageData, {
        pageTitle: `Edit: ${pageData.story.title} — Admin — TSquirrel`,
      });
    } catch (error) { return next(error); }
  },

  async attachPicker(req, res, next) {
    try {
      const pageData = await serviceFor(req).getAttachPickerModel(req.params.id);
      return res.render('admin/partials/_attach-picker', { pageData });
    } catch (error) { return next(error); }
  },

  async update(req, res, next) {
    try {
      await serviceFor(req).updateStory(req.params.id, req.body);
      const url = `/admin/stories/${req.params.id}/edit`;
      return res.renderFragmentOrRedirect(
        'admin/partials/_save-status',
        { message: 'Changes saved.' },
        url,
        { replaceUrl: url }
      );
    } catch (error) {
      if (error.status !== 400) return next(error);
      if (req.isHtmx) {
        return res.status(200).render('admin/partials/_save-status', {
          pageData: { message: error.message, isError: true },
        });
      }
      const pageData = await serviceFor(req).getEditorModel(req.params.id);
      if (!pageData) return notFound(res);
      return res.renderPage('admin/story-edit', { ...pageData, error: error.message }, {
        pageTitle: `Edit: ${pageData.story.title} — Admin — TSquirrel`,
        status: 400,
      });
    }
  },

  async attach(req, res, next) {
    try {
      const pageData = await serviceFor(req).attachSource(req.params.id, parseInt(req.body.articleId, 10));
      if (!pageData) return notFound(res);
      const url = `/admin/stories/${req.params.id}/edit`;
      return res.renderFragmentOrRedirect(
        'admin/partials/_story-assets',
        { ...pageData, message: 'Source attached.' },
        url,
        { replaceUrl: url }
      );
    } catch (error) { return next(error); }
  },

  async detach(req, res, next) {
    try {
      const pageData = await serviceFor(req).detachSource(req.params.id, parseInt(req.body.articleId, 10));
      if (!pageData) return notFound(res);
      const url = `/admin/stories/${req.params.id}/edit`;
      return res.renderFragmentOrRedirect(
        'admin/partials/_story-assets',
        { ...pageData, message: 'Source detached.' },
        url,
        { replaceUrl: url }
      );
    } catch (error) {
      if (error.status !== 409) return next(error);
      if (req.isHtmx) {
        return res.status(200).render('admin/partials/_save-status', {
          pageData: { message: error.message, isError: true, oob: true },
        });
      }
      const pageData = await serviceFor(req).getEditorModel(req.params.id);
      if (!pageData) return notFound(res);
      return res.renderPage('admin/story-edit', { ...pageData, error: error.message }, {
        pageTitle: `Edit: ${pageData.story.title} — Admin — TSquirrel`,
        status: 409,
      });
    }
  },

  async saveBrief(req, res, next) {
    const input = parseBriefInput(req.body);
    try {
      const pageData = await serviceFor(req).saveBrief(req.params.id, input);
      if (!pageData) return notFound(res);
      return res.redirect(303, `/admin/stories/${req.params.id}/edit?brief=saved#story-brief-editor`);
    } catch (error) {
      if (![400, 404, 409].includes(error.status)) return next(error);
      const pageData = await serviceFor(req).getEditorModel(req.params.id);
      if (!pageData) return notFound(res);
      pageData.briefForm = {
        introduction: input.introduction,
        revision: Number.isFinite(input.expectedRevision) ? input.expectedRevision : 0,
        status: pageData.brief?.status || 'draft',
        proposed_summary: input.proposed_summary,
        summary_base: input.expected_summary,
        editor_note: input.editor_note,
        submitted_at: pageData.brief?.submitted_at || null,
        facts: input.facts.map((fact, index) => ({
          ...fact,
          position: index + 1,
          sources: fact.articleIds.map(articleId => ({ article_id: articleId })),
        })),
      };
      return res.renderPage('admin/story-edit', { ...pageData, error: error.message }, {
        pageTitle: `Edit: ${pageData.story.title} — Admin — TSquirrel`,
        status: error.status,
      });
    }
  },

  async publishBrief(req, res, next) {
    try {
      await serviceFor(req).publishBrief(
        req.params.id,
        parseInt(req.body.expected_revision, 10),
        req.session.user.id,
        req.body.summary_decision
      );
      return res.redirect(303, `/admin/stories/${req.params.id}/edit?brief=published#story-brief-editor`);
    } catch (error) {
      if (![400, 404, 409].includes(error.status)) return next(error);
      const pageData = await serviceFor(req).getEditorModel(req.params.id);
      if (!pageData) return notFound(res);
      return res.renderPage('admin/story-edit', { ...pageData, error: error.message }, {
        pageTitle: `Edit: ${pageData.story.title} — Admin — TSquirrel`,
        status: error.status,
      });
    }
  },

  async withdrawBrief(req, res, next) {
    try {
      await serviceFor(req).withdrawBrief(req.params.id);
      return res.redirect(303, `/admin/stories/${req.params.id}/edit?brief=withdrawn#story-brief-editor`);
    } catch (error) {
      if (![404, 409].includes(error.status)) return next(error);
      return notFound(res);
    }
  },

  async acceptSuggestion(req, res, next) {
    try {
      const pageData = await serviceFor(req).acceptSuggestion(req.params.id, parseInt(req.params.articleId, 10));
      if (!pageData) return notFound(res);
      const url = `/admin/stories/${req.params.id}/edit`;
      return res.renderFragmentOrRedirect(
        'admin/partials/_story-review',
        { ...pageData, message: 'Suggested source accepted.' },
        url,
        { replaceUrl: url }
      );
    } catch (error) { return next(error); }
  },

  async rejectSuggestion(req, res, next) {
    try {
      const pageData = await serviceFor(req).rejectSuggestion(req.params.id, parseInt(req.params.articleId, 10));
      if (!pageData) return notFound(res);
      const url = `/admin/stories/${req.params.id}/edit`;
      return res.renderFragmentOrRedirect(
        'admin/partials/_story-review',
        { ...pageData, message: 'Suggestion dismissed.' },
        url,
        { replaceUrl: url }
      );
    } catch (error) { return next(error); }
  },

  async publish(req, res, next) {
    return StoryAdminController.changeStatus(req, res, next, 'published', 'Story published.');
  },

  async unpublish(req, res, next) {
    return StoryAdminController.changeStatus(req, res, next, 'draft', 'Story returned to draft.');
  },

  async hide(req, res, next) {
    return StoryAdminController.changeStatus(req, res, next, 'hidden', 'Story hidden.');
  },

  async changeStatus(req, res, next, status, message) {
    try {
      const pageData = await serviceFor(req).setStatus(req.params.id, status);
      if (!pageData) return notFound(res);
      const fallback = safeAdminStoriesReturnTo(req.body.returnTo || '/admin/stories');
      return res.renderFragmentOrRedirect(
        'admin/partials/_story-lifecycle',
        { ...pageData, message },
        fallback,
        { replaceUrl: `/admin/stories/${req.params.id}/edit` }
      );
    } catch (error) {
      if (error.status === 400) {
        if (req.isHtmx) {
          return res.status(200).render('admin/partials/_save-status', {
            pageData: { message: error.message, isError: true, oob: true },
          });
        }
        const pageData = await serviceFor(req).getEditorModel(req.params.id);
        if (!pageData) return notFound(res);
        return res.renderPage('admin/story-edit', { ...pageData, error: error.message }, {
          pageTitle: `Edit: ${pageData.story.title} — Admin — TSquirrel`,
          status: 400,
        });
      }
      return next(error);
    }
  },

  async feature(req, res, next) {
    try {
      const featured = req.body.featured === 'true';
      const pageData = await serviceFor(req).setFeatured(req.params.id, featured);
      if (!pageData) return notFound(res);
      const fallback = safeAdminStoriesReturnTo(req.body.returnTo || '/admin/stories');
      return res.renderFragmentOrRedirect(
        'admin/partials/_story-lifecycle',
        { ...pageData, message: featured ? 'Story featured.' : 'Story unfeatured.' },
        fallback,
        { replaceUrl: `/admin/stories/${req.params.id}/edit` }
      );
    } catch (error) { return next(error); }
  },

  async delete(req, res, next) {
    try {
      await serviceFor(req).deleteStory(req.params.id);
      const fallback = safeAdminStoriesReturnTo(req.body.returnTo || '/admin/stories');
      return res.redirectForRequest(fallback);
    } catch (error) { return next(error); }
  },

  async bulkAction(req, res, next) {
    try {
      const ids = parseStoryIdList(req.body.storyIds);
      const action = String(req.body.action || '').trim();
      const fallback = safeAdminStoriesReturnTo(req.body.returnTo || '/admin/stories');
      await serviceFor(req).bulkAction(ids, action);
      return res.redirectForRequest(fallback);
    } catch (error) {
      if (error.status === 400) {
        return res.status(400).send(error.message);
      }
      return next(error);
    }
  },
};

module.exports = StoryAdminController;
