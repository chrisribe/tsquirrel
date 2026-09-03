#!/usr/bin/env python3
import argparse
import html
import json
import re

from common import (
    BASE,
    OR_BASE,
    OR_CLIENT_TITLE,
    OR_HTTP_REFERER,
    QG_MODEL,
    api_req,
    get_tokens,
    load_state,
    save_state,
    utc_now,
)

STOP = {
    "the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her", "was", "one", "our", "has", "his", "how", "its", "new",
    "now", "say", "she", "too", "use", "says", "said", "been", "have", "from", "they", "will", "with", "this", "that", "what", "when",
    "your", "more", "some", "than", "them", "into", "just", "also", "each", "like", "many", "most", "only", "over", "such", "about",
    "after", "being", "could", "every", "first", "found", "other", "right", "still", "think", "three", "under", "where", "which",
    "while", "would", "years", "before", "during", "should", "their", "there", "these", "those", "through", "people",
}

ALLOWED_CATEGORIES = {
    "Politics", "Business", "Technology", "Science", "Health", "Sports",
    "Entertainment", "World", "Environment", "Crime", "Other",
}

CATEGORY_ALIASES = {
    "tech": "Technology",
    "technology": "Technology",
    "international affairs": "World",
    "international": "World",
    "world news": "World",
    "finance": "Business",
    "economy": "Business",
    "climate": "Environment",
    "legal": "Crime",
}


def _plain_text(value):
    s = str(value or "")
    # Some payloads arrive double-escaped (e.g., &amp;lt;p&amp;gt;)
    for _ in range(2):
        s = html.unescape(s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _needs_editorial(story):
    title = str((story or {}).get("title") or "").strip()
    if len([w for w in title.split() if w.strip()]) < 4:
        return True
    for k in ("summary", "squirrel_take", "why_it_matters"):
        if not str((story or {}).get(k) or "").strip():
            return True
    return False


def _title_fallback(story, sources):
    current = _plain_text((story or {}).get("title"))
    if len(current.split()) >= 4:
        return current
    if sources:
        src = _plain_text(sources[0].get("title"))
        if len(src.split()) >= 4:
            return " ".join(src.split()[:12])
    return current or "Breaking story update pending review"


def _clean_tags(tags, title):
    words = []
    if isinstance(tags, list):
        words = [str(t).strip().lower() for t in tags]
    elif isinstance(tags, str):
        words = [x.strip().lower() for x in tags.split(",")]
    out = []
    for w in words:
        w = re.sub(r"[^a-z0-9\- ]", "", w).strip()
        if not w or len(w) < 3 or w in STOP:
            continue
        if w not in out:
            out.append(w)
        if len(out) >= 5:
            break
    if not out:
        for w in re.findall(r"[a-z0-9]+", (title or "").lower()):
            if len(w) >= 4 and w not in STOP and w not in out:
                out.append(w)
            if len(out) >= 4:
                break
    return out


def _normalize_category(raw):
    value = str(raw or "").strip()
    if not value:
        return "Other"
    low = value.lower()
    mapped = CATEGORY_ALIASES.get(low, value)
    if mapped in ALLOWED_CATEGORIES:
        return mapped
    title_cased = mapped.title()
    return title_cased if title_cased in ALLOWED_CATEGORIES else "Other"


def _clean_summary_text(summary, sources):
    s = _plain_text(summary)
    if not s:
        return ""
    if s[-1] in ".!?":
        return s

    # If model output got cut mid-sentence, fall back to a safe factual line
    # from first source title rather than publishing dangling text.
    fallback_title = ""
    if sources:
        fallback_title = _plain_text(sources[0].get("title"))
    if fallback_title:
        return f"{fallback_title}."
    return f"{s}."


def _needs_category_refresh(story):
    category = _normalize_category((story or {}).get("category"))
    return category == "Other"


def _llm_category(or_key, story, sources):
    source_lines = []
    for i, s in enumerate(sources[:6], 1):
        source_lines.append(
            {
                "i": i,
                "source": s.get("source_name"),
                "title": s.get("title"),
                "url": s.get("url"),
                "description": s.get("description"),
            }
        )

    payload = {
        "model": QG_MODEL,
        "temperature": 0.0,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "Classify one TSquirrel story into exactly one category using source URLs and metadata. "
                    "Return STRICT JSON only: {\"category\":\"...\",\"confidence\":0..1,\"theme\":\"<=8 words\"}. "
                    "Allowed categories only: Politics, Business, Technology, Science, Health, Sports, "
                    "Entertainment, World, Environment, Crime, Other. Use Other only when nothing fits."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "story": {
                            "id": story.get("id"),
                            "title": story.get("title"),
                            "summary": story.get("summary"),
                            "category": story.get("category"),
                        },
                        "sources": source_lines,
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    }

    status, out = api_req(
        "POST",
        f"{OR_BASE}/chat/completions",
        token=or_key,
        data=payload,
        headers={"HTTP-Referer": OR_HTTP_REFERER, "X-Title": OR_CLIENT_TITLE},
        timeout=60,
    )
    if status != 200 or not isinstance(out, dict):
        return {}

    content = out.get("choices", [{}])[0].get("message", {}).get("content", "{}")
    if isinstance(content, list):
        content = "".join(str(block.get("text", "")) if isinstance(block, dict) else str(block) for block in content)
    if not isinstance(content, str):
        content = str(content)

    start, end = content.find("{"), content.rfind("}")
    if start < 0 or end < 0:
        return {}
    try:
        return json.loads(content[start : end + 1])
    except Exception:
        return {}


def _llm_editor(or_key, story, sources):
    source_lines = []
    for i, s in enumerate(sources[:5], 1):
        source_lines.append(
            {
                "i": i,
                "source": s.get("source_name"),
                "title": s.get("title"),
                "url": s.get("url"),
                "description": s.get("description"),
            }
        )

    payload = {
        "model": QG_MODEL,
        "temperature": 0.15,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are TSquirrel editorial writer. Return STRICT JSON only with keys: "
                    "title, summary, squirrel_take, why_it_matters, category, tags. "
                    "Rules: title >=4 words, summary 1-2 factual sentences with concrete detail, "
                    "squirrel_take 1 sentence specific (no boilerplate), why_it_matters 1 sentence concrete impact, "
                    "tags array of 3-5 meaningful words, no stop words, no generic AI phrasing."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "current_story": {
                            "id": story.get("id"),
                            "title": story.get("title"),
                            "category": story.get("category"),
                        },
                        "sources": source_lines,
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    }

    status, out = api_req(
        "POST",
        f"{OR_BASE}/chat/completions",
        token=or_key,
        data=payload,
        headers={"HTTP-Referer": OR_HTTP_REFERER, "X-Title": OR_CLIENT_TITLE},
        timeout=90,
    )
    if status != 200 or not isinstance(out, dict):
        return {}

    content = out.get("choices", [{}])[0].get("message", {}).get("content", "{}")
    if isinstance(content, list):
        content = "".join(str(block.get("text", "")) if isinstance(block, dict) else str(block) for block in content)
    if not isinstance(content, str):
        content = str(content)

    start, end = content.find("{"), content.rfind("}")
    if start < 0 or end < 0:
        return {}
    try:
        return json.loads(content[start : end + 1])
    except Exception:
        return {}


def run(limit=50, dry_run=False):
    tsq, or_key = get_tokens()
    state = load_state()
    candidates = (state.get("candidates_step") or {}).get("candidates", [])[: int(limit)]

    edited = []
    skipped = []
    for c in candidates:
        sid = c.get("id")
        if not sid:
            continue
        status, payload = api_req("GET", f"{BASE}/api/v1/stories/{sid}", token=tsq)
        if status != 200 or not isinstance(payload, dict):
            skipped.append({"story_id": sid, "reason": f"fetch_http_{status}"})
            continue
        story = payload.get("story") or {}
        sources = payload.get("sources") or []

        if not _needs_editorial(story):
            if _needs_category_refresh(story):
                cat = _llm_category(or_key, story, sources)
                new_category = _normalize_category(cat.get("category") if isinstance(cat, dict) else None)
                old_category = _normalize_category(story.get("category"))
                if new_category != old_category and new_category != "Other":
                    patch_payload = {"category": new_category}
                    if dry_run:
                        edited.append({"story_id": sid, "dry_run": True, "action": "recategorize", "from": old_category, "to": new_category})
                    else:
                        pst, pp = api_req("PATCH", f"{BASE}/api/v1/stories/{sid}", token=tsq, data=patch_payload)
                        edited.append(
                            {
                                "story_id": sid,
                                "status": pst,
                                "ok": pst in (200, 201),
                                "action": "recategorize",
                                "from": old_category,
                                "to": new_category,
                                "response_ok": bool((pp or {}).get("ok")) if isinstance(pp, dict) else False,
                            }
                        )
                else:
                    skipped.append({"story_id": sid, "reason": "category_kept_other_or_same"})
            else:
                skipped.append({"story_id": sid, "reason": "already_has_editorial"})
            continue

        gen = _llm_editor(or_key, story, sources)
        if not isinstance(gen, dict):
            gen = {}
        title = _plain_text(gen.get("title")) or _title_fallback(story, sources)
        if len(title.split()) < 4:
            title = _title_fallback({"title": " ".join(title.split()[:12])}, sources)

        summary = _clean_summary_text(gen.get("summary"), sources)
        squirrel_take = _plain_text(gen.get("squirrel_take"))
        why = _plain_text(gen.get("why_it_matters"))
        category = _normalize_category(gen.get("category") or story.get("category") or "Other")
        tags = _clean_tags(gen.get("tags"), title)

        patch_payload = {
            "title": title,
            "summary": summary or None,
            "squirrel_take": squirrel_take or None,
            "why_it_matters": why or None,
            "category": category,
            "tags": ",".join(tags),
        }

        if dry_run:
            edited.append({"story_id": sid, "dry_run": True, "title": title})
            continue

        pst, pp = api_req("PATCH", f"{BASE}/api/v1/stories/{sid}", token=tsq, data=patch_payload)
        edited.append(
            {
                "story_id": sid,
                "status": pst,
                "ok": pst in (200, 201),
                "title": title,
                "response_ok": bool((pp or {}).get("ok")) if isinstance(pp, dict) else False,
            }
        )

    state["editorial_step"] = {
        "started_at": utc_now(),
        "model": QG_MODEL,
        "dry_run": bool(dry_run),
        "edited": edited,
        "skipped": skipped,
        "edited_count": sum(1 for e in edited if e.get("ok") or e.get("dry_run")),
    }
    save_state(state)
    print(
        f"editorial_step done | edited={len(edited)} skipped={len(skipped)} dry_run={str(bool(dry_run)).lower()} model={QG_MODEL}"
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=50)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    run(limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
