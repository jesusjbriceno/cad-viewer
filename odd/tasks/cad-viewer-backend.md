# Backend converter — decision proposal

The user's conclusion after the `3DSOLID` test: "lo que hay que hacer es un conversor en un
backend". This document lays out what that means, what it costs, and how to do it without
destroying the library's reason to exist. **No code until an option is chosen.**

## Why a backend at all

`3DSOLID` inside DWG is ACIS/SAT B-rep data. Turning it into triangles requires a modelling
kernel. Research (see `cadviewer-reference.md`) shows nobody with a permissive licence does this
in the browser: CADViewer converts server-side with AutoXchange, Autodesk uses the cloud (Model
Derivative), ViewSoft ships a commercial engine. So the statement is correct — **for ACIS**, and
only for ACIS.

## What must not change

The library's differentiator is the opposite of a mandatory server: MIT, static hosting, files
never leave the browser, DWG via WASM, no per-seat cost. A converter may be an **optional
companion**, never a requirement:

- core, 3D and wrappers keep working with no backend (DXF/DWG 2D, STL/OBJ 3D, `3DFACE`);
- the backend is a separate package/deployment, opt-in, with its own licence;
- the client degrades with a clear message when it is absent.

## Options

| # | Option | What we build | Licence / cost | Limits |
| --- | --- | --- | --- | --- |
| A | **Adapter to an existing converter** (self-hosted: ODA Drawings SDK or AutoXchange; cloud: Autodesk APS Model Derivative) | A thin service contract (`POST file → mesh/tiles`) and a client loader that calls it; documentation for the operator | Commercial, per-server or per-model. **Pricing must be confirmed with each vendor; not verified here** | The customer runs or pays for the converter; our repo stays MIT |
| B | **Our own converter** (LibreDWG for DWG reading + a kernel for ACIS → mesh, e.g. OCCT with SAT import) | The whole pipeline: service, job queue, caching, deployment | OCCT is LGPL-2.1 with exceptions; ACIS/SAT support is the weak point — LibreDWG exposes ACIS blobs but does not tessellate them | Multi-month project; correctness of SAT parsing is the hard part |
| C | **No backend** | Documentation only | none | `3DSOLID` stays unsupported; `3DFACE` covered client-side |

## Recommendation

1. **Ship `3DFACE` → 3D now** (client-side, MIT, no infra). It covers drawings that carry faces —
   terrain, civil, simple architectural 3D — and it is already 80% in place: both parsers keep the
   Z coordinate; only the triangulation and the `CadScene` mapping are missing.
2. **Treat the backend as option A when a real need appears**, as a separate repository/package.
   We do not build a kernel: that is a different company-sized product, and every commercial
   alternative already exists.
3. Keep the client honest: when a drawing only contains `3DSOLID`, say so (already done) and point
   at the optional converter when one is configured.

## Decision requested

- **A vs B vs C** for the ACIS path, and
- confirmation that the **client stays server-free by default** (option A implies an optional,
  separately deployed service; B implies a product of its own).

Until this is decided, the only code that moves is `3DFACE` → 3D.
