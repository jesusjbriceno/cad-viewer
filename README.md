# cad-viewer

[![Built with Gentle-AI](https://raw.githubusercontent.com/Gentleman-Programming/gentle-ai/main/docs/assets/brand/built-with-gentle-ai.png)](https://github.com/Gentleman-Programming/gentle-ai)

A **view-only** 2D CAD viewer for the web, written in TypeScript. Open **DWG** and
**DXF** drawings in the browser — no server, no upload — and embed the viewer as a
**Vue** or **React** component, or use the framework-agnostic core directly.

> **Status:** early development (`0.x`). APIs may change between minor versions.

## Packages

| Package | What it is | License |
| --- | --- | --- |
| [`@jesusjbriceno/cad-viewer-core`](packages/core) | Engine: document model, DXF parser, Canvas2D renderer, `CadViewer` class | MIT |
| [`@jesusjbriceno/cad-viewer-dwg`](packages/dwg) | Optional DWG format plugin (LibreDWG compiled to WebAssembly) | **GPL-3.0** |
| [`@jesusjbriceno/cad-viewer-vue`](packages/vue) | `<CadViewer>` component for Vue 3 | MIT |
| [`@jesusjbriceno/cad-viewer-react`](packages/react) | `<CadViewer>` component for React 18/19 | MIT |

### Why is the DWG plugin GPL?

There is no permissively licensed DWG reader. The plugin links
[LibreDWG](https://www.gnu.org/software/libredwg/) through
[`@mlightcad/libredwg-web`](https://github.com/mlightcad/libredwg-web), both GPL-3.0.
It is a separate, opt-in package so the rest of the viewer stays MIT: if you only need
DXF, nothing GPL ends up in your bundle. If you install the DWG plugin, your
distribution must comply with the GPL-3.0.

## Capabilities

Viewing only — the viewer never modifies a drawing.

- DXF (ASCII) built in; DWG through the optional plugin
- Pan, zoom (wheel, pinch, buttons), zoom to extents, zoom to window
- Layers: list and toggle visibility
- Layouts: model space and paper space
- Dark and light backgrounds
- Entity hover and pick with properties (type, layer, handle)
- Distance measurement
- PNG snapshot export

## Development

Requirements: Node.js ≥ 20 and pnpm 10.

```bash
pnpm install
pnpm test        # Vitest across all packages
pnpm typecheck   # tsc per package
pnpm lint        # Biome
pnpm build       # library bundles + type declarations
pnpm dev         # playground (vanilla, Vue and React demos)
```

Architecture and design decisions: [docs/architecture.md](docs/architecture.md).

## Acknowledgements

Design informed by [mlightcad/cad-viewer](https://github.com/mlightcad/cad-viewer) (MIT).
DWG support by [LibreDWG](https://www.gnu.org/software/libredwg/) and
[libredwg-web](https://github.com/mlightcad/libredwg-web).

## License

MIT, except `packages/dwg`, which is GPL-3.0. See [LICENSE](LICENSE).
