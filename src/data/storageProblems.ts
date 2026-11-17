import type { DBCore, DBCoreMutateRequest, DBCoreMutateResponse, DBCoreTransaction, Middleware } from 'dexie';

/**
 * Problems the trainer must hear about, raised by the database itself rather than by one screen:
 * - `quota`: the phone's storage is full, a write did not land;
 * - `write_failed`: IndexedDB refused a write for another storage reason;
 * - `version_change`: a newer app version opened the database in another tab/window; this one must reload;
 * - `blocked`: this tab wants to upgrade but an older tab still holds the database open.
 */
export type StorageProblem = 'quota' | 'write_failed' | 'version_change' | 'blocked';
export type StorageProblemListener = (problem: StorageProblem) => void;

export class StorageProblems {
  private readonly listeners = new Set<StorageProblemListener>();

  subscribe(listener: StorageProblemListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(problem: StorageProblem): void {
    for (const listener of this.listeners) {
      try {
        listener(problem);
      } catch {
        // a listener must never break a database operation
      }
    }
  }
}

/** Errors that callers handle themselves (validation, duplicate keys, explicit aborts) are not storage problems. */
const HANDLED_BY_CALLER = new Set(['ConstraintError', 'DataError', 'AbortError', 'TransactionInactiveError', 'ZodError']);

function nameOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' ? name : null;
}

/** Looks through Dexie's wrappers (`inner`) for the IndexedDB error underneath. */
export function classifyStorageError(error: unknown): StorageProblem | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth++) {
    const name = nameOf(current);
    if (name === 'QuotaExceededError') return 'quota';
    const inner = (current as { inner?: unknown }).inner;
    if (!inner) return name && !HANDLED_BY_CALLER.has(name) && (current instanceof DOMException || name === 'UnknownError') ? 'write_failed' : null;
    current = inner;
  }
  return null;
}

function report(problems: StorageProblems, error: unknown): void {
  const kind = classifyStorageError(error);
  if (kind) problems.emit(kind);
}

/**
 * DBCore middleware: reports failed writes (rejected requests, per-row bulk failures and read-write
 * transactions that IndexedDB aborts at commit time, which is where Safari reports a full disk).
 * Errors still propagate to the caller unchanged.
 */
export function storageProblemMiddleware(problems: StorageProblems): Middleware<DBCore> {
  return {
    stack: 'dbcore',
    name: 'storage-problems',
    level: 1,
    create: (down) => ({
      ...down,
      transaction: (stores, mode, options) => {
        const tx: DBCoreTransaction = down.transaction(stores, mode, options);
        const target = tx as { addEventListener?: unknown; error?: unknown };
        if (mode === 'readwrite' && typeof target.addEventListener === 'function') {
          (tx as unknown as EventTarget).addEventListener('abort', () => {
            if (target.error) report(problems, target.error);
          });
        }
        return tx;
      },
      table: (name) => {
        const table = down.table(name);
        return {
          ...table,
          mutate: async (req: DBCoreMutateRequest): Promise<DBCoreMutateResponse> => {
            try {
              const res = await table.mutate(req);
              if (res.numFailures > 0) report(problems, Object.values(res.failures)[0]);
              return res;
            } catch (error) {
              report(problems, error);
              throw error;
            }
          },
        };
      },
    }),
  };
}
