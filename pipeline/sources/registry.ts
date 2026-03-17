/** Source registry — loads all source definitions. */

import type { SourceDefinition } from "../types.js";
import {
  whiteguideReviewSource,
  whiteguideNewsSource,
} from "./definitions/whiteguide.js";
import { dnReviewSource, dnNewsSource } from "./definitions/dn.js";
import { svdReviewSource } from "./definitions/svd.js";
import { michelinSource } from "./definitions/michelin.js";
import { diSource } from "./definitions/di.js";
import { krogguidenSource } from "./definitions/krogguiden.js";
import { falstaffSource } from "./definitions/falstaff.js";

const ALL_SOURCES: SourceDefinition[] = [
  whiteguideReviewSource,
  whiteguideNewsSource,
  dnReviewSource,
  dnNewsSource,
  svdReviewSource,
  michelinSource,
  diSource,
  krogguidenSource,
  falstaffSource,
];

/** Get all enabled source definitions */
export function getSources(): SourceDefinition[] {
  return ALL_SOURCES.filter((s) => s.enabled);
}

/** Get a source definition by ID */
export function getSource(id: string): SourceDefinition | undefined {
  return ALL_SOURCES.find((s) => s.id === id);
}

/** Get all valid source IDs */
export function getSourceIds(): string[] {
  return ALL_SOURCES.map((s) => s.id);
}
