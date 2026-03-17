/** pipeline2 score — CLI entry point.
 *
 * Usage: npx tsx pipeline2/score/index.ts
 */

import { scoreAll } from "./score.js";

async function main() {
  const start = Date.now();
  const venues = await scoreAll();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n  Done in ${elapsed}s — ${venues.length} scored venues`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
