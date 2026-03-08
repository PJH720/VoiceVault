/**
 * Lightweight assertion helpers for RPC input validation.
 * Throws descriptive errors that propagate as HTTP 500 responses via http-rpc.ts.
 *
 * Using TypeScript assertion signatures so call-sites get type narrowing:
 *   assertFiniteId(params.recordingId, 'recordingId')
 *   // TypeScript now knows params.recordingId is number ✓
 */

/** Asserts that `value` is a finite number (suitable for DB row IDs). */
export function assertFiniteId(value: unknown, label = 'id'): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${label}: expected a finite number, got ${typeof value}`)
  }
}

/** Asserts that `value` is a non-empty string after trimming. */
export function assertNonEmptyString(value: unknown, label = 'value'): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
}

/** Asserts that `value` is a string (may be empty). */
export function assertString(value: unknown, label = 'value'): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`)
  }
}

/** Asserts that `value` is a boolean. */
export function assertBoolean(value: unknown, label = 'value'): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean`)
  }
}
