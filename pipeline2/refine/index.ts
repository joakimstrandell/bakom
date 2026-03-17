/** pipeline2 refine — CLI entry point.
 *
 * Usage:
 *   npx tsx pipeline2/refine/index.ts            # incremental
 *   npx tsx pipeline2/refine/index.ts --force     # re-fetch all
 *   npx tsx pipeline2/refine/index.ts --id <id>   # re-fetch specific venue
 */

import { refineWithGoogle } from "./google.js";

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");

  const idIndex = args.indexOf("--id");
  const targetId = idIndex !== -1 ? args[idIndex + 1] : undefined;

  const start = Date.now();
  const venues = await refineWithGoogle({ force, targetId });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n  Done in ${elapsed}s — ${venues.length} venues`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
