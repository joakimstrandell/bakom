/** pipeline2 optimize — CLI entry point.
 *
 * Usage: npx tsx pipeline2/optimize/index.ts
 */

import { optimizeAll } from "./optimize.js";

async function main() {
  const start = Date.now();
  const { restaurants, hotels } = await optimizeAll();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `\n  Done in ${elapsed}s — ${restaurants.length} restaurants, ${hotels.length} hotels`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
