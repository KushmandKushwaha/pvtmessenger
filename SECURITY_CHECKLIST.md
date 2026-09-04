# Production Security Checklist

## Release gate

- [ ] E2EE status is clearly documented: **not implemented**.
- [ ] No custom cryptography has been introduced.
- [ ] No real secrets are committed.
- [ ] `.env` files remain ignored; only `.env.example` is committed.
- [ ] `package-lock.json` is committed and `npm ci` succeeds.
- [ ] `npm audit --audit-level=high` reviewed.

## Environment / secrets

- [ ] `DATABASE_URL` configured through the secret manager.
- [ ] `APP_ORIGIN` is the exact production HTTPS origin.
- [ ] `NEXT_PUBLIC_APP_URL` is the exact production HTTPS URL.
- [ ] `NEXT_PUBLIC_WS_URL` is the exact production `wss://` realtime URL.
- [ ] `REALTIME_TICKET_SECRET` is identical on the Netlify app and realtime service and is never client-exposed.
- [ ] S3 credentials are server-only.
- [ ] Web Push private VAPID key is server-only.
- [ ] Secrets are rotated independently from application deploys.

## Authentication / sessions

- [ ] Production session cookie is `__Host-session`.
- [ ] Cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`.
- [ ] Session expiration and revocation behavior reviewed.
- [ ] Login/account-creation rate limits reviewed for the actual threat model.
- [ ] Proxy trust is disabled unless the deployment proxy strips/replaces forwarding headers.

## HTTP / browser security

- [ ] TLS is enforced end-to-end where required by the architecture.
- [ ] HSTS is enabled only on a domain that is permanently HTTPS.
- [ ] CSP has been tested with the production asset/WebSocket topology.
- [ ] No permissive credentialed CORS has been introduced.
- [ ] State-changing HTTP endpoints retain same-origin/CSRF protection.
- [ ] Security headers are present in production responses.

## Database

- [ ] Production database is separate from test/development databases.
- [ ] Database credentials use least privilege.
- [ ] Migrations are applied as a controlled release step.
- [ ] Connection limits are sized for the number of application instances.
- [ ] Backups and point-in-time recovery are enabled where supported.
- [ ] A restore has been tested.

## Attachments / object storage

- [ ] Bucket is private and public access is blocked.
- [ ] Storage credentials are not exposed to clients.
- [ ] Attachment authorization remains server-side.
- [ ] Object lifecycle/retention is defined.
- [ ] Storage recovery/versioning strategy is defined.
- [ ] Storage encryption is understood as server-side/storage encryption, **not E2EE**.

## Realtime / WebSocket

- [ ] Reverse proxy supports WebSocket upgrades.
- [ ] Public Origin and `APP_ORIGIN` are aligned.
- [ ] Session cookie is available to the WebSocket handshake.
- [ ] Idle timeout/heartbeat settings have been tested.
- [ ] SIGTERM/SIGINT graceful shutdown has been tested.
- [ ] Horizontal scaling strategy has been reviewed; in-memory presence/broadcast state is not automatically shared between instances.

## Rate limiting / abuse controls

- [ ] HTTP rate limits reviewed.
- [ ] WebSocket rate limits reviewed.
- [ ] Edge/WAF rate limits added for public production traffic where appropriate.
- [ ] Distributed rate limiting is considered before horizontal scaling.

## Privacy / logging

- [ ] Logs contain no message content, ciphertext, tokens, cookies, or private credentials.
- [ ] Error responses do not expose stack traces or internal credentials.
- [ ] Log retention/access policy is defined.
- [ ] Privacy/data-retention requirements are documented.

## Monitoring / operations

- [ ] `/api/health` is configured as a liveness check.
- [ ] Database/storage/realtime monitoring exists separately from liveness.
- [ ] Alerts are configured for elevated errors, latency, connection failures, and resource exhaustion.
- [ ] Deployment rollback procedure is documented.
- [ ] Incident response contacts/procedure are defined.

## Human review

- [ ] Security review completed for authentication and authorization.
- [ ] Threat model reviewed.
- [ ] Dependency audit reviewed.
- [ ] Proxy/network topology reviewed.
- [ ] Backup restore reviewed.
- [ ] Attachment/storage policy reviewed.
- [ ] Realtime scaling/restart behavior reviewed.
- [ ] E2EE roadmap/claims reviewed before any future encryption work.
