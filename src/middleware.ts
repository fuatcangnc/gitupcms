import { defineMiddleware } from "astro:middleware";
import { adminOf, appOrigin } from "@/lib/admin";

// Open to everyone: admin sign-in, and what sites and commenters call (the widget, its API, sign-in popup).
const PUBLIC = ["/login", "/api/auth/", "/comments/", "/api/comments/", "/_astro/", "/favicon"];

export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = ctx.url.pathname;
  if (PUBLIC.some((p) => path === p || path.startsWith(p))) return next();
  const api = path.startsWith("/api/");
  // The admin API runs on the session cookie: only this app's own pages may call it.
  if (api && ctx.request.method !== "GET" && ctx.request.headers.get("origin") !== appOrigin)
    return Response.json({ error: "Cross-site request blocked." }, { status: 403 });
  const admin = await adminOf(ctx.request.headers);
  if (!admin) return api ? Response.json({ error: "Sign in first." }, { status: 401 }) : ctx.redirect("/login");
  ctx.locals.admin = admin;
  return next();
});
