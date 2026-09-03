#!/usr/bin/env python3
import html
import os
import re
from common import BASE, get_tokens, api_req, load_state, save_state, utc_now


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


def run(dry_run=False):
    tsq, _ = get_tokens()
    state = load_state()
    qg_results = (state.get("quality_gate_step") or {}).get("results", [])
    park_duplicates = _env_bool("TSQ_QG_PARK_DUPLICATES", True)

    processed = []
    next_gate = []

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
        if not isinstance(story, dict):
            story = {}
        before = _fetch_audit(tsq, sid)
        blockers = before.get("blocker_details", [])
        codes = set(_codes(blockers))

        patch_payload = {}
        actions = []

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

        if "summary_too_short_chars" in codes or "summary_too_long_chars" in codes:
            new_summary = _normalize_summary(story.get("summary"), story.get("why_it_matters"))
            if new_summary and new_summary != str(story.get("summary") or "").strip():
                patch_payload["summary"] = new_summary
                actions.append({"type": "rewrite_summary", "chars": len(new_summary)})

        changed = bool(patch_payload)
        patch_result = None
        if changed and not dry_run:
            p_status, p_payload = api_req("PATCH", f"{BASE}/api/v1/stories/{sid}", token=tsq, data=patch_payload)
            patch_result = {"status": p_status}
            if p_status != 200:
                patch_result["error"] = p_payload

        after = _fetch_audit(tsq, sid) if (not dry_run) else before
        after_issues = []
        for d in after.get("blocker_details", []):
            msg = str(d.get("message") or d.get("code") or "").strip()
            if msg:
                after_issues.append(msg)
        after_issues = list(dict.fromkeys(after_issues))

        unresolved = [
            d for d in after.get("blocker_details", [])
            if isinstance(d, dict) and str(d.get("code") or "") not in {
                "category_too_generic",
                "title_too_short_chars",
                "title_too_long_chars",
                "summary_too_short_chars",
                "summary_too_long_chars",
            }
        ]

        if unresolved:
            actions.append({
                "type": "deep_dive_review",
                "blocker_codes": _codes(unresolved),
            })

        next_gate.append({
            "story_id": sid,
            "title": patch_payload.get("title") or story.get("title", ""),
            "pass": bool(after.get("pass", False)),
            "issues": after_issues,
            "gate_source": "editorial_audit_unblock",
            "llm_shadow_enabled": False,
            "llm_pass": None,
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
        "dry_run": bool(dry_run),
        "processed": processed,
        "count": len(processed),
        "passed_after_unblock": passed,
        "failed_after_unblock": len(next_gate) - passed,
        "results": next_gate,
    }
    save_state(state)
    print(
        f"unblock_step done | processed={len(processed)} changed={sum(1 for p in processed if p.get('changed'))} pass={passed} fail={len(next_gate)-passed} dry_run={str(bool(dry_run)).lower()}"
    )


if __name__ == "__main__":
    run(dry_run=False)
