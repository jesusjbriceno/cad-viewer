<script setup lang="ts">
import type { CadSource, CadTheme, CadViewerApi, CadViewerEvents, LayerInfo, LayoutInfo, MeasureResult, PickResult, ViewerTool } from "@jesusjbriceno/cad-viewer-vue";
import { CadViewer } from "@jesusjbriceno/cad-viewer-vue";
import { computed, ref } from "vue";
import { describeMeasure, describePick, downloadBlob, LOADERS, SAMPLES } from "../lib/shared";

const src = ref<CadSource | null>(SAMPLES[0]?.url ?? null);
const theme = ref<CadTheme>("dark");
const tool = ref<ViewerTool>("pan");
const layout = ref<string | undefined>(undefined);
const hiddenLayers = ref<string[]>([]);
const layers = ref<LayerInfo[]>([]);
const layouts = ref<LayoutInfo[]>([]);
const pick = ref<PickResult | null>(null);
const measured = ref<MeasureResult | null>(null);
const status = ref("Ready.");
const failed = ref(false);
const dragging = ref(false);
const component = ref<{ viewer: CadViewerApi | null } | null>(null);

const viewer = () => component.value?.viewer ?? null;
const tools: { id: ViewerTool; label: string }[] = [
  { id: "pan", label: "Pan / select" },
  { id: "zoom-window", label: "Zoom window" },
  { id: "measure", label: "Measure" },
];
const hidden = computed(() => new Set(hiddenLayers.value));

function openFile(file: File | undefined) {
  if (file) src.value = file;
}
function toggleLayer(name: string, visible: boolean) {
  hiddenLayers.value = visible ? hiddenLayers.value.filter((layer) => layer !== name) : [...hiddenLayers.value, name];
}
function onLoaded({ document, fileName }: CadViewerEvents["loaded"]) {
  failed.value = false;
  status.value = `${fileName ?? "Drawing"} · ${document.format.toUpperCase()} · ${document.layers.size} layers (rendered by <CadViewer> for Vue)`;
  layouts.value = viewer()?.getLayouts() ?? [];
}
function onError({ error }: CadViewerEvents["error"]) {
  failed.value = true;
  status.value = error.message;
}
async function exportPng() {
  const blob = await viewer()?.exportImage({ scale: 2 });
  if (blob) downloadBlob(blob, "drawing.png");
}
</script>

<template>
  <div class="app">
    <aside class="side">
      <section>
        <h2>Drawing</h2>
        <select aria-label="Sample drawings" @change="src = ($event.target as HTMLSelectElement).value">
          <option v-for="sample in SAMPLES" :key="sample.url" :value="sample.url">{{ sample.label }}</option>
        </select>
        <div class="row">
          <input type="file" accept=".dxf,.dwg" aria-label="Open a DXF or DWG file" @change="openFile(($event.target as HTMLInputElement).files?.[0])" />
        </div>
        <p class="drop-hint">…or drop a .dxf / .dwg file on the drawing.</p>
      </section>
      <section>
        <h2>Layout</h2>
        <select aria-label="Layout" :value="layouts.find((entry) => entry.active)?.name" @change="layout = ($event.target as HTMLSelectElement).value">
          <option v-for="entry in layouts" :key="entry.name" :value="entry.name">{{ entry.name }}</option>
        </select>
      </section>
      <section>
        <h2>Layers (controlled by <code>hidden-layers</code>)</h2>
        <ul class="layers">
          <li v-for="layer in layers" :key="layer.name">
            <label>
              <input type="checkbox" :checked="!hidden.has(layer.name)" @change="toggleLayer(layer.name, ($event.target as HTMLInputElement).checked)" />
              <span class="swatch" :style="{ background: layer.color }"></span>
              <span>{{ layer.name }}</span>
              <span class="count">{{ layer.entityCount }}</span>
            </label>
          </li>
        </ul>
        <div class="row">
          <button @click="hiddenLayers = []">Show all</button>
          <button @click="hiddenLayers = layers.map((layer) => layer.name)">Hide all</button>
        </div>
      </section>
      <section>
        <h2>Selection</h2>
        <pre class="info">{{ describePick(pick) }}</pre>
      </section>
      <section>
        <h2>Measure</h2>
        <pre class="info">{{ describeMeasure(measured) }}</pre>
      </section>
    </aside>
    <main class="stage">
      <div class="toolbar" role="toolbar" aria-label="Viewer tools">
        <button title="Zoom to extents (0)" @click="viewer()?.zoomExtents()">Fit</button>
        <button title="Zoom in (+)" @click="viewer()?.zoomIn()">+</button>
        <button title="Zoom out (−)" @click="viewer()?.zoomOut()">−</button>
        <button v-for="entry in tools" :key="entry.id" :aria-pressed="tool === entry.id" @click="tool = entry.id">{{ entry.label }}</button>
        <span class="spacer"></span>
        <button @click="theme = theme === 'dark' ? 'light' : 'dark'">Theme</button>
        <button @click="exportPng">Export PNG</button>
      </div>
      <div
        class="viewer-host"
        role="region"
        aria-label="Drawing (drop a DXF or DWG file here)"
        :class="{ dragging }"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="dragging = false; openFile($event.dataTransfer?.files[0])"
      >
        <CadViewer
          ref="component"
          :src="src"
          :theme="theme"
          :tool="tool"
          :layout="layout"
          :hidden-layers="hiddenLayers"
          :loaders="LOADERS"
          @load-start="status = 'Loading…'"
          @load-progress="status = `Loading… (${$event.phase})`"
          @loaded="onLoaded"
          @error="onError"
          @layers-change="layers = $event.layers"
          @layout-change="layouts = viewer()?.getLayouts() ?? []"
          @tool-change="tool = $event.tool"
          @select="pick = $event.pick"
          @measure="measured = $event"
        />
      </div>
      <div class="status" :class="{ error: failed }" role="status">{{ status }}</div>
    </main>
  </div>
</template>
