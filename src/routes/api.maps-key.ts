import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/maps-key")({
  server: {
    handlers: {
      GET: () => {
        const key =
          process.env.GOOGLE_MAPS_BROWSER_KEY ||
          process.env.GOOGLE_MAPS_API_KEY ||
          process.env.GOOGLE_API_KEY ||
          process.env.GOOGLE_PLACES_API_KEY;
        if (!key) {
          return new Response(JSON.stringify({ error: "Maps key not configured." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ key }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=300",
          },
        });
      },
    },
  },
});
