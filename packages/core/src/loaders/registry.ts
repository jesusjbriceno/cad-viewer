import type { CadDocument } from "../model/types";
import { abortError, CadLoadError } from "./errors";
import type { FormatLoader, LoaderProbe, LoadOptions } from "./types";

function extensionOf(fileName: string | undefined): string | undefined {
  if (!fileName) return undefined;
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? undefined : fileName.slice(dot).toLowerCase();
}

/** Ordered set of format loaders. Extension match wins; sniffing is the fallback. */
export class FormatRegistry {
  private readonly loaders = new Map<string, FormatLoader>();

  constructor(loaders: Iterable<FormatLoader> = []) {
    for (const loader of loaders) this.register(loader);
  }

  /** Adds a loader, replacing any loader with the same id. */
  register(loader: FormatLoader): void {
    this.loaders.set(loader.id, loader);
  }

  unregister(id: string): void {
    this.loaders.delete(id);
  }

  list(): FormatLoader[] {
    return [...this.loaders.values()];
  }

  resolve(probe: LoaderProbe): FormatLoader | undefined {
    const extension = extensionOf(probe.fileName);
    if (extension) {
      for (const loader of this.loaders.values()) {
        if (loader.extensions.includes(extension)) return loader;
      }
    }
    for (const loader of this.loaders.values()) {
      if (loader.canLoad(probe)) return loader;
    }
    return undefined;
  }

  /** Resolves a loader and runs it, normalizing every failure to `CadLoadError`. */
  async load(bytes: Uint8Array, options: LoadOptions = {}): Promise<CadDocument> {
    if (options.signal?.aborted) throw abortError();
    const label = options.fileName ?? "file";
    const loader = this.resolve({ fileName: options.fileName, bytes });
    if (!loader) throw new CadLoadError("unsupported-format", `No loader can open "${label}".`);
    try {
      return await loader.load(bytes, options);
    } catch (error) {
      if (error instanceof CadLoadError) throw error;
      if (options.signal?.aborted) throw abortError();
      const reason = error instanceof Error ? error.message : String(error);
      throw new CadLoadError(
        "parse-error",
        `Could not read "${label}" as ${loader.id}: ${reason}`,
        {
          cause: error,
        },
      );
    }
  }
}
