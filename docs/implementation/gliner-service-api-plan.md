# GLiNER Service API Implementation Plan (TSquirrel)

## Why this exists
Preserve the plan to expose GLiNER as a reusable TSquirrel service so Hermes and other authorized clients can call a single API for classification/extraction.

## Decision snapshot
- **Host GLiNER as a TSquirrel stack service** (Docker Compose resource).
- **Keep Hermes orchestration outside** for now (shadow tuning/reporting cadence).
- **Expose via TSquirrel API contract** (OpenAPI 3.1), not direct container access.

## Scope (v1)
Implement internal API endpoints under `/api/v1/nlp`:

1. `POST /classify`
2. `POST /extract`
3. `POST /extract-and-classify`
4. `POST /batch`
5. `GET /health`
6. `GET /models`
7. `GET /stats`

## Request/response contract principles
- JSON only.
- Stable top-level shapes (`prediction`, `confidence`, `entities`, `meta`, `error`).
- Include `model` and `latency_ms` in `meta`.
- Include optional `client_ref` for caller traceability.
- Deterministic error schema:
  - `error.code`
  - `error.message`
  - `error.request_id`

## Auth + policy
- TSquirrel bearer auth.
- Suggested scopes:
  - `nlp:classify`
  - `nlp:extract`
  - `nlp:batch`
- Per-token limits:
  - requests/min
  - max chars/request
  - max batch size

## Service placement in compose
- Add `gliner-service` to compose as optional profile (`gliner`).
- Keep model cache on persistent volume.
- Healthcheck required before accepting traffic.
- Keep raw GLiNER service internal; expose only through TSquirrel API layer.

## Runtime model strategy (initial)
- Default: `fastino/gliner2.5-small-v1`
- Allow listed models only (from config)
- Reject unknown model IDs with `INVALID_MODEL`

## Batch behavior
- Partial success allowed per item.
- Return array of `results[]` with per-item `ok|error` status.
- Do not fail whole batch because one item is invalid.

## Observability
- Log per request: request_id, endpoint, model, chars, latency, status.
- Track p50/p95 latency + error rate in `/stats`.
- Add token/client metrics for abuse detection.

## Rollout plan
### Phase 1 (contract + skeleton)
- Add OpenAPI 3.1 spec file for endpoints/schemas.
- Add TSquirrel API route skeletons with validation + mocked responses.

### Phase 2 (real inference)
- Wire routes to gliner service client.
- Implement model loading, timeout handling, and retries.

### Phase 3 (production hardening)
- Rate limits + auth scopes.
- Metrics, dashboards, and alerting.
- Backpressure + queue protection for batch requests.

## Shadow tuning relationship
- Keep weekly tuning loop in Hermes while GLiNER remains non-blocking/shadow.
- If GLiNER becomes publish hard-gate, migrate more orchestration into TSquirrel.

## Acceptance criteria (v1)
- OpenAPI 3.1 spec committed and valid.
- `/health`, `/classify`, `/extract`, `/extract-and-classify`, `/batch` operational.
- Auth/scopes enforced.
- Structured error contract enforced.
- Basic metrics visible in `/stats`.

## Open questions
1. Should `/stats` be admin-only or scoped?
2. Should batch endpoint support async job mode for large payloads?
3. What hard timeout per request is acceptable for TSquirrel SLA?
4. Do we pin one model in prod or allow per-request model override?
