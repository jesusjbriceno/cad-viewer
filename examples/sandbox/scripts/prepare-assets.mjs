// Copies the LibreDWG wasm and the sample drawings into public/ before dev/build.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sandbox = join(dirname(fileURLToPath(import.meta.url)), "..");
const packages = join(sandbox, "..", "..", "packages");

const assets = [
  [join(packages, "dwg", "node_modules", "@mlightcad", "libredwg-web", "wasm", "libredwg-web.wasm"), join("libredwg", "libredwg-web.wasm")],
  [join(packages, "core", "test", "fixtures", "dxf", "sample-r2000.dxf"), join("samples", "sample-r2000.dxf")],
  [join(packages, "dwg", "test", "fixtures", "example_2013.dwg"), join("samples", "example_2013.dwg")],
];

for (const [from, to] of assets) {
  if (!existsSync(from)) {
    console.error(`prepare-assets: missing ${from} (run "pnpm install" at the repository root).`);
    process.exit(1);
  }
  const target = join(sandbox, "public", to);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(from, target);
}
console.log(`prepare-assets: copied ${assets.length} files into public/.`);
