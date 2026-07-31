'use strict';

class NewsDAO {
  constructor(pool) {
    this.pool = pool;
  }

  // ── Stories ──────────────────────────────────────────────────

  async getTopStories({ limit = 20, offset = 0, category = null, tag = null } = {}) {
    const params = [limit, offset];
    let categoryClause = '';
    if (category) {
      params.push(category);
      categoryClause = `AND s.category = $${params.length}`;
    }
    let tagClause = '';
    if (tag) {
      params.push(tag);
      tagClause = `AND $${params.length} = ANY(s.tags)`;
    }
    const { rows } = await this.pool.query(`
      SELECT s.*,
             COUNT(sa.article_id) AS source_count
      FROM stories s
      LEFT JOIN story_articles sa ON sa.story_id = s.id
      WHERE s.status = 'published'
      ${categoryClause}
      ${tagClause}
      GROUP BY s.id
      ORDER BY s.is_featured DESC, s.published_at DESC NULLS LAST, s.heat_score DESC
      LIMIT $1 OFFSET $2
    `, params);
    return rows;
  }

  async getStoryBySlug(slug) {
    const { rows } = await this.pool.query(`
      SELECT s.*,
             COUNT(sa.article_id) AS source_count
      FROM stories s
      LEFT JOIN story_articles sa ON sa.story_id = s.id
      WHERE s.slug = $1
      GROUP BY s.id
    `, [slug]);
    return rows[0] || null;
  }

  async getPublishedStoryBySlug(slug) {
    const { rows } = await this.pool.query(`
      SELECT s.*,
             COUNT(sa.article_id) AS source_count
      FROM stories s
      LEFT JOIN story_articles sa ON sa.story_id = s.id
      WHERE s.slug = $1 AND s.status = 'published'
      GROUP BY s.id
    `, [slug]);
    return rows[0] || null;
  }

  async getStoryById(id) {
    const { rows } = await this.pool.query(`
      SELECT s.*,
             COUNT(sa.article_id) AS source_count
      FROM stories s
      LEFT JOIN story_articles sa ON sa.story_id = s.id
      WHERE s.id = $1
      GROUP BY s.id
    `, [id]);
    return rows[0] || null;
  }

  async getStoryArticles(storyId) {
    const { rows } = await this.pool.query(`
      SELECT a.*, src.name AS source_name, src.slug AS source_slug, src.type AS source_type
      FROM story_articles sa
      JOIN articles a ON a.id = sa.article_id
      JOIN sources src ON src.id = a.source_id
      WHERE sa.story_id = $1
      ORDER BY a.published_at DESC
    `, [storyId]);
    return rows;
  }

  async getCategories() {
    const { rows } = await this.pool.query(`
      SELECT category, COUNT(*) AS count
      FROM stories
      WHERE category IS NOT NULL
        AND created_at > NOW() - INTERVAL '48 hours'
      GROUP BY category
      ORDER BY count DESC
    `);
    return rows;
  }

  // "Keep digging" — related stories surfaced at the end of a story read.
  // Same category or shared tag first (same beat), topped up with the
  // highest-convergence recent story overall ("also chattering right now").
  async getRelatedStories(storyId, { category = null, tags = [], limit = 3 } = {}) {
    const { rows: beatRows } = await this.pool.query(`
      SELECT s.*, COUNT(sa.article_id) AS source_count
      FROM stories s
      LEFT JOIN story_articles sa ON sa.story_id = s.id
      WHERE s.status = 'published'
        AND s.id != $1
        AND (s.category = $2 OR s.tags && $3)
      GROUP BY s.id
      ORDER BY s.published_at DESC NULLS LAST, s.heat_score DESC
      LIMIT $4
    `, [storyId, category, tags, limit]);

    if (beatRows.length >= limit) return beatRows;

    const excludeIds = [storyId, ...beatRows.map(r => r.id)];
    const { rows: chatterRows } = await this.pool.query(`
      SELECT s.*, COUNT(sa.article_id) AS source_count
      FROM stories s
      LEFT JOIN story_articles sa ON sa.story_id = s.id
      WHERE s.status = 'published'
        AND NOT (s.id = ANY($1::int[]))
      GROUP BY s.id
      ORDER BY s.heat_score DESC, s.published_at DESC NULLS LAST
      LIMIT $2
    `, [excludeIds, limit - beatRows.length]);

    return [...beatRows, ...chatterRows];
  }

  async upsertStory({ title, slug, summary, category, tags, sentiment, heatScore, imageUrl, squirrelTake = null }) {
    const { rows } = await this.pool.query(`
      INSERT INTO stories (title, slug, summary, category, tags, sentiment, heat_score, image_url, squirrel_take, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (slug) DO UPDATE SET
        summary = EXCLUDED.summary,
        category = EXCLUDED.category,
        tags = EXCLUDED.tags,
        sentiment = EXCLUDED.sentiment,
        heat_score = EXCLUDED.heat_score,
        image_url = COALESCE(EXCLUDED.image_url, stories.image_url),
        squirrel_take = COALESCE(EXCLUDED.squirrel_take, stories.squirrel_take),
        updated_at = NOW()
      RETURNING *
    `, [title, slug, summary, category, tags, sentiment, heatScore, imageUrl, squirrelTake]);
    return rows[0];
  }

  // ── Articles ──────────────────────────────────────────────────

  async upsertArticle({ sourceId, externalId, title, url, publishedAt, description = null, imageUrl = null }) {
    const { rows } = await this.pool.query(`
      INSERT INTO articles (source_id, external_id, title, url, published_at, description, image_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (source_id, external_id) DO NOTHING
      RETURNING *
    `, [sourceId, externalId, title, url, publishedAt, description, imageUrl]);
    return rows[0] || null; // null = already existed
  }

  // Search articles for the admin "attach source" picker — title + description match,
  // optional source filter, excludes articles already attached to the story being edited.
  async searchAvailableArticles({ q = '', sourceSlug = null, excludeIds = [], limit = 20 } = {}) {
    const params = [];
    const clauses = [];

    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      clauses.push(`(a.title ILIKE $${params.length} OR a.description ILIKE $${params.length})`);
    }
    if (sourceSlug) {
      params.push(sourceSlug);
      clauses.push(`src.slug = $${params.length}`);
    }
    if (excludeIds.length > 0) {
      params.push(excludeIds);
      clauses.push(`a.id != ALL($${params.length}::int[])`);
    }

    params.push(limit);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await this.pool.query(`
      SELECT a.id, a.title, a.description, a.url, a.published_at,
             src.name AS source_name, src.slug AS source_slug
      FROM articles a
      JOIN sources src ON src.id = a.source_id
      ${where}
      ORDER BY a.fetched_at DESC
      LIMIT $${params.length}
    `, params);
    return rows;
  }

  async linkArticleToStory(storyId, articleId) {
    await this.pool.query(`
      INSERT INTO story_articles (story_id, article_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [storyId, articleId]);
  }

  // ── Story authoring / lifecycle (manual publishing flow) ──────

  async createDraft({ title, slug, summary, squirrelTake = null, whyItMatters = null, category = 'Other', tags = [], authorType = 'human', authorId = null, imageUrl = null }) {
    const { rows } = await this.pool.query(`
      INSERT INTO stories (title, slug, summary, squirrel_take, why_it_matters, category, tags, status, author_type, author_id, image_url, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9, $10, NOW())
      RETURNING *
    `, [title, slug, summary, squirrelTake, whyItMatters, category, tags, authorType, authorId, imageUrl]);
    return rows[0];
  }

  async updateDraft(id, { title, summary, squirrelTake, whyItMatters, category, tags, imageUrl = undefined }) {
    if (imageUrl === undefined) {
      const { rows } = await this.pool.query(`
        UPDATE stories SET
          title = $2,
          summary = $3,
          squirrel_take = $4,
          why_it_matters = $5,
          category = $6,
          tags = $7,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id, title, summary, squirrelTake, whyItMatters, category, tags]);
      return rows[0] || null;
    }
    const { rows } = await this.pool.query(`
      UPDATE stories SET
        title = $2,
        summary = $3,
        squirrel_take = $4,
        why_it_matters = $5,
        category = $6,
        tags = $7,
        image_url = $8,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, title, summary, squirrelTake, whyItMatters, category, tags, imageUrl]);
    return rows[0] || null;
  }

  // heat_score is DYNAMIC: recomputed as source_count × 10 on every link change.
  async recomputeHeatScore(storyId) {
    await this.pool.query(`
      UPDATE stories SET heat_score = (
        SELECT COUNT(*) * 10 FROM story_articles WHERE story_id = $1
      ) WHERE id = $1
    `, [storyId]);
  }

  async attachSource(storyId, articleId) {
    await this.linkArticleToStory(storyId, articleId);
    await this.recomputeHeatScore(storyId);
  }

  async detachSource(storyId, articleId) {
    await this.pool.query(
      'DELETE FROM story_articles WHERE story_id = $1 AND article_id = $2',
      [storyId, articleId]
    );
    await this.recomputeHeatScore(storyId);
  }

  async setStoryStatus(id, status) {
    const publishedClause = status === 'published' ? ', published_at = COALESCE(published_at, NOW())' : '';
    const { rows } = await this.pool.query(`
      UPDATE stories SET status = $2, updated_at = NOW() ${publishedClause}
      WHERE id = $1
      RETURNING *
    `, [id, status]);
    return rows[0] || null;
  }

  async setFeatured(id, featured) {
    const { rows } = await this.pool.query(
      'UPDATE stories SET is_featured = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id, featured]
    );
    return rows[0] || null;
  }

  async deleteStory(id) {
    await this.pool.query('DELETE FROM stories WHERE id = $1', [id]);
  }

  async getStoriesForAdmin({ status = null } = {}) {
    const params = [];
    let statusClause = '';
    if (status) {
      params.push(status);
      statusClause = `WHERE s.status = $1`;
    }
    const { rows } = await this.pool.query(`
      SELECT s.*,
             COUNT(sa.article_id) AS source_count
      FROM stories s
      LEFT JOIN story_articles sa ON sa.story_id = s.id
      ${statusClause}
      GROUP BY s.id
      ORDER BY
        CASE s.status WHEN 'draft' THEN 0 WHEN 'published' THEN 1 ELSE 2 END,
        s.updated_at DESC
    `, params);
    return rows;
  }

  async getRecentArticles({ limit = 100 } = {}) {
    const { rows } = await this.pool.query(`
      SELECT a.id, a.title, a.url, a.published_at, a.fetched_at,
             src.name AS source_name, src.slug AS source_slug
      FROM articles a
      JOIN sources src ON src.id = a.source_id
      ORDER BY a.fetched_at DESC
      LIMIT $1
    `, [limit]);
    return rows;
  }

  async getArticlesByIds(ids) {
    if (!ids || ids.length === 0) return [];
    const { rows } = await this.pool.query(`
      SELECT a.id, a.title, a.url, a.published_at, a.image_url, a.description,
             src.name AS source_name, src.slug AS source_slug
      FROM articles a
      JOIN sources src ON src.id = a.source_id
      WHERE a.id = ANY($1::int[])
      ORDER BY a.published_at DESC
    `, [ids]);
    return rows;
  }

  // ── Sources ──────────────────────────────────────────────────

  async getActiveSources(type = null) {
    const params = [];
    let typeClause = '';
    if (type) {
      params.push(type);
      typeClause = `AND type = $1`;
    }
    const { rows } = await this.pool.query(
      `SELECT * FROM sources WHERE active = TRUE ${typeClause} ORDER BY name`,
      params
    );
    return rows;
  }

  async getSourceBySlug(slug) {
    const { rows } = await this.pool.query(
      'SELECT * FROM sources WHERE slug = $1',
      [slug]
    );
    return rows[0] || null;
  }

  async setSourceActive(id, active) {
    const { rows } = await this.pool.query(
      'UPDATE sources SET active = $2 WHERE id = $1 RETURNING *',
      [id, active]
    );
    return rows[0] || null;
  }

  async getSourceStats() {
    const { rows } = await this.pool.query(`
      SELECT src.*,
             COUNT(a.id) AS article_count,
             MAX(a.fetched_at) AS last_fetched_at,
             MAX(a.published_at) AS last_published_at
      FROM sources src
      LEFT JOIN articles a ON a.source_id = src.id
      GROUP BY src.id
      ORDER BY src.name
    `);
    return rows;
  }

  async getArticlesBySource(sourceId, { limit = 50 } = {}) {
    const { rows } = await this.pool.query(`
      SELECT id, title, url, published_at, fetched_at
      FROM articles
      WHERE source_id = $1
      ORDER BY fetched_at DESC
      LIMIT $2
    `, [sourceId, limit]);
    return rows;
  }

  // ── Legacy archive ────────────────────────────────────────────

  async getLegacyArticles() {
    const { rows } = await this.pool.query(`
      SELECT id, slug, title, description, source_url, created_at
      FROM legacy_articles
      ORDER BY id ASC
    `);
    return rows;
  }

  // ── Radar signals ────────────────────────────────────────────

  // Convergence detector: find bigrams (word pairs) shared by 2+ sources within a time window.
  // Titles are lowercased + stripped of punctuation before splitting, so matching is
  // case/format insensitive (see docs/NEWS-RADAR.md for rationale + stopword list source).
  async detectConvergence({ windowHours = 48, minSources = 2, limit = 30 } = {}) {
    const { rows } = await this.pool.query(`
      WITH recent AS (
        SELECT a.id, a.source_id, lower(a.title) AS title, a.fetched_at, s.name AS source_name
        FROM articles a
        JOIN sources s ON s.id = a.source_id
        WHERE a.fetched_at > NOW() - ($3 || ' hours')::interval
      ),
      words AS (
        SELECT id, source_id, source_name,
               unnest(string_to_array(
                 regexp_replace(lower(title), '[^a-z0-9 ]', ' ', 'g'),
                 ' '
               )) AS word,
               generate_subscripts(string_to_array(
                 regexp_replace(lower(title), '[^a-z0-9 ]', ' ', 'g'),
                 ' '
               ), 1) AS pos
        FROM recent
      ),
      clean AS (
        SELECT * FROM words
        WHERE length(word) >= 3
          AND word NOT IN (
            'the','and','for','are','but','not','you','all','can','had','her','was','one','our',
            'has','his','how','its','new','now','say','she','too','use','says','said','been',
            'have','from','they','will','with','this','that','what','when','your','more','some',
            'than','them','into','just','also','each','like','many','most','only','over','such',
            'about','after','being','could','every','first','found','other','right','still',
            'think','three','under','where','which','while','would','years','before','during',
            'should','their','there','these','those','through','people',
            'news','says','report','watch','live','breaking','update','latest','video','opinion'
          )
      ),
      bigrams AS (
        SELECT a.id, a.source_id, a.source_name,
               a.word || ' ' || b.word AS phrase
        FROM clean a
        JOIN clean b ON a.id = b.id AND b.pos = a.pos + 1
      )
      SELECT phrase AS topic,
             COUNT(DISTINCT source_id) AS source_count,
             COUNT(DISTINCT id) AS article_count,
             array_agg(DISTINCT source_name ORDER BY source_name) AS source_names,
             array_agg(DISTINCT id) AS article_ids
      FROM bigrams
      WHERE length(phrase) >= 7
      GROUP BY phrase
      HAVING COUNT(DISTINCT source_id) >= $1
      ORDER BY COUNT(DISTINCT source_id) DESC, COUNT(DISTINCT id) DESC
      LIMIT $2
    `, [minSources, limit, String(windowHours)]);
    return rows;
  }

  // True if a non-dismissed signal for this topic already fired within the dedup window.
  async hasRecentSignal(topic, { windowHours = 48 } = {}) {
    const { rows } = await this.pool.query(`
      SELECT id FROM signals
      WHERE topic = $1
        AND status != 'dismissed'
        AND fired_at > NOW() - ($2 || ' hours')::interval
      LIMIT 1
    `, [topic, String(windowHours)]);
    return rows.length > 0;
  }

  async createSignal({ detector, topic, strength, evidence, expiresInHours = 48 }) {
    const { rows } = await this.pool.query(`
      INSERT INTO signals (detector, topic, strength, evidence, status, fired_at, expires_at)
      VALUES ($1, $2, $3, $4, 'new', NOW(), NOW() + ($5 || ' hours')::interval)
      RETURNING *
    `, [detector, topic, strength, JSON.stringify(evidence), String(expiresInHours)]);
    return rows[0];
  }

  // status: null/'active' → new+reviewed, not expired. 'all' → everything. else exact match.
  async getSignals({ status = 'active', limit = 50 } = {}) {
    const params = [limit];
    let whereClause;
    if (!status || status === 'active') {
      whereClause = `WHERE status NOT IN ('used', 'dismissed') AND (expires_at IS NULL OR expires_at > NOW())`;
    } else if (status === 'all') {
      whereClause = '';
    } else {
      params.push(status);
      whereClause = `WHERE status = $2`;
    }
    const { rows } = await this.pool.query(`
      SELECT * FROM signals
      ${whereClause}
      ORDER BY strength DESC, fired_at DESC
      LIMIT $1
    `, params);
    return rows;
  }

  async setSignalStatus(id, status) {
    const { rows } = await this.pool.query(
      'UPDATE signals SET status = $2 WHERE id = $1 RETURNING *',
      [id, status]
    );
    return rows[0] || null;
  }

  async linkSignalToStory(signalId, storyId) {
    await this.pool.query(
      `UPDATE signals SET status = 'used', story_id = $2 WHERE id = $1`,
      [signalId, storyId]
    );
  }

  async getSignalById(id) {
    const { rows } = await this.pool.query('SELECT * FROM signals WHERE id = $1', [id]);
    return rows[0] || null;
  }
}

module.exports = NewsDAO;
