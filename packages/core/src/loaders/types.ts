import type { CadDocument } from "../model/types";

export interface LoadProgress {
  /** Free-form phase label, e.g. "read", "parse", "convert". */
  phase: string;
  /** 0..1 when the loader can estimate it. */
  ratio?: number;
}

export interface LoadOptions {
  fileName?: string;
  signal?: AbortSignal;
  onProgress?: (progress: LoadProgress) => void;
}

export interface LoaderProbe {
  fileName?: string;
  /** File content; loaders should only inspect the first bytes. */
  bytes: Uint8Array;
}

/**
 * A file format plugin. Loaders turn raw bytes into a `CadDocument` and never
 * touch the DOM, so they can run in a worker.
 */
export interface FormatLoader {
  /** Stable id, also used as `CadDocument.format` ("dxf", "dwg"). */
  readonly id: string;
  /** Lower-case extensions including the dot, e.g. [".dxf"]. */
  readonly extensions: readonly string[];
  /** Content sniffing used when the extension is missing or unknown. */
  canLoad(probe: LoaderProbe): boolean;
  load(bytes: Uint8Array, options: LoadOptions): Promise<CadDocument>;
}
