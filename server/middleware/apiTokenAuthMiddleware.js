'use strict';

const crypto = require('crypto');
const NewsDAO = require('../dao/NewsDAO');

module.exports = async function apiTokenAuthMiddleware(req, res, next) {
  try {
    const auth = req.get('authorization') || '';
    const [scheme, token] = auth.split(' ');

    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
      return res.status(401).json({ error: 'Missing or invalid bearer token' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const dao = new NewsDAO(req.app.get('pool'));
    const row = await dao.getApiTokenByHash(tokenHash);

    if (!row || row.revoked_at) {
      return res.status(401).json({ error: 'Invalid or revoked token' });
    }

    await dao.touchApiToken(row.id);
    req.apiToken = {
      id: row.id,
      label: row.label,
    };

    return next();
  } catch (err) {
    return next(err);
  }
};
