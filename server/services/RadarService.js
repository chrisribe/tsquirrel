'use strict';

// RadarService — Signal-first news discovery
// Orchestrates the convergence detector (implemented in NewsDAO) and turns
// results into persisted signals. Contains NO SQL — all queries live in NewsDAO.
// See docs/NEWS-RADAR.md for the design rationale.

const NewsDAO = require('../dao/NewsDAO');

const FRESH_TRUSTED_SOURCE_SLUGS = (process.env.TSQ_RADAR_FRESH_TRUSTED_SOURCES || 'reuters,bbc,ap,associated-press')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const FRESH_WINDOW_HOURS = Number.parseInt(process.env.TSQ_RADAR_FRESH_WINDOW_HOURS || '12', 10) || 12;
const FRESH_LIMIT = Number.parseInt(process.env.TSQ_RADAR_FRESH_LIMIT || '12', 10) || 12;
const FRESH_MIN_WORDS = Number.parseInt(process.env.TSQ_RADAR_FRESH_MIN_WORDS || '8', 10) || 8;
const FRESH_MIN_DESC_CHARS = Number.parseInt(process.env.TSQ_RADAR_FRESH_MIN_DESC_CHARS || '80', 10) || 80;
const FRESH_EXPIRES_HOURS = Number.parseInt(process.env.TSQ_RADAR_FRESH_EXPIRES_HOURS || '24', 10) || 24;
const FRESH_MAX_CREATED_PER_SCAN = Number.parseInt(process.env.TSQ_RADAR_FRESH_MAX_CREATED_PER_SCAN || '4', 10) || 4;
const FRESH_MAX_PER_SOURCE_PER_SCAN = Number.parseInt(process.env.TSQ_RADAR_FRESH_MAX_PER_SOURCE_PER_SCAN || '1', 10) || 1;

function hasSufficientText(article) {
  const title = String(article?.title || '').trim();
  const desc = String(article?.description || '').trim();
  const wordCount = title.split(/\s+/).filter(Boolean).length;
  return wordCount >= FRESH_MIN_WORDS || desc.length >= FRESH_MIN_DESC_CHARS;
}

function normalizeFreshTopic(article) {
  const raw = String(article?.title || '').toLowerCase();
  const cleaned = raw
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const terms = cleaned
    .split(' ')
    .filter((w) => w.length >= 4)
    .slice(0, 8);
  if (terms.length === 0) return 'fresh update';
  return terms.join(' ');
}

/**
 * Main radar scan — run after each ingest.
 * Detects convergence signals and persists new ones via the DAO.
 * Idempotent: a topic that already has a live (non-dismissed, non-expired)
 * signal within the dedup window is skipped.
 */
async function radarScan(pool) {
  const dao = new NewsDAO(pool);
  const hits = await dao.detectConvergence();

  if (hits.length === 0) {
    console.log('[Radar] No convergence signals detected');
    return 0;
  }

  let created = 0;
  let suggested = 0;
  for (const hit of hits) {
    // If this convergence topic overlaps a story we've already published, it's
    // likely follow-up coverage. We do NOT attach it automatically — a noisy
    // convergence match (e.g. a generic "spider man" bigram) could poison a
    // good story. Instead we record the new article(s) as PENDING suggestions
    // for an editor/agent to review and accept or reject.
    const existingStory = await dao.findStoryForArticles(hit.article_ids);
    if (existingStory) {
      const attachedIds = new Set(existingStory.attached_ids || []);
      const newIds = hit.article_ids.filter(id => !attachedIds.has(id));
      if (newIds.length > 0) {
        const n = await dao.suggestSources(existingStory.id, newIds, `radar:${hit.topic}`);
        if (n > 0) {
          suggested += n;
          console.log(`[Radar] suggested ${n} follow-up source(s) for review on story #${existingStory.id} "${existingStory.title}" (topic: ${hit.topic})`);
        }
      }
      continue;
    }

    const alreadyFired = await dao.hasRecentSignal(hit.topic);
    if (alreadyFired) continue;

    const evidenceCovered = await dao.hasRecentSignalForArticles(hit.article_ids, { windowHours: 48, minShared: 2 });
    if (evidenceCovered) continue;

    const strength = hit.source_count * hit.article_count;
    await dao.createSignal({
      detector: 'convergence',
      topic: hit.topic,
      strength,
      evidence: {
        article_ids: hit.article_ids,
        sources: hit.source_names,
        source_count: hit.source_count,
        article_count: hit.article_count,
      },
    });
    created++;
  }

  // Generic freshness detector: promote brand-new trusted-source items that are
  // not yet attached to any story and have enough textual signal.
  const freshCandidates = await dao.getFreshRadarCandidates({
    windowHours: FRESH_WINDOW_HOURS,
    limit: FRESH_LIMIT,
    trustedSourceSlugs: FRESH_TRUSTED_SOURCE_SLUGS,
  });

  const freshCreatedBySource = new Map();
  let freshCreated = 0;
  for (const article of freshCandidates) {
    if (freshCreated >= FRESH_MAX_CREATED_PER_SCAN) break;
    if (!hasSufficientText(article)) continue;

    const sourceSlug = String(article.source_slug || '').trim();
    const srcCount = freshCreatedBySource.get(sourceSlug) || 0;
    if (srcCount >= FRESH_MAX_PER_SOURCE_PER_SCAN) continue;

    const topic = normalizeFreshTopic(article);
    const alreadyFired = await dao.hasRecentSignal(topic, { windowHours: FRESH_EXPIRES_HOURS });
    if (alreadyFired) continue;

    const evidenceCovered = await dao.hasRecentSignalForArticles([article.id], {
      windowHours: FRESH_EXPIRES_HOURS,
      minShared: 1,
    });
    if (evidenceCovered) continue;

    await dao.createSignal({
      detector: 'fresh_major_update',
      topic,
      strength: 100,
      evidence: {
        article_ids: [article.id],
        sources: [article.source_name],
        source_count: 1,
        article_count: 1,
        source_slug: article.source_slug,
        title: article.title,
      },
      expiresInHours: FRESH_EXPIRES_HOURS,
    });
    freshCreated += 1;
    freshCreatedBySource.set(sourceSlug, srcCount + 1);
    created++;
  }

  console.log(`[Radar] ${hits.length} convergence hits, ${created} new signals created, ${suggested} source(s) suggested for review`);
  return created;
}

module.exports = { radarScan };
