import type { CadLocale } from "@jesusjbriceno/cad-viewer-core";

/** Texts of the 3D viewer itself; error texts come from the core catalog. */
export interface Viewer3DMessages {
  /** Accessible name of the model canvas. */
  canvasLabel: string;
}

export const MESSAGES_3D: Readonly<Record<CadLocale, Viewer3DMessages>> = {
  "es-ES": { canvasLabel: "Modelo 3D" },
  en: { canvasLabel: "3D model" },
};
