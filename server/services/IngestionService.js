'use strict';

// Ingest RSS / Atom feeds + Hacker News API
// No external deps beyond what's already in package.json — uses Node built-ins

const https = require('https');
const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');

function fetchUrl(rawUrl, { timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(rawUrl);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(rawUrl, { headers: { 'User-Agent': 'TSquirrel/1.0 (+https://tsquirrel.com)' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    if (timeoutMs) {
      req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timed out fetching ${rawUrl}`)));
    }
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
    const description = get('description') || get('summary');
    const imageUrl = extractImage(inner);
    if (title && link) {
      items.push({
        title,
        url: link,
        publishedAt: pubDate ? new Date(pubDate) : new Date(),
        description: description ? stripTags(description).slice(0, 1000) : null,
        imageUrl,
      });
    }
  }
  return items;
}

// Strip HTML tags from a snippet (RSS descriptions often contain markup)
function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Pull the first usable image URL out of an RSS/Atom item block.
// Priority: media:content (image-typed) > media:thumbnail > enclosure > itunes:image
// > <image><url> > first <img src> in content:encoded/description.
// media:content is preferred because feeds typically put their largest/full-size
// image there and reserve media:thumbnail for a small preview variant.
// No extra HTTP requests — everything comes from the feed XML we already have.
function extractImage(inner) {
  const attrUrl = (tag) => {
    const m = inner.match(new RegExp(`<${tag}\\b[^>]*\\burl\\s*=\\s*["']([^"']+)["']`, 'i'));
    return m ? m[1] : null;
  };
  const mediaContent = inner.match(/<media:content\b[^>]*\burl\s*=\s*["']([^"']+)["'][^>]*>/i);
  const img =
    (mediaContent && /image|jpg|jpeg|png|gif|webp/i.test(mediaContent[0]) ? mediaContent[1] : null) ||
    attrUrl('media:thumbnail') ||
    attrUrl('enclosure') ||
    attrUrl('itunes:image');
  if (img) return upscaleImage(decodeEntities(img));
  const imageTag = inner.match(/<image\b[^>]*>[\s\S]*?<url>([\s\S]*?)<\/url>[\s\S]*?<\/image>/i);
  if (imageTag) return upscaleImage(decodeEntities(imageTag[1].trim()));
  const imgTag = inner.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  if (imgTag) return upscaleImage(decodeEntities(imgTag[1]));
  return null;
}

// Per-source image URL upscalers, keyed by hostname pattern. Each rewrites a
// low-res thumb variant to a higher-res one served from the same CDN/image id.
// To support a new source, add one entry here — no changes needed elsewhere.
const IMAGE_UPSCALERS = [
  {
    // BBC: ".../standard/240/..." -> ".../standard/1024/..." (same image id, higher res)
    host: /bbci?\.co\.uk/i,
    rewrite: (url) => url.replace(/\/standard\/(\d+)\//i, (match, width) => (
      Number(width) < 1024 ? '/standard/1024/' : match
    )),
  },
  {
    // Ars Technica (WordPress): "...name-1152x648.jpg" is a generated resize of
    // "...name.jpg" — stripping the "-WIDTHxHEIGHT" suffix recovers the original,
    // usually much larger, upload. Falls back harmlessly if the original 404s
    // (thumb <img onerror> already swaps in the category fallback icon).
    host: /arstechnica\.net/i,
    rewrite: (url) => url.replace(/-(\d+)x(\d+)(?=\.(?:jpe?g|png|webp|gif)(?:$|\?))/i, (match, width) => (
      Number(width) < 1600 ? '' : match
    )),
  },
];

function upscaleImage(url) {
  if (!url) return url;
  const rule = IMAGE_UPSCALERS.find(({ host }) => host.test(url));
  return rule ? rule.rewrite(url) : url;
}

// Some feed-provided images are too small/opaque to upscale in place:
// - Google Trends: opaque encrypted-tbn token, no resizable URL param at all.
// - Guardian: the ?width= param is covered by a server-side signature (s=),
//   so rewriting width invalidates the signature and 404s/401s — the only
//   fix is fetching a fresh (larger) image URL from the article itself.
// Treat these (and any missing image) as "low quality" and try a real
// og:image from the article page instead.
function isLowQualityImage(url) {
  if (!url) return true;
  if (/encrypted-tbn\d*\.gstatic\.com/i.test(url)) return true;
  if (/\bi\.guim\.co\.uk\b/i.test(url)) {
    const m = url.match(/[?&]width=(\d+)/i);
    if (m && Number(m[1]) < 300) return true;
  }
  return false;
}

// Best-effort fetch of an article page's og:image (falls back to twitter:image)
// for sources whose feed payload has no usable image. Called lazily by
// StoryService when an article is actually attached to a story — not during
// bulk ingestion — so we only ever pay for it on articles that matter.
async function fetchOgImage(pageUrl) {
  try {
    const html = await fetchUrl(pageUrl, { timeoutMs: 5000 });
    const patterns = [
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m) {
        // og:image content is occasionally a root-relative path (e.g. a site
        // logo/placeholder SVG) rather than an absolute URL — resolve it
        // against the article's own origin, since a relative path is
        // meaningless once stored standalone in our DB.
        let resolved;
        try {
          resolved = new URL(decodeEntities(m[1]), pageUrl).toString();
        } catch (_) {
          continue;
        }
        if (!/^https?:\/\//i.test(resolved)) continue;
        return upscaleImage(resolved);
      }
    }
  } catch (err) {
    console.warn(`[IngestionService] og:image fetch failed for ${pageUrl}: ${err.message}`);
  }
  return null;
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&#38;/g, '&').trim();
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
        items.push({ title, url, publishedAt: pubDate, trendTopic: topic, imageUrl: getHt('news_item_picture') });
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

        // No og:image fetch here — ingestion just stores whatever the feed
        // gives us for the ~25k articles that pile up, most of which never
        // become a story. Fetching a better image is deferred until an
        // article is actually attached to a story (see StoryService), so we
        // only ever pay for it on the handful of articles that matter.
        const article = await dao.upsertArticle({
          sourceId: source.id,
          externalId,
          title: item.title,
          url: item.url,
          publishedAt: item.publishedAt,
          description: item.description || null,
          imageUrl: item.imageUrl || null,
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

module.exports = { ingestAll, fetchHN, fetchRss, fetchGoogleTrends, urlHash, upscaleImage, fetchOgImage, isLowQualityImage };
