'use strict';

const crypto = require('crypto');
const ApiTokenDAO = require('../dao/ApiTokenDAO');

module.exports = async function apiTokenAuthMiddleware(req, res, next) {
  try {
    const auth = req.get('authorization') || '';
    const [scheme, token] = auth.split(' ');

    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
      return res.status(401).json({ error: 'Missing or invalid bearer token' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const dao = new ApiTokenDAO(req.app.get('pool'));
    const row = await dao.getApiTokenByHash(tokenHash);

    if (!row || row.revoked_at || row.is_active === false) {
      return res.status(401).json({ error: 'Invalid, inactive, or revoked token' });
    }

    const monthlyQuota = Number.isFinite(Number(row.monthly_quota)) ? Number(row.monthly_quota) : null;
    const monthlyUsed = await dao.getMonthlyUsage(row.id);
    if (monthlyQuota !== null && monthlyUsed >= monthlyQuota) {
      return res.status(429).json({
        error: 'monthly_quota_exceeded',
        quota: monthlyQuota,
        used: monthlyUsed,
      });
    }

    await dao.addUsage(row.id);
    await dao.touchApiToken(row.id);

    const usageAfter = monthlyUsed + 1;
    if (monthlyQuota !== null) {
      res.set('X-TSQ-Quota-Limit', String(monthlyQuota));
      res.set('X-TSQ-Quota-Used', String(usageAfter));
      res.set('X-TSQ-Quota-Remaining', String(Math.max(0, monthlyQuota - usageAfter)));
    }

    req.apiToken = {
      id: row.id,
      label: row.label,
      plan: row.plan || 'internal',
      monthly_quota: monthlyQuota,
      monthly_used: usageAfter,
    };

    return next();
  } catch (err) {
    return next(err);
  }
};
