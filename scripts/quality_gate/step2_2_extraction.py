#!/usr/bin/env python3
import argparse
import json
import os
import re
import statistics
from collections import Counter
from typing import Dict, List, Tuple

from common import BASE, api_req, get_tokens, load_state, save_state, utc_now


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def _load_gliner_model():
    import importlib

    gliner2 = importlib.import_module("gliner2")
    auto_extractor = getattr(gliner2, "AutoExtractor")

    model_name = os.environ.get("TSQ_EXTRACT_MODEL", "fastino/gliner2.5-small-v1")
    map_location = os.environ.get("TSQ_EXTRACT_DEVICE", "cpu")
    model = auto_extractor.from_pretrained(model_name, map_location=map_location)
    return model_name, model


def _extract_schema() -> Dict[str, str]:
    return {
        "organization": "company, institution, government body, or team",
        "person": "person name",
        "location": "country, city, region, or place",
        "money": "monetary amount with currency",
        "time": "date, time, period, or duration",
        "metric": "kpi, score, count, percentage, or measured value",
        "event": "incident, launch, policy change, acquisition, or major action",
    }


def _load_jsonl_rows(path: str) -> List[dict]:
    rows: List[dict] = []
    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line:
                continue
            if line[0].isdigit() and "|" in line.split("{", 1)[0]:
                line = line.split("|", 1)[1]
            rows.append(json.loads(line))
    return rows


def _story_from_file_rows(rows: List[dict], limit: int) -> List[dict]:
    stories = []
    for r in rows[:limit]:
        stories.append(
            {
                "id": r.get("story_id"),
                "title": r.get("title") or "",
                "summary": r.get("summary") or "",
                "category": r.get("category") or "",
                "sources": [{"title": r.get("title") or ""}],
            }
        )
    return stories


def _story_from_live_state(limit: int) -> Tuple[List[dict], int]:
    tsq, _ = get_tokens()
    state = load_state()
    candidates = (state.get("candidates_step") or {}).get("candidates", [])[: int(limit)]

    stories = []
    fetch_errors = 0
    for c in candidates:
        sid = c.get("id")
        if sid is None:
            continue
        status, payload = api_req("GET", f"{BASE}/api/v1/stories/{sid}", token=tsq)
        if status != 200 or not isinstance(payload, dict):
            fetch_errors += 1
            continue

        story_obj = payload.get("story")
        story = story_obj if isinstance(story_obj, dict) else {}

        sources_obj = payload.get("sources")
        sources = sources_obj if isinstance(sources_obj, list) else []

        stories.append(
            {
                "id": sid,
                "title": str(story.get("title") or ""),
                "summary": str(story.get("summary") or ""),
                "category": str(story.get("category") or ""),
                "sources": [{"title": str(s.get("title") or "")} for s in sources if isinstance(s, dict)],
            }
        )
    return stories, fetch_errors


def _flatten_entities(entities: Dict[str, List[dict]]) -> Tuple[List[dict], float]:
    flat: List[dict] = []
    confs: List[float] = []
    for label, vals in (entities or {}).items():
        for item in vals or []:
            text = str(item.get("text") or "").strip()
            if not text:
                continue
            conf = item.get("confidence")
            if isinstance(conf, (int, float)):
                confs.append(float(conf))
            flat.append(
                {
                    "type": label,
                    "text": text,
                    "confidence": float(conf) if isinstance(conf, (int, float)) else None,
                }
            )
    avg_conf = (sum(confs) / len(confs)) if confs else 0.0
    return flat, avg_conf


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", (s or "").lower())).strip()


def _entity_overlap_ratio(story_entities: List[dict], source_titles: List[str]) -> float:
    if not story_entities:
        return 0.0
    src = _norm(" ".join(source_titles))
    if not src:
        return 0.0
    uniq = []
    seen = set()
    for e in story_entities:
        t = _norm(e.get("text") or "")
        if not t or t in seen:
            continue
        seen.add(t)
        uniq.append(t)
    if not uniq:
        return 0.0
    hits = sum(1 for t in uniq if t and t in src)
    return hits / len(uniq)


def _numeric_claim_count(text: str) -> int:
    if not text:
        return 0
    pats = [
        r"\$\s?\d[\d,]*(?:\.\d+)?\s?(?:billion|million|bn|m|k)?",
        r"€\s?\d[\d,]*(?:\.\d+)?\s?(?:billion|million|bn|m|k)?",
        r"£\s?\d[\d,]*(?:\.\d+)?\s?(?:billion|million|bn|m|k)?",
        r"\b\d+(?:\.\d+)?%\b",
    ]
    return sum(len(re.findall(p, text, flags=re.I)) for p in pats)


def _risk_level(source_overlap_ratio: float, numeric_claim_count: int) -> str:
    # Defaults from MVP calibration (can be overridden per environment later if needed)
    if source_overlap_ratio < 0.25 and numeric_claim_count >= 2:
        return "red"
    if source_overlap_ratio < 0.35 and numeric_claim_count >= 1:
        return "yellow"
    return "green"


def _default_category_labels() -> List[str]:
    return [
        "AI",
        "Business",
        "Crime",
        "Entertainment",
        "Environment",
        "Health",
        "Other",
        "Politics",
        "Science",
        "Sports",
        "Technology",
        "World",
        "US",
        "Canada",
    ]


def _pick_category_labels(stories: List[dict]) -> List[str]:
    labels = sorted({str(s.get("category") or "").strip() for s in stories if str(s.get("category") or "").strip()})
    if len(labels) >= 4:
        return labels
    return _default_category_labels()


def _extract_classification(category_pred_obj, task_name: str = "category") -> Tuple[str, float | None]:
    # Supports multiple possible shapes from classify_text across versions/providers.
    if isinstance(category_pred_obj, dict):
        v = category_pred_obj.get(task_name)
        if isinstance(v, str):
            return v, None
        if isinstance(v, dict):
            # Observed shapes:
            # {"value": "AI", "confidence": 0.87}
            # {"label": "AI", "confidence": 0.87}
            val = v.get("value")
            if not isinstance(val, str):
                val = v.get("label")
            conf = v.get("confidence")
            if isinstance(val, str):
                return val, float(conf) if isinstance(conf, (int, float)) else None
    if isinstance(category_pred_obj, str):
        return category_pred_obj, None
    return "", None


def _category_tuning_config() -> tuple[float, set[str]]:
    raw_th = os.environ.get("TSQ_CAT_OTHER_CONF_THRESH", "0")
    try:
        conf_th = float(raw_th)
    except Exception:
        conf_th = 0.0
    if conf_th < 0:
        conf_th = 0.0

    raw_classes = os.environ.get("TSQ_CAT_OTHER_FALLBACK_CLASSES", "")
    classes = {x.strip() for x in raw_classes.split(",") if x.strip()}
    return conf_th, classes


def _apply_category_postprocess(predicted: str, confidence: float | None, conf_th: float, fallback_classes: set[str]) -> tuple[str, bool]:
    if not predicted:
        return "", False
    if conf_th <= 0:
        return predicted, False
    if not isinstance(confidence, (int, float)):
        return predicted, False
    if confidence >= conf_th:
        return predicted, False
    if fallback_classes and predicted not in fallback_classes:
        return predicted, False
    return "Other", True


def _run_extract(stories: List[dict], model):
    schema = _extract_schema()
    category_labels = _pick_category_labels(stories)
    class_task = {"category": {"labels": category_labels, "multi_label": False}}

    results = []
    confs = []
    entity_counts = []
    overlap_scores = []
    category_conf_scores = []
    predicted_counter = Counter()
    true_counter = Counter()
    match_count = 0
    match_denom = 0
    fallback_to_other_count = 0
    conf_th, fallback_classes = _category_tuning_config()

    for s in stories:
        title = (s.get("title") or "").strip()
        summary = (s.get("summary") or "").strip()
        text = f"{title}\n{summary}".strip()
        source_titles = [str(x.get("title") or "").strip() for x in (s.get("sources") or [])]

        out = model.extract_entities(text, schema, include_confidence=True, include_spans=False)
        flat, avg_conf = _flatten_entities((out or {}).get("entities") or {})
        overlap = _entity_overlap_ratio(flat, source_titles)
        numeric_claim_count = _numeric_claim_count(text)
        risk_level = _risk_level(overlap, numeric_claim_count)

        pred_raw = model.classify_text(text, class_task, include_confidence=True)
        predicted_category_raw, predicted_category_conf = _extract_classification(pred_raw, "category")
        predicted_category, forced_other = _apply_category_postprocess(
            predicted_category_raw,
            predicted_category_conf,
            conf_th=conf_th,
            fallback_classes=fallback_classes,
        )
        if forced_other:
            fallback_to_other_count += 1
        true_category = str(s.get("category") or "").strip()

        if predicted_category:
            predicted_counter[predicted_category] += 1
        if true_category:
            true_counter[true_category] += 1
            match_denom += 1
            if predicted_category and predicted_category == true_category:
                match_count += 1
        if isinstance(predicted_category_conf, (int, float)):
            category_conf_scores.append(float(predicted_category_conf))

        confs.append(avg_conf)
        entity_counts.append(len(flat))
        overlap_scores.append(overlap)

        results.append(
            {
                "story_id": s.get("id"),
                "title": title,
                "true_category": true_category,
                "predicted_category": predicted_category,
                "predicted_category_raw": predicted_category_raw,
                "category_forced_to_other": bool(forced_other),
                "predicted_category_confidence": round(predicted_category_conf, 4)
                if isinstance(predicted_category_conf, (int, float))
                else None,
                "entity_count": len(flat),
                "avg_confidence": round(avg_conf, 4),
                "source_overlap_ratio": round(overlap, 4),
                "numeric_claim_count": numeric_claim_count,
                "risk_level": risk_level,
                "entities": flat[:20],
            }
        )

    risk_counts = {
        "green": sum(1 for r in results if r.get("risk_level") == "green"),
        "yellow": sum(1 for r in results if r.get("risk_level") == "yellow"),
        "red": sum(1 for r in results if r.get("risk_level") == "red"),
    }

    summary = {
        "count": len(results),
        "entity_count_mean": round(sum(entity_counts) / len(entity_counts), 4) if entity_counts else 0.0,
        "entity_count_median": round(statistics.median(entity_counts), 4) if entity_counts else 0.0,
        "avg_confidence_mean": round(sum(confs) / len(confs), 4) if confs else 0.0,
        "source_overlap_mean": round(sum(overlap_scores) / len(overlap_scores), 4) if overlap_scores else 0.0,
        "low_overlap_count": sum(1 for x in overlap_scores if x < 0.2),
        "high_claim_count_stories": sum(1 for r in results if r["numeric_claim_count"] >= 2),
        "risk_counts": risk_counts,
        "risk_rates": {
            k: round((v / len(results)), 4) if results else 0.0
            for k, v in risk_counts.items()
        },
        "predicted_category_distribution": dict(predicted_counter),
        "true_category_distribution": dict(true_counter),
        "category_match_rate": round((match_count / match_denom), 4) if match_denom else None,
        "predicted_category_confidence_mean": round(sum(category_conf_scores) / len(category_conf_scores), 4)
        if category_conf_scores
        else None,
        "category_labels_used": category_labels,
        "category_tuning": {
            "other_conf_threshold": conf_th,
            "fallback_classes": sorted(fallback_classes),
            "forced_to_other_count": fallback_to_other_count,
            "forced_to_other_rate": round((fallback_to_other_count / len(results)), 4) if results else 0.0,
        },
    }
    return summary, results


def run(limit=50, dry_run=False, from_file=None, output_path=None):
    model_name, model = _load_gliner_model()

    fetch_errors = 0
    if from_file:
        rows = _load_jsonl_rows(from_file)
        stories = _story_from_file_rows(rows, int(limit))
    else:
        stories, fetch_errors = _story_from_live_state(int(limit))

    summary, results = _run_extract(stories, model)

    payload = {
        "started_at": utc_now(),
        "mode": "file_demo" if from_file else "live_candidates",
        "model": model_name,
        "dry_run": bool(dry_run),
        "fetch_errors": int(fetch_errors),
        "summary": summary,
        "results": results,
    }

    if from_file:
        out = output_path or "/tmp/tsq_extraction_demo.json"
        with open(out, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(f"extraction_demo saved: {out}")
        print(
            f"count={summary['count']} avg_conf={summary['avg_confidence_mean']} "
            f"mean_entities={summary['entity_count_mean']} overlap_mean={summary['source_overlap_mean']} "
            f"risk={summary['risk_counts']}"
        )
        return

    state = load_state()
    state["extraction_step"] = payload
    save_state(state)
    print(
        "extraction_step done"
        f" | stories={summary['count']}"
        f" avg_conf={summary['avg_confidence_mean']}"
        f" mean_entities={summary['entity_count_mean']}"
        f" overlap_mean={summary['source_overlap_mean']}"
        f" low_overlap={summary['low_overlap_count']}"
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=50)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--from-file", type=str, default=None)
    ap.add_argument("--output", type=str, default=None)
    args = ap.parse_args()
    run(limit=args.limit, dry_run=args.dry_run, from_file=args.from_file, output_path=args.output)


if __name__ == "__main__":
    main()
