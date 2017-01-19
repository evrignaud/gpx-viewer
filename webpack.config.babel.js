import { generateConfig, get, stripMetadata, EasyWebpackConfig } from '@easy-webpack/core'
import path from 'path'

import pkg from './package.json'
import envProd from '@easy-webpack/config-env-production'
import envDev from '@easy-webpack/config-env-development'
import aurelia from '@easy-webpack/config-aurelia'
import babel from '@easy-webpack/config-babel'
import html from '@easy-webpack/config-html'
import css from '@easy-webpack/config-css'
import fontAndImages from '@easy-webpack/config-fonts-and-images'
import globalBluebird from '@easy-webpack/config-global-bluebird'
import globalJquery from '@easy-webpack/config-global-jquery'
import globalRegenerator from '@easy-webpack/config-global-regenerator'
import generateIndexHtml from '@easy-webpack/config-generate-index-html'
import commonChunksOptimize from '@easy-webpack/config-common-chunks-simple'
import copyFiles from '@easy-webpack/config-copy-files'
import uglify from '@easy-webpack/config-uglify'
import generateCoverage from '@easy-webpack/config-test-coverage-istanbul'

process.env.BABEL_ENV = 'webpack'
const ENV = process.env.NODE_ENV && process.env.NODE_ENV.toLowerCase() || (process.env.NODE_ENV = 'development')

// basic configuration:
const title = 'GPX Viewer'
const baseUrl = '/'
const rootDir = path.resolve()
const srcDir = path.resolve('src')
const outDir = path.resolve('dist')

const coreBundles = {
  bootstrap: [
    'bluebird',

    // Polyfills
    'aurelia-polyfills',

    // Bootstraps
    'aurelia-bootstrapper-webpack',
    'aurelia-pal',
    'aurelia-pal-browser',
    'regenerator-runtime'
  ],
  // these will be included in the 'vendor' bundle (except for the above bootstrap packages)
  vendor: [
    'aurelia-binding',
    'aurelia-dependency-injection',
    'aurelia-event-aggregator',
    'aurelia-framework',
    'aurelia-history',
    'aurelia-history-browser',
    'aurelia-loader',
    'aurelia-loader-webpack',
    'aurelia-logging',
    'aurelia-logging-console',
    'aurelia-metadata',
    'aurelia-path',
    'aurelia-route-recognizer',
    'aurelia-router',
    'aurelia-task-queue',
    'aurelia-templating',
    'aurelia-templating-binding',
    'aurelia-templating-router',
    'aurelia-templating-resources',
    'randomcolor'
  ]
}

const appVersion = pkg.version

/**
 * Main Webpack Configuration
 */
let config = generateConfig(
  {
    entry: {
      'app': ['./src/main' /* this is filled by the aurelia-webpack-plugin */],
      'bootstrap': coreBundles.bootstrap,
      'vendor': coreBundles.vendor.filter(module => coreBundles.bootstrap.indexOf(module) === -1)
    },
    output: {
      path: outDir
    }
  },

  ENV === 'test' || ENV === 'development' ?
    envDev(ENV !== 'test' ? {} : {devtool: 'inline-source-map'}) :
    envProd({ /* devtool: '...' */ }),

  aurelia({root: rootDir, src: srcDir, title, baseUrl}),

  babel({ options: { /* uses settings from .babelrc */ } }),
  html(),
  css({ filename: 'styles.css', allChunks: true, sourceMap: false }),
  fontAndImages(),
  globalBluebird(),
  globalJquery(),
  globalRegenerator(),
  generateIndexHtml({minify: ENV === 'production'}),

  ...(ENV === 'production' || ENV === 'development' ? [
    commonChunksOptimize({appChunkName: 'app', firstChunk: 'bootstrap'}),
    copyFiles({patterns: [
      { from: 'favicon.ico', to: 'favicon.ico' },
      { from: 'images', to: 'libs/images' },
      { from: 'node_modules/d3/d3.js', to: 'libs/' },
      { from: 'node_modules/leaflet.layerscontrol-minimap/control.layers.minimap.css', to: 'libs/' },
      { from: 'node_modules/leaflet.layerscontrol-minimap/L.Control.Layers.Minimap.js', to: 'libs/' },
      { from: 'node_modules/leaflet/dist/leaflet.css', to: 'libs/' },
      { from: 'node_modules/leaflet/dist/leaflet-src.js', to: 'libs/leaflet.js' },
      { from: 'deps/leaflet.elevation.js', to: 'libs/' },
      { from: 'deps/leaflet.elevation.css', to: 'libs/' },
      { from: 'node_modules/leaflet-graphicscale/dist/Leaflet.GraphicScale.min.css', to: 'libs/' },
      { from: 'node_modules/leaflet-graphicscale/src/Leaflet.GraphicScale.js', to: 'libs/' },
      { from: 'deps/leaflet-gpx.js', to: 'libs/' },
      { from: 'node_modules/leaflet-providers/leaflet-providers.js', to: 'libs/' },
      { from: 'node_modules/normalize.css/normalize.css', to: 'libs/' }
    ]})
  ] : [
    /* ENV === 'test' */
    generateCoverage({ options: { 'force-sourcemap': true, esModules: true }})
  ]),

  ENV === 'production' ?
    uglify({debug: false, mangle: { except: ['cb', '__webpack_require__'] }}) : {}
)

// -------------------------------------------------------------

config.metadata.appVersion = appVersion

const features = [
  'requestAnimationFrame',
  'Element.prototype.classList',
  'URL'
]
config.metadata.polyfillDotIOUrl = 'https://cdn.polyfill.io/v2/polyfill.min.js?features=' + Array.prototype.slice.apply(features).join(',')

// -------------------------------------------------------------

module.exports = stripMetadata(config)
