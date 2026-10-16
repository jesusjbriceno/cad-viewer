import {
  CadViewer,
  type CadSource,
  type CadTheme,
  type LayerInfo,
  type LayoutInfo,
  type MeasureResult,
  type PickResult,
  useCadViewerRef,
  type ViewerTool,
} from "@jesusjbriceno/cad-viewer-react";
import { useMemo, useState } from "react";
import { describeMeasure, describePick, downloadBlob, LOADERS, SAMPLES } from "../lib/shared";

const TOOLS: { id: ViewerTool; label: string }[] = [
  { id: "pan", label: "Pan / select" },
  { id: "zoom-window", label: "Zoom window" },
  { id: "measure", label: "Measure" },
];

export default function ReactDemo() {
  const viewer = useCadViewerRef();
  const [src, setSrc] = useState<CadSource | null>(SAMPLES[0]?.url ?? null);
  const [theme, setTheme] = useState<CadTheme>("dark");
  const [tool, setTool] = useState<ViewerTool>("pan");
  const [layout, setLayout] = useState<string | undefined>(undefined);
  const [hiddenLayers, setHiddenLayers] = useState<string[]>([]);
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [layouts, setLayouts] = useState<LayoutInfo[]>([]);
  const [pick, setPick] = useState<PickResult | null>(null);
  const [measured, setMeasured] = useState<MeasureResult | null>(null);
  const [status, setStatus] = useState({ text: "Ready.", error: false });
  const [dragging, setDragging] = useState(false);
  const hidden = useMemo(() => new Set(hiddenLayers), [hiddenLayers]);

  const toggleLayer = (name: string, visible: boolean) =>
    setHiddenLayers((current) => (visible ? current.filter((layer) => layer !== name) : [...current, name]));
  const exportPng = async () => {
    const blob = await viewer.current?.exportImage({ scale: 2 });
    if (blob) downloadBlob(blob, "drawing.png");
  };

  return (
    <div className="app">
      <aside className="side">
        <section>
          <h2>Drawing</h2>
          <select aria-label="Sample drawings" onChange={(event) => setSrc(event.target.value)}>
            {SAMPLES.map((sample) => (
              <option key={sample.url} value={sample.url}>
                {sample.label}
              </option>
            ))}
          </select>
          <div className="row">
            <input
              type="file"
              accept=".dxf,.dwg"
              aria-label="Open a DXF or DWG file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setSrc(file);
              }}
            />
          </div>
          <p className="drop-hint">…or drop a .dxf / .dwg file on the drawing.</p>
        </section>
        <section>
          <h2>Layout</h2>
          <select aria-label="Layout" value={layouts.find((entry) => entry.active)?.name ?? ""} onChange={(event) => setLayout(event.target.value)}>
            {layouts.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.name}
              </option>
            ))}
          </select>
        </section>
        <section>
          <h2>
            Layers (controlled by <code>hiddenLayers</code>)
          </h2>
          <ul className="layers">
            {layers.map((layer) => (
              <li key={layer.name}>
                <label>
                  <input type="checkbox" checked={!hidden.has(layer.name)} onChange={(event) => toggleLayer(layer.name, event.target.checked)} />
                  <span className="swatch" style={{ background: layer.color }} />
                  <span>{layer.name}</span>
                  <span className="count">{layer.entityCount}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="row">
            <button type="button" onClick={() => setHiddenLayers([])}>
              Show all
            </button>
            <button type="button" onClick={() => setHiddenLayers(layers.map((layer) => layer.name))}>
              Hide all
            </button>
          </div>
        </section>
        <section>
          <h2>Selection</h2>
          <pre className="info">{describePick(pick)}</pre>
        </section>
        <section>
          <h2>Measure</h2>
          <pre className="info">{describeMeasure(measured)}</pre>
        </section>
      </aside>
      <main className="stage">
        <div className="toolbar" role="toolbar" aria-label="Viewer tools">
          <button type="button" title="Zoom to extents (0)" onClick={() => viewer.current?.zoomExtents()}>
            Fit
          </button>
          <button type="button" title="Zoom in (+)" onClick={() => viewer.current?.zoomIn()}>
            +
          </button>
          <button type="button" title="Zoom out (−)" onClick={() => viewer.current?.zoomOut()}>
            −
          </button>
          {TOOLS.map((entry) => (
            <button type="button" key={entry.id} aria-pressed={tool === entry.id} onClick={() => setTool(entry.id)}>
              {entry.label}
            </button>
          ))}
          <span className="spacer" />
          <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            Theme
          </button>
          <button type="button" onClick={exportPng}>
            Export PNG
          </button>
        </div>
        <section
          aria-label="Drawing (drop a DXF or DWG file here)"
          className={dragging ? "viewer-host dragging" : "viewer-host"}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) setSrc(file);
          }}
        >
          <CadViewer
            ref={viewer}
            src={src}
            theme={theme}
            tool={tool}
            layout={layout}
            hiddenLayers={hiddenLayers}
            loaders={LOADERS}
            onLoadStart={() => setStatus({ text: "Loading…", error: false })}
            onLoadProgress={({ phase }) => setStatus({ text: `Loading… (${phase})`, error: false })}
            onLoaded={({ document, fileName }) => {
              setStatus({
                text: `${fileName ?? "Drawing"} · ${document.format.toUpperCase()} · ${document.layers.size} layers (rendered by <CadViewer> for React)`,
                error: false,
              });
              setLayouts(viewer.current?.getLayouts() ?? []);
            }}
            onError={({ error }) => setStatus({ text: error.message, error: true })}
            onLayersChange={({ layers: next }) => setLayers(next)}
            onLayoutChange={() => setLayouts(viewer.current?.getLayouts() ?? [])}
            onToolChange={({ tool: next }) => setTool(next)}
            onSelect={({ pick: next }) => setPick(next)}
            onMeasure={setMeasured}
          />
        </section>
        <div className={status.error ? "status error" : "status"} role="status">
          {status.text}
        </div>
      </main>
    </div>
  );
}
