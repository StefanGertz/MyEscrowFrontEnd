export const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function resolveSessionExpiresAt(expiresAt?: string, now = Date.now()): string {
  if (expiresAt) {
    const timestamp = Date.parse(expiresAt);
    if (Number.isFinite(timestamp)) {
      return new Date(timestamp).toISOString();
    }
  }

  return new Date(now + DEFAULT_SESSION_TTL_MS).toISOString();
}

export function isSessionExpired(expiresAt: string, now = Date.now()): boolean {
  const timestamp = Date.parse(expiresAt);
  return !Number.isFinite(timestamp) || timestamp <= now;
}
