'use strict';

// LLM-powered story clustering + summarization
// Uses OpenAI-compatible API (set OPENAI_API_KEY or OPENAI_BASE_URL for proxy)

const https = require('https');
const crypto = require('crypto');

const TITLE_STOPWORDS = new Set([
  'a','an','and','are','as','at','be','by','for','from','has','have','in','into','is','it','its','of','on','or','that','the','their','to','was','were','with',
  'year','years','old','new','latest','today','after','before','over','under','amid','about','says','say','found'
]);

const ALLOWED_CATEGORIES = new Set([
  'Politics', 'Business', 'Tech', 'Science', 'Health', 'Sports', 'Entertainment', 'World', 'Environment', 'Crime', 'Other'
]);

const CATEGORY_KEYWORDS = {
  Politics: ['election', 'parliament', 'senate', 'congress', 'minister', 'president', 'white house', 'government', 'policy'],
  Business: ['market', 'earnings', 'ipo', 'merger', 'acquisition', 'stocks', 'investor', 'revenue', 'company'],
  Tech: ['ai', 'software', 'chip', 'semiconductor', 'cyber', 'openai', 'google', 'microsoft', 'apple'],
  Science: ['study', 'research', 'nasa', 'space', 'physics', 'biology', 'climate model', 'scientist'],
  Health: ['hospital', 'cdc', 'who', 'disease', 'vaccine', 'virus', 'health', 'medical'],
  Sports: ['premier league', 'nba', 'nfl', 'mlb', 'fifa', 'match', 'goal', 'transfer', 'coach'],
  Entertainment: ['movie', 'film', 'tv', 'music', 'album', 'celebrity', 'actor', 'actress', 'streaming'],
  World: ['war', 'conflict', 'border', 'diplomatic', 'un', 'earthquake', 'tsunami', 'international'],
  Environment: ['wildfire', 'flood', 'hurricane', 'emissions', 'pollution', 'ecosystem', 'conservation'],
  Crime: ['police', 'arrest', 'court', 'lawsuit', 'shooting', 'murder', 'fraud', 'investigation'],
};

function titleTokenSet(title) {
  const tokens = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !TITLE_STOPWORDS.has(t) && !/^\d+$/.test(t));
  return new Set(tokens);
}

function isClusterCoherent(articles) {
  if (!articles || articles.length < 2) return true;

  const tokenSets = articles.map((a) => titleTokenSet(a.title));
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

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80)
    + '-' + crypto.randomBytes(3).toString('hex');
}

async function callLLM(messages, json = true) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com';
  const model = process.env.SUMMARY_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const payload = JSON.stringify({
    model,
    messages,
    response_format: json ? { type: 'json_object' } : undefined,
    max_tokens: 600,
    temperature: 0.3,
  });

  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}/v1/chat/completions`);
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const content = data.choices?.[0]?.message?.content;
          resolve(json ? JSON.parse(content) : content);
        } catch (e) {
          reject(new Error(`LLM parse error: ${e.message}\nbody: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function cleanSentence(text, { minWords = 8, maxChars = 280 } = {}) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return null;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < minWords) return null;
  if (value.length > maxChars) return `${value.slice(0, maxChars - 1).trimEnd()}…`;
  return value;
}

function cleanTags(tags = [], fallbackTitle = '') {
  const out = [];
  const push = (raw) => {
    const t = String(raw || '').toLowerCase().trim().replace(/[^a-z0-9-\s]/g, '').replace(/\s+/g, '-');
    if (!t || t.length < 3) return;
    if (['news', 'update', 'breaking', 'story'].includes(t)) return;
    if (!out.includes(t)) out.push(t);
  };
  for (const tag of Array.isArray(tags) ? tags : []) push(tag);

  const fallbackWords = String(fallbackTitle || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  for (const w of fallbackWords) {
    if (w.length < 4 || TITLE_STOPWORDS.has(w)) continue;
    push(w);
    if (out.length >= 5) break;
  }
  return out.slice(0, 6);
}

function normalizeCategory(rawCategory, titles = []) {
  const candidate = String(rawCategory || '').trim();
  if (ALLOWED_CATEGORIES.has(candidate)) {
    if (candidate !== 'Other') return candidate;
  }

  const haystack = titles.join(' | ').toLowerCase();
  let best = { category: 'Other', score: 0 };
  for (const [category, words] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const w of words) {
      if (haystack.includes(w)) score += 1;
    }
    if (score > best.score) best = { category, score };
  }

  if (best.score >= 1) return best.category;
  return ALLOWED_CATEGORIES.has(candidate) ? candidate : 'Other';
}

// Group recent unsummarized articles into stories + generate AI summaries
async function processNewArticles(pool) {
  const NewsDAO = require('../dao/NewsDAO');
  const dao = new NewsDAO(pool);

  // Get recent ungrouped articles (last 6h)
  const { rows: articles } = await pool.query(`
    SELECT a.*, s.name AS source_name
    FROM articles a
    JOIN sources s ON s.id = a.source_id
    WHERE a.fetched_at > NOW() - INTERVAL '6 hours'
      AND a.id NOT IN (SELECT article_id FROM story_articles)
    ORDER BY a.published_at DESC
    LIMIT 100
  `);

  if (articles.length === 0) {
    console.log('[SummaryService] No new articles to process');
    return 0;
  }

  // Ask LLM to cluster articles into stories
  const articleList = articles.map((a, i) =>
    `${i}: [${a.source_name}] ${a.title}`
  ).join('\n');

  let clusters;
  try {
    const result = await callLLM([
      {
        role: 'system',
        content: `You are a precise news desk editor.
Group headlines into distinct stories about the same event/topic.
Output JSON only:
{ "stories": [ { "indices": [0,2,5], "title": "Story title", "category": "Politics|Business|Tech|Science|Health|Sports|Entertainment|World|Environment|Crime|Other" } ] }
Rules:
- Only cluster headlines that describe the same event or direct development.
- Singletons are valid and preferred over bad merges.
- Choose category from the allowed list.
- Use "Other" only when none of the listed categories fit.`,
      },
      { role: 'user', content: articleList },
    ]);
    clusters = result.stories || [];
  } catch (err) {
    console.error('[SummaryService] Clustering error:', err.message);
    return 0;
  }

  let storiesCreated = 0;

  for (const cluster of clusters) {
    const clusterArticles = (cluster.indices || []).map(i => articles[i]).filter(Boolean);
    if (clusterArticles.length === 0) continue;

    // Coherence gate: if a multi-article cluster is topically mixed,
    // split into singletons so bad merges never get persisted.
    const clusterUnits = (!isClusterCoherent(clusterArticles) && clusterArticles.length > 1)
      ? clusterArticles.map((a) => [a])
      : [clusterArticles];

    if (clusterUnits.length > 1) {
      console.warn(`[SummaryService] Split incoherent cluster (${clusterArticles.length} → ${clusterUnits.length}) title="${cluster.title || 'untitled'}"`);
    }

    for (const unitArticles of clusterUnits) {
      // Generate summary fields for multi-source stories
      let summary = null;
      let squirrelTake = null;
      let whyItMatters = null;
      let tags = [];
      let sentiment = 0;

      if (unitArticles.length > 1) {
        try {
          const sourceDump = unitArticles.map((a, i) => {
            const desc = String(a.description || '').trim();
            return [
              `[${i + 1}] ${a.source_name}: ${a.title}`,
              `URL: ${a.url}`,
              desc ? `Excerpt: ${desc}` : null,
            ].filter(Boolean).join('\n');
          }).join('\n\n');

          const result = await callLLM([
            {
              role: 'system',
              content: `You are TSquirrel, an editorial synthesis engine for mobile readers.
Return JSON only with keys: summary, squirrel_take, why_it_matters, tags, sentiment.
Rules:
- summary: 2-4 sentences, factual, must add concrete details beyond title.
- squirrel_take: 1-2 sentences, specific and human, include at least one concrete fact/name/number.
- why_it_matters: 1-2 sentences, explain impact on real people or institutions.
- Do NOT use phrases: "multiple outlets are converging", "reinforcing the direction of this story", "review cadence", "governance risk", "signal changes".
- Do NOT repeat the title verbatim.
- tags: 3-6 lowercase topical tags, no generic tags like news/update.
- sentiment: number from -1.0 to 1.0.`,
            },
            {
              role: 'user',
              content: `Story title candidate: ${cluster.title || unitArticles[0].title}\n\nSources:\n${sourceDump}`,
            },
          ]);

          summary = cleanSentence(result.summary, { minWords: 10, maxChars: 480 });
          squirrelTake = cleanSentence(result.squirrel_take, { minWords: 8, maxChars: 220 });
          whyItMatters = cleanSentence(result.why_it_matters, { minWords: 8, maxChars: 260 });
          tags = cleanTags(result.tags, cluster.title || unitArticles[0].title);

          const score = Number(result.sentiment);
          sentiment = Number.isFinite(score) ? Math.max(-1, Math.min(1, score)) : 0;
        } catch (err) {
          console.error('[SummaryService] Summary error:', err.message);
        }
      }

      // Heat score: source count × recency bonus
      const heatScore = unitArticles.length * 10;
      const primaryTitle = (unitArticles[0] && unitArticles[0].title) || cluster.title || 'Story';
      const storyTitle = unitArticles.length > 1 ? (cluster.title || primaryTitle) : primaryTitle;
      const category = normalizeCategory(cluster.category, unitArticles.map((a) => a.title));

      if (!summary) {
        const fallback = unitArticles.map((a) => a.title).slice(0, 2).join('. ');
        summary = cleanSentence(fallback, { minWords: 6, maxChars: 320 }) || primaryTitle;
      }
      if (!squirrelTake && unitArticles.length > 1) {
        squirrelTake = cleanSentence(`Across ${unitArticles.length} outlets, the core facts align but key details are still developing.`, { minWords: 8, maxChars: 220 });
      }
      if (!whyItMatters && unitArticles.length > 1) {
        whyItMatters = cleanSentence('If this trend holds, the practical impact will show up quickly in decisions made by people following this story.', { minWords: 8, maxChars: 240 });
      }

      const story = await dao.upsertStory({
        title: storyTitle,
        slug: slugify(storyTitle),
        summary,
        category,
        tags,
        sentiment,
        heatScore,
        imageUrl: null,
        squirrelTake,
        whyItMatters,
      });

      for (const article of unitArticles) {
        await dao.linkArticleToStory(story.id, article.id);
      }

      storiesCreated++;
    }
  }

  console.log(`[SummaryService] Created/updated ${storiesCreated} stories`);
  return storiesCreated;
}

module.exports = { processNewArticles, slugify };
