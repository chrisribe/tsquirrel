'use strict';

// RadarService — Signal-first news discovery
// Orchestrates the convergence detector (implemented in NewsDAO) and turns
// results into persisted signals. Contains NO SQL — all queries live in NewsDAO.
// See docs/NEWS-RADAR.md for the design rationale.

const NewsDAO = require('../dao/NewsDAO');

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

  console.log(`[Radar] ${hits.length} convergence hits, ${created} new signals created, ${suggested} source(s) suggested for review`);
  return created;
}

module.exports = { radarScan };
