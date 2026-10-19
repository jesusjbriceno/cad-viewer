# @cadscene/react

React (18/19) component for the view-only CAD viewer: open **DXF** (built in) and
**DWG** (with the optional [GPL-3.0 plugin](../dwg/README.md)) drawings in the browser.

## Install

```bash
pnpm add @cadscene/react @cadscene/core
# optional, GPL-3.0:
pnpm add @cadscene/dwg
```

## Usage

```tsx
import { CadViewer, useCadViewerRef } from "@cadscene/react";
import { createDwgLoader } from "@cadscene/dwg"; // optional

const loaders = [createDwgLoader({ wasmUrl: "/libredwg/" })];

export function Plan() {
  const viewer = useCadViewerRef();
  return (
    <div style={{ height: 600 }}>
      <CadViewer
        ref={viewer}
        src="/drawings/plan.dwg"
        theme="dark"
        locale="es-ES"
        loaders={loaders}
        hiddenLayers={["Furniture"]}
        onSelect={({ pick }) => console.log(pick)}
        onError={({ error }) => console.error(error)}
      />
      <button onClick={() => viewer.current?.zoomExtents()}>Fit</button>
    </div>
  );
}
```

The component fills its parent, so **give the parent a size**. Define `loaders` outside
the component (or memoize it): it is a creation-time option.

## Props

| Prop | Type | Reactive | Notes |
| --- | --- | --- | --- |
| `src` | `string \| URL \| File \| Blob \| ArrayBuffer \| Uint8Array \| null` | yes | Changing it loads the new drawing. |
| `fileName` | `string` | yes | Picks the format when `src` has no name (raw bytes). |
| `theme` | `"dark" \| "light"` | yes | |
| `locale` | `string` (default `"es-ES"`) | yes | Language of the viewer's own texts; `en` available, unsupported tags fall back to it. |
| `tool` | `"pan" \| "zoom-window" \| "measure"` | yes | |
| `layout` | `string` | yes | Controlled active layout, re-applied after each load. |
| `hiddenLayers` | `string[]` | yes | Compared by content; these layers are hidden and every other layer is shown. |
| `loaders` | `FormatLoader[]` | creation only | E.g. the DWG loader. |
| `background`, `fontFamily`, `zoomPadding`, `pixelRatio`, `fetch`, `requestInit` | | creation only | See `CadViewerOptions` in the core. |
| `interactive` | `boolean` (default `true`) | creation only | `false` disables pointer, wheel and keyboard input. |
| any `div` attribute | | yes | `className`, `style`, `id`, `aria-*`… are forwarded to the container. |

## Callbacks

`onLoadStart`, `onLoadProgress`, `onLoaded`, `onError`, `onViewChange`, `onLayersChange`,
`onLayoutChange`, `onToolChange`, `onHover`, `onSelect`, `onMeasure` — same payloads as the
core `CadViewer` events. The latest callback is always called; changing it does not
re-subscribe or recreate the viewer.

## Imperative API

The `ref` receives the core `CadViewerApi` (`null` before mount): zoom, layers, layouts,
picking and `exportImage()`.

## SSR (Next.js)

The viewer is created in an effect, so the component renders an empty container on the
server. In the App Router, use it from a `"use client"` component.

## 3D models (STL / OBJ)

Install the optional 3D peers, then import the separate subpath. The default 2D entry
does not import three.js.

```bash
pnpm add @cadscene/3d three
```

```tsx
import { Cad3DViewer, useCad3DViewerRef } from "@cadscene/react/3d";

export function Model() {
  const viewer = useCad3DViewerRef();
  return (
    <>
      <div style={{ height: 600 }}>
        <Cad3DViewer ref={viewer} src="/models/house.obj" edges hiddenLayers={["roof"]} />
      </div>
      <button onClick={() => viewer.current?.zoomExtents()}>Fit</button>
    </>
  );
}
```

Reactive props: `src`, `fileName`, `theme`, `locale`, `shading`
(`"shaded" | "wireframe"`), `edges`, `hiddenLayers` (compared by content and
re-applied after every load). Creation-only props: `loaders`, `background`,
`upAxis` (`"z"` default or `"y"`), `interactive`, `zoomPadding`, `pixelRatio`,
`fetch`, `requestInit`. Standard `div` attributes are forwarded.

Callbacks: `onLoadStart`, `onLoadProgress`, `onLoaded`, `onError`,
`onCameraChange`, `onLayersChange`; the latest callback is always used.
Payloads and the forwarded ref match [`Cad3DViewerApi`](../3d/README.md).
Mounting is SSR-safe and StrictMode-safe; the viewer is destroyed on unmount.
In the Next.js App Router use a `"use client"` component.

## License

MIT.
