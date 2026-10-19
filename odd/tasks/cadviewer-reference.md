# CADViewer (cadviewerjs.com) as a reference

Research note, read-only: what CADViewer is, how it compares with cad-viewer, and which parts of
it are worth adopting. No code was copied and no bundled code was analysed. Sources are public
pages read on 2026-10-19; prices and claims are theirs, not verified by purchase.

## What it is

**CADViewer** is a commercial product by **Tailor Made Software** with two editions:

- **CADViewer Pro** — the front-end: SVG + JavaScript rendering of CAD drawings in the browser.
- **CADViewer Enterprise** — Pro plus **AutoXchange**, a server-side conversion engine.

Licensing is subscription or perpetual and per server: Full Server USD 4,190 perpetual
(USD 2,444/year subscription), Corporate USD 900 (10 named users), OEM agreements for resale,
and a 10-day trial. There is no open-source or free tier.

### How it is built (observed)

| Aspect | CADViewer |
| --- | --- |
| Rendering | **SVG** document + Snap.svg, one DOM node per entity |
| Delivery | Global scripts (`cadviewer_min.js`, `cadviewer_setup_min.js`), no ESM |
| API | Global `cvjs_*` functions on `window` (e.g. `cvjs_InitCADViewer(div, image, folder)`, `cvjs_allLayersInDrawingOn(div)`), plus an icon modal |
| DWG/DXF/DWF/DGN | **Requires the conversion server** (AutoXchange or the NodeJS conversion server) or pre-converted drawings; their own samples separate "no server" (pre-converted) from "external server" |
| Formats | SVG/SVGZ, DWG, DXF, DWF, DGN, PDF, PNG, JPG, GIF, TIFF (CAD formats via conversion) |
| Feature surface | Layers, redlining, drawing compare, object highlight/hit by handle, zoom/pan/pinch, REST API, conversion server, AI assistant, analytics |

## Comparison with cad-viewer

| Dimension | CADViewer | cad-viewer | Reading |
| --- | --- | --- | --- |
| License | Proprietary, per-server subscription | MIT (core, 3D, wrappers); GPL only in the opt-in DWG plugin | Our positioning is the opposite; do not borrow their model |
| DWG path | Server-side conversion | Client-side WASM (LibreDWG) | Our differentiator: no server to deploy or pay for |
| Renderer | SVG (DOM per entity) | Canvas2D (2D) and WebGL/three.js (3D) | Canvas scales to large drawings; SVG gives free hit testing |
| API style | Global mutable functions, jQuery-era integration | Typed class instance, typed events, Vue/React wrappers, ESM | Their API is dated; copying it would be a regression |
| 3D | Not in Pro (2D/SVG-centric) | First-class `Cad3DViewer` with STL/OBJ | Our advantage; do not chase them here |
| i18n | Not a documented feature | `es-ES` default + `en` fallback, stable error codes | Our advantage |
| Deployment | Needs a server for most formats | Static site, zero runtime deps in core | Our advantage |

## What is worth adopting

The valuable part of CADViewer is its **product surface**, not its architecture.

### P1 — high value, fits MIT and client-side only

1. **Annotations / redlining (2D).** A persistable markup layer (polyline, cloud, arrow, text,
   callout with measurement) with a stable JSON schema, import/export and typed events. They
   charge for this and it is the single most requested collaboration feature.
2. **Object selection and highlight API.** Explicit `select(handles)`, `highlight(handles, color)`,
   `clearSelection()` plus the existing pick/hover, so a host app can drive the drawing from its
   own UI (their "dynamic interaction with graphics" is exactly this).
3. **Drawing compare.** Overlay two `CadDocument`s and colour added / removed / changed entities.
   Our neutral model already supports it without a server.
4. **Named views and layer presets.** Save and restore camera + visible layers ("views"), which
   today the host has to reconstruct.

### P2 — useful, lower priority

5. Entity properties inspector (beyond the current pick payload) and tooltips/hyperlinks.
6. Text search inside a drawing.

### Explicitly rejected

- **Server-side conversion (AutoXchange / conversion server).** It contradicts our zero-server,
  zero-cost, static-site model.
- **PDF, DGN, DWF, TIFF import.** Separate parsers with their own licenses and scope; nothing to do
  with our value proposition today.
- **SVG renderer.** A DOM node per entity does not scale to the drawings Canvas2D already handles.
- **Global `cvjs_*` API and the icon modal.** We keep the typed instance + typed events.
- **AI assistant and analytics.** Out of scope.

## On using REA against a commercial product

REA is useful for **shipped artefacts we are allowed to study**. With CADViewer there are two
constraints to respect:

- **Legal:** the code is proprietary. Reimplementing features is fine (ideas and behaviour are not
  copyrightable), but copying, translating or lifting minified code into an MIT repository is not.
  Any analysis must stay clean-room: observations from public documentation and observable
  behaviour, with provenance recorded, and no code brought across.
- **Technical:** the client is minified and the interesting part (CAD conversion) is not even in
  the browser — it is a server product. The bundle would reveal little we cannot learn from the
  documented API and the demo.

Recommended, if we want hands-on evidence: use their **10-day trial or the public demo** to record
behaviour (annotation workflow, highlight API, compare UI) with REA `capture_browser_scenario`, and
write down the *behaviour* we want, not their code. A permissively licensed code reference already
exists and is better: `mlightcad/cad-viewer` (MIT), which we already used for the foundation.

## Questions to settle before implementing

1. Which P1 item comes first: **annotations** or **compare**? Both reuse the existing 2D model.
2. Annotations need a **schema** decision: our own versioned JSON with a `version` field, and
   whether markups live in the `CadDocument` or in a separate `MarkupLayer` the viewer owns.
3. Do we expose selection/highlight as **viewer state** (handles + colour) or as an **overlay API**
   the host draws itself?
4. Whether the compare view is a **component/mode** of `CadViewer` or a separate function that
   builds a diff `CadDocument`.

## Follow-up: 3D inside DWG — what the references actually do

Question raised by the user after hitting a DWG whose model space is 15 `3DSOLID` entities:
does CADViewer solve 3D solids inside DWG, and if so how? Sources read on 2026-10-19 (their
public documentation, product pages and community threads; no bundle was analysed).

| Product | Licence / model | 3D inside DWG |
| --- | --- | --- |
| **CADViewer (Tailormade)** | Commercial, per-server; Pro front-end + AutoXchange converter | **No 3D orbit of `3DSOLID`.** The client is an SVG/JavaScript 2D vector viewer; DWG/DXF/DWF/DGN/PDF are converted **server-side** by AutoXchange into a 2D display format. Their JSDoc exposes a `cvjs_resizeWindow_3D` helper, but nothing documents mesh/solid rendering. In their own community thread a user asks for 3D CAD formats (SolidWorks/Solid Edge) and the answer points at 2D CAD viewing. |
| **mlightcad/cad-viewer** | MIT, browser + WASM, no server | 2D today; its FAQ says 3D viewing is planned. It is the code reference we already used. |
| **ViewSoft (Rasterex engine)** | Commercial SDK, self-hosted, per seat | Offers "optional 3D viewing" plus layer control and entity property access — the closest to what was admired, but closed and paid. |
| **Autodesk Web / APS** | Commercial cloud | Full 3D, via server-side Model Derivative conversion (DWG → SVF), not client-side parsing. |

**Conclusion:** no permissively licensed, browser-only, no-server viewer renders DWG ACIS
solids. The industry answer is server-side or cloud conversion, which is exactly the model we
rejected on purpose. `3DSOLID` is out of reach without a B-rep kernel (commercial) or a
conversion service; `3DFACE` is the only 3D entity our parsers already carry, and it is
currently flattened into a planar `solid`.

### Implication for cad-viewer

1. Do not chase CADViewer here: it solves the problem by avoiding it (2D conversion server).
2. The only increment consistent with MIT + zero server is **`3DFACE` → `CadScene`** (triangulate
   the quads, keep Z, show in `Cad3DViewer`). It gives 3D to drawings that use faces; it does not
   cover ACIS.
3. `3DSOLID` stays documented as unsupported unless a kernel or a service is accepted, which is a
   product and licensing decision, not an implementation detail.
