'use strict';

function serviceFor(req) {
  return req.app.get('tokenService');
}

const TokenController = {
  async list(req, res, next) {
    try {
      const message = req.query.revoked === '1' ? 'Token revoked.' : null;
      const pageData = await serviceFor(req).getTokensModel();
      return res.renderPage('admin/tokens', { ...pageData, message }, {
        pageTitle: 'API Tokens — Admin — TSquirrel',
      });
    } catch (error) { return next(error); }
  },

  async create(req, res, next) {
    try {
      const createdToken = await serviceFor(req).createToken(req.body.label);
      const pageData = await serviceFor(req).getTokensModel();
      return res.renderPage('admin/tokens', {
        ...pageData,
        message: 'Token created. Copy it now — it will not be shown again.',
        createdToken,
      }, {
        pageTitle: 'API Tokens — Admin — TSquirrel',
      });
    } catch (error) {
      if (error.status !== 400) return next(error);
      const pageData = await serviceFor(req).getTokensModel();
      return res.renderPage('admin/tokens', { ...pageData, error: error.message }, {
        pageTitle: 'API Tokens — Admin — TSquirrel',
        status: req.isHtmx ? 200 : 400,
      });
    }
  },

  async revoke(req, res, next) {
    try {
      await serviceFor(req).revokeToken(req.params.id);
      return res.redirectForRequest('/admin/tokens?revoked=1');
    } catch (error) { return next(error); }
  },
};

module.exports = TokenController;
