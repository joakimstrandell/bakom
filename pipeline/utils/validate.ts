/**
 * Input validation and data quality metrics for restaurant data.
 */

// Stockholm region coordinate bounds (approximate)
const STOCKHOLM_BOUNDS = {
  latMin: 59.0,
  latMax: 59.6,
  lngMin: 17.5,
  lngMax: 18.5,
};

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface QualityMetrics {
  total: number;
  withName: number;
  withAddress: number;
  withValidCoords: number;
  withPhone: number;
  withWebsite: number;
  withHours: number;
  coordsOutOfBounds: number;
  missingRequired: number;
}

/**
 * Validate a single restaurant record.
 */
export function validateRestaurant(
  record: {
    name?: string;
    address?: string;
    lat?: number | null;
    lng?: number | null;
    phone?: string;
    website?: string;
  },
  source: string
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!record.name?.trim()) {
    errors.push(`[${source}] Missing required field: name`);
  }

  if (!record.address?.trim()) {
    warnings.push(`[${source}] Missing address for: ${record.name}`);
  }

  // Coordinate validation
  if (
    record.lat !== null &&
    record.lat !== undefined &&
    record.lng !== null &&
    record.lng !== undefined
  ) {
    const lat = record.lat;
    const lng = record.lng;

    // Check if coordinates are valid numbers
    if (isNaN(lat) || isNaN(lng)) {
      errors.push(`[${source}] Invalid coordinates for ${record.name}: NaN`);
    }
    // Check if within Stockholm bounds
    else if (
      lat < STOCKHOLM_BOUNDS.latMin ||
      lat > STOCKHOLM_BOUNDS.latMax ||
      lng < STOCKHOLM_BOUNDS.lngMin ||
      lng > STOCKHOLM_BOUNDS.lngMax
    ) {
      warnings.push(
        `[${source}] Coordinates outside Stockholm for ${record.name}: ` +
          `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      );
    }
  }

  // Phone validation (basic Swedish format check)
  if (record.phone && !/^[\d\s\-+()]+$/.test(record.phone)) {
    warnings.push(
      `[${source}] Unusual phone format for ${record.name}: ${record.phone}`
    );
  }

  // Website validation
  if (record.website && !record.website.startsWith("http")) {
    warnings.push(
      `[${source}] Invalid website for ${record.name}: ${record.website}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Calculate quality metrics for a set of restaurant records.
 */
export function calculateQualityMetrics<
  T extends {
    name?: string;
    address?: string;
    lat?: number | null;
    lng?: number | null;
    phone?: string;
    website?: string;
    hours?: unknown[];
  }
>(records: T[]): QualityMetrics {
  const metrics: QualityMetrics = {
    total: records.length,
    withName: 0,
    withAddress: 0,
    withValidCoords: 0,
    withPhone: 0,
    withWebsite: 0,
    withHours: 0,
    coordsOutOfBounds: 0,
    missingRequired: 0,
  };

  for (const r of records) {
    if (r.name?.trim()) metrics.withName++;
    else metrics.missingRequired++;

    if (r.address?.trim()) metrics.withAddress++;
    if (r.phone?.trim()) metrics.withPhone++;
    if (r.website?.trim()) metrics.withWebsite++;
    if (r.hours && r.hours.length > 0) metrics.withHours++;

    if (r.lat != null && r.lng != null && !isNaN(r.lat) && !isNaN(r.lng)) {
      if (
        r.lat >= STOCKHOLM_BOUNDS.latMin &&
        r.lat <= STOCKHOLM_BOUNDS.latMax &&
        r.lng >= STOCKHOLM_BOUNDS.lngMin &&
        r.lng <= STOCKHOLM_BOUNDS.lngMax
      ) {
        metrics.withValidCoords++;
      } else {
        metrics.coordsOutOfBounds++;
      }
    }
  }

  return metrics;
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

/**
 * Print quality metrics report to console.
 */
export function printQualityReport(
  metrics: QualityMetrics,
  label: string
): void {
  console.log(`\n=== Quality Report: ${label} ===`);
  console.log(`  Total records: ${metrics.total}`);
  console.log(
    `  With name: ${metrics.withName} (${pct(metrics.withName, metrics.total)})`
  );
  console.log(
    `  With address: ${metrics.withAddress} (${pct(metrics.withAddress, metrics.total)})`
  );
  console.log(
    `  With valid coords: ${metrics.withValidCoords} (${pct(metrics.withValidCoords, metrics.total)})`
  );
  console.log(
    `  With phone: ${metrics.withPhone} (${pct(metrics.withPhone, metrics.total)})`
  );
  console.log(
    `  With website: ${metrics.withWebsite} (${pct(metrics.withWebsite, metrics.total)})`
  );
  console.log(
    `  With hours: ${metrics.withHours} (${pct(metrics.withHours, metrics.total)})`
  );

  if (metrics.coordsOutOfBounds > 0) {
    console.log(`  Coords outside Stockholm: ${metrics.coordsOutOfBounds}`);
  }
  if (metrics.missingRequired > 0) {
    console.log(`  Missing required fields: ${metrics.missingRequired}`);
  }
}
