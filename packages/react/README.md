# @jesusjbriceno/cad-viewer-react

React (18/19) component for the view-only CAD viewer: open **DXF** (built in) and
**DWG** (with the optional [GPL-3.0 plugin](../dwg/README.md)) drawings in the browser.

## Install

```bash
pnpm add @jesusjbriceno/cad-viewer-react @jesusjbriceno/cad-viewer-core
# optional, GPL-3.0:
pnpm add @jesusjbriceno/cad-viewer-dwg
```

## Usage

```tsx
import { CadViewer, useCadViewerRef } from "@jesusjbriceno/cad-viewer-react";
import { createDwgLoader } from "@jesusjbriceno/cad-viewer-dwg"; // optional

const loaders = [createDwgLoader({ wasmUrl: "/libredwg/" })];

export function Plan() {
  const viewer = useCadViewerRef();
  return (
    <div style={{ height: 600 }}>
      <CadViewer
        ref={viewer}
        src="/drawings/plan.dwg"
        theme="dark"
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

## License

MIT.
