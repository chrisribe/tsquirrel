'use strict';

const https = require('https');
const NewsDAO = require('../dao/NewsDAO');

class PremiumResearchService {
  constructor(pool) {
    this.dao = new NewsDAO(pool);
  }

  async generateBySlug(slug) {
    const story = await this.dao.getPublishedStoryBySlug(slug);
    if (!story) return null;

    const articles = await this.dao.getStoryArticles(story.id);
    const markdown = await this._generateMarkdown(story, articles);

    const model = process.env.PREMIUM_RD_MODEL || 'deepseek/deepseek-v4-flash-0731';
    const updated = await this.dao.setPremiumResearchBrief(story.id, { markdown, model });
    return updated || story;
  }

  async _generateMarkdown(story, articles) {
    const model = process.env.PREMIUM_RD_MODEL || 'deepseek/deepseek-v4-flash-0731';
    const baseUrl = process.env.PREMIUM_RD_BASE_URL || 'https://openrouter.ai/api/v1';
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '';

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY not set (required for premium R&D generation)');
    }

    const sourceDump = (articles || []).slice(0, 12).map((a, idx) => {
      const excerpt = String(a.description || '').replace(/\s+/g, ' ').trim();
      return [
        `[${idx + 1}] ${a.source_name || 'Source'} — ${a.title}`,
        `URL: ${a.url}`,
        excerpt ? `Excerpt: ${excerpt.slice(0, 320)}` : null,
      ].filter(Boolean).join('\n');
    }).join('\n\n');

    const sys = [
      'You are TSquirrel Premium Research Desk.',
      'Write a concise premium R&D brief in markdown only.',
      'No preamble. No code fences.',
      'Ground claims in provided source facts only. If uncertain, say so.',
      'Tone: sharp, practical, decision-grade for operators.',
    ].join(' ');

    const usr = [
      `Story title: ${story.title}`,
      `Category: ${story.category || 'Other'}`,
      `Current summary: ${story.summary || 'n/a'}`,
      '',
      'Use this exact structure:',
      '## Premium R&D Brief',
      '### Strategic read',
      '### Dependency & execution risks',
      '### 12-24 month scenarios',
      '### Decision hooks to monitor',
      '### Confidence labels',
      '',
      'Rules:',
      '- 280-520 words total.',
      '- Be concrete and avoid fluff.',
      '- Mention at least 2 source-backed facts.',
      '- In Confidence labels, split into: Confirmed / Company-claimed / Memo-reported.',
      '',
      'Sources:',
      sourceDump || 'No sources available.',
    ].join('\n');

    const payload = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: usr },
      ],
      temperature: 0.2,
      max_tokens: 900,
    });

    const url = new URL(baseUrl.replace(/\/$/, '') + '/chat/completions');
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(payload),
    };

    if (url.hostname.includes('openrouter.ai')) {
      headers['HTTP-Referer'] = process.env.PUBLIC_URL || 'https://tsquirrel.com';
      headers['X-Title'] = 'TSquirrel Premium R&D';
    }

    const data = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers,
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            return reject(new Error(`Premium R&D API error ${res.statusCode}: ${body.slice(0, 400)}`));
          }
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error(`Premium R&D response parse error: ${err.message}`));
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    const content = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!content) throw new Error('Premium R&D generation returned empty content');
    return content;
  }
}

module.exports = PremiumResearchService;
