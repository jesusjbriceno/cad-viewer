# cad-viewer

[![Built with Gentle-AI](https://raw.githubusercontent.com/Gentleman-Programming/gentle-ai/main/docs/assets/brand/built-with-gentle-ai.png)](https://github.com/Gentleman-Programming/gentle-ai)

A **view-only** CAD viewer for the web, written in TypeScript. Open **DWG** and **DXF**
drawings plus **STL** and **OBJ** 3D models in the browser — no server, no upload — and
embed the viewer as a **Vue** or **React** component, or use the framework-agnostic packages
directly. 2D and 3D are separate packages: an app that only shows 2D drawings never loads
three.js.

> **Status:** early development (`0.x`). APIs may change between minor versions.

## Packages

| Package | What it is | License |
| --- | --- | --- |
| [`@jesusjbriceno/cad-viewer-core`](packages/core) | Engine: document model, DXF parser, Canvas2D renderer, `CadViewer` class | MIT |
| [`@jesusjbriceno/cad-viewer-dwg`](packages/dwg) | Optional DWG format plugin (LibreDWG compiled to WebAssembly) | **GPL-3.0** |
| [`@jesusjbriceno/cad-viewer-3d`](packages/3d) | 3D model viewer: STL/OBJ parsers and `Cad3DViewer` on three.js (peer dependency) | MIT |
| [`@jesusjbriceno/cad-viewer-vue`](packages/vue) | `<CadViewer>` component for Vue 3, and `<Cad3DViewer>` from `/3d` | MIT |
| [`@jesusjbriceno/cad-viewer-react`](packages/react) | `<CadViewer>` component for React 18/19, and `<Cad3DViewer>` from `/3d` | MIT |

### Why is the DWG plugin GPL?

There is no permissively licensed DWG reader. The plugin links
[LibreDWG](https://www.gnu.org/software/libredwg/) through
[`@mlightcad/libredwg-web`](https://github.com/mlightcad/libredwg-web), both GPL-3.0.
It is a separate, opt-in package so the rest of the viewer stays MIT: if you only need
DXF, nothing GPL ends up in your bundle. If you install the DWG plugin, your
distribution must comply with the GPL-3.0.

## Capabilities

Viewing only — the viewer never modifies a drawing or a model.

**2D drawings**

- DXF (ASCII) built in; DWG through the optional plugin
- Pan, zoom (wheel, pinch, buttons), zoom to extents, zoom to window
- Layers: list and toggle visibility
- Layouts: model space and paper space
- Dark and light backgrounds
- Entity hover and pick with properties (type, layer, handle)
- Distance measurement
- PNG snapshot export

**3D models** (`@jesusjbriceno/cad-viewer-3d`, three.js as a peer dependency)

- STL (binary and ASCII) and Wavefront OBJ built in, both parsed in-house
- Orbit, pan and zoom, fit with the current orientation, isometric framing on load
- Layers (OBJ groups) with visibility, and triangle counts per layer
- Shaded or wireframe, feature-edge overlay, dark and light backgrounds
- PNG snapshot export

## Languages

The viewer speaks **Spanish (Spain) by default**, with English as the fallback. One option
covers the viewer's own texts (canvas label, measure label, error messages):

```ts
new CadViewer(element, { locale: "en" });        // or "es-ES" (default), "es", "es-MX", "en-GB"
viewer.setLocale("en");                          // change it at runtime
viewer.formatError(error);                       // show any error in the current language
```

`locale` is also a prop of the Vue and React components, and `formatCadError(error, locale)`
is exported for code that runs without a viewer. Library errors carry a stable `code` (plus
`params`) and keep an English `message`, so you can branch on the code and display the text
in the user's language. See the [core README](packages/core/README.md#languages-and-errors).

## Quick start

**Vue 3**

```vue
<script setup lang="ts">
import { CadViewer } from "@jesusjbriceno/cad-viewer-vue";
</script>

<template>
  <div style="height: 600px">
    <CadViewer src="/drawings/plan.dxf" theme="dark" locale="es-ES" @select="console.log($event.pick)" />
  </div>
</template>
```

**React**

```tsx
import { CadViewer } from "@jesusjbriceno/cad-viewer-react";

export const Plan = () => (
  <div style={{ height: 600 }}>
    <CadViewer src="/drawings/plan.dxf" theme="dark" locale="es-ES" onSelect={({ pick }) => console.log(pick)} />
  </div>
);
```

**No framework**

```ts
import { CadViewer } from "@jesusjbriceno/cad-viewer-core";

const viewer = new CadViewer(document.querySelector("#viewer")!, { locale: "es-ES" });
await viewer.load("/drawings/plan.dxf");
```

**DWG** — add `loaders: [createDwgLoader({ wasmUrl: "/libredwg/" })]` (option or prop) from
`@jesusjbriceno/cad-viewer-dwg`, and serve `libredwg-web.wasm`. See the
[DWG plugin README](packages/dwg/README.md).

Per-package docs: [core](packages/core/README.md) · [Vue](packages/vue/README.md) ·
[React](packages/react/README.md) · [DWG](packages/dwg/README.md).

## Sandbox

A static [Astro](https://astro.build) site in [`examples/sandbox`](examples/sandbox) lets you
try the core, the Vue component and the React component side by side, with sample DXF/DWG
drawings or your own files (drag & drop, nothing is uploaded):

```bash
pnpm install
pnpm dev   # http://localhost:4321
```

## Development

Requirements: Node.js ≥ 20 and pnpm 10.

```bash
pnpm install
pnpm test        # Vitest across all packages
pnpm typecheck   # tsc per package
pnpm lint        # Biome
pnpm build       # library bundles + type declarations
pnpm dev         # Astro sandbox (vanilla, Vue and React pages)
pnpm sandbox:build
```

Architecture and design decisions: [docs/architecture.md](docs/architecture.md).

## Acknowledgements

Design informed by [mlightcad/cad-viewer](https://github.com/mlightcad/cad-viewer) (MIT).
DWG support by [LibreDWG](https://www.gnu.org/software/libredwg/) and
[libredwg-web](https://github.com/mlightcad/libredwg-web).

## License

MIT, except `packages/dwg`, which is GPL-3.0. See [LICENSE](LICENSE).
