import { createFileRoute } from "@tanstack/react-router";
import { listingHead } from "../../lib/seo";

export const Route = createFileRoute("/_map/b")({
  head: () => listingHead("bars"),
  component: () => null, // Layout handles everything
});
