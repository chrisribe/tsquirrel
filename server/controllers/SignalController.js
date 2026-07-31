'use strict';

function serviceFor(req) {
  return req.app.get('signalService');
}

const SignalController = {
  async list(req, res, next) {
    try {
      const pageData = await serviceFor(req).getSignalsModel(req.query.status || 'active');
      return res.renderPage('admin/signals', pageData, {
        pageTitle: 'Radar Signals — Admin — TSquirrel',
      });
    } catch (error) { return next(error); }
  },

  async scan(req, res, next) {
    try {
      await serviceFor(req).scan();
      return res.redirectForRequest('/admin/signals');
    } catch (error) { return next(error); }
  },

  async createStory(req, res, next) {
    try {
      const draft = await serviceFor(req).createStoryFromSignal(req.params.id);
      if (!draft) return res.redirectForRequest('/admin/signals');
      return res.redirectForRequest(`/admin/stories/${draft.id}/edit`);
    } catch (error) { return next(error); }
  },

  async dismiss(req, res, next) {
    try {
      await serviceFor(req).dismiss(req.params.id);
      return res.redirectForRequest('/admin/signals');
    } catch (error) { return next(error); }
  },
};

module.exports = SignalController;
