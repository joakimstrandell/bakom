/**
 * Concurrency limiter for parallel processing with rate limiting.
 * No external dependencies.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ConcurrencyOptions {
  /** Maximum concurrent operations */
  concurrency: number;
  /** Minimum delay between starting operations (ms) */
  minDelay?: number;
}

/**
 * Process items in parallel with concurrency limits.
 * Maintains order of results.
 *
 * @param items - Items to process
 * @param fn - Async function to process each item
 * @param options - Concurrency options
 * @returns Array of results in same order as input
 */
export async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: ConcurrencyOptions
): Promise<R[]> {
  const { concurrency, minDelay = 0 } = options;
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let lastStartTime = 0;
  const lock = { acquiring: false };

  async function acquireSlot(): Promise<number> {
    // Simple mutex to prevent race conditions on nextIndex
    while (lock.acquiring) {
      await sleep(10);
    }
    lock.acquiring = true;

    const index = nextIndex++;

    // Enforce minimum delay between starts
    if (minDelay > 0 && index < items.length) {
      const now = Date.now();
      const elapsed = now - lastStartTime;
      if (elapsed < minDelay) {
        await sleep(minDelay - elapsed);
      }
      lastStartTime = Date.now();
    }

    lock.acquiring = false;
    return index;
  }

  async function worker(): Promise<void> {
    while (true) {
      const index = await acquireSlot();
      if (index >= items.length) break;

      results[index] = await fn(items[index], index);
    }
  }

  // Start workers up to concurrency limit
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}

/**
 * Process items in batches with progress callback and periodic saves.
 *
 * @param items - Items to process
 * @param fn - Async function to process each item
 * @param options - Options including concurrency, progress callback, and save interval
 * @returns Array of results (excluding nulls if filtered)
 */
export async function batchProcess<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: ConcurrencyOptions & {
    onProgress?: (completed: number, total: number) => void;
    saveInterval?: number;
    onSave?: (completed: number) => void;
  }
): Promise<R[]> {
  const { onProgress, saveInterval = 50, onSave, ...concurrencyOpts } = options;
  let completed = 0;

  const wrappedFn = async (item: T, index: number): Promise<R> => {
    const result = await fn(item, index);
    completed++;

    if (onProgress) {
      onProgress(completed, items.length);
    }

    // Periodic save
    if (onSave && completed % saveInterval === 0) {
      onSave(completed);
    }

    return result;
  };

  return parallelMap(items, wrappedFn, concurrencyOpts);
}
