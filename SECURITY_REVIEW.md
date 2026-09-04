# Security review

Date: 2026-09-03

This is a code/configuration review of the current application state. It is not a penetration test, formal audit, or guarantee of security.

## Findings and remediation

### 1. High — E2EE is not implemented; temporary plaintext search index exists
- **Location:** `db/migrations/0011_search.sql`, `src/lib/messages/service.ts`, `src/lib/search/service.ts`.
- **Explanation:** The current application can persist `messages.search_content` in plaintext so server-side message search works. This means a database disclosure can expose searchable message content. The application also does not yet provide the planned E2EE confidentiality boundary.
- **Safe fix:** Complete the E2EE milestone using a mature, established protocol/library and, after security review, remove `search_content` and replace server-side message search with a client-side decrypted index. Do not substitute custom encryption.
- **Test proving the fix:** Create a message containing a known plaintext, inspect the PostgreSQL row, and assert that no plaintext search field exists and the stored message payload is ciphertext. Then search locally on the authorized client and verify the server receives no plaintext search query/content.
- **Status:** **Not safely fixable in this review without completing the security-critical E2EE design. Explicitly left unresolved.**

### 2. High — Missing CSRF protection on cookie-authenticated state changes
- **Location:** state-changing `/api/**` routes.
- **Explanation:** The session is a browser cookie, so state-changing requests need a same-origin defense in addition to SameSite cookies.
- **Safe fix:** Added strict Origin checking for POST/PATCH/DELETE API requests. Requests without an Origin are rejected for state-changing browser API operations.
- **Test:** `npm run security:check` verifies every state-changing API route has the guard. Cross-origin requests must receive 403.
- **Status:** **Fixed.**

### 3. High — WebSocket Origin was optional
- **Location:** `scripts/ws-server.ts` upgrade handler.
- **Explanation:** The gateway previously accepted an upgrade when the Origin header was absent. That weakened browser cross-site WebSocket protection.
- **Safe fix:** Require an Origin header and require an exact match with the configured application origin before accepting the upgrade.
- **Test:** Security regression checks assert the strict Origin condition.
- **Status:** **Fixed.**

### 4. Medium — HTTP mutation endpoints lacked a shared abuse limit
- **Location:** profile, conversation, message-feature, attachment, and notification mutation routes.
- **Explanation:** Several expensive state-changing APIs had validation/authorization but no common per-user request ceiling.
- **Safe fix:** Added an authenticated per-user in-process mutation limit of 120 requests/minute with `429`/`Retry-After` responses.
- **Test:** Security regression checks verify the limiter is wired into mutation routes; existing feature tests continue to pass.
- **Status:** **Fixed, with the deployment limitation below.**

### 5. Medium — WebSocket resource abuse controls were incomplete
- **Location:** `scripts/ws-server.ts`.
- **Explanation:** Message/typing events were rate-limited, but connection/event resource exhaustion could still be attempted.
- **Safe fix:** Added per-user and per-device connection caps, a generic per-connection event rate limit, and a per-remote-address upgrade rate limit.
- **Test:** `npm run security:check` verifies all controls are present; existing realtime/presence tests pass.
- **Status:** **Fixed at the application layer.**

### 6. Medium — Attachment download buffered the entire object in memory
- **Location:** `src/app/api/attachments/[attachmentId]/route.ts`.
- **Explanation:** A 10 MB object was fully materialized before responding. Concurrent downloads could unnecessarily increase memory pressure.
- **Safe fix:** Stream the S3 object through the response using `transformToWebStream()`.
- **Test:** Security regression check verifies streaming is used; attachment validation/access-control tests still pass.
- **Status:** **Fixed.**

### 7. Medium — Multipart uploads could contain duplicate/ignored fields
- **Location:** `src/app/api/attachments/route.ts`.
- **Explanation:** The parser previously accepted multiple `file` or `messageId` fields while using only the first value. This creates ambiguous request handling and unnecessary parsing work.
- **Safe fix:** Require exactly one `file` and one `messageId` field before accepting the upload.
- **Test:** Security regression check verifies the cardinality check; attachment tests pass.
- **Status:** **Fixed.**

### 8. Medium — Client-controlled avatar storage references were not bound to the account
- **Location:** `src/lib/profile/service.ts`.
- **Explanation:** A user could associate an arbitrary known storage key with their profile. There was no server-side ownership boundary around the reference.
- **Safe fix:** Avatar references are accepted only when they are under the authenticated user's `avatars/<internal-user-id>/` namespace.
- **Test:** Security regression test verifies the namespace check and rejection code.
- **Status:** **Fixed.**

### 9. Medium — Logs accepted arbitrary metadata
- **Location:** `src/lib/logger.ts`.
- **Explanation:** A future call site could accidentally pass tokens, cookies, ciphertext, search queries, or other sensitive fields into structured logs.
- **Safe fix:** Added recursive metadata redaction for sensitive field names and prevents serializing Error objects with arbitrary details.
- **Test:** `npm run security:check` checks the redaction implementation.
- **Status:** **Fixed as a defense-in-depth measure.**

### 10. Medium — Production HTTPS/security configuration was not enforced
- **Location:** `src/lib/env.ts`, `next.config.ts`, session cookie configuration.
- **Explanation:** Production deployment could otherwise be configured with HTTP origins or an insecure cookie configuration.
- **Safe fix:** Production startup now requires HTTPS application/origin URLs. The production cookie uses the `__Host-` prefix and Secure flag; local development uses a non-`__Host` cookie so HTTP localhost development works. Added security headers and HSTS in production.
- **Test:** Security regression checks verify the configuration guards and headers.
- **Status:** **Fixed.**

### 11. Medium — Anonymous signup rate limiting trusted spoofable X-Forwarded-For
- **Location:** `src/app/api/auth/anonymous/route.ts`.
- **Explanation:** An attacker could vary a client-controlled forwarding header when the application is not behind a trusted proxy, potentially bypassing the signup limit.
- **Safe fix:** Only trust `X-Forwarded-For` when `TRUST_PROXY=true`. Otherwise the application uses a conservative shared bucket; production deployments should enforce per-IP limits at a trusted edge/proxy.
- **Test:** Security regression checks verify the explicit trust switch.
- **Status:** **Fixed in application logic; trusted-edge enforcement remains a deployment responsibility.**

### 12. Medium — Dependency integrity/vulnerability status cannot currently be verified
- **Location:** `package.json`.
- **Explanation:** There is no `package-lock.json`, dependencies include `latest`, and this environment could not reach the npm registry. Therefore an exact dependency tree and current vulnerability report cannot be established.
- **Safe fix:** Pin exact dependency versions, generate and commit `package-lock.json`, run `npm audit` and a CI vulnerability scanner, and update dependencies through reviewed lockfile changes.
- **Test:** CI should run `npm ci`, `npm audit`, and the build from the committed lockfile.
- **Status:** **Unresolved in this environment.** No claim of a clean dependency audit is made.

### 13. Medium — PostgreSQL least privilege is not enforceable by the application connection itself
- **Location:** `DATABASE_URL`, `db/README.md`.
- **Explanation:** The example previously encouraged a `postgres` superuser connection. A compromised application using a superuser can cause substantially more database damage.
- **Safe fix:** The example now uses a dedicated `messenger_app` role placeholder. Production should use a separate migration/DDL role and a restricted runtime role.
- **Test:** Deployment test should inspect `current_user` and verify the runtime role cannot create/drop schemas or roles.
- **Status:** **Documented/fixed in configuration guidance; live DB privileges require deployment verification.**

### 14. Low/Medium — Anonymous sessions have no recovery path
- **Location:** anonymous authentication design.
- **Explanation:** A lost bearer session cannot currently be recovered. Adding email/phone recovery would change the privacy model and could conflict with future E2EE identity/key recovery.
- **Safe fix:** Design recovery together with the reviewed E2EE/device identity model rather than bolting on a separate account-recovery secret.
- **Test:** Threat-model and recovery tests should verify that recovery cannot silently grant access to another device's private keys.
- **Status:** **Intentionally unresolved; no unsafe recovery feature was added.**

### 15. Low/Medium — Device management is incomplete
- **Location:** current session/device model.
- **Explanation:** The application tracks devices and sessions but does not expose a complete user-facing device inventory/revocation workflow. A stolen session remains usable until expiration/revocation.
- **Safe fix:** Add device/session revocation as part of the authentication/device-management milestone, with careful interaction with future E2EE identity keys.
- **Test:** Revoke one device and verify its HTTP and WebSocket sessions are rejected while another device remains active.
- **Status:** **Not implemented because it is a missing feature/security-design boundary rather than something to fake during this review.**

## Areas reviewed with no new confirmed vulnerability

- **SQL injection:** Queries use PostgreSQL parameters. Dynamic profile column names are selected only from fixed server-side literals.
- **IDOR:** Conversation/message/attachment operations resolve authorization from the authenticated server-side user/device and membership joins rather than client-provided user IDs.
- **XSS:** No use of `dangerouslySetInnerHTML` was found. User text is returned as data for React rendering; attachments are forced as downloads with `nosniff`.
- **Secrets:** `.env*` is ignored except `.env.example`; server storage/VAPID credentials are not exposed to the browser.
- **Passwords:** No password field exists in the anonymous-account model.
- **Message logging:** Realtime and application code does not intentionally log message contents; the logger now redacts common sensitive metadata.
- **Object storage:** Storage credentials remain server-side, objects are private, keys are opaque, and PostgreSQL stores references/metadata rather than file bytes.
- **Notification privacy:** Notification payloads are generic and do not contain plaintext message content.

## Verification status

Passed:

- `npm run security:check`
- `npm run db:check`
- `npm run auth:check`
- `npm run profile:check`
- `npm run realtime:check`
- `npm run presence:check`
- `npm run attachment:check`
- `npm run message-state:check`
- `npm run message-feature:check`
- `npm run notification:check`
- `npm run search:check`

A global TypeScript invocation found no diagnostics beyond missing installed dependencies and pre-existing type inference diagnostics caused by the absent dependency/type packages. The npm registry was unreachable, so dependencies could not be installed in this environment.

`npm run build` was also attempted and failed with:

```text
next: not found
```

This is an environment/dependency-installation failure, not evidence that the production build is successful.

`npm audit` could not run because there is no lockfile, and creating one was blocked by the unavailable npm registry.

## Final assessment

The application has several meaningful security controls and the identified application-level issues above were remediated where that could be done safely. It is **not 100% secure**, has important unresolved security/design limitations, and should not be presented as a production-secure private messenger until E2EE/key management receives professional review and the dependency, database-role, deployment, and end-to-end security checks are completed.
