'use strict';

const crypto = require('crypto');

const MUTATION_METHODS = new Set(['POST', 'PATCH', 'DELETE']);
const MAX_STORED_BODY_BYTES = 256 * 1024;
const RETENTION_DAYS = 30;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
let lastPruneAt = 0;

function canonicalize(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).sort().forEach((key) => {
      out[key] = canonicalize(value[key]);
    });
    return out;
  }
  return value;
}

function fingerprintFor(req, idempotencyKey) {
  const canonicalBody = canonicalize(req.body || {});
  const payload = JSON.stringify({
    token_id: req.apiToken?.id || null,
    method: req.method,
    path: req.path,
    idem_key: idempotencyKey,
    body: canonicalBody,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function loadHit(pool, fingerprint) {
  const { rows } = await pool.query(
    `SELECT response_status, response_body
       FROM api_request_idempotency
      WHERE request_fingerprint = $1`,
    [fingerprint]
  );
  return rows[0] || null;
}

async function persistResult(pool, record) {
  await pool.query(
    `INSERT INTO api_request_idempotency
      (request_fingerprint, token_id, method, route_path, idempotency_key, response_status, response_body)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (request_fingerprint) DO NOTHING`,
    [
      record.fingerprint,
      record.tokenId,
      record.method,
      record.routePath,
      record.idempotencyKey,
      record.status,
      record.body,
    ]
  );
}

async function pruneExpired(pool, nowMs) {
  if ((nowMs - lastPruneAt) < PRUNE_INTERVAL_MS) return;
  lastPruneAt = nowMs;
  await pool.query(
    `DELETE FROM api_request_idempotency
      WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')`,
    [RETENTION_DAYS]
  );
}

module.exports = async function apiIdempotencyMiddleware(req, res, next) {
  if (!MUTATION_METHODS.has(req.method)) return next();

  const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();
  if (!idempotencyKey) return next();

  const pool = req.app.get('pool');
  if (!pool) return next();

  const fingerprint = fingerprintFor(req, idempotencyKey);

  try {
    await pruneExpired(pool, Date.now());
    const prior = await loadHit(pool, fingerprint);
    if (prior) {
      res.set('X-Idempotent-Replay', '1');
      if (prior.response_body && typeof prior.response_body === 'object') {
        return res.status(prior.response_status).json(prior.response_body);
      }
      return res.status(prior.response_status).send(prior.response_body || '');
    }
  } catch (error) {
    return next(error);
  }

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  let capturedBody = null;

  res.json = (body) => {
    capturedBody = body;
    return originalJson(body);
  };

  res.send = (body) => {
    if (capturedBody === null) capturedBody = body;
    return originalSend(body);
  };

  res.on('finish', async () => {
    if (res.statusCode >= 500) return;

    let bodyToStore = capturedBody;
    if (typeof bodyToStore === 'string' && Buffer.byteLength(bodyToStore, 'utf8') > MAX_STORED_BODY_BYTES) {
      bodyToStore = bodyToStore.slice(0, MAX_STORED_BODY_BYTES);
    }

    try {
      await persistResult(pool, {
        fingerprint,
        tokenId: req.apiToken?.id || null,
        method: req.method,
        routePath: req.path,
        idempotencyKey,
        status: res.statusCode,
        body: bodyToStore,
      });
    } catch (error) {
      console.error('[apiIdempotency] persist failed:', error.message);
    }
  });

  return next();
};
