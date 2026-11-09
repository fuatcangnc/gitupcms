import type { APIRoute } from "astro";
import { ensureSite, siteByRepo } from "@/plugins/comments/lib/comments";
import { OWNER, slug } from "@/lib/sites";

/** { name, domain } → a new site; returns its key. */
export const POST: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => ({}));
  const name = slug(body.name);
  const domain = String(body.domain ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
  if (!name) return Response.json({ error: "Give the site a name." }, { status: 400 });
  if (domain && !/^[a-z0-9.:-]+$/.test(domain)) return Response.json({ error: "Invalid domain: use example.com." }, { status: 400 });
  if (siteByRepo(OWNER, name)) return Response.json({ error: `There is already a site called ${name}.` }, { status: 409 });
  return Response.json({ data: { key: ensureSite(OWNER, name, { domain, notifyEmail: locals.admin.email }).key } });
};
