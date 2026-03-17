/** JSON save/load utilities for pipeline data. */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = join(__dirname, "..", ".data");
export const ARTICLES_DIR = join(DATA_DIR, "articles");

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Save articles to pipeline/.data/articles/{filename} */
export function saveArticles(filename: string, data: unknown): void {
  ensureDir(ARTICLES_DIR);
  const path = join(ARTICLES_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`  Saved ${path}`);
}

/** Load articles from pipeline/.data/articles/{filename}. Returns null if missing. */
export function loadArticles<T>(filename: string): T | null {
  const path = join(ARTICLES_DIR, filename);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

/** Save data to pipeline/.data/{filename} (top-level, not articles/) */
export function saveData(filename: string, data: unknown): void {
  ensureDir(DATA_DIR);
  const path = join(DATA_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`  Saved ${path}`);
}

/** Load data from pipeline/.data/{filename}. Returns null if missing. */
export function loadData<T>(filename: string): T | null {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}
