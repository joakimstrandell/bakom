/** pipeline2 merge — CLI entry point.
 *
 * Usage: npx tsx pipeline2/merge/index.ts
 */

import { mergeAll } from "./merge.js";

async function main() {
  const start = Date.now();
  const venues = await mergeAll();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n  Done in ${elapsed}s — ${venues.length} venues`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
