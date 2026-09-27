'use strict';

const NewsDAO = require('../dao/NewsDAO');
const { radarScan } = require('./RadarService');
const { slugify } = require('../lib/slug');

const intEnv = (name, fallback) => {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const DUPLICATE_TOPIC_WINDOW_HOURS = intEnv('TSQ_DUPLICATE_TOPIC_WINDOW_HOURS', 96);

const TITLE_STOPWORDS = new Set([
  'a','an','and','are','as','at','be','by','for','from','has','have','in','into','is','it','its','of','on','or','that','the','their','to','was','were','with',
  'year','years','old','new','latest','today','after','before','over','under','amid','about','says','say','found'
]);

const titleTokenSet = (text) => {
  const tokens = String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const out = new Set();
  for (const t of tokens) {
    if (t.length < 3 || TITLE_STOPWORDS.has(t)) continue;
    out.add(t);
  }
  return out;
};

const findRecentTopicDuplicate = (title, recent = [], minTokenOverlap = 0.6) => {
  const base = titleTokenSet(title);
  if (base.size < 3) return null;

  let best = null;
  for (const candidate of recent) {
    const cand = titleTokenSet(candidate?.title || '');
    if (cand.size < 3) continue;

    let shared = 0;
    for (const t of base) {
      if (cand.has(t)) shared += 1;
    }
    const overlap = shared / Math.max(1, Math.min(base.size, cand.size));
    if (shared >= 3 && overlap >= minTokenOverlap) {
      const row = { id: candidate.id, title: candidate.title, overlap, shared };
      if (!best || row.overlap > best.overlap || (row.overlap === best.overlap && row.shared > best.shared)) {
        best = row;
      }
    }
  }

  return best;
};

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

    // Guard 1: if evidence already maps to a published story, do not create
    // a duplicate draft. Record any new evidence as suggestions instead.
    const existingStory = await this.dao.findStoryForArticles(articleIds);
    if (existingStory) {
      const attachedIds = new Set(existingStory.attached_ids || []);
      const newIds = articleIds.filter(id => !attachedIds.has(id));
      if (newIds.length > 0) {
        await this.dao.suggestSources(existingStory.id, newIds, `signal:${signal.id}:${signal.topic}`);
      }
      await this.dao.linkSignalToStory(signal.id, existingStory.id);
      return existingStory;
    }

    const title = signal.topic.replace(/\b\w/g, c => c.toUpperCase());

    // Guard 2: title/topic near-duplicate window (default 96h).
    const recent = await this.dao.listRecentPublishedStories({
      hours: DUPLICATE_TOPIC_WINDOW_HOURS,
      limit: 40,
    });
    const near = findRecentTopicDuplicate(title, recent, 0.6);
    if (near) {
      await this.dao.linkSignalToStory(signal.id, near.id);
      return await this.dao.getStoryById(near.id);
    }

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
