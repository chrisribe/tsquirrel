'use strict';

const NewsDAO = require('../dao/NewsDAO');
const { slugify } = require('../lib/slug');
const { isLowQualityImage, fetchOgImage } = require('./IngestionService');

const TITLE_STOPWORDS = new Set([
  'a','an','and','are','as','at','be','by','for','from','has','have','in','into','is','it','its','of','on','or','that','the','their','to','was','were','with',
  'year','years','old','new','latest','today','after','before','over','under','amid','about','says','say','found'
]);

const BOILERPLATE_PATTERNS = [
  /this (story|article|development) (highlights|underscores|shows|demonstrates)/i,
  /in (today'?s|the current) (world|landscape)/i,
  /important reminder/i,
  /it remains to be seen/i,
  /broadly speaking/i,
  /this could have significant implications/i,
  /source mix:/i,
  /operational and legal risk/i,
  /map the next (one|two|three) decision checkpoints/i,
  /do not break timelines/i,
  /the next official moves will likely set the pace/i,
  /multiple outlets are converging on the same facts/i,
  /reinforcing the direction of this story/i,
  /delivery and governance risk/i,
  /review cadence/i,
  /signal changes/i,
  /staffing and legal controls/i,
];

// Core story domain service. Owns all NewsDAO access for stories and returns
// raw domain data (stories, articles, suggestions, booleans). Presentation
// shaping — admin page-view models vs JSON payloads — lives in the wrapping
// StoryAdminService / ApiStoryService. Input validation lives at those
// boundaries too; this service assumes it is handed already-normalized values.
class StoryService {
  constructor(pool) {
    this.dao = new NewsDAO(pool);
  }

  _deriveFallbackTags(story) {
    const stop = new Set([
      'the', 'and', 'for', 'with', 'from', 'into', 'over', 'under', 'after', 'before',
      'amid', 'amidst', 'about', 'that', 'this', 'these', 'those',
      'are', 'was', 'were', 'will', 'have', 'has', 'had', 'been', 'being',
      'new', 'news', 'says', 'said', 'just', 'more', 'less', 'several',
      'they', 'them', 'their', 'there', 'here', 'when', 'where', 'while',
      'what', 'who', 'whom', 'whose', 'which', 'into', 'onto', 'than'
    ]);
    const words = String(story?.title || '')
      .toLowerCase()
      .replace(/\b[a-z]+\'/g, (m) => m.slice(0, -1))
      .match(/[a-z0-9]+/g) || [];
    const tags = [];
    for (const w of words) {
      if (w.length < 4 || stop.has(w)) continue;
      if (!tags.includes(w)) tags.push(w);
      if (tags.length >= 3) break;
    }
    const category = String(story?.category || '').toLowerCase().trim();
    if (category && category !== 'other' && !tags.includes(category)) tags.unshift(category);
    return tags.slice(0, 4);
  }

  // ── Reads ────────────────────────────────────────────────────────────────
  listForAdmin({
    status = null,
    needsReview = null,
    limit = 50,
    offset = 0,
    page = 1,
    perPage = 50,
    sort = null,
    order = 'desc',
  } = {}) {
    return this.dao.getStoriesForAdmin({ status, needsReview, limit, offset, page, perPage, sort, order });
  }

  getById(storyId) {
    return this.dao.getStoryById(storyId);
  }

  getArticles(storyId) {
    return this.dao.getStoryArticles(storyId);
  }

  getSuggestions(storyId) {
    return this.dao.getSuggestedSources(storyId);
  }

  getRecentArticles(options = {}) {
    return this.dao.getRecentArticles(options);
  }

  getArticlesByIds(ids = []) {
    return this.dao.getArticlesByIds(ids);
  }

  // ── Mutations ──────────────────────────────────────────────────────────────
  async create(values, { authorType, authorId }) {
    const draft = await this.dao.createDraft({
      ...values,
      slug: slugify(values.title),
      authorType,
      authorId: String(authorId),
    });
    for (const articleId of values.articleIds || []) {
      await this.dao.attachSource(draft.id, articleId);
      await this._upgradeImageIfNeeded(articleId);
    }
    return draft;
  }

  update(storyId, values) {
    return this.dao.updateDraft(storyId, values);
  }

  async attach(storyId, articleId) {
    if (!Number.isFinite(articleId)) return;
    await this.dao.attachSource(storyId, articleId);
    await this._upgradeImageIfNeeded(articleId);
  }

  async detach(storyId, articleId) {
    if (Number.isFinite(articleId)) await this.dao.detachSource(storyId, articleId);
  }

  async acceptSuggestion(storyId, articleId) {
    if (!Number.isFinite(articleId)) return false;
    const result = await this.dao.acceptSuggestion(storyId, articleId);
    await this._upgradeImageIfNeeded(articleId);
    return result;
  }

  rejectSuggestion(storyId, articleId) {
    if (!Number.isFinite(articleId)) return false;
    return this.dao.rejectSuggestion(storyId, articleId);
  }

  // Lazily fetch a real og:image for an article only at the moment it's
  // actually attached to a story — this is the only point where an article
  // graduates from "raw ingested noise" to "something a reader will see", so
  // it's the only point worth paying for an extra HTTP request per article.
  async _upgradeImageIfNeeded(articleId) {
    try {
      const [article] = await this.dao.getArticlesByIds([articleId]);
      if (!article) return;
      if (!isLowQualityImage(article.image_url)) return;
      const ogImage = await fetchOgImage(article.url);
      if (ogImage) await this.dao.updateArticleImage(articleId, ogImage);
    } catch (err) {
      console.warn(`[StoryService] og:image upgrade failed for article #${articleId}:`, err.message);
    }
  }

  async _ensureStoryImageQuality(storyId, story = null) {
    const current = story || await this.dao.getStoryById(storyId);
    if (!current) return;
    if (current.image_url && !isLowQualityImage(current.image_url)) return;

    const articles = await this.dao.getStoryArticles(storyId);
    for (const a of articles) {
      if (isLowQualityImage(a.image_url) && a.url) {
        const ogImage = await fetchOgImage(a.url);
        if (ogImage) await this.dao.updateArticleImage(a.id, ogImage);
      }
    }

    const refreshed = await this.dao.getStoryArticles(storyId);
    const best = refreshed.map((a) => a.image_url).find((u) => u && !isLowQualityImage(u)) || null;
    await this.dao.setStoryImage(storyId, best);
  }

  async getPublishPreflight(storyId) {
    const story = await this.dao.getStoryById(storyId);
    if (!story) return null;
    const blockerDetails = await this._getPublishBlockers(storyId, { story, includeAlreadyPublished: true });
    return {
      story_id: storyId,
      can_publish: blockerDetails.length === 0,
      blockers: blockerDetails.map((b) => b.message),
      blocker_details: blockerDetails,
    };
  }

  async getEditorialAudit(storyId) {
    const story = await this.dao.getStoryById(storyId);
    if (!story) return null;
    const blockerDetails = await this._getPublishBlockers(storyId, { story, includeAlreadyPublished: false });
    return {
      story_id: storyId,
      status: String(story.status || '').toLowerCase() || null,
      passes_editorial_contract: blockerDetails.length === 0,
      blockers: blockerDetails.map((b) => b.message),
      blocker_details: blockerDetails,
    };
  }

  async setStatus(storyId, status) {
    if (status === 'published') {
      const story = await this.dao.getStoryById(storyId);
      if (story && String(story.status || '').toLowerCase() === 'published') return story;
      if (story && this._looksBoilerplate(story.why_it_matters)) {
        // Prefer hiding weak filler over publishing obvious template text.
        await this.dao.setWhyItMatters(storyId, null);
      }
      if (story && (!Array.isArray(story.tags) || story.tags.length === 0)) {
        const fallbackTags = this._deriveFallbackTags(story);
        if (fallbackTags.length > 0) await this.dao.setTags(storyId, fallbackTags);
      }

      // Keep source list clean at publish time. If duplicate URLs are attached,
      // retain the newest article per URL and detach the rest.
      await this._dedupeStorySources(storyId);
      await this._ensureStoryImageQuality(storyId, story);

      const blockers = await this._getPublishBlockers(storyId);
      if (blockers.length > 0) {
        await this.dao.setNeedsReview(storyId, true);
        const error = new Error(`Publish blocked: ${blockers.map((b) => b.message).join('; ')}`);
        error.status = 400;
        error.code = 'publish_blocked';
        error.blockers = blockers;
        throw error;
      }
    }
    return this.dao.setStoryStatus(storyId, status);
  }

  async _getPublishBlockers(storyId, { story = null, includeAlreadyPublished = true } = {}) {
    const currentStory = story || await this.dao.getStoryById(storyId);
    if (!currentStory) return [];

    const blockers = [];
    if (includeAlreadyPublished && String(currentStory.status || '').toLowerCase() === 'published') {
      return [this._buildBlocker('already_published', 'story is already published')];
    }

    const title = String(currentStory.title || '').trim();
    const titleWords = title.split(/\s+/).filter(Boolean);
    if (titleWords.length < 4) {
      blockers.push(this._buildBlocker('title_too_short', 'title must be at least 4 words', { field: 'title' }));
    }

    const summary = String(currentStory.summary || '').trim();
    if (!summary) {
      blockers.push(this._buildBlocker('summary_required', 'summary is required', { field: 'summary' }));
    } else if (this._isTitleParrot(summary, title)) {
      blockers.push(this._buildBlocker('summary_duplicates_title', 'summary should add facts beyond the title', { field: 'summary' }));
    }

    const squirrelTake = String(currentStory.squirrel_take || '').trim();
    if (!squirrelTake) {
      blockers.push(this._buildBlocker('squirrel_take_required', 'squirrel_take is required', { field: 'squirrel_take' }));
    } else {
      if (this._looksBoilerplate(squirrelTake)) {
        blockers.push(this._buildBlocker('squirrel_take_boilerplate', 'squirrel_take looks generic/boilerplate', { field: 'squirrel_take' }));
      }
      if (this._isTitleParrot(squirrelTake, title)) {
        blockers.push(this._buildBlocker('squirrel_take_title_parrot', 'squirrel_take should not restate the title', { field: 'squirrel_take' }));
      }
    }

    const whyItMatters = String(currentStory.why_it_matters || '').trim();
    if (!whyItMatters) {
      blockers.push(this._buildBlocker('why_it_matters_required', 'why_it_matters is required', { field: 'why_it_matters' }));
    } else if (this._looksBoilerplate(whyItMatters)) {
      blockers.push(this._buildBlocker('why_it_matters_boilerplate', 'why_it_matters looks generic/boilerplate', { field: 'why_it_matters' }));
    }

    const articles = await this.dao.getStoryArticles(storyId);
    const duplicateSources = this._findDuplicateSourceUrls(articles);
    if (duplicateSources.length > 0) {
      blockers.push(this._buildBlocker(
        'duplicate_source_urls',
        `story has duplicate source URLs (${duplicateSources.length})`,
        { field: 'sources', meta: { duplicate_urls: duplicateSources } }
      ));
    }
    if (articles.length > 1 && !this._isClusterCoherent(articles)) {
      blockers.push(this._buildBlocker(
        'sources_cluster_mismatch',
        'attached sources are not topically coherent (cluster mismatch)',
        { field: 'sources' }
      ));
    }

    const dupes = await this.dao.findPublishedStoryDuplicates(storyId);
    if (dupes.length > 0) {
      const refs = dupes.slice(0, 3).map((d) => `#${d.id}`).join(', ');
      blockers.push(this._buildBlocker(
        'duplicate_published_story',
        `likely duplicate of published story (${refs})`,
        { field: 'story', meta: { candidate_ids: dupes.slice(0, 3).map((d) => d.id) } }
      ));
    }

    return blockers;
  }

  _buildBlocker(code, message, { field = null, meta = null } = {}) {
    const out = { code, message };
    if (field) out.field = field;
    if (meta && typeof meta === 'object' && Object.keys(meta).length > 0) out.meta = meta;
    return out;
  }

  _normalizeUrlForDedup(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      parsed.hash = '';
      parsed.search = '';
      const path = parsed.pathname.replace(/\/+$/, '') || '/';
      return `${parsed.hostname.toLowerCase()}${path.toLowerCase()}`;
    } catch (_) {
      return raw.toLowerCase().replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/+$/, '');
    }
  }

  _findDuplicateSourceUrls(articles = []) {
    const seen = new Set();
    const duplicates = new Set();
    for (const article of articles) {
      const key = this._normalizeUrlForDedup(article?.url);
      if (!key) continue;
      if (seen.has(key)) duplicates.add(key);
      else seen.add(key);
    }
    return [...duplicates];
  }

  async _dedupeStorySources(storyId, articles = null) {
    const rows = Array.isArray(articles) ? articles : await this.dao.getStoryArticles(storyId);
    if (rows.length < 2) return 0;

    const keepByUrl = new Set();
    const removeIds = [];
    for (const article of rows) {
      const key = this._normalizeUrlForDedup(article?.url);
      if (!key) continue;
      if (keepByUrl.has(key)) {
        if (Number.isFinite(article.id)) removeIds.push(article.id);
        continue;
      }
      keepByUrl.add(key);
    }

    for (const articleId of removeIds) {
      await this.dao.detachSource(storyId, articleId);
    }
    return removeIds.length;
  }

  _isTitleParrot(candidate, title) {
    const c = String(candidate || '').trim();
    const t = String(title || '').trim();
    if (!c || !t) return false;

    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const cNorm = norm(c);
    const tNorm = norm(t);

    if (cNorm === tNorm) return true;
    if (cNorm.startsWith(tNorm)) return true;

    const cTokens = this._titleTokenSet(cNorm);
    const tTokens = this._titleTokenSet(tNorm);
    if (tTokens.size === 0 || cTokens.size === 0) return false;

    let overlap = 0;
    for (const token of tTokens) {
      if (cTokens.has(token)) overlap += 1;
    }
    return (overlap / tTokens.size) >= 0.85;
  }

  _looksBoilerplate(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length < 7) return true;
    return BOILERPLATE_PATTERNS.some((rx) => rx.test(value));
  }

  _titleTokenSet(title) {
    const tokens = String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !TITLE_STOPWORDS.has(t) && !/^\d+$/.test(t));
    return new Set(tokens);
  }

  _isClusterCoherent(articles) {
    if (!articles || articles.length < 2) return true;

    const tokenSets = articles.map((a) => this._titleTokenSet(a.title));
    let pairs = 0;
    let overlapPairs = 0;
    let totalBestJaccard = 0;

    for (let i = 0; i < tokenSets.length; i++) {
      let best = 0;
      for (let j = 0; j < tokenSets.length; j++) {
        if (i === j) continue;
        const a = tokenSets[i];
        const b = tokenSets[j];
        const inter = [...a].filter((t) => b.has(t)).length;
        const union = new Set([...a, ...b]).size;
        const jacc = union === 0 ? 0 : inter / union;
        if (jacc > best) best = jacc;
        if (j > i) {
          pairs += 1;
          if (inter > 0) overlapPairs += 1;
        }
      }
      totalBestJaccard += best;
    }

    const overlapRatio = pairs === 0 ? 1 : overlapPairs / pairs;
    const avgBestJaccard = totalBestJaccard / tokenSets.length;

    return overlapRatio >= 0.34 || avgBestJaccard >= 0.2;
  }

  setFeatured(storyId, featured) {
    return this.dao.setFeatured(storyId, featured);
  }

  delete(storyId) {
    return this.dao.deleteStory(storyId);
  }
}

module.exports = StoryService;
