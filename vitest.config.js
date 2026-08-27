import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'

const pkg = createRequire(import.meta.url)('./package.json')

export default defineConfig({
  // Mirrors the app build, so tests exercise the same value the app ships with
  // rather than the fallback in src/config.js.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  test: {
    // jsdom, because Units touches localStorage and the format helpers are used
    // from DOM code. The parts that need real layout and real tile rendering are
    // covered by the Electron integration check instead, since jsdom has no
    // layout engine and Leaflet depends on one.
    environment: 'jsdom',
    // Only the top level: test/integration holds an Electron script that has to
    // be launched by Electron, not by Vitest.
    include: ['test/*.test.js'],
    restoreMocks: true
  }
})
