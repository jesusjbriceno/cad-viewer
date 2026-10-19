<script setup lang="ts">
import { formatCadError } from "@cadscene/core";
import type { CadLocale, CadSource, CadTheme, CadViewerApi, CadViewerEvents, LayerInfo, LayoutInfo, MeasureResult, PickResult, ViewerTool } from "@cadscene/vue";
import { CadViewer } from "@cadscene/vue";
import { computed, onBeforeUnmount, ref } from "vue";
import { currentLocale, messages, onLocaleChange, type SandboxMessages } from "../lib/i18n";
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
const locale = ref<CadLocale>(currentLocale());
const t = computed(() => messages(locale.value));
// Status kept as a function of the texts so a language change redraws it.
const statusText = ref<(t: SandboxMessages) => string>((t) => t.ready);
const status = computed(() => statusText.value(t.value));
const failed = ref(false);
const dragging = ref(false);
const component = ref<{ viewer: CadViewerApi | null } | null>(null);

const viewer = () => component.value?.viewer ?? null;
const tools: ViewerTool[] = ["pan", "zoom-window", "measure"];
const hidden = computed(() => new Set(hiddenLayers.value));
onBeforeUnmount(onLocaleChange((next) => (locale.value = next)));

function setStatus(text: (t: SandboxMessages) => string, error = false) {
  statusText.value = text;
  failed.value = error;
}

function openFile(file: File | undefined) {
  if (file) src.value = file;
}
function toggleLayer(name: string, visible: boolean) {
  hiddenLayers.value = visible ? hiddenLayers.value.filter((layer) => layer !== name) : [...hiddenLayers.value, name];
}
function onLoaded({ document, fileName }: CadViewerEvents["loaded"]) {
  setStatus((t) =>
    t.loadedBy({ name: fileName ?? t.drawingFallback, format: document.format.toUpperCase(), layers: document.layers.size, component: "Vue" }),
  );
  layouts.value = viewer()?.getLayouts() ?? [];
}
function onError({ error }: CadViewerEvents["error"]) {
  // Library errors are translated from their stable code; the English message stays for logs.
  setStatus(() => formatCadError(error, locale.value), true);
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
        <h2>{{ t.drawing }}</h2>
        <select :aria-label="t.samples.label" @change="src = ($event.target as HTMLSelectElement).value">
          <option v-for="sample in SAMPLES" :key="sample.url" :value="sample.url">{{ t.samples[sample.key] }}</option>
        </select>
        <div class="row">
          <input type="file" accept=".dxf,.dwg" :aria-label="t.openFile" @change="openFile(($event.target as HTMLInputElement).files?.[0])" />
        </div>
        <p class="drop-hint">{{ t.dropHint }}</p>
      </section>
      <section>
        <h2>{{ t.layout }}</h2>
        <select :aria-label="t.layout" :value="layouts.find((entry) => entry.active)?.name" @change="layout = ($event.target as HTMLSelectElement).value">
          <option v-for="entry in layouts" :key="entry.name" :value="entry.name">{{ entry.name }}</option>
        </select>
      </section>
      <section>
        <h2>{{ t.controlledLayers("hidden-layers") }}</h2>
        <ul class="layers">
          <li v-for="layer in layers" :key="layer.name">
            <label>
              <input type="checkbox" :checked="!hidden.has(layer.name)" @change="toggleLayer(layer.name, ($event.target as HTMLInputElement).checked)" />
              <span class="swatch" :style="{ background: layer.color }"></span>
              <span>{{ layer.frozen ? `${layer.name} (${t.frozen})` : layer.name }}</span>
              <span class="count">{{ layer.entityCount }}</span>
            </label>
          </li>
        </ul>
        <div class="row">
          <button @click="hiddenLayers = []">{{ t.showAll }}</button>
          <button @click="hiddenLayers = layers.map((layer) => layer.name)">{{ t.hideAll }}</button>
        </div>
      </section>
      <section>
        <h2>{{ t.selection }}</h2>
        <pre class="info">{{ describePick(pick, locale) }}</pre>
      </section>
      <section>
        <h2>{{ t.measure }}</h2>
        <pre class="info">{{ describeMeasure(measured, locale) }}</pre>
      </section>
    </aside>
    <main class="stage">
      <div class="toolbar" role="toolbar" :aria-label="t.toolbar">
        <button :title="t.fitTitle" @click="viewer()?.zoomExtents()">{{ t.fit }}</button>
        <button :title="t.zoomInTitle" @click="viewer()?.zoomIn()">+</button>
        <button :title="t.zoomOutTitle" @click="viewer()?.zoomOut()">−</button>
        <button v-for="entry in tools" :key="entry" :aria-pressed="tool === entry" @click="tool = entry">{{ t.tools[entry] }}</button>
        <span class="spacer"></span>
        <button @click="theme = theme === 'dark' ? 'light' : 'dark'">{{ t.theme }}</button>
        <button @click="exportPng">{{ t.exportPng }}</button>
      </div>
      <div
        class="viewer-host"
        role="region"
        :aria-label="t.dropRegion"
        :class="{ dragging }"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="dragging = false; openFile($event.dataTransfer?.files[0])"
      >
        <CadViewer
          ref="component"
          :src="src"
          :theme="theme"
          :locale="locale"
          :tool="tool"
          :layout="layout"
          :hidden-layers="hiddenLayers"
          :loaders="LOADERS"
          @load-start="setStatus((t) => t.loading)"
          @load-progress="(event) => setStatus((t) => t.loadingPhase(event.phase))"
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
