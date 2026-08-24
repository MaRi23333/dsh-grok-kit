import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const lib = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib')
const out = join(lib, 'client.js')
const cjs = join(lib, 'client.cjs')

// Always repack from the tsdown CJS bundle produced by THIS build. Checking an
// already-wrapped lib/client.js and skipping would keep a stale client.js
// whenever tsdown stops cleaning it (the current clean phase masks this).
const source = readFileSync(cjs, 'utf8')
if (source.includes('window.__ModuleLoader__')) {
  // tsdown emitted the wrapper shape itself; keep it as-is.
  if (cjs !== out) writeFileSync(out, source)
  process.exit(0)
}

writeFileSync(out, `window.__ModuleLoader__.load({
	id: "dsh-grok-kit",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${source}
		return module.exports;
	}
});
`)
