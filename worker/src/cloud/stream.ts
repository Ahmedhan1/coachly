// Streaming uploads: bodies go from the request straight into R2 without being buffered in the Worker
// (128 MB memory, and a 100 MB backup must not be copied in JavaScript).

export type BodyCheck =
  | { ok: true; length: number }
  | { ok: false; status: 400 | 411 | 413; error: 'length_required' | 'too_large' | 'empty' };

/** Uploads must declare Content-Length so R2 knows the size up front and the caps are checked before any byte is read. */
export function declaredLength(request: Request, maxBytes: number): BodyCheck {
  const header = request.headers.get('Content-Length');
  if (header === null || !/^\d{1,12}$/.test(header) || request.body === null) {
    return { ok: false, status: 411, error: 'length_required' };
  }
  const length = Number(header);
  if (length === 0) return { ok: false, status: 400, error: 'empty' };
  if (length > maxBytes) return { ok: false, status: 413, error: 'too_large' };
  return { ok: true, length };
}

export function hasMagic(bytes: Uint8Array, magic: string): boolean {
  if (bytes.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) if (bytes[i] !== magic.charCodeAt(i)) return false;
  return true;
}

/**
 * Reads just enough of `body` to check the 4-byte envelope magic, then returns a stream of exactly `length`
 * bytes for R2. The first chunk is written by hand; the rest is piped natively (no per-chunk JavaScript).
 * The returned stream errors if the body is shorter or longer than `length`, so R2 never stores a truncated
 * object. `done` settles when piping finishes (rejects on a short/long body).
 */
export async function checkedStream(
  body: ReadableStream<Uint8Array>,
  length: number,
  magic: string,
): Promise<{ ok: true; stream: ReadableStream<Uint8Array>; done: Promise<void> } | { ok: false }> {
  const reader = body.getReader();
  let head = new Uint8Array(0);
  while (head.length < magic.length) {
    const { done, value } = await reader.read();
    if (done) break;
    const next = new Uint8Array(head.length + value.length);
    next.set(head);
    next.set(value, head.length);
    head = next;
  }
  if (!hasMagic(head, magic) || head.length > length) {
    await reader.cancel().catch(() => undefined);
    return { ok: false };
  }
  reader.releaseLock();

  const fixed = new FixedLengthStream(length);
  const done = (async () => {
    const writer = fixed.writable.getWriter();
    await writer.write(head);
    writer.releaseLock();
    await body.pipeTo(fixed.writable);
  })();
  // Errors surface through the R2 put (the readable side errors too); avoid an unhandled rejection here.
  done.catch(() => undefined);
  return { ok: true, stream: fixed.readable, done };
}
