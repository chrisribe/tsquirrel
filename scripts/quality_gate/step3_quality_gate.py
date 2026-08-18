#!/usr/bin/env python3
import json
import re
from common import BASE, OR_BASE, get_tokens, api_req, load_state, save_state, utc_now

MODEL = "deepseek/deepseek-v4-flash"


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
    return issues


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
        "model": MODEL,
        "messages": [{"role": "user", "content": json.dumps(prompt, ensure_ascii=False)}],
        "max_tokens": 300,
        "response_format": {"type": "json_object"},
    }
    status, payload = api_req(
        "POST",
        f"{OR_BASE}/chat/completions",
        token=or_key,
        data=body,
        headers={"HTTP-Referer": "https://tsquirrel.pixagreat.com"},
        timeout=90,
    )
    if status != 200:
        return {"pass": False, "issues": [f"openrouter_error_http_{status}"], "raw": payload}

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
        return {"pass": False, "issues": ["openrouter_non_json_response"], "raw": str(content)[:300]}

    return {
        "pass": bool(parsed.get("pass", False)),
        "issues": [str(i) for i in (parsed.get("issues") or [])],
        "raw": parsed,
    }


def run():
    tsq, or_key = get_tokens()
    state = load_state()
    candidates = (state.get("candidates_step") or {}).get("candidates", [])

    results = []
    for c in candidates:
        sid = c.get("id")
        status, payload = api_req("GET", f"{BASE}/api/v1/stories/{sid}", token=tsq)
        if status != 200:
            results.append({"story_id": sid, "pass": False, "issues": [f"story_fetch_http_{status}"]})
            continue
        story = payload.get("story", {})
        sources = payload.get("sources", [])

        heuristic_issues = _heuristics(story, sources)
        llm = _llm_gate(or_key, story, sources)
        merged_issues = list(dict.fromkeys(heuristic_issues + llm.get("issues", [])))
        passed = len(merged_issues) == 0 and llm.get("pass", False)

        results.append({
            "story_id": sid,
            "title": story.get("title", ""),
            "pass": passed,
            "issues": merged_issues,
            "llm_pass": llm.get("pass", False),
        })

    state["quality_gate_step"] = {
        "started_at": utc_now(),
        "model": MODEL,
        "count": len(results),
        "results": results,
    }
    save_state(state)
    ok = sum(1 for r in results if r.get("pass"))
    print(f"quality_gate_step done | checked={len(results)} pass={ok} fail={len(results)-ok} model={MODEL}")


if __name__ == "__main__":
    run()
