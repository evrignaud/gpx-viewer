import { createRequire } from 'node:module'
import { defineConfig } from 'vite'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')

const port = Number(process.env.PORT) || 9000

// `base: './'` keeps every generated asset URL relative, which is what makes a
// single build work in all three deployment targets at once:
//   - GitHub Pages, where the app is served from the /gpx-viewer/ sub-path,
//   - `vite preview` at the server root,
//   - Electron, where index.html is opened over the file:// protocol.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    // Never inline font files. Base64 in the stylesheet has to be parsed before
    // the first paint and defeats the unicode-range subsetting, which only pays
    // off when each subset is a separate request the browser can skip.
    assetsInlineLimit: (filePath) => (/\.(woff2?|ttf|otf|eot)$/i.test(filePath) ? false : undefined)
  },
  server: {
    // HOST=0.0.0.0 exposes the dev server on the LAN, replacing the old
    // WEBPACK_HOST variable.
    host: process.env.HOST || 'localhost',
    port
  },
  preview: {
    port
  }
})
