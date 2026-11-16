export const MAX_API_BODY_BYTES = 2048;
export const MAX_FORM_BODY_BYTES = 8192;

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

/** Client IP as seen by Cloudflare. Falls back to a constant so local tests still get a bucket. */
export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

/** Reads the body as text, refusing anything larger than `maxBytes`. Returns null when too large. */
export async function readLimitedText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const bytes = await request.arrayBuffer();
  return bytes.byteLength > maxBytes ? null : new TextDecoder().decode(bytes);
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Checkin-Key, X-Checkin-Token, If-None-Match',
    'Access-Control-Expose-Headers': 'Content-Length, ETag, X-Backup-Size, X-Backup-Uploaded-At, X-Backup-Previous-Size, X-Backup-Previous-At, X-Created-At',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function withHeaders(response: Response, headers: Record<string, string>): Response {
  const copy = new Response(response.body, response);
  for (const [name, value] of Object.entries(headers)) copy.headers.set(name, value);
  return copy;
}
