# gpx-viewer

[![CI](https://github.com/evrignaud/gpx-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/evrignaud/gpx-viewer/actions/workflows/ci.yml)

Load several GPX tracks at once, compare them, and read their elevation profile on
switchable map layers.

Try it here: <https://evrignaud.github.io/gpx-viewer/>

**Drag & drop GPX files onto the map, or press "Add GPX".**

## Features

- Load any number of GPX tracks at once, each drawn in its own colour.
- Elevation profile for every loaded track, overlaid from a common origin so the
  climbs line up and can be compared. Hovering the chart marks the matching point
  on the map.
- Per-track list with a checkbox to show or hide a track, a button to re-frame the
  map on it, and a button to remove it. Hiding a track also drops it from the
  elevation chart and from the totals.
- Summary panel with distance, moving time, pace and elevation gain/loss for the
  last loaded track, plus totals across every visible track.
- Switch between metric (km, m) and imperial (mi, ft). The choice is remembered.
- Seven keyless base layers, including OpenTopoMap and satellite imagery, plus
  waymarked hiking, cycling and MTB route overlays.
- Geolocation and fullscreen buttons.
- Works on a phone: file picker, collapsible panels, and controls sized for touch.

## URL parameters

| Parameter | Effect |
| --- | --- |
| `?gpx=<url>` | Load a GPX file from a URL. Repeat the parameter to load several, which makes a set of tracks shareable as one link. The remote server has to allow cross-origin reads (CORS). |
| `?debug` | Turn on debug logging. |
| `?visual-log` | Mirror console output into the page, for debugging on a device with no console. |
| `?hide-visual-log-on-success` | Remove that mirror once the app has started. |
| `?status-check-timeout=<ms>` | How long to wait before reporting that the app failed to start. Defaults to 50000. |

## Building & running it yourself

You need [Node.js](https://nodejs.org/) 20.19 or newer. The version in `.nvmrc` is
the one the project is developed against.

```shell
npm install
```

Start the dev server, which rebuilds and reloads on change:

```shell
npm run dev
```

The app is then at <http://localhost:9000>. To reach it from another device on the
network, for example to try it on a phone:

```shell
HOST=0.0.0.0 npm run dev
```

Build a production bundle into `dist/`:

```shell
npm run build
```

Serve that bundle locally to check it:

```shell
npm run preview
```

Lint:

```shell
npm run lint
npm run lint:fix
```

## Tests

```shell
npm test              # unit tests, jsdom, fast
npm run test:watch
npm run test:integration   # builds, then drives the bundle in Electron
npm run check         # lint + unit tests + build, what CI runs
```

The split matters. `test/*.test.js` covers the pure logic — duration and pace
formatting, unit conversion, and the `?gpx=` URL rules — under Vitest in jsdom.

`test/integration/` runs the real production bundle in a real browser engine,
serving `dist/` over http so the Content-Security-Policy behaves the way it does
in production. That is where this project's bugs actually were: bundling breaking
Leaflet's icon URLs, a plugin whose ESM build never registers its factory, panels
overlapping on a phone, unit conversion reaching the DOM. jsdom cannot see any of
it, because it has no layout engine and Leaflet needs one. The integration run
checks 74 things, including the two halves of issue #2 (no overlapping panels at
390x780, and an upload button of a usable size), and exits non-zero on failure.

`.github/workflows/ci.yml` runs `npm run check` on every push and pull request,
and the integration check as a second job. On a Linux runner that one needs
`xvfb-run`, because Electron wants an X display even for an offscreen window.

### Desktop app

```shell
npm run electron          # build, then open in Electron
npm run electron:package  # build, then package into electron-dist/
```

## How it is put together

The app is plain ES modules bundled by [Vite](https://vite.dev/); there is no
framework. Everything under `src/` is deliberately small and single-purpose:

| File | Responsibility |
| --- | --- |
| `main.js` | Wires everything together. |
| `leaflet-global.js`, `leaflet.js` | Leaflet plus plugin setup, in one place. |
| `map.js`, `layers.js` | Map creation, controls, tile providers. |
| `tracks.js` | Owns the loaded tracks, their statistics and the totals. |
| `elevation-profile.js` | The elevation chart, a Leaflet control drawn with d3. |
| `info-panel.js`, `track-list.js` | The two panels. |
| `units.js`, `format.js` | Unit conversion and number/duration formatting. |
| `remote-gpx.js` | `?gpx=` loading. |
| `drop-target.js`, `file-picker.js` | The two ways to get a file in. |
| `notice.js` | On-screen error messages. |

Two things worth knowing before changing the imports:

- `leaflet-gpx` has no module wrapper and `leaflet-providers` has a typo in its
  UMD wrapper (`typeof modules`), so both read a global `L`. `leaflet-global.js`
  sets it, and must be imported before them.
- The ESM builds of `leaflet.locatecontrol` and `leaflet.fullscreen` export their
  classes but do not register `L.control.locate` / `L.control.fullscreen`.
  `leaflet.js` attaches them.

`public/boot-diagnostics.js` is a classic script rather than a module: it has to
run before the bundle in order to report a bundle that never boots, so it sticks
to ES5 syntax.

The Lato font is bundled from `@fontsource/lato`, so map tiles are the only thing
the page fetches from a third party. That keeps the Content-Security-Policy in
`index.html` tight (`font-src 'self'`), and means the packaged desktop app renders
correctly with no network at all.

## Notes on the elevation chart

The chart in `src/elevation-profile.js` is written against d3 v7 rather than taken
from a plugin. The original `MrMufflon/Leaflet.Elevation` has been unmaintained
since 2016 and is pinned to d3 v3. Its maintained successor,
`@raruto/leaflet-elevation`, resolves d3 and togeojson from unpkg.com at runtime
and loads its own submodules relative to `import.meta.url`, neither of which
survives bundling; it is also GPL-3.0, which does not fit this repository.

## License

`UNLICENSED` — all rights reserved. If you want people to reuse the published app,
pick a license and put it here.
