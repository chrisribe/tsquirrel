'use strict';

function serviceFor(req) {
  return req.app.get('sourceAdminService');
}

function notFound(res) {
  return res.status(404).render('layout-main', {
    template: 'errors/404',
    pageTitle: '404 — TSquirrel',
    noIndex: true,
    pageData: {},
  });
}

const SourceAdminController = {
  async dashboard(req, res, next) {
    try {
      const pageData = await serviceFor(req).getDashboardModel();
      return res.renderPage('admin/dashboard', pageData, {
        pageTitle: 'Admin — TSquirrel',
      });
    } catch (error) { return next(error); }
  },

  async sourceArticles(req, res, next) {
    try {
      const pageData = await serviceFor(req).getSourceModel(req.params.slug);
      if (!pageData) return notFound(res);
      return res.renderPage('admin/source-articles', pageData, {
        pageTitle: `${pageData.source.name} — Admin — TSquirrel`,
      });
    } catch (error) { return next(error); }
  },

  async toggleSource(req, res, next) {
    try {
      await serviceFor(req).toggleSource(req.params.slug);
      return res.redirectForRequest('/admin');
    } catch (error) { return next(error); }
  },
};

module.exports = SourceAdminController;
