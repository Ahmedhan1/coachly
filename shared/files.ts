// Cloud files (photos, thumbnails, invoices, PDFs) — contract shared by the app and the Worker.
//
// Every file is encrypted on the device before upload, as a PTK1 envelope (shared/envelope.ts sealWithKey):
// - by the trainer's app with the trainer's files key (kept on the iPhone and inside the encrypted backup);
// - by the client's browser with the client page's link key (only the trainer's app holds it too).
// The storage service (iDrive e2, behind the Worker) and the Worker only ever see ciphertext, sizes and random ids.

/** What a file is for. Stored as plain text on the server; it names a category, never a person. */
export const FILE_KINDS = ['client_photo', 'trainer_photo', 'thumbnail', 'invoice', 'pdf', 'client_upload'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

/** Kinds a client may upload from the client page (their own profile picture, or a file for the trainer). */
export const CLIENT_UPLOAD_KINDS = ['client_photo', 'client_upload'] as const satisfies readonly FileKind[];
export type ClientUploadKind = (typeof CLIENT_UPLOAD_KINDS)[number];

export type FileSource = 'trainer' | 'client';

/** Envelope magic every upload must start with (sealWithKey). */
export const FILE_MAGIC = 'PTK1';

/** Largest single file (after encryption). A 50-exercise PDF is ~2-5 MB; photos are downscaled to ~1200 px. */
export const FILE_MAX_BYTES = 25 * 1024 * 1024;

/**
 * `ref` ties a file to something in the trainer's app (a client id, a payment id, a PDF id). It is an opaque
 * random id made by the app, never a name. Optional.
 */
export const FILE_REF = /^[A-Za-z0-9_-]{1,64}$/;
/** Server-made file ids (random, base64url). */
export const FILE_ID = /^[A-Za-z0-9_-]{16,64}$/;

export interface CloudFileInfo {
  id: string;
  kind: FileKind;
  ref: string | null;
  source: FileSource;
  /** Set for files a client uploaded from a client page. */
  shareId: string | null;
  size: number;
  /** Unix seconds. */
  createdAt: number;
  updatedAt: number;
}

export function isFileKind(value: unknown): value is FileKind {
  return typeof value === 'string' && (FILE_KINDS as readonly string[]).includes(value);
}

export function isClientUploadKind(value: unknown): value is ClientUploadKind {
  return typeof value === 'string' && (CLIENT_UPLOAD_KINDS as readonly string[]).includes(value);
}
