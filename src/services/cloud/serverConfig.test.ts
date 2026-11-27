import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKER_URL, resolveWorkerUrl } from './serverConfig';

describe('resolveWorkerUrl', () => {
  it('falls back to the committed production server when the build sets nothing', () => {
    expect(resolveWorkerUrl(undefined)).toBe(DEFAULT_WORKER_URL);
    expect(resolveWorkerUrl('')).toBe(DEFAULT_WORKER_URL);
    expect(resolveWorkerUrl('  ')).toBe(DEFAULT_WORKER_URL);
  });

  it('ignores a non-https override', () => {
    expect(resolveWorkerUrl('http://example.com')).toBe(DEFAULT_WORKER_URL);
    expect(resolveWorkerUrl('coachly-api.example.workers.dev')).toBe(DEFAULT_WORKER_URL);
  });

  it('uses a proper https override without a trailing slash', () => {
    expect(resolveWorkerUrl('https://staging.example.workers.dev/')).toBe('https://staging.example.workers.dev');
  });

  it('points at an https Worker', () => {
    expect(DEFAULT_WORKER_URL).toMatch(/^https:\/\/[a-z0-9.-]+\.workers\.dev$/);
  });
});

describe('resolveWorkerUrl (local wrangler dev)', () => {
  it('accepts http only for localhost / 127.0.0.1', () => {
    expect(resolveWorkerUrl('http://localhost:8787')).toBe('http://localhost:8787');
    expect(resolveWorkerUrl('http://127.0.0.1:8787/')).toBe('http://127.0.0.1:8787');
    expect(resolveWorkerUrl('http://localhost.evil.example')).toBe(DEFAULT_WORKER_URL);
  });
});
