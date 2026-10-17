import { abortError, loadError } from "../../loaders/errors";
import type { CadSource } from "../types";

export interface SourceBytes {
  bytes: Uint8Array;
  fileName?: string;
}

export interface ReadOptions {
  fetch?: typeof fetch;
  requestInit?: RequestInit;
  signal?: AbortSignal;
}

function fileNameFromUrl(url: string): string | undefined {
  try {
    const segment = new URL(url, "http://localhost/").pathname.split("/").filter(Boolean).at(-1);
    return segment ? decodeURIComponent(segment) : undefined;
  } catch {
    return undefined;
  }
}

/** Reads any supported source into bytes, inferring a file name where possible. */
export async function readSource(source: CadSource, options: ReadOptions): Promise<SourceBytes> {
  if (source instanceof Uint8Array) return { bytes: source };
  if (source instanceof ArrayBuffer) return { bytes: new Uint8Array(source) };
  if (typeof Blob !== "undefined" && source instanceof Blob) {
    const name = (source as Partial<File>).name;
    const bytes = new Uint8Array(await source.arrayBuffer());
    return name ? { bytes, fileName: name } : { bytes };
  }
  const url = source instanceof URL ? source.href : String(source);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...options.requestInit,
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (options.signal?.aborted) throw abortError();
    const reason = error instanceof Error ? error.message : String(error);
    throw loadError("fetch-failed", { url, reason }, error);
  }
  if (!response.ok) throw loadError("fetch-failed", { url, status: response.status });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const fileName = fileNameFromUrl(url);
  return fileName ? { bytes, fileName } : { bytes };
}
