'use strict';

const NewsDAO = require('../dao/NewsDAO');
const { radarScan } = require('./RadarService');
const { slugify } = require('../lib/slug');

class SignalService {
  constructor(pool) {
    this.pool = pool;
    this.dao = new NewsDAO(pool);
  }

  async getSignalsModel(status = 'active') {
    const signals = await this.dao.getSignals({ status });

    // Build a lookup of article_id -> article for evidence rendering
    const allArticleIds = new Set();
    for (const sig of signals) {
      const evidence = typeof sig.evidence === 'string' ? JSON.parse(sig.evidence) : (sig.evidence || {});
      (evidence.article_ids || []).forEach(id => allArticleIds.add(id));
    }
    const articles = await this.dao.getArticlesByIds([...allArticleIds]);
    const articleMap = {};
    for (const a of articles) articleMap[a.id] = a;

    return { signals, filter: status, articleMap };
  }

  async scan() {
    return radarScan(this.pool);
  }

  async createStoryFromSignal(signalId) {
    const signal = await this.dao.getSignalById(signalId);
    if (!signal) return null;

    const evidence = typeof signal.evidence === 'string' ? JSON.parse(signal.evidence) : (signal.evidence || {});
    const articleIds = evidence.article_ids || [];
    const articles = await this.dao.getArticlesByIds(articleIds);
    const lead = articles.find(a => a.image_url)?.image_url || null;

    const title = signal.topic.replace(/\b\w/g, c => c.toUpperCase());
    const slugExtraTerms = [
      ...(articles || []).slice(0, 3).map(a => a?.title || ''),
      ...(articles || []).slice(0, 2).map(a => a?.source_name || ''),
      'tsquirrel',
    ];

    const draft = await this.dao.createDraft({
      title,
      slug: slugify(title, {
        minWords: 5,
        maxLength: 140,
        extraTerms: slugExtraTerms,
      }),
      summary: null,
      squirrelTake: null,
      category: 'Other',
      tags: [],
      authorType: 'radar',
      authorId: `signal-${signal.id}`,
      imageUrl: lead,
    });
    for (const articleId of articleIds) {
      await this.dao.attachSource(draft.id, articleId);
    }
    await this.dao.linkSignalToStory(signal.id, draft.id);

    return draft;
  }

  async dismiss(signalId) {
    return this.dao.setSignalStatus(signalId, 'dismissed');
  }
}

module.exports = SignalService;
