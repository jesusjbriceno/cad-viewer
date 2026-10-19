# Next session — handoff

State at the end of the 0.3.0 cycle: the 3D feature is released, the samples feature is waiting
for review, and npm publication is the only thing blocked by someone else.

## Where things stand

| Item | State |
| --- | --- |
| 0.3.0 (3D: STL/OBJ, `Cad3DViewer`, Vue/React `/3d`) | Released: PR #4 merged as `4b9b6cb`, tag `v0.3.0`, GitHub release, CI green on `main` |
| Real CC0 sample assets (2D and 3D) | PR #5 open on `feat/samples` (`b11bf5e`, `2337ca7`), CI SUCCESS, MERGEABLE, **not merged** |
| npm publication | **Blocked**: `npm whoami` → E401 and publish PUT → E404 for `@jesusjbriceno` |
| Local dev server | Fixed: the sandbox binds IPv4 (`server.host`), see below |

## Pending decisions (owner: the human)

1. **Review and merge PR #5** (https://github.com/jesusjbriceno/cad-viewer/pull/5): four real CC0
   assets, `samples.json` manifest, `SOURCES.md`, `/credits/` page, `sandbox` test project (6 tests).
2. **npm credentials.** Publishing needs a token with rights on the `@jesusjbriceno` scope. The
   dry-run report is ready to compare against: core 118.3 kB / 65 files, 3d 38.5 kB / 25, dwg
   32.7 kB / 11, vue 10.8 kB / 15, react 10.7 kB / 15, all 0.3.0, public, tag `latest`.

## Proposed next iteration (not started, not authorized)

**`auto` wrapper**: one entry point that picks the right viewer instead of making the host decide.

- Detect with the registries' `canLoad` hooks (2D `FormatRegistry` and the 3D one), falling back
  to the file extension, and mount `CadViewer` or `Cad3DViewer` in the same container.
- Expose a shared subset only: `load`, `clear`, `zoomExtents`, layers, theme, locale, `formatError`,
  `exportImage`, `destroy`, plus a `kind: "2d" | "3d"` getter. The models stay separate.
- Open questions to settle before writing code: which package owns it (core would need an optional
  peer on `cad-viewer-3d`, or a thin new package), what happens when a format is ambiguous, and
  whether the wrappers (`/auto` subpath) are part of the first slice or a follow-up.

Explicitly still out of scope: STEP/IGES (LGPL kernel) and IFC (MPL kernel) as isolated packages,
3D measurement, section planes, face picking, parts tree, glTF and textures.

## Environment notes (this machine)

- **IPv6 loopback is blocked.** A server bound to `[::1]` accepts nothing (`EACCES`), while IPv4
  loopback works. Astro defaulted to `localhost`, which Node resolves to `::1` first, so `pnpm dev`
  started but nothing could connect; the browser showed a misleading `DNS_PROBE_FINISHED_NXDOMAIN`.
  Fixed in `examples/sandbox/astro.config.mjs` with `server.host = SANDBOX_HOST ?? "127.0.0.1"`.
  Open **http://127.0.0.1:4321** (or `localhost`, which now falls back to IPv4).
- **Astro keeps one dev server per project** (`examples/sandbox/.astro/dev.json`) and refuses a
  second one even on another port. Stop it with `astro dev stop`; killing the pnpm wrapper leaves
  an orphan that keeps the port and the stale `dev.json`, so the human's own `pnpm dev` fails with
  "Another astro dev server is already running". When an agent needs to hand over something
  clickable, serve the built site instead (`npx serve examples/sandbox/dist -l 4322`): no lock.
- `pnpm install` takes ~3 minutes here: run it in the background.
- Rewriting JSON from Python on Windows writes CRLF and breaks `pnpm lint`; `biome check --write`
  normalises it.
- Real-browser verification uses REA `capture_browser_scenario` with headless Edge. Driving a
  `<select>` with `select_option` can exceed its 60 s client timeout; a deep link is faster.

## Rules that stay

- Core MIT, zero runtime dependencies; copyleft stays in its own optional package.
- Samples: CC0 or CC BY only, attributed through the manifest and the credits page.
- Native RDD review and `gentle-ai sync` remained excluded by user decision.
