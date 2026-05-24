export const PAGINATION_MIN = 1;
export const PAGINATION_MAX = 50;
export const PAGINATION_DEFAULT = 50;

/**
 * @param {unknown} value
 * @param {number} [defaultLimit=PAGINATION_DEFAULT]
 */
export function clampLimit(value, defaultLimit = PAGINATION_DEFAULT) {
  const n = Number(value);
  if (!Number.isFinite(n)) return defaultLimit;
  return Math.min(PAGINATION_MAX, Math.max(PAGINATION_MIN, Math.round(n)));
}

/** @param {unknown} value */
export function clampOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

/**
 * @param {unknown} limit
 * @param {unknown} offset
 * @param {number} [defaultLimit=PAGINATION_DEFAULT]
 */
export function clampPagination(limit, offset, defaultLimit = PAGINATION_DEFAULT) {
  return {
    safeLimit: clampLimit(limit, defaultLimit),
    safeOffset: clampOffset(offset),
  };
}
