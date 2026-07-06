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
  const { ingestAll } = require('./FeedService');
  const { processNewArticles } = require('./SummaryService');

  const INGEST_INTERVAL = parseInt(process.env.INGEST_INTERVAL_MS) || 30 * 60 * 1000;   // 30 min
  const SUMMARY_INTERVAL = parseInt(process.env.SUMMARY_INTERVAL_MS) || 60 * 60 * 1000; // 1 hour

  schedule(INGEST_INTERVAL, () => ingestAll(pool), 'ingest');
  schedule(SUMMARY_INTERVAL, () => processNewArticles(pool), 'summary');

  console.log('[Cron] Scheduled: ingest every 30m, summarize every 1h');
}

module.exports = { startCron };
