/**
 * Sign-in for commenters (visitors of the sites), separate from CMS users: its own tables (commenter, commenter_session …),
 * its own cookie and base path, so a commenter never gets into the CMS and a CMS session is never touched.
 * The embed runs on the site's own domain and sends the session token as `Authorization: Bearer` (bearer plugin).
 */
import { randomUUID } from "node:crypto";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { bearer } from "better-auth/plugins/bearer";
import { db } from "../../../lib/db";
import { uniqueUsername } from "./rules";

const env = (name: string) => process.env[name] ?? import.meta.env?.[name];

export type Provider = "google" | "github";
export type OAuthApp = { clientId: string; clientSecret: string };
export type OAuthApps = Partial<Record<Provider, OAuthApp>>;
const app = (clientId?: string, clientSecret?: string) => (clientId && clientSecret ? { clientId, clientSecret } : undefined);

// The server's own apps (.env). A GitHub OAuth app allows one callback URL, so commenters need their own app.
const SERVER: OAuthApps = {
  google: app(env("COMMENTS_GOOGLE_CLIENT_ID") || env("GOOGLE_CLIENT_ID"), env("COMMENTS_GOOGLE_CLIENT_SECRET") || env("GOOGLE_CLIENT_SECRET")),
  github: app(env("COMMENTS_GITHUB_CLIENT_ID"), env("COMMENTS_GITHUB_CLIENT_SECRET")),
};
const BASE_URL = (env("BETTER_AUTH_URL") || "http://localhost:4321").replace(/\/+$/, "");
const BASE_PATH = "/api/comments/auth";
/** Where a site's own OAuth apps call back; the server's apps use BASE_PATH. */
export const sitePath = (key: string) => `${BASE_PATH}/s/${key}`;
export const callbackUrl = (provider: Provider, key?: string) => `${BASE_URL}${key ? sitePath(key) : BASE_PATH}/callback/${provider}`;

const optionsFor = (basePath: string, apps: OAuthApps) =>
  ({
    baseURL: BASE_URL,
    basePath,
    secret: env("BETTER_AUTH_SECRET"),
    database: db,
    user: {
      modelName: "commenter",
      additionalFields: {
        username: { type: "string", required: false, input: false },
        notificationsEnabled: { type: "boolean", required: false, defaultValue: true, input: false },
        notificationToken: { type: "string", required: false, input: false },
      },
    },
    session: { modelName: "commenter_session", expiresIn: 60 * 60 * 24 * 7 },
    account: { modelName: "commenter_account" },
    verification: { modelName: "commenter_verification" },
    advanced: { cookiePrefix: "gitupcms-commenter" },
    socialProviders: {
      ...(apps.google ? { google: { ...apps.google } } : {}),
      ...(apps.github ? { github: { ...apps.github } } : {}),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const taken = db.prepare("SELECT 1 FROM commenter WHERE username = ?");
            return { data: { ...user, username: uniqueUsername(user.name || user.email.split("@")[0], (u) => !!taken.get(u)), notificationsEnabled: true, notificationToken: randomUUID() } };
          },
        },
      },
    },
    plugins: [bearer()],
  }) satisfies BetterAuthOptions;

await (await getMigrations(optionsFor(BASE_PATH, SERVER))).runMigrations();

/** The server-wide instance: the .env apps, sessions, bearer tokens and sign-out for every site (all instances share the tables and cookie). */
export const commentAuth = betterAuth(optionsFor(BASE_PATH, SERVER));

type AuthSite = { key: string; oauth: OAuthApps };
const instances = new Map<string, { sig: string; auth: typeof commentAuth }>();
/** A site with its own OAuth apps gets an instance on its own base path; rebuilt when the apps change. */
export const siteAuth = (site: AuthSite) => {
  const sig = JSON.stringify(site.oauth);
  let hit = instances.get(site.key);
  if (!hit || hit.sig !== sig) instances.set(site.key, (hit = { sig, auth: betterAuth(optionsFor(sitePath(site.key), site.oauth)) as unknown as typeof commentAuth }));
  return hit.auth;
};
/** The instance that signs in with `provider` on this site: its own app first, else the server's. */
export const authFor = (site: AuthSite, provider: Provider) => (site.oauth[provider] ? siteAuth(site) : commentAuth);
/** Sign-in buttons a site shows. */
export const providersOf = (site: AuthSite) => (["google", "github"] as const).filter((p) => site.oauth[p] || SERVER[p]);
export const serverHas = (p: Provider) => !!SERVER[p];

export type Commenter = { id: string; name: string; email: string; image: string | null; username: string; notificationsEnabled: boolean };

/** The signed-in commenter from `Authorization: Bearer <token>` (or the popup's cookie), else null. */
export const commenterOf = async (headers: Headers): Promise<Commenter | null> => {
  const session = await commentAuth.api.getSession({ headers }).catch(() => null);
  if (!session) return null;
  const u = session.user as any;
  return { id: u.id, name: u.name, email: u.email, image: u.image ?? null, username: u.username, notificationsEnabled: u.notificationsEnabled !== false };
};
