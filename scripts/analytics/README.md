# GA4 Analytics Scripts

## `ga4_report.py`
Pulls GA4 page metrics via service-account auth and writes Markdown+JSON artifacts.

### Usage
```bash
cd /home/cribe/GitRepos/tsquirrel
python3 scripts/analytics/ga4_report.py \
  --property-id 352935045 \
  --service-account /home/cribe/.config/ga4/tsquirrel-service-account.json \
  --days 7 \
  --limit 25 \
  --exclude-prefix /admin \
  --exclude-prefix /auth
```

### Output
- `reports/analytics/ga4-report-<timestamp>.md`
- `reports/analytics/ga4-report-<timestamp>.json`

### Internal noise filtering
- By default, the script excludes `pagePath` prefixes: `/admin`, `/auth`
- Override/extend by repeating `--exclude-prefix <prefix>`.

### Env vars (optional)
- `GA4_PROPERTY_ID`
- `GA4_SERVICE_ACCOUNT_PATH`
