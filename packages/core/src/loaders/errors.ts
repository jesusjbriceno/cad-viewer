export type CadLoadErrorCode = "unsupported-format" | "parse-error" | "fetch-failed" | "aborted";

export class CadLoadError extends Error {
  override readonly name = "CadLoadError";
  readonly code: CadLoadErrorCode;

  constructor(code: CadLoadErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

export function abortError(): CadLoadError {
  return new CadLoadError("aborted", "Loading was aborted.");
}
