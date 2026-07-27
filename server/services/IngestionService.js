'use strict';

// Ingest RSS / Atom feeds + Hacker News API
// No external deps beyond what's already in package.json — uses Node built-ins

const https = require('https');
const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');

function fetchUrl(rawUrl) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(rawUrl);
    const mod = parsed.protocol === 'https:' ? https : http;
    let body = '';
    mod.get(rawUrl, { headers: { 'User-Agent': 'TSquirrel/1.0 (+https://tsquirrel.com)' } }, (res) => {
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

// Very minimal XML parser — just enough for RSS/Atom
function parseRss(xml) {
  const items = [];
  // Match <item> or <entry> blocks
  const blockRe = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let block;
  while ((block = blockRe.exec(xml)) !== null) {
    const inner = block[1];
    const get = (tag) => {
      // CDATA or plain
      const m = inner.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
      return m ? m[1].trim() : null;
    };
    const link = get('link') || get('id');
    const title = get('title');
    const pubDate = get('pubDate') || get('published') || get('updated');
    if (title && link) {
      items.push({ title, url: link, publishedAt: pubDate ? new Date(pubDate) : new Date() });
    }
  }
  return items;
}

// Fetch HN top stories
async function fetchHN(limit = 30) {
  const body = await fetchUrl('https://hacker-news.firebaseio.com/v0/topstories.json');
  const ids = JSON.parse(body).slice(0, limit);
  const items = [];
  for (const id of ids) {
    try {
      const story = JSON.parse(await fetchUrl(`https://hacker-news.firebaseio.com/v0/item/${id}.json`));
      if (story && story.url && story.title) {
        items.push({
          title: story.title,
          url: story.url,
          publishedAt: new Date(story.time * 1000),
          externalId: String(id),
        });
      }
    } catch (_) { /* skip bad items */ }
  }
  return items;
}

// Fetch RSS/Atom feed
async function fetchRss(feedUrl) {
  const xml = await fetchUrl(feedUrl);
  return parseRss(xml);
}

// Parse Google Trends RSS — extracts ht:news_item articles from each trending topic
function parseGoogleTrends(xml) {
  const items = [];
  const blockRe = /<item>([\s\S]*?)<\/item>/gi;
  let block;
  while ((block = blockRe.exec(xml)) !== null) {
    const inner = block[1];
    // Get the trending topic name for context
    const topicMatch = inner.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const topic = topicMatch ? topicMatch[1].trim() : null;
    const pubMatch = inner.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const pubDate = pubMatch ? new Date(pubMatch[1].trim()) : new Date();

    // Extract each ht:news_item within this trending topic
    const newsRe = /<ht:news_item>([\s\S]*?)<\/ht:news_item>/gi;
    let news;
    while ((news = newsRe.exec(inner)) !== null) {
      const ni = news[1];
      const getHt = (tag) => {
        const m = ni.match(new RegExp(`<ht:${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/ht:${tag}>`, 'i'));
        return m ? m[1].trim() : null;
      };
      const title = getHt('news_item_title');
      const url = getHt('news_item_url');
      if (title && url) {
        items.push({ title, url, publishedAt: pubDate, trendTopic: topic });
      }
    }
  }
  return items;
}

// Fetch Google Trends trending now
async function fetchGoogleTrends(geo = 'CA') {
  const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;
  const xml = await fetchUrl(url);
  return parseGoogleTrends(xml);
}

// Derive a stable external ID from URL
function urlHash(url) {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
}

// Main ingest — called by cron
async function ingestAll(pool) {
  const NewsDAO = require('../dao/NewsDAO');
  const dao = new NewsDAO(pool);

  const sources = await dao.getActiveSources();
  let newCount = 0;

  for (const source of sources) {
    try {
      let items = [];
      if (source.type === 'hn') {
        items = await fetchHN(30);
      } else if (source.type === 'trends') {
        // Google Trends — geo extracted from slug suffix (e.g. google-trends-ca → CA)
        const geo = (source.slug.split('-').pop() || 'CA').toUpperCase();
        items = await fetchGoogleTrends(geo);
      } else if (source.feed_url) {
        items = await fetchRss(source.feed_url);
      }

      for (const item of items) {
        const externalId = item.externalId || urlHash(item.url);
        const article = await dao.upsertArticle({
          sourceId: source.id,
          externalId,
          title: item.title,
          url: item.url,
          publishedAt: item.publishedAt,
        });
        if (article) newCount++;
      }
      console.log(`[IngestionService] ${source.name}: ingested ${items.length} items`);
    } catch (err) {
      console.error(`[IngestionService] Error ingesting ${source.name}:`, err.message);
    }
  }

  console.log(`[IngestionService] Done — ${newCount} new articles`);
  return newCount;
}

module.exports = { ingestAll, fetchHN, fetchRss, fetchGoogleTrends, urlHash };
