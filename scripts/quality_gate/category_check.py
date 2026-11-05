#!/usr/bin/env python3
"""LLM category check for TSquirrel stories.

Replaces GLiNER category enrichment (~45% agreement). Eval on 50 recent
published stories (2026-11-05): current categories 32/50, this prompt 44/50.

Usage:
  python3 category_check.py --story-id 1422 [--apply]
  python3 category_check.py --backfill [--limit N] [--apply]   # batch, published stories
"""
import argparse
import json
import os
import sys
import time

LOG_PATH = os.environ.get("TSQ_CATEGORY_LOG", "/tmp/tsquirrel_category_check.log")

# Lateral swaps the eval showed are judgement calls, not fixes: skip to avoid churn.
SKIP_SWAPS = {("AI", "Technology"), ("Politics", "World"), ("World", "Politics")}


def log(msg):
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}"
    print(line, file=sys.stderr, flush=True)
    try:
        with open(LOG_PATH, "a") as fh:
            fh.write(line + "\n")
    except OSError:
        pass

from common import BASE, OR_BASE, OR_CLIENT_TITLE, OR_HTTP_REFERER, QG_MODEL, api_req, get_tokens

CATEGORIES = [
    "Politics", "World", "Business", "Technology", "AI", "Science",
    "Health", "Environment", "Sports", "Entertainment", "Crime", "Other",
]

PROMPT = (
    "Classify each news story into exactly one category from: {cats}. "
    "Pick the PRIMARY subject. Use 'Other' only if nothing fits. "
    "AI = stories primarily about artificial intelligence (models, AI companies, AI policy). "
    "Politics = government, elections, courts and policy in any country. "
    "Sports includes athletes and sports business. Entertainment includes celebrities. "
    "World = international affairs/disasters/wars outside a more specific category. "
    "Return a JSON object mapping story id to category, e.g. {{\"123\": \"Politics\"}}.\n\n{items}"
)


def _line(story):
    summary = str(story.get("summary") or "").replace("\n", " ")[:220]
    return f'{story["id"]}: {story.get("title") or ""} — {summary}'


def classify(or_key, stories):
    """Return ({story_id: category}, cost). Unknown/invalid answers are omitted."""
    if not stories:
        return {}, 0.0
    payload = {
        "model": QG_MODEL,
        "temperature": 0,
        "max_tokens": 3000,
        "reasoning": {"enabled": False},
        "response_format": {"type": "json_object"},
        "usage": {"include": True},
        "messages": [{
            "role": "user",
            "content": PROMPT.format(cats=", ".join(CATEGORIES), items="\n".join(_line(s) for s in stories)),
        }],
    }
    status, out = api_req(
        "POST", f"{OR_BASE}/chat/completions", token=or_key, data=payload,
        headers={"HTTP-Referer": OR_HTTP_REFERER, "X-Title": OR_CLIENT_TITLE}, timeout=120,
    )
    if status != 200 or not isinstance(out, dict):
        return {}, 0.0
    cost = float(((out.get("usage") or {}).get("cost")) or 0.0)
    content = (out.get("choices") or [{}])[0].get("message", {}).get("content") or "{}"
    start, end = content.find("{"), content.rfind("}")
    try:
        raw = json.loads(content[start:end + 1]) if start >= 0 else {}
    except Exception:
        return {}, cost
    result = {}
    for k, v in (raw or {}).items():
        try:
            sid = int(k)
        except (TypeError, ValueError):
            continue
        if v in CATEGORIES:
            result[sid] = v
    return result, cost


def get_story(tsq, sid):
    status, payload = api_req("GET", f"{BASE}/api/v1/stories/{sid}", token=tsq, timeout=30)
    if status != 200 or not isinstance(payload, dict):
        return None
    return payload.get("story", payload)


def apply_categories(tsq, stories, predicted, apply):
    changes = []
    for s in stories:
        new = predicted.get(int(s["id"]))
        old = s.get("category")
        if not new or new == old:
            continue
        # Never demote a real category to Other; skip known judgement-call swaps.
        if new == "Other" or (old, new) in SKIP_SWAPS:
            continue
        row = {"story_id": s["id"], "from": s.get("category"), "to": new, "title": s.get("title")}
        if apply:
            st, _ = api_req("PATCH", f"{BASE}/api/v1/stories/{s['id']}", token=tsq, data={"category": new})
            row["status"] = st
        changes.append(row)
    return changes


def check_and_fix(tsq, or_key, story_ids, apply=True, batch=25):
    log(f"start: {len(story_ids)} ids apply={apply}")
    stories = []
    for n, sid in enumerate(story_ids, 1):
        s = get_story(tsq, sid)
        if s:
            stories.append(s)
        if n % 100 == 0:
            log(f"fetched {n}/{len(story_ids)}")
    changes, cost = [], 0.0
    total_batches = (len(stories) + batch - 1) // batch
    for b, i in enumerate(range(0, len(stories), batch), 1):
        chunk = stories[i:i + batch]
        pred, c = classify(or_key, chunk)
        cost += c
        got = apply_categories(tsq, chunk, pred, apply)
        changes += got
        log(f"batch {b}/{total_batches}: predicted={len(pred)}/{len(chunk)} changed={len(got)} total_changed={len(changes)} cost=${cost:.5f}")
    log(f"done: checked={len(stories)} changed={len(changes)} cost=${cost:.5f}")
    return changes, cost, len(stories)


def _published_ids(tsq, limit):
    ids, page = [], 1
    while len(ids) < limit:
        st, p = api_req("GET", f"{BASE}/api/v1/stories?status=published&page={page}&limit=100", token=tsq, timeout=60)
        rows = (p or {}).get("stories") or (p or {}).get("data") or [] if isinstance(p, dict) else []
        if st != 200 or not rows:
            break
        ids += [r["id"] for r in rows if r.get("status", "published") == "published"]
        page += 1
    return ids[:limit]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--story-id", type=int, action="append")
    ap.add_argument("--backfill", action="store_true")
    ap.add_argument("--limit", type=int, default=2000)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    tsq, or_key = get_tokens()
    ids = a.story_id or (_published_ids(tsq, a.limit) if a.backfill else [])
    if not ids:
        ap.error("need --story-id or --backfill")
    changes, cost, n = check_and_fix(tsq, or_key, ids, apply=a.apply)
    print(json.dumps({"checked": n, "changed": len(changes), "applied": a.apply, "cost": round(cost, 6), "changes": changes}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    sys.exit(main())
