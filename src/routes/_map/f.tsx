import { createFileRoute } from "@tanstack/react-router";
import { listingHead } from "../../lib/seo";

export const Route = createFileRoute("/_map/f")({
  head: () => listingHead("fika"),
  component: () => null, // Layout handles everything
});
