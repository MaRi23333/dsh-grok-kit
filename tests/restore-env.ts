/** Restore `process.env[name]` without turning a missing key into `"undefined"`. */
export function restoreEnv(name: string, original: string | undefined): void {
  if (original === undefined) delete process.env[name]
  else process.env[name] = original
}
