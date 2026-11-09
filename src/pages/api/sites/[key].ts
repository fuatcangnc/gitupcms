import type { APIRoute } from "astro";
import { HttpError } from "@/lib/github";
import { siteByKey } from "@/plugins/comments/lib/comments";
import { runAction } from "@/plugins/comments/lib/admin";
import { OWNER } from "@/lib/sites";

/** { action, ... } for a site's admin panel (plugins/comments/lib/admin.ts). The one admin may do everything. */
export const POST: APIRoute = async ({ request, params, locals }) => {
  try {
    const cs = siteByKey(params.key ?? "");
    if (!cs || cs.owner !== OWNER) throw new HttpError("Site not found.", 404);
    const body = await request.json();
    return Response.json({ data: await runAction(cs, String(body.action ?? ""), body, { email: locals.admin.email, confirm: cs.repo }) });
  } catch (error: any) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(error);
    return Response.json({ error: status === 500 ? "Something went wrong." : error.message }, { status });
  }
};
