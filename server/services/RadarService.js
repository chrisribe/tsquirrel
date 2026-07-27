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
  for (const hit of hits) {
    const alreadyFired = await dao.hasRecentSignal(hit.topic);
    if (alreadyFired) continue;

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

  console.log(`[Radar] ${hits.length} convergence hits, ${created} new signals created`);
  return created;
}

module.exports = { radarScan };
