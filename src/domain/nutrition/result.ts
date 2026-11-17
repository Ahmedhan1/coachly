/**
 * Typed result used across the domain layer instead of throwing or returning NaN.
 * `E` is a string-literal union of error codes the UI maps to Arabic messages.
 */
export type Result<T, E extends string = string> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<E extends string>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}
