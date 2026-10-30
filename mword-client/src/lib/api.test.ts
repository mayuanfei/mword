import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('API responses', () => {
  it('rejects a successful HTML fallback instead of returning null as application data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><html><body>App shell</body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } })));
    await expect(api('/books')).rejects.toMatchObject({ status: 200, code: 'INVALID_RESPONSE' });
  });

  it('preserves a useful server error and code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'QUOTA_EXHAUSTED', message: '学习额度不足' }), { status: 409, headers: { 'Content-Type': 'application/json' } })));
    await expect(api('/ai/tasks', 'POST', {})).rejects.toMatchObject({ status: 409, code: 'QUOTA_EXHAUSTED', message: '学习额度不足' });
  });

  it('accepts an empty 204 logout response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await expect(api<void>('/auth/logout', 'POST')).resolves.toBeUndefined();
  });

  it('returns the actual JSON payload', async () => {
    const books = [{ id: 'cet4', name: '大学英语四级' }];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(books), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    expect(await api('/books')).toEqual(books);
  });
});
