import type { CadDocument } from "../model/types";
import { abortError, CadLoadError, loadError } from "./errors";
import type { FormatLoader, LoaderProbe, LoadOptions } from "./types";

function extensionOf(fileName: string | undefined): string | undefined {
  if (!fileName) return undefined;
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? undefined : fileName.slice(dot).toLowerCase();
}

/**
 * Ordered set of format loaders. Extension match wins; sniffing is the fallback.
 * `FormatRegistry<CadScene>` holds 3D loaders.
 */
export class FormatRegistry<T = CadDocument> {
  private readonly loaders = new Map<string, FormatLoader<T>>();

  constructor(loaders: Iterable<FormatLoader<T>> = []) {
    for (const loader of loaders) this.register(loader);
  }

  /** Adds a loader, replacing any loader with the same id. */
  register(loader: FormatLoader<T>): void {
    this.loaders.set(loader.id, loader);
  }

  unregister(id: string): void {
    this.loaders.delete(id);
  }

  list(): FormatLoader<T>[] {
    return [...this.loaders.values()];
  }

  resolve(probe: LoaderProbe): FormatLoader<T> | undefined {
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
  async load(bytes: Uint8Array, options: LoadOptions = {}): Promise<T> {
    if (options.signal?.aborted) throw abortError();
    const name = options.fileName !== undefined ? { fileName: options.fileName } : {};
    const loader = this.resolve({ fileName: options.fileName, bytes });
    if (!loader) throw loadError("unsupported-format", name);
    try {
      return await loader.load(bytes, options);
    } catch (error) {
      if (error instanceof CadLoadError) throw error;
      if (options.signal?.aborted) throw abortError();
      const reason = error instanceof Error ? error.message : String(error);
      throw loadError("parse-error", { ...name, format: loader.id, reason }, error);
    }
  }
}
