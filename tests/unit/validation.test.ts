import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateProfileInput } from '@/lib/profile/validation';
import { validateSearchRequest } from '@/lib/search/validation';
import { validateSendMessageInput } from '@/lib/messages/validation';
import { sanitizeFilename } from '@/lib/attachments/validation';
import { checkRateLimit, resetRateLimitState } from '@/lib/auth/rate-limit';

describe('validation boundaries', () => {
  test('profile rejects unknown fields and normalizes username', () => {
    assert.deepEqual(validateProfileInput({ username: ' Alice_1 ' }), { ok: true, value: { username: 'alice_1' } });
    assert.equal(validateProfileInput({ username: 'ab' }).ok, false);
    assert.equal(validateProfileInput({ username: 'ok', role: 'admin' }).ok, false);
  });

  test('search rejects empty, invalid and oversized pagination', () => {
    assert.throws(() => validateSearchRequest(new URLSearchParams('type=messages&q=')), /EMPTY_QUERY/);
    assert.throws(() => validateSearchRequest(new URLSearchParams('type=wat&q=x')), /INVALID_TYPE/);
    assert.throws(() => validateSearchRequest(new URLSearchParams('type=messages&q=x&limit=51')), /INVALID_LIMIT/);
  });

  test('message validation keeps ciphertext opaque and rejects unsafe input', () => {
    const valid = validateSendMessageInput({
      conversationId: 'c_123456789012345678901234',
      clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
      ciphertext: 'YWJjZA==',
      encryptionVersion: 1,
    });
    assert.equal(valid.ok, true);
    if (!valid.ok) throw new Error('expected valid input');
    assert.equal(validateSendMessageInput({ ...valid.value, ciphertext: 'plaintext!' }).ok, false);
  });

  test('filenames are normalized and path separators removed', () => {
    assert.equal(sanitizeFilename('../secret.txt'), '.._secret.txt');
    assert.equal(sanitizeFilename('a\\b.txt'), 'a_b.txt');
  });

  test('rate limiter rejects after configured limit', () => {
    resetRateLimitState();
    for (let i = 0; i < 2; i++) assert.equal(checkRateLimit('unit', 2, 60_000).allowed, true);
    assert.equal(checkRateLimit('unit', 2, 60_000).allowed, false);
    resetRateLimitState();
  });
});
