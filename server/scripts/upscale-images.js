#!/usr/bin/env node
/**
 * Backfill: upscale existing stored image URLs to higher-res variants.
 *
 * Two passes:
 *  1. URL-rewrite upscale — applies the same IMAGE_UPSCALERS rules used at
 *     ingestion time to every image_url already saved in `stories` and
 *     `articles`, updating only rows where the rule actually produces a
 *     different (larger) URL. No network calls.
 *  2. og:image backfill — for `articles` rows whose image is missing or
 *     known low-quality (opaque Google thumbnail, tiny Guardian crop, etc.),
 *     fetches the article page and pulls a real og:image/twitter:image.
 *     One HTTP GET per qualifying row, run sequentially with a small delay
 *     to be polite to source sites. Stories whose image is still low-quality
 *     afterward are then synced from their best linked article's image.
 *
 * Run:      npm run upscale-images
 * Dry run:  npm run upscale-images -- --dry-run
 * Docker:   docker compose exec server npm run upscale-images
 */

const { Pool } = require('pg');
const { upscaleImage, fetchOgImage, isLowQualityImage } = require('../services/IngestionService');

const DRY_RUN = process.argv.includes('--dry-run');
const OG_FETCH_DELAY_MS = 250;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function backfillTable(pool, table) {
  const { rows } = await pool.query(
    `SELECT id, image_url FROM ${table} WHERE image_url IS NOT NULL AND image_url <> ''`
  );

  let changed = 0;
  for (const { id, image_url } of rows) {
    const upgraded = upscaleImage(image_url);
    if (upgraded && upgraded !== image_url) {
      changed++;
      console.log(`[${table} #${id}]`);
      console.log(`  - ${image_url}`);
      console.log(`  + ${upgraded}`);
      if (!DRY_RUN) {
        await pool.query(`UPDATE ${table} SET image_url = $1 WHERE id = $2`, [upgraded, id]);
      }
    }
  }
  console.log(`\n${table}: ${changed} of ${rows.length} rows ${DRY_RUN ? 'would be' : ''} updated.\n`);
  return changed;
}

// Pass 2a: fetch a real og:image for articles whose stored image is missing
// or known low-quality. Sequential + delayed — this can be dozens/hundreds
// of extra HTTP requests, so it's opt-in via --og-images (or --full).
// Pass 2a: fetch a real og:image for articles whose stored image is missing
// or known low-quality. Scoped to articles actually linked to a story
// (story_articles) — those are the only ones a reader will ever see; the
// other ~25k ingested-but-unused articles are left alone and only get a
// better image lazily, on demand, if/when they're later attached to a story
// (see StoryService._upgradeImageIfNeeded).
async function backfillArticleOgImages(pool) {
  const { rows } = await pool.query(
    `SELECT DISTINCT a.id, a.url, a.image_url
     FROM articles a
     JOIN story_articles sa ON sa.article_id = a.id
     WHERE a.url IS NOT NULL AND a.url <> ''`
  );
  const candidates = rows.filter(r => isLowQualityImage(r.image_url));

  console.log(`\n[og:image] ${candidates.length} of ${rows.length} story-linked articles have missing/low-quality images.\n`);

  let changed = 0;
  for (const { id, url, image_url } of candidates) {
    let ogImage = null;
    try {
      ogImage = await fetchOgImage(url);
    } catch (err) {
      console.warn(`[og:image] articles #${id} fetch error: ${err.message}`);
    }
    if (ogImage && ogImage !== image_url) {
      changed++;
      console.log(`[articles #${id}]`);
      console.log(`  - ${image_url || '(none)'}`);
      console.log(`  + ${ogImage}`);
      if (!DRY_RUN) {
        await pool.query(`UPDATE articles SET image_url = $1 WHERE id = $2`, [ogImage, id]);
      }
    }
    await sleep(OG_FETCH_DELAY_MS);
  }
  console.log(`\narticles (og:image): ${changed} of ${candidates.length} candidates ${DRY_RUN ? 'would be' : ''} updated.\n`);
  return changed;
}

// Pass 2b: re-sync a story's image from its best linked article whenever the
// story's own image is still missing/low-quality — picks the first linked
// article (by position) that now has a good image after pass 2a.
async function backfillStoryImagesFromArticles(pool) {
  const { rows: stories } = await pool.query(
    `SELECT id, image_url FROM stories`
  );
  const candidates = stories.filter(s => isLowQualityImage(s.image_url));

  let changed = 0;
  for (const { id, image_url } of candidates) {
    const { rows: linked } = await pool.query(
      `SELECT a.image_url
       FROM story_articles sa
       JOIN articles a ON a.id = sa.article_id
       WHERE sa.story_id = $1
       ORDER BY sa.article_id
       LIMIT 20`,
      [id]
    );
    const best = linked.map(r => r.image_url).find(img => !isLowQualityImage(img));
    if (best && best !== image_url) {
      changed++;
      console.log(`[stories #${id}]`);
      console.log(`  - ${image_url || '(none)'}`);
      console.log(`  + ${best}`);
      if (!DRY_RUN) {
        await pool.query(`UPDATE stories SET image_url = $1 WHERE id = $2`, [best, id]);
      }
    }
  }
  console.log(`\nstories (synced from articles): ${changed} of ${candidates.length} candidates ${DRY_RUN ? 'would be' : ''} updated.\n`);
  return changed;
}

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const doOgImages = process.argv.includes('--og-images') || process.argv.includes('--full');
  try {
    console.log(`\n=== Upscale stored images ${DRY_RUN ? '(dry run)' : ''} ===\n`);
    let total = 0;
    for (const table of ['stories', 'articles']) {
      total += await backfillTable(pool, table);
    }
    if (doOgImages) {
      total += await backfillArticleOgImages(pool);
      total += await backfillStoryImagesFromArticles(pool);
    } else {
      console.log('Skipping og:image backfill (pass --og-images or --full to enable — does one HTTP GET per low-quality article).');
    }
    console.log(`Done. ${total} rows ${DRY_RUN ? 'would be' : ''} updated.`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
