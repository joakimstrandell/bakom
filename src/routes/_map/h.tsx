import { createFileRoute } from "@tanstack/react-router";
import { hotelsHead } from "../../lib/seo";

export const Route = createFileRoute("/_map/h")({
  head: () => hotelsHead(),
  component: () => null, // Layout handles everything
});
