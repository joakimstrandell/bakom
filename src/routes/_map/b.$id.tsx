import { createFileRoute } from "@tanstack/react-router";
import { venueHead } from "../../lib/seo";
import barData from "../../../pipeline/.data/optimized/bars.frontend.json";
import type { Restaurant } from "../../types";

const bars = barData as Restaurant[];

export const Route = createFileRoute("/_map/b/$id")({
  head: ({ params }) => {
    const venue = bars.find((r) => r.id === params.id);
    return venueHead(venue, "bar");
  },
  component: () => null, // Layout handles everything
});
