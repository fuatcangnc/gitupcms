/**
 * Gitupcms comments: self-hosted comments for Astro sites. Everything of the plugin lives in this folder; this
 * integration adds its pages and API to the CMS (astro.config.mjs → integrations: [comments()]).
 */
import type { AstroIntegration } from "astro";

// The CMS's Comments page and its API. Gitupcms has its own admin (comments({ cmsAdmin: false })).
const CMS_ROUTES: [pattern: string, file: string][] = [
  ["/[owner]/[repo]/[branch]/comments", "./pages/admin.astro"],
  ["/api/[owner]/[repo]/[branch]/comments", "./api/admin.ts"],
];
const ROUTES: [pattern: string, file: string][] = [
  // Sites: the widget, its API, commenter sign-in and the email unsubscribe page.
  ["/comments/embed.js", "./api/embed.ts"],
  ["/api/comments/[key]/[...path]", "./api/site.ts"],
  ["/api/comments/auth/[...all]", "./api/auth.ts"],
  ["/comments/sign-in", "./pages/sign-in.astro"],
  ["/comments/signed-in", "./pages/signed-in.astro"],
  ["/comments/notifications", "./pages/notifications.astro"],
];

export default ({ cmsAdmin = true } = {}): AstroIntegration => ({
  name: "gitupcms-comments",
  hooks: {
    "astro:config:setup": ({ injectRoute }) => {
      for (const [pattern, file] of [...(cmsAdmin ? CMS_ROUTES : []), ...ROUTES]) injectRoute({ pattern, entrypoint: new URL(file, import.meta.url), prerender: false });
    },
  },
});
