'use strict';

const NewsDAO = require('../dao/NewsDAO');

// Admin service for news sources (RSS/HN feeds) — ingestion configuration.
// "Source" here means a feed we ingest from, distinct from a story's attached
// source articles (handled by StoryService).
class SourceAdminService {
  constructor(pool) {
    this.dao = new NewsDAO(pool);
  }

  async getDashboardModel() {
    const sources = await this.dao.getSourceStats();
    return { sources };
  }

  async getSourceModel(slug) {
    const source = await this.dao.getSourceBySlug(slug);
    if (!source) return null;
    const articles = await this.dao.getArticlesBySource(source.id, { limit: 50 });
    return { source, articles };
  }

  async toggleSource(slug) {
    const source = await this.dao.getSourceBySlug(slug);
    if (!source) return null;
    await this.dao.setSourceActive(source.id, !source.active);
    return source;
  }
}

module.exports = SourceAdminService;
