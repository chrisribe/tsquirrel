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
      WHERE s.created_at > NOW() - INTERVAL '48 hours'
      ${categoryClause}
      GROUP BY s.id
      ORDER BY s.heat_score DESC, s.created_at DESC
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

  async upsertArticle({ sourceId, externalId, title, url, publishedAt }) {
    const { rows } = await this.pool.query(`
      INSERT INTO articles (source_id, external_id, title, url, published_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (source_id, external_id) DO NOTHING
      RETURNING *
    `, [sourceId, externalId, title, url, publishedAt]);
    return rows[0] || null; // null = already existed
  }

  async linkArticleToStory(storyId, articleId) {
    await this.pool.query(`
      INSERT INTO story_articles (story_id, article_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [storyId, articleId]);
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
