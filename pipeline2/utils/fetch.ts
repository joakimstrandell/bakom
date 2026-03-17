/** HTTP fetch with retry, rate-limit handling, and timeout. */

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchOptions extends RequestInit {
  timeout?: number;
  allowStatus?: number[];
}

export async function fetchWithRetry(
  url: string,
  options?: FetchOptions,
  retries = 3,
): Promise<Response> {
  const timeout = options?.timeout ?? 30000;

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
