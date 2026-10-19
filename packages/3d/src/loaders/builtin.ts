import type { CadScene, FormatLoader } from "@cadscene/core";
import { objLoader } from "./obj";
import { stlLoader } from "./stl";

/** Loaders every `Cad3DViewer` starts with. */
export const BUILT_IN_3D_LOADERS: readonly FormatLoader<CadScene>[] = [stlLoader, objLoader];
