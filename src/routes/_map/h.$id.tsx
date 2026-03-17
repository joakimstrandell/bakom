import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_map/h/$id")({
  component: () => null, // Layout handles everything
});
