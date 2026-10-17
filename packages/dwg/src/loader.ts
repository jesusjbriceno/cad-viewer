import {
  abortError,
  type CadDocument,
  type FormatLoader,
  type LoaderProbe,
  type LoadOptions,
} from "@jesusjbriceno/cad-viewer-core";
import type { DwgDatabase } from "@mlightcad/libredwg-web";
import { convertDwgDatabase } from "./convert";

/** The subset of libredwg-web's `LibreDwg` API this loader uses. */
export interface LibreDwgLike {
  dwg_read_data(content: ArrayBuffer, fileType: number): number | undefined;
  convert(data: number): DwgDatabase;
  dwg_free(data: number): void;
}

export interface DwgLoaderOptions {
  /**
   * Directory or base URL where `libredwg-web.wasm` is served, with a trailing
   * slash (e.g. "/libredwg/"). Defaults to libredwg-web's own resolution.
   */
  wasmUrl?: string;
  /** A ready LibreDWG instance, or a factory for one (advanced: tests, custom builds). */
  libredwg?: LibreDwgLike | (() => Promise<LibreDwgLike>);
}

/** `Dwg_File_Type.DWG` in libredwg-web. */
const DWG_FILE_TYPE = 0;
const MAGIC = /^AC1\d{3}$/;

function versionOf(bytes: Uint8Array): string | undefined {
  if (bytes.length < 6) return undefined;
  const magic = String.fromCharCode(...bytes.subarray(0, 6));
  return MAGIC.test(magic) ? magic : undefined;
}

async function createLibreDwg(wasmUrl: string | undefined): Promise<LibreDwgLike> {
  // Loaded on first use so apps that never open a DWG don't download LibreDWG.
  const { LibreDwg } = await import("@mlightcad/libredwg-web");
  // SAFETY: LibreDwgEx implements dwg_read_data/convert/dwg_free with these
  // shapes; its declared `string | ArrayBuffer` input is wider than ours.
  return (await LibreDwg.create(wasmUrl)) as unknown as LibreDwgLike;
}

/**
 * Creates the DWG format loader. LibreDWG (WebAssembly) is instantiated once
 * per loader on the first DWG load; a failed initialization is retried on the
 * next load.
 */
export function createDwgLoader(options: DwgLoaderOptions = {}): FormatLoader {
  let instance: Promise<LibreDwgLike> | undefined;
  const libredwg = (): Promise<LibreDwgLike> => {
    if (!instance) {
      const source = options.libredwg;
      instance =
        typeof source === "function"
          ? source()
          : source
            ? Promise.resolve(source)
            : createLibreDwg(options.wasmUrl);
      instance.catch(() => {
        instance = undefined;
      });
    }
    return instance;
  };

  return {
    id: "dwg",
    extensions: [".dwg"],

    canLoad({ bytes }: LoaderProbe): boolean {
      return versionOf(bytes) !== undefined;
    },

    async load(bytes: Uint8Array, loadOptions: LoadOptions): Promise<CadDocument> {
      const { signal, onProgress } = loadOptions;
      if (signal?.aborted) throw abortError();
      onProgress?.({ phase: "init" });
      const module = await libredwg();
      if (signal?.aborted) throw abortError();

      onProgress?.({ phase: "parse" });
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      const data = module.dwg_read_data(buffer, DWG_FILE_TYPE);
      if (data === undefined || data === 0) throw new Error("LibreDWG could not read the file.");
      try {
        if (signal?.aborted) throw abortError();
        onProgress?.({ phase: "convert" });
        const version = versionOf(bytes);
        return convertDwgDatabase(module.convert(data), version ? { version } : {});
      } finally {
        module.dwg_free(data);
      }
    },
  };
}

/** DWG loader with default options (LibreDWG resolves its wasm next to its script). */
export const dwgLoader: FormatLoader = createDwgLoader();
