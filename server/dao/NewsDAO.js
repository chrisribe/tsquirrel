'use strict';

class NewsDAO {
  constructor(pool) {
    this.pool = pool;
  }

  // ── Stories ──────────────────────────────────────────────────

  async getTopStories({ limit = 20, offset = 0, category = null } = {}) {
    const params = [limit, offset];
    let categoryClause = '';
    if (category) {
      params.push(category);
      categoryClause = `AND s.category = $${params.length}`;
    }
    const { rows } = await this.pool.query(`
      SELECT s.*,
             COUNT(sa.article_id) AS source_count
      FROM stories s
      LEFT JOIN story_articles sa ON sa.story_id = s.id
      WHERE s.status = 'published'
      ${categoryClause}
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
      SELECT a.*, src.name AS source_name, src.slug AS source_slug
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

  async upsertArticle({ sourceId, externalId, title, url, publishedAt, description = null }) {
    const { rows } = await this.pool.query(`
      INSERT INTO articles (source_id, external_id, title, url, published_at, description)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (source_id, external_id) DO NOTHING
      RETURNING *
    `, [sourceId, externalId, title, url, publishedAt, description]);
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

  async createDraft({ title, slug, summary, squirrelTake = null, category = 'Other', tags = [], authorType = 'human', authorId = null }) {
    const { rows } = await this.pool.query(`
      INSERT INTO stories (title, slug, summary, squirrel_take, category, tags, status, author_type, author_id, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, NOW())
      RETURNING *
    `, [title, slug, summary, squirrelTake, category, tags, authorType, authorId]);
    return rows[0];
  }

  async updateDraft(id, { title, summary, squirrelTake, category, tags }) {
    const { rows } = await this.pool.query(`
      UPDATE stories SET
        title = $2,
        summary = $3,
        squirrel_take = $4,
        category = $5,
        tags = $6,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, title, summary, squirrelTake, category, tags]);
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
      SELECT a.id, a.title, a.url, a.published_at,
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
}

module.exports = NewsDAO;
