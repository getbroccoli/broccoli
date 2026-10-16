/**
 * Replaces fetch with one that ends the current worker thread at once. A thrown error could be
 * caught and ignored by the caller; an ended worker gives no result, so a fetch is never missed.
 */
export function installFetchGuard(): void {
  globalThis.fetch = () => process.exit(1);
}
