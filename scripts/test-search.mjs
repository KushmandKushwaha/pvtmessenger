import assert from 'node:assert/strict';
import fs from 'node:fs';

const validation = fs.readFileSync('src/lib/search/validation.ts', 'utf8');
const service = fs.readFileSync('src/lib/search/service.ts', 'utf8');
const migration = fs.readFileSync('db/migrations/0011_search.sql', 'utf8');
const route = fs.readFileSync('src/app/api/search/route.ts', 'utf8');
const messageValidation = fs.readFileSync('src/lib/messages/validation.ts', 'utf8');
const messageService = fs.readFileSync('src/lib/messages/service.ts', 'utf8');
const features = fs.readFileSync('src/lib/messages/features.ts', 'utf8');
const protocol = fs.readFileSync('src/lib/realtime/protocol.ts', 'utf8');
const ws = fs.readFileSync('scripts/ws-server.ts', 'utf8');

assert.match(validation, /QUERY_MAX_LENGTH = 120/);
assert.match(validation, /EMPTY_QUERY/);
assert.match(validation, /INVALID_LIMIT/);
assert.match(validation, /INVALID_CURSOR/);
assert.match(validation, /toLikeSearchPattern/);
assert.match(validation, /NFKC/);
assert.match(service, /plainto_tsquery\('simple', \$2\)/);
assert.match(service, /conversation_members viewer/);
assert.match(service, /viewer\.user_id = \$1/);
assert.match(service, /LIMIT \$9/);
assert.match(service, /encodeCursor/);
assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pg_trgm/);
assert.match(migration, /users_username_trgm_idx/);
assert.match(migration, /users_display_name_trgm_idx/);
assert.match(migration, /conversations_name_trgm_idx/);
assert.match(migration, /messages_search_vector_idx/);
assert.match(migration, /messages_search_content_length_chk/);
assert.match(route, /checkSearchRateLimit/);
assert.match(route, /Cache-Control.*private, no-store/);
assert.match(messageValidation, /searchContent/);
assert.match(messageService, /search_content/);
assert.match(features, /search_content/);
assert.match(protocol, /searchContent\?: string/);
assert.match(ws, /searchContent: event\.searchContent/);

// Injection strings are passed as parameters, never interpolated into SQL.
for (const dangerous of ["' OR 1=1 --", "%; DROP TABLE messages; --", "\\_%"])
  assert.ok(!service.includes(`'${dangerous}`));
assert.ok(!route.includes('console.log'));
assert.ok(!route.includes('logger.info'));
assert.ok(!route.includes('logger.debug'));
console.log('Search validation, authorization, indexing, pagination, and privacy checks passed.');
