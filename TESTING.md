# Testing and Verification

## Local checks

Install dependencies first:

```bash
npm install
npx playwright install --with-deps chromium
```

Run unit tests:

```bash
npm run test:unit
```

Run integration tests against a PostgreSQL test database:

```bash
TEST_DATABASE_URL=postgresql://messenger_test:messenger_test@127.0.0.1:55432/privacy_messenger_test npm run test:integration
```

Run browser E2E tests:

```bash
npm run test:e2e
```

Run static checks:

```bash
npm run typecheck
npm run lint
npm run build
```

Run the complete verification pipeline:

```bash
npm test
```

`npm test` intentionally fails fast. It does not disable or weaken any check.

## Integration environment

Start the isolated PostgreSQL test service with:

```bash
docker compose -f docker-compose.test.yml up -d --wait
```

Stop it afterwards:

```bash
docker compose -f docker-compose.test.yml down -v
```

The integration suite requires an explicit `TEST_DATABASE_URL`; it will not silently run against a developer's normal database.

## E2E

Playwright starts a development server automatically unless `E2E_BASE_URL` is supplied. In CI, `E2E_BASE_URL` can point at an already-running deployment.

## Existing feature/security checks

The project-specific regression checks are run by:

```bash
npm run test:static
```

This discovers the existing `scripts/test-*.mjs` checks without requiring a manually maintained list. It excludes only the test orchestrators themselves.
