/** Optimize CLI entry point. @see docs/pipeline.md */

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
