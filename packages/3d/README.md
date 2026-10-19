# @cadscene/3d

View-only **3D** model viewer for the cad-viewer family. Opens **STL** (binary and ASCII)
and **Wavefront OBJ** files in the browser and renders them with
[three.js](https://threejs.org) (MIT). Nothing is uploaded and the model is never
modified: layers, shading and camera are viewer state only.

## Install

```bash
pnpm add @cadscene/3d three
```

`three` is a **peer dependency** (`>=0.170.0 <1.0.0`): your app provides it, the package
never bundles its own copy, and the 2D packages do not depend on it.

## Usage

```ts
import { Cad3DViewer } from "@cadscene/3d";

const viewer = new Cad3DViewer(document.querySelector("#viewer")!, { theme: "dark" });
viewer.on("loaded", ({ scene }) => console.log(scene.meshes.length, "parts"));
await viewer.load("/models/bracket.stl"); // URL, File/Blob, ArrayBuffer or Uint8Array
```

The viewer fills its container (give it a size) and follows its size changes. Drag to
orbit, right-drag (or Shift-drag) to pan, wheel or pinch to zoom.

Vue and React components live in the component packages, behind a `/3d` subpath, so
2D-only apps never import three.js:

```ts
import { Cad3DViewer } from "@cadscene/vue/3d";
import { Cad3DViewer } from "@cadscene/react/3d";
```

## Capabilities (0.3.0)

| Area | What you get |
| --- | --- |
| Formats | STL binary/ASCII (several `solid` blocks become several parts), OBJ (`v`, `vn`, `f` with every corner syntax and negative indices, `o`/`g`/`usemtl`) |
| Camera | Orbit around a target, isometric framing on load, `zoomExtents()` keeping the orientation, `getCamera()`/`setCamera()` with azimuth, elevation, distance and target; Z-up by default, Y-up with `upAxis: "y"` |
| Layers | `getLayers()` with mesh and triangle counts, `setLayerVisible()`, `setAllLayersVisible()` (OBJ groups are layers; STL uses layer `0`) |
| Display | `shaded` or `wireframe`, feature-edge overlay on/off, `dark`/`light` backgrounds |
| Output | `exportImage({ scale })` → PNG `Blob` of the current view |
| Languages | Canvas label and `formatError()` in Spanish (Spain) by default, English fallback (`locale`) |

Not in 0.3.0: 3D measurement, section planes, face picking and a parts tree. OBJ `.mtl`
files are not resolved: each `usemtl` name gets a distinct color from
`OBJ_MATERIAL_PALETTE`, and `mtllib` is counted in `scene.unsupported`.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `loaders` | `[]` | Extra `FormatLoader<CadScene>`s (STL and OBJ are built in). |
| `locale` | `"es-ES"` | Language of the viewer's own texts; any other language falls back to `en`. |
| `theme` | `"dark"` | `"dark"` or `"light"`. |
| `background` | theme | CSS color overriding the theme background. |
| `shading` | `"shaded"` | `"shaded"` or `"wireframe"`. |
| `edges` | `true` | Feature-edge overlay in shaded mode. |
| `upAxis` | `"z"` | `"z"` (CAD) or `"y"` (many mesh exports). Creation only. |
| `interactive` | `true` | `false` disables orbit, pan and zoom input. |
| `zoomPadding` | `0.05` | Margin on zoom-to-extents, as a fraction of the view. |
| `pixelRatio` | `devicePixelRatio` | Backing-store resolution. |
| `fetch`, `requestInit` | global `fetch` | Used for URL sources (e.g. auth headers). |

## Events

`load-start`, `load-progress`, `loaded` (`{ scene, fileName? }`), `error`, `camera-change`
(the orbit state), `layers-change`. `on()` returns an unsubscribe function. A newer
`load()` aborts an older one; aborted loads reject with a `CadLoadError` whose `code` is
`"aborted"` and emit no `error` event.

## Errors

Every library error is a `CadViewerError` with a stable `code` and `params` and an English
`message` for logs. Show it in the user's language with `viewer.formatError(error)` (or
`formatCadError(error, locale)` from the core). 3D codes: `stl-truncated`,
`stl-invalid-number`, `obj-invalid-number`, `obj-invalid-index`, `webgl-unavailable`
(thrown by the constructor when the browser cannot create a WebGL context; no canvas is
left behind).

## Writing a 3D format plugin

```ts
import { createEmptyScene, sceneBounds, type CadScene, type FormatLoader } from "@cadscene/core";

export const plyLoader: FormatLoader<CadScene> = {
  id: "ply",
  extensions: [".ply"],
  canLoad: ({ bytes }) => new TextDecoder().decode(bytes.subarray(0, 3)) === "ply",
  load: async (bytes) => {
    const scene = createEmptyScene("ply");
    /* push CadMesh parts, register their layers */
    scene.bounds = sceneBounds(scene.meshes);
    return scene;
  },
};

new Cad3DViewer(element, { loaders: [plyLoader] });
```

The neutral model (`CadScene`, `CadMesh`, `CadMaterial`, `Bounds3`) is documented in the
core, in [`src/scene/types.ts`](../core/src/scene/types.ts).

## License

MIT.
