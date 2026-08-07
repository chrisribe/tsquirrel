'use strict';

// LLM-powered story clustering + summarization
// Uses OpenAI-compatible API (set OPENAI_API_KEY or OPENAI_BASE_URL for proxy)

const https = require('https');
const crypto = require('crypto');

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
        content: `You are a news editor. Group these article headlines into distinct stories (topics). 
Return JSON: { "stories": [ { "indices": [0,2,5], "title": "Story title", "category": "Technology|Politics|Business|Science|World|Sports|Entertainment|Other" } ] }
Only group articles that are genuinely about the same event/topic. Singletons are fine.`,
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

    // Generate summary for multi-source stories
    let summary = null;
    if (clusterArticles.length > 1) {
      try {
        const headlines = clusterArticles.map(a => `- [${a.source_name}] ${a.title}`).join('\n');
        const result = await callLLM([
          {
            role: 'system',
            content: 'You are TSquirrel, a concise news editor. Write a 2-3 sentence neutral summary of the story covered by these headlines, PLUS one "squirrel_take" line (max 18 words) that states a concrete implication from the headlines. Avoid mascot catchphrases, slogans, and imperative advice (no lines starting with verbs like "Watch", "Focus", "Scurry"). If no clear implication is supported, return squirrel_take as an empty string. Return JSON: { "summary": "...", "squirrel_take": "...", "tags": ["tag1","tag2"], "sentiment": 0.0 } where sentiment is -1 (negative) to 1 (positive).',
          },
          { role: 'user', content: headlines },
        ]);
        summary = result.summary || null;
        cluster.squirrelTake = result.squirrel_take || null;
        cluster.tags = result.tags || [];
        cluster.sentiment = result.sentiment || 0;
      } catch (err) {
        console.error('[SummaryService] Summary error:', err.message);
      }
    }

    // Heat score: source count × recency bonus
    const heatScore = clusterArticles.length * 10;

    const story = await dao.upsertStory({
      title: cluster.title,
      slug: slugify(cluster.title),
      summary,
      category: cluster.category || 'Other',
      tags: cluster.tags || [],
      sentiment: cluster.sentiment || 0,
      heatScore,
      imageUrl: null,
      squirrelTake: cluster.squirrelTake || null,
    });

    for (const article of clusterArticles) {
      await dao.linkArticleToStory(story.id, article.id);
    }

    storiesCreated++;
  }

  console.log(`[SummaryService] Created/updated ${storiesCreated} stories`);
  return storiesCreated;
}

module.exports = { processNewArticles, slugify };
