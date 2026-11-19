// Object storage for cloud files, behind a small port so tests use memory and production uses iDrive e2 (any
// S3-compatible service). Requests are signed with AWS Signature V4 (aws4fetch, MIT). Keys are made by the
// Worker (files/<account>/<id>); bodies are ciphertext.
import { AwsClient } from 'aws4fetch';

export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  size: number;
}

export interface ObjectStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** null when the object does not exist. */
  get(key: string): Promise<StoredObject | null>;
  /** Succeeds when the object is already gone. */
  delete(key: string): Promise<void>;
}

export interface S3Settings {
  /** Host or URL, e.g. "s3.us-west-4.idrivee2.com". */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const OCTET = 'application/octet-stream';
/** Each call is bounded so a slow storage service cannot hold a Worker request open. */
const TIMEOUT_MS = 20_000;

export function objectUrl(settings: Pick<S3Settings, 'endpoint' | 'bucket'>, key: string): string {
  const host = settings.endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const path = key.split('/').map(encodeURIComponent).join('/');
  return `https://${host}/${encodeURIComponent(settings.bucket)}/${path}`;
}

/** S3 API client (path-style URLs, which iDrive e2 and every S3-compatible service accept). */
export class S3ObjectStore implements ObjectStore {
  private readonly client: AwsClient;
  private readonly fetchFn: typeof fetch;

  constructor(
    private readonly settings: S3Settings,
    fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.client = new AwsClient({
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
      region: settings.region,
      service: 's3',
      retries: 1,
    });
    this.fetchFn = fetchFn;
  }

  private async send(key: string, init: RequestInit): Promise<Response> {
    const signed = await this.client.sign(objectUrl(this.settings, key), init);
    return this.fetchFn(signed, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const res = await this.send(key, { method: 'PUT', body: bytes, headers: { 'Content-Type': OCTET } });
    if (!res.ok) throw new Error(`object store put ${res.status}`);
    await res.body?.cancel();
  }

  async get(key: string): Promise<StoredObject | null> {
    const res = await this.send(key, { method: 'GET' });
    if (res.status === 404) {
      await res.body?.cancel();
      return null;
    }
    if (!res.ok || res.body === null) throw new Error(`object store get ${res.status}`);
    return { body: res.body, size: Number(res.headers.get('Content-Length') ?? '0') };
  }

  async delete(key: string): Promise<void> {
    const res = await this.send(key, { method: 'DELETE' });
    await res.body?.cancel();
    if (!res.ok && res.status !== 404) throw new Error(`object store delete ${res.status}`);
  }
}

/** In-memory store for tests and for local development without a bucket. */
export class MemoryObjectStore implements ObjectStore {
  readonly objects = new Map<string, Uint8Array>();
  /** Set to make every call fail (tests of the storage-down path). */
  failing = false;

  private check(): void {
    if (this.failing) throw new Error('object store down');
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    this.check();
    this.objects.set(key, new Uint8Array(bytes));
  }

  async get(key: string): Promise<StoredObject | null> {
    this.check();
    const bytes = this.objects.get(key);
    if (bytes === undefined) return null;
    const copy = new Uint8Array(bytes);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(copy);
        controller.close();
      },
    });
    return { body, size: bytes.length };
  }

  async delete(key: string): Promise<void> {
    this.check();
    this.objects.delete(key);
  }
}
