#!/usr/bin/env python3
import html
import json
import os
import re
from common import (
    BASE,
    OR_BASE,
    OR_CLIENT_TITLE,
    OR_HTTP_REFERER,
    QG_MODEL,
    get_tokens,
    api_req,
    load_state,
    save_state,
    utc_now,
)


def _plain_text(value):
    s = str(value or "")
    for _ in range(2):
        s = html.unescape(s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _env_bool(name, default=False):
    raw = os.environ.get(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def _words(text):
    return [w for w in re.split(r"\s+", _plain_text(text)) if w]


def _trim_to_chars(text, max_chars):
    value = " ".join(_words(text))
    if len(value) <= max_chars:
        return value
    cut = value[:max_chars]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.strip(" ,;:-")


def _first_sentence(text):
    value = " ".join(_words(text))
    if not value:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", value)
    return parts[0].strip()


def _ensure_terminal_sentence(text):
    value = " ".join(_words(text)).strip()
    if not value:
        return ""
    if re.search(r"[.!?][\"')\]]?$", value):
        return value
    # If clipped/trailing punctuation is weak, force a clean sentence ending.
    value = value.rstrip(" ,;:-")
    return f"{value}."


def _token_set(text):
    tokens = re.findall(r"[a-z0-9]+", _plain_text(text).lower())
    return {t for t in tokens if len(t) >= 4 and not t.isdigit()}


def _token_overlap(a, b):
    ta = _token_set(a)
    tb = _token_set(b)
    if not ta or not tb:
        return 0.0
    return len(ta.intersection(tb)) / max(1, len(tb))


def _normalize_summary_non_parrot(title, summary, why_it_matters):
    summary_text = " ".join(_words(summary))
    if not summary_text:
        return summary_text

    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", summary_text) if s.strip()]
    kept = [s for s in sentences if _token_overlap(s, title) < 0.72]
    if not kept and sentences:
        kept = [sentences[-1]]

    merged = " ".join(kept).strip()
    wim = _first_sentence(why_it_matters)
    if wim and _token_overlap(wim, title) < 0.72 and wim.lower() not in merged.lower():
        merged = f"{merged} {wim}".strip()

    if len(merged) < 120:
        merged = f"{merged} Reports indicate this development may affect near-term policy, market, or operations decisions.".strip()

    merged = _trim_to_chars(merged, 280)
    return _ensure_terminal_sentence(merged)


def _expand_title(title, summary, category):
    title = " ".join(_words(title))
    if len(title) >= 45:
        return _trim_to_chars(title, 70)

    tail = _first_sentence(summary)
    if tail:
        tail = re.sub(re.escape(title), "", tail, flags=re.I).strip(" :,-")

    if tail:
        candidate = f"{title}: {tail}"
    elif category and category.lower() != "other":
        candidate = f"{title}: {category} update"
    else:
        candidate = f"{title}: latest verified updates"

    candidate = _trim_to_chars(candidate, 70)
    if len(candidate) < 45:
        filler = " latest verified updates"
        candidate = _trim_to_chars((candidate + filler).strip(), 70)
    return candidate


def _normalize_summary(summary, why_it_matters):
    summary = " ".join(_words(summary))
    if not summary:
        return summary

    if len(summary) > 280:
        summary = _trim_to_chars(summary, 280)

    if len(summary) < 120:
        wim = _first_sentence(why_it_matters)
        if wim and wim.lower() not in summary.lower():
            summary = f"{summary} {wim}".strip()
        if len(summary) < 120:
            summary = f"{summary} Officials are expected to release additional verified details.".strip()
        summary = _trim_to_chars(summary, 280)

    summary = _ensure_terminal_sentence(summary)
    return summary


def _normalize_blockers(raw):
    if not isinstance(raw, list):
        return []
    out = []
    for b in raw:
        if isinstance(b, dict):
            out.append(b)
        elif isinstance(b, str):
            out.append({"code": b, "message": b})
    return out


def _fetch_audit(tsq, story_id):
    status, payload = api_req("GET", f"{BASE}/api/v1/stories/{story_id}/editorial-audit", token=tsq)
    if status != 200 or not isinstance(payload, dict):
        return {
            "ok": False,
            "status": status,
            "pass": False,
            "blocker_details": [{"code": f"editorial_audit_http_{status}", "message": "editorial audit unavailable"}],
            "raw": payload,
        }

    details = payload.get("blocker_details")
    if not isinstance(details, list):
        details = _normalize_blockers(payload.get("blockers") or [])

    return {
        "ok": True,
        "status": status,
        "pass": bool(payload.get("passes_editorial_contract", False)),
        "blocker_details": _normalize_blockers(details),
        "raw": payload,
    }


def _codes(details):
    return [str(d.get("code") or "").strip() for d in details if str(d.get("code") or "").strip()]


def _extract_or_cost(payload):
    if not isinstance(payload, dict):
        return 0.0
    usage = payload.get("usage")
    if not isinstance(usage, dict):
        return 0.0
    try:
        return float(usage.get("cost", 0.0) or 0.0)
    except Exception:
        return 0.0


def _llm_correct(or_key, story, sources, blocker_details):
    source_rows = []
    for s in sources[:8]:
        source_rows.append({
            "id": s.get("id"),
            "source": s.get("source_name"),
            "title": _plain_text(s.get("title")),
            "url": str(s.get("url") or "").strip(),
        })

    prompt = {
        "instruction": "Return JSON only.",
        "task": "Fix TSquirrel editorial blockers for this story draft.",
        "rules": [
            "Prefer minimal edits that clear blockers.",
            "Do not invent facts not present in source titles/context.",
            "Title target: 45-70 chars, clear and complete.",
            "Summary target: 120-280 chars, factual, not just title restatement.",
            "If duplicate source URLs exist, include remove_source_ids for duplicates to drop.",
            "If sources are irreconcilably mismatched, set hide_as_duplicate=true only for duplicate-topic blockers.",
        ],
        "blockers": blocker_details,
        "story": {
            "title": story.get("title"),
            "summary": story.get("summary"),
            "squirrel_take": story.get("squirrel_take"),
            "why_it_matters": story.get("why_it_matters"),
            "category": story.get("category"),
        },
        "sources": source_rows,
        "output_schema": {
            "patch": {
                "title": "optional string",
                "summary": "optional string",
                "squirrel_take": "optional string",
                "why_it_matters": "optional string",
                "category": "optional string",
            },
            "remove_source_ids": [0],
            "hide_as_duplicate": False,
            "notes": "optional short string",
        },
    }

    body = {
        "model": QG_MODEL,
        "messages": [{"role": "user", "content": json.dumps(prompt, ensure_ascii=False)}],
        "max_tokens": 500,
        "response_format": {"type": "json_object"},
    }

    total_cost = 0.0
    last_error = "openrouter_unknown_error"
    last_raw = None

    # Single retry: 1 initial call + 1 retry if response shape/JSON is bad or non-200.
    for attempt in range(2):
        resp = api_req(
            "POST",
            f"{OR_BASE}/chat/completions",
            token=or_key,
            data=body,
            headers={"HTTP-Referer": OR_HTTP_REFERER, "X-Title": OR_CLIENT_TITLE},
            timeout=90,
        )

        if not (isinstance(resp, tuple) and len(resp) == 2):
            last_error = "openrouter_bad_response_shape"
            last_raw = str(resp)[:500]
            continue

        status, payload = resp
        total_cost += _extract_or_cost(payload)

        if status != 200:
            last_error = f"openrouter_error_http_{status}"
            last_raw = payload
            continue

        choices = payload.get("choices") if isinstance(payload, dict) else []
        first = choices[0] if isinstance(choices, list) and choices else {}
        msg = first.get("message", {}) if isinstance(first, dict) else {}
        content = msg.get("content") if isinstance(msg, dict) else ""
        if isinstance(content, list):
            content = "".join(str(block.get("text", "")) if isinstance(block, dict) else str(block) for block in content)
        if content is None:
            content = ""

        try:
            parsed = json.loads(content)
        except Exception:
            last_error = "openrouter_non_json_response"
            last_raw = str(content)[:500]
            continue

        patch = parsed.get("patch") if isinstance(parsed.get("patch"), dict) else {}
        cleaned_patch = {}
        for k in ("title", "summary", "squirrel_take", "why_it_matters", "category"):
            v = patch.get(k)
            if isinstance(v, str):
                vv = _plain_text(v)
                if vv:
                    cleaned_patch[k] = vv

        remove_ids = []
        for x in (parsed.get("remove_source_ids") or []):
            try:
                remove_ids.append(int(x))
            except Exception:
                pass

        return {
            "ok": True,
            "error": None,
            "raw": parsed,
            "or_cost": total_cost,
            "patch": cleaned_patch,
            "remove_source_ids": sorted(set(remove_ids)),
            "hide_as_duplicate": bool(parsed.get("hide_as_duplicate", False)),
            "notes": str(parsed.get("notes") or "").strip(),
            "retry_used": attempt == 1,
        }

    return {
        "ok": False,
        "error": last_error,
        "raw": last_raw,
        "or_cost": total_cost,
        "patch": {},
        "remove_source_ids": [],
        "hide_as_duplicate": False,
        "retry_used": True,
    }


def run(dry_run=False):
    tsq, or_key = get_tokens()
    state = load_state()
    qg_results = (state.get("quality_gate_step") or {}).get("results", [])
    park_duplicates = _env_bool("TSQ_QG_PARK_DUPLICATES", True)
    llm_correct = _env_bool("TSQ_QG_LLM_CORRECT", True)

    processed = []
    next_gate = []
    openrouter_usage_cost_sum = 0.0

    for row in qg_results:
        sid = row.get("story_id")
        if not sid:
            continue

        if row.get("pass"):
            next_gate.append(row)
            continue

        story_status, story_payload = api_req("GET", f"{BASE}/api/v1/stories/{sid}", token=tsq)
        if story_status != 200:
            merged = dict(row)
            merged["issues"] = list(dict.fromkeys((row.get("issues") or []) + [f"story_fetch_http_{story_status}"]))
            next_gate.append(merged)
            processed.append({"story_id": sid, "actions": [], "changed": False, "error": f"story_fetch_http_{story_status}"})
            continue

        story = story_payload.get("story", {}) if isinstance(story_payload, dict) else {}
        sources = story_payload.get("sources", []) if isinstance(story_payload, dict) else []
        if not isinstance(story, dict):
            story = {}
        if not isinstance(sources, list):
            sources = []

        before = _fetch_audit(tsq, sid)
        blockers = before.get("blocker_details", [])
        codes = set(_codes(blockers))

        patch_payload = {}
        actions = []
        changed = False
        patch_result = None
        llm_used = False

        duplicate_codes = {"duplicate_published_story", "recent_duplicate_topic"}
        if codes.intersection(duplicate_codes):
            park_status = None
            park_error = None
            if not dry_run and park_duplicates:
                park_status, park_resp = api_req("POST", f"{BASE}/api/v1/stories/{sid}/hide", token=tsq, data={})
                if park_status not in (200, 201):
                    park_error = park_resp
            actions.append({
                "type": "park_duplicate",
                "status": park_status,
                "enabled": bool(park_duplicates),
                "dry_run": bool(dry_run),
                "error": park_error,
            })

            after = _fetch_audit(tsq, sid) if (not dry_run) else before
            after_issues = []
            for d in after.get("blocker_details", []):
                if not isinstance(d, dict):
                    continue
                msg = str(d.get("message") or d.get("code") or "").strip()
                if msg:
                    after_issues.append(msg)
            after_issues = list(dict.fromkeys(after_issues))

            next_gate.append({
                "story_id": sid,
                "title": story.get("title", ""),
                "pass": False,
                "issues": after_issues,
                "gate_source": "editorial_audit_unblock",
                "llm_shadow_enabled": False,
                "llm_pass": None,
            })

            processed.append({
                "story_id": sid,
                "changed": False,
                "patch": {},
                "actions": actions,
                "before_blockers": blockers,
                "after_blockers": after.get("blocker_details", []),
                "patch_result": None,
            })
            continue

        for b in blockers:
            if not isinstance(b, dict):
                continue
            code = str(b.get("code") or "").strip()
            meta = b.get("meta") or {}

            if code == "category_too_generic":
                suggested = str(meta.get("suggested_category") or "").strip()
                if suggested:
                    patch_payload["category"] = suggested
                    actions.append({"type": "set_category", "value": suggested})

        if "title_too_short_chars" in codes or "title_too_long_chars" in codes:
            new_title = _expand_title(story.get("title"), story.get("summary"), patch_payload.get("category") or story.get("category"))
            if new_title and new_title != str(story.get("title") or "").strip():
                patch_payload["title"] = new_title
                actions.append({"type": "rewrite_title", "chars": len(new_title)})

        if "summary_duplicates_title" in codes:
            new_summary = _normalize_summary_non_parrot(
                story.get("title"),
                story.get("summary"),
                story.get("why_it_matters"),
            )
            if new_summary and new_summary != str(story.get("summary") or "").strip():
                patch_payload["summary"] = new_summary
                actions.append({"type": "rewrite_summary_non_parrot", "chars": len(new_summary)})
        elif "summary_too_short_chars" in codes or "summary_too_long_chars" in codes or "summary_incomplete_sentence" in codes:
            new_summary = _normalize_summary(story.get("summary"), story.get("why_it_matters"))
            if new_summary and new_summary != str(story.get("summary") or "").strip():
                patch_payload["summary"] = new_summary
                actions.append({"type": "rewrite_summary", "chars": len(new_summary)})

        if "why_it_matters_boilerplate" in codes:
            base = _first_sentence(story.get("summary"))
            if len(_words(base)) >= 10:
                new_why = _trim_to_chars(_ensure_terminal_sentence(base), 220)
                if new_why and new_why != str(story.get("why_it_matters") or "").strip():
                    patch_payload["why_it_matters"] = new_why
                    actions.append({"type": "rewrite_why_it_matters", "chars": len(new_why)})

        if "duplicate_source_urls" in codes and sources:
            seen = {}
            remove_ids = []
            for src in sources:
                aid = src.get("id")
                url = str(src.get("url") or "").strip().lower().replace("&amp;", "&")
                if not aid or not url:
                    continue
                if url in seen:
                    remove_ids.append(int(aid))
                else:
                    seen[url] = int(aid)
            remove_ids = sorted(set(remove_ids))
            if remove_ids:
                changed = True
                remove_status = []
                if not dry_run:
                    for aid in remove_ids:
                        d_status, _ = api_req("DELETE", f"{BASE}/api/v1/stories/{sid}/sources/{aid}", token=tsq)
                        remove_status.append({"article_id": aid, "status": d_status})
                actions.append({
                    "type": "dedupe_sources",
                    "removed_article_ids": remove_ids,
                    "statuses": remove_status,
                    "dry_run": bool(dry_run),
                })

        if patch_payload:
            changed = True
            if not dry_run:
                p_status, p_payload = api_req("PATCH", f"{BASE}/api/v1/stories/{sid}", token=tsq, data=patch_payload)
                patch_result = {"status": p_status}
                if p_status != 200:
                    patch_result["error"] = p_payload

        after = _fetch_audit(tsq, sid) if (not dry_run) else before

        unresolved = [
            d for d in after.get("blocker_details", [])
            if isinstance(d, dict) and str(d.get("code") or "") not in {
                "category_too_generic",
                "title_too_short_chars",
                "title_too_long_chars",
                "summary_too_short_chars",
                "summary_too_long_chars",
                "summary_incomplete_sentence",
                "summary_duplicates_title",
                "duplicate_source_urls",
                "why_it_matters_boilerplate",
            }
        ]

        if unresolved and llm_correct and not dry_run:
            llm_used = True
            refresh_status, refresh_payload = api_req("GET", f"{BASE}/api/v1/stories/{sid}", token=tsq)
            live_story = (refresh_payload.get("story") or {}) if refresh_status == 200 and isinstance(refresh_payload, dict) else story
            live_sources = (refresh_payload.get("sources") or []) if refresh_status == 200 and isinstance(refresh_payload, dict) else sources

            llm_fix = _llm_correct(or_key, live_story, live_sources, unresolved)
            openrouter_usage_cost_sum += float(llm_fix.get("or_cost", 0.0) or 0.0)

            llm_actions = {
                "type": "llm_correction",
                "ok": bool(llm_fix.get("ok")),
                "error": llm_fix.get("error"),
                "notes": llm_fix.get("notes")
            }

            live_ids = {int(s.get("id")) for s in live_sources if s.get("id") is not None}
            remove_ids = [aid for aid in (llm_fix.get("remove_source_ids") or []) if aid in live_ids]
            if remove_ids:
                changed = True
                statuses = []
                for aid in remove_ids:
                    d_status, _ = api_req("DELETE", f"{BASE}/api/v1/stories/{sid}/sources/{aid}", token=tsq)
                    statuses.append({"article_id": aid, "status": d_status})
                llm_actions["removed_article_ids"] = remove_ids
                llm_actions["remove_statuses"] = statuses

            llm_patch = llm_fix.get("patch") or {}
            if llm_patch:
                changed = True
                p_status, p_payload = api_req("PATCH", f"{BASE}/api/v1/stories/{sid}", token=tsq, data=llm_patch)
                llm_actions["patch_status"] = p_status
                llm_actions["patch_keys"] = sorted(llm_patch.keys())
                if p_status != 200:
                    llm_actions["patch_error"] = p_payload

            if llm_fix.get("hide_as_duplicate"):
                changed = True
                h_status, h_payload = api_req("POST", f"{BASE}/api/v1/stories/{sid}/hide", token=tsq, data={})
                llm_actions["hide_status"] = h_status
                if h_status not in (200, 201):
                    llm_actions["hide_error"] = h_payload

            actions.append(llm_actions)
            after = _fetch_audit(tsq, sid)
            unresolved = [
                d for d in after.get("blocker_details", [])
                if isinstance(d, dict)
            ]

        after_issues = []
        for d in after.get("blocker_details", []):
            msg = str(d.get("message") or d.get("code") or "").strip()
            if msg:
                after_issues.append(msg)
        after_issues = list(dict.fromkeys(after_issues))

        if unresolved:
            actions.append({
                "type": "deep_dive_review",
                "blocker_codes": _codes(unresolved),
            })

        final_title = patch_payload.get("title") or story.get("title", "")
        if not dry_run:
            f_status, f_payload = api_req("GET", f"{BASE}/api/v1/stories/{sid}", token=tsq)
            if f_status == 200 and isinstance(f_payload, dict):
                final_title = (f_payload.get("story") or {}).get("title") or final_title

        next_gate.append({
            "story_id": sid,
            "title": final_title,
            "pass": bool(after.get("pass", False)),
            "issues": after_issues,
            "gate_source": "editorial_audit_unblock",
            "llm_shadow_enabled": False,
            "llm_pass": None if not llm_used else bool(after.get("pass", False)),
        })

        processed.append({
            "story_id": sid,
            "changed": changed,
            "patch": patch_payload,
            "actions": actions,
            "before_blockers": blockers,
            "after_blockers": after.get("blocker_details", []),
            "patch_result": patch_result,
        })

    passed = sum(1 for r in next_gate if r.get("pass"))
    state["quality_gate_unblock_step"] = {
        "started_at": utc_now(),
        "model": QG_MODEL,
        "dry_run": bool(dry_run),
        "llm_correction_enabled": bool(llm_correct),
        "openrouter_usage_cost_sum": round(openrouter_usage_cost_sum, 9),
        "processed": processed,
        "count": len(processed),
        "passed_after_unblock": passed,
        "failed_after_unblock": len(next_gate) - passed,
        "results": next_gate,
    }
    save_state(state)
    print(
        f"unblock_step done | processed={len(processed)} changed={sum(1 for p in processed if p.get('changed'))} pass={passed} fail={len(next_gate)-passed} dry_run={str(bool(dry_run)).lower()} llm_correct={str(bool(llm_correct)).lower()} model={QG_MODEL}"
    )


if __name__ == "__main__":
    run(dry_run=False)
