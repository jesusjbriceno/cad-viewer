# @jesusjbriceno/cad-viewer-vue

Vue 3 component for the view-only CAD viewer: open **DXF** (built in) and **DWG** (with
the optional [GPL-3.0 plugin](../dwg/README.md)) drawings in the browser.

## Install

```bash
pnpm add @jesusjbriceno/cad-viewer-vue @jesusjbriceno/cad-viewer-core
# optional, GPL-3.0:
pnpm add @jesusjbriceno/cad-viewer-dwg
```

## Usage

```vue
<script setup lang="ts">
import { ref } from "vue";
import { CadViewer, type CadViewerApi, type PickResult } from "@jesusjbriceno/cad-viewer-vue";
import { createDwgLoader } from "@jesusjbriceno/cad-viewer-dwg"; // optional

const loaders = [createDwgLoader({ wasmUrl: "/libredwg/" })];
const viewer = ref<{ viewer: CadViewerApi | null } | null>(null);
const picked = ref<PickResult | null>(null);
</script>

<template>
  <div style="height: 600px">
    <CadViewer
      ref="viewer"
      src="/drawings/plan.dwg"
      theme="dark"
      :loaders="loaders"
      :hidden-layers="['Furniture']"
      @select="picked = $event.pick"
      @error="console.error($event.error)"
    />
  </div>
  <button @click="viewer?.viewer?.zoomExtents()">Fit</button>
</template>
```

The component fills its parent, so **give the parent a size**. Register it globally with
`app.use(CadViewerPlugin)` if you prefer.

## Props

| Prop | Type | Reactive | Notes |
| --- | --- | --- | --- |
| `src` | `string \| URL \| File \| Blob \| ArrayBuffer \| Uint8Array \| null` | yes | Changing it loads the new drawing. |
| `file-name` | `string` | yes | Picks the format when `src` has no name (raw bytes). |
| `theme` | `"dark" \| "light"` | yes | |
| `tool` | `"pan" \| "zoom-window" \| "measure"` | yes | |
| `layout` | `string` | yes | Controlled active layout, re-applied after each load. |
| `hidden-layers` | `string[]` | yes | When set, these layers are hidden and every other layer is shown. |
| `loaders` | `FormatLoader[]` | creation only | E.g. the DWG loader. |
| `background`, `font-family`, `zoom-padding`, `pixel-ratio`, `fetch`, `request-init` | | creation only | See `CadViewerOptions` in the core. |
| `interactive` | `boolean` (default `true`) | creation only | `false` disables pointer, wheel and keyboard input. |

## Events

`load-start`, `load-progress`, `loaded`, `error`, `view-change`, `layers-change`,
`layout-change`, `tool-change`, `hover`, `select`, `measure` — same payloads as the core
`CadViewer` events.

## Imperative API

The component exposes `viewer` (the core `CadViewerApi`, `null` before mount): zoom,
layers, layouts, picking and `exportImage()`.

## SSR (Nuxt)

The viewer is created in `onMounted`, so the component is SSR-safe; it renders an empty
container on the server. Wrap it in `<ClientOnly>` if you want to skip the container too.

## License

MIT.
