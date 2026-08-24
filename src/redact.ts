/** Remove token-like strings from an external OAuth diagnostic. */
export function safeMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, '[redacted token]')
    .replace(/(\b(?:code|token|refresh_token|access_token)=)[^&\s]+/giu, '$1[redacted]')
    .replace(/(["'](?:access|access_token|refresh|refresh_token)["']\s*:\s*["'])[^"']+(["'])/giu, '$1[redacted]$2')
    .slice(0, 1000)
}
