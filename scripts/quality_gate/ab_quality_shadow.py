#!/usr/bin/env python3
import argparse
import json

import statistics
import subprocess
import urllib.request
from datetime import datetime
from pathlib import Path

from common import utc_now

DEFAULT_HOST = "root@5.78.154.18"
DEFAULT_SSH_KEY = "/home/cribe/.ssh_hertzner_setup/id_hetzner"
DEFAULT_DB_CONTAINER = "tsquirrel-db-1"
DEFAULT_DB_USER = "dockeruser"
DEFAULT_DB_NAME = "appdb"
DEFAULT_MODEL = "claude-opus-4.6"


def run(cmd):
    return subprocess.check_output(cmd, text=True)


def fetch_live_stories(limit, ssh_key, ssh_host, db_container, db_user, db_name):
    sql = r'''
WITH ranked AS (
  SELECT
    s.id, s.slug, s.title, s.summary, s.squirrel_take, s.why_it_matters, s.category, s.updated_at,
    a.title AS source_title, src.name AS source_name, a.url,
    row_number() OVER (PARTITION BY s.id ORDER BY a.published_at DESC NULLS LAST, a.id DESC) AS rn
  FROM stories s
  LEFT JOIN story_articles sa ON sa.story_id = s.id
  LEFT JOIN articles a ON a.id = sa.article_id
  LEFT JOIN sources src ON src.id = a.source_id
  WHERE s.status='published'
), grouped AS (
  SELECT
    id, slug, title, summary, squirrel_take, why_it_matters, category, max(updated_at) AS updated_at,
    json_agg(json_build_object('source', source_name, 'title', source_title, 'url', url) ORDER BY rn)
      FILTER (WHERE rn <= 3 AND source_title IS NOT NULL) AS sources
  FROM ranked
  GROUP BY id, slug, title, summary, squirrel_take, why_it_matters, category
)
SELECT json_agg(row_to_json(t) ORDER BY updated_at DESC) FROM (
  SELECT * FROM grouped ORDER BY updated_at DESC LIMIT %d
) t;
''' % int(limit)

    remote = (
        f"docker exec -i {db_container} psql -U {db_user} -d {db_name} -At -c \"{sql}\""
    )
    out = run(["ssh", "-i", ssh_key, ssh_host, remote]).strip()
    return json.loads(out or "[]")


def get_gh_token():
    token = run(["gh", "auth", "token"]).strip()
    if not token:
        raise RuntimeError("gh auth token empty. Run: gh auth login")
    return token


def call_copilot_eval(stories, model):
    token = get_gh_token()
    payload = {
        "model": model,
        "temperature": 0.1,
        "max_tokens": 9000,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an editorial quality evaluator for a mobile news product. "
                    "For each story do 2 tasks: "
                    "(1) generate improved Version B from sources: summary, squirrel_take, why_it_matters, category. "
                    "(2) score Version A and Version B from 0-10 for readability, informativeness, source_click_motivation, trustworthiness. "
                    "overall = arithmetic mean with one decimal. "
                    "Be strict; penalize boilerplate and title-parroting. "
                    "Return STRICT JSON only with shape: "
                    "{\"results\":[{\"id\":number,\"scores_a\":{\"readability\":n,\"informativeness\":n,\"source_click_motivation\":n,\"trustworthiness\":n,\"overall\":n},\"scores_b\":{\"readability\":n,\"informativeness\":n,\"source_click_motivation\":n,\"trustworthiness\":n,\"overall\":n},\"delta_overall\":n,\"winner\":\"A|B\",\"improved\":{\"summary\":\"...\",\"squirrel_take\":\"...\",\"why_it_matters\":\"...\",\"category\":\"...\"},\"notes\":\"<=30 words\"}],\"aggregate\":{\"avg_a\":n,\"avg_b\":n,\"avg_delta\":n,\"b_wins\":number,\"a_wins\":number,\"ties\":number}}"
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "rubric_focus": "Reader should understand fast and feel informed enough to click sources.",
                        "stories": stories,
                    }
                ),
            },
        ],
    }

    req = urllib.request.Request(
        "https://api.githubcopilot.com/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )

    with urllib.request.urlopen(req, timeout=240) as r:
        out = json.loads(r.read().decode())

    txt = out["choices"][0]["message"]["content"]
    start = txt.find("{")
    end = txt.rfind("}")
    if start < 0 or end < 0:
        raise RuntimeError("Model did not return JSON")
    return json.loads(txt[start : end + 1])


def summarize(report):
    results = report.get("results", [])
    if not results:
        raise RuntimeError("Report has no results")

    avg_a = round(statistics.mean(r["scores_a"]["overall"] for r in results), 2)
    avg_b = round(statistics.mean(r["scores_b"]["overall"] for r in results), 2)
    avg_delta = round(avg_b - avg_a, 2)
    b_wins = sum(1 for r in results if r.get("winner") == "B")
    a_wins = sum(1 for r in results if r.get("winner") == "A")
    ties = len(results) - b_wins - a_wins
    top = sorted(results, key=lambda r: r.get("delta_overall", 0), reverse=True)[:5]

    return {
        "stories_evaluated": len(results),
        "avg_a": avg_a,
        "avg_b": avg_b,
        "avg_delta": avg_delta,
        "b_wins": b_wins,
        "a_wins": a_wins,
        "ties": ties,
        "top5_delta": [
            {
                "id": r["id"],
                "delta": r.get("delta_overall", 0),
                "a": r["scores_a"]["overall"],
                "b": r["scores_b"]["overall"],
            }
            for r in top
        ],
    }


def main():
    ap = argparse.ArgumentParser(description="Shadow A/B quality eval on live TSquirrel stories")
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--ssh-key", default=DEFAULT_SSH_KEY)
    ap.add_argument("--ssh-host", default=DEFAULT_HOST)
    ap.add_argument("--db-container", default=DEFAULT_DB_CONTAINER)
    ap.add_argument("--db-user", default=DEFAULT_DB_USER)
    ap.add_argument("--db-name", default=DEFAULT_DB_NAME)
    ap.add_argument("--out", default=f"/tmp/tsq_ab_shadow_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    args = ap.parse_args()

    if not args.ssh_host:
        raise RuntimeError("Missing SSH host. Set TSQ_PROD_SSH_HOST or pass --ssh-host.")
    if not args.ssh_key:
        raise RuntimeError("Missing SSH key path. Set TSQ_PROD_SSH_KEY or pass --ssh-key.")

    stories = fetch_live_stories(args.limit, args.ssh_key, args.ssh_host, args.db_container, args.db_user, args.db_name)
    if not stories:
        raise RuntimeError("No published stories fetched")

    report = call_copilot_eval(stories, args.model)
    summary = summarize(report)

    output = {
        "generated_at": utc_now(),
        "config": {
            "limit": args.limit,
            "model": args.model,
            "ssh_host": args.ssh_host,
            "db_container": args.db_container,
            "db_name": args.db_name,
        },
        "summary": summary,
        "report": report,
    }

    out_path = Path(args.out)
    out_path.write_text(json.dumps(output, indent=2), encoding="utf-8")

    print("STORIES_EVALUATED", summary["stories_evaluated"])
    print("AVG_A", summary["avg_a"])
    print("AVG_B", summary["avg_b"])
    print("AVG_DELTA", summary["avg_delta"])
    print("B_WINS", summary["b_wins"], "A_WINS", summary["a_wins"], "TIES", summary["ties"])
    print("REPORT", str(out_path))


if __name__ == "__main__":
    main()
