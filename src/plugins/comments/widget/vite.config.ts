// Builds the comments embed (embed.ts + Tailwind) into ../embed.js (served by api/embed.ts), one self-contained IIFE.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here("."),
  publicDir: false,
  plugins: [tailwindcss()],
  build: {
    outDir: here(".."),
    emptyOutDir: false,
    lib: { entry: here("embed.ts"), formats: ["iife"], name: "GitupcmsCommentsEmbed", fileName: () => "embed.js" },
  },
});
