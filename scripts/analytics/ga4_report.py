#!/usr/bin/env python3
"""TSquirrel GA4 reporting utility.

Usage:
  python3 scripts/analytics/ga4_report.py \
    --property-id 352935045 \
    --service-account /home/cribe/.config/ga4/tsquirrel-service-account.json \
    --days 7
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Tuple

TOKEN_URL = "https://oauth2.googleapis.com/token"
GA_API_BASE = "https://analyticsdata.googleapis.com/v1beta"


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def sign_jwt(service_account: Dict) -> str:
    header = {"alg": "RS256", "typ": "JWT"}
    now = int(dt.datetime.now(dt.timezone.utc).timestamp())
    claim = {
        "iss": service_account["client_email"],
        "scope": "https://www.googleapis.com/auth/analytics.readonly",
        "aud": TOKEN_URL,
        "exp": now + 3600,
        "iat": now,
    }

    unsigned = (
        f"{b64url(json.dumps(header, separators=(',', ':')).encode())}."
        f"{b64url(json.dumps(claim, separators=(',', ':')).encode())}"
    )

    with tempfile.NamedTemporaryFile("w", delete=False) as tf:
        tf.write(service_account["private_key"])
        key_path = tf.name

    try:
        sig = subprocess.check_output(
            ["openssl", "dgst", "-sha256", "-sign", key_path],
            input=unsigned.encode(),
        )
    finally:
        os.unlink(key_path)

    return f"{unsigned}.{b64url(sig)}"


def fetch_access_token(service_account: Dict) -> str:
    jwt = sign_jwt(service_account)
    body = urllib.parse.urlencode(
        {
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": jwt,
        }
    ).encode()

    req = urllib.request.Request(TOKEN_URL, data=body, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode())
    return payload["access_token"]


def run_report(access_token: str, property_id: str, payload: Dict) -> Dict:
    url = f"{GA_API_BASE}/properties/{property_id}:runReport"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        method="POST",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode())


def metric_int(rows: List[Dict], idx: int) -> int:
    if not rows:
        return 0
    values = rows[0].get("metricValues", [])
    if idx >= len(values):
        return 0
    return int(values[idx].get("value", "0"))


def build_or_prefix_filter(prefixes: List[str]) -> Optional[Dict]:
    normalized = [p.strip() for p in prefixes if p and p.strip()]
    if not normalized:
        return None
    return {
        "orGroup": {
            "expressions": [
                {
                    "filter": {
                        "fieldName": "pagePath",
                        "stringFilter": {"matchType": "BEGINS_WITH", "value": p},
                    }
                }
                for p in normalized
            ]
        }
    }


def path_is_excluded(page_path: str, exclude_prefixes: List[str]) -> bool:
    return any(page_path.startswith(prefix) for prefix in exclude_prefixes)


def parse_rows(report: Dict) -> List[Dict]:
    rows: List[Dict] = []
    for row in report.get("rows", []):
        dvals = [v.get("value", "") for v in row.get("dimensionValues", [])]
        mvals = [v.get("value", "0") for v in row.get("metricValues", [])]
        rows.append(
            {
                "page_path": dvals[0] if len(dvals) > 0 else "",
                "page_title": dvals[1] if len(dvals) > 1 else "",
                "screen_page_views": int(mvals[0]) if len(mvals) > 0 else 0,
                "sessions": int(mvals[1]) if len(mvals) > 1 else 0,
                "active_users": int(mvals[2]) if len(mvals) > 2 else 0,
            }
        )
    return rows


def analyze(rows: List[Dict], exclude_prefixes: List[str], totals: Dict) -> Dict:
    homepage_titles = [r for r in rows if r["page_path"] == "/"]
    title_split = {}
    for r in homepage_titles:
        t = r["page_title"] or "(blank)"
        title_split[t] = title_split.get(t, 0) + r["screen_page_views"]

    error_404_views = sum(
        r["screen_page_views"] for r in rows if "404" in (r["page_title"] or "")
    )

    public_rows = [r for r in rows if not path_is_excluded(r["page_path"], exclude_prefixes)]
    excluded_rows = [r for r in rows if path_is_excluded(r["page_path"], exclude_prefixes)]

    excluded_toprow_views = sum(r["screen_page_views"] for r in excluded_rows)
    total_views = totals["all"]["screen_page_views"]
    excluded_total_views = totals["excluded"]["screen_page_views"]
    excluded_share_pct = (
        round((excluded_total_views / total_views) * 100, 1) if total_views else 0.0
    )

    return {
        "homepage_title_variants": title_split,
        "error_404_views": error_404_views,
        "exclude_prefixes": exclude_prefixes,
        "top_public_pages": public_rows[:10],
        "top_excluded_pages": excluded_rows[:10],
        "excluded_toprow_views": excluded_toprow_views,
        "totals": totals,
        "excluded_share_pct": excluded_share_pct,
    }


def detect_likely_bot_signature(signature_report: Dict, total_sessions: int) -> Dict:
    """Estimate likely bot/crawler sessions using a conservative signature.

    Current signature (heuristic):
    - source/medium == (direct) / (none)
    - device == desktop
    - browser == Chrome
    - OS == Windows
    - averageSessionDuration < 1s
    - sessions >= 5 for the fingerprint row
    """

    suspicious_rows: List[Dict] = []
    rows = signature_report.get("rows", [])
    for row in rows:
        dvals = [v.get("value", "") for v in row.get("dimensionValues", [])]
        mvals = [v.get("value", "0") for v in row.get("metricValues", [])]

        country = dvals[0] if len(dvals) > 0 else ""
        source = dvals[1] if len(dvals) > 1 else ""
        device = dvals[2] if len(dvals) > 2 else ""
        browser = dvals[3] if len(dvals) > 3 else ""
        os_name = dvals[4] if len(dvals) > 4 else ""

        sessions = int(mvals[0]) if len(mvals) > 0 else 0
        engaged_sessions = int(mvals[1]) if len(mvals) > 1 else 0
        avg_session_duration = float(mvals[2]) if len(mvals) > 2 else 0.0

        if (
            source == "(direct) / (none)"
            and device == "desktop"
            and browser == "Chrome"
            and os_name == "Windows"
            and avg_session_duration < 1.0
            and sessions >= 5
        ):
            suspicious_rows.append(
                {
                    "country": country,
                    "source": source,
                    "device": device,
                    "browser": browser,
                    "operating_system": os_name,
                    "sessions": sessions,
                    "engaged_sessions": engaged_sessions,
                    "average_session_duration_s": avg_session_duration,
                }
            )

    suspicious_rows.sort(key=lambda r: r["sessions"], reverse=True)
    suspicious_sessions = sum(r["sessions"] for r in suspicious_rows)
    likely_human_sessions = max(0, total_sessions - suspicious_sessions)
    suspicious_share_pct = (
        round((suspicious_sessions / total_sessions) * 100, 1) if total_sessions else 0.0
    )

    return {
        "rule": (
            "direct+desktop+chrome+windows with avg_session_duration<1s and sessions>=5"
        ),
        "total_sessions": total_sessions,
        "likely_human_sessions": likely_human_sessions,
        "likely_bot_sessions": suspicious_sessions,
        "likely_bot_share_pct": suspicious_share_pct,
        "suspicious_fingerprints": suspicious_rows,
    }


def render_markdown(meta: Dict, rows: List[Dict], analysis: Dict, traffic_quality: Dict) -> str:
    lines = []
    lines.append(f"# TSquirrel GA4 Report ({meta['days']}d)")
    lines.append("")
    lines.append(f"- Generated: {meta['generated_at_utc']}")
    lines.append(f"- Property ID: {meta['property_id']}")
    lines.append(f"- Row limit: {meta['limit']}")
    lines.append(
        "- Excluded internal prefixes: "
        + (", ".join(analysis["exclude_prefixes"]) if analysis["exclude_prefixes"] else "(none)")
    )
    lines.append("")
    lines.append("## Top pages")
    lines.append("")
    lines.append("| # | Title | Path | Views | Sessions | Active users |")
    lines.append("|---|---|---|---:|---:|---:|")
    for idx, r in enumerate(rows, start=1):
        title = (r["page_title"] or "").replace("|", "\\|")
        path = (r["page_path"] or "").replace("|", "\\|")
        lines.append(
            f"| {idx} | {title} | {path} | {r['screen_page_views']} | {r['sessions']} | {r['active_users']} |"
        )

    lines.append("")
    lines.append("## Signals")
    lines.append("")

    lines.append("### Traffic quality split (heuristic)")
    lines.append(
        f"- Raw sessions (all traffic): {traffic_quality['total_sessions']}"
    )
    lines.append(
        f"- Likely human sessions: {traffic_quality['likely_human_sessions']}"
    )
    lines.append(
        f"- Likely bot/crawler sessions: {traffic_quality['likely_bot_sessions']} ({traffic_quality['likely_bot_share_pct']}%)"
    )
    lines.append(f"- Rule: `{traffic_quality['rule']}`")

    if traffic_quality["suspicious_fingerprints"]:
        lines.append("- Top suspicious fingerprints:")
        for fp in traffic_quality["suspicious_fingerprints"][:5]:
            lines.append(
                "  - "
                f"{fp['country']} | {fp['source']} | {fp['device']} | {fp['browser']} {fp['operating_system']} "
                f"=> {fp['sessions']} sessions, avg {fp['average_session_duration_s']:.2f}s"
            )

    lines.append("")

    if analysis["homepage_title_variants"]:
        lines.append("### Homepage title variants")
        for title, views in sorted(
            analysis["homepage_title_variants"].items(),
            key=lambda kv: kv[1],
            reverse=True,
        ):
            lines.append(f"- {title}: {views} views")
    else:
        lines.append("- No homepage title variants detected in top rows.")

    lines.append(f"- 404 page views (top rows aggregate): {analysis['error_404_views']}")
    lines.append("")
    lines.append("### Internal/admin noise")
    lines.append(
        f"- Excluded internal share (all traffic): {analysis['excluded_share_pct']}%"
    )
    lines.append(
        "- Totals (all): "
        f"{analysis['totals']['all']['screen_page_views']} views / "
        f"{analysis['totals']['all']['sessions']} sessions / "
        f"{analysis['totals']['all']['active_users']} active users"
    )
    lines.append(
        "- Totals (excluded): "
        f"{analysis['totals']['excluded']['screen_page_views']} views / "
        f"{analysis['totals']['excluded']['sessions']} sessions / "
        f"{analysis['totals']['excluded']['active_users']} active users"
    )
    lines.append(
        "- Totals (public): "
        f"{analysis['totals']['public']['screen_page_views']} views / "
        f"{analysis['totals']['public']['sessions']} sessions / "
        f"{analysis['totals']['public']['active_users']} active users"
    )
    lines.append("")

    lines.append("### Top public pages")
    for r in analysis["top_public_pages"][:10]:
        lines.append(
            f"- {r['page_title']} ({r['page_path']}): {r['screen_page_views']} views / {r['sessions']} sessions"
        )

    if analysis["top_excluded_pages"]:
        lines.append("")
        lines.append("### Top excluded internal pages")
        for r in analysis["top_excluded_pages"][:10]:
            lines.append(
                f"- {r['page_title']} ({r['page_path']}): {r['screen_page_views']} views / {r['sessions']} sessions"
            )

    lines.append("")
    return "\n".join(lines)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def main() -> int:
    ap = argparse.ArgumentParser(description="Run TSquirrel GA4 report")
    ap.add_argument("--property-id", default=os.getenv("GA4_PROPERTY_ID", ""))
    ap.add_argument(
        "--service-account",
        default=os.getenv(
            "GA4_SERVICE_ACCOUNT_PATH",
            "/home/cribe/.config/ga4/tsquirrel-service-account.json",
        ),
    )
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--limit", type=int, default=25)
    ap.add_argument(
        "--exclude-prefix",
        action="append",
        default=None,
        help="Exclude pagePath prefixes from public metrics (repeatable). Defaults to /admin and /auth.",
    )
    ap.add_argument(
        "--out-dir",
        default="reports/analytics",
        help="Directory for markdown/json outputs",
    )
    args = ap.parse_args()

    exclude_prefixes = args.exclude_prefix or ["/admin", "/auth"]

    if not args.property_id:
        raise SystemExit("Missing --property-id (or GA4_PROPERTY_ID env var)")

    service_path = Path(args.service_account)
    if not service_path.exists():
        raise SystemExit(f"Service account file not found: {service_path}")

    with service_path.open() as f:
        service_account = json.load(f)

    try:
        token = fetch_access_token(service_account)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise SystemExit(f"Token request failed: HTTP {e.code} {body}")

    payload: Dict[str, object] = {
        "dateRanges": [{"startDate": f"{args.days}daysAgo", "endDate": "today"}],
        "dimensions": [{"name": "pagePath"}, {"name": "pageTitle"}],
        "metrics": [
            {"name": "screenPageViews"},
            {"name": "sessions"},
            {"name": "activeUsers"},
        ],
        "orderBys": [{"metric": {"metricName": "screenPageViews"}, "desc": True}],
        "limit": args.limit,
    }

    exclude_or_filter = build_or_prefix_filter(exclude_prefixes)
    if exclude_or_filter:
        payload["dimensionFilter"] = {"notExpression": exclude_or_filter}

    try:
        report = run_report(token, str(args.property_id), payload)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise SystemExit(f"GA runReport failed: HTTP {e.code} {body}")

    rows = parse_rows(report)

    totals_all_payload: Dict[str, object] = {
        "dateRanges": [{"startDate": f"{args.days}daysAgo", "endDate": "today"}],
        "metrics": [
            {"name": "screenPageViews"},
            {"name": "sessions"},
            {"name": "activeUsers"},
        ],
    }
    totals_excluded_payload: Dict[str, object] = {
        "dateRanges": [{"startDate": f"{args.days}daysAgo", "endDate": "today"}],
        "metrics": [
            {"name": "screenPageViews"},
            {"name": "sessions"},
            {"name": "activeUsers"},
        ],
    }
    if exclude_or_filter:
        totals_excluded_payload["dimensionFilter"] = exclude_or_filter

    totals_all_report = run_report(token, str(args.property_id), totals_all_payload)
    totals_excluded_report = run_report(token, str(args.property_id), totals_excluded_payload)

    signature_payload: Dict[str, object] = {
        "dateRanges": [{"startDate": f"{args.days}daysAgo", "endDate": "today"}],
        "dimensions": [
            {"name": "country"},
            {"name": "sessionSourceMedium"},
            {"name": "deviceCategory"},
            {"name": "browser"},
            {"name": "operatingSystem"},
        ],
        "metrics": [
            {"name": "sessions"},
            {"name": "engagedSessions"},
            {"name": "averageSessionDuration"},
            {"name": "screenPageViews"},
            {"name": "activeUsers"},
            {"name": "eventCount"},
        ],
        "orderBys": [{"metric": {"metricName": "sessions"}, "desc": True}],
        "limit": 250,
    }
    signature_report = run_report(token, str(args.property_id), signature_payload)

    totals_all = {
        "screen_page_views": metric_int(totals_all_report.get("rows", []), 0),
        "sessions": metric_int(totals_all_report.get("rows", []), 1),
        "active_users": metric_int(totals_all_report.get("rows", []), 2),
    }
    totals_excluded = {
        "screen_page_views": metric_int(totals_excluded_report.get("rows", []), 0),
        "sessions": metric_int(totals_excluded_report.get("rows", []), 1),
        "active_users": metric_int(totals_excluded_report.get("rows", []), 2),
    }
    totals_public = {
        "screen_page_views": max(0, totals_all["screen_page_views"] - totals_excluded["screen_page_views"]),
        "sessions": max(0, totals_all["sessions"] - totals_excluded["sessions"]),
        "active_users": max(0, totals_all["active_users"] - totals_excluded["active_users"]),
    }

    totals = {"all": totals_all, "excluded": totals_excluded, "public": totals_public}
    analysis = analyze(rows, exclude_prefixes, totals)
    traffic_quality = detect_likely_bot_signature(signature_report, totals_all["sessions"])

    generated_at = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")
    out_dir = Path(args.out_dir)
    out_md = out_dir / f"ga4-report-{stamp}.md"
    out_json = out_dir / f"ga4-report-{stamp}.json"

    ensure_parent(out_md)
    ensure_parent(out_json)

    meta = {
        "generated_at_utc": generated_at,
        "property_id": str(args.property_id),
        "days": args.days,
        "limit": args.limit,
        "exclude_prefixes": exclude_prefixes,
    }

    md = render_markdown(meta, rows, analysis, traffic_quality)
    out_md.write_text(md)
    out_json.write_text(
        json.dumps(
            {
                "meta": meta,
                "analysis": analysis,
                "traffic_quality": traffic_quality,
                "rows": rows,
            },
            indent=2,
        )
    )

    print(f"OK report_md={out_md}")
    print(f"OK report_json={out_json}")
    print(f"rows={len(rows)}")
    print(f"excluded_share_pct={analysis['excluded_share_pct']}")
    print(
        "traffic_quality="
        + json.dumps(
            {
                "likely_human_sessions": traffic_quality["likely_human_sessions"],
                "likely_bot_sessions": traffic_quality["likely_bot_sessions"],
                "likely_bot_share_pct": traffic_quality["likely_bot_share_pct"],
            }
        )
    )
    if analysis["homepage_title_variants"]:
        print("homepage_title_variants=" + json.dumps(analysis["homepage_title_variants"]))
    print(f"error_404_views={analysis['error_404_views']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
