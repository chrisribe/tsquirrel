#!/usr/bin/env node
'use strict';

const fs = require('fs');

const EVENT_KEYWORDS = {
  crash: ['crash', 'plane crash', 'downed', 'fatal flight', 'air disaster'],
  investigation: ['investigation', 'probe', 'investigates', 'scrutiny'],
  whistleblower: ['whistleblower', 'whistle-blower', 'testimony', 'alleges'],
  hearing: ['hearing', 'congress', 'parliament', 'committee'],
  lawsuit: ['lawsuit', 'sues', 'legal action', 'court filing'],
  regulatory: ['faa', 'easa', 'regulator', 'regulatory', 'certification'],
  manufacturing: ['production', 'quality control', 'factory', 'assembly']
};

const PHASE_ADJACENCY = {
  crash: new Set(['investigation', 'whistleblower', 'hearing', 'regulatory']),
  investigation: new Set(['crash', 'whistleblower', 'hearing', 'lawsuit', 'regulatory']),
  whistleblower: new Set(['investigation', 'hearing', 'lawsuit', 'regulatory']),
  hearing: new Set(['investigation', 'whistleblower', 'lawsuit', 'regulatory']),
  lawsuit: new Set(['investigation', 'whistleblower', 'hearing', 'regulatory']),
  regulatory: new Set(['investigation', 'hearing', 'whistleblower', 'manufacturing']),
  manufacturing: new Set(['regulatory', 'investigation'])
};

function parseArgs(argv) {
  const args = { input: null, threshold: 55, table: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input' || a === '-i') args.input = argv[++i];
    else if (a === '--threshold') args.threshold = Number(argv[++i]);
    else if (a === '--table') args.table = true;
  }
  return args;
}

function parseTime(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function words(text) {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) || []));
}

function extractEntities(title) {
  const entities = new Set();
  for (const m of title.matchAll(/\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g)) {
    if (m[0].trim().length > 2) entities.add(m[0].trim());
  }
  for (const m of title.matchAll(/\b[A-Z]{2,6}\b/g)) {
    if (m[0].trim().length > 2) entities.add(m[0].trim());
  }
  return entities;
}

function detectEventTypes(title) {
  const t = title.toLowerCase();
  const out = new Set();
  for (const [eventType, keys] of Object.entries(EVENT_KEYWORDS)) {
    if (keys.some(k => t.includes(k))) out.add(eventType);
  }
  if (out.size === 0) out.add('other');
  return out;
}

function extractAnchors(title, url) {
  const joined = `${title} ${url || ''}`;
  const anchors = new Set();

  for (const m of joined.matchAll(/\b(?:flight\s*)?(\d{2,5})\b/gi)) {
    anchors.add(`flight:${m[1]}`);
  }
  for (const m of joined.matchAll(/\b(737\s*MAX|737\s*[- ]?\d{3}|A\d{3})\b/gi)) {
    anchors.add(`model:${m[1].replace(/\s+/g, '').toUpperCase()}`);
  }
  for (const m of title.matchAll(/\b(?:in|near|over|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g)) {
    anchors.add(`place:${m[1].toLowerCase()}`);
  }

  return anchors;
}

function intersects(a, b) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

function intersection(a, b) {
  const out = new Set();
  for (const x of a) if (b.has(x)) out.add(x);
  return out;
}

function scorePair(a, b) {
  let score = 0;
  const reasons = [];

  const sharedEntities = intersection(a.entities, b.entities);
  if (sharedEntities.size) {
    score += 40;
    reasons.push(`+40 same entity: ${Array.from(sharedEntities).sort().slice(0, 3).join(', ')}`);
  }

  const sharedAnchors = intersection(a.anchors, b.anchors);
  if (sharedAnchors.size) {
    score += 30;
    reasons.push(`+30 shared anchor: ${Array.from(sharedAnchors).sort().slice(0, 3).join(', ')}`);
  }

  let adjacent = false;
  const sameEvent = intersection(a.eventTypes, b.eventTypes);
  if (sameEvent.size) {
    score += 15;
    reasons.push(`+15 same event type: ${Array.from(sameEvent).sort().join(', ')}`);
  } else {
    for (const x of a.eventTypes) {
      if (PHASE_ADJACENCY[x] && intersects(PHASE_ADJACENCY[x], b.eventTypes)) {
        adjacent = true;
        break;
      }
    }
    if (adjacent) {
      score += 20;
      reasons.push('+20 adjacent lifecycle phase');
    }
  }

  const overlap = intersection(a.tokens, b.tokens).size;
  if (overlap >= 4) {
    score += 10;
    reasons.push(`+10 lexical overlap (${overlap})`);
  }

  if (a.publishedAt && b.publishedAt && sharedAnchors.size === 0) {
    const hours = Math.abs(a.publishedAt.getTime() - b.publishedAt.getTime()) / 36e5;
    if (hours > 72) {
      score -= 15;
      reasons.push('-15 far time window (>72h) and no shared anchor');
    }
  }

  if (sharedEntities.size && !sharedAnchors.size && !adjacent && !sameEvent.size) {
    score -= 20;
    reasons.push('-20 same entity but weak event linkage');
  }

  return { score, reasons };
}

function cluster(items, threshold) {
  const n = items.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  const links = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const { score, reasons } = scorePair(items[i], items[j]);
      if (score >= threshold) {
        union(i, j);
        links.push({ a: items[i].id, b: items[j].id, score, reasons });
      }
    }
  }

  const grouped = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!grouped.has(r)) grouped.set(r, []);
    grouped.get(r).push(i);
  }

  const clusters = Array.from(grouped.values()).sort((a, b) => b.length - a.length || a[0] - b[0]);
  links.sort((a, b) => b.score - a.score);
  return { clusters, links };
}

function readInput(path) {
  const raw = path ? fs.readFileSync(path, 'utf8') : fs.readFileSync(0, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('Input JSON must be an array of articles');
  return data;
}

function buildMeta(rows) {
  const out = [];
  rows.forEach((row, i) => {
    const title = String(row.title || '').trim();
    if (!title) return;
    const url = String(row.url || '');
    out.push({
      idx: i,
      id: String(row.id ?? i),
      title,
      url,
      sourceName: String(row.source_name || ''),
      publishedAt: parseTime(row.published_at),
      entities: extractEntities(title),
      eventTypes: detectEventTypes(title),
      anchors: extractAnchors(title, url),
      tokens: words(title)
    });
  });
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const rows = readInput(args.input);
  const items = buildMeta(rows);
  const { clusters, links } = cluster(items, args.threshold);

  const result = { threshold: args.threshold, article_count: items.length, clusters: [], links };

  clusters.forEach((group, idx) => {
    const groupItems = group.map(i => items[i]);
    const entityCounts = new Map();
    for (const it of groupItems) {
      for (const e of it.entities) entityCounts.set(e, (entityCounts.get(e) || 0) + 1);
    }
    const topEntities = Array.from(entityCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([e]) => e);

    result.clusters.push({
      cluster_id: idx + 1,
      size: groupItems.length,
      candidate_entities: topEntities,
      articles: groupItems.map(it => ({
        id: it.id,
        title: it.title,
        source_name: it.sourceName,
        event_types: Array.from(it.eventTypes).sort(),
        anchors: Array.from(it.anchors).sort()
      }))
    });
  });

  if (args.table) {
    console.log(`Articles: ${items.length} | Threshold: ${args.threshold}`);
    for (const c of result.clusters) {
      const ents = c.candidate_entities.length ? c.candidate_entities.join(', ') : '-';
      console.log(`\n[Cluster ${c.cluster_id}] size=${c.size} entities=${ents}`);
      for (const a of c.articles) {
        console.log(`  - (${a.id}) [${a.source_name}] ${a.title}  <${a.event_types.join(',')}>`);
      }
    }
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

main();
