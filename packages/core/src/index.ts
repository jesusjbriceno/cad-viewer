export { dxfLoader, parseDxf } from "./dxf";
export { decodeTextValue, decodeUnicodeEscapes } from "./dxf/text";
export {
  type CadLocale,
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  formatCadError,
  resolveLocale,
  SUPPORTED_LOCALES,
} from "./i18n";
export type {
  DocumentSummary,
  EntityDetails,
  EntityFilter,
  EntityInfo,
  PropertyValue,
} from "./inspect";
export { collectEntities, describeEntity, summarizeDocument } from "./inspect";
export {
  abortError,
  type CadErrorCode,
  type CadErrorOptions,
  type CadErrorParams,
  CadLoadError,
  type CadLoadErrorCode,
  CadViewerError,
} from "./loaders/errors";
export { FormatRegistry } from "./loaders/registry";
export type { FormatLoader, LoaderProbe, LoadOptions, LoadProgress } from "./loaders/types";
export { aciToRgb, colorToCss, rgbToCss } from "./model/colors";
export {
  createDefaultLayer,
  createEmptyDocument,
  createModelLayout,
  DEFAULT_LAYER,
  getModelLayout,
  MODEL_LAYOUT,
} from "./model/document";
export type * from "./model/types";
export { createEmptyScene, DEFAULT_MATERIAL, meshBounds, sceneBounds } from "./scene/scene";
export type * from "./scene/types";
export { CadViewer } from "./viewer/CadViewer";
/** Reads a URL, File/Blob or bytes the way `CadViewer.load()` does (for 3D and custom viewers). */
export {
  type ReadOptions as ReadCadSourceOptions,
  readSource as readCadSource,
  type SourceBytes,
} from "./viewer/internal/source";
export type * from "./viewer/types";
