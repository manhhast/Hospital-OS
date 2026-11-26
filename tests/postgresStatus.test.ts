import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDbStatusPayload } from '../src/utils/postgresStatus';

test('returns unconfigured only on 200 OK with configured: false', () => {
  const result = parseDbStatusPayload(true, 200, {
    configured: false,
    driver: 'none',
    connected: false
  });
  assert.deepEqual(result, { kind: 'unconfigured' });
});

test('returns http_error on 502/503 proxy errors even if payload is null or malformed', () => {
  const res502 = parseDbStatusPayload(false, 502, null);
  assert.equal(res502.kind, 'http_error');

  const resHtml = parseDbStatusPayload(true, 200, null);
  assert.equal(resHtml.kind, 'http_error');

  const resUnknown = parseDbStatusPayload(true, 200, { ok: true });
  assert.equal(resUnknown.kind, 'http_error');
});

test('parses configured and connected payload accurately', () => {
  const result = parseDbStatusPayload(true, 200, {
    configured: true,
    connected: true,
    bucketCount: 23,
    reportArchiveCount: 4,
    authenticated: true,
    sessionUser: { id: 'USR-ADMIN', name: 'Quản trị Hệ thống', role: 'Admin' }
  });
  assert.deepEqual(result, {
    kind: 'configured',
    connected: true,
    bucketCount: 23,
    reportArchiveCount: 4,
    authenticated: true,
    sessionUser: { id: 'USR-ADMIN', name: 'Quản trị Hệ thống', role: 'Admin' },
    errorMessage: null
  });
});
