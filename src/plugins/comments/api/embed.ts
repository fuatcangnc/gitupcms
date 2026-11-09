import type { APIRoute } from "astro";
import code from "../embed.js?raw";

// The widget sites load with <script src="<CMS>/comments/embed.js">.
export const GET: APIRoute = () =>
  new Response(code, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" } });
