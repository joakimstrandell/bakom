import { createFileRoute } from "@tanstack/react-router";
import { venueHead } from "../../lib/seo";
import hotelData from "../../../pipeline/.data/optimized/hotels.frontend.json";
import type { Restaurant } from "../../types";

const hotels = hotelData as Restaurant[];

export const Route = createFileRoute("/_map/h/$id")({
  head: ({ params }) => {
    const venue = hotels.find((r) => r.id === params.id);
    return venueHead(venue, "hotel");
  },
  component: () => null, // Layout handles everything
});
