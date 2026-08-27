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
  on the map. Not every GPX file carries elevation data; when none of the loaded
  tracks does, the panel says so rather than quietly disappearing. The "Elevation"
  button hides and shows it, and remembers the choice.
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
and the integration check as a second job. Two things that job needs on a Linux
runner, both of which have already caught us out once:

- `xvfb-run`, because Electron wants an X display even for a hidden window.
- `--no-sandbox`. Electron ships `chrome-sandbox`, its SUID sandbox helper, which
  has to be owned by root with mode 4755. Unpacked by `npm ci` as an ordinary
  user it is not, so Electron aborts during start-up rather than run
  unsandboxed:

  > The SUID sandbox helper binary was found, but is not configured correctly.
  > Rather than run without sandboxing I'm aborting now.

  It has to be a real command-line argument. Setting it with
  `app.commandLine.appendSwitch` from inside the main script does not work,
  because Chromium sets the sandbox up before Electron evaluates that script.
  It therefore lives in the `test:integration:run` npm script, which both a
  local run and the workflow go through, so the two cannot drift apart.

  The alternative is `chown root` plus `chmod 4755` on `chrome-sandbox`, which
  keeps the sandbox but needs `sudo` in CI. Not worth it for a harness that only
  ever loads this project's own build from localhost.

## Releasing

A release is triggered by **pushing a tag**. Tags are bare versions with no `v`
prefix, matching the existing `0.1.0`.

Either let the script do it:

```shell
npm run release:dry-run        # rehearse: checks and build, changes nothing
npm run release                # release the version in package.json
npm run release -- 0.3.0       # set that version, then release it
npm run release -- minor       # bump, then release
```

or do it by hand, which triggers exactly the same pipeline:

```shell
git tag -a 0.3.0 -m 'gpx-viewer 0.3.0'
git push origin master 0.3.0
```

### What runs on the tag

`.github/workflows/release.yml` fires on any tag shaped like `0.3.0`, and can
also be re-run from the Actions tab against an existing tag, so a failed release
does not need the tag deleted and re-pushed. It:

1. runs the whole CI workflow, by calling `ci.yml` rather than repeating its
   steps, so a release cannot publish something that would have failed the normal
   checks;
2. takes the version from the tag, updating `package.json` before building so the
   app reports the version it was tagged as;
3. builds, and publishes `dist/` to `gh-pages`;
4. creates a GitHub release for the tag with generated notes and the build
   attached as a tarball;
5. commits the version back to the default branch, so `package.json` stops
   disagreeing with the tags.

**The tag is the source of truth for the version.** Tagging `1.0.0` while
`package.json` says `0.2.0` is fine: the pipeline releases `1.0.0` and pushes a
`Move to 1.0.0` commit to `master`. The one thing it will not do is move the
version *backwards*: if the tag is older than what is on the branch, the branch
is left alone, because that is almost always a mistyped tag rather than an
intentional rewind.

A `concurrency` group stops two releases publishing `gh-pages` at once. The
version sync runs after publishing, so a failure there cannot stop a release that
has already gone out.

> A workflow triggered by a tag runs the workflow file **as it exists on that
> tag**. If you change `release.yml`, an existing tag will still run the old
> version of it, so the tag has to be recreated on a commit that contains the
> change.

### What the script does

`scripts/release.js` refuses to start unless the working tree is clean and the
branch is not behind the remote, optionally bumps the version and commits it,
lints, tests and builds, tags the release, publishes `dist/` to `gh-pages`, and
pushes branch, tag and `gh-pages` in one atomic push.

It publishes as well as the workflow, which is deliberate and safe: publishing is
idempotent, so whichever runs second sees the branch already holds that exact tree
and adds no commit. Pass `--skip-pages` to leave publishing entirely to the
workflow.

Both paths build the `gh-pages` commit through `scripts/lib/pages.js`, so
publishing from a workstation and publishing from a runner cannot drift apart.

Worth knowing about how it publishes:

- The `gh-pages` commit is built with git plumbing against a throwaway index, so
  your working tree, your index and your current branch are never touched. That
  also sidesteps `dist/` being listed in `.gitignore`.
- Its tree is built from `dist/` alone, so files from an earlier release
  disappear rather than lingering.
- It is parented on the current `origin/gh-pages`, so publishing is an ordinary
  fast-forward. Nothing is ever force-pushed.
- The commit message records the source commit, branch, tag and build time, so a
  published site can always be traced back to the code that produced it.
- The build is rejected if `index.html` came out with root-absolute asset URLs,
  which would 404 under the `/gpx-viewer/` sub-path while still working locally.
- Branch, tag and `gh-pages` are pushed in one `--atomic` push, so a half-released
  state is not possible.

It shows a summary and asks before pushing anything. Pass `--yes` to skip the
prompt, or `--help` for the rest of the options.

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
