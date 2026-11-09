/**
 * Comments plugin data: sites, pages, comments, likes, bans and the moderation log, all in this CMS's SQLite database.
 * Public reads never include emails or the body of a removed comment.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { db } from "../../../lib/db";
import "./schema";
import { callbackUrl, commentAuth, serverHas, type OAuthApps, type Provider } from "./auth";
import { HttpError } from "../../../lib/github";
import { decrypt, encrypt } from "../../../lib/integrations";
import { sendEmail } from "../../../lib/email";
import { sendSmtp } from "../../../lib/smtp";
import { BRAND } from "../../../lib/brand";
import { EMAIL_DEFAULTS, likeEmail, newCommentEmail, replyEmail, truncate, type Branding } from "./mail";
import { HEX, isOriginAllowed, mentionsOf, sanitizeBody, STATUSES, type CommentStatus } from "./rules";

void commentAuth; // its migrations create the commenter table the queries join.

const env = (name: string) => process.env[name] ?? import.meta.env?.[name];
export const appUrl = () => (env("BETTER_AUTH_URL") || "http://localhost:4321").replace(/\/+$/, "");
const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());

// ─── Sites ──────────────────────────────────────────────────────────────────

type SiteRow = Record<string, any>;
export type CommentSite = ReturnType<typeof siteOf>;
const siteOf = (r: SiteRow) => ({
  key: r.key as string,
  owner: r.owner as string,
  repo: r.repo as string,
  domain: r.domain as string,
  allowedOrigins: JSON.parse(r.allowed_origins) as string[],
  autoApprove: !!r.auto_approve,
  theme: r.theme as "AUTO" | "LIGHT" | "DARK",
  primaryColor: r.primary_color as string,
  radius: r.radius as number,
  emailEnabled: !!r.email_enabled,
  likeLimit: r.like_limit as number,
  subjectPrefix: r.subject_prefix as string | null,
  logoUrl: r.logo_url as string | null,
  accentColor: r.accent_color as string | null,
  footerText: r.footer_text as string | null,
  notifyEmail: r.notify_email as string | null,
  smtpHost: r.smtp_host as string | null,
  smtpPort: r.smtp_port as number | null,
  smtpUser: r.smtp_user as string | null,
  smtpPass: r.smtp_pass as string | null,
  smtpFrom: r.smtp_from as string | null,
  oauth: (r.oauth ? JSON.parse(decrypt(r.oauth)) : {}) as OAuthApps,
});

export const siteByKey = (key: string) => {
  const row = db.prepare("SELECT * FROM comment_site WHERE key = ?").get(key) as SiteRow | undefined;
  return row ? siteOf(row) : null;
};
export const siteByRepo = (owner: string, repo: string) => {
  const row = db.prepare("SELECT * FROM comment_site WHERE owner = ? AND repo = ?").get(owner, repo) as SiteRow | undefined;
  return row ? siteOf(row) : null;
};
/** Created when the plugin is first switched on; the domain and notification email start from the repo and the admin. */
export const ensureSite = (owner: string, repo: string, defaults: { domain: string; notifyEmail: string }) => {
  const found = siteByRepo(owner, repo);
  if (found) return found;
  db.prepare("INSERT INTO comment_site (key, owner, repo, domain, notify_email) VALUES (?, ?, ?, ?, ?)").run(randomBytes(12).toString("base64url"), owner, repo, defaults.domain, defaults.notifyEmail);
  return siteByRepo(owner, repo)!;
};

/** The settings form: the SMTP password is never sent back, only whether one is saved. */
export const publicSettings = (s: CommentSite) => ({
  ...s,
  smtpPass: undefined,
  hasSmtpPass: !!s.smtpPass,
  oauth: undefined,
  signIn: (["google", "github"] as const).map((p) => ({ provider: p, clientId: s.oauth[p]?.clientId ?? "", hasSecret: !!s.oauth[p], callbackUrl: callbackUrl(p, s.key), server: serverHas(p), serverCallbackUrl: callbackUrl(p) })),
});

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const bad = (message: string) => new HttpError(message, 400);

/** Saves the fields present in `input`; `email` says whether the email fields may change too. */
export const saveSettings = (site: CommentSite, input: Record<string, any>) => {
  const set: Record<string, unknown> = {};
  if ("domain" in input) {
    const d = str(input.domain, 253) ?? "";
    if (d && !/^[a-z0-9.:/-]+$/i.test(d)) throw bad("Invalid domain.");
    set.domain = d;
  }
  if ("allowedOrigins" in input) {
    if (!Array.isArray(input.allowedOrigins) || input.allowedOrigins.length > 100) throw bad("Invalid allowed origins.");
    const list = input.allowedOrigins.map((o: unknown) => String(o).trim().replace(/\/+$/, "")).filter(Boolean);
    for (const o of list) if (o !== "*" && !/^(https?:\/\/)?[a-z0-9*.-]+(:\d+)?$/i.test(o)) throw bad(`"${o}" is not an origin (https://example.com, *.example.com or *).`);
    set.allowed_origins = JSON.stringify(list);
  }
  if ("autoApprove" in input) set.auto_approve = input.autoApprove ? 1 : 0;
  if ("theme" in input) {
    if (!["AUTO", "LIGHT", "DARK"].includes(input.theme)) throw bad("Invalid theme.");
    set.theme = input.theme;
  }
  if ("primaryColor" in input) {
    if (!HEX.test(input.primaryColor)) throw bad("The primary color must be a 6-digit hex color.");
    set.primary_color = input.primaryColor;
  }
  if ("radius" in input) {
    const r = Number(input.radius);
    if (!Number.isInteger(r) || r < 0 || r > 24) throw bad("The radius must be 0 to 24.");
    set.radius = r;
  }
  if ("emailEnabled" in input) set.email_enabled = input.emailEnabled ? 1 : 0;
  if ("likeLimit" in input) {
    const n = Number(input.likeLimit);
    if (!Number.isInteger(n) || n < 0 || n > 100) throw bad("The like notification limit must be 0 to 100.");
    set.like_limit = n;
  }
  if ("subjectPrefix" in input) set.subject_prefix = str(input.subjectPrefix, 50);
  if ("logoUrl" in input) {
    const u = str(input.logoUrl, 2000);
    if (u && !/^https:\/\//i.test(u)) throw bad("The logo must be an https:// URL.");
    set.logo_url = u;
  }
  if ("accentColor" in input) {
    const c = str(input.accentColor, 7);
    if (c && !HEX.test(c)) throw bad("The accent color must be a 6-digit hex color.");
    set.accent_color = c;
  }
  if ("footerText" in input) set.footer_text = str(input.footerText, 300);
  for (const [field, column] of [["notifyEmail", "notify_email"], ["smtpFrom", "smtp_from"]] as const)
    if (field in input) {
      const e = str(input[field], 255);
      if (e && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e)) throw bad(`"${e}" is not an email address.`);
      set[column] = e;
    }
  if ("smtpHost" in input) set.smtp_host = str(input.smtpHost, 253);
  if ("smtpPort" in input) {
    const p = input.smtpPort === null || input.smtpPort === "" ? null : Number(input.smtpPort);
    if (p !== null && (!Number.isInteger(p) || p < 1 || p > 65535)) throw bad("Invalid SMTP port.");
    set.smtp_port = p;
  }
  if ("smtpUser" in input) set.smtp_user = str(input.smtpUser, 255);
  // An empty password keeps the saved one; `clearSmtpPass` removes it.
  if (input.clearSmtpPass) set.smtp_pass = null;
  else if (str(input.smtpPass, 255)) set.smtp_pass = encrypt(input.smtpPass);
  // Sign-in apps: { google: { clientId, clientSecret } | null }; an empty secret keeps the saved one, null removes the app.
  if (input.signIn && typeof input.signIn === "object") {
    const apps: OAuthApps = { ...site.oauth };
    for (const p of ["google", "github"] as Provider[]) {
      if (!(p in input.signIn)) continue;
      const v = input.signIn[p];
      if (v === null) delete apps[p];
      else {
        const clientId = str(v?.clientId, 300);
        const clientSecret = str(v?.clientSecret, 300) ?? apps[p]?.clientSecret ?? null;
        if (!clientId && !str(v?.clientSecret, 300)) delete apps[p];
        else if (!clientId || !clientSecret || /\s/.test(clientId + clientSecret)) throw bad(`${p === "google" ? "Google" : "GitHub"} sign-in needs both a client ID and a client secret.`);
        else apps[p] = { clientId, clientSecret };
      }
    }
    set.oauth = Object.keys(apps).length ? encrypt(JSON.stringify(apps)) : null;
  }
  const cols = Object.keys(set);
  if (cols.length) db.prepare(`UPDATE comment_site SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE key = ?`).run(...cols.map((c) => set[c]), site.key);
  return siteByKey(site.key)!;
};

export const originAllowed = (site: CommentSite, origin: string | null) => isOriginAllowed(origin, site.allowedOrigins, site.domain, !!import.meta.env?.DEV);

// ─── Public (embed) ─────────────────────────────────────────────────────────

const isBanned = db.prepare("SELECT 1 FROM comment_ban WHERE site_key = ? AND commenter_id = ?");
export const bannedOn = (key: string, commenterId: string) => !!isBanned.get(key, commenterId);

type PublicComment = {
  id: string;
  body: string;
  status: CommentStatus;
  createdAt: string;
  editedAt: string | null;
  likeCount: number;
  hasLiked: boolean;
  parentId: string | null;
  commenter: { id: string; name: string; username: string; image: string | null };
  banned?: boolean;
  replies: PublicComment[];
};

const SELECT_PUBLIC = `SELECT c.id, c.body, c.status, c.created_at, c.edited_at, c.parent_id, c.commenter_id, u.name, u.username, u.image,
  (SELECT COUNT(*) FROM comment_like l WHERE l.comment_id = c.id) AS likes,
  EXISTS (SELECT 1 FROM comment_like l WHERE l.comment_id = c.id AND l.commenter_id = @viewer) AS liked,
  EXISTS (SELECT 1 FROM comment_ban b WHERE b.site_key = @key AND b.commenter_id = c.commenter_id) AS banned
  FROM comment c JOIN comment_page p ON p.id = c.page_id JOIN commenter u ON u.id = c.commenter_id`;

const publicOf = (r: any): PublicComment => ({
  id: r.id,
  // A removed comment keeps its place in the thread, not its words.
  body: r.status === "DELETED" ? "" : r.body,
  status: r.status,
  createdAt: iso(r.created_at)!,
  editedAt: iso(r.edited_at),
  likeCount: r.likes,
  hasLiked: !!r.liked,
  parentId: r.parent_id,
  commenter: { id: r.commenter_id, name: r.name, username: r.username, image: r.image ?? null },
  banned: r.status === "DELETED" ? !!r.banned : undefined,
  replies: [],
});

/** A page's thread: approved and removed comments, plus the viewer's own pending ones. Newest first, replies oldest first. */
export const pageComments = (key: string, slug: string, viewer: string | null) => {
  const rows = db
    .prepare(`${SELECT_PUBLIC} WHERE p.site_key = @key AND p.slug = @slug AND (c.status IN ('APPROVED', 'DELETED') OR (c.status = 'PENDING' AND c.commenter_id = @viewer)) ORDER BY c.created_at`)
    .all({ key, slug, viewer: viewer ?? "" })
    .map(publicOf);
  const tops = rows.filter((c) => !c.parentId);
  const byId = new Map(tops.map((c) => [c.id, c]));
  for (const r of rows) if (r.parentId) byId.get(r.parentId)?.replies.push(r);
  return tops.reverse();
};

const oneComment = (key: string, id: string, viewer: string) => publicOf(db.prepare(`${SELECT_PUBLIC} WHERE c.id = @id`).get({ key, id, viewer }));

const commentSite = db.prepare("SELECT c.*, p.site_key, p.slug, p.url FROM comment c JOIN comment_page p ON p.id = c.page_id WHERE c.id = ?");
const commentIn = (key: string, id: string) => {
  const row = commentSite.get(id) as any;
  if (!row || row.site_key !== key) throw new HttpError("Comment not found", 404);
  return row;
};

export type CreateInput = { body: unknown; slug: unknown; url?: unknown; parentId?: unknown; replyToId?: unknown };

export const createComment = (site: CommentSite, commenter: { id: string; name: string; email: string }, input: CreateInput) => {
  const body = typeof input.body === "string" ? sanitizeBody(input.body) : "";
  if (!body) throw bad("Comment body is empty");
  const slug = str(input.slug, 500);
  if (!slug) throw bad("slug required");
  let url = str(input.url, 2000);
  // The page URL goes into notification emails, so it must be on the site.
  try {
    if (url && !originAllowed(site, new URL(url).origin)) url = null;
  } catch {
    url = null;
  }
  const now = Date.now();
  db.prepare("INSERT INTO comment_page (id, site_key, slug, url, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (site_key, slug) DO UPDATE SET url = COALESCE(excluded.url, url)").run(randomUUID(), site.key, slug, url, now);
  const page = db.prepare("SELECT id, slug, url FROM comment_page WHERE site_key = ? AND slug = ?").get(site.key, slug) as { id: string; slug: string; url: string | null };

  // Threads are two levels deep: a reply to a reply joins its top-level comment.
  let parent = typeof input.parentId === "string" && input.parentId ? commentIn(site.key, input.parentId) : null;
  if (parent && parent.page_id !== page.id) throw bad("The parent comment is on another page.");
  if (parent?.parent_id) parent = commentIn(site.key, parent.parent_id);
  const replyTo = typeof input.replyToId === "string" && input.replyToId ? commentIn(site.key, input.replyToId) : null;

  const id = randomUUID();
  db.prepare("INSERT INTO comment (id, page_id, parent_id, commenter_id, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, page.id, parent?.id ?? null, commenter.id, body, site.autoApprove ? "APPROVED" : "PENDING", now, now);
  void notifyCreated(site, { id, body, parentId: parent?.id ?? null }, commenter, page, parent, replyTo).catch((e) => console.error("[comments] notification failed:", e));
  return oneComment(site.key, id, commenter.id);
};

/** The owner's own edit or removal (`{ body }` or `{ status: "DELETED" }`). */
export const updateOwnComment = (site: CommentSite, commenterId: string, id: string, input: { body?: unknown; status?: unknown }) => {
  const row = commentIn(site.key, id);
  if (row.commenter_id !== commenterId) throw new HttpError("Forbidden", 403);
  if (input.body !== undefined) {
    const body = typeof input.body === "string" ? sanitizeBody(input.body) : "";
    if (!body) throw bad("Comment body is empty");
    db.prepare("UPDATE comment SET body = ?, edited_at = ?, updated_at = ? WHERE id = ?").run(body, Date.now(), Date.now(), id);
  } else if (input.status === "DELETED") db.prepare("UPDATE comment SET status = 'DELETED', updated_at = ? WHERE id = ?").run(Date.now(), id);
  else throw bad("Invalid update");
  return oneComment(site.key, id, commenterId);
};

export const toggleLike = (site: CommentSite, liker: { id: string }, id: string) => {
  const row = commentIn(site.key, id);
  const removed = db.prepare("DELETE FROM comment_like WHERE comment_id = ? AND commenter_id = ?").run(id, liker.id).changes;
  if (!removed) db.prepare("INSERT INTO comment_like (comment_id, commenter_id, created_at) VALUES (?, ?, ?)").run(id, liker.id, Date.now());
  const count = (db.prepare("SELECT COUNT(*) AS n FROM comment_like WHERE comment_id = ?").get(id) as { n: number }).n;
  // One email per new like count, up to the site's limit, never for liking your own comment.
  if (!removed && row.commenter_id !== liker.id && site.likeLimit > 0 && count > row.like_notified && count <= site.likeLimit) {
    db.prepare("UPDATE comment SET like_notified = ? WHERE id = ?").run(count, id);
    const author = commenterById(row.commenter_id);
    if (author) void notifyLike(site, row, author, count).catch((e) => console.error("[comments] like notification failed:", e));
  }
  return { liked: !removed, count };
};

/** Mention autocomplete: people who commented on this site, by username prefix. */
export const searchCommenters = (key: string, q: string, limit = 3) =>
  db
    .prepare(
      `SELECT u.id, u.name, u.username, u.image FROM commenter u WHERE u.username LIKE ? ESCAPE '\\' AND EXISTS (SELECT 1 FROM comment c JOIN comment_page p ON p.id = c.page_id WHERE p.site_key = ? AND c.commenter_id = u.id) ORDER BY u.username LIMIT ?`,
    )
    .all(`${q.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`, key, limit);

export const setNotifications = (commenterId: string, enabled: boolean) => void db.prepare('UPDATE commenter SET "notificationsEnabled" = ? WHERE id = ?').run(enabled ? 1 : 0, commenterId);

/** Unsubscribe links: the token in the email, no sign-in. */
export const setNotificationsByToken = (token: string, enabled: boolean) => db.prepare('UPDATE commenter SET "notificationsEnabled" = ? WHERE "notificationToken" = ?').run(enabled ? 1 : 0, token).changes > 0;

// ─── Notifications ──────────────────────────────────────────────────────────

type Person = { id: string; name: string; email: string; notificationsEnabled: number; notificationToken: string };
const commenterById = (id: string) => db.prepare('SELECT id, name, email, "notificationsEnabled", "notificationToken" FROM commenter WHERE id = ?').get(id) as Person | undefined;

const brandingOf = (site: CommentSite): Branding => ({
  accentColor: site.accentColor ?? EMAIL_DEFAULTS.accentColor,
  logoUrl: site.logoUrl,
  footerText: site.footerText ?? EMAIL_DEFAULTS.footerText,
  siteUrl: site.domain ? `https://${site.domain.replace(/^https?:\/\//, "")}` : null,
});
const prefix = (site: CommentSite) => site.subjectPrefix ?? EMAIL_DEFAULTS.subjectPrefix;
const viewUrl = (site: CommentSite, page: { slug: string; url: string | null }, id: string) =>
  `${page.url ?? `${brandingOf(site).siteUrl ?? ""}${page.slug.startsWith("/") ? "" : "/"}${page.slug}`}#comment-${id}`;
const unsubscribeUrl = (token: string) => `${appUrl()}/comments/notifications?token=${encodeURIComponent(token)}`;

/** The site's SMTP server when set up, else the CMS's own email (Resend, or the console in development). */
const deliver = async (site: CommentSite, to: string, subject: string, html: string) => {
  if (!site.emailEnabled) return;
  if (site.smtpHost && site.smtpUser && site.smtpPass) {
    const from = site.smtpFrom ?? (site.smtpUser.includes("@") ? site.smtpUser : "noreply@example.com");
    await sendSmtp({ host: site.smtpHost, port: site.smtpPort ?? 465, user: site.smtpUser, pass: decrypt(site.smtpPass) }, { from, fromName: `${BRAND.name} Comments`, to, subject, html });
  } else await sendEmail({ to, subject, text: subject, html });
};

const notifyCreated = async (
  site: CommentSite,
  comment: { id: string; body: string; parentId: string | null },
  author: { id: string; name: string; email: string },
  page: { slug: string; url: string | null },
  parent: any,
  replyTo: any,
) => {
  if (!site.emailEnabled) return;
  const b = brandingOf(site);
  const notified = new Set([author.email]);
  const parentAuthor = parent ? commenterById(parent.commenter_id) : undefined;
  // A reply straight to the site owner sends them the reply email instead.
  if (site.notifyEmail && parentAuthor?.email !== site.notifyEmail && !notified.has(site.notifyEmail)) {
    const own = db.prepare('SELECT "notificationsEnabled" AS on_ FROM commenter WHERE email = ?').get(site.notifyEmail) as { on_: number } | undefined;
    if (own?.on_ !== 0) {
      notified.add(site.notifyEmail);
      await deliver(site, site.notifyEmail, `${prefix(site)} ${author.name} commented on "${page.slug}"`, newCommentEmail(b, { commenterName: author.name, pageTitle: page.slug, commentBody: truncate(comment.body, 200), viewUrl: viewUrl(site, page, comment.id) }));
    }
  }
  const reply = async (target: { id: string; body: string }, person: Person | undefined) => {
    if (!person || notified.has(person.email) || person.id === author.id) return;
    notified.add(person.email);
    if (!person.notificationsEnabled) return;
    await deliver(
      site,
      person.email,
      `${prefix(site)} Someone replied to your comment on "${page.slug}"`,
      replyEmail(b, { replierName: author.name, pageTitle: page.slug, originalBody: truncate(target.body, 150), replyBody: truncate(comment.body, 200), viewUrl: viewUrl(site, page, comment.id), unsubscribeUrl: unsubscribeUrl(person.notificationToken) }),
    );
  };
  if (parent) await reply(parent, parentAuthor);
  // The exact comment the reply was written to, when the embed folded a reply-to-a-reply into the thread.
  if (replyTo) await reply(replyTo, commenterById(replyTo.commenter_id));
  // Others in the thread named with @username.
  const names = comment.parentId ? mentionsOf(comment.body) : [];
  if (names.length) {
    const rows = db
      .prepare(`SELECT c.id, c.body, c.commenter_id FROM comment c JOIN commenter u ON u.id = c.commenter_id WHERE c.parent_id = ? AND u.username IN (${names.map(() => "?").join(",")}) ORDER BY c.created_at DESC`)
      .all(comment.parentId, ...names) as { id: string; body: string; commenter_id: string }[];
    for (const r of rows) await reply(r, commenterById(r.commenter_id));
  }
};

const notifyLike = async (site: CommentSite, row: any, author: Person, count: number) => {
  if (!site.emailEnabled || !author.notificationsEnabled) return;
  const page = { slug: row.slug, url: row.url };
  await deliver(
    site,
    author.email,
    `${prefix(site)} Your comment received ${count} ${count === 1 ? "like" : "likes"} on "${row.slug}"`,
    likeEmail(brandingOf(site), { pageTitle: row.slug, commentBody: truncate(row.body, 200), viewUrl: viewUrl(site, page, row.id), likeCount: count, unsubscribeUrl: unsubscribeUrl(author.notificationToken) }),
  );
};

export const emailPreview = (site: CommentSite, type: "new-comment" | "reply" | "like") => {
  const b = brandingOf(site);
  const url = b.siteUrl ?? "#";
  const first = "This is a great tool! I've been looking for something like this for a while.";
  if (type === "new-comment") return newCommentEmail(b, { commenterName: "Jane Smith", pageTitle: "getting-started", commentBody: first, viewUrl: url });
  if (type === "like") return likeEmail(b, { pageTitle: "getting-started", commentBody: first, viewUrl: url, likeCount: 3, unsubscribeUrl: "#" });
  return replyEmail(b, { replierName: "John Doe", pageTitle: "getting-started", originalBody: first, replyBody: "Totally agree! The setup was really simple too.", viewUrl: url, unsubscribeUrl: "#" });
};

/** Test email from the settings form, to the admin. */
export const sendTestEmail = (site: CommentSite, to: string) => deliver({ ...site, emailEnabled: true }, to, `${prefix(site)} Test email`, emailPreview(site, "new-comment"));

// ─── Admin ──────────────────────────────────────────────────────────────────

const ADMIN_SELECT = `SELECT c.id, c.body, c.status, c.created_at, c.edited_at, c.parent_id, p.slug, p.url, u.id AS commenter_id, u.name, u.email, u.username, u.image,
  (SELECT COUNT(*) FROM comment r WHERE r.parent_id = c.id) AS replies,
  (SELECT COUNT(*) FROM comment_like l WHERE l.comment_id = c.id) AS likes
  FROM comment c JOIN comment_page p ON p.id = c.page_id JOIN commenter u ON u.id = c.commenter_id`;
const adminOf = (r: any) => ({
  id: r.id,
  body: r.body,
  status: r.status as CommentStatus,
  createdAt: iso(r.created_at)!,
  editedAt: iso(r.edited_at),
  parentId: r.parent_id as string | null,
  page: { slug: r.slug as string, url: r.url as string | null },
  commenter: { id: r.commenter_id as string, name: r.name as string, email: r.email as string, username: r.username as string, image: r.image as string | null },
  replyCount: r.replies as number,
  likeCount: r.likes as number,
});
export type AdminComment = ReturnType<typeof adminOf>;

const like = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`;

export const listComments = (key: string, f: { status?: unknown; slug?: unknown; search?: unknown; page?: unknown; limit?: number }) => {
  const where = ["p.site_key = @key"];
  const params: Record<string, unknown> = { key };
  if (STATUSES.includes(f.status as CommentStatus)) (where.push("c.status = @status"), (params.status = f.status));
  if (typeof f.slug === "string" && f.slug) (where.push("p.slug = @slug"), (params.slug = f.slug));
  if (typeof f.search === "string" && f.search.trim())
    (where.push("(c.body LIKE @q ESCAPE '\\' OR u.name LIKE @q ESCAPE '\\' OR u.email LIKE @q ESCAPE '\\')"), (params.q = like(f.search.trim())));
  const limit = f.limit ?? 20;
  const page = Math.max(1, Math.floor(Number(f.page) || 1));
  const sql = where.join(" AND ");
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM comment c JOIN comment_page p ON p.id = c.page_id JOIN commenter u ON u.id = c.commenter_id WHERE ${sql}`).get(params) as { n: number }).n;
  const comments = db.prepare(`${ADMIN_SELECT} WHERE ${sql} ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`).all(params).map(adminOf);
  return { comments, total, page, limit };
};

const checkIds = (key: string, ids: unknown) => {
  if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some((i) => typeof i !== "string")) throw bad("Pick 1 to 200 comments.");
  const found = db.prepare(`SELECT c.id FROM comment c JOIN comment_page p ON p.id = c.page_id WHERE p.site_key = ? AND c.id IN (${ids.map(() => "?").join(",")})`).all(key, ...ids) as { id: string }[];
  if (found.length !== new Set(ids).size) throw new HttpError("Comment not found", 404);
  return ids as string[];
};

const logAction = db.prepare("INSERT INTO comment_moderation (comment_id, action, admin_email, created_at) VALUES (?, ?, ?, ?)");
export const moderate = (key: string, ids: unknown, status: unknown, adminEmail: string) => {
  if (!STATUSES.includes(status as CommentStatus)) throw bad("Invalid status.");
  const list = checkIds(key, ids);
  db.transaction(() => {
    const now = Date.now();
    const update = db.prepare("UPDATE comment SET status = ?, updated_at = ? WHERE id = ?");
    for (const id of list) (update.run(status, now, id), logAction.run(id, status, adminEmail, now));
  })();
  return { updated: list.length };
};

export const adminEdit = (key: string, id: string, body: unknown) => {
  commentIn(key, id);
  const text = typeof body === "string" ? sanitizeBody(body) : "";
  if (!text) throw bad("Comment body is empty");
  db.prepare("UPDATE comment SET body = ?, edited_at = ?, updated_at = ? WHERE id = ?").run(text, Date.now(), Date.now(), id);
  return adminOf(db.prepare(`${ADMIN_SELECT} WHERE c.id = ?`).get(id));
};

export const moderationLog = (key: string, id: string) => {
  commentIn(key, id);
  return (db.prepare("SELECT action, admin_email, created_at FROM comment_moderation WHERE comment_id = ? ORDER BY id DESC").all(id) as any[]).map((r) => ({ action: r.action, adminEmail: r.admin_email, createdAt: iso(r.created_at) }));
};

export const listPages = (key: string) =>
  (
    db
      .prepare(
        `SELECT p.id, p.slug, p.url, COUNT(c.id) AS total, SUM(c.status = 'PENDING') AS pending FROM comment_page p LEFT JOIN comment c ON c.page_id = p.id WHERE p.site_key = ? GROUP BY p.id ORDER BY MAX(COALESCE(c.created_at, p.created_at)) DESC`,
      )
      .all(key) as any[]
  ).map((r) => ({ id: r.id as string, slug: r.slug as string, url: r.url as string | null, total: r.total as number, pending: (r.pending ?? 0) as number }));

const deleteComments = (where: string, ...args: unknown[]) => {
  const ids = `SELECT id FROM comment WHERE ${where}`;
  db.prepare(`DELETE FROM comment_like WHERE comment_id IN (${ids})`).run(...args);
  db.prepare(`DELETE FROM comment_moderation WHERE comment_id IN (${ids})`).run(...args);
  return db.prepare(`DELETE FROM comment WHERE ${where}`).run(...args).changes;
};

/** Deletes a page and every comment on it, for good. */
export const deletePage = (key: string, pageId: string) =>
  db.transaction(() => {
    const page = db.prepare("SELECT id FROM comment_page WHERE id = ? AND site_key = ?").get(pageId, key);
    if (!page) throw new HttpError("Page not found", 404);
    const deleted = deleteComments("page_id = ?", pageId);
    db.prepare("DELETE FROM comment_page WHERE id = ?").run(pageId);
    return { deleted };
  })();

const ON_SITE = "EXISTS (SELECT 1 FROM comment c JOIN comment_page p ON p.id = c.page_id WHERE p.site_key = @key AND c.commenter_id = u.id)";
export const listCommenters = (key: string, f: { search?: unknown; page?: unknown; filter?: unknown }) => {
  const params: Record<string, unknown> = { key };
  let where = ON_SITE;
  if (f.filter === "banned") where += " AND EXISTS (SELECT 1 FROM comment_ban b WHERE b.site_key = @key AND b.commenter_id = u.id)";
  if (f.filter === "muted") where += ' AND u."notificationsEnabled" = 0';
  if (typeof f.search === "string" && f.search.trim())
    (where += " AND (u.name LIKE @q ESCAPE '\\' OR u.email LIKE @q ESCAPE '\\' OR u.username LIKE @q ESCAPE '\\')"), (params.q = like(f.search.trim()));
  const limit = 20;
  const page = Math.max(1, Math.floor(Number(f.page) || 1));
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM commenter u WHERE ${where}`).get(params) as { n: number }).n;
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.image, u.username, u."notificationsEnabled" AS notifications,
        (SELECT COUNT(*) FROM comment c JOIN comment_page p ON p.id = c.page_id WHERE p.site_key = @key AND c.commenter_id = u.id) AS total,
        (SELECT COUNT(*) FROM comment c JOIN comment_page p ON p.id = c.page_id WHERE p.site_key = @key AND c.commenter_id = u.id AND c.status = 'DELETED') AS deleted,
        (SELECT COUNT(*) FROM comment c JOIN comment_page p ON p.id = c.page_id WHERE p.site_key = @key AND c.commenter_id = u.id AND c.status = 'SPAM') AS spam,
        EXISTS (SELECT 1 FROM comment_ban b WHERE b.site_key = @key AND b.commenter_id = u.id) AS banned
       FROM commenter u WHERE ${where} ORDER BY u.name COLLATE NOCASE LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    )
    .all(params) as any[];
  const commenters = rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    email: r.email as string,
    image: r.image as string | null,
    username: r.username as string,
    totalCount: r.total as number,
    deletedCount: r.deleted as number,
    spamCount: r.spam as number,
    isBanned: !!r.banned,
    notificationsEnabled: r.notifications !== 0,
  }));
  return { commenters, total, page, limit };
};

const commenterOnSite = (key: string, commenterId: string) => {
  if (!db.prepare(`SELECT 1 FROM commenter u WHERE u.id = @id AND ${ON_SITE}`).get({ id: commenterId, key })) throw new HttpError("Commenter not found", 404);
};

export const commenterComments = (key: string, commenterId: string) => {
  commenterOnSite(key, commenterId);
  return db.prepare(`${ADMIN_SELECT} WHERE p.site_key = ? AND c.commenter_id = ? ORDER BY c.created_at DESC`).all(key, commenterId).map(adminOf);
};

export const ban = (key: string, commenterId: string, value: boolean) => {
  commenterOnSite(key, commenterId);
  if (value) {
    if (bannedOn(key, commenterId)) throw new HttpError("User is already banned on this site", 409);
    db.prepare("INSERT INTO comment_ban (site_key, commenter_id, created_at) VALUES (?, ?, ?)").run(key, commenterId, Date.now());
  } else db.prepare("DELETE FROM comment_ban WHERE site_key = ? AND commenter_id = ?").run(key, commenterId);
  return { banned: value };
};

/** Marks every comment of a commenter on this site as removed (logged, like single moderation). */
export const deleteAllBy = (key: string, commenterId: string, adminEmail: string) => {
  commenterOnSite(key, commenterId);
  const ids = (db.prepare("SELECT c.id FROM comment c JOIN comment_page p ON p.id = c.page_id WHERE p.site_key = ? AND c.commenter_id = ? AND c.status != 'DELETED'").all(key, commenterId) as { id: string }[]).map((r) => r.id);
  if (ids.length) moderate(key, ids, "DELETED", adminEmail);
  return { deletedCount: ids.length };
};

export const adminSetNotifications = (key: string, commenterId: string, enabled: boolean) => (commenterOnSite(key, commenterId), setNotifications(commenterId, enabled), { notificationsEnabled: enabled });

const DAY = 86_400_000;
const pendingQ = db.prepare("SELECT COUNT(*) AS n FROM comment c JOIN comment_page p ON p.id = c.page_id WHERE p.site_key = ? AND c.status = 'PENDING'");
/** Comments waiting for moderation (the sidebar badge). */
export const pendingCount = (key: string) => (pendingQ.get(key) as { n: number }).n;

export const stats = (key: string, now = Date.now()) => {
  const counts = db.prepare("SELECT c.status, COUNT(*) AS n FROM comment c JOIN comment_page p ON p.id = c.page_id WHERE p.site_key = ? GROUP BY c.status").all(key) as { status: CommentStatus; n: number }[];
  const by = Object.fromEntries(STATUSES.map((s) => [s, counts.find((c) => c.status === s)?.n ?? 0])) as Record<CommentStatus, number>;
  const since = now - 30 * DAY;
  const daily = new Map(
    (db.prepare("SELECT date(c.created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n FROM comment c JOIN comment_page p ON p.id = c.page_id WHERE p.site_key = ? AND c.created_at >= ? GROUP BY day").all(key, since) as { day: string; n: number }[]).map((r) => [r.day, r.n]),
  );
  const activity = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(now - (29 - i) * DAY).toISOString().slice(0, 10);
    return { date: day, count: daily.get(day) ?? 0 };
  });
  const commenters = (db.prepare(`SELECT COUNT(*) AS n FROM commenter u WHERE ${ON_SITE}`).get({ key }) as { n: number }).n;
  const pages = (db.prepare("SELECT COUNT(*) AS n FROM comment_page WHERE site_key = ?").get(key) as { n: number }).n;
  const recent = db.prepare(`${ADMIN_SELECT} WHERE p.site_key = ? ORDER BY c.created_at DESC LIMIT 5`).all(key).map(adminOf);
  return { total: counts.reduce((a, c) => a + c.n, 0), pending: by.PENDING, approved: by.APPROVED, spam: by.SPAM, deleted: by.DELETED, commenters, pages, activity, recent };
};

/** Everything this site has, as JSON: yours to keep or move. The SMTP password stays out. */
export const exportData = (key: string) => {
  const site = siteByKey(key)!;
  const pages = db.prepare("SELECT id, slug, url, created_at FROM comment_page WHERE site_key = ?").all(key) as any[];
  const comments = db.prepare("SELECT c.* FROM comment c JOIN comment_page p ON p.id = c.page_id WHERE p.site_key = ? ORDER BY c.created_at").all(key) as any[];
  const commenters = db.prepare(`SELECT u.id, u.name, u.email, u.username, u.image, u."notificationsEnabled" AS notifications FROM commenter u WHERE ${ON_SITE}`).all({ key }) as any[];
  const ids = `SELECT c.id FROM comment c JOIN comment_page p ON p.id = c.page_id WHERE p.site_key = ?`;
  return {
    exportedAt: new Date().toISOString(),
    site: { ...publicSettings(site), hasSmtpPass: undefined, signIn: undefined },
    pages: pages.map((p) => ({ id: p.id, slug: p.slug, url: p.url, createdAt: iso(p.created_at) })),
    commenters: commenters.map((u) => ({ id: u.id, name: u.name, email: u.email, username: u.username, image: u.image, notificationsEnabled: u.notifications !== 0, banned: bannedOn(key, u.id) })),
    comments: comments.map((c) => ({ id: c.id, pageId: c.page_id, parentId: c.parent_id, commenterId: c.commenter_id, body: c.body, status: c.status, createdAt: iso(c.created_at), updatedAt: iso(c.updated_at), editedAt: iso(c.edited_at) })),
    likes: (db.prepare(`SELECT comment_id, commenter_id, created_at FROM comment_like WHERE comment_id IN (${ids})`).all(key) as any[]).map((l) => ({ commentId: l.comment_id, commenterId: l.commenter_id, createdAt: iso(l.created_at) })),
    moderation: (db.prepare(`SELECT comment_id, action, admin_email, created_at FROM comment_moderation WHERE comment_id IN (${ids})`).all(key) as any[]).map((m) => ({ commentId: m.comment_id, action: m.action, adminEmail: m.admin_email, createdAt: iso(m.created_at) })),
  };
};

/**
 * Deletes every comment, page, like, ban and log of the site, and its settings. Commenter accounts stay
 * (they may comment on other sites); one with no comments left anywhere is deleted with its sessions.
 */
export const deleteAllData = (key: string) =>
  db.transaction(() => {
    const people = (db.prepare("SELECT DISTINCT c.commenter_id AS id FROM comment c JOIN comment_page p ON p.id = c.page_id WHERE p.site_key = ?").all(key) as { id: string }[]).map((r) => r.id);
    const deleted = deleteComments("page_id IN (SELECT id FROM comment_page WHERE site_key = ?)", key);
    db.prepare("DELETE FROM comment_page WHERE site_key = ?").run(key);
    db.prepare("DELETE FROM comment_ban WHERE site_key = ?").run(key);
    db.prepare("DELETE FROM comment_site WHERE key = ?").run(key);
    for (const id of people)
      if (!db.prepare("SELECT 1 FROM comment WHERE commenter_id = ?").get(id)) {
        db.prepare("DELETE FROM comment_like WHERE commenter_id = ?").run(id);
        db.prepare("DELETE FROM commenter_session WHERE userId = ?").run(id);
        db.prepare("DELETE FROM commenter_account WHERE userId = ?").run(id);
        db.prepare("DELETE FROM commenter WHERE id = ?").run(id);
      }
    return { deleted };
  })();

// ─── Install ────────────────────────────────────────────────────────────────

export const COMPONENT_PATH = "src/components/WuppyComments.astro";

/** The Astro component the Install tab commits: one <WuppyComments /> per page that takes comments. */
export const componentSource = (key: string) => `---
/**
 * Comments by ${BRAND.name} (self-hosted at ${appUrl()}). Put <WuppyComments /> where the comments go.
 * Each page gets its own thread, keyed by its path; pass \`slug\` to share or rename one.
 */
interface Props {
  slug?: string;
  /** Tailwind classes for the wrapper, e.g. <WuppyComments class="max-w-5xl" />. */
  class?: string;
}
const { slug = Astro.url.pathname.replace(/\\/+$/, "") || "/", class: className } = Astro.props;
---

<section class:list={["wuppy-comments", className]}>
  <div data-wuppy-comments data-site-key="${key}" data-slug={slug}></div>
</section>
<script is:inline async src="${appUrl()}/comments/embed.js"></script>

<style>
  /* A readable column. It sits in the base layer, so your Tailwind classes win: <WuppyComments class="max-w-5xl" />. */
  @layer base {
    .wuppy-comments {
      box-sizing: border-box;
      width: 100%;
      max-width: 48rem;
      margin-inline: auto;
      padding: 3rem 1rem;
      --wuppy-comments-width: none;
    }
  }
</style>
`;
