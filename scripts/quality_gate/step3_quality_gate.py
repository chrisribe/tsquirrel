#!/usr/bin/env python3
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


def _heuristics(story, sources):
    issues = []
    title = str(story.get("title") or "").strip()
    take = str(story.get("squirrel_take") or "").strip()
    wim = str(story.get("why_it_matters") or "").strip()
    image = str(story.get("image_url") or "").strip()

    if len(title.split()) < 4:
        issues.append("title must be at least 4 words")
    if len(sources) < 2:
        issues.append("source_count must be >=2")
    if not image:
        issues.append("missing image_url")
    if len(take.split()) < 7:
        issues.append("squirrel_take too short/generic")
    if len(wim.split()) < 7:
        issues.append("why_it_matters too short/generic")
    if re.search(r"\b(in conclusion|important to note|as we move forward)\b", f"{take} {wim}", re.I):
        issues.append("boilerplate phrasing detected")
    if re.search(r"source mix:|operational and legal risk|map the next (one|two|three) decision checkpoints|do not break timelines|the next official moves will likely set the pace", f"{take} {wim}", re.I):
        issues.append("template/prompt-like phrasing detected")
    return issues


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


def _llm_gate(or_key, story, sources):
    src_titles = [str(s.get("title") or "").strip() for s in sources][:6]
    prompt = {
        "instruction": "Return JSON only.",
        "task": "Evaluate TSquirrel story quality gate.",
        "rules": [
            "title must be >= 4 words",
            "squirrel_take must be concrete human take (no generic AI boilerplate)",
            "why_it_matters must be specific, evidence-aligned, no vague filler",
            "sources must be topically coherent with title+summary",
        ],
        "story": {
            "title": story.get("title"),
            "summary": story.get("summary"),
            "squirrel_take": story.get("squirrel_take"),
            "why_it_matters": story.get("why_it_matters"),
        },
        "source_titles": src_titles,
        "output_schema": {"pass": True, "issues": ["..."]},
    }

    body = {
        "model": QG_MODEL,
        "messages": [{"role": "user", "content": json.dumps(prompt, ensure_ascii=False)}],
        "max_tokens": 300,
        "response_format": {"type": "json_object"},
    }
    status, payload = api_req(
        "POST",
        f"{OR_BASE}/chat/completions",
        token=or_key,
        data=body,
        headers={"HTTP-Referer": OR_HTTP_REFERER, "X-Title": OR_CLIENT_TITLE},
        timeout=90,
    )
    cost = _extract_or_cost(payload)
    if status != 200:
        return {"pass": False, "issues": [f"openrouter_error_http_{status}"], "raw": payload, "or_cost": cost}

    msg = payload.get("choices", [{}])[0].get("message", {})
    content = msg.get("content")
    if isinstance(content, list):
        # Some providers return structured content blocks.
        content = "".join(str(block.get("text", "")) if isinstance(block, dict) else str(block) for block in content)
    if content is None:
        content = ""
    try:
        parsed = json.loads(content)
    except Exception:
        return {"pass": False, "issues": ["openrouter_non_json_response"], "raw": str(content)[:300], "or_cost": cost}

    return {
        "pass": bool(parsed.get("pass", False)),
        "issues": [str(i) for i in (parsed.get("issues") or [])],
        "raw": parsed,
        "or_cost": cost,
    }


def _normalize_blockers(blockers):
    issues = []
    for b in blockers or []:
        if isinstance(b, str):
            issues.append(b.strip())
            continue
        if isinstance(b, dict):
            code = str(b.get("code") or "").strip()
            msg = str(b.get("message") or "").strip()
            if code and msg:
                issues.append(f"{code}: {msg}")
            elif code:
                issues.append(code)
            elif msg:
                issues.append(msg)
            else:
                issues.append(json.dumps(b, ensure_ascii=False)[:300])
            continue
        issues.append(str(b))
    return list(dict.fromkeys([i for i in issues if i]))


def _editorial_audit(tsq, story_id):
    status, payload = api_req("GET", f"{BASE}/api/v1/stories/{story_id}/editorial-audit", token=tsq)
    if status != 200:
        return {
            "ok": False,
            "status": status,
            "issues": [f"editorial_audit_http_{status}"],
            "raw": payload,
        }

    blockers = payload.get("blockers", []) if isinstance(payload, dict) else []
    issues = _normalize_blockers(blockers)
    return {
        "ok": True,
        "status": status,
        "issues": issues,
        "pass": len(issues) == 0,
        "raw": payload,
    }


def run():
    tsq, or_key = get_tokens()
    state = load_state()
    candidates = (state.get("candidates_step") or {}).get("candidates", [])
    llm_shadow = os.environ.get("TSQ_QG_LLM_SHADOW", "0").strip().lower() in ("1", "true", "yes", "on")

    results = []
    openrouter_usage_cost_sum = 0.0
    for c in candidates:
        sid = c.get("id")
        status, payload = api_req("GET", f"{BASE}/api/v1/stories/{sid}", token=tsq)
        if status != 200:
            results.append({"story_id": sid, "pass": False, "issues": [f"story_fetch_http_{status}"]})
            continue
        story = payload.get("story", {})
        sources = payload.get("sources", [])

        audit = _editorial_audit(tsq, sid)
        used = "editorial_audit"
        llm = None

        if audit.get("ok"):
            merged_issues = audit.get("issues", [])
            passed = bool(audit.get("pass", False))
            if llm_shadow:
                llm = _llm_gate(or_key, story, sources)
                openrouter_usage_cost_sum += float(llm.get("or_cost", 0.0) or 0.0)
        else:
            used = "legacy_heuristic_llm"
            heuristic_issues = _heuristics(story, sources)
            llm = _llm_gate(or_key, story, sources)
            openrouter_usage_cost_sum += float(llm.get("or_cost", 0.0) or 0.0)
            merged_issues = list(dict.fromkeys(heuristic_issues + llm.get("issues", [])))
            passed = len(merged_issues) == 0 and llm.get("pass", False)

        results.append({
            "story_id": sid,
            "title": story.get("title", ""),
            "pass": passed,
            "issues": merged_issues,
            "gate_source": used,
            "llm_shadow_enabled": bool(llm_shadow),
            "llm_pass": None if llm is None else llm.get("pass", False),
        })

    state["quality_gate_step"] = {
        "started_at": utc_now(),
        "model": QG_MODEL,
        "gate_source": "editorial_audit_with_legacy_fallback",
        "llm_shadow_enabled": bool(llm_shadow),
        "openrouter_usage_cost_sum": round(openrouter_usage_cost_sum, 9),
        "count": len(results),
        "results": results,
    }
    save_state(state)
    ok = sum(1 for r in results if r.get("pass"))
    print(f"quality_gate_step done | checked={len(results)} pass={ok} fail={len(results)-ok} model={QG_MODEL}")


if __name__ == "__main__":
    run()
