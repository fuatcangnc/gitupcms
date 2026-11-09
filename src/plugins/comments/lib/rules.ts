/**
 * Comments plugin rules with no I/O: body cleanup, origin allow-list, mentions, rate limits.
 */

export const STATUSES = ["PENDING", "APPROVED", "SPAM", "DELETED"] as const;
export type CommentStatus = (typeof STATUSES)[number];
export const MAX_BODY = 5000;

/** Comments are plain text (mentions aside): HTML tags and javascript: go, 5000 characters at most. */
export const sanitizeBody = (raw: string) =>
  raw
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .trim()
    .slice(0, MAX_BODY);

/** `@username` handles in a body. */
export const mentionsOf = (body: string) => [...new Set([...body.matchAll(/@([a-z0-9]+)/g)].map((m) => m[1]))];

export const normalizeOrigin = (input: string) => {
  const raw = input.trim();
  if (raw === "*") return "*";
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).origin.toLowerCase();
  } catch {
    return raw.toLowerCase().replace(/\/+$/, "");
  }
};

const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * May a page on `origin` post comments? The site's domain and its allowed origins (`*`, `https://*.example.com`,
 * `*.example.com`) pass; with neither set, every origin does. Localhost passes in development.
 */
export const isOriginAllowed = (origin: string | null, allowed: string[], domain: string, dev = false) => {
  if (!origin) return false;
  const o = normalizeOrigin(origin);
  if (dev && LOCAL.test(o)) return true;
  const list = [...(domain.trim() ? [domain] : []), ...allowed].map((s) => s.trim()).filter(Boolean);
  if (!list.length) return true;
  return list.some((entry) => {
    if (entry === "*" || normalizeOrigin(entry) === o) return true;
    if (!entry.includes("*")) return false;
    const host = entry.replace(/\/+$/, "").replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*\\\./g, "([a-z0-9-]+\\.)+").replace(/\*/g, "[a-z0-9-]+");
    return new RegExp(`^${/^https?:\/\//i.test(entry) ? "" : "https?://"}${host}$`, "i").test(o);
  });
};

/** The origin a request comes from: Origin, else the Referer's. */
export const originOf = (headers: Headers) => {
  const origin = headers.get("origin");
  if (origin && origin !== "null") return origin;
  try {
    return new URL(headers.get("referer") ?? "").origin;
  } catch {
    return null;
  }
};

const hits = new Map<string, { count: number; resetAt: number }>();
/** Fixed-window limit per key. shortcut: in memory, per process; use a shared store when running several instances. */
export const rateLimit = (key: string, limit: number, windowMs = 60_000, now = Date.now()) => {
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    if (hits.size > 10_000) hits.clear();
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
};

export const HEX = /^#[0-9a-f]{6}$/i;

/** A commenter's @handle: their first name, lowercased, letters and digits only, numbered when taken (sam, sam2 …). */
export const uniqueUsername = (name: string, taken: (u: string) => boolean) => {
  const base = name.split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "") || "user";
  let username = base;
  for (let n = 2; taken(username); n++) username = `${base}${n}`;
  return username;
};
