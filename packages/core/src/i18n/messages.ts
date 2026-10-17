import type { CadErrorCode, CadErrorParams } from "../loaders/errors";
import type { CadLocale } from "./locale";

export type ErrorMessages = {
  [K in CadErrorCode]: (params: CadErrorParams[K]) => string;
};

export interface Messages {
  /** Accessible name of the drawing canvas. */
  canvasLabel: string;
  /** Label drawn next to a measured distance, already formatted for the locale. */
  measureLabel: (distance: string) => string;
  errors: ErrorMessages;
}

/** ": HTTP 404" / ": reason" when known, "." when the cause is unknown. */
const fetchDetail = (status: number | undefined, reason: string | undefined): string => {
  if (status !== undefined) return `: HTTP ${status}`;
  if (reason) return `: ${reason}`;
  return ".";
};

const en: Messages = {
  canvasLabel: "CAD drawing",
  measureLabel: (distance) => `Distance: ${distance}`,
  errors: {
    "unsupported-format": ({ fileName }) => `No loader can open "${fileName ?? "file"}".`,
    "parse-error": ({ fileName, format, reason }) =>
      `Could not read "${fileName ?? "file"}" as ${format}: ${reason}`,
    "fetch-failed": ({ url, status, reason }) =>
      `Failed to fetch "${url}"${fetchDetail(status, reason)}`,
    aborted: () => "Loading was aborted.",
    "unknown-layer": ({ name }) => `Unknown layer "${name}".`,
    "unknown-layout": ({ name }) => `Unknown layout "${name}".`,
    destroyed: () => "CadViewer has been destroyed.",
    "image-export-failed": () => "Image export failed.",
    "dxf-binary-unsupported": () => "Binary DXF is not supported yet.",
    "dxf-invalid-group-code": ({ value, line }) => `Invalid group code "${value}" at line ${line}.`,
    "dxf-missing-value": ({ groupCode, line }) =>
      `Missing value for group code ${groupCode} at line ${line}.`,
    "no-model-layout": () => "Document has no model layout.",
    "dwg-read-failed": () => "LibreDWG could not read the file.",
    "dwg-missing-point": () => "Missing point.",
    "stl-truncated": ({ triangles, bytes }) =>
      `Binary STL declares ${triangles} triangles but has only ${bytes} bytes.`,
    "stl-invalid-number": ({ line }) => `Invalid number in STL at line ${line}.`,
    "obj-invalid-number": ({ line }) => `Invalid number in OBJ at line ${line}.`,
    "obj-invalid-index": ({ index, line }) =>
      `Invalid vertex index "${index}" in OBJ at line ${line}.`,
    "webgl-unavailable": () => "WebGL is not available in this browser.",
  },
};

const esES: Messages = {
  canvasLabel: "Dibujo CAD",
  measureLabel: (distance) => `Distancia: ${distance}`,
  errors: {
    "unsupported-format": ({ fileName }) =>
      `No hay ningún cargador que pueda abrir ${fileName !== undefined ? `«${fileName}»` : "el archivo"}.`,
    "parse-error": ({ fileName, format, reason }) =>
      `No se ha podido leer ${fileName !== undefined ? `«${fileName}»` : "el archivo"} como ${format}: ${reason}`,
    "fetch-failed": ({ url, status, reason }) =>
      `No se ha podido descargar «${url}»${fetchDetail(status, reason)}`,
    aborted: () => "Se ha cancelado la carga.",
    "unknown-layer": ({ name }) => `La capa «${name}» no existe.`,
    "unknown-layout": ({ name }) => `La presentación «${name}» no existe.`,
    destroyed: () => "Este CadViewer ya se ha destruido.",
    "image-export-failed": () => "No se ha podido exportar la imagen.",
    "dxf-binary-unsupported": () => "Todavía no se admite el formato DXF binario.",
    "dxf-invalid-group-code": ({ value, line }) =>
      `Código de grupo «${value}» no válido en la línea ${line}.`,
    "dxf-missing-value": ({ groupCode, line }) =>
      `Falta el valor del código de grupo ${groupCode} en la línea ${line}.`,
    "no-model-layout": () => "El documento no tiene espacio modelo.",
    "dwg-read-failed": () => "LibreDWG no ha podido leer el archivo.",
    "dwg-missing-point": () => "Falta un punto.",
    "stl-truncated": ({ triangles, bytes }) =>
      `El STL binario declara ${triangles} triángulos pero solo tiene ${bytes} bytes.`,
    "stl-invalid-number": ({ line }) => `Número no válido en el STL en la línea ${line}.`,
    "obj-invalid-number": ({ line }) => `Número no válido en el OBJ en la línea ${line}.`,
    "obj-invalid-index": ({ index, line }) =>
      `Índice de vértice «${index}» no válido en el OBJ en la línea ${line}.`,
    "webgl-unavailable": () => "WebGL no está disponible en este navegador.",
  },
};

/** Built-in texts for every supported locale. */
export const MESSAGES: Readonly<Record<CadLocale, Messages>> = { "es-ES": esES, en };

export const ERROR_MESSAGES: Readonly<Record<CadLocale, ErrorMessages>> = {
  "es-ES": esES.errors,
  en: en.errors,
};
