# REP-A | P2028 when opening operational dashboard (2026-11-04)
Backend baseline `main@5a864d9b3b65efd874e5fda55841049a64192020`.
Issue: `PrismaClientKnownRequestError P2028: Unable to start a transaction in the given time` when `ReportsController.operational` and `overview` were requested concurrently.
Environment: NestJS, Prisma 7.10.0, `@prisma/adapter-pg`, PostgreSQL, `DB_POOL_MAX` default 10, `DB_CONNECTION_TIMEOUT_MS` default 5000ms.

## Analysis
`ReportingStore.read` and `DomainReportsStore.read` configured 20-second **execution** timeout and RepeatableRead but omitted `maxWait` (defaults to 2 seconds). The UI requests several report endpoints concurrently and read transactions must obtain pool connections before the deadline. This error can arise from saturation, DB latency, slow SQL, connection stall or concurrent load; no logs are present establishing the actual cause.

## Mitigation in branch
Use `maxWait:10000` for read-only reporting $transaction calls (ordinary analytics and domain reports); exports also keep `timeout:60000` but get a bounded acquisition wait.
Do NOT increase connection pool or transaction execution time or silently retry writes; no business logic/permissions/migrations changed.

## Local diagnosis if error persists
1. Query `SELECT state, count(*) FROM pg_stat_activity WHERE datname=current_database() GROUP BY state ORDER BY state;`
2. Query `SELECT pid,state,wait_event_type,wait_event,now()-xact_start AS xact_age,left(query,160) FROM pg_stat_activity WHERE datname=current_database() AND xact_start IS NOT NULL ORDER BY xact_start;`
3. Inspect concurrent requests `/api/reports/operational/dashboard`, `/api/reports/analytics/overview`, methods and expenses; inspect database CPU, connections and long-running transactions, including `idle in transaction`.
4. Check environment `DB_POOL_MAX` and DB connection limits; do not raise pool blindly.
5. `DeprecationWarning client.query() already executing` is distinct: capture `node --trace-deprecation` to identify source (adapter-pg/pg or app code). Do not assume it is P2028 root cause.
6. If the timeout repeats, measure query plans and consider server-side denormalization, report query optimization and bounded concurrency/caching—not indefinite maxWait or disabling transactions.

## Acceptance
- [ ] Unit: verify reporting read maxWait and existing timeout, domain export maxWait and 60000ms timeout.
- [ ] CI lint/build/test.
- [ ] Real Postgres /api/reports dashboard/overview under concurrent UI requests.
- [ ] Behavior and monetary totals identical to main.
