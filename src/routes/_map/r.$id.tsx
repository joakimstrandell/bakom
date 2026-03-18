import { createFileRoute } from "@tanstack/react-router";
import { venueHead } from "../../lib/seo";
import restaurantData from "../../../pipeline/.data/optimized/restaurants.frontend.json";
import type { Restaurant } from "../../types";

const restaurants = restaurantData as Restaurant[];

export const Route = createFileRoute("/_map/r/$id")({
  head: ({ params }) => {
    const venue = restaurants.find((r) => r.id === params.id);
    return venueHead(venue, "restaurant");
  },
  component: () => null, // Layout handles everything
});
