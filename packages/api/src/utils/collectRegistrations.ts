/**
 * Merges what modules register under one kind, such as triggering events, frozen; a key that two
 * parts register stops startup, since the second would silently replace the first.
 */
export function collectRegistrations<T>(
  kind: string,
  parts: readonly Readonly<Record<string, T>>[],
): Readonly<Record<string, T>> {
  const collected: Record<string, T> = {};
  for (const part of parts) {
    for (const [key, registration] of Object.entries(part)) {
      if (Object.hasOwn(collected, key)) throw new Error(`${kind} ${key} is registered twice.`);
      collected[key] = registration;
    }
  }
  return Object.freeze(collected);
}
