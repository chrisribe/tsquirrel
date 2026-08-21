#!/usr/bin/env node
'use strict';

const { Pool } = require('pg');
const { slugify } = require('../lib/slug');

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const ALL = args.has('--all');
const FORCE = args.has('--force');
const MIN_WORDS = 5;
const SHORT_THRESHOLD = 2;

function stemWordCount(slug) {
  const stem = String(slug || '').replace(/-[0-9a-f]{6}$/i, '');
  if (!stem) return 0;
  return stem.split('-').filter(Boolean).length;
}

async function nextUniqueSlug(pool, row, attempt = 0) {
  const candidate = slugify(row.title, {
    minWords: MIN_WORDS,
    maxLength: 140,
    extraTerms: [row.category, ...(Array.isArray(row.tags) ? row.tags : [])],
  });

  const { rows } = await pool.query('SELECT 1 FROM stories WHERE slug = $1 LIMIT 1', [candidate]);
  if (rows.length === 0) return candidate;
  if (attempt >= 7) throw new Error(`Could not generate unique slug for story #${row.id}`);
  return nextUniqueSlug(pool, row, attempt + 1);
}

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let scanned = 0;
  let eligible = 0;
  let updated = 0;

  try {
    const where = ALL ? '' : `WHERE status = 'published'`;
    const { rows } = await pool.query(`
      SELECT id, slug, title, category, tags, status
      FROM stories
      ${where}
      ORDER BY id ASC
    `);

    scanned = rows.length;
    console.log(`[slug-backfill] mode=${APPLY ? 'apply' : 'dry-run'} scope=${ALL ? 'all' : 'published'} scanned=${scanned}`);

    for (const row of rows) {
      const words = stemWordCount(row.slug);
      const shouldUpdate = FORCE ? true : words <= SHORT_THRESHOLD;
      if (!shouldUpdate) continue;

      eligible += 1;
      const newSlug = await nextUniqueSlug(pool, row);
      if (newSlug === row.slug) continue;

      if (!APPLY) {
        console.log(`[dry] #${row.id} ${row.slug} -> ${newSlug}`);
        continue;
      }

      await pool.query('BEGIN');
      try {
        await pool.query(
          `INSERT INTO story_slug_redirects (story_id, old_slug)
           VALUES ($1, $2)
           ON CONFLICT (old_slug) DO NOTHING`,
          [row.id, row.slug]
        );
        await pool.query(
          'UPDATE stories SET slug = $2, updated_at = NOW() WHERE id = $1',
          [row.id, newSlug]
        );
        await pool.query('COMMIT');
        updated += 1;
        console.log(`[ok] #${row.id} ${row.slug} -> ${newSlug}`);
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }
    }

    const { rows: stats } = await pool.query(`
      WITH base AS (
        SELECT slug, regexp_replace(slug, '-[0-9a-f]{6}$', '') AS stem
        FROM stories
        WHERE status = 'published'
      ), wc AS (
        SELECT slug,
               CASE WHEN stem = '' THEN 0 ELSE array_length(regexp_split_to_array(stem, '-'),1) END AS words
        FROM base
      )
      SELECT
        COUNT(*)::int AS published_total,
        COUNT(*) FILTER (WHERE words <= ${SHORT_THRESHOLD})::int AS short_${SHORT_THRESHOLD}_or_less
      FROM wc
    `);

    console.log(`[summary] eligible=${eligible} updated=${updated} published_total=${stats[0].published_total} short_${SHORT_THRESHOLD}_or_less=${stats[0][`short_${SHORT_THRESHOLD}_or_less`]}`);
    if (!APPLY) console.log('Dry run complete. Re-run with --apply to persist changes.');
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('[slug-backfill] failed:', err.message);
  process.exitCode = 1;
});
