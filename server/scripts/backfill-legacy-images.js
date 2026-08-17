#!/usr/bin/env node
/**
 * Backfill legacy archive image URLs.
 *
 * Strategy:
 * 1) Copy image_url from matching published story by slug.
 * 2) For remaining rows, fetch og:image from legacy source_url.
 *
 * Run:
 *   node scripts/backfill-legacy-images.js
 *   node scripts/backfill-legacy-images.js --dry-run
 */

const { Pool } = require('pg');
const { fetchOgImage, upscaleImage, isLowQualityImage } = require('../services/IngestionService');

const DRY_RUN = process.argv.includes('--dry-run');
const DELAY_MS = 250;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function copyFromStories(pool) {
  const { rowCount } = await pool.query(`
    UPDATE legacy_articles l
    SET image_url = s.image_url,
        image_status = 'ok'
    FROM stories s
    WHERE l.slug = s.slug
      AND s.image_url IS NOT NULL
      AND s.image_url <> ''
      AND (l.image_url IS NULL OR l.image_url = '' OR l.image_url <> s.image_url)
  `);
  console.log(`[copy-from-stories] updated ${rowCount} rows`);
}

async function fillFromSourceUrl(pool) {
  const { rows } = await pool.query(`
    SELECT id, source_url, image_url
    FROM legacy_articles
    WHERE source_url IS NOT NULL
      AND source_url <> ''
      AND (image_url IS NULL OR image_url = '' OR image_status IS DISTINCT FROM 'ok')
    ORDER BY id ASC
  `);

  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    let nextImage = null;
    try {
      const fetched = await fetchOgImage(row.source_url);
      if (fetched) {
        nextImage = upscaleImage(fetched);
      }
    } catch (err) {
      console.warn(`[legacy #${row.id}] og:image fetch error: ${err.message}`);
    }

    if (nextImage && !isLowQualityImage(nextImage)) {
      updated++;
      console.log(`[legacy #${row.id}] + ${nextImage}`);
      if (!DRY_RUN) {
        await pool.query(
          `UPDATE legacy_articles SET image_url = $1, image_status = 'ok' WHERE id = $2`,
          [nextImage, row.id]
        );
      }
    } else {
      failed++;
      if (!DRY_RUN) {
        await pool.query(
          `UPDATE legacy_articles SET image_status = 'failed' WHERE id = $1 AND (image_url IS NULL OR image_url = '')`,
          [row.id]
        );
      }
    }

    await sleep(DELAY_MS);
  }

  console.log(`[fetch-og] updated ${updated} rows; failed ${failed}`);
}

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.log(`Backfill legacy images ${DRY_RUN ? '(dry run)' : ''}`);
    if (!DRY_RUN) await copyFromStories(pool);
    await fillFromSourceUrl(pool);

    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE image_url IS NOT NULL AND image_url <> '')::int AS with_image
      FROM legacy_articles
    `);
    console.log(`[summary] with_image=${rows[0].with_image} / total=${rows[0].total}`);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
