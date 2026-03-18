import { createFileRoute } from "@tanstack/react-router";
import { homeHead } from "../../lib/seo";

export const Route = createFileRoute("/_map/")({
  head: () => homeHead(),
  component: () => null, // Layout handles everything
});
