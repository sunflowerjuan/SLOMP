import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

// Cache policy of the built site, the same one scripts/deploy-static.sh sets
// on the Storage static website: files under /assets/ carry a content hash in
// their name, so they never change and can be kept for a year; everything else
// (index.html first of all) is revalidated, so a new release shows up at once.
// `vite preview` applies it here so it can be checked locally
// (scripts/check-cache.sh).
export const ASSETS_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const REVALIDATE_CACHE_CONTROL = "no-cache";

function cachePolicy(): Plugin {
  return {
    name: "cache-policy",
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? "").split("?")[0];
        response.setHeader(
          "Cache-Control",
          path.startsWith("/assets/")
            ? ASSETS_CACHE_CONTROL
            : REVALIDATE_CACHE_CONTROL,
        );
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cachePolicy()],
});
