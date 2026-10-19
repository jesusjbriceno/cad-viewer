import { ERROR_MESSAGES } from "../i18n/messages";

export type CadLoadErrorCode = "unsupported-format" | "parse-error" | "fetch-failed" | "aborted";

type NoParams = Record<string, never>;

/** Parameters recorded on each library error, by code. */
export interface CadErrorParams {
  "unsupported-format": { fileName?: string };
  "parse-error": { fileName?: string; format: string; reason: string };
  "fetch-failed": { url: string; status?: number; reason?: string };
  aborted: NoParams;
  "unknown-layer": { name: string };
  "unknown-layout": { name: string };
  destroyed: NoParams;
  "image-export-failed": NoParams;
  "dxf-binary-unsupported": NoParams;
  "dxf-invalid-group-code": { value: string; line: number };
  "dxf-missing-value": { groupCode: number; line: number };
  "no-model-layout": NoParams;
  "dwg-read-failed": NoParams;
  "dwg-missing-point": NoParams;
  "stl-truncated": { triangles: number; bytes: number };
  "stl-invalid-number": { line: number };
  "obj-invalid-number": { line: number };
  "obj-invalid-index": { index: string; line: number };
  "webgl-unavailable": NoParams;
  "scene-json-invalid": { path: string };
}

/** Stable identifier of a library error; use it for logic, never `message`. */
export type CadErrorCode = keyof CadErrorParams;

export interface CadErrorOptions {
  cause?: unknown;
  params?: Readonly<Record<string, string | number>>;
}

/**
 * Error raised by the library. `code` and `params` are stable; `message` is
 * English, for logs. Use `formatCadError()` to show it in the user's language.
 */
export class CadViewerError extends Error {
  override readonly name: string = "CadViewerError";
  readonly code: CadErrorCode;
  readonly params: Readonly<Record<string, string | number>> | undefined;

  constructor(code: CadErrorCode, message: string, options: CadErrorOptions = {}) {
    super(message, "cause" in options ? { cause: options.cause } : undefined);
    this.code = code;
    this.params = options.params;
  }
}

/** Failure to read, fetch or parse a drawing. */
export class CadLoadError extends CadViewerError {
  override readonly name: string = "CadLoadError";
  declare readonly code: CadLoadErrorCode;

  constructor(code: CadLoadErrorCode, message: string, options?: CadErrorOptions) {
    super(code, message, options);
  }
}

function englishMessage<K extends CadErrorCode>(code: K, params: CadErrorParams[K]): string {
  return (ERROR_MESSAGES.en[code] as (params: CadErrorParams[K]) => string)(params);
}

/** Creates a library error whose message is the English text for `code`. */
export function viewerError<K extends Exclude<CadErrorCode, CadLoadErrorCode>>(
  code: K,
  params: CadErrorParams[K],
): CadViewerError {
  return new CadViewerError(code, englishMessage(code, params), { params });
}

/** Creates a load error whose message is the English text for `code`. */
export function loadError<K extends CadLoadErrorCode>(
  code: K,
  params: CadErrorParams[K],
  cause?: unknown,
): CadLoadError {
  return new CadLoadError(code, englishMessage(code, params), {
    params,
    ...(cause !== undefined ? { cause } : {}),
  });
}

export function abortError(): CadLoadError {
  return loadError("aborted", {});
}
