# RFC: Shared Inference Mesh for TSquirrel + Hermes

## Status
Draft

## Goal
Create a shared compute/inference resource layer so clients (TSquirrel, Hermes, other internal tools) can route workloads to available nodes (VPS CPU, mrwhite GPU, future workers) instead of running everything on one host.

## Problem
Current VPS capacity is small (2 vCPU / 2GB RAM class). GLiNER-style inference can consume ~1-2 cores and ~1.2GB RAM per active job, which risks contention with live site workloads.

## Proposed outcome
- Keep TSquirrel web/app services stable.
- Move heavy inference to a pooled mesh.
- Expose one API contract to callers.
- Route requests by capability and load.

## Scope (v1)
- Internal-only inference gateway.
- Worker registry with capability tags.
- Queue + scheduler with admission control.
- Synchronous small-job path + asynchronous batch path.

## Non-goals (v1)
- Global multi-tenant billing.
- Cross-org public marketplace.
- Complex federated security models.

## Architecture

### Components
1. **Inference Gateway (control plane API)**
   - Single entrypoint for clients.
   - AuthN/AuthZ, request validation, quotas.
   - Converts OpenAPI request into internal job spec.

2. **Scheduler / Router**
   - Chooses target worker by policy:
     - required capability (`cpu`, `gpu`, `model:gliner2.5-small-v1`)
     - queue depth
     - current load
     - latency budget
   - Supports fallback policies.

3. **Worker Agents (data plane)**
   - Run on nodes (VPS, mrwhite, future hosts).
   - Pull jobs from queue.
   - Execute model inference and return structured result.

4. **Queue + Result Store**
   - Queue (Redis/NATS/Kafka class) for decoupling.
   - Result storage with TTL for async polling.

5. **Service Registry / Heartbeat**
   - Worker capability registration.
   - Liveness + version + model inventory.

### Request flow (sync)
1. Client posts `/api/v1/nlp/extract-and-classify`.
2. Gateway validates token/scope/size.
3. Router picks healthiest matching worker.
4. Worker executes and returns result.
5. Gateway returns normalized response.

### Request flow (async batch)
1. Client posts `/api/v1/nlp/batch` with `async=true`.
2. Gateway returns `job_id` immediately.
3. Workers process items.
4. Client polls `/api/v1/nlp/jobs/{job_id}` (or webhook later).

## Routing policy (initial)
- Priority 1: capability match.
- Priority 2: least loaded worker below CPU/RAM threshold.
- Priority 3: lowest p95 latency class.
- Hard reject when no worker meets minimum headroom.

## Reliability rules
- Per-job timeout + retry budget.
- Idempotency key for retried requests.
- Circuit breaker per worker node.
- Graceful degradation: return `MODEL_UNAVAILABLE` fast when pool is saturated.

## Security model
- Gateway-only public exposure.
- Worker nodes private network only (WireGuard/Tailscale/VPN).
- Signed worker registration tokens.
- Per-client scopes (`nlp:classify`, `nlp:extract`, `nlp:batch`).

## Observability
- Metrics:
  - request rate, error rate, p50/p95 latency
  - queue depth, dequeue latency
  - worker CPU/RAM/GPU utilization
  - per-model throughput + failure rate
- Logs:
  - request_id, client_id, selected worker, model, latency, status

## Capacity strategy
- Reserve VPS for site reliability first.
- Route heavy/batch jobs to mrwhite GPU/CPU nodes.
- Apply queue backpressure when workers exceed thresholds.

## Rollout plan

### Phase 0 — Contract-first (now)
- Finalize OpenAPI 3.1 for NLP endpoints.
- Keep existing local execution path as fallback.

### Phase 1 — Single remote worker
- Add gateway + one worker on mrwhite.
- Route only shadow GLiNER jobs through mesh.

### Phase 2 — Multi-worker + queue
- Add async jobs and worker pool.
- Enable policy-based routing and failover.

### Phase 3 — Production hardening
- Autoscaling hooks, dashboards, alerts.
- SLOs and load-shed rules.

## Success criteria
- No measurable degradation on TSquirrel site P95 latency under normal load.
- Shadow inference jobs complete with stable p95 latency target.
- Worker failure does not take down API; requests fail fast and clearly.
- Weekly report shows queue health + tuning impact.

## Open questions
1. Preferred transport for worker comms: Redis queue vs NATS?
2. Do we require GPU-only routing for specific models at launch?
3. Should async job completion use webhook or polling first?
4. What SLO target do we want for sync classify/extract calls?
