#!/usr/bin/env node
'use strict';

const { Pool } = require('pg');

const apply = process.argv.includes('--apply');
const hours = Number.parseInt(process.env.TSQ_BACKFILL_MIN_HOURS || '24', 10);

if (!Number.isFinite(hours) || hours < 1) {
  console.error('TSQ_BACKFILL_MIN_HOURS must be a positive integer');
  process.exit(1);
}

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const query = `
      SELECT id, slug, title, author_type, created_at, published_at, updated_at,
             EXTRACT(EPOCH FROM (published_at - created_at))/3600 AS delta_hours
      FROM stories
      WHERE status = 'published'
        AND published_at IS NOT NULL
        AND created_at IS NOT NULL
        AND published_at >= NOW() - INTERVAL '7 days'
        AND published_at - created_at >= ($1::int * INTERVAL '1 hour')
        AND updated_at = published_at
      ORDER BY published_at DESC
      LIMIT 500
    `;

    const { rows } = await pool.query(query, [hours]);

    if (!apply) {
      console.log(JSON.stringify({
        mode: 'dry-run',
        min_hours: hours,
        candidates: rows.length,
        sample: rows.slice(0, 30),
      }, null, 2));
      return;
    }

    const ids = rows.map(r => r.id);
    if (ids.length === 0) {
      console.log(JSON.stringify({ mode: 'apply', min_hours: hours, updated: 0, ids: [] }, null, 2));
      return;
    }

    const update = await pool.query(`
      UPDATE stories
      SET published_at = created_at,
          updated_at = NOW()
      WHERE id = ANY($1::int[])
      RETURNING id, slug, created_at, published_at
    `, [ids]);

    console.log(JSON.stringify({
      mode: 'apply',
      min_hours: hours,
      candidates: rows.length,
      updated: update.rowCount,
      ids,
      sample: update.rows.slice(0, 30),
    }, null, 2));
  } finally {
    await pool.end();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
