#!/usr/bin/env python3
import argparse
import json
import os
import sys
import urllib.request
import urllib.parse
import html
import re
import subprocess
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


class StaleBriefRevisionError(RuntimeError):
    def __init__(self, current_revision: Optional[int] = None):
        self.current_revision = current_revision
        super().__init__(f"stale brief revision (current={current_revision})")

from common import (
    BASE,
    OR_BASE,
    OR_CLIENT_TITLE,
    OR_HTTP_REFERER,
    QG_MODEL,
    api_req,
    get_or_usage,
    get_tokens,
)

SSH_KEY = "/home/cribe/.ssh_hertzner_setup/id_hetzner"
SSH_HOST = "root@5.78.154.18"
STACK_DIR = "/opt/stacks/tsquirrel"


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def ssh_psql_tsv(sql: str) -> str:
    cmd = [
        "ssh",
        "-i",
        SSH_KEY,
        SSH_HOST,
        (
            f"cd {STACK_DIR} && docker compose exec -T db "
            "psql -U dockeruser -d appdb -At -F $'\\t' <<'SQL'\n"
            f"{sql}\nSQL"
        ),
    ]
    out = subprocess.check_output(cmd, text=True)
    return out.strip()


def select_vote_candidate(tsq_token: str, excluded_story_ids: set[int]) -> Optional[Dict[str, Any]]:
    status, payload = api_req(
        "GET",
        f"{BASE}/api/v1/research-requests?status=needs_research&limit=100&offset=0",
        token=tsq_token,
        timeout=30,
    )
    if status != 200:
        return None
    rows = payload.get("requests") or []
    if not rows:
        return None

    eligible = [
        r for r in rows
        if isinstance(r, dict)
        and int(r.get("source_count") or 0) >= 2
        and int(r.get("story_id") or 0) not in excluded_story_ids
    ]
    if not eligible:
        return None

    def keyfn(x: Dict[str, Any]):
        return (
            int(x.get("request_count") or 0),
            int(x.get("recent_request_count") or 0),
            x.get("last_requested_at") or "",
        )

    best = sorted(eligible, key=keyfn, reverse=True)[0]
    return {
        "mode": "votes",
        "story_id": int(best["story_id"]),
        "slug": best.get("slug"),
        "request_count": int(best.get("request_count") or 0),
        "recent_request_count": int(best.get("recent_request_count") or 0),
        "source_count": int(best.get("source_count") or 0),
    }


def select_editorial_candidate(excluded_story_ids: set[int]) -> Optional[Dict[str, Any]]:
    exclude_sql = ""
    if excluded_story_ids:
        ids = ",".join(str(int(x)) for x in sorted(excluded_story_ids))
        exclude_sql = f"\n  AND s.id NOT IN ({ids})"

    sql = f"""
SELECT s.id, s.slug, s.title, s.category, COALESCE(s.heat_score,0) AS heat, COUNT(sa.article_id) AS src_count
FROM stories s
JOIN story_articles sa ON sa.story_id = s.id
WHERE s.status='published'
  AND s.updated_at >= NOW() - INTERVAL '36 hours'
  AND COALESCE(s.heat_score,0) >= 30
  AND COALESCE(s.category,'') NOT IN ('Sports', 'Weather', 'Horoscope')
  AND NOT EXISTS (
    SELECT 1 FROM story_briefs sb
    WHERE sb.story_id=s.id AND sb.status='published'
  ){exclude_sql}
GROUP BY s.id, s.slug, s.title, s.category, s.heat_score, s.updated_at
HAVING COUNT(sa.article_id) >= 3
ORDER BY COALESCE(s.heat_score,0) DESC, s.updated_at DESC
LIMIT 1;
""".strip()
    out = ssh_psql_tsv(sql)
    if not out:
        return None
    parts = out.split("\t")
    if len(parts) < 6:
        return None
    return {
        "mode": "editorial",
        "story_id": int(parts[0]),
        "slug": parts[1],
        "title": parts[2],
        "category": parts[3],
        "heat_score": float(parts[4]),
        "source_count": int(parts[5]),
    }


def fetch_context(tsq_token: str, story_id: int) -> Dict[str, Any]:
    status, payload = api_req(
        "GET",
        f"{BASE}/api/v1/stories/{story_id}/research-context",
        token=tsq_token,
        timeout=30,
    )
    if status != 200:
        raise RuntimeError(f"research-context HTTP {status}: {payload}")
    return payload


def parse_json_from_model(raw: Any) -> Dict[str, Any]:
    if raw is None:
        raise RuntimeError("model returned empty content")

    text = str(raw).strip()
    if not text:
        raise RuntimeError("model returned blank content")

    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    try:
        parsed = json.loads(text)
    except Exception:
        s, e = text.find("{"), text.rfind("}")
        if s >= 0 and e > s:
            parsed = json.loads(text[s : e + 1])
        else:
            raise

    if not isinstance(parsed, dict):
        raise RuntimeError("model output JSON was not an object")
    return parsed


_P_RE = re.compile(r"<p\b[^>]*>(.*?)</p>", re.S | re.I)
_TAG_RE = re.compile(r"<[^>]+>")


def fetch_fulltext(url: str, max_chars: int = 6000) -> str:
    """Best-effort article body fetch (stdlib only). Returns '' on any failure."""
    if not url:
        return ""
    try:
        req = urllib.request.Request(url.replace("&amp;", "&"), headers={"User-Agent": "Mozilla/5.0 (TSquirrel research)"})
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read(1_500_000).decode("utf-8", "ignore")
    except Exception:
        return ""
    raw = re.sub(r"<(script|style|nav|footer|aside)\b.*?</\1>", " ", raw, flags=re.S | re.I)
    paras = []
    for m in _P_RE.finditer(raw):
        t = html.unescape(_TAG_RE.sub("", m.group(1))).strip()
        t = re.sub(r"\s+", " ", t)
        if len(t) >= 60:
            paras.append(t)
    return "\n".join(paras)[:max_chars]


WIKI_UA = {"User-Agent": "TSquirrelBot/1.0 (https://tsquirrel.com; research briefs)"}


def _get_json(url: str, timeout: int = 15) -> Any:
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=WIKI_UA), timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", "ignore"))
    except Exception:
        return None


def call_or_json(ork: str, system: str, user: Any, max_tokens: int = 3000) -> Tuple[Dict[str, Any], float]:
    status, out = api_req(
        "POST", f"{OR_BASE}/chat/completions", token=ork, timeout=60,
        data={"model": QG_MODEL, "temperature": 0.1, "max_tokens": max_tokens,
              "response_format": {"type": "json_object"},
              "messages": [{"role": "system", "content": system},
                           {"role": "user", "content": json.dumps(user, ensure_ascii=False)}]},
        headers={"HTTP-Referer": OR_HTTP_REFERER, "X-Title": OR_CLIENT_TITLE},
    )
    if status != 200:
        return {}, 0.0
    msg = ((out.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    try:
        return parse_json_from_model(msg), float((out.get("usage") or {}).get("cost") or 0.0)
    except Exception:
        return {}, 0.0


WB_INDICATORS = {"NY.GDP.MKTP.CD": "GDP (current US$)", "NY.GDP.MKTP.KD.ZG": "GDP growth (annual %)",
                 "FP.CPI.TOTL.ZG": "Inflation, consumer prices (annual %)", "SP.POP.TOTL": "Population"}


def fetch_background(ork: str, story: Dict[str, Any], source_notes: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], float]:
    """Entity background from Wikipedia (+ World Bank for economy/country stories).
    Only for people/orgs/places involved, never the event itself."""
    sys_p = ("Return STRICT JSON {entities:[{name, wikipedia_title, why_relevant}], country_iso3: string|null, economic: bool}. "
             "Pick 2-4 central people/organizations/places a reader may not know (not the news event itself). "
             "wikipedia_title = exact English Wikipedia article title. country_iso3 only if a country's economy is central.")
    user = {"title": story.get("title"), "summary": story.get("summary"),
            "excerpt": " ".join((n.get("fulltext") or n.get("description") or "")[:800] for n in source_notes[:3])}
    plan, cost = call_or_json(ork, sys_p, user)
    out: List[Dict[str, Any]] = []
    for e in (plan.get("entities") or [])[:4]:
        t = str((e or {}).get("wikipedia_title") or "").strip()
        if not t:
            continue
        j = _get_json("https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(t.replace(" ", "_")))
        if not j or j.get("type") != "standard" or not j.get("extract"):
            continue  # missing or disambiguation -> drop
        # entity sanity: name token must appear in story text
        name_tok = str(e.get("name") or t).split()[-1].lower()
        story_txt = (str(story.get("title")) + " " + str(story.get("summary")) + " " + user["excerpt"]).lower()
        if name_tok not in story_txt:
            continue
        out.append({"kind": "wikipedia", "title": j.get("title"), "url": (j.get("content_urls") or {}).get("desktop", {}).get("page"),
                    "text": j.get("extract")[:1200]})
    iso = plan.get("country_iso3")
    if plan.get("economic") and isinstance(iso, str) and len(iso) == 3:
        lines = []
        for code, label in WB_INDICATORS.items():
            j = _get_json(f"https://api.worldbank.org/v2/country/{iso}/indicator/{code}?format=json&mrnev=1")
            try:
                row = j[1][0]
                if row.get("value") is not None:
                    lines.append(f"{label}: {row['value']:,.2f} ({row['date']})")
            except Exception:
                pass
        if lines:
            out.append({"kind": "worldbank", "title": f"World Bank indicators — {iso.upper()}",
                        "url": f"https://data.worldbank.org/country/{iso.lower()}", "text": "; ".join(lines)})
    return out, cost


def call_openrouter(ork: str, ctx: Dict[str, Any], mode: str) -> Tuple[Dict[str, Any], float]:
    story = ctx["story"]
    sources = ctx.get("sources") or []

    source_notes = []
    for s in sources[:8]:
        source_notes.append(
            {
                "article_id": s.get("article_id"),
                "publisher": s.get("publisher_name"),
                "title": s.get("title"),
                "description": s.get("description"),
                "url": s.get("url"),
                "fulltext": fetch_fulltext(s.get("url") or ""),
            }
        )
    fulltext_chars = sum(len(n["fulltext"]) for n in source_notes)
    background, bg_cost = fetch_background(ork, story, source_notes) if os.environ.get("TSQ_DD_BACKGROUND", "0") == "1" else ([], 0.0)

    system = (
        "You write TSquirrel Deep Dive briefs. Return STRICT JSON only with keys: "
        "introduction (string), facts (array of 3-5 objects). "
        "Each fact object must include heading, text, article_ids. "
        "Goal: give the reader MORE than the original articles' headlines/blurbs. Use the fulltext fields. "
        "Each fact must add at least one concrete element not in the story summary: background/history, "
        "numbers/data, named people/orgs and their stated positions, timeline, or where sources differ. "
        "Rules: factual and neutral tone (no opinion, no mockery, especially for crime/court/death stories), "
        "no speculation, no invented claims, every claim grounded in the cited source text. "
        "Never write a fact whose point is that something is unknown or not yet reported. "
        "Each fact must cite 1-3 article_ids from the provided source list. "
        "OPTIONAL: if the background list is non-empty and genuinely helps a reader understand who/what is involved, "
        "add ONE extra fact with heading starting 'Background:' that uses ONLY background entries; for it set "
        "article_ids to [] and background_refs to the indexes of background entries used. Never use background for the news event itself; "
        "always state dates for figures (e.g. 'GDP was $X in 2024'). Skip it if background is generic or irrelevant."
    )

    user = {
        "mode": mode,
        "story": {
            "id": story.get("id"),
            "slug": story.get("slug"),
            "title": story.get("title"),
            "summary": story.get("summary"),
            "category": story.get("category"),
        },
        "objective": "Explain why now and what changed, with specifics from full article text that the summary lacks.",
        "sources": source_notes,
        "background": [{"i": i, **b} for i, b in enumerate(background)],
        "constraints": {
            "facts_count": "3-5 news facts (+ optional 1 Background fact)",
            "text_length": "3-5 sentences per fact, specific (names, numbers, dates)",
            "introduction": "2-3 sentences: what happened + why it matters now",
            "forbidden": [
                "restating the summary",
                "'not yet reported' / 'remains unclear' filler facts",
                "certainty language not supported by sources",
                "uncited claims",
                "opinionated or sarcastic tone",
            ],
        },
    }

    payload = {
        "model": QG_MODEL,
        "temperature": 0.15,
        "top_p": 0.95,
        "max_tokens": 8192,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
        ],
    }

    status, out = api_req(
        "POST",
        f"{OR_BASE}/chat/completions",
        token=ork,
        data=payload,
        timeout=90,
        headers={"HTTP-Referer": OR_HTTP_REFERER, "X-Title": OR_CLIENT_TITLE},
    )
    if status != 200:
        raise RuntimeError(f"openrouter HTTP {status}: {out}")

    choice_raw = (out.get("choices") or [{}])[0]
    choice = choice_raw if isinstance(choice_raw, dict) else {}
    message_raw = choice.get("message") or {}
    message = message_raw if isinstance(message_raw, dict) else {}
    content = message.get("content")
    if isinstance(content, list):
        content = "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        )

    if content is None or (isinstance(content, str) and not content.strip()):
        refusal = message.get("refusal")
        finish_reason = choice.get("finish_reason")
        raise RuntimeError(
            f"openrouter returned empty content (finish_reason={finish_reason}, refusal={refusal})"
        )

    parsed = parse_json_from_model(content)
    usage = out.get("usage") or {}
    cost = float(usage.get("cost") or 0.0) + bg_cost
    parsed["_background"] = background
    parsed["_source_text"] = {int(n["article_id"]): ((n.get("fulltext") or "") + " " + (n.get("description") or "") + " " + (n.get("title") or ""))
                              for n in source_notes if n.get("article_id") is not None}
    parsed["_meta"] = {"background_sources": len(background),"fulltext_chars": fulltext_chars, "prompt_tokens": usage.get("prompt_tokens"),
                       "completion_tokens": usage.get("completion_tokens")}
    return parsed, cost


def normalize_brief(model_out: Dict[str, Any], valid_ids: List[int]) -> Dict[str, Any]:
    intro = str(model_out.get("introduction") or "").strip()
    facts_in = model_out.get("facts") or []

    facts = []
    used_ids = set()
    valid_id_set = set(valid_ids)

    background_fact = None
    bg = model_out.get("_background") or []
    for f in facts_in:
        h = str((f or {}).get("heading") or "")
        if h.lower().startswith("background") and bg:
            refs = [int(x) for x in ((f or {}).get("background_refs") or []) if str(x).isdigit() and int(x) < len(bg)]
            if refs and background_fact is None:
                background_fact = {"heading": h[:160], "text": str(f.get("text") or "").strip()[:4000],
                                   "refs": [{"title": bg[i]["title"], "url": bg[i]["url"]} for i in refs]}
            continue
    for f in facts_in:
        if str((f or {}).get("heading") or "").lower().startswith("background"):
            continue
        if len(facts) >= 5:
            break
        heading = str((f or {}).get("heading") or "").strip()
        text = str((f or {}).get("text") or "").strip()
        ids_raw = (f or {}).get("article_ids") or []

        ids: List[int] = []
        for x in ids_raw:
            try:
                i = int(x)
            except Exception:
                continue
            if i in valid_id_set and i not in ids:
                ids.append(i)

        if not heading or not text or not ids:
            continue
        # numeric grounding: every number in a news fact must appear in its cited sources' text
        src_txt = " ".join((model_out.get("_source_text") or {}).get(i, "") for i in ids).replace(",", "")
        nums = [n.replace(",", "") for n in re.findall(r"\d[\d,]*(?:\.\d+)?", text)]
        if src_txt.strip() and any(n not in src_txt for n in nums if len(n) >= 2):
            print(f"drop fact (ungrounded number): {heading}", file=sys.stderr)
            continue
        low = (heading + " " + text).lower()
        if any(k in low for k in ("placeholder", "pending", "not yet reported", "unanswered question", "remains unclear", "have not been disclosed")):
            continue

        used_ids.update(ids)
        facts.append(
            {
                "heading": heading[:160],
                "text": text[:4000],
                "article_ids": ids[:3],
            }
        )

    if not 3 <= len(facts) <= 5:
        raise RuntimeError(f"brief facts invalid count={len(facts)}")
    words = len((intro + " " + " ".join(f["text"] for f in facts)).split())
    if words < 200:
        raise RuntimeError(f"brief too thin ({words} words < 200)")
    if len(used_ids) < 2:
        raise RuntimeError("brief citations too narrow (<2 unique article_ids)")
    if len(intro) < 120:
        raise RuntimeError("brief introduction too short")

    out = {"introduction": intro[:2000], "facts": facts}
    if background_fact:
        out["background"] = background_fact
    return out


def submit_brief(tsq_token: str, story_id: int, payload: Dict[str, Any], expected_revision: int) -> Dict[str, Any]:
    body = {
        "expected_revision": expected_revision,
        "introduction": payload["introduction"],
        "facts": payload["facts"],
    }
    status, out = api_req(
        "PUT",
        f"{BASE}/api/v1/stories/{story_id}/brief",
        token=tsq_token,
        data=body,
        timeout=30,
    )
    if status == 409 and isinstance(out, dict) and out.get("code") == "stale_brief_revision":
        cur = out.get("current_revision")
        try:
            cur = int(cur) if cur is not None else None
        except Exception:
            cur = None
        raise StaleBriefRevisionError(cur)
    if status != 200:
        raise RuntimeError(f"PUT brief HTTP {status}: {out}")
    brief = out.get("brief") if isinstance(out, dict) else None
    return brief if isinstance(brief, dict) else {}


def publish_brief(story_id: int, revision: int) -> None:
    sql = f"""
BEGIN;
WITH admin_user AS (
  SELECT id FROM users WHERE role='admin' ORDER BY id ASC LIMIT 1
)
UPDATE story_briefs sb
SET status='published',
    reviewed_by=(SELECT id FROM admin_user),
    reviewed_at=NOW(),
    updated_at=NOW(),
    proposed_summary=NULL,
    summary_base=NULL
WHERE sb.story_id={int(story_id)}
  AND sb.revision={int(revision)};
DELETE FROM story_research_requests WHERE story_id={int(story_id)};
COMMIT;
""".strip()
    ssh_psql_tsv(sql)


def verify_status(tsq_token: str, story_id: int) -> Dict[str, Any]:
    status, out = api_req(
        "GET",
        f"{BASE}/api/v1/stories/{story_id}/brief",
        token=tsq_token,
        timeout=30,
    )
    if status != 200:
        raise RuntimeError(f"GET brief verify HTTP {status}: {out}")
    return out.get("brief") or {}


def format_human_output(result: Dict[str, Any], sources: List[Dict[str, Any]]) -> str:
    story = result["story"]
    candidate = result["candidate"]
    brief = result["brief"]
    orx = result["openrouter"]
    story_url = f"{BASE}/story/{story.get('slug')}"

    lines = []
    lines.append("TSquirrel Dig Deeper — Daily Run")
    lines.append(f"- Ran at (UTC): {result['ran_at']}")
    lines.append(f"- Selection mode: {candidate.get('mode')}")
    lines.append(f"- Story: {story.get('title')}")
    lines.append(f"- Story link: {story_url}")
    lines.append(f"- Category: {story.get('category')}")
    lines.append(f"- Brief status: {brief.get('verified_status')} (rev {brief.get('verified_revision')})")
    lines.append(f"- Reviewed at: {brief.get('reviewed_at')}")
    lines.append(f"- Model: {result.get('model')}")
    lines.append(f"- OpenRouter call cost: ${orx.get('call_cost', 0.0):.8f}")
    lines.append(f"- OpenRouter daily usage delta: ${orx.get('usage_daily_delta', 0.0):.8f}")

    if candidate.get("mode") == "votes":
        lines.append(
            "- Vote signal: "
            f"requests={candidate.get('request_count', 0)}, "
            f"recent7d={candidate.get('recent_request_count', 0)}"
        )

    lines.append("- Source links:")
    for i, s in enumerate(sources[:5], 1):
        title = (s.get("title") or "Untitled source").strip()
        url = s.get("url") or ""
        lines.append(f"  {i}. {title} — {url}")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--story-id", type=int, default=0, help="Force story id")
    parser.add_argument("--publish", action="store_true", default=False, help="Publish after brief generation")
    parser.add_argument("--exclude-story-ids", type=str, default="", help="Comma-separated story IDs to skip")
    parser.add_argument("--dry-run", action="store_true", default=False, help="Generate + validate only; print brief, do not submit")
    parser.add_argument("--max-attempts", type=int, default=5, help="Max candidates to try in one run")
    args = parser.parse_args()

    tsq_token, or_key = get_tokens()
    usage_before = get_or_usage(or_key)

    excluded_story_ids: set[int] = set()
    if args.exclude_story_ids.strip():
        for tok in args.exclude_story_ids.split(","):
            tok = tok.strip()
            if not tok:
                continue
            try:
                excluded_story_ids.add(int(tok))
            except Exception:
                pass

    if args.story_id:
        candidates = [{"mode": "manual", "story_id": int(args.story_id)}]
    else:
        candidates = []

    attempt = 0
    while attempt < max(1, args.max_attempts):
        attempt += 1

        if not candidates:
            candidate = select_vote_candidate(tsq_token, excluded_story_ids)
            if candidate is None:
                candidate = select_editorial_candidate(excluded_story_ids)
        else:
            candidate = candidates.pop(0)

        if candidate is None:
            print("TSquirrel Dig Deeper — Daily Run")
            print("- Result: skipped (no eligible candidate today)")
            if excluded_story_ids:
                print(f"- Excluded story ids this run: {','.join(str(x) for x in sorted(excluded_story_ids))}")
            print(f"- Ran at (UTC): {now_utc()}")
            return

        story_id = int(candidate["story_id"])
        excluded_story_ids.add(story_id)

        ctx = fetch_context(tsq_token, story_id)
        story = ctx.get("story") or {}
        sources = ctx.get("sources") or []
        if len(sources) < 2:
            continue

        model_out = {}
        try:
            model_out, call_cost = call_openrouter(or_key, ctx, candidate.get("mode", "editorial"))
            valid_ids = [int(s["article_id"]) for s in sources if s.get("article_id") is not None]
            normalized = normalize_brief(model_out, valid_ids)
        except Exception as e:
            print(f"candidate {story_id} rejected: {e}", file=sys.stderr)
            if args.dry_run and model_out:
                print(json.dumps(model_out, indent=2, ensure_ascii=False), file=sys.stderr)
            continue

        if args.dry_run:
            print(json.dumps({"story": {"id": story_id, "title": story.get("title"), "summary": story.get("summary")},
                              "model": QG_MODEL, "call_cost": call_cost, "meta": model_out.get("_meta"),
                              "brief": normalized}, indent=2, ensure_ascii=False))
            return

        prev = ctx.get("brief") or {}
        expected_revision = int(prev.get("revision") or 0)
        try:
            saved = submit_brief(tsq_token, story_id, normalized, expected_revision)
            if args.publish:
                publish_brief(story_id, int(saved.get("revision") or expected_revision + 1))
        except StaleBriefRevisionError:
            continue

        verified = verify_status(tsq_token, story_id)
        usage_after = get_or_usage(or_key)

        result = {
            "ok": True,
            "ran_at": now_utc(),
            "candidate": candidate,
            "story": {
                "id": story.get("id"),
                "slug": story.get("slug"),
                "title": story.get("title"),
                "category": story.get("category"),
            },
            "model": QG_MODEL,
            "openrouter": {
                "call_cost": call_cost,
                "usage_daily_before": usage_before["usage_daily"],
                "usage_daily_after": usage_after["usage_daily"],
                "usage_daily_delta": round(usage_after["usage_daily"] - usage_before["usage_daily"], 8),
            },
            "brief": {
                "expected_revision": expected_revision,
                "saved_revision": saved.get("revision"),
                "verified_status": verified.get("status"),
                "verified_revision": verified.get("revision"),
                "reviewed_at": verified.get("reviewed_at"),
            },
        }

        print(format_human_output(result, sources))
        return

    print("TSquirrel Dig Deeper — Daily Run")
    print("- Result: skipped (eligible candidates exhausted this run)")
    print(f"- Attempts: {max(1, args.max_attempts)}")
    if excluded_story_ids:
        print(f"- Tried story ids: {','.join(str(x) for x in sorted(excluded_story_ids))}")
    print(f"- Ran at (UTC): {now_utc()}")


if __name__ == "__main__":
    main()
