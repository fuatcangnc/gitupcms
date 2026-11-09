/**
 * The embed's API, called from the site's own pages (CORS):
 *   GET   comments?slug=          thread + widget config      POST  comments            new comment or reply
 *   PATCH comments/:id            edit / remove your own      POST  comments/:id/like   like or unlike
 *   GET   commenters?q=           mention autocomplete        PATCH me                  email notifications on/off
 *   POST  sign-out
 * Signed-in calls send `Authorization: Bearer <token>` from the sign-in popup.
 */
import type { APIRoute } from "astro";
import { HttpError } from "@/lib/github";
import { commentAuth, commenterOf, providersOf } from "@/plugins/comments/lib/auth";
import { bannedOn, createComment, originAllowed, pageComments, searchCommenters, setNotifications, siteByKey, toggleLike, updateOwnComment } from "@/plugins/comments/lib/comments";
import { originOf, rateLimit } from "@/plugins/comments/lib/rules";
import { pluginEnabled } from "@/lib/plugins";
import { BRAND } from "@/lib/brand";

const cors = (request: Request) => ({
  "Access-Control-Allow-Origin": request.headers.get("origin") || "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
});

export const OPTIONS: APIRoute = ({ request }) => new Response(null, { status: 204, headers: cors(request) });

const SUSPENDED = "Your account has been suspended on this site";

export const ALL: APIRoute = async ({ request, params, url, clientAddress }) => {
  const headers = cors(request);
  try {
    const site = siteByKey(params.key ?? "");
    if (!site || !pluginEnabled(site.owner, site.repo, "comments")) throw new HttpError("Site not found", 404);
    const path = (params.path ?? "").split("/");
    const method = request.method;
    const write = method !== "GET";
    if (write && !originAllowed(site, originOf(request.headers))) throw new HttpError("Origin not allowed", 403);
    const me = await commenterOf(request.headers);
    const signedIn = () => {
      if (!me) throw new HttpError("Unauthorized", 401);
      return me;
    };
    const notBanned = () => {
      const user = signedIn();
      if (bannedOn(site.key, user.id)) throw new HttpError(SUSPENDED, 403);
      return user;
    };
    const body = async () => (await request.json().catch(() => null)) ?? {};
    const ip = clientAddress || request.headers.get("x-forwarded-for") || "unknown";
    let data: unknown;
    let status = 200;

    if (path[0] === "comments" && path.length === 1 && method === "GET") {
      const slug = url.searchParams.get("slug");
      if (!slug) throw new HttpError("slug required", 400);
      // A banned commenter sees the thread without their pending comments, and the banner.
      const banned = me ? bannedOn(site.key, me.id) : false;
      data = {
        comments: pageComments(site.key, slug, me && !banned ? me.id : null),
        config: {
          theme: site.theme,
          primaryColor: site.primaryColor,
          radius: site.radius,
          currentUser: me ? { isBanned: banned, notificationsEnabled: me.notificationsEnabled, id: me.id, name: me.name, username: me.username, image: me.image } : undefined,
          enable: true,
          providers: providersOf(site),
          poweredByHtml: `Comments by ${BRAND.url ? `<a href="${BRAND.url}" target="_blank" rel="noopener noreferrer" class="z-footer-link">${BRAND.name}</a>` : BRAND.name}`,
        },
      };
    } else if (path[0] === "comments" && path.length === 1 && method === "POST") {
      if (!rateLimit(`post:${ip}`, 10)) throw new HttpError("Rate limit exceeded", 429);
      const user = notBanned();
      data = createComment(site, user, await body());
      status = 201;
    } else if (path[0] === "comments" && path.length === 2 && method === "PATCH") {
      data = updateOwnComment(site, notBanned().id, path[1], await body());
    } else if (path[0] === "comments" && path[2] === "like" && path.length === 3 && method === "POST") {
      if (!rateLimit(`like:${ip}`, 60)) throw new HttpError("Rate limit exceeded", 429);
      data = toggleLike(site, notBanned(), path[1]);
    } else if (path[0] === "commenters" && path.length === 1 && method === "GET") {
      const q = url.searchParams.get("q")?.trim().slice(0, 50) ?? "";
      data = { commenters: q ? searchCommenters(site.key, q) : [] };
    } else if (path[0] === "me" && path.length === 1 && method === "PATCH") {
      const { notificationsEnabled } = await body();
      if (typeof notificationsEnabled !== "boolean") throw new HttpError("notificationsEnabled must be true or false", 422);
      setNotifications(signedIn().id, notificationsEnabled);
      data = { ok: true };
    } else if (path[0] === "sign-out" && path.length === 1 && method === "POST") {
      if (me) await commentAuth.api.signOut({ headers: request.headers }).catch(() => null);
      data = { ok: true };
    } else throw new HttpError("Not found", 404);

    return Response.json(data, { status, headers });
  } catch (error: any) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(error);
    return Response.json({ error: status === 500 ? "Something went wrong." : error.message }, { status, headers });
  }
};
