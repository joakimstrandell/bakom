/**
 * Shared HTTP fetch utilities and constants for all scrapers.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = join(__dirname, "..", "..", "data");
export const RAW_DIR = join(DATA_DIR, "raw");
export const KROGGUIDEN_BASE_URL = "https://www.krogguiden.se";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Extended fetch options with timeout support.
 */
export interface FetchOptions extends RequestInit {
  /** Request timeout in milliseconds. Default: 30000 (30s) */
  timeout?: number;
  /** Status codes that should not throw an error (e.g., [404] for pagination) */
  allowStatus?: number[];
}

/**
 * Fetch with automatic retry, rate-limit handling, and timeout support.
 * Extracted from the original scrape.ts.
 */
export async function fetchWithRetry(
  url: string,
  options?: FetchOptions,
  retries = 3
): Promise<Response> {
  const timeout = options?.timeout ?? 30000; // 30s default

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
          ...options?.headers,
        },
      });

      clearTimeout(timeoutId);

      if (res.ok) return res;
      // Return response for explicitly allowed status codes (e.g., 404 for pagination)
      if (options?.allowStatus?.includes(res.status)) return res;
      if (res.status === 429) {
        const backoff = (i + 1) * 5000;
        console.log(`  Rate limited, waiting ${backoff / 1000}s...`);
        await sleep(backoff);
        continue;
      }
      if (i < retries) {
        console.log(`  Retry ${i + 1} for ${url} (status ${res.status})`);
        await sleep(3000);
      }
    } catch (err) {
      clearTimeout(timeoutId);

      // Handle timeout (AbortError)
      if (err instanceof Error && err.name === "AbortError") {
        console.log(`  Timeout after ${timeout}ms for ${url}`);
        if (i < retries) {
          await sleep(3000);
          continue;
        }
        throw new Error(`Request timed out after ${timeout}ms: ${url}`);
      }

      if (i < retries) {
        console.log(`  Retry ${i + 1} for ${url} (${err})`);
        await sleep(3000);
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries + 1} attempts`);
}

/** Load a JSON file from the data directory. Returns null if file doesn't exist. */
export function loadJson<T>(filename: string): T | null {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

/** Load a JSON file from the raw data directory. Returns null if file doesn't exist. */
export function loadRawJson<T>(filename: string): T | null {
  const path = join(RAW_DIR, filename);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

/** Save a JSON file to the data directory. */
export function saveJson(filename: string, data: unknown): void {
  const path = join(DATA_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2));
}

/** Save a JSON file to the raw data directory. */
export function saveRawJson(filename: string, data: unknown): void {
  const path = join(RAW_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2));
}
