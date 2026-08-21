#!/usr/bin/env python3
import json
import os
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timezone

REPO_ROOT = Path(__file__).resolve().parents[2]
BASE = os.environ.get("TSQ_BASE_URL", "https://tsquirrel.com")
OR_BASE = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
QG_MODEL = os.environ.get("TSQ_QG_MODEL", "deepseek/deepseek-v4-flash")
OR_HTTP_REFERER = os.environ.get("OPENROUTER_HTTP_REFERER", BASE.rstrip("/"))
OR_CLIENT_TITLE = os.environ.get("OPENROUTER_CLIENT_TITLE", "TSquirrel Quality Gate")
ENV_TSQ = os.environ.get("TSQ_ENV_PATH", str(REPO_ROOT / ".env"))
ENV_OR = os.environ.get("OR_ENV_PATH", str(Path.home() / ".hermes" / ".env"))
STATE_PATH = os.environ.get("TSQ_QG_STATE", "/tmp/tsquirrel_quality_gate_state.json")
LEDGER_PATH = os.environ.get("TSQ_QG_LEDGER", str(REPO_ROOT / "references" / "cost_ledger" / "quality_gate_costs.jsonl"))


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def read_key(path, name):
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() == name:
                return v.strip().strip('"').strip("'")
    return None


def get_tokens():
    tsq = read_key(ENV_TSQ, "TSQUIRREL_API_TOKEN") or read_key(ENV_TSQ, "TSQ_API_TOKEN")
    ork = os.environ.get("OPENROUTER_API_KEY") or read_key(ENV_OR, "OPENROUTER_API_KEY")
    if not tsq:
        raise RuntimeError(f"TSquirrel API token missing in {ENV_TSQ}")
    if not ork:
        raise RuntimeError(f"OPENROUTER_API_KEY missing in {ENV_OR}")
    return tsq, ork


def api_req(method, url, token=None, data=None, timeout=60, headers=None):
    h = {"User-Agent": "TSQ-Quality-Gate/1.0"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    if headers:
        h.update(headers)
    body = None
    if data is not None:
        h["Content-Type"] = "application/json"
        body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8", "replace")
            return r.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            payload = json.loads(raw) if raw else {}
        except Exception:
            payload = {"raw": raw[:1000]}
        return e.code, payload


def get_or_usage(or_key):
    status, payload = api_req("GET", f"{OR_BASE}/auth/key", token=or_key)
    if status != 200 or "data" not in payload:
        raise RuntimeError(f"OpenRouter auth/key failed: HTTP {status} {payload}")
    d = payload["data"]
    return {
        "usage_daily": float(d.get("usage_daily", 0.0)),
        "usage_total": float(d.get("usage", 0.0)),
        "limit_remaining": float(d.get("limit_remaining", 0.0)),
    }


def load_state(path=STATE_PATH):
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_state(state, path=STATE_PATH):
    state["updated_at"] = utc_now()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def append_ledger(entry, path=LEDGER_PATH):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
