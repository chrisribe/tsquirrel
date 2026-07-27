'use strict';

// Minimal cron scheduler — no external deps
// Runs feed ingestion every 30 min, LLM summarization every hour

function schedule(intervalMs, fn, label) {
  // Run once on startup after a short delay, then on interval
  setTimeout(async () => {
    try { await fn(); } catch (e) { console.error(`[Cron:${label}] Error:`, e.message); }
    setInterval(async () => {
      try { await fn(); } catch (e) { console.error(`[Cron:${label}] Error:`, e.message); }
    }, intervalMs);
  }, 5000);
}

function startCron(pool) {
  const { ingestAll } = require('./IngestionService');
  const { radarScan } = require('./RadarService');

  const INGEST_INTERVAL = parseInt(process.env.INGEST_INTERVAL_MS) || 6 * 60 * 60 * 1000;   // 6h default — kept low-frequency during initial testing; tune via INGEST_INTERVAL_MS

  schedule(INGEST_INTERVAL, async () => {
    await ingestAll(pool);
    await radarScan(pool);
  }, 'ingest+radar');

  // NOTE: SummaryService auto-curation is intentionally NOT scheduled.
  // TSquirrel hosts & links curated content; it does not auto-forge stories.
  // Stories are authored manually (admin UI) or via /api/v1 (external contributors),
  // and always go live only through an explicit publish. See architecture.md refactor #15.

  console.log(`[Cron] Scheduled: ingest + radar scan every ${Math.round(INGEST_INTERVAL / 3600000 * 10) / 10}h (auto-summarize retired)`);
}

module.exports = { startCron };
