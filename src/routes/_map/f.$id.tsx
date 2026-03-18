import { createFileRoute } from "@tanstack/react-router";
import { venueHead } from "../../lib/seo";
import fikaData from "../../../pipeline/.data/fika.frontend.json";
import type { Restaurant } from "../../types";

const fika = fikaData as Restaurant[];

export const Route = createFileRoute("/_map/f/$id")({
  head: ({ params }) => {
    const venue = fika.find((r) => r.id === params.id);
    return venueHead(venue, "fika");
  },
  component: () => null, // Layout handles everything
});
