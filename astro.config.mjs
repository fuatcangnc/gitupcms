import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import comments from "./src/plugins/comments/index.ts";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  // The widget, its API and commenter sign-in; the admin pages live in src/pages.
  integrations: [react(), comments({ cmsAdmin: false })],
  vite: {
    plugins: [tailwindcss()],
    ssr: { external: ["better-sqlite3"] },
  },
});
