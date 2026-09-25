'use strict';

const MAX_TITLE = 160;
const MAX_BODY = 12000;
const MAX_SOURCES = 10;
const SOURCE_ID = /^S[1-9][0-9]*$/;
const CITATION = /\[(S[1-9][0-9]*)\]/g;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function inputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function text(value, field, max) {
  if (typeof value !== 'string') throw inputError(`${field} must be text`);
  const normalized = value.trim();
  if (!normalized) throw inputError(`${field} is required`);
  if (normalized.length > max) throw inputError(`${field} must be at most ${max} characters`);
  return normalized;
}

function date(value, field) {
  if (typeof value !== 'string' || !ISO_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw inputError(`${field} must be an ISO date`);
  }
  return value;
}

function sourceUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch (_) { throw inputError('sources[].url must be a valid HTTP(S) URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname) {
    throw inputError('sources[].url must be a public HTTP(S) URL without credentials');
  }
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0' || host === '::1' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
    throw inputError('sources[].url must not target a local address');
  }
  return parsed.toString();
}

function normalizeExtraContext(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw inputError('content is required');
  const allowed = new Set(['title', 'body', 'sources', 'researched_on', 'ai_assisted']);
  for (const key of Object.keys(raw)) if (!allowed.has(key)) throw inputError(`content.${key} is not allowed`);

  const title = text(raw.title, 'content.title', MAX_TITLE);
  const body = text(raw.body, 'content.body', MAX_BODY);
  if (!Array.isArray(raw.sources) || raw.sources.length < 1 || raw.sources.length > MAX_SOURCES) {
    throw inputError(`content.sources must contain 1-${MAX_SOURCES} sources`);
  }
  if (typeof raw.ai_assisted !== 'boolean') throw inputError('content.ai_assisted must be a boolean');

  const ids = new Set();
  const sources = raw.sources.map((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw inputError(`content.sources[${index}] must be an object`);
    const permitted = new Set(['id', 'title', 'url', 'accessed_on', 'evidence_excerpt']);
    for (const key of Object.keys(source)) if (!permitted.has(key)) throw inputError(`content.sources[${index}].${key} is not allowed`);
    const id = String(source.id || '').trim();
    if (!SOURCE_ID.test(id) || ids.has(id)) throw inputError(`content.sources[${index}].id must be a unique S1-style ID`);
    ids.add(id);
    const normalized = {
      id,
      title: text(source.title, `content.sources[${index}].title`, 300),
      url: sourceUrl(source.url),
      accessed_on: date(source.accessed_on, `content.sources[${index}].accessed_on`),
    };
    if (source.evidence_excerpt !== undefined && source.evidence_excerpt !== null && String(source.evidence_excerpt).trim()) {
      normalized.evidence_excerpt = text(String(source.evidence_excerpt), `content.sources[${index}].evidence_excerpt`, 1000);
    }
    return normalized;
  });

  const cited = new Set();
  for (const match of body.matchAll(CITATION)) cited.add(match[1]);
  if (cited.size === 0) throw inputError('content.body must include at least one citation such as [S1]');
  for (const id of cited) if (!ids.has(id)) throw inputError(`citation [${id}] has no matching source`);

  return { title, body, sources, researched_on: date(raw.researched_on, 'content.researched_on'), ai_assisted: raw.ai_assisted };
}

function publicSnapshot(content) {
  if (!content) return null;
  return { ...content, sources: content.sources.map(({ evidence_excerpt, ...source }) => source) };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function renderCitedBody(body, sources) {
  const sourceById = new Map((sources || []).map(source => [source.id, source]));
  return String(body).split(/(\[S[1-9][0-9]*\])/g).map(piece => {
    const match = /^\[(S[1-9][0-9]*)\]$/.exec(piece);
    if (!match) return escapeHtml(piece).replace(/\n/g, '<br>');
    const source = sourceById.get(match[1]);
    return source ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">[${match[1]}]</a>` : escapeHtml(piece);
  }).join('');
}

module.exports = { normalizeExtraContext, publicSnapshot, renderCitedBody };
