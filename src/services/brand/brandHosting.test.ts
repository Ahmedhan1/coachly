import { describe, expect, it } from 'vitest';
import { HttpBrandHosting } from './brandHosting';

const ID = '0123456789abcdef01234567';
const set = {
  color: '#F25C1F',
  icon180: 'data:image/png;base64,AAAA',
  icon512: 'data:image/png;base64,BBBB',
  logo: 'data:image/png;base64,CCCC',
  startup: { url: 'data:image/png;base64,DDDD', width: 1170, height: 2532, ratio: 3 },
};

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
}

describe('HttpBrandHosting', () => {
  it('uploads the pictures without their data-URL prefix and returns the id', async () => {
    let sent: Record<string, unknown> = {};
    const h = new HttpBrandHosting('', fakeFetch((url, init) => {
      expect(url).toBe('/api/brand');
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ id: ID });
    }));
    expect(await h.upload(set)).toBe(ID);
    expect(sent).toMatchObject({ color: '#F25C1F', icon180: 'AAAA', icon512: 'BBBB', logo: 'CCCC', startup: { png: 'DDDD', width: 1170, height: 2532, ratio: 3 } });
  });

  it('is null when the server refuses, the network fails or the id is malformed', async () => {
    expect(await new HttpBrandHosting('', fakeFetch(() => new Response('no', { status: 429 }))).upload(set)).toBeNull();
    expect(await new HttpBrandHosting('', fakeFetch(() => { throw new TypeError('offline'); })).upload(set)).toBeNull();
    expect(await new HttpBrandHosting('', fakeFetch(() => Response.json({ id: '../x' }))).upload(set)).toBeNull();
  });

  it('never sends anything that is not a PNG data URL', async () => {
    let called = false;
    const h = new HttpBrandHosting('', fakeFetch(() => { called = true; return Response.json({ id: ID }); }));
    expect(await h.upload({ ...set, logo: 'data:image/jpeg;base64,xx' })).toBeNull();
    expect(called).toBe(false);
  });

  it('times out instead of hanging', async () => {
    const h = new HttpBrandHosting('', fakeFetch((_u, init) => new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('abort'))))), 10);
    expect(await h.upload(set)).toBeNull();
  });

  it('reads brand info and the logo', async () => {
    const h = new HttpBrandHosting('', fakeFetch((url) => {
      if (url.endsWith('/brand.json')) return Response.json({ id: ID, color: '#abcdef', startup: { width: 1, height: 2, ratio: 3 } });
      return new Response(new Blob(['x'], { type: 'image/png' }), { headers: { 'Content-Type': 'image/png' } });
    }));
    expect(await h.info(ID)).toEqual({ id: ID, color: '#ABCDEF', startup: { width: 1, height: 2, ratio: 3 } });
    expect((await h.logo(ID))?.type).toBe('image/png');
  });

  it('rejects ids that are not brand ids without calling the server', async () => {
    let called = false;
    const h = new HttpBrandHosting('', fakeFetch(() => { called = true; return Response.json({}); }));
    expect(await h.info('nope')).toBeNull();
    expect(await h.logo('../../etc')).toBeNull();
    expect(called).toBe(false);
  });
});
