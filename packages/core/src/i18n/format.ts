import { type CadErrorCode, CadViewerError } from "../loaders/errors";
import { type CadLocale, resolveLocale } from "./locale";
import { ERROR_MESSAGES } from "./messages";

/** Params without which a code's text cannot be built; such errors keep their message. */
const REQUIRED_PARAMS: Partial<Record<CadErrorCode, readonly string[]>> = {
  "parse-error": ["format", "reason"],
  "fetch-failed": ["url"],
  "unknown-layer": ["name"],
  "unknown-layout": ["name"],
  "dxf-invalid-group-code": ["value", "line"],
  "dxf-missing-value": ["groupCode", "line"],
  "stl-truncated": ["triangles", "bytes"],
  "stl-invalid-number": ["line"],
  "obj-invalid-number": ["line"],
  "obj-invalid-index": ["index", "line"],
  "scene-json-invalid": ["path"],
};

/**
 * Text for any error in the given locale (default `es-ES`, unsupported
 * locales fall back to English). Library errors are translated from their
 * `code` and `params`; any other error keeps its own message.
 */
export function formatCadError(error: unknown, locale?: string): string {
  if (!(error instanceof CadViewerError)) {
    return error instanceof Error ? error.message : String(error);
  }
  const resolved = resolveLocale(locale);
  const format = ERROR_MESSAGES[resolved][error.code] as
    | ((params: Readonly<Record<string, string | number>>) => string)
    | undefined;
  const required = REQUIRED_PARAMS[error.code] ?? [];
  const params = error.params;
  if (!format || required.some((key) => params?.[key] === undefined)) return error.message;
  const translated: Record<string, string | number> = { ...params };
  if (error.code === "parse-error" && error.cause instanceof CadViewerError)
    translated.reason = formatCadError(error.cause, resolved);
  return format(translated);
}

const numberFormats = new Map<CadLocale, Intl.NumberFormat>();

/** Formats a drawing length with up to six significant digits. */
export function formatLength(value: number, locale: CadLocale): string {
  let format = numberFormats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale, { maximumSignificantDigits: 6, useGrouping: false });
    numberFormats.set(locale, format);
  }
  return format.format(value);
}
