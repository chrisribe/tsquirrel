#!/usr/bin/env python3
"""Cluster related article headlines for human or LLM review."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

EVENT_KEYWORDS = {
    "crash": ["crash", "plane crash", "downed", "fatal flight", "air disaster"],
    "investigation": ["investigation", "probe", "investigates", "scrutiny"],
    "whistleblower": ["whistleblower", "whistle-blower", "testimony", "alleges"],
    "hearing": ["hearing", "congress", "parliament", "committee"],
    "lawsuit": ["lawsuit", "sues", "legal action", "court filing"],
    "regulatory": ["faa", "easa", "regulator", "regulatory", "certification"],
    "manufacturing": ["production", "quality control", "factory", "assembly"],
}

PHASE_ADJACENCY = {
    "crash": {"investigation", "whistleblower", "hearing", "regulatory"},
    "investigation": {"crash", "whistleblower", "hearing", "lawsuit", "regulatory"},
    "whistleblower": {"investigation", "hearing", "lawsuit", "regulatory"},
    "hearing": {"investigation", "whistleblower", "lawsuit", "regulatory"},
    "lawsuit": {"investigation", "whistleblower", "hearing", "regulatory"},
    "regulatory": {"investigation", "hearing", "whistleblower", "manufacturing"},
    "manufacturing": {"regulatory", "investigation"},
}


def parse_time(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None


def words(text):
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def extract_entities(title):
    entities = set(re.findall(r"\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b", title))
    entities.update(re.findall(r"\b[A-Z]{2,6}\b", title))
    return sorted(e.strip() for e in entities if len(e.strip()) > 2)


def detect_event_types(title):
    t = title.lower()
    out = set()
    for event_type, keys in EVENT_KEYWORDS.items():
        if any(k in t for k in keys):
            out.add(event_type)
    return out or {"other"}


def extract_anchors(title, url):
    joined = f"{title} {url}"
    anchors = set()
    for m in re.findall(r"\b(?:flight\s*)?(\d{2,5})\b", joined, flags=re.I):
        anchors.add(f"flight:{m}")
    for m in re.findall(r"\b(737\s*MAX|737\s*[- ]?\d{3}|A\d{3})\b", joined, flags=re.I):
        anchors.add("model:" + re.sub(r"\s+", "", m.upper()))
    for m in re.findall(r"\b(?:in|near|over|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b", title):
        anchors.add("place:" + m.lower())
    return anchors


@dataclass
class Meta:
    idx: int
    id: str
    title: str
    url: str
    source_name: str
    published_at: datetime | None
    entities: set
    event_types: set
    anchors: set
    tokens: set


def score_pair(a, b):
    score = 0
    reasons = []

    shared_entities = a.entities.intersection(b.entities)
    if shared_entities:
        score += 40
        reasons.append("+40 same entity: " + ", ".join(sorted(shared_entities)[:3]))

    shared_anchors = a.anchors.intersection(b.anchors)
    if shared_anchors:
        score += 30
        reasons.append("+30 shared anchor: " + ", ".join(sorted(shared_anchors)[:3]))

    adjacent = False
    same_event = a.event_types.intersection(b.event_types)
    if same_event:
        score += 15
        reasons.append("+15 same event type: " + ", ".join(sorted(same_event)))
    else:
        for x in a.event_types:
            if x in PHASE_ADJACENCY and PHASE_ADJACENCY[x].intersection(b.event_types):
                adjacent = True
                break
        if adjacent:
            score += 20
            reasons.append("+20 adjacent lifecycle phase")

    overlap = len(a.tokens.intersection(b.tokens))
    if overlap >= 4:
        score += 10
        reasons.append(f"+10 lexical overlap ({overlap})")

    if a.published_at and b.published_at and not shared_anchors:
        hours = abs((a.published_at - b.published_at).total_seconds()) / 3600
        if hours > 72:
            score -= 15
            reasons.append("-15 far time window (>72h) and no shared anchor")

    if shared_entities and not shared_anchors and not adjacent and not same_event:
        score -= 20
        reasons.append("-20 same entity but weak event linkage")

    return score, reasons


def cluster(items, threshold):
    n = len(items)
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    links = []
    for i in range(n):
        for j in range(i + 1, n):
            s, reasons = score_pair(items[i], items[j])
            if s >= threshold:
                union(i, j)
                links.append({"a": items[i].id, "b": items[j].id, "score": s, "reasons": reasons})

    grouped = defaultdict(list)
    for i in range(n):
        grouped[find(i)].append(i)

    clusters = sorted(grouped.values(), key=lambda g: (-len(g), min(g)))
    return clusters, sorted(links, key=lambda x: -x["score"])


def load_articles(path):
    raw = sys.stdin.read() if path is None else Path(path).read_text(encoding="utf-8")
    data = json.loads(raw)
    if not isinstance(data, list):
        raise ValueError("Input JSON must be an array of articles")
    return data


def build_meta(rows):
    out = []
    for i, row in enumerate(rows):
        title = str(row.get("title") or "").strip()
        if not title:
            continue
        url = str(row.get("url") or "")
        aid = str(row.get("id") or i)
        out.append(
            Meta(
                idx=i,
                id=aid,
                title=title,
                url=url,
                source_name=str(row.get("source_name") or ""),
                published_at=parse_time(row.get("published_at")),
                entities=set(extract_entities(title)),
                event_types=detect_event_types(title),
                anchors=extract_anchors(title, url),
                tokens=words(title),
            )
        )
    return out


def main():
    parser = argparse.ArgumentParser(description="Cluster related article headlines")
    parser.add_argument("--input", "-i", help="Path to JSON array. Omit for stdin.")
    parser.add_argument("--threshold", type=int, default=55, help="Merge threshold (default: 55)")
    parser.add_argument("--table", action="store_true", help="Human readable table output")
    args = parser.parse_args()

    rows = load_articles(args.input)
    items = build_meta(rows)
    clusters, links = cluster(items, threshold=args.threshold)

    result = {"threshold": args.threshold, "article_count": len(items), "clusters": [], "links": links}

    for cid, group in enumerate(clusters, start=1):
        g_items = [items[i] for i in group]
        entity_counts = defaultdict(int)
        for it in g_items:
            for e in it.entities:
                entity_counts[e] += 1
        top_entities = [e for e, _ in sorted(entity_counts.items(), key=lambda kv: (-kv[1], kv[0]))[:3]]

        result["clusters"].append(
            {
                "cluster_id": cid,
                "size": len(g_items),
                "candidate_entities": top_entities,
                "articles": [
                    {
                        "id": it.id,
                        "title": it.title,
                        "source_name": it.source_name,
                        "event_types": sorted(it.event_types),
                        "anchors": sorted(it.anchors),
                    }
                    for it in g_items
                ],
            }
        )

    if args.table:
        print(f"Articles: {len(items)} | Threshold: {args.threshold}")
        for c in result["clusters"]:
            ents = ", ".join(c["candidate_entities"]) if c["candidate_entities"] else "-"
            print(f"\n[Cluster {c['cluster_id']}] size={c['size']} entities={ents}")
            for a in c["articles"]:
                ev = ",".join(a["event_types"])
                print(f"  - ({a['id']}) [{a['source_name']}] {a['title']}  <{ev}>")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
