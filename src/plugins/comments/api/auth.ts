import type { APIRoute } from "astro";
import { commentAuth, siteAuth } from "@/plugins/comments/lib/auth";
import { siteByKey } from "@/plugins/comments/lib/comments";

// Commenter sign-in (OAuth start and callback, session, sign-out). s/<key>/… is a site with its own OAuth apps.
export const ALL: APIRoute = ({ request, params }) => {
  const [first, key] = (params.all ?? "").split("/");
  if (first !== "s") return commentAuth.handler(request);
  const site = siteByKey(key ?? "");
  return site && Object.keys(site.oauth).length ? siteAuth(site).handler(request) : new Response("Not found", { status: 404 });
};
