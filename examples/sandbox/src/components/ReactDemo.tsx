import { formatCadError } from "@cadscene/core";
import {
  type CadLocale,
  type CadSource,
  type CadTheme,
  CadViewer,
  type LayerInfo,
  type LayoutInfo,
  type MeasureResult,
  type PickResult,
  useCadViewerRef,
  type ViewerTool,
} from "@cadscene/react";
import { useEffect, useMemo, useState } from "react";
import { currentLocale, messages, onLocaleChange, type SandboxMessages } from "../lib/i18n";
import { describeMeasure, describePick, downloadBlob, LOADERS, SAMPLES } from "../lib/shared";

const TOOLS: ViewerTool[] = ["pan", "zoom-window", "measure"];

/** Status kept as a function of the texts so a language change redraws it. */
interface Status {
  text: (t: SandboxMessages, locale: CadLocale) => string;
  error: boolean;
}

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
  const [locale, setLocale] = useState<CadLocale>(currentLocale);
  const [status, setStatus] = useState<Status>({ text: (t) => t.ready, error: false });
  const [dragging, setDragging] = useState(false);
  const hidden = useMemo(() => new Set(hiddenLayers), [hiddenLayers]);
  const t = messages(locale);
  useEffect(() => onLocaleChange(setLocale), []);

  const toggleLayer = (name: string, visible: boolean) =>
    setHiddenLayers((current) =>
      visible ? current.filter((layer) => layer !== name) : [...current, name],
    );
  const exportPng = async () => {
    const blob = await viewer.current?.exportImage({ scale: 2 });
    if (blob) downloadBlob(blob, "drawing.png");
  };

  return (
    <div className="app">
      <aside className="side">
        <section>
          <h2>{t.drawing}</h2>
          <select aria-label={t.samples.label} onChange={(event) => setSrc(event.target.value)}>
            {SAMPLES.map((sample) => (
              <option key={sample.url} value={sample.url}>
                {t.samples[sample.key]}
              </option>
            ))}
          </select>
          <div className="row">
            <input
              type="file"
              accept=".dxf,.dwg"
              aria-label={t.openFile}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setSrc(file);
              }}
            />
          </div>
          <p className="drop-hint">{t.dropHint}</p>
        </section>
        <section>
          <h2>{t.layout}</h2>
          <select
            aria-label={t.layout}
            value={layouts.find((entry) => entry.active)?.name ?? ""}
            onChange={(event) => setLayout(event.target.value)}
          >
            {layouts.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.name}
              </option>
            ))}
          </select>
        </section>
        <section>
          <h2>{t.controlledLayers("hiddenLayers")}</h2>
          <ul className="layers">
            {layers.map((layer) => (
              <li key={layer.name}>
                <label>
                  <input
                    type="checkbox"
                    checked={!hidden.has(layer.name)}
                    onChange={(event) => toggleLayer(layer.name, event.target.checked)}
                  />
                  <span className="swatch" style={{ background: layer.color }} />
                  <span>{layer.frozen ? `${layer.name} (${t.frozen})` : layer.name}</span>
                  <span className="count">{layer.entityCount}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="row">
            <button type="button" onClick={() => setHiddenLayers([])}>
              {t.showAll}
            </button>
            <button
              type="button"
              onClick={() => setHiddenLayers(layers.map((layer) => layer.name))}
            >
              {t.hideAll}
            </button>
          </div>
        </section>
        <section>
          <h2>{t.selection}</h2>
          <pre className="info">{describePick(pick, locale)}</pre>
        </section>
        <section>
          <h2>{t.measure}</h2>
          <pre className="info">{describeMeasure(measured, locale)}</pre>
        </section>
      </aside>
      <main className="stage">
        <div className="toolbar" role="toolbar" aria-label={t.toolbar}>
          <button type="button" title={t.fitTitle} onClick={() => viewer.current?.zoomExtents()}>
            {t.fit}
          </button>
          <button type="button" title={t.zoomInTitle} onClick={() => viewer.current?.zoomIn()}>
            +
          </button>
          <button type="button" title={t.zoomOutTitle} onClick={() => viewer.current?.zoomOut()}>
            −
          </button>
          {TOOLS.map((entry) => (
            <button
              type="button"
              key={entry}
              aria-pressed={tool === entry}
              onClick={() => setTool(entry)}
            >
              {t.tools[entry]}
            </button>
          ))}
          <span className="spacer" />
          <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {t.theme}
          </button>
          <button type="button" onClick={exportPng}>
            {t.exportPng}
          </button>
        </div>
        <section
          aria-label={t.dropRegion}
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
            locale={locale}
            tool={tool}
            layout={layout}
            hiddenLayers={hiddenLayers}
            loaders={LOADERS}
            onLoadStart={() => setStatus({ text: (t) => t.loading, error: false })}
            onLoadProgress={({ phase }) =>
              setStatus({ text: (t) => t.loadingPhase(phase), error: false })
            }
            onLoaded={({ document, fileName }) => {
              setStatus({
                text: (t) =>
                  t.loadedBy({
                    name: fileName ?? t.drawingFallback,
                    format: document.format.toUpperCase(),
                    layers: document.layers.size,
                    component: "React",
                  }),
                error: false,
              });
              setLayouts(viewer.current?.getLayouts() ?? []);
            }}
            // Library errors are translated from their stable code; the English message stays for logs.
            onError={({ error }) =>
              setStatus({ text: (_t, current) => formatCadError(error, current), error: true })
            }
            onLayersChange={({ layers: next }) => setLayers(next)}
            onLayoutChange={() => setLayouts(viewer.current?.getLayouts() ?? [])}
            onToolChange={({ tool: next }) => setTool(next)}
            onSelect={({ pick: next }) => setPick(next)}
            onMeasure={setMeasured}
          />
        </section>
        <div className={status.error ? "status error" : "status"} role="status">
          {status.text(t, locale)}
        </div>
      </main>
    </div>
  );
}
