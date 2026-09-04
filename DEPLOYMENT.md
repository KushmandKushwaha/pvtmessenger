# Production-like Deployment Guide

## Status

The application is **deployment-prepared, not certified production-secure**. The build, type checking, linting, static/security checks, and existing E2E health check should be run in the target environment before release. A real integration database is still required for the integration suite.

E2EE is **not implemented**. Message confidentiality currently depends on the existing application/storage architecture and transport security; this project must not be marketed as end-to-end encrypted.

## Required configuration

Set deployment secrets through the hosting platform's secret/environment-variable manager. Never commit a real `.env` file.

Required at runtime:

- `DATABASE_URL` — production PostgreSQL connection string.
- `APP_ORIGIN` — exact public HTTPS origin, for example `https://messenger.example.com`.
- `NEXT_PUBLIC_APP_URL` — same public HTTPS application URL used by browser-visible configuration.
- `NEXT_PUBLIC_WS_URL` — public `wss://` URL of the Render realtime service.
- `REALTIME_TICKET_SECRET` — long random secret shared by Netlify and the realtime service; never expose it to the browser.
- `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` — private object storage credentials.

Required when push notifications are enabled:

- `WEB_PUSH_SUBJECT`
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`

Optional/configuration values include `APP_NAME`, `LOG_LEVEL`, `S3_ENDPOINT`, `S3_REGION`, `S3_FORCE_PATH_STYLE`, `WS_PORT`, and `TRUST_PROXY`.

## HTTPS and cookies

Production requires HTTPS. The session cookie uses the `__Host-` prefix in production, `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`. Do not terminate TLS at the application itself unless the deployment architecture explicitly supports it; normally TLS is terminated by a trusted reverse proxy/load balancer.

`APP_ORIGIN` must match the browser origin exactly. If the reverse proxy exposes the WebSocket gateway on a different origin, configure the proxy so clients connect through the intended public origin and preserve the Origin header.

## Database

Run migrations as a controlled deployment step before starting application traffic:

```text
npm run db:migrate
npm run db:check
```

Use a managed PostgreSQL service or another production-grade PostgreSQL deployment with automated backups, point-in-time recovery where available, encryption at rest, restricted network access, and least-privilege credentials. Do not use the test database for production.

The application uses a bounded PostgreSQL pool (`max: 10`). Size the database connection limits together with the number of application instances; multiple instances multiply the possible number of connections.

## Object storage

Use a private S3-compatible bucket. Credentials must remain server-side. Keep public bucket access disabled and use the application authorization layer for attachment access. Storage-side encryption is enabled for uploaded objects, but this is **not E2EE**.

Configure lifecycle/retention policies and backups/versioning according to the operational requirements of the deployment.

## WebSocket deployment

The realtime gateway is a separate Node process (`npm run realtime`). It binds to the platform `PORT` when provided and falls back to `WS_PORT`/`3001` locally. For the documented deployment, run it as a Render Web Service with `/healthz` as the health check. Public clients connect with `wss://` to the Render service. Because the production session cookie is host-only (`__Host-session`), the browser does not send that cookie to a separate Render origin; the app therefore obtains a short-lived signed realtime ticket from the same-origin API and presents it in the WebSocket subprotocol during the handshake.

The gateway verifies the short-lived realtime ticket and checks the Origin header before upgrading. The same-origin API endpoint that issues the ticket first authenticates the `__Host-session` cookie. Do not expose it on an unintended public origin. Multiple gateway instances require a deliberate scaling strategy because connection state, presence, and broadcasts are held in process memory. A shared realtime broker or sticky/session-aware architecture would need to be designed before horizontal scaling.

The gateway handles `SIGTERM`/`SIGINT` by stopping new upgrades, closing sockets, and closing the database pool. The hosting platform should still provide a sensible termination grace period.

## CORS / CSRF

The application does not enable permissive cross-origin API access. State-changing HTTP routes enforce same-origin requests. Do not add `Access-Control-Allow-Origin: *` or credentialed wildcard CORS. If a future integration requires cross-origin access, design an explicit allowlist and review the CSRF model first.

## Security headers

The Next.js application sets HSTS in production, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and a restrictive Content Security Policy. Validate the CSP against the actual production deployment, especially if the WebSocket connection is proxied through a separate origin.

## Rate limiting

HTTP and realtime rate limits are currently process-local. This is useful for a single instance but is **not a distributed rate-limiting system**. If the service is horizontally scaled or exposed to hostile traffic, put appropriate edge/WAF/API-gateway limits in front of it and consider a shared rate-limit store.

If `TRUST_PROXY=true`, the deployment proxy must strip and replace client IP forwarding headers so clients cannot spoof them. Leave it false unless the proxy contract is understood.

## Logging and errors

Logs are structured and redact sensitive field names, including tokens, cookies, authorization values, ciphertext/plaintext/message-content fields, and storage credentials. Do not add message contents, session tokens, attachment bodies, or private keys to logs.

API errors should expose stable, user-safe messages rather than stack traces or credentials. Server logs should contain enough operational context for incident investigation without collecting message content.

## Health checks

`GET /api/health` is a lightweight liveness endpoint. It does not prove that PostgreSQL, object storage, WebSocket infrastructure, or push notification delivery are healthy. Add infrastructure-specific readiness/dependency checks only after deciding what the deployment platform needs; do not make the liveness endpoint leak connection details.

## Dependency auditing

Keep a committed `package-lock.json` generated by the project's supported Node/npm toolchain before release. Then run:

```text
npm ci
npm audit --audit-level=high
```

Review dependency updates rather than blindly accepting major-version changes. The repository currently declares several dependencies using `latest`; pinning exact versions and committing the lockfile is recommended for reproducible releases.

## Release verification

Run:

```text
npm ci
npm run typecheck
npm run lint
npm run build
npm test
npm run test:e2e
```

`npm test` includes integration tests that require `TEST_DATABASE_URL`. Use an isolated test database and apply the test migrations before running those tests.

## Backups and recovery

Before accepting production traffic, define:

- PostgreSQL automated backup schedule and retention.
- Point-in-time recovery and restore testing.
- Object-storage recovery/versioning policy.
- Secret rotation procedure.
- Incident response and account/session invalidation procedure.
- Deployment rollback procedure.
- WebSocket/realtime restart behavior.

A backup that has never been restored should not be treated as a verified backup.

## Human/security review required

Before production launch, have an appropriate reviewer validate the threat model, authentication/session lifecycle, authorization boundaries, CSRF/same-origin assumptions, attachment handling, proxy trust, realtime scaling, dependency vulnerabilities, database permissions, storage bucket policy, monitoring/alerting, backups/restores, and privacy/data-retention requirements.
